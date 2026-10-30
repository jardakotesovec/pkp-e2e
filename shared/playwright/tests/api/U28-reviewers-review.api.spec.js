/**
 * The reviewer's review through the API
 * (docs/specs/U28-reviewers-review.md "Through the API"). Who may call
 * these routes is the spec's grids', checked by the matrix
 * (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

test.describe("reviewer's review through the API", () => {
    test.beforeEach(async ({appContext}) => {
        test.skip(!appContext.capabilities.hasReviewStage, 'a preprint server has no review');
    });

    test("API1: A round's review read by its reviewer holds their own review alone", async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author', r1: 'externalReviewer', r2: 'externalReviewer'}});
        const s = await j.submission('s', {
            submitter: 'au',
            decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: [
                {username: j.user('r1'), status: 'completed', comments: 'First reviewer here.'},
                {username: j.user('r2'), status: 'completed', comments: 'Second reviewer here.'},
            ]}],
        });
        const history = `reviews/history/${s.submissionId}/${s.reviewRounds[0].id}`;

        for (const [key, own, other] of [['r1', 'First', 'Second'], ['r2', 'Second', 'First']]) {
            const read = await (await j.as(key)).get(history);
            expect(read.status, key).toBe(200);
            expect(read.body.reviewAssignment.reviewerId, key).toBe(j.id(key));
            const text = JSON.stringify([read.body.comments, read.body.privateComments]);
            expect(text, key).toContain(`${own} reviewer here.`);
            expect(text, key).not.toContain(`${other} reviewer here.`);
        }
    });
});
