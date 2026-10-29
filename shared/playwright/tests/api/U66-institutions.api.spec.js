/**
 * Institutions through the API (docs/specs/U66-institutions.md "Through
 * the API"). Who may call the institutions routes is the spec's
 * institutions grid, checked by the matrix (docs/process/api.md), never
 * here.
 */
const {test, expect} = require('../../support/base-test.js');

const names = (res) => res.body.items.map((i) => i.name.en).sort();

test.describe('institutions through the API', () => {
    test('API1: One institution read back at the journal\'s own address', async ({scratch}) => {
        const j = await scratch({
            institutions: [{name: 'Campus Library', ipRanges: ['10.0.0.0/8'], ror: 'https://ror.org/0213rcc28'}],
        });
        const id = j.seeded.institutions[0].id;

        const one = await (await j.as('mg')).get(`institutions/${id}`);
        expect(one.status).toBe(200);
        expect(one.body).toMatchObject({
            id,
            name: {en: 'Campus Library'},
            ipRanges: ['10.0.0.0/8'],
            ror: 'https://ror.org/0213rcc28',
        });
    });

    test('API2: An add naming another journal lands in this one', async ({scratch}) => {
        const own = await scratch({institutions: [{name: 'Our Library'}]});
        const other = await scratch({institutions: [{name: 'Their Library'}]});
        const ours = await own.as('mg');

        const added = await ours.post('institutions', {name: {en: 'Placed Here'}, contextId: other.seeded.contextId});
        expect(added.status).toBe(200);
        expect(names(await ours.get('institutions'))).toEqual(['Our Library', 'Placed Here']);
        expect(names(await (await other.as('mg')).get('institutions'))).toEqual(['Their Library']);
    });

    test('API3: An edit that sends one field keeps the others', async ({scratch}) => {
        const j = await scratch({institutions: [{name: 'Campus Library', ipRanges: ['10.0.0.0/8']}]});
        const api = await j.as('mg');
        const id = j.seeded.institutions[0].id;

        const edited = await api.put(`institutions/${id}`, {ror: 'https://ror.org/0213rcc28'});
        expect(edited.status).toBe(200);
        expect((await api.get(`institutions/${id}`)).body).toMatchObject({
            name: {en: 'Campus Library'},
            ipRanges: ['10.0.0.0/8'],
            ror: 'https://ror.org/0213rcc28',
        });
    });

    test('API4: A name in a language the journal\'s forms do not offer is refused', async ({scratch}) => {
        const api = await (await scratch()).as('mg');

        const refused = await api.post('institutions', {name: {en: 'Campus Library', fr_CA: 'Bibliothèque du campus'}});
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty(['name', 'fr_CA']);
        expect((await api.get('institutions')).body.itemsMax).toBe(0);

        // Control: the same add in English alone is stored.
        expect((await api.post('institutions', {name: {en: 'Campus Library'}})).status).toBe(200);
        expect(names(await api.get('institutions'))).toEqual(['Campus Library']);
    });

    test('API5: The list paged one institution at a time', async ({scratch}) => {
        const api = await (await scratch({institutions: [{name: 'Alpha'}, {name: 'Beta'}, {name: 'Gamma'}]})).as('mg');

        const second = await api.get('institutions', {count: 1, offset: 1});
        expect(second.status).toBe(200);
        expect(second.body.items).toHaveLength(1);
        expect(second.body.itemsMax).toBe(3);
    });
});
