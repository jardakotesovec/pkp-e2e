/**
 * Sections through the API (docs/specs/U17-sections.md "Through the API").
 * Who may call the sections routes is the spec's sections-read grid,
 * checked by the matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

const SECTIONS = [
    {abbrev: 'ART', title: 'Articles'},
    {abbrev: 'REV', title: 'Reviews'},
    {abbrev: 'ED', title: 'Editorials'},
];

const titles = (res) => res.body.items.map((s) => s.title.en);

test.describe('sections through the API', () => {
    test.beforeEach(async ({appContext}) => {
        test.skip(!appContext.capabilities.hasIssues, 'only a journal has the sections interface (U17 A5)');
    });

    test('API1: The sections listed a page at a time', async ({scratch}) => {
        const api = await (await scratch({sections: SECTIONS})).as('mg');

        const all = await api.get('sections');
        expect(all.status).toBe(200);
        expect(titles(all)).toEqual(['Articles', 'Reviews', 'Editorials']);
        expect(all.body.itemsMax).toBe(3);

        const first = await api.get('sections', {count: 2});
        expect(titles(first)).toEqual(['Articles', 'Reviews']);
        expect(first.body.itemsMax).toBe(3);

        const next = await api.get('sections', {count: 2, offset: 2});
        expect(titles(next)).toEqual(['Editorials']);
        expect(next.body.itemsMax).toBe(3);
    });

    test('API2: One section read on its own', async ({scratch}) => {
        const api = await (await scratch({sections: SECTIONS})).as('mg');
        const listed = (await api.get('sections')).body.items.find((s) => s.title.en === 'Reviews');

        const one = await api.get(`sections/${listed.id}`);
        expect(one.status).toBe(200);
        expect(one.body).toMatchObject({id: listed.id, title: {en: 'Reviews'}, abbrev: {en: 'REV'}});

        const unknown = await api.get('sections/999999999');
        expect(unknown.status).toBe(404);
    });
});
