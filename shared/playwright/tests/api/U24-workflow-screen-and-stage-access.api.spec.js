/**
 * The workflow screen through the API
 * (docs/specs/U24-workflow-screen-and-stage-access.md "Through the API").
 * Who may read a submission is the submission-read grid's, checked by the
 * matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

test.describe('the workflow screen through the API', () => {
    test("API1: The assigned reviewer reads a submission without its authors' identity", async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasReviewStage, 'a preprint server has no review');
        const j = await scratch({users: {mg: 'manager', au: 'author', rv: 'externalReviewer'}});
        const {submissionId} = await j.submission('s', {
            submitter: 'au',
            decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: [{username: j.user('rv'), status: 'accepted'}]}],
        });
        // The seeded contributor is named after the author's username.
        const name = j.user('au');
        const reads = [`submissions/${submissionId}`, `submissions/${submissionId}/publications`];

        // Control: the manager's same reads carry the name.
        const manager = await j.as('mg');
        for (const read of reads) {
            expect(JSON.stringify((await manager.get(read)).body), read).toContain(name);
        }

        const reviewer = await j.as('rv');
        for (const read of reads) {
            const res = await reviewer.get(read);
            expect(res.status, read).toBe(200);
            expect(JSON.stringify(res.body), read).not.toContain(name);
        }
    });
});
