/**
 * Reader comments through the API (docs/specs/U14-reader-comments-and-
 * moderation.md "Through the API"). Who may call the comments routes is
 * the spec's five comments grids, checked by the matrix
 * (docs/process/api.md), never here. Every scratch journal has public
 * comments on (the context passthrough `enablePublicComments`), and its
 * comments and reports are seeded with the submission key
 * `userComments[]`, which files them the way the landing page does
 * (scenarios.md). The routes are the same on a press and a preprint
 * server, so every check runs on the three apps (the spec's A24).
 */
const {test, expect} = require('../../support/base-test.js');

/** The comments of a moderator's list, by text, sorted. */
const texts = (res) => res.body.data.map((c) => c.commentText).sort();

test.describe('reader comments through the API', () => {
    test('API1: A comment or a report the landing page would not send is refused', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author', rd: 'reader', rb: 'reader'}, enablePublicComments: true});
        const art = await j.submission('a', {submitter: 'au', published: true, userComments: [{user: j.user('rb'), text: 'Other reader', approved: true}]});
        const otherComment = art.userComments[0].id;
        const unpublished = await j.submission('u', {submitter: 'au'});

        // A second version, published: the first becomes an older version.
        const manager = await j.as('mg');
        const versioned = await manager.post(`submissions/${art.submissionId}/publications/${art.publicationId}/version`, {});
        expect(versioned.status, JSON.stringify(versioned.body)).toBe(200);
        const newest = versioned.body.id;
        expect(newest).not.toBe(art.publicationId);
        expect((await manager.put(`submissions/${art.submissionId}/publications/${newest}/publish`, {})).status).toBe(200);

        const reader = await j.as('rd');
        for (const commentText of ['', '   ']) {
            const res = await reader.post('comments', {publicationId: newest, commentText});
            expect(res.status, JSON.stringify(commentText)).toBe(422);
            expect(res.body).toHaveProperty('commentText');
        }
        for (const publicationId of [art.publicationId, unpublished.publicationId, 999999999]) {
            const res = await reader.post('comments', {publicationId, commentText: 'Where does this go?'});
            expect(res.status, String(publicationId)).toBe(422);
            expect(res.body).toHaveProperty('publicationId');
        }
        const noReason = await reader.post(`comments/${otherComment}/reports`, {note: ''});
        expect(noReason.status).toBe(422);
        expect(noReason.body).toHaveProperty('note');

        // Nothing kept: the other reader's comment alone, with no report.
        const kept = await manager.get('comments');
        expect(texts(kept)).toEqual(['Other reader']);
        expect(kept.body.data[0].isReported).toBe(false);

        // Control: the newest version takes the comment, pending.
        const control = await reader.post('comments', {publicationId: newest, commentText: 'On the newest version'});
        expect(control.status).toBe(200);
        expect(control.body).toMatchObject({publicationId: newest, isApproved: false});
    });

    test('API2: Another journal\'s article is out of reach from this journal\'s address', async ({scratch}) => {
        const own = await scratch({users: {mg: 'manager', rd: 'reader'}, enablePublicComments: true});
        const other = await scratch({users: {mg: 'manager', au: 'author', rd: 'reader'}, enablePublicComments: true});
        const theirs = await other.submission('a', {submitter: 'au', published: true, userComments: [
            {user: other.user('rd'), text: 'Approved there', approved: true},
        ]});

        const reader = await own.as('rd');
        const onTheirs = await reader.post('comments', {publicationId: theirs.publicationId, commentText: 'From elsewhere'});
        expect(onTheirs.status).toBe(422);
        expect(onTheirs.body).toHaveProperty('publicationId');
        const listed = await reader.get('comments/public', {publicationIds: theirs.publicationId});
        expect(listed.status).toBe(200);
        expect(listed.body.data).toEqual([]);

        // Nothing kept on either journal.
        expect((await (await own.as('mg')).get('comments')).body.data).toEqual([]);
        expect(texts(await (await other.as('mg')).get('comments'))).toEqual(['Approved there']);
    });

    test('API3: The public list gives a comment\'s reports to a moderator alone', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author', rd: 'reader', rb: 'reader'}, enablePublicComments: true});
        const art = await j.submission('a', {submitter: 'au', published: true, userComments: [
            {user: j.user('rd'), text: 'Worth reading', approved: true, reports: [{user: j.user('rb'), note: 'Spam link'}]},
        ]});
        const asked = {publicationIds: art.publicationId, includeReports: 1};

        for (const key of [null, 'rd', 'rb']) {
            const res = await (await j.as(key)).get('comments/public', asked);
            expect(res.status, String(key)).toBe(200);
            expect(texts(res)).toEqual(['Worth reading']);
            expect(res.body.data[0], String(key)).not.toHaveProperty('reports');
        }
        const moderator = await (await j.as('mg')).get('comments/public', asked);
        expect(moderator.body.data[0].reports).toHaveLength(1);
        expect(moderator.body.data[0].reports[0]).toMatchObject({note: 'Spam link', userName: j.user('rb')});
    });

    test('API4: The Comments page\'s list filtered by writer and by article', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author', rd: 'reader', rb: 'reader'}, enablePublicComments: true});
        await j.submission('a', {submitter: 'au', published: true, userComments: [{user: j.user('rd'), text: 'First reader on A'}]});
        const b = await j.submission('b', {submitter: 'au', published: true, userComments: [
            {user: j.user('rb'), text: 'Second reader on B'},
            {user: j.user('rd'), text: 'First reader on B'},
        ]});
        const manager = await j.as('mg');

        const byWriter = await manager.get('comments', {userIds: j.id('rd')});
        expect(byWriter.status).toBe(200);
        expect(texts(byWriter)).toEqual(['First reader on A', 'First reader on B']);

        const byArticle = await manager.get('comments', {publicationIds: b.publicationId});
        expect(byArticle.status).toBe(200);
        expect(texts(byArticle)).toEqual(['First reader on B', 'Second reader on B']);

        expect((await manager.get('comments', {userIds: 'abc'})).status).toBe(400);
        expect((await manager.get('comments', {publicationIds: 'abc'})).status).toBe(400);
    });

    test('API5: Moderation requests the Comments page never sends', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author', rd: 'reader', rb: 'reader', rc: 'reader'}, enablePublicComments: true});
        const art = await j.submission('a', {submitter: 'au', published: true, userComments: [{
            user: j.user('rd'),
            text: 'Reported twice',
            approved: true,
            reports: [{user: j.user('rb'), note: 'One'}, {user: j.user('rc'), note: 'Two'}],
        }]});
        const id = art.userComments[0].id;
        const manager = await j.as('mg');
        expect((await manager.get(`comments/${id}/reports`)).body.total).toBe(2);

        // Every report at once.
        expect((await manager.delete(`comments/${id}/reports`)).status).toBe(200);
        expect((await manager.get(`comments/${id}/reports`)).body.total).toBe(0);
        expect((await manager.get(`comments/${id}`)).body).toMatchObject({isReported: false, isApproved: true});
        expect((await manager.get('comments', {isReported: true})).body.data).toEqual([]);

        // An approval that is not yes or no.
        for (const body of [{approved: 'perhaps'}, {}]) {
            expect((await manager.put(`comments/${id}/setApproval`, body)).status, JSON.stringify(body)).toBe(400);
        }
        expect((await manager.get(`comments/${id}`)).body.isApproved).toBe(true);
    });
});
