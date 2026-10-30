/**
 * Roles configuration through the API (docs/specs/U54-roles-configuration.md
 * "Through the API"). Who may call the roles list is the spec's roles-list
 * grid, checked by the matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');
const {ROLE} = require('../../support/pkp-ids.js');

test.describe('roles through the API', () => {
    test('API1: An author reads each role by its name and level alone', async ({scratch}) => {
        const j = await scratch({
            users: {mg: 'manager', au: 'author'},
            customRoles: [{key: 'curator', level: 'assistant', name: 'Data curator', abbrev: 'DC'}],
        });
        const res = await (await j.as('au')).get('userGroups');
        expect(res.status).toBe(200);
        expect(res.body.items.length).toBeGreaterThan(1);
        expect(res.body.itemsMax).toBe(res.body.items.length);
        for (const role of res.body.items) {
            expect(Object.keys(role).sort(), role.name).toEqual(['id', 'isDefault', 'name', 'roleId']);
        }
        const curator = res.body.items.find((r) => r.name === 'Data curator');
        expect(curator).toEqual({id: j.seeded.customRoles.find((r) => r.key === 'curator').id, roleId: ROLE.ASSISTANT, isDefault: false, name: 'Data curator'});
    });

    test('API2: Roles filtered by permission level', async ({scratch}) => {
        const j = await scratch();
        const api = await j.as('mg');
        const all = (await api.get('userGroups')).body.items;
        const of = (level) => all.filter((r) => r.roleId === level).map((r) => r.id).sort();
        expect(of(ROLE.ASSISTANT).length).toBeGreaterThan(0);

        const assistants = await api.get('userGroups', {roleIds: ROLE.ASSISTANT});
        expect(assistants.status).toBe(200);
        expect(assistants.body.items.map((r) => r.id).sort()).toEqual(of(ROLE.ASSISTANT));

        const two = await api.get('userGroups', {roleIds: `${ROLE.ASSISTANT},${ROLE.SUB_EDITOR}`});
        expect(two.body.items.map((r) => r.id).sort()).toEqual([...of(ROLE.ASSISTANT), ...of(ROLE.SUB_EDITOR)].sort());
    });
});
