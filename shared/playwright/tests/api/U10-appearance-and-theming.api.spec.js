/**
 * The journal's theme through the API (docs/specs/U10-appearance-and-theming.md
 * "Through the API"). Who may call the theme routes is the spec's theme
 * grid, checked by the matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

test.describe('the theme through the API', () => {
    test('API1: The theme and its fields read back', async ({scratch}) => {
        const j = await scratch();
        const api = await j.as('mg');
        const route = `contexts/${j.seeded.contextId}/theme`;

        const before = await api.get(route);
        expect(before.status).toBe(200);
        expect(before.body.themePluginPath).toBe('default');
        expect(before.body).toHaveProperty('typography');

        const saved = await api.put(route, {themePluginPath: 'default', typography: 'lato', baseColour: '#123456'});
        expect(saved.status).toBe(200);

        const after = await api.get(route);
        expect(after.status).toBe(200);
        expect(after.body).toMatchObject({themePluginPath: 'default', typography: 'lato', baseColour: '#123456'});
    });

    test('API2: A theme the install lacks is refused', async ({scratch}) => {
        const j = await scratch();
        const api = await j.as('mg');
        const route = `contexts/${j.seeded.contextId}/theme`;

        const refused = await api.put(route, {themePluginPath: 'nosuchtheme'});
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty('themePluginPath');
        expect((await api.get(route)).body.themePluginPath).toBe('default');

        // Control: the theme the journal uses saves.
        expect((await api.put(route, {themePluginPath: 'default'})).status).toBe(200);
    });
});
