/**
 * Highlights through the API (docs/specs/U11-highlights.md "Through the
 * API"). Who may call the highlights routes is the spec's highlights grid,
 * checked by the matrix (docs/process/api.md), never here. There is no
 * highlight seed key, so each test adds its highlights through the route
 * the panel uses, as the journal's manager.
 */
const {test, expect} = require('../../support/base-test.js');

/** A unique tag for this test's scratch journal(s). */
function makeTag(check, testInfo) {
    return `u11${check}w${testInfo.workerIndex}${Date.now().toString(36)}`;
}

/** A scratch journal with a manager; its manager's client. */
async function journal(apiAs, pkpApi, tag) {
    const seeded = await pkpApi.createContext({tag, users: [{username: `${tag}mg`, roles: ['manager']}]});
    const api = await apiAs(`${tag}mg`, {context: tag});
    return {seeded, api};
}

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
    test('API1: one highlight read back at the journal\'s own address', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a1', testInfo);
        const {seeded, api} = await journal(apiAs, pkpApi, tag);
        const id = await add(api, slide('Call for papers', {url: 'https://example.org/cfp'}));

        const one = await api.get(`highlights/${id}`);
        expect(one.status).toBe(200);
        expect(one.body).toMatchObject({
            id,
            contextId: seeded.contextId,
            title: {en: 'Call for papers'},
            url: 'https://example.org/cfp',
            urlText: {en: 'Read more'},
        });

        expect((await api.get('highlights/999999999')).status).toBe(404);
    });

    test('API2: another journal\'s highlight is out of reach from this journal\'s address', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a2', testInfo);
        const own = await journal(apiAs, pkpApi, tag);
        const other = await journal(apiAs, pkpApi, `${tag}b`);
        await add(own.api, slide('Our slide'));
        const theirs = await add(other.api, slide('Their slide'));

        expect((await own.api.get(`highlights/${theirs}`)).status).toBe(404);
        expect((await own.api.put(`highlights/${theirs}`, {title: {en: 'Changed from elsewhere'}})).status).toBe(404);
        expect((await own.api.delete(`highlights/${theirs}`)).status).toBe(404);
        expect((await own.api.put('highlights/order', {sequence: [{id: theirs, sequence: 0}]})).status).toBe(400);
        const left = (await other.api.get('highlights')).body.items;
        expect(left).toHaveLength(1);
        expect(left[0]).toMatchObject({id: theirs, title: {en: 'Their slide'}, sequence: 1});

        // An add naming the other journal still lands in this one.
        await add(own.api, slide('Placed here', {contextId: other.seeded.contextId}));
        expect(await titles(own.api)).toEqual(['Our slide', 'Placed here']);
        expect(await titles(other.api)).toEqual(['Their slide']);
    });

    test('API3: an order the panel never sends', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a3', testInfo);
        const {api} = await journal(apiAs, pkpApi, tag);
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

    test('API4: a text in a language the journal\'s forms do not offer is refused', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a4', testInfo);
        const {api} = await journal(apiAs, pkpApi, tag);

        const refused = await api.post('highlights', slide('Call for papers', {title: {en: 'Call for papers', fr_CA: 'Appel à contributions'}}));
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty(['title', 'fr_CA']);
        expect((await api.get('highlights')).body.itemsMax).toBe(0);

        // Control: the same add in English alone is stored.
        await add(api, slide('Call for papers'));
        expect(await titles(api)).toEqual(['Call for papers']);
    });

    test('API5: an edit that sends one field keeps the others', async ({apiAs, pkpApi}, testInfo) => {
        const tag = makeTag('a5', testInfo);
        const {api} = await journal(apiAs, pkpApi, tag);
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
