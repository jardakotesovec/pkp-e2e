/**
 * Reviewer suggestions through the API (docs/specs/U31-reviewer-suggestions.md
 * "Through the API"). Who may call the suggestions routes is the spec's
 * grids', checked by the matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

/** A suggestion as the step's window sends it, under a given address. */
const suggestion = (email) => ({
    givenName: {en: 'Ada'},
    familyName: {en: 'Suggested'},
    email,
    affiliation: {en: 'U31 University'},
    suggestionReason: {en: '<p>U31 reason</p>'},
});

test.describe('reviewer suggestions through the API', () => {
    test('API1: Suggestions are fixed once the submission is in', async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasReviewStage, 'a preprint server has no reviewer suggestions');
        const j = await scratch({users: {mg: 'manager', au: 'author'}, review: {reviewerSuggestionEnabled: true}});
        const seed = (suffix, spec) => j.submission(suffix, {
            submitter: 'au',
            reviewerSuggestions: [{givenName: 'Grace', familyName: 'Seeded', email: `${j.path}${suffix}@mail.test`}],
            ...spec,
        });
        const submitted = await seed('s');
        const draft = await seed('d', {submitted: false});

        for (const key of ['mg', 'au']) {
            const api = await j.as(key);
            const route = `submissions/${submitted.submissionId}/reviewers/suggestions`;
            const before = (await api.get(route)).body;
            expect(before.itemsMax, key).toBe(1);
            const id = before.items[0].id;
            const calls = {
                add: await api.post(route, suggestion(`${j.path}${key}new@mail.test`)),
                edit: await api.put(`${route}/${id}`, suggestion(`${j.path}${key}edit@mail.test`)),
                delete: await api.delete(`${route}/${id}`),
            };
            for (const [label, res] of Object.entries(calls)) {
                expect(res.status, `${key} ${label}`).toBe(401);
                expect(res.body.error, `${key} ${label}`).toBe('user.authorization.submission.complete.reviewerSuggestionRestrict');
            }
            expect((await api.get(route)).body, key).toEqual(before);
        }

        // Control: on the draft the author's "Edit" › "Save" is stored.
        const author = await j.as('au');
        const route = `submissions/${draft.submissionId}/reviewers/suggestions`;
        const id = (await author.get(route)).body.items[0].id;
        const edited = await author.put(`${route}/${id}`, suggestion(`${j.path}edited@mail.test`));
        expect(edited.status).toBe(200);
        expect((await author.get(`${route}/${id}`)).body.email).toBe(`${j.path}edited@mail.test`);
    });
});
