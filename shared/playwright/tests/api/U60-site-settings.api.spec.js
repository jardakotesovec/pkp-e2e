/**
 * Site settings through the API (docs/specs/U60-site-settings.md "Through
 * the API"). Who may call the site routes is U61's Administration grid,
 * checked by the matrix (docs/process/api.md), never here. Reads only: the
 * site's settings are shared by every test on the install.
 */
const {test, expect} = require('../../support/base-test.js');

test.describe('site settings through the API', () => {
    test('API1: The site\'s settings and theme read through the API', async ({apiAs}) => {
        const admin = await apiAs('admin', {context: 'index'});

        const site = await admin.get('site');
        expect(site.status).toBe(200);
        expect(site.body.supportedLocales).toContain(site.body.primaryLocale);
        expect(Number.isInteger(site.body.minPasswordLength)).toBe(true);
        expect(site.body.minPasswordLength).toBeGreaterThanOrEqual(4);

        const theme = await admin.get('site/theme');
        expect(theme.status).toBe(200);
        expect(theme.body.themePluginPath).toBe(site.body.themePluginPath);
        expect(Object.keys(theme.body)).toEqual(expect.arrayContaining(['baseColour', 'typography']));
    });
});
