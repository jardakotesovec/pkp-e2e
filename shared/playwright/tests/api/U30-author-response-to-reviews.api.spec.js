/**
 * Author response to reviews through the API
 * (docs/specs/U30-author-response-to-reviews.md "Through the API"). Who
 * may call these routes is the spec's grids', checked by the matrix
 * (docs/process/api.md), never here. A press answers them the same way,
 * though its screens show none of it (the spec's OMP1).
 */
const {test, expect} = require('../../support/base-test.js');
const {FILE_STAGE} = require('../../support/pkp-ids.js');

/**
 * A scratch journal with two submissions by its author, each with a file
 * on "Submission Files" and accepted from its review round, the review
 * completed: so the round is ready for a request and shows the author's
 * card.
 */
async function rounds(scratch) {
    const j = await scratch({users: {mg: 'manager', au: 'author', rv: 'externalReviewer'}});
    const seed = (suffix) => j.submission(suffix, {
        submitter: 'au',
        files: [{file: 'article.pdf'}],
        decisions: ['sendExternalReview', 'accept'],
        reviewRounds: [{reviewers: [{username: j.user('rv'), status: 'completed'}]}],
    });
    const api = await j.as('mg');
    const read = async (s) => {
        const contributors = (await api.get(`submissions/${s.submissionId}/publications/${s.publicationId}/contributors`)).body;
        const files = (await api.get(`submissions/${s.submissionId}/files`, {fileStages: [FILE_STAGE.SUBMISSION]})).body;
        const roundId = s.reviewRounds[0].id;
        return {
            ...s,
            contributorId: (contributors.items || contributors)[0].id,
            fileId: files.items[0].id,
            responses: `reviews/${s.submissionId}/${roundId}/authorResponse`,
            round: async () => (await api.get(`submissions/${s.submissionId}`)).body.reviewRounds.find((r) => r.id === roundId),
        };
    };
    return {j, api, author: await j.as('au'), first: await read(await seed('a')), second: await read(await seed('b'))};
}

test.describe('author response to reviews through the API', () => {
    test.beforeEach(async ({appContext}) => {
        test.skip(!appContext.capabilities.hasReviewStage, 'a preprint server has no review');
    });

    test("API1: A response must carry its text and name the submission's own contributors", async ({scratch}) => {
        const {author, first, second} = await rounds(scratch);
        const text = {en: '<p>We added the control group.</p>'};

        for (const authorResponse of [undefined, {}, 'plain text']) {
            const refused = await author.post(first.responses, {authorResponse, associatedAuthorIds: [first.contributorId]});
            expect(refused.status, JSON.stringify(authorResponse)).toBe(422);
            expect(refused.body, JSON.stringify(authorResponse)).toHaveProperty('authorResponse');
        }
        for (const associatedAuthorIds of [[], [second.contributorId]]) {
            const refused = await author.post(first.responses, {authorResponse: text, associatedAuthorIds});
            expect(refused.status, JSON.stringify(associatedAuthorIds)).toBe(422);
            expect(refused.body, JSON.stringify(associatedAuthorIds)).toHaveProperty('associatedAuthorIds');
        }
        expect((await first.round()).authorResponse).toBeNull();

        // Control: the text and the submission's own contributor are stored.
        const added = await author.post(first.responses, {authorResponse: text, associatedAuthorIds: [first.contributorId]});
        expect(added.status).toBe(200);
        const stored = (await first.round()).authorResponse;
        expect(stored.response).toEqual(text);
        expect(stored.associatedAuthors.map((a) => a.id)).toEqual([first.contributorId]);
    });

    test("API2: A request's attachments must be files of the submission", async ({scratch}) => {
        const {api, first, second} = await rounds(scratch);
        const request = `${first.responses}/requestResponse`;
        const email = {subject: 'Request For Author Response To Reviewer Feedback', body: '<p>Please respond.</p>', locale: 'en'};

        for (const attachment of [{submissionFileId: second.fileId, name: 'article.pdf'}, {name: 'article.pdf'}]) {
            const refused = await api.post(request, {...email, attachments: [attachment]});
            expect(refused.status, JSON.stringify(attachment)).toBe(422);
            expect(refused.body, JSON.stringify(attachment)).toHaveProperty('attachments');
        }
        expect((await first.round()).isAuthorResponseRequested).toBeFalsy();

        // Control: the submission's own file goes with the request.
        const sent = await api.post(request, {...email, attachments: [{submissionFileId: first.fileId, name: 'article.pdf'}]});
        expect(sent.status).toBe(200);
        expect((await first.round()).isAuthorResponseRequested).toBe(true);
    });
});
