/**
 * Review setup & review forms through the API
 * (docs/specs/U29-review-setup-and-review-forms.md "Through the API").
 * Who may call the recommendations routes is the spec's grids', checked by
 * the matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');
const {RECOMMENDATION_TYPE} = require('../../support/pkp-ids.js');

const ROUTE = 'reviewers/recommendations';
const titles = (res) => res.body.items.map((r) => r.title.en).sort();

test.describe('review setup & review forms through the API', () => {
    test.beforeEach(async ({appContext}) => {
        test.skip(!appContext.capabilities.hasIssues, 'only a journal has reviewer recommendations (a {OJS} feature, gated as the GLOSSARY maps {OJS})');
    });

    test('API1: A recommendation without a title, a known type or a status is refused', async ({scratch}) => {
        const j = await scratch();
        const api = await j.as('mg');
        const before = titles(await api.get(ROUTE));
        const entry = {title: {en: 'Needs a native speaker'}, type: RECOMMENDATION_TYPE.REVISIONS_REQUESTED, status: true};

        for (const [field, value] of [['title', undefined], ['title', {en: ''}], ['type', undefined], ['type', 0], ['type', 5], ['type', 'approved'], ['status', undefined], ['status', 'yes']]) {
            const body = {...entry, [field]: value};
            if (value === undefined) {
                delete body[field];
            }
            const refused = await api.post(ROUTE, body);
            expect(refused.status, `${field} ${JSON.stringify(value)}`).toBe(422);
            // The error names the field, or its language (`title.en`).
            expect(Object.keys(refused.body).map((key) => key.split('.')[0]), `${field} ${JSON.stringify(value)}`).toContain(field);
        }
        expect(titles(await api.get(ROUTE))).toEqual(before);

        // Control: the whole entry is stored and listed.
        const added = await api.post(ROUTE, entry);
        expect(added.status).toBe(200);
        expect(added.body).toMatchObject({title: {en: 'Needs a native speaker'}, type: RECOMMENDATION_TYPE.REVISIONS_REQUESTED, status: 1, removable: true});
        expect(titles(await api.get(ROUTE))).toEqual([...before, 'Needs a native speaker'].sort());
    });

    test('API2: A recommendation in use is neither edited nor deleted', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author', rv: 'externalReviewer'}});
        await j.submission('s', {
            submitter: 'au',
            decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: [{username: j.user('rv'), status: 'completed', recommendation: 'accept'}]}],
        });
        const api = await j.as('mg');
        const used = (await api.get(ROUTE)).body.items.filter((r) => !r.removable);
        expect(used).toHaveLength(1);
        const {id, title} = used[0];

        const edit = await api.put(`${ROUTE}/${id}`, {title: {en: 'Renamed'}, type: RECOMMENDATION_TYPE.APPROVED, status: true});
        expect(edit.status).toBe(406);
        const remove = await api.delete(`${ROUTE}/${id}`);
        expect(remove.status).toBe(406);
        expect((await api.get(`${ROUTE}/${id}`)).body).toMatchObject({title, status: 1});

        // Control: its "Activate" tick still works, both ways.
        const off = await api.put(`${ROUTE}/${id}/status`, {status: false});
        expect(off.status).toBe(200);
        expect(off.body.status).toBe(0);
        expect((await api.put(`${ROUTE}/${id}/status`, {status: true})).body.status).toBe(1);
    });

    test('API3: An add naming another journal lands in this one', async ({scratch}) => {
        const own = await scratch();
        const other = await scratch();
        const ours = await own.as('mg');
        const theirs = await other.as('mg');
        const theirsBefore = titles(await theirs.get(ROUTE));

        const added = await ours.post(ROUTE, {title: {en: 'Placed here'}, type: RECOMMENDATION_TYPE.APPROVED, status: true, contextId: other.seeded.contextId});
        expect(added.status).toBe(200);
        expect(added.body.contextId).toBe(own.seeded.contextId);
        expect(titles(await ours.get(ROUTE))).toContain('Placed here');
        expect(titles(await theirs.get(ROUTE))).toEqual(theirsBefore);
    });
});
