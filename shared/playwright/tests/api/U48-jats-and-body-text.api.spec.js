/**
 * JATS & Body Text through the API (docs/specs/U48-jats-and-body-text.md
 * "Through the API"). Who may call the JATS and Body Text routes is the
 * spec's grids and the edit gate's, checked by the matrix
 * (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

const EMPTY = {type: 'doc', content: []};

/** A manager's client and an unpublished submission's version in a scratch journal. */
async function version(scratch) {
    const j = await scratch({users: {mg: 'manager', au: 'author'}});
    const {submissionId, publicationId} = await j.submission('s', {submitter: 'au'});
    const api = await j.as('mg');
    return {api, route: `submissions/${submissionId}/publications/${publicationId}`};
}

/**
 * "Save" on "Body Text", as the page sends it: a multipart form posted with
 * a PUT override (a real PUT fails on the server, U48 A23).
 */
async function saveBodyText(api, route, doc) {
    const res = await api.http.fetch(api.url(`${route}/bodyText`), {
        method: 'POST',
        headers: {'X-Csrf-Token': api.csrfToken, 'X-Http-Method-Override': 'PUT', Accept: 'application/json'},
        multipart: {bodyText: JSON.stringify(doc)},
        failOnStatusCode: false,
    });
    expect(res.status(), await res.text()).toBe(200);
}

test.describe('JATS and body text through the API', () => {
    test('API1: A JATS download switch without its value is refused', async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasIssues, 'only a journal has the "JATS XML" page');
        const {api, route} = await version(scratch);
        const ticked = async () => (await api.get(route)).body.jatsPublicVisibility;
        // A new version's box is unticked: no value stored yet.
        expect(await ticked()).toBeFalsy();

        const refused = await api.put(`${route}/jats/visibility`, {});
        expect(refused.status).toBe(400);
        expect(await ticked()).toBeFalsy();

        // Control: the page's own values are stored.
        const on = await api.put(`${route}/jats/visibility`, {jatsPublicVisibility: true});
        expect(on.status).toBe(200);
        expect(await ticked()).toBe(true);
        const off = await api.put(`${route}/jats/visibility`, {jatsPublicVisibility: false});
        expect(off.status).toBe(200);
        expect(await ticked()).toBe(false);
    });

    test("API2: A version's Body Text is deleted, once", async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasIssues, 'only a journal has the "Body Text" page');
        const {api, route} = await version(scratch);
        const read = async () => JSON.parse((await api.get(`${route}/bodyText`)).body.bodyTextContent);

        expect((await api.delete(`${route}/bodyText`)).status).toBe(404);

        const doc = {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text: 'API2 body text'}]}]};
        await saveBodyText(api, route, doc);
        expect(await read()).toEqual(doc);

        const deleted = await api.delete(`${route}/bodyText`);
        expect(deleted.status).toBe(200);
        expect(await read()).toEqual(EMPTY);
        expect((await api.delete(`${route}/bodyText`)).status).toBe(404);
    });
});
