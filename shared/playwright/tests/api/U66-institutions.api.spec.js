/**
 * Institutions through the API (docs/specs/U66-institutions.md "Through
 * the API"). Who may call the institutions routes is the spec's
 * institutions grid, checked by the matrix (docs/process/api.md), never
 * here.
 */
const {test, expect} = require('../../support/base-test.js');

/** A unique tag for this test's scratch journal(s). */
function makeTag(check, testInfo) {
    return `u66${check}w${testInfo.workerIndex}${Date.now().toString(36)}`;
}

/** A scratch journal with a manager, seeded with `extra`; its manager's client. */
async function journal(apiAs, pkpApi, tag, extra = {}) {
    const seeded = await pkpApi.createContext({tag, users: [{username: `${tag}mg`, roles: ['manager']}], ...extra});
    const api = await apiAs(`${tag}mg`, {context: tag});
    return {seeded, api};
}

const names = (res) => res.body.items.map((i) => i.name.en).sort();

test.describe('institutions through the API', () => {
    test('API1: one institution read back at the journal\'s own address', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a1', testInfo);
        const {seeded, api} = await journal(apiAs, pkpApi, tag, {
            institutions: [{name: 'Campus Library', ipRanges: ['10.0.0.0/8'], ror: 'https://ror.org/0213rcc28'}],
        });
        const id = seeded.institutions[0].id;

        const one = await api.get(`institutions/${id}`);
        expect(one.status).toBe(200);
        expect(one.body).toMatchObject({
            id,
            name: {en: 'Campus Library'},
            ipRanges: ['10.0.0.0/8'],
            ror: 'https://ror.org/0213rcc28',
        });
    });

    test('API2: another journal\'s institution is out of reach from this journal\'s address', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a2', testInfo);
        const own = await journal(apiAs, pkpApi, tag, {institutions: [{name: 'Our Library'}]});
        const other = await journal(apiAs, pkpApi, `${tag}b`, {institutions: [{name: 'Their Library'}]});
        const theirs = other.seeded.institutions[0].id;

        expect((await own.api.put(`institutions/${theirs}`, {name: {en: 'Changed from elsewhere'}})).status).toBe(404);
        expect((await own.api.delete(`institutions/${theirs}`)).status).toBe(404);
        // The read's status is A13's; it carries none of the institution.
        const read = await own.api.get(`institutions/${theirs}`);
        expect(read.body).not.toHaveProperty('id');
        expect(read.body).not.toHaveProperty('name');
        expect(names(await other.api.get('institutions'))).toEqual(['Their Library']);

        // An add naming the other journal still lands in this one.
        const added = await own.api.post('institutions', {name: {en: 'Placed Here'}, contextId: other.seeded.contextId});
        expect(added.status).toBe(200);
        expect(names(await own.api.get('institutions'))).toEqual(['Our Library', 'Placed Here']);
        expect(names(await other.api.get('institutions'))).toEqual(['Their Library']);
    });

    test('API3: an edit that sends one field keeps the others', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a3', testInfo);
        const {seeded, api} = await journal(apiAs, pkpApi, tag, {
            institutions: [{name: 'Campus Library', ipRanges: ['10.0.0.0/8']}],
        });
        const id = seeded.institutions[0].id;

        const edited = await api.put(`institutions/${id}`, {ror: 'https://ror.org/0213rcc28'});
        expect(edited.status).toBe(200);
        expect((await api.get(`institutions/${id}`)).body).toMatchObject({
            name: {en: 'Campus Library'},
            ipRanges: ['10.0.0.0/8'],
            ror: 'https://ror.org/0213rcc28',
        });
    });

    test('API4: a name in a language the journal\'s forms do not offer is refused', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a4', testInfo);
        const {api} = await journal(apiAs, pkpApi, tag);

        const refused = await api.post('institutions', {name: {en: 'Campus Library', fr_CA: 'Bibliothèque du campus'}});
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty(['name', 'fr_CA']);
        expect((await api.get('institutions')).body.itemsMax).toBe(0);

        // Control: the same add in English alone is stored.
        expect((await api.post('institutions', {name: {en: 'Campus Library'}})).status).toBe(200);
        expect(names(await api.get('institutions'))).toEqual(['Campus Library']);
    });

    test('API5: the list paged one institution at a time', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a5', testInfo);
        const {api} = await journal(apiAs, pkpApi, tag, {
            institutions: [{name: 'Alpha'}, {name: 'Beta'}, {name: 'Gamma'}],
        });

        const second = await api.get('institutions', {count: 1, offset: 1});
        expect(second.status).toBe(200);
        expect(second.body.items).toHaveLength(1);
        expect(second.body.itemsMax).toBe(3);
    });
});
