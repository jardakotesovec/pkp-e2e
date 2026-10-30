/**
 * ORCID integration through the API (docs/specs/U04-orcid-integration.md
 * "Through the API"). Who may call the ORCID routes is the grids' (U40's
 * edit gate, U04's send-review grid), checked by the matrix
 * (docs/process/api.md), never here. Nothing here reaches orcid.org: the
 * remove ("Delete") is only sent where the route refuses it first, and the
 * journal's ORCID is the public sandbox with a made-up client.
 */
const {test, expect} = require('../../support/base-test.js');

/** ORCID switched on as the journal's ORCID tab saves it (public sandbox, a made-up client). */
const ORCID_ON = {orcidEnabled: true, orcidApiType: 'publicSandbox', orcidClientId: 'APP-APICHECK000000', orcidClientSecret: 'api-check-secret'};

/** A scratch journal's manager, a submission and a contributor the manager adds to it. */
async function contributor(scratch) {
    const j = await scratch({users: {mg: 'manager', au: 'author'}});
    const {submissionId, publicationId} = await j.submission('s', {submitter: 'au'});
    const api = await j.as('mg');
    const contributors = `submissions/${submissionId}/publications/${publicationId}/contributors`;
    const roles = (await api.get('contributorRoles')).body;
    const added = await api.post(contributors, {
        contributorType: 'PERSON',
        givenName: {en: 'Orcid'},
        familyName: {en: 'Check'},
        email: `${j.path}-orcid@mail.test`,
        country: 'CA',
        contributorRoles: [roles[0].id],
    });
    expect(added.status).toBe(200);
    const read = async () => (await api.get(`${contributors}/${added.body.id}`)).body;
    return {j, api, authorId: added.body.id, read};
}

test.describe('ORCID integration through the API', () => {
    test('API1: With ORCID off, the contributor actions are refused', async ({scratch}) => {
        const {j, api, authorId, read} = await contributor(scratch);

        // A new journal has ORCID off: both actions refused before anything is sent.
        for (const route of [`orcid/requestAuthorVerification/${authorId}`, `orcid/deleteForAuthor/${authorId}`]) {
            const refused = await api.post(route, {});
            expect(refused.status, route).toBe(403);
        }
        expect((await read()).orcidVerificationRequested).toBeFalsy();

        // Control: with ORCID on, the request is taken and the contributor marked.
        expect((await api.put(`contexts/${j.seeded.contextId}`, ORCID_ON)).status).toBe(200);
        expect((await api.post(`orcid/requestAuthorVerification/${authorId}`, {})).status).toBe(200);
        expect((await read()).orcidVerificationRequested).toBe(true);
    });

    test('API2: An author number that names no contributor is not found', async ({scratch}) => {
        const {j, api, read} = await contributor(scratch);
        expect((await api.put(`contexts/${j.seeded.contextId}`, ORCID_ON)).status).toBe(200);

        // Refused on the number before anything is sent (a remove would ask orcid.org to revoke).
        for (const route of ['orcid/requestAuthorVerification/999999999', 'orcid/deleteForAuthor/999999999']) {
            const missing = await api.post(route, {});
            expect(missing.status, route).toBe(404);
        }
        expect((await read()).orcidVerificationRequested).toBeFalsy();
    });
});
