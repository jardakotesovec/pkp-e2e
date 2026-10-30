/**
 * Reviewer assignment & management through the API
 * (docs/specs/U27-reviewer-assignment-and-management.md "Through the API").
 * Who may call these routes is the spec's grids', checked by the matrix
 * (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');
const {FILE_STAGE, REVIEW_ASSIGNMENT} = require('../../support/pkp-ids.js');

/**
 * A scratch journal whose submission's one review is completed: the
 * manager's client, the reviewer's, and the review's routes.
 */
async function reviewed(scratch, {files = false} = {}) {
    const j = await scratch({users: {mg: 'manager', au: 'author', rv: 'externalReviewer'}});
    const s = await j.submission('s', {
        submitter: 'au',
        decisions: ['sendExternalReview'],
        ...(files ? {files: [{file: 'article.pdf'}]} : {}),
        reviewRounds: [{...(files ? {files: [{file: 'article.pdf'}]} : {}), reviewers: [{username: j.user('rv'), status: 'completed'}]}],
    });
    const reviewId = s.reviewAssignments[0].id;
    return {
        j,
        api: await j.as('mg'),
        reviewer: await j.as('rv'),
        assignment: `submissions/${s.submissionId}/reviewAssignments/${reviewId}`,
        files: `submissions/${s.submissionId}/files/review/${reviewId}`,
    };
}

test.describe('reviewer assignment & management through the API', () => {
    test.beforeEach(async ({appContext}) => {
        test.skip(!appContext.capabilities.hasReviewStage, 'a preprint server has no review');
    });

    test('API1: A rating outside the five stars, or with anything else, is refused', async ({scratch}) => {
        const {api, assignment} = await reviewed(scratch);

        for (const quality of [6, -1, 'good']) {
            const refused = await api.put(assignment, {quality});
            expect(refused.status, JSON.stringify(quality)).toBe(422);
            expect(refused.body, JSON.stringify(quality)).toHaveProperty('quality');
        }
        const mixed = await api.put(assignment, {quality: 3, considered: REVIEW_ASSIGNMENT.CONSIDERED});
        expect(mixed.status).toBe(422);
        let read = (await api.get(assignment)).body;
        expect([read.quality, read.dateRated, read.considered]).toEqual([null, null, 0]);

        // Control: a star alone is stored, and 0 takes it back.
        expect((await api.put(assignment, {quality: 4})).status).toBe(200);
        read = (await api.get(assignment)).body;
        expect(read.quality).toBe(4);
        expect(read.dateRated).toBeTruthy();
        expect((await api.put(assignment, {quality: 0})).status).toBe(200);
        read = (await api.get(assignment)).body;
        expect([read.quality, read.dateRated]).toEqual([null, null]);
    });

    test('API2: A review marked complete is not marked again', async ({scratch}) => {
        const {api, assignment} = await reviewed(scratch);

        // "Reconsidered": a state the route keeps but the window never sends.
        const reconsidered = await api.put(`${assignment}/consider`, {considered: REVIEW_ASSIGNMENT.RECONSIDERED});
        expect(reconsidered.status).toBe(422);
        expect((await api.get(assignment)).body.considered).toBe(0);

        const marked = await api.put(`${assignment}/consider`, {considered: REVIEW_ASSIGNMENT.CONSIDERED});
        expect(marked.status).toBe(200);
        const first = (await api.get(assignment)).body;
        expect(first.considered).toBe(REVIEW_ASSIGNMENT.CONSIDERED);

        const again = await api.put(`${assignment}/consider`, {considered: REVIEW_ASSIGNMENT.CONSIDERED});
        expect(again.status).toBe(409);
        const after = (await api.get(assignment)).body;
        expect([after.considered, after.dateConsidered]).toEqual([REVIEW_ASSIGNMENT.CONSIDERED, first.dateConsidered]);
    });

    test('API3: A modified review keeps the shape of its review', async ({scratch}) => {
        const {api, assignment} = await reviewed(scratch);
        const route = `${assignment}/review`;
        const before = (await api.get(route)).body;
        // A journal's review carries a recommendation, which every save
        // names; a press's has none, and refuses one.
        const keep = before.reviewerRecommendationId ? {reviewerRecommendationId: before.reviewerRecommendationId} : {};

        const form = await api.put(route, {...keep, reviewFormResponses: {1: 'An answer'}});
        expect(form.status).toBe(422);
        expect(form.body).toHaveProperty('reviewFormResponses');
        const interests = await api.put(route, {...keep, competingInterests: 'A declared interest'});
        expect(interests.status).toBe(422);
        expect(interests.body).toHaveProperty('competingInterests');
        if (before.reviewerRecommendationId) {
            const elsewhere = await (await scratch()).as('mg');
            const listed = (await elsewhere.get('reviewers/recommendations')).body;
            const foreign = (Array.isArray(listed) ? listed : listed.items)[0].id;
            const recommendation = await api.put(route, {reviewerRecommendationId: foreign});
            expect(recommendation.status).toBe(422);
            expect(recommendation.body).toHaveProperty('reviewerRecommendationId');
        }
        expect((await api.get(route)).body).toEqual(before);
        expect((await api.get(assignment)).body.competingInterestsDeclared).toBe(false);

        // Control: the comment alone is changed.
        const saved = await api.put(route, {...keep, comments: '<p>Modified comment</p>'});
        expect(saved.status).toBe(200);
        expect((await api.get(route)).body).toEqual({...before, comments: '<p>Modified comment</p>'});
    });

    test("API4: A review's file list serves only the review's files", async ({scratch}) => {
        const {reviewer, api, files} = await reviewed(scratch, {files: true});

        for (const fileStages of [`${FILE_STAGE.SUBMISSION}`, `${FILE_STAGE.SUBMISSION},${FILE_STAGE.REVIEW_FILE}`]) {
            expect((await reviewer.get(files, {fileStages})).status, `reviewer, stages ${fileStages}`).toBe(403);
            expect((await api.get(files, {fileStages})).status, `manager, stages ${fileStages}`).toBe(403);
        }

        // Control: unfiltered, the round's file is listed.
        const listed = await reviewer.get(files);
        expect(listed.status).toBe(200);
        expect(listed.body.items.map((file) => file.fileStage)).toEqual([4]);
    });

    test('API5: Naming users outside the reviewer pool lists none of them', async ({scratch}) => {
        const {j, api} = await reviewed(scratch);
        const other = await scratch({users: {mg: 'manager', rv: 'externalReviewer'}});

        const outside = await api.get('users/reviewers', {reviewerIds: [j.id('mg'), j.id('au'), other.id('rv')].join(',')});
        expect(outside.status).toBe(200);
        expect(outside.body.itemsMax).toBe(0);

        // Control: the journal's reviewer, named the same way, is listed.
        const inside = await api.get('users/reviewers', {reviewerIds: String(j.id('rv'))});
        expect(inside.body.items.map((user) => user.id)).toEqual([j.id('rv')]);
    });
});
