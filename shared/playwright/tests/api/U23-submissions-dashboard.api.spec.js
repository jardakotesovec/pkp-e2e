/**
 * The submission lists through the API
 * (docs/specs/U23-submissions-dashboard.md "Through the API").
 * Who may call the list routes is the grids' (journal-list,
 * assigned-lists, back-office-lists, delete-incomplete), checked by the
 * matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');
const {ROLE} = require('../../support/pkp-ids.js');

const ids = (res) => (res.body.items || []).map((s) => s.id).sort((a, b) => a - b);

test.describe('the submission lists through the API', () => {
    test('API1: A bulk delete removes drafts only', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const draft = (await j.submission('d', {submitter: 'au', submitted: false})).submissionId;
        const sent = (await j.submission('s', {submitter: 'au'})).submissionId;
        const manager = await j.as('mg');
        const exists = async (id) => (await manager.get(`submissions/${id}`)).status === 200;
        // As the list's "Delete Incomplete Submissions" sends it: `ids[]` in the query.
        const bulk = (api, list) => api.call('DELETE', '_submissions', {params: new URLSearchParams(list.map((id) => ['ids[]', String(id)]))});

        // A submitted submission, alone or beside a draft: nothing is deleted.
        expect((await bulk(manager, [sent])).status).toBe(404);
        expect((await bulk(manager, [draft, sent])).status).toBe(404);
        expect((await bulk(manager, ['x'])).status).toBe(400);
        expect(await exists(sent)).toBe(true);
        expect(await exists(draft)).toBe(true);

        // Control: the manager's pick of the draft is deleted.
        expect((await bulk(manager, [draft])).status).toBe(200);
        expect(await exists(draft)).toBe(false);
        expect(await exists(sent)).toBe(true);
    });

    test("API2: A list of submissions holds only the caller's own unless they work journal-wide", async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', se: 'sectionEditor', so: 'sectionEditor', au: 'author', ao: 'author'}});
        const mine = (await j.submission('a', {submitter: 'au', participants: [{username: j.user('se'), role: 'sectionEditor'}]})).submissionId;
        const theirs = (await j.submission('b', {submitter: 'ao'})).submissionId;
        const both = [mine, theirs].sort((a, b) => a - b);

        const list = async (key, params) => {
            const res = await (await j.as(key)).get('submissions', params);
            expect(res.status, key).toBe(200);
            return ids(res);
        };
        expect(await list('mg')).toEqual(both);
        expect(await list('se')).toEqual([mine]);
        expect(await list('so')).toEqual([]);
        expect(await list('au')).toEqual([mine]);
        expect(await list('ao')).toEqual([theirs]);

        // Asking for someone else's assignments is refused, unless journal-wide.
        const editor = await j.as('se');
        expect((await editor.get('submissions', {assignedTo: j.id('ao')})).status).toBe(403);
        expect(await list('se', {assignedTo: j.id('se')})).toEqual([mine]);
        expect(await list('mg', {assignedTo: j.id('se')})).toEqual([mine]);
    });

    test("API3: A reviewer's list of submissions withholds the authors' identity", async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasReviewStage, 'a preprint server has no review');
        const j = await scratch({users: {mg: 'manager', au: 'author', rv: 'externalReviewer'}});
        const {submissionId} = await j.submission('s', {
            submitter: 'au',
            decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: [{username: j.user('rv'), status: 'accepted'}]}],
        });
        // The seeded contributor is named after the author's username.
        const name = j.user('au');

        // Control: the manager's list carries the name.
        expect(JSON.stringify((await (await j.as('mg')).get('submissions')).body)).toContain(name);

        const res = await (await j.as('rv')).get('submissions');
        expect(res.status).toBe(200);
        expect(ids(res)).toEqual([submissionId]);
        expect(JSON.stringify(res.body)).not.toContain(name);
    });

    test("API4: An author's own list withholds the anonymous reviewers' identity", async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasReviewStage, 'a preprint server has no review');
        const j = await scratch({users: {mg: 'manager', au: 'author', rv: 'externalReviewer'}});
        const {submissionId} = await j.submission('s', {
            submitter: 'au',
            decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: [{username: j.user('rv'), status: 'accepted'}]}],
        });
        const reviewer = j.user('rv');

        // Control: the manager's list of the journal names the reviewer.
        expect(JSON.stringify((await (await j.as('mg')).get('_submissions')).body)).toContain(reviewer);

        // My Submissions' own list, as it asks: the author's assignments.
        const res = await (await j.as('au')).get('_submissions/assigned', new URLSearchParams([['assignedWithRoles[]', String(ROLE.AUTHOR)]]));
        expect(res.status).toBe(200);
        expect(ids(res)).toEqual([submissionId]);
        expect(res.body.items[0].reviewAssignments).toHaveLength(1);
        expect(JSON.stringify(res.body)).not.toContain(reviewer);
    });
});
