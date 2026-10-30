/**
 * Hosted journals through the API (docs/specs/U59-hosted-journals.md
 * "Through the API"). Who may call the journal routes is the spec's grids
 * and the Administration grid of U61, checked by the matrix
 * (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

const paths = (res) => res.body.items.map((c) => c.urlPath).sort();

test.describe('hosted journals through the API', () => {
    test('API1: A journal added with its required fields empty is refused', async ({apiAs}) => {
        const admin = await apiAs('admin', {context: 'index'});
        const path = `u59e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const empty = {
            urlPath: path,
            name: {en: ''},
            acronym: {en: 'EFR'},
            contactName: '',
            contactEmail: '',
            country: '',
            primaryLocale: 'en',
            supportedLocales: ['en'],
        };

        const refused = await admin.post('contexts', empty);
        expect(refused.status).toBe(400);
        for (const field of [['name', 'en'], 'contactName', 'contactEmail', 'country']) {
            expect(refused.body).toHaveProperty(field);
        }

        // Control: the same add, the fields filled, is stored under the path
        // the refused one left free; removed again at once.
        const added = await admin.post('contexts', {
            ...empty,
            name: {en: 'Empty Fields Review'},
            contactName: 'Ada Lane',
            contactEmail: 'ada.lane@example.test',
            country: 'CA',
        });
        try {
            expect(added.status).toBe(200);
            expect(added.body).toMatchObject({urlPath: path, name: {en: 'Empty Fields Review'}});
        } finally {
            if (added.body?.id) {
                await admin.delete(`contexts/${added.body.id}`);
            }
        }
    });

    test('API2: A journal removed through the API is gone, its accounts kept', async ({scratch, apiAs}) => {
        const j = await scratch();
        const id = j.seeded.contextId;
        const admin = await apiAs('admin', {context: 'index'});

        const removed = await admin.delete(`contexts/${id}`);
        expect(removed.status).toBe(200);
        expect(removed.body).toMatchObject({id, urlPath: j.path});
        expect((await admin.get(`contexts/${id}`)).status).toBe(404);

        // The journal's manager keeps the account: a session still opens.
        const manager = await apiAs(j.user('mg'), {context: 'index'});
        expect(manager.csrfToken).toBeTruthy();

        expect((await admin.delete('contexts/999999999')).status).toBe(404);
    });

    test('API3: A journal\'s manager lists the enabled journals alone', async ({scratch, apiAs}) => {
        // Both journals carry one word in their initials, which the list's
        // search reads (it does not read the name: A13).
        const word = `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
        const open = await scratch({context: {acronym: word}});
        const closed = await scratch({context: {acronym: word, enabled: false}});
        const manager = await open.as('mg');

        const enabled = await manager.get('contexts', {isEnabled: true, searchPhrase: word});
        expect(enabled.status).toBe(200);
        expect(paths(enabled)).toEqual([open.path]);
        expect(enabled.body.itemsMax).toBe(1);

        // Asked for every journal, the disabled ones included: refused.
        expect((await manager.get('contexts', {searchPhrase: word})).status).toBe(403);

        // Control: the Site Administrator's list holds both.
        const admin = await apiAs('admin', {context: 'index'});
        const all = await admin.get('contexts', {searchPhrase: word});
        expect(paths(all)).toEqual([open.path, closed.path].sort());
    });
});
