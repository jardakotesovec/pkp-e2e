/**
 * Tasks & discussions through the API
 * (docs/specs/U37-tasks-and-discussions.md "Through the API"). Who may
 * call the tasks and templates routes is the spec's grids, checked by the
 * matrix (docs/process/api.md), never here. Each item goes on the
 * submission's Copyediting stage, reached by "Accept and Skip Review";
 * a preprint server has Production alone, where a submission starts.
 */
const {test, expect} = require('../../support/base-test.js');
const {ROLE, STAGE, TASK_TYPE} = require('../../support/pkp-ids.js');

/** A journal with a submission on its working stage, and that stage. */
async function stageOf(scratch, appContext, users) {
    const j = await scratch({users: {mg: 'manager', au: 'author', se: 'sectionEditor', ...users}});
    const review = appContext.capabilities.hasReviewStage;
    const s = await j.submission('s', {
        submitter: 'au',
        participants: [{username: j.user('se'), role: 'sectionEditor'}],
        ...(review ? {decisions: ['skipExternalReview']} : {}),
    });
    return {j, stageId: review ? STAGE.EDITING : STAGE.PRODUCTION, base: `submissions/${s.submissionId}`};
}

/** A due date a week from today. */
const nextWeek = () => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

test.describe('tasks and discussions through the API', () => {
    test('API1: A participant "Participants" never offers is refused', async ({scratch, appContext}) => {
        const {j, stageId, base} = await stageOf(scratch, appContext, {xs: 'sectionEditor', xa: 'author', rd: 'reader'});
        const editor = await j.as('se');
        const discussion = (userId) => ({
            type: TASK_TYPE.DISCUSSION,
            title: 'Who may take part',
            stageId,
            description: '<p>Hello</p>',
            participants: [{userId: j.id('se')}, {userId}],
        });

        for (const key of ['xs', 'xa', 'rd']) {
            const refused = await editor.post(`${base}/tasks`, discussion(j.id(key)));
            expect(refused.status, key).toBe(422);
            expect(refused.body, key).toHaveProperty(['participants.1.userId']);
        }
        expect((await (await j.as('mg')).get(`${base}/stages/${stageId}/tasks`)).body.items).toEqual([]);

        // Control: the submitter, assigned to the stage, is offered and kept.
        const added = await editor.post(`${base}/tasks`, discussion(j.id('au')));
        expect(added.status, JSON.stringify(added.body)).toBe(200);
        expect(added.body.participants.map((p) => p.userId).sort()).toEqual([j.id('se'), j.id('au')].sort());
    });

    test('API2: An item or a reply the windows could not send is refused', async ({scratch, appContext}) => {
        const {j, stageId, base} = await stageOf(scratch, appContext, {});
        const editor = await j.as('se');
        const people = (owner) => [
            {userId: j.id('se'), isResponsible: owner === 'se'},
            {userId: j.id('au'), isResponsible: owner === 'au' || owner === 'both'},
        ];
        const task = {type: TASK_TYPE.TASK, title: 'Copyedit', stageId, dateDue: nextWeek(), description: '<p>Please</p>'};

        const twoOwners = await editor.post(`${base}/tasks`, {
            ...task,
            participants: people('au').map((p) => ({...p, isResponsible: true})),
        });
        expect(twoOwners.status).toBe(422);
        expect(twoOwners.body).toHaveProperty('participants');

        const discussion = {type: TASK_TYPE.DISCUSSION, title: 'A word', stageId, description: '<p>Hi</p>'};
        const withDue = await editor.post(`${base}/tasks`, {...discussion, dateDue: nextWeek(), participants: people(null).map(({userId}) => ({userId}))});
        expect(withDue.status).toBe(422);
        expect(withDue.body).toHaveProperty('dateDue');
        const withOwner = await editor.post(`${base}/tasks`, {...discussion, participants: people('au')});
        expect(withOwner.status).toBe(422);
        expect(Object.keys(withOwner.body).join()).toContain('isResponsible');
        expect((await (await j.as('mg')).get(`${base}/stages/${stageId}/tasks`)).body.items).toEqual([]);

        // Control: one owner makes the task; an empty reply in it is refused.
        const kept = await editor.post(`${base}/tasks`, {...task, participants: people('au')});
        expect(kept.status, JSON.stringify(kept.body)).toBe(200);
        const author = await j.as('au');
        for (const contents of ['', '   ']) {
            const reply = await author.post(`${base}/tasks/${kept.body.id}/notes`, {contents});
            expect(reply.status, JSON.stringify(contents)).toBe(422);
            expect(reply.body).toHaveProperty('contents');
        }
        expect((await editor.get(`${base}/tasks/${kept.body.id}`)).body.notes).toHaveLength(1);
    });

    test('API3: A template the template window could not send is refused', async ({scratch, appContext}) => {
        const own = await scratch({users: {mg: 'manager'}});
        const other = await scratch({users: {mg: 'manager'}});
        const stageId = appContext.capabilities.hasReviewStage ? STAGE.EDITING : STAGE.PRODUCTION;
        const authorGroup = async (j) =>
            (await (await j.as('mg')).get('userGroups', {perPage: 100})).body.items.find((g) => g.roleId === ROLE.AUTHOR).id;
        const manager = await own.as('mg');
        const template = {type: TASK_TYPE.DISCUSSION, stageId, title: 'Ask the author', description: '<p>Hi</p>'};
        const before = (await manager.get('editTaskTemplates', {stageId})).body.data.length;

        const noRole = await manager.post('editTaskTemplates', {...template, restrictToUserGroups: true, userGroupIds: []});
        expect(noRole.status).toBe(422);
        expect(noRole.body).toHaveProperty('userGroupIds');
        const theirRole = await manager.post('editTaskTemplates', {...template, restrictToUserGroups: true, userGroupIds: [await authorGroup(other)]});
        expect(theirRole.status).toBe(422);
        expect(theirRole.body).toHaveProperty(['userGroupIds.0']);
        const interval = await manager.post('editTaskTemplates', {...template, type: TASK_TYPE.TASK, dueInterval: 'P5D'});
        expect(interval.status).toBe(422);
        expect(interval.body).toHaveProperty('dueInterval');
        expect((await manager.get('editTaskTemplates', {stageId})).body.data).toHaveLength(before);

        // Control: limited to this journal's Author role, it is kept.
        const kept = await manager.post('editTaskTemplates', {...template, restrictToUserGroups: true, userGroupIds: [await authorGroup(own)]});
        expect(kept.status, JSON.stringify(kept.body)).toBe(200);
        expect(kept.body.userGroups.map((g) => g.id)).toEqual([await authorGroup(own)]);
    });
});
