/**
 * Highlights through the API (docs/specs/U11-highlights.md "Through the
 * API"). Who may call the highlights routes is the spec's highlights grid,
 * checked by the matrix (docs/process/api.md), never here. There is no
 * highlight seed key, so each test adds its highlights through the route
 * the panel uses, as the scratch journal's manager.
 */
const {test, expect} = require('../../support/base-test.js');

/** A highlight as the panel sends it; `extra` overrides. */
const slide = (title, extra = {}) => ({
    title: {en: title},
    description: {en: ''},
    url: 'https://example.org/slide',
    urlText: {en: 'Read more'},
    ...extra,
});

/** Add a highlight and return its id. */
async function add(api, body) {
    const res = await api.post('highlights', body);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.id;
}

/** The list's titles in its order. */
const titles = async (api) => (await api.get('highlights')).body.items.map((h) => h.title.en);

test.describe('highlights through the API', () => {
    test('API1: One highlight read back at the journal\'s own address', async ({scratch}) => {
        const j = await scratch();
        const api = await j.as('mg');
        const id = await add(api, slide('Call for papers', {url: 'https://example.org/cfp'}));

        const one = await api.get(`highlights/${id}`);
        expect(one.status).toBe(200);
        expect(one.body).toMatchObject({
            id,
            contextId: j.seeded.contextId,
            title: {en: 'Call for papers'},
            url: 'https://example.org/cfp',
            urlText: {en: 'Read more'},
        });

        expect((await api.get('highlights/999999999')).status).toBe(404);
    });

    test('API2: An add naming another journal lands in this one', async ({scratch}) => {
        const own = await scratch();
        const other = await scratch();
        const ours = await own.as('mg');
        const theirs = await other.as('mg');
        await add(ours, slide('Our slide'));
        await add(theirs, slide('Their slide'));

        // An add naming the other journal still lands in this one.
        await add(ours, slide('Placed here', {contextId: other.seeded.contextId}));
        expect(await titles(ours)).toEqual(['Our slide', 'Placed here']);
        expect(await titles(theirs)).toEqual(['Their slide']);
    });

    test('API3: An order the panel never sends', async ({scratch}) => {
        const api = await (await scratch()).as('mg');
        const first = await add(api, slide('First'));
        const second = await add(api, slide('Second'));
        const third = await add(api, slide('Third'));

        // A number no highlight has: refused, and nothing moved.
        const refused = await api.put('highlights/order', {
            sequence: [{id: third, sequence: 0}, {id: second, sequence: 1}, {id: first, sequence: 2}, {id: 999999999, sequence: 3}],
        });
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty('sequence');
        expect(await titles(api)).toEqual(['First', 'Second', 'Third']);

        // One highlight named: it moves, the others keep their order.
        expect((await api.put('highlights/order', {sequence: [{id: third, sequence: 0}]})).status).toBe(200);
        expect(await titles(api)).toEqual(['Third', 'First', 'Second']);
    });

    test('API4: A text in a language the journal\'s forms do not offer is refused', async ({scratch}) => {
        const api = await (await scratch()).as('mg');

        const refused = await api.post('highlights', slide('Call for papers', {title: {en: 'Call for papers', fr_CA: 'Appel à contributions'}}));
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty(['title', 'fr_CA']);
        expect((await api.get('highlights')).body.itemsMax).toBe(0);

        // Control: the same add in English alone is stored.
        await add(api, slide('Call for papers'));
        expect(await titles(api)).toEqual(['Call for papers']);
    });

    test('API5: An edit that sends one field keeps the others', async ({scratch}) => {
        const api = await (await scratch()).as('mg');
        const id = await add(api, slide('Call for papers', {
            description: {en: '<p>Submissions open until June.</p>'},
            url: 'https://example.org/cfp',
        }));

        expect((await api.put(`highlights/${id}`, {url: 'https://example.org/cfp-2027'})).status).toBe(200);
        expect((await api.get(`highlights/${id}`)).body).toMatchObject({
            title: {en: 'Call for papers'},
            description: {en: '<p>Submissions open until June.</p>'},
            url: 'https://example.org/cfp-2027',
            urlText: {en: 'Read more'},
        });
    });
});
