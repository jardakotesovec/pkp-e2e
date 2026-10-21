// Issue report docs/issues/U56-OMP3-press-french-editorial-reminder-journal-placeholder.md (spec U56
// OMP3): the report's Steps to reproduce, walked on PKP's default test dataset (a dataset fleet,
// harness.md "Dataset fleets"). OMP shows it; OJS is the control (a preprint server has no
// "Editorial Reminder").
//
// Default mode:
//   1-3 as `rvaca`: Settings › Workflow › "Emails" › "Manage Emails", "Edit" on "Editorial
//       Reminder", "Edit Template" with the "French" button pressed: subject and body per language
//   4   as `dbarnes`: Edit Profile › Contact, "Working Languages" French (Canada) only, "Save"
//   5   the daily task (lib/pkp/tools/scheduler.php test --name='PKP\task\EditorialReminders'),
//       then the queued job (the app's own job runner)
//   6   the newest email to dbarnes@mailinator.com from this install
// `neighbour` as the argument runs alone: steps 1-3 and 5-6 with step 4 left out, so the reminder
//   goes out in English; with the fix in and out the English body and email must read the same.
//
// Reset first:  npm run fleet-prep -- --feature issues-h21j --dataset 5 --reset
// Run (main):   PROBE_FEATURE=issues-h21j PROBE_AGENT=h21j node bin/probe.js ojs,omp shared/playwright/checks/issues/press-french-editorial-reminder-journal-placeholder/walk.js [neighbour]
//               (ONLY=… or the app argument narrows; `all` reports OPS as having no such email)
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-h21j-3_5 --dataset 5 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-h21j-3_5 PROBE_AGENT=h21j node bin/probe.js omp shared/playwright/checks/issues/press-french-editorial-reminder-journal-placeholder/walk.js
// Fix trial (fix.diff: the translations, and the upgrade's variable rename for presses and servers):
//   apply to omp; load the stable-3_5_0 dataset so the upgrade to main runs
//   (PKP_E2E_DATASET_BRANCH=stable-3_5_0 npm run fleet-prep -- --feature issues-h21j --dataset 5 --reset --apps omp);
//   PROBE_RUN=fix … walk.js; a plain reset, then `php lib/pkp/tools/installEmailTemplate.php
//   EDITORIAL_REMINDER fr_CA` (a new install's or a new language's step), PROBE_RUN=nb-in … walk.js
//   neighbour; revert; a plain reset, PROBE_RUN=nb-out … walk.js neighbour.
// Facts: .reports/<feature>/h21j/omp3-<mode>[-<run>]-<app>.json
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, idle, drainJobs, sql, serverLog} = require('../../../probe');
const {sleep, flat, placeholders, around, openManageEmails, readTemplate, closeTop, runReminderTask} = require('./lib');

const MODE = process.argv.includes('neighbour') ? 'neighbour' : 'steps';
const EDITOR = 'dbarnes';
const MAILBOX = 'dbarnes@mailinator.com';

forEachApp(async (app) => {
    const facts = {app: app.name, line: app.line, dataset: app.dataset, mode: MODE, at: new Date().toISOString()};
    const name = `omp3-${MODE}`;
    const log = serverLog(app);
    const from = log.mark();
    const {page, close} = await launch(app);
    try {
        facts.storedDefault = sql(app, "select locale || ': ' || substr(body, position('soumissions dans' in body), 80) from email_templates_default_data where email_key = 'EDITORIAL_REMINDER' and locale = 'fr_CA'") || null;
        // 1-3
        await signIn(page, 'rvaca', {contextPath: app.contextPath});
        facts.via = await openManageEmails(app, page);
        const tpl = await readTemplate(page, 'Editorial Reminder');
        facts.template = tpl;
        record(`${name}-template`, await screen(page));
        await shot(page, `${name}-template`);
        if (tpl.listed) {
            await closeTop(page);
            if (tpl.kind === 'email window first') await closeTop(page);
        }
        await signOut(page);
        if (!tpl.listed) {
            facts.noSuchEmail = true;
            return;
        }

        // 4
        await signIn(page, EDITOR, {contextPath: app.contextPath});
        if (MODE === 'steps') {
            const {ProfilePage} = require('../../../pages/ProfilePage.js');
            const profile = new ProfilePage(page, app.contextPath);
            await profile.goto('contact');
            const boxes = profile.form('contact').locator('input[name="locales[]"]');
            facts.workingLanguages = {before: await boxes.evaluateAll((els) => els.map((e) => ({value: e.value, label: (e.closest('li') || e.parentElement).innerText.trim(), checked: e.checked})))};
            await loc(page, 'Profile › Contact: "Working Languages" French (Canada)', boxes.and(page.locator('[value="fr_CA"]')));
            for (const v of await boxes.evaluateAll((els) => els.map((e) => e.value))) {
                const box = profile.form('contact').locator(`input[name="locales[]"][value="${v}"]`);
                if (v === 'fr_CA') await box.check(); else await box.uncheck();
            }
            await profile.save();
            await sleep(500);
            facts.workingLanguages.toast = flat(await page.locator('.app__notifications').innerText().catch(() => null));
            facts.workingLanguages.saved = sql(app, `select locales from users where username = '${EDITOR}'`);
            record(`${name}-profile`, await screen(page));
            await shot(page, `${name}-profile`);
        } else {
            facts.workingLanguages = {saved: sql(app, `select locales from users where username = '${EDITOR}'`)};
        }
        await signOut(page);

        // 5
        const since = new Date(Date.now() - 1000);
        facts.task = runReminderTask(app);
        const drained = await drainJobs(app).catch((e) => ({error: flat(e.message, 300)}));
        facts.jobs = {passes: drained.passes, counts: drained.counts, error: drained.error};

        // 6
        try {
            const m = await app.fleetMail.find({to: MAILBOX, since, timeoutMs: 30_000});
            const full = await app.fleetMail.fullMessage(m.ID).catch(() => null);
            const text = full ? full.Text || '' : '';
            const html = full ? full.HTML || '' : '';
            facts.mail = {subject: m.Subject, from: m.From, placeholders: placeholders(text), journalNameText: around(text, '{$journalName}'), journalNameHtml: around(html, '{$journalName}', 140), opening: flat(text, 600)};
        } catch (e) {
            facts.mail = {none: true, error: flat(e.message, 300)};
        }
    } catch (e) {
        facts.error = flat(e.stack || e.message, 900);
        await shot(page, `${name}-error`).catch(() => {});
    } finally {
        facts.serverErrors = log.since(from).slice(0, 10);
        record(name, facts);
        const t = facts.template || {};
        console.log(JSON.stringify({app: app.name, line: app.line, mode: MODE, stored: facts.storedDefault, kind: t.kind, buttons: t.languageButtons, bodies: (t.bodies || []).map((b) => ({id: b.id, journalName: b.journalName, ph: b.placeholders})), subjects: t.subjects, languages: facts.workingLanguages, task: facts.task, jobs: facts.jobs, mail: facts.mail && {subject: facts.mail.subject, journalName: facts.mail.journalNameText, opening: flat(facts.mail.opening, 260), none: facts.mail.none}, noSuchEmail: facts.noSuchEmail, error: facts.error, serverErrors: facts.serverErrors.length}));
        await close();
    }
});
