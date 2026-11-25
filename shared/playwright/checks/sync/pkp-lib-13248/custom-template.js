// Kept check: PR review of pkp/pkp-lib#10128 (pkp-lib#13248 `2dd359154a`, ojs#5778 `6b0afc52c5`), the
// regression reader's S1: a journal that customised the "New Announcement" template in its primary
// language only. Run:
//   PROBE_FEATURE=sync PROBE_AGENT=r10128ct node bin/probe.js ojs shared/playwright/checks/sync/pkp-lib-13248/custom-template.js
// A scratch journal, English primary, French beside it; a manager and two readers, working languages
// [] and [fr_CA]. The manager edits ANNOUNCEMENT's English subject and body through the REST API
// (what Settings › Workflow › Emails saves), leaves French alone, then adds an announcement with
// "Send Email"; the queue is drained and both mails recorded, with every link they carry.
// No assertions. Expected at the PR: the [] reader gets the journal's text, the [fr_CA] reader the stock
// French text without it. At the base both get the journal's text.
const {forEachApp, launch, signIn, idle, record, apiAs, drainJobs, tag} = require('../../../probe');
const {execFileSync} = require('child_process');
const {dbName} = require('../../../../../bin/apps.js');

forEachApp(async (app) => {
    const t = tag('ct');
    const readers = {none: [], fr: ['fr_CA']};
    const users = [{username: `${t}mg`, givenName: 'Mona', familyName: 'Manager', email: `${t}mg@mail.test`, roles: ['manager']}];
    for (const key of Object.keys(readers)) {
        users.push({username: `${t}${key}`, givenName: 'Rea', familyName: key, email: `${t}${key}@mail.test`, roles: ['reader']});
    }
    await app.api.createContext({tag: t, enableAnnouncements: true,
        context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']}, users});
    for (const [key, locales] of Object.entries(readers)) {
        execFileSync('psql', ['-h', '127.0.0.1', '-U', 'e2e', '-At', '-c',
            `update users set locales = '${JSON.stringify(locales)}' where username = '${t}${key}'`, dbName(app.name)],
        {env: {...process.env, PGPASSWORD: 'e2e'}});
    }
    const facts = {tag: t, libPkp: execFileSync('git', ['-C', `${app.root}/lib/pkp`, 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim()};
    const {page, close} = await launch(app);
    try {
        await signIn(page, `${t}mg`, {contextPath: t});
        await page.goto(app.url(`/index.php/${t}/en/dashboard/editorial`));
        await idle(page);
        const tpl = await (await apiAs(page, 'GET', 'emailTemplates/ANNOUNCEMENT')).json();
        const r = await apiAs(page, 'PUT', 'emailTemplates/ANNOUNCEMENT', {
            subject: {en: 'JOURNAL NEWS: {$announcementTitle}'},
            body: {en: `<p>JOURNAL-MARKER our own words.</p>${tpl.body.en}`},
        });
        facts.put = {status: r.status(), body: (await r.text()).slice(0, 300)};
        const since = new Date().toISOString();
        const a = await apiAs(page, 'POST', 'announcements', {title: {en: `Call ${t}`, fr_CA: `Appel ${t}`},
            descriptionShort: {en: '<p>Deadline.</p>', fr_CA: '<p>Date limite.</p>'}, sendEmail: true});
        facts.announce = a.status();
        await drainJobs(app);
        for (const key of Object.keys(readers)) {
            const m = await app.mail.find({to: `${t}${key}@mail.test`, since, timeoutMs: 15_000});
            const full = await app.mail.fullMessage(m.ID);
            facts[key] = {subject: m.Subject, text: (full.Text || '').replace(/\s+/g, ' ').trim().slice(0, 400),
                links: [...(full.HTML || '').matchAll(/href="([^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, '&'))};
        }
    } finally {
        record('custom-template', facts);
        await close();
    }
    console.log(JSON.stringify(facts, null, 1));
});
