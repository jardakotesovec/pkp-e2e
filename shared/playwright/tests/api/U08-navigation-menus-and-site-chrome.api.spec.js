/**
 * Navigation menus through the API (docs/specs/U08-navigation-menus-and-site-chrome.md
 * "Through the API"). Who may call the navigation menus routes is the
 * spec's navigation-menus grid, checked by the matrix (docs/process/api.md),
 * never here.
 */
const {test, expect} = require('../../support/base-test.js');

test.describe('navigation menus through the API', () => {
    test('API1: A menu\'s title cannot be emptied', async ({scratch}) => {
        const api = await (await scratch()).as('mg');

        const empty = await api.post('navigationMenus', {title: ''});
        expect(empty.status).toBe(422);
        expect(empty.body).toHaveProperty('title');

        const added = await api.post('navigationMenus', {title: 'Partners'});
        expect(added.status).toBe(201);
        const id = added.body.id;

        for (const title of ['', '   ']) {
            // Ignored (200, the title kept) or refused (422): never stored.
            const saved = await api.put(`navigationMenus/${id}`, {title});
            expect([200, 422]).toContain(saved.status);
            if (saved.status === 200) {
                expect(saved.body.title).toBe('Partners');
            }
        }

        // Control: a new title is stored.
        const renamed = await api.put(`navigationMenus/${id}`, {title: 'Our partners'});
        expect(renamed.status).toBe(200);
        expect(renamed.body.title).toBe('Our partners');
    });
});
