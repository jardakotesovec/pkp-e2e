/**
 * Publication metadata through the API
 * (docs/specs/U40-publication-metadata.md "Through the API").
 * Who may call these routes is the grids' (the edit gate and the
 * Permissions & Disclosure page under the spec's Actors & permissions, the
 * workflow screen's for the other pages' forms), checked by the matrix
 * (docs/process/api.md), never here. A scratch journal offers English
 * alone.
 */
const {test, expect} = require('../../support/base-test.js');

test.describe('publication metadata through the API', () => {
    test('API1: The fields the journal stamps are refused', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const {submissionId, publicationId} = await j.submission('s', {submitter: 'au'});
        const route = `submissions/${submissionId}/publications/${publicationId}`;
        const api = await j.as('mg');
        const before = (await api.get(route)).body;

        for (const [field, value] of [['contextName', {en: 'Forged Journal'}], ['publisherLocation', 'Forged City']]) {
            const refused = await api.put(route, {[field]: value, prefix: {en: 'The'}});
            expect(refused.status, field).toBe(400);
            expect(refused.body, field).toHaveProperty(field);
        }
        const after = (await api.get(route)).body;
        expect([after.contextName, after.publisherLocation, after.prefix]).toEqual([before.contextName, before.publisherLocation, before.prefix]);

        // Control: the same edit without the stamped field is saved.
        expect((await api.put(route, {prefix: {en: 'The'}})).status).toBe(200);
        expect((await api.get(route)).body.prefix.en).toBe('The');
    });

    test('API2: An edit changes neither the status nor the submission language', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const {submissionId, publicationId} = await j.submission('s', {submitter: 'au'});
        const route = `submissions/${submissionId}/publications/${publicationId}`;
        const api = await j.as('mg');
        const before = (await api.get(route)).body;

        // Published (3) and scheduled (5): refused, the version still unpublished.
        for (const status of [3, 5]) {
            const refused = await api.put(route, {status});
            expect(refused.status, `status ${status}`).toBe(403);
        }
        const after = (await api.get(route)).body;
        expect([after.status, after.datePublished]).toEqual([before.status, before.datePublished]);

        // A language named in the edit: the rest saves, the language stays.
        const kept = await api.put(route, {locale: 'fr_CA', subtitle: {[before.locale]: 'A subtitle'}});
        expect(kept.status).toBe(200);
        expect(kept.body.locale).toBe(before.locale);
        expect((await api.get(`submissions/${submissionId}`)).body.locale).toBe(before.locale);
        expect((await api.get(route)).body.subtitle[before.locale]).toBe('A subtitle');
    });

    test('API3: A language the journal lacks, or a title that is not per language, is refused', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const {submissionId, publicationId} = await j.submission('s', {submitter: 'au'});
        const route = `submissions/${submissionId}/publications/${publicationId}`;
        const api = await j.as('mg');
        const before = (await api.get(route)).body;

        const foreign = await api.put(route, {title: {fr_CA: 'Un titre'}, keywords: {fr_CA: [{name: 'marée'}]}});
        expect(foreign.status).toBe(400);
        expect(foreign.body.title).toHaveProperty('fr_CA');

        const flat = await api.put(route, {title: 'One title for every language'});
        expect(flat.status).toBe(400);
        expect(flat.body).toHaveProperty('title');

        const after = (await api.get(route)).body;
        expect([after.title, after.keywords]).toEqual([before.title, before.keywords]);
    });

    test('API4: Term suggestions come from this journal\'s published versions alone', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const elsewhere = await scratch({users: {mg: 'manager', au: 'author'}});
        const term = j.path;
        await j.submission('p', {submitter: 'au', keywords: [`${term}published`], published: true});
        await j.submission('u', {submitter: 'au', keywords: [`${term}draft`]});
        await elsewhere.submission('o', {submitter: 'au', keywords: [`${term}foreign`], published: true});

        const api = await j.as('mg');
        const offered = await api.get('vocabs', {vocab: 'submissionKeyword', locale: 'en', term});
        expect(offered.status).toBe(200);
        expect(offered.body.map((entry) => entry.name)).toEqual([`${term}published`]);

        // The other journal is offered its own term alone.
        const theirs = await (await elsewhere.as('mg')).get('vocabs', {vocab: 'submissionKeyword', locale: 'en', term});
        expect(theirs.body.map((entry) => entry.name)).toEqual([`${term}foreign`]);

        // A language the journal lacks is refused.
        const foreign = await api.get('vocabs', {vocab: 'submissionKeyword', locale: 'fr_CA', term});
        expect(foreign.status).toBe(400);
    });
});
