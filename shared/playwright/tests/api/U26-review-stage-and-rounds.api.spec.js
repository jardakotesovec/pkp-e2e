/**
 * Review stage through the API
 * (docs/specs/U26-review-stage-and-rounds.md "Through the API").
 * Who may ask for the author's letters is the spec's grid's, checked by the
 * matrix (docs/process/api.md), never here.
 */
const {test, expect} = require('../../support/base-test.js');
const {DECISION, EMAIL_EVENT} = require('../../support/pkp-ids.js');

test.describe('review stage through the API', () => {
    test('API1: The letters list holds only the letters sent to the caller', async ({scratch}) => {
        const j = await scratch({users: {mg: 'manager', au: 'author', ot: 'author'}});
        // A second journal, where the manager also holds the Author role.
        const second = await j.another('b', {users: {mg: ['manager', 'author'], au: 'author'}});
        const decline = async (editor, submissionId, subject) => {
            const res = await editor.post(`submissions/${submissionId}/decisions`, {
                decision: DECISION.INITIAL_DECLINE, // "Decline Submission" on the Submission stage, a preprint server's Production
                actions: [{id: 'notifyAuthors', subject, body: `<p>${subject}</p>`, locale: 'en'}],
            });
            expect(res.status, JSON.stringify(res.body)).toBe(200);
        };
        const own = (await j.submission('s', {submitter: 'au'})).submissionId;
        const other = (await j.submission('o', {submitter: 'ot'})).submissionId;
        const away = (await second.submission('s', {submitter: 'au'})).submissionId;
        await decline(await j.as('mg'), own, 'Own letter');
        await decline(await j.as('mg'), other, 'Other author letter');
        const managerThere = await second.as('mg');
        await decline(managerThere, away, 'Second journal letter');
        const subjects = (res) => {
            expect(res.status, JSON.stringify(res.body)).toBe(200);
            return res.body.map((email) => email.subject);
        };
        const author = await j.as('au');

        // As the "Notifications" list asks: the submission's editor letters.
        const listed = await author.get('emails/authorEmails', {submissionId: own, eventType: EMAIL_EVENT.EDITOR_NOTIFY_AUTHOR});
        expect(subjects(listed)).toEqual(['Own letter']);
        expect(listed.body[0]).toMatchObject({assocId: own, body: '<p>Own letter</p>'});
        expect(listed.body[0].recipients).toContain(j.user('au'));

        // No submission named: each author's own letters, not the other's.
        // (The second journal's letter is listed too: A15, not asserted.)
        const mine = subjects(await author.get('emails/authorEmails'));
        expect(mine).toContain('Own letter');
        expect(mine).not.toContain('Other author letter');
        expect(subjects(await (await j.as('ot')).get('emails/authorEmails'))).toEqual(['Other author letter']);

        // Naming another author's submission: refused.
        const theirs = await author.get('emails/authorEmails', {submissionId: other, eventType: EMAIL_EVENT.EDITOR_NOTIFY_AUTHOR});
        expect(theirs.status).toBe(401);
        expect(JSON.stringify(theirs.body)).not.toContain('Other author letter');

        // The sender, an Author in the second journal: the letters they sent are not theirs.
        expect(subjects(await managerThere.get('emails/authorEmails'))).toEqual([]);

        // A kind of email no author is sent: a reviewer's review request.
        const refused = await author.get('emails/authorEmails', {eventType: EMAIL_EVENT.REVIEW_NOTIFY_REVIEWER});
        expect(refused.status).toBe(400);
        expect(refused.body).toHaveProperty('error');
    });
});
