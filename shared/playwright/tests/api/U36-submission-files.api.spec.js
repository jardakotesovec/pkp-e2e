/**
 * Submission files through the API
 * (docs/specs/U36-submission-files.md "Through the API").
 * Who may call the files routes is the spec's grids', checked by the
 * matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

/** The file stages the lists use (lib/pkp SubmissionFile). */
const STAGE = {submission: 2, note: 3, reviewAttachment: 5, draft: 6, copyedited: 9, query: 18};

/** A file uploaded through the files API as `api`, as a list's "Upload" sends it. */
async function upload(api, submissionId, fields) {
    return api.upload(`submissions/${submissionId}/files`, {file: {name: 'chapter.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 U36')}, ...fields});
}

test.describe('submission files through the API', () => {
    test('API1: A file list that names no list holds only the reader\'s own stages', async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasCopyediting, 'a preprint server has no Copyediting stage');
        const j = await scratch({users: {mg: 'manager', au: 'author', ce: 'copyeditor'}});
        const s = await j.submission('s', {
            submitter: 'au',
            files: [{file: 'article.pdf'}],
            decisions: ['skipExternalReview'],
            participants: [{username: j.user('ce'), role: 'copyeditor'}],
        });
        const manager = await j.as('mg');
        const submissionFile = s.files[0].submissionFileId;
        const draft = await upload(manager, s.submissionId, {fileStage: String(STAGE.draft)});
        const copyedited = await upload(manager, s.submissionId, {fileStage: String(STAGE.copyedited)});
        expect([draft.status, copyedited.status]).toEqual([200, 200]);
        const list = `submissions/${s.submissionId}/files`;
        const ids = async (api, params) => {
            const res = await api.get(list, params);
            expect(res.status).toBe(200);
            return res.body.items.map((f) => f.id).sort((a, b) => a - b);
        };

        // The Copyeditor: Copyediting's two lists, not "Submission Files".
        const copyeditor = await j.as('ce');
        expect(await ids(copyeditor)).toEqual([draft.body.id, copyedited.body.id]);
        expect((await copyeditor.get(list, {fileStages: STAGE.submission})).status).toBe(403);

        // The Author: "Submission Files" and "Copyedited Files", not "Draft Files".
        expect(await ids(await j.as('au'))).toEqual([submissionFile, copyedited.body.id]);

        // Control: the Journal Manager lists all three.
        expect(await ids(manager)).toEqual([submissionFile, draft.body.id, copyedited.body.id]);
    });

    test('API2: Discussion files and review attachments are not added through the files list', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const s = await j.submission('s', {submitter: 'au'});
        const api = await j.as('mg');

        for (const fileStage of [STAGE.note, STAGE.reviewAttachment, STAGE.query]) {
            const refused = await upload(api, s.submissionId, {fileStage: String(fileStage)});
            expect(refused.status, `file stage ${fileStage}`).toBe(400);
            expect(refused.body, `file stage ${fileStage}`).toHaveProperty('error');
        }

        // Control: the same upload to "Submission Files" is stored and listed.
        const added = await upload(api, s.submissionId, {fileStage: String(STAGE.submission)});
        expect(added.status).toBe(200);
        expect((await api.get(`submissions/${s.submissionId}/files`)).body.items.map((f) => f.id)).toEqual([added.body.id]);
    });

    test('API3: An edit does not move a file to another list or item', async ({scratch, appContext}) => {
        test.skip(!appContext.capabilities.hasCopyediting, 'a preprint server has no workflow file lists');
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const s = await j.submission('s', {submitter: 'au', files: [{file: 'article.pdf'}]});
        const api = await j.as('mg');
        const route = `submissions/${s.submissionId}/files/${s.files[0].submissionFileId}`;
        const before = (await api.get(route, {stageId: 1})).body;
        expect([before.fileStage, before.assocType, before.assocId]).toEqual([STAGE.submission, null, null]);

        const moved = await api.call('PUT', `${route}?stageId=1`, {data: {name: {en: 'Moved manuscript'}, fileStage: STAGE.copyedited}});
        expect(moved.status).toBe(200);
        const attached = await api.call('PUT', `${route}?stageId=1`, {data: {assocType: 521, assocId: 1}});
        expect(attached.status).toBe(200);

        const after = (await api.get(route, {stageId: 1})).body;
        expect(after.name.en).toBe('Moved manuscript');
        expect([after.fileStage, after.assocType, after.assocId]).toEqual([STAGE.submission, null, null]);
        const listed = (await api.get(`submissions/${s.submissionId}/files`, {fileStages: STAGE.submission})).body.items;
        expect(listed.map((f) => f.id)).toEqual([before.id]);
    });
});
