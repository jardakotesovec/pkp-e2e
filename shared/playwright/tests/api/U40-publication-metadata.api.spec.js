/**
 * Publication metadata through the API
 * (docs/specs/U40-publication-metadata.md "Through the API").
 * Who may call these routes is the grids' (the edit gate and the
 * Permissions & Disclosure page under the spec's Actors & permissions, the
 * workflow screen's for the other pages' forms), checked by the matrix
 * (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

const uniqueTag = (prefix, testInfo) => `${prefix}${testInfo.workerIndex}${Date.now().toString(36)}`;

/** A manager's client on the seeded journal and a fresh submission's version route. */
async function versionOf(apiAs, pkpApi, appContext, tag) {
    const {submissionId, publicationId} = await pkpApi.createSubmission({
        tag,
        context: appContext.contextPath,
        submitter: appContext.seed.actors.author,
    });
    const api = await apiAs(appContext.seed.actors.manager);
    return {api, submissionId, route: `submissions/${submissionId}/publications/${publicationId}`};
}

/** A scratch journal (English only) with a manager and an author, and the manager's client. */
async function scratchJournal(pkpApi, apiAs, tag) {
    const manager = `${tag}mg`;
    const author = `${tag}au`;
    await pkpApi.createContext({tag, users: [{username: manager, roles: ['manager']}, {username: author, roles: ['author']}]});
    return {api: await apiAs(manager, {context: tag}), author};
}

test.describe('publication metadata through the API', () => {
    test('API1: the fields the journal stamps are refused', async ({apiAs, pkpApi, appContext}, testInfo) => {
        const {api, route} = await versionOf(apiAs, pkpApi, appContext, uniqueTag('u40a1', testInfo));
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

    test('API2: an edit changes neither the status nor the submission language', async ({apiAs, pkpApi, appContext}, testInfo) => {
        const {api, submissionId, route} = await versionOf(apiAs, pkpApi, appContext, uniqueTag('u40a2', testInfo));
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

    test('API3: a language the journal lacks, or a title that is not per language, is refused', async ({apiAs, pkpApi}, testInfo) => {
        const tag = uniqueTag('u40a3', testInfo);
        const {api, author} = await scratchJournal(pkpApi, apiAs, tag);
        const {submissionId, publicationId} = await pkpApi.createSubmission({tag: `${tag}s`, context: tag, submitter: author});
        const route = `submissions/${submissionId}/publications/${publicationId}`;
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

    test('API4: term suggestions come from this journal\'s published versions alone', async ({apiAs, pkpApi}, testInfo) => {
        const tag = uniqueTag('u40a4', testInfo);
        const {api, author} = await scratchJournal(pkpApi, apiAs, tag);
        const elsewhere = await scratchJournal(pkpApi, apiAs, `${tag}x`);
        await pkpApi.createSubmission({tag: `${tag}p`, context: tag, submitter: author, keywords: [`${tag}published`], published: true});
        await pkpApi.createSubmission({tag: `${tag}u`, context: tag, submitter: author, keywords: [`${tag}draft`]});
        await pkpApi.createSubmission({tag: `${tag}o`, context: `${tag}x`, submitter: elsewhere.author, keywords: [`${tag}foreign`], published: true});

        const offered = await api.get('vocabs', {vocab: 'submissionKeyword', locale: 'en', term: tag});
        expect(offered.status).toBe(200);
        expect(offered.body.map((entry) => entry.name)).toEqual([`${tag}published`]);

        // The other journal is offered its own term alone.
        const theirs = await elsewhere.api.get('vocabs', {vocab: 'submissionKeyword', locale: 'en', term: tag});
        expect(theirs.body.map((entry) => entry.name)).toEqual([`${tag}foreign`]);

        // A language the journal lacks is refused.
        const foreign = await api.get('vocabs', {vocab: 'submissionKeyword', locale: 'fr_CA', term: tag});
        expect(foreign.status).toBe(400);
    });
});
