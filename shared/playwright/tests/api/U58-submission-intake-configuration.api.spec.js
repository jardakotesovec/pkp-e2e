/**
 * Submission intake configuration through the API
 * (docs/specs/U58-submission-intake-configuration.md "Through the API").
 * Who may read the components is the spec's grid's, checked by the matrix
 * (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

test.describe('submission intake configuration through the API', () => {
    test('API1: One component read alone is the one the list shows', async ({scratch}) => {
        const j = await scratch({users: {au: 'author'}});
        const api = await j.as('au');
        const list = (await api.get('genres')).body;
        expect(list.items.length).toBeGreaterThan(0);
        expect(list.itemsMax).toBe(list.items.length);

        for (const item of list.items) {
            const one = await api.get(`genres/${item.id}`);
            expect(one.status, item.key).toBe(200);
            expect(one.body, item.key).toEqual(item);
        }

        // A number no component has.
        expect((await api.get('genres/999999999')).status).toBe(404);
    });
});
