/**
 * Notify users through the API (docs/specs/U55-notify-users.md "Through the
 * API"). Who may send is the grid the route follows, checked by the matrix
 * (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');
const {ROLE} = require('../../support/pkp-ids.js');

/** The id of the context's Author role, as its manager lists the roles. */
async function authorRole(api) {
    const res = await api.get('userGroups', {roleIds: ROLE.AUTHOR});
    expect(res.status).toBe(200);
    const role = res.body.items.find((r) => r.isDefault);
    expect(role).toBeTruthy();
    return role.id;
}

test.describe('notify users through the API', () => {
    test('API1: A role of another journal is refused', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}, bulkEmails: true});
        const other = await scratch({users: {mg: 'manager', au: 'author'}});
        const api = await j.as('mg');
        const email = {subject: 'Office closed', body: '<p>The office is closed.</p>'};

        const foreign = await api.post('_email', {...email, userGroupIds: [await authorRole(await other.as('mg'))]});
        expect(foreign.status).toBe(400);
        expect(foreign.body).toHaveProperty('userGroupIds');
        expect(foreign.body).not.toHaveProperty('totalBulkJobs');

        // Control: the journal's own Author role is queued, one batch for
        // its one throwaway Author.
        const own = await api.post('_email', {...email, userGroupIds: [await authorRole(api)]});
        expect(own.status).toBe(200);
        expect(own.body).toEqual({totalBulkJobs: 1});
    });
});
