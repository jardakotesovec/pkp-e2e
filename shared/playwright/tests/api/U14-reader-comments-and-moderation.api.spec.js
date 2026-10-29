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

/** A unique tag for this test's scratch journal(s). */
function makeTag(check, testInfo) {
    return `u14${check}w${testInfo.workerIndex}${Date.now().toString(36)}`;
}

/**
 * A scratch journal with public comments on and one user per key of
 * `roles` (`{mg: 'manager', rd: 'reader'}`), each `${tag}${key}`.
 * `as(key)` is that user's client at the journal's address (`as(null)`
 * nobody signed in), `user(key)` the username, `id(key)` the user's id.
 */
async function journal(apiAs, pkpApi, tag, roles) {
    const seeded = await pkpApi.createContext({
        tag,
        enablePublicComments: true,
        users: Object.entries(roles).map(([key, role]) => ({username: `${tag}${key}`, roles: [role]})),
    });
    const user = (key) => `${tag}${key}`;
    return {
        tag,
        user,
        id: (key) => seeded.users.find((u) => u.username === user(key)).id,
        as: (key) => apiAs(key ? user(key) : null, {context: tag}),
    };
}

/** A published article by the journal's author `au`, with its seeded comments. */
function article(pkpApi, j, suffix, userComments = []) {
    return pkpApi.createSubmission({tag: `${j.tag}${suffix}`, context: j.tag, submitter: j.user('au'), published: true, userComments});
}

/** The comments of a moderator's list, by text, sorted. */
const texts = (res) => res.body.data.map((c) => c.commentText).sort();

test.describe('reader comments through the API', () => {
    test('API1: a comment or a report the landing page would not send is refused', async ({apiAs, pkpApi}, testInfo) => {
        const j = await journal(apiAs, pkpApi, makeTag('a1', testInfo), {mg: 'manager', au: 'author', rd: 'reader', rb: 'reader'});
        const art = await article(pkpApi, j, 'a', [{user: j.user('rb'), text: 'Other reader', approved: true}]);
        const otherComment = art.userComments[0].id;
        const unpublished = await pkpApi.createSubmission({tag: `${j.tag}u`, context: j.tag, submitter: j.user('au')});

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

    test('API2: another journal\'s article and comments are out of reach from this journal\'s address', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a2', testInfo);
        const own = await journal(apiAs, pkpApi, tag, {mg: 'manager', rd: 'reader'});
        const other = await journal(apiAs, pkpApi, `${tag}b`, {mg: 'manager', au: 'author', rd: 'reader', rb: 'reader'});
        const theirs = await article(pkpApi, other, 'a', [
            {user: other.user('rd'), text: 'Pending there'},
            {user: other.user('rd'), text: 'Approved there', approved: true, reports: [{user: other.user('rb'), note: 'Off topic'}]},
        ]);
        const [pending, approved] = theirs.userComments;
        const reportId = approved.reports[0];

        // Their article.
        const reader = await own.as('rd');
        const onTheirs = await reader.post('comments', {publicationId: theirs.publicationId, commentText: 'From elsewhere'});
        expect(onTheirs.status).toBe(422);
        expect(onTheirs.body).toHaveProperty('publicationId');
        const listed = await reader.get('comments/public', {publicationIds: theirs.publicationId});
        expect(listed.status).toBe(200);
        expect(listed.body.data).toEqual([]);

        // Their comments.
        const manager = await own.as('mg');
        for (const [method, path, data] of [
            ['GET', `comments/${pending.id}`],
            ['GET', `comments/${approved.id}`],
            ['PUT', `comments/${pending.id}/setApproval`, {approved: true}],
            ['DELETE', `comments/${approved.id}`],
            ['GET', `comments/${approved.id}/reports`],
            ['GET', `comments/${approved.id}/reports/${reportId}`],
            ['DELETE', `comments/${approved.id}/reports/${reportId}`],
            ['DELETE', `comments/${approved.id}/reports`],
        ]) {
            expect((await manager.call(method, path, {data})).status, `${method} ${path}`).toBe(404);
        }
        expect((await reader.post(`comments/${approved.id}/reports`, {note: 'From elsewhere'})).status).toBe(404);
        expect((await manager.get('comments')).body.data).toEqual([]);

        // Untouched.
        const theirManager = await other.as('mg');
        const left = await theirManager.get('comments');
        expect(texts(left)).toEqual(['Approved there', 'Pending there']);
        expect(left.body.data.find((c) => c.id === pending.id).isApproved).toBe(false);
        expect(left.body.data.find((c) => c.id === approved.id).isApproved).toBe(true);
        expect((await theirManager.get(`comments/${approved.id}/reports`)).body.total).toBe(1);
    });

    test('API3: the public list gives a comment\'s reports to a moderator alone', async ({apiAs, pkpApi}, testInfo) => {
        const j = await journal(apiAs, pkpApi, makeTag('a3', testInfo), {mg: 'manager', au: 'author', rd: 'reader', rb: 'reader'});
        const art = await article(pkpApi, j, 'a', [
            {user: j.user('rd'), text: 'Worth reading', approved: true, reports: [{user: j.user('rb'), note: 'Spam link'}]},
        ]);
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

    test('API4: the Comments page\'s list filtered by writer and by article', async ({apiAs, pkpApi}, testInfo) => {
        const j = await journal(apiAs, pkpApi, makeTag('a4', testInfo), {mg: 'manager', au: 'author', rd: 'reader', rb: 'reader'});
        await article(pkpApi, j, 'a', [{user: j.user('rd'), text: 'First reader on A'}]);
        const b = await article(pkpApi, j, 'b', [
            {user: j.user('rb'), text: 'Second reader on B'},
            {user: j.user('rd'), text: 'First reader on B'},
        ]);
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

    test('API5: moderation requests the Comments page never sends', async ({apiAs, pkpApi}, testInfo) => {
        const j = await journal(apiAs, pkpApi, makeTag('a5', testInfo), {mg: 'manager', au: 'author', rd: 'reader', rb: 'reader', rc: 'reader'});
        const art = await article(pkpApi, j, 'a', [{
            user: j.user('rd'),
            text: 'Reported twice',
            approved: true,
            reports: [{user: j.user('rb'), note: 'One'}, {user: j.user('rc'), note: 'Two'}],
        }]);
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
