// Kept check: PR review of pkp/pkp-lib#10128 (pkp-lib#13248 `2dd359154a`, ojs#5778 `6b0afc52c5`): the
// "New Announcement" and "Issue Published Notify" emails take each recipient's language from
// `Repo::user()->getEmailLocale()`: the journal's primary language when the user's working languages
// include it or include none the journal offers, otherwise the first working language it offers.
// Run (OJS: both emails; OMP/OPS: the announcement only):
//   PROBE_FEATURE=sync PROBE_AGENT=r10128 node bin/probe.js ojs,omp shared/playwright/checks/sync/pkp-lib-13248/email-locale.js
// A scratch context, English primary, French beside it as a UI and form language; a manager and six readers
// whose working languages (`users.locales`, set with SQL since registration sets none) are:
//   none [] · fr [fr_CA] · fr+en [fr_CA, en] · de [de] (not offered) · de+fr [de, fr_CA] · en [en]
//   a1  the manager, UI switched to French, adds an announcement in both languages with "Send Email" (REST)
//   a2  the same with an English-only title and short description
//   i1  (OJS) the manager, UI still French, publishes an issue with the email box ticked
// After each the queue is drained and every reader's mail recorded (subject, first lines of the text).
// No assertions: the session judges. Expected at the PR: none/fr+en/de/en get English, fr and de+fr
// French; a2's French mails carry the English title (the announcement's best language). At the base:
// the announcement in the primary language (English) for all, the issue email in the sender's UI
// language (French) for all.
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, switchLanguage, idle, record, apiAs, drainJobs, tag} = require('../../../probe');
const {dbName} = require('../../../../../bin/apps.js');
const log = (...a) => console.log('[10128]', ...a);
const T = 30_000;

const READERS = {
    none: [], fr: ['fr_CA'], fren: ['fr_CA', 'en'], de: ['de'], defr: ['de', 'fr_CA'], en: ['en'],
};

function psql(app, q) {
    return execFileSync('psql', ['-h', '127.0.0.1', '-U', 'e2e', '-At', '-c', q, dbName(app.name)],
        {env: {...process.env, PGPASSWORD: 'e2e'}, encoding: 'utf8'}).trim();
}

async function mails(app, t, since) {
    const out = {};
    for (const key of Object.keys(READERS)) {
        const email = `${t}${key}@mail.test`;
        let list = [];
        try {
            await app.mail.find({to: email, since, timeoutMs: 15_000});
            list = ((await app.mail._search({to: email, since})).messages || []);
        } catch (e) {
            out[key] = {none: true};
            continue;
        }
        out[key] = [];
        for (const m of list) {
            const full = await app.mail.fullMessage(m.ID);
            out[key].push({subject: m.Subject, text: (full.Text || '').replace(/\s+/g, ' ').trim().slice(0, 260)});
        }
    }
    return out;
}

forEachApp(async (app) => {
    const t = tag('el');
    const libPkp = execFileSync('git', ['-C', `${app.root}/lib/pkp`, 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim();
    const appHead = execFileSync('git', ['-C', app.root, 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim();
    const users = [{username: `${t}mg`, givenName: 'Mona', familyName: 'Manager', email: `${t}mg@mail.test`, roles: ['manager']}];
    for (const key of Object.keys(READERS)) {
        users.push({username: `${t}${key}`, givenName: 'Rea', familyName: key, email: `${t}${key}@mail.test`, roles: ['reader']});
    }
    await app.api.createContext({tag: t, enableAnnouncements: true,
        context: {supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']}, users});
    for (const [key, locales] of Object.entries(READERS)) {
        psql(app, `update users set locales = '${JSON.stringify(locales)}' where username = '${t}${key}'`);
    }
    // The manager blocks nothing; nor do the readers. Only the readers' mail is read.
    const facts = {app: app.name, appHead, libPkp, tag: t,
        locales: psql(app, `select username, locales from users where username like '${t}%' order by user_id`)};
    const {page, close} = await launch(app);
    try {
        await signIn(page, `${t}mg`, {contextPath: t});
        await page.goto(app.url(`/index.php/${t}/en/dashboard/editorial`));
        await idle(page);
        await switchLanguage(page, 'fr_CA');
        facts.managerUi = page.url();

        const announce = async (name, body) => {
            const since = new Date().toISOString();
            const r = await apiAs(page, 'POST', 'announcements', {...body, sendEmail: true});
            facts[`${name}-status`] = r.status();
            await drainJobs(app);
            facts[name] = await mails(app, t, since);
            log(name, r.status(), JSON.stringify(facts[name], null, 1));
        };
        await announce('a1', {title: {en: `Call for papers ${t}`, fr_CA: `Appel à contributions ${t}`},
            descriptionShort: {en: '<p>Deadline June 1.</p>', fr_CA: '<p>Date limite le 1er juin.</p>'}});
        await announce('a2', {title: {en: `English only ${t}`}, descriptionShort: {en: '<p>Only in English.</p>'}});

        if (app.name === 'ojs') {
            const since = new Date().toISOString();
            await page.goto(app.url(`/index.php/${t}/fr_CA/manageIssues`));
            await idle(page);
            const create = page.locator('a:visible, button:visible').filter({hasText: /^\s*Créer un numéro\s*$/}).first();
            await create.waitFor({state: 'visible', timeout: T});
            await create.click();
            const form = page.locator('form#issueForm');
            await form.waitFor({state: 'visible', timeout: T});
            await form.locator('input[name="volume"]').fill('1');
            await form.locator('input[name="number"]').fill('1');
            await form.locator('input[name="year"]').fill('2026');
            await form.locator('input[name="title[en]"]').fill(`Issue ${t}`);
            const saved = page.waitForResponse((r) => r.request().method() === 'POST' && /\/update-issue/.test(r.url()), {timeout: T});
            await form.getByRole('button', {name: 'Enregistrer', exact: true}).click();
            const savedRes = await saved;
            facts.i1Save = {status: savedRes.status(), body: (await savedRes.text()).slice(0, 600)};
            await idle(page);
            await page.goto(app.url(`/index.php/${t}/fr_CA/manageIssues`));
            await idle(page);
            const row = page.locator('tr.gridRow').filter({hasText: '(2026)'}).first();
            await row.waitFor({state: 'visible', timeout: T});
            await row.locator('a.show_extras').click();
            await page.getByRole('link', {name: 'Publier le numéro', exact: true}).click();
            const dialog = page.locator('[role="dialog"]:visible').last();
            const box = dialog.locator('#sendIssueNotification');
            await box.waitFor({state: 'visible', timeout: T});
            facts.i1Box = await box.isChecked();
            const published = page.waitForResponse((r) => r.request().method() === 'POST' && /\/publish-issue/.test(r.url()), {timeout: T});
            await dialog.getByRole('button', {name: 'OK', exact: true}).click();
            facts.i1Status = (await published).status();
            await idle(page);
            await drainJobs(app);
            facts.i1 = await mails(app, t, since);
            log('i1', facts.i1Status, JSON.stringify(facts.i1, null, 1));
        }
    } finally {
        record(`email-locale-${app.name}`, facts);
        await close();
    }
});
