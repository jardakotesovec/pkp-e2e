/**
 * Issues through the API (docs/specs/U50-issues.md "Through the API").
 * Who may call the issues routes is the spec's issues-read and
 * issue-choices grids, checked by the matrix (docs/process/api.md), never
 * here.
 */
const {test, expect} = require('../../support/base-test.js');

const year = new Date().getFullYear();
const names = (res) => res.body.items.map((i) => i.identification).sort();

test.describe('issues through the API', () => {
    test.beforeEach(async ({appContext}) => {
        test.skip(!appContext.capabilities.hasIssues, 'only a journal has issues (Purpose)');
    });

    test('API1: Future issues are listed to the journal\'s managers alone', async ({scratch}) => {
        const j = await scratch({
            users: {mg: 'manager', au: 'author'},
            issues: [{volume: 1, number: '1', year, published: true}, {volume: 2, number: '1', year}],
        });
        const published = `Vol. 1 No. 1 (${year})`;
        const future = `Vol. 2 No. 1 (${year})`;
        const manager = await j.as('mg');
        const author = await j.as('au');

        const all = await manager.get('issues');
        expect(all.status).toBe(200);
        expect(names(all)).toEqual([published, future]);
        expect(all.body.itemsMax).toBe(2);
        expect(names(await manager.get('issues', {isPublished: 0}))).toEqual([future]);

        const authors = await author.get('issues');
        expect(authors.status).toBe(200);
        expect(names(authors)).toEqual([published]);
        expect(authors.body.itemsMax).toBe(1);
        const refused = await author.get('issues', {isPublished: 0});
        expect(refused.status).toBe(403);
        expect(refused.body).not.toHaveProperty('items');
    });

    test('API2: Issues filtered by volume, number and year', async ({scratch}) => {
        const j = await scratch({
            issues: [
                {volume: 1, number: '1', year: 2024, published: true},
                {volume: 1, number: '2', year: 2025, published: true},
                {volume: 2, number: '1', year: 2025, published: true},
            ],
        });
        const api = await j.as('mg');
        const list = async (params) => {
            const res = await api.get('issues', params);
            expect(res.status, JSON.stringify(params)).toBe(200);
            return names(res);
        };

        expect(await list({volumes: 1})).toEqual(['Vol. 1 No. 1 (2024)', 'Vol. 1 No. 2 (2025)']);
        expect(await list({numbers: 1})).toEqual(['Vol. 1 No. 1 (2024)', 'Vol. 2 No. 1 (2025)']);
        expect(await list({years: 2025})).toEqual(['Vol. 1 No. 2 (2025)', 'Vol. 2 No. 1 (2025)']);
        expect(await list({volumes: 1, years: 2025})).toEqual(['Vol. 1 No. 2 (2025)']);
        expect(await list({years: '2024,2025'})).toHaveLength(3);
        expect(await list({volumes: 3})).toEqual([]);
    });

    test('API3: The current issue read on its own', async ({scratch}) => {
        const j = await scratch({
            issues: [
                {volume: 1, number: '1', year, published: true},
                {volume: 1, number: '2', year, published: true},
                {volume: 1, number: '3', year},
            ],
        });
        const api = await j.as('mg');
        const [, second] = j.seeded.issues;

        const current = await api.get('issues/current');
        expect(current.status).toBe(200);
        expect(current.body.id).toBe(second.id);
        expect(current.body.identification).toBe(`Vol. 1 No. 2 (${year})`);

        const one = await api.get(`issues/${second.id}`);
        expect(one.status).toBe(200);
        expect(one.body.id).toBe(second.id);

        const none = await (await (await scratch({issues: [{volume: 1, number: '1', year}]})).as('mg')).get('issues/current');
        expect(none.status).toBe(404);
    });
});
