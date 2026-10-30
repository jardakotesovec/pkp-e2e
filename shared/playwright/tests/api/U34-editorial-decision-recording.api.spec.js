/**
 * Editorial decision recording through the API
 * (docs/specs/U34-editorial-decision-recording.md "Through the API").
 * Who may call the decision routes is the spec's grids', checked by the
 * matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

/** lib/pkp Decision and the workflow stages the checks name. */
const DECISION = {accept: 2, sendToProduction: 7, initialDecline: 8, returnToWorkflow: 34, returnToDone: 35};
const STAGE = {copyediting: 4, production: 5, done: 6};
const FILE_STAGE = {reviewFile: 4, copyedited: 9, productionReady: 11};

const ISSUE = {volume: 1, number: '1', year: 2026};

/**
 * A scratch context with a manager and an author, and a published issue
 * on a journal so a submission can be published in it.
 */
async function context(scratch, appContext) {
    const journal = appContext.capabilities.hasIssues;
    const j = await scratch({users: {mg: 'manager', au: 'author'}, ...(journal ? {issues: [{...ISSUE, published: true}]} : {})});
    return {j, published: journal ? {published: true, issue: ISSUE} : {published: true}};
}

/** A submission past review on a journal or press (Copyediting); a preprint server's waits in Production. */
function pastReview(appContext) {
    return appContext.capabilities.hasReviewStage ? {decisions: ['sendExternalReview', 'accept']} : {};
}

/** The decision of a submission's active stage that the checks record. */
function stageDecision(stageId) {
    return {[STAGE.copyediting]: DECISION.sendToProduction, [STAGE.production]: DECISION.initialDecline}[stageId];
}

test.describe('editorial decision recording through the API', () => {
    test('API1: A decision of another stage, or of no known type, is refused', async ({scratch, appContext}) => {
        const {j} = await context(scratch, appContext);
        const s = await j.submission('s', {submitter: 'au', ...pastReview(appContext)});
        const api = await j.as('mg');
        const route = `submissions/${s.submissionId}/decisions`;
        const before = (await api.get(route)).body;
        const stageId = (await api.get(`submissions/${s.submissionId}`)).body.stageId;

        // Refused by the wizard's own checks, with the reason the access-denied page prints.
        for (const [body, reason] of [
            [{decision: DECISION.returnToWorkflow}, 'editor.submission.workflowDecision.invalidStage'],
            [{decision: 999}, 'editor.submission.workflowDecision.typeInvalid'],
            [{}, 'editor.submission.workflowDecision.typeInvalid'],
        ]) {
            const refused = await api.post(route, body);
            expect(refused.status, JSON.stringify(body)).toBe(401);
            expect(refused.body.error, JSON.stringify(body)).toBe(reason);
        }
        expect((await api.get(route)).body).toEqual(before);
        expect((await api.get(`submissions/${s.submissionId}`)).body.stageId).toBe(stageId);

        // Control: the active stage's own decision is recorded.
        const recorded = await api.post(route, {decision: stageDecision(stageId)});
        expect(recorded.status).toBe(200);
        expect((await api.get(route)).body).toHaveLength(before.length + 1);
    });

    test('API2: The decisions list filters by type, stage and editor, and names the caller', async ({scratch, appContext}) => {
        const {j} = await context(scratch, appContext);
        const decisions = appContext.capabilities.hasReviewStage ? ['sendExternalReview', 'accept'] : ['decline', 'revertDecline'];
        const s = await j.submission('s', {submitter: 'au', decisions});
        const api = await j.as('mg');
        const route = `submissions/${s.submissionId}/decisions`;
        const all = (await api.get(route)).body;
        expect(all).toHaveLength(2);
        const ids = (list) => list.map((d) => d.id).sort((a, b) => a - b);
        const matching = (key, value) => ids(all.filter((d) => d[key] === value));

        const [first] = all;
        const byType = await api.get(route, {decisionTypes: first.decision});
        expect(byType.status).toBe(200);
        expect(ids(byType.body)).toEqual(matching('decision', first.decision));
        expect(ids((await api.get(route, {stageId: first.stageId})).body)).toEqual(matching('stageId', first.stageId));
        expect(ids((await api.get(route, {editorIds: first.editorId})).body)).toEqual(matching('editorId', first.editorId));
        expect((await api.get(route, {decisionTypes: DECISION.returnToDone})).body).toEqual([]);

        // A decision naming another editor is recorded as the caller's.
        const stageId = (await api.get(`submissions/${s.submissionId}`)).body.stageId;
        const recorded = await api.post(route, {decision: stageDecision(stageId), editorId: j.id('au')});
        expect(recorded.status).toBe(200);
        expect(recorded.body.editorId).toBe(j.id('mg'));
        expect(ids((await api.get(route, {editorIds: j.id('au')})).body)).toEqual([]);
    });

    test('API3: "Return to Done" is refused where the header does not offer it', async ({scratch, appContext}) => {
        const {j, published} = await context(scratch, appContext);
        const api = await j.as('mg');
        const read = async (s) => {
            const submission = (await api.get(`submissions/${s.submissionId}`)).body;
            const decisions = (await api.get(`submissions/${s.submissionId}/decisions`)).body;
            return {stageId: submission.stageId, returns: decisions.filter((d) => d.decision === DECISION.returnToDone).length};
        };
        const refuse = async (s) => {
            const before = await read(s);
            const refused = await api.post(`submissions/${s.submissionId}/returnToDone`, {});
            expect(refused.status).toBe(403);
            expect(await read(s)).toEqual(before);
        };
        const returned = async (suffix) => {
            const s = await j.submission(suffix, {submitter: 'au', ...pastReview(appContext), ...published});
            expect((await api.post(`submissions/${s.submissionId}/decisions`, {decision: DECISION.returnToWorkflow})).status).toBe(200);
            return s;
        };

        // In Done already.
        await refuse(await j.submission('d', {submitter: 'au', ...pastReview(appContext), ...published}));
        // Never in Done.
        await refuse(await j.submission('n', {submitter: 'au', ...pastReview(appContext)}));
        // Returned to the workflow, then its one version unpublished.
        const unpublished = await returned('u');
        const version = `submissions/${unpublished.submissionId}/publications/${unpublished.publicationId}/unpublish`;
        expect((await api.put(version, {})).status).toBe(200);
        await refuse(unpublished);

        // Control: returned to the workflow and still published, it goes back to Done.
        const control = await returned('c');
        const done = await api.post(`submissions/${control.submissionId}/returnToDone`, {});
        expect(done.status).toBe(200);
        expect(await read(control)).toEqual({stageId: STAGE.done, returns: 1});
    });

    test('API4: A copy to no list, or into another submission\'s review round, is refused', async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasCopyediting, 'a preprint server has no Copyediting stage');
        const {j} = await context(scratch, appContext);
        const s = await j.submission('s', {submitter: 'au', decisions: ['sendExternalReview', 'accept']});
        const other = await j.submission('o', {submitter: 'au', decisions: ['sendExternalReview']});
        const api = await j.as('mg');
        const uploaded = await api.upload(`submissions/${s.submissionId}/files`, {
            file: {name: 'copyedited.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 U34')},
            fileStage: String(FILE_STAGE.copyedited),
        });
        expect(uploaded.status).toBe(200);
        const copy = `submissions/${s.submissionId}/files/${uploaded.body.id}/copy?stageId=${STAGE.copyediting}`;
        const count = async () => (await api.get(`submissions/${s.submissionId}/files`)).body.itemsMax;
        const before = await count();
        const otherRound = (await api.get(`submissions/${other.submissionId}`)).body.reviewRounds.at(-1).id;

        for (const body of [{}, {toFileStage: 99}, {toFileStage: FILE_STAGE.reviewFile, reviewRoundId: otherRound}]) {
            const refused = await api.put(copy, body);
            expect(refused.status, JSON.stringify(body)).toBe(400);
            expect(refused.body, JSON.stringify(body)).toHaveProperty('error');
        }
        expect(await count()).toBe(before);

        // Control: carried to "Production Ready Files", the original kept.
        const copied = await api.put(copy, {toFileStage: FILE_STAGE.productionReady});
        expect(copied.status).toBe(200);
        expect(copied.body).toMatchObject({fileStage: FILE_STAGE.productionReady, name: {en: 'copyedited.pdf'}});
        expect(copied.body.id).not.toBe(uploaded.body.id);
        expect(await count()).toBe(before + 1);
    });
});
