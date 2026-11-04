// Kept check for the PR review of pkp/ui-library#1042 (pkp/pkp-lib#13715; spec U30, register A5), beside the A5 walk
// (checks/issues/request-author-response-empty-field-generic-error/walk.js). On PKP's default dataset, dbarnes on the
// ready round's "Request Author Response" page (OJS submission 10, OMP 16):
//   x1 both "Subject" and "Message" emptied, "Submit Request";
//   x2 a subject typed back: its message goes, the one under "Message" stays;
//   x3 an attachment the server refuses (the POST's `attachments` rewritten to an unknown temporary file);
//   x4 a refused field the composer has no place for (the POST's `locale` emptied) together with an empty subject;
//   x5 the fields filled again and sent: the request goes out.
// Run: PROBE_FEATURE=<dataset fleet feature> PROBE_AGENT=<id> node bin/probe.js all shared/playwright/checks/sync/ui-library-1042/extra.js
const {forEachApp, launch, signIn, record, note, serverLog} = require('../../../probe');
const K = require('../../issues/request-author-response-empty-field-generic-error/lib.js');

const SUBJECT = 'Request For Author Response To Reviewer Feedback';
const CASES = {ojs: {ready: 10, author: 'jnovak', fromButton: true}, omp: {ready: 16, author: 'mpower', fromButton: false}};

forEachApp(async (app) => {
    const c = CASES[app.name];
    if (!c) return;
    const facts = {app: app.name, line: app.line || 'main', submission: c.ready};
    const step = async (key, fn) => {
        try {
            facts[key] = await fn();
        } catch (e) {
            facts[key] = {error: K.flat(e.message, 400)};
            note(`ui-library#1042 extra (${app.name}): step ${key} failed: ${K.flat(e.message, 200)}`);
        }
        return facts[key];
    };
    const log = serverLog(app);
    const from = log.mark();
    const since = new Date();
    const host = new URL(app.baseURL).host;
    const mails = () => app.mail.count({to: `${c.author}@mailinator.com`, subject: SUBJECT, contains: host, since});
    const {page} = await launch(app);
    await signIn(page, 'dbarnes');
    let rewrite = null;
    await page.route(/authorResponse\/requestResponse/, async (route) => {
        if (route.request().method() !== 'POST' || !rewrite) return route.continue();
        const body = JSON.parse(route.request().postData() || '{}');
        return route.continue({postData: JSON.stringify(rewrite(body))});
    });
    const open = async () => {
        const round = await K.openWorkflowRound(page, app, c.ready);
        if (c.fromButton) await K.openRequestFromButton(page);
        else await K.openRequestByAddress(page, app, c.ready, round);
        return round;
    };

    await step('x1-both-empty', async () => {
        const round = await open();
        await K.clearSubject(page);
        await K.clearMessage(page);
        return {round, ...(await K.submit(page, 'x1-both-empty'))};
    });
    await step('x2-subject-back', async () => {
        await K.dismiss(page); // the base's dialog, if open
        await K.typeSubject(page, SUBJECT);
        return K.readPage(page);
    });
    await step('x3-attachment-refused', async () => {
        await open();
        rewrite = (b) => ({...b, attachments: [{name: 'missing.pdf', temporaryFileId: 999999}]});
        const out = await K.submit(page, 'x3-attachment-refused');
        rewrite = null;
        out.attachmentError = K.flat(await page.locator('.pkpFieldError').allInnerTexts().catch(() => []).then((a) => a.join(' | ')), 300);
        return out;
    });
    await step('x4-locale-and-subject', async () => {
        await open();
        await K.clearSubject(page);
        rewrite = (b) => ({...b, locale: ''});
        const out = await K.submit(page, 'x4-locale-and-subject');
        rewrite = null;
        out.afterOk = await K.dismiss(page);
        return out;
    });
    await step('x5-filled-and-sent', async () => {
        await K.typeSubject(page, SUBJECT);
        const out = await K.submit(page, 'x5-filled-and-sent');
        await K.sleep(3000);
        out.mails = await mails().catch((e) => `mail read failed: ${e.message}`);
        return out;
    });
    facts.serverLog = log.since(from);
    record('i1042-extra', facts);
});
