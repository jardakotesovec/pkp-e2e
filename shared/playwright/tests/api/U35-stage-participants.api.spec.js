/**
 * Stage participants through the API (docs/specs/U35-stage-participants.md
 * "Through the API"). Who may read the participants is the spec's grids',
 * checked by the matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

/** The workflow stages a list can name (lib/pkp WORKFLOW_STAGE_ID_*). */
const STAGES = [1, 2, 3, 4, 5];

test.describe('stage participants through the API', () => {
    test('API1: The list of every stage names each participant once', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', se: 'sectionEditor', au: 'author'}});
        const {submissionId} = await j.submission('s', {submitter: 'au', participants: [{username: j.user('se'), role: 'sectionEditor'}]});
        const api = await j.as('mg');
        const route = `submissions/${submissionId}/participants`;
        const ids = (res) => res.body.map((p) => p.id);

        const perStage = new Set();
        for (const stageId of STAGES) {
            const res = await api.get(`${route}/${stageId}`);
            expect(res.status, `stage ${stageId}`).toBe(200);
            ids(res).forEach((id) => perStage.add(id));
        }
        const every = await api.get(route);
        expect(every.status).toBe(200);
        expect(ids(every).sort()).toEqual([...perStage].sort());
        expect(ids(every)).toEqual(expect.arrayContaining([j.id('se'), j.id('au')]));

        // A stage the workflow does not have names no one.
        const none = await api.get(`${route}/99`);
        expect(none.status).toBe(200);
        expect(none.body).toEqual([]);
    });
});
