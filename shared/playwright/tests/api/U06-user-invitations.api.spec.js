/**
 * User invitations through the API (docs/specs/U06-user-invitations.md
 * "Through the API"). Who may call the invitations routes is the
 * invitations grid, checked by the matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

const ROLE_ID_READER = 1048576;
const today = () => new Date().toISOString().slice(0, 10);

/** The context's Reader role, read through its manager's client. */
async function readerRole(api) {
    const groups = await api.get('userGroups');
    expect(groups.status).toBe(200);
    return groups.body.items.find((g) => g.roleId === ROLE_ID_READER).id;
}

/** An invitation being composed for `email`, started by the manager. */
async function draft(api, email) {
    const added = await api.post('invitations/add/userRoleAssignment', {invitationData: {inviteeEmail: email}});
    expect(added.status).toBe(200);
    return added.body.invitationId;
}

test.describe('user invitations through the API', () => {
    test('API1: A role of another journal is refused', async ({scratch}) => {
        const j = await scratch();
        const other = await scratch();
        const api = await j.as('mg');
        const id = await draft(api, `${j.path}in@mail.test`);
        const row = (userGroupId) => ({invitationData: {userGroupsToAdd: [{userGroupId, masthead: false, dateStart: today()}]}});

        const refused = await api.put(`invitations/${id}/populate`, row(await readerRole(await other.as('mg'))));
        expect(refused.status).toBe(422);
        expect(refused.body.errors).toHaveProperty(['userGroupsToAdd.0.userGroupId']);

        // Control: this journal's own Reader role is saved.
        const own = await readerRole(api);
        const saved = await api.put(`invitations/${id}/populate`, row(own));
        expect(saved.status).toBe(200);
        expect(saved.body.userGroupsToAdd.map((g) => g.userGroupId)).toEqual([own]);
    });

    test('API2: A disabled user cannot be invited', async ({scratch}) => {
        const j = await scratch();
        const api = await j.as('mg');
        const people = await j.another('u', {users: {du: {roles: ['author'], disabled: true}, au: 'author'}});

        const refused = await api.post('invitations/add/userRoleAssignment', {invitationData: {userId: people.id('du')}});
        expect(refused.status).toBe(422);
        expect(refused.body.errors).toHaveProperty('userId');

        // Control: the active user's invitation is started.
        const started = await api.post('invitations/add/userRoleAssignment', {invitationData: {userId: people.id('au')}});
        expect(started.status).toBe(200);
        expect(started.body.invitationId).toBeTruthy();
    });

    test('API3: Declining through the API', async ({scratch, pkpMail}) => {
        const j = await scratch();
        const api = await j.as('mg');
        const email = `${j.path}dc@mail.test`;
        const id = await draft(api, email);
        const role = await readerRole(api);
        expect((await api.put(`invitations/${id}/populate`, {invitationData: {userGroupsToAdd: [{userGroupId: role, masthead: false, dateStart: today()}]}})).status).toBe(200);
        expect((await api.put(`invitations/${id}/invite`, {})).status).toBe(200);
        const pending = await api.get('invitations/userRoleAssignment');
        expect(pending.body.items.map((i) => i.id)).toEqual([id]);

        const message = await pkpMail.fullMessage((await pkpMail.find({to: email})).ID);
        const key = message.HTML.match(/invitation\/decline\?id=\d+(?:&amp;|&)key=([^'"&<\s]+)/)[1];
        const anon = await j.as(null);

        const declined = await anon.put(`invitations/${id}/key/${key}/decline`, {});
        expect(declined.status).toBe(200);
        expect(declined.body.status).toBe('DECLINED');
        expect((await api.get('invitations/userRoleAssignment')).body.itemsMax).toBe(0);

        // The key afterwards: read and accept are refused (Rule 4).
        expect((await anon.get(`invitations/${id}/key/${key}`)).status).toBe(401);
        expect((await anon.put(`invitations/${id}/key/${key}/finalize`, {})).status).toBe(401);
    });

    test('API4: A reviewer role\'s masthead choice cannot be changed', async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasReviewStage, 'a preprint server has no reviewer role');
        const j = await scratch({users: {mg: 'manager', me: ['author', 'externalReviewer']}});
        const member = j.id('me');
        const api = await j.as('mg');
        const groups = (await api.get(`users/${member}`)).body.groups;
        const roleOf = (roleId) => groups.find((g) => g.roleId === roleId);

        const reviewer = roleOf(4096);
        const refused = await api.put(`users/${member}/masthead/${reviewer.userUserGroupId}`, {masthead: reviewer.masthead});
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty('error');

        // Control: the Author role's choice, sent unchanged.
        const author = roleOf(65536);
        const answered = await api.put(`users/${member}/masthead/${author.userUserGroupId}`, {masthead: author.masthead});
        expect(answered.status).toBe(200);
        expect(answered.body.groups.find((g) => g.roleId === 65536).masthead).toBe(author.masthead);
    });
});
