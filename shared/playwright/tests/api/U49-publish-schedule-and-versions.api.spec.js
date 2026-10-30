/**
 * Publishing and versions through the API (docs/specs/U49-publish-schedule-and-versions.md
 * "Through the API"). Who may call the publish, unpublish and version
 * routes is the spec's grids, checked by the matrix (docs/process/api.md),
 * never here.
 */
const {test, expect} = require('../../support/base-test.js');

const PUBLISHED = 3;

/** A manager's client and a published submission in a scratch journal, with its version routes. */
async function publishedSubmission(scratch) {
    const j = await scratch({users: {mg: 'manager', au: 'author'}});
    const {submissionId, publicationId} = await j.submission('s', {submitter: 'au', published: true});
    const api = await j.as('mg');
    const versions = `submissions/${submissionId}/publications`;
    return {
        api,
        submissionId,
        publicationId,
        versions,
        version: async (id) => (await api.get(`${versions}/${id}`)).body,
        ids: async () => (await api.get(versions)).body.items.map((v) => v.id),
        /** "Create New Version"'s request, untouched: a minor version of the same stage. */
        copy: async () => {
            const res = await api.post(`${versions}/${publicationId}/version`, {});
            expect(res.status).toBe(200);
            return res.body.id;
        },
    };
}

const numbering = (v) => [v.versionStage, v.versionMajor, v.versionMinor];

test.describe('publishing and versions through the API', () => {
    test('API1: A version is published only once, and unpublished only while published', async ({scratch}) => {
        const s = await publishedSubmission(scratch);
        const published = await s.version(s.publicationId);
        expect(published.status).toBe(PUBLISHED);
        const draft = await s.copy();

        const again = await s.api.put(`${s.versions}/${s.publicationId}/publish`, {});
        expect(again.status).toBe(403);
        const after = await s.version(s.publicationId);
        expect([after.status, after.datePublished]).toEqual([PUBLISHED, published.datePublished]);

        const notPublished = await s.api.put(`${s.versions}/${draft}/unpublish`, {});
        expect(notPublished.status).toBe(403);
        expect((await s.version(draft)).status).not.toBe(PUBLISHED);

        // Control: the new version publishes, then unpublishes.
        const publish = await s.api.put(`${s.versions}/${draft}/publish`, {});
        expect(publish.status).toBe(200);
        expect((await s.version(draft)).status).toBe(PUBLISHED);
        const unpublish = await s.api.put(`${s.versions}/${draft}/unpublish`, {});
        expect(unpublish.status).toBe(200);
        expect((await s.version(draft)).status).not.toBe(PUBLISHED);
    });

    test('API2: A published version cannot be deleted', async ({scratch}) => {
        const s = await publishedSubmission(scratch);
        const draft = await s.copy();

        const refused = await s.api.delete(`${s.versions}/${s.publicationId}`);
        expect(refused.status).toBe(403);
        expect(refused.body.error).toBe('You must unpublish this publication before you can delete it.');
        expect((await s.ids()).sort()).toEqual([s.publicationId, draft].sort());

        // Control: the version not yet published is deleted; the published one stays.
        const deleted = await s.api.delete(`${s.versions}/${draft}`);
        expect(deleted.status).toBe(200);
        expect(await s.ids()).toEqual([s.publicationId]);
        expect((await s.version(s.publicationId)).status).toBe(PUBLISHED);
        expect((await s.api.get(`submissions/${s.submissionId}`)).body.status).toBe(PUBLISHED);
    });

    test("API3: Version numbers asked for by program follow the stage's numbering", async ({scratch}) => {
        const s = await publishedSubmission(scratch);
        const stage = (await s.version(s.publicationId)).versionStage;
        expect(numbering(await s.version(s.publicationId))).toEqual([stage, 1, 0]);
        const next = (query) => s.api.get(`submissions/${s.submissionId}/nextAvailableVersion`, query);

        const major = await next({versionStage: stage, versionIsMinor: 'false'});
        expect(major.status).toBe(200);
        expect([major.body.majorNumbering, major.body.minorNumbering]).toEqual([2, 0]);
        const minor = await next({versionStage: stage, versionIsMinor: 'true'});
        expect(minor.status).toBe(200);
        expect([minor.body.majorNumbering, minor.body.minorNumbering]).toEqual([1, 1]);
        const draft = await s.copy();
        expect(numbering(await s.version(draft))).toEqual([stage, 1, 1]);

        // Stage and number together.
        const renumbered = await s.api.put(`${s.versions}/${draft}/version`, {versionStage: stage, versionIsMinor: false});
        expect(renumbered.status).toBe(200);
        expect(numbering(await s.version(draft))).toEqual([stage, 2, 0]);

        // No stage, or one the app does not have: refused on the stage.
        // An app whose publish stamps Author's Original (a preprint
        // server) has no Version of Record either.
        const unknown = ['XX', ...(stage === 'AO' ? ['VoR'] : [])];
        for (const query of [{versionIsMinor: 'false'}, ...unknown.map((versionStage) => ({versionStage, versionIsMinor: 'false'}))]) {
            const read = await next(query);
            expect(read.status, JSON.stringify(query)).toBe(422);
            expect(read.body, JSON.stringify(query)).toHaveProperty('versionStage');
            const write = await s.api.put(`${s.versions}/${draft}/version`, {...query, versionIsMinor: false});
            expect(write.status, JSON.stringify(query)).toBe(422);
            expect(write.body, JSON.stringify(query)).toHaveProperty('versionStage');
        }
        expect(numbering(await s.version(draft))).toEqual([stage, 2, 0]);
    });
});
