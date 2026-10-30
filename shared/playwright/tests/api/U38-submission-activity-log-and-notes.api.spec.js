/**
 * Submission activity log through the API
 * (docs/specs/U38-submission-activity-log-and-notes.md "Through the API").
 * Who may read one sent email is the spec's grid's, checked by the matrix
 * (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');

/** lib/pkp Decision: "Decline Submission" on the Submission stage, a preprint server's Production. */
const INITIAL_DECLINE = 8;

test.describe('submission activity log through the API', () => {
    test('API1: A sent letter reads back as it was sent', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author'}});
        const {submissionId} = await j.submission('s', {submitter: 'au'});
        const editor = await j.as('mg');
        const author = await j.as('au');
        const letter = {id: 'notifyAuthors', subject: 'Letter read back', body: '<p>The letter as it was sent.</p>', locale: 'en'};
        expect((await editor.post(`submissions/${submissionId}/decisions`, {decision: INITIAL_DECLINE, actions: [letter]})).status).toBe(200);
        const listed = (await author.get('emails/authorEmails', {submissionId})).body;
        expect(listed).toHaveLength(1);

        // The submitter, its recipient, and the manager read the same letter by its number.
        for (const reader of [author, editor]) {
            const read = await reader.get(`emails/${listed[0].id}`);
            expect(read.status, reader.username).toBe(200);
            expect(read.body, reader.username).toMatchObject({id: listed[0].id, assocId: submissionId, subject: letter.subject, body: letter.body});
            expect(read.body.recipients, reader.username).toContain(j.user('au'));
        }

        // A number no email has.
        expect((await editor.get('emails/999999999')).status).toBe(404);
    });
});
