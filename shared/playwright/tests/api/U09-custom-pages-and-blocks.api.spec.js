/**
 * Picture uploads through the API (docs/specs/U09-custom-pages-and-blocks.md
 * "Through the API"). Who may call the upload route is the spec's
 * picture-upload grid, checked by the matrix (docs/process/api.md), never
 * here.
 */
const {test, expect} = require('../../support/base-test.js');

// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test.describe('picture uploads through the API', () => {
    test('API1: A file name with folder parts stays in the account\'s own folder', async ({scratch, request}) => {
        const j = await scratch();
        const api = await j.as('mg');
        const folder = `/public/site/images/${j.user('mg')}/`;

        const res = await api.upload('_uploadPublicFile', {file: {name: '../../../escape.png', mimeType: 'image/png', buffer: PNG}});
        expect(res.status).toBe(200);
        const url = new URL(res.body.url);
        expect(url.pathname).toContain(folder);
        const name = url.pathname.slice(url.pathname.indexOf(folder) + folder.length);
        expect(name).not.toContain('/');
        expect(name).toMatch(/escape\.png$/);

        const served = await request.get(res.body.url);
        expect(served.status()).toBe(200);
        expect(Buffer.from(await served.body()).equals(PNG)).toBe(true);
    });
});
