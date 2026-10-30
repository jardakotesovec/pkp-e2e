/**
 * Categories through the API (docs/specs/U16-categories.md "Through the
 * API"). Who may call the categories routes is the spec's categories grid,
 * checked by the matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

/** The tree the list answers, as `{path: parent path or null}`. */
async function tree(api) {
    const res = await api.get('categories');
    expect(res.status).toBe(200);
    const parents = {};
    const walk = (items, parent) => {
        for (const category of items || []) {
            parents[category.path] = parent;
            walk(category.subCategories, category.path);
        }
    };
    walk(res.body, null);
    return parents;
}

const idOf = (j, path) => j.seeded.categories.find((c) => c.path === path).id;

/** An edit as the window sends it: the category's name and path, and a parent. */
const edit = (api, j, path, parentPath) =>
    api.put(`categories/${idOf(j, path)}`, {title: {en: path}, path, parentCategoryId: idOf(j, parentPath)});

test.describe('categories through the API', () => {
    test('API1: A category cannot be placed under itself or its own sub-category', async ({scratch}) => {
        const j = await scratch({
            categories: [
                {path: 'science', title: 'Science', children: [{path: 'physics', title: 'Physics', children: [{path: 'optics', title: 'Optics'}]}]},
                {path: 'arts', title: 'Arts'},
            ],
        });
        const api = await j.as('mg');
        const before = await tree(api);
        expect(before).toEqual({science: null, physics: 'science', optics: 'physics', arts: null});

        const underOwnChild = await edit(api, j, 'science', 'optics');
        expect(underOwnChild.status).toBe(400);
        const underItself = await edit(api, j, 'science', 'science');
        expect(underItself.status).toBe(400);
        expect(await tree(api)).toEqual(before);

        // Control: under another branch's sub-category it moves.
        expect((await edit(api, j, 'arts', 'physics')).status).toBe(200);
        expect(await tree(api)).toEqual({...before, arts: 'physics'});
    });

    test("API2: A sub-category under another journal's category is refused", async ({scratch}) => {
        const own = await scratch({categories: [{path: 'ours', title: 'Ours'}]});
        const other = await scratch({categories: [{path: 'theirs', title: 'Theirs'}]});
        const api = await own.as('mg');
        const theirs = idOf(other, 'theirs');

        const added = await api.post('categories', {title: {en: 'Stray'}, path: 'stray', parentCategoryId: theirs});
        expect(added.status).toBe(404);
        const moved = await api.put(`categories/${idOf(own, 'ours')}`, {title: {en: 'Ours'}, path: 'ours', parentCategoryId: theirs});
        expect(moved.status).toBe(404);
        expect(await tree(api)).toEqual({ours: null});
        expect(await tree(await other.as('mg'))).toEqual({theirs: null});

        // Control: the same add under the journal's own category is stored there.
        expect((await api.post('categories', {title: {en: 'Stray'}, path: 'stray', parentCategoryId: idOf(own, 'ours')})).status).toBe(200);
        expect(await tree(api)).toEqual({ours: null, stray: 'ours'});
    });
});
