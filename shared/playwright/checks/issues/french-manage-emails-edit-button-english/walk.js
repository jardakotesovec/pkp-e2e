// Issue report docs/issues/U56-A12-french-manage-emails-edit-button-english.md (spec U56 A12): the
// report's Steps to reproduce, walked on PKP's default test dataset (a dataset fleet, harness.md
// "Dataset fleets"), all three apps.
//
// Default mode, as `rvaca`:
//   2  the user menu's French (Canada) link
//   3  Settings › Workflow, the "Emails" tab, the "Manage Emails" link (in French)
//   4  every row's button: the word shown and the screen-reader text
//   control: the same page in English
// `neighbour` as the argument runs alone: the English page's rows (shown word and screen-reader
//   text must stay "Edit" / "Edit {name}"), then on the French page the first row's button is
//   pressed and the window it opens is read (it must still open the email).
//
// Reset first:  npm run fleet-prep -- --feature issues-h21j --dataset 5 --reset
// Run (main):   PROBE_FEATURE=issues-h21j PROBE_AGENT=h21j node bin/probe.js all shared/playwright/checks/issues/french-manage-emails-edit-button-english/walk.js [neighbour]
// Run (3.5):    PKP_E2E_LINE=stable-3_5_0 npm run fleet-prep -- --feature issues-h21j-3_5 --dataset 5 --reset
//               PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-h21j-3_5 PROBE_AGENT=h21j node bin/probe.js all shared/playwright/checks/issues/french-manage-emails-edit-button-english/walk.js
// Fix trial (fix.diff): apply, PROBE_RUN=fix … walk.js; PROBE_RUN=nb-in … walk.js neighbour;
//   revert; PROBE_RUN=nb-out … walk.js neighbour.
// Facts: .reports/<feature>/h21j/a12-<mode>[-<run>]-<app>.json
const {forEachApp, launch, signIn, switchLanguage, screen, shot, record, loc, idle} = require('../../../probe');
const {flat, openManageEmails, listRows, tally} = require('./lib');

const MODE = process.argv.includes('neighbour') ? 'neighbour' : 'steps';

forEachApp(async (app) => {
    const facts = {app: app.name, line: app.line, dataset: app.dataset, mode: MODE, at: new Date().toISOString()};
    const name = `a12-${MODE}`;
    const {page, close} = await launch(app);
    try {
        // 1
        await signIn(page, 'rvaca', {contextPath: app.contextPath});
        await idle(page);
        facts.landed = page.url();

        const readPage = async (lang, label) => {
            const out = {};
            try {
                await switchLanguage(page, lang);
                out.switched = page.url();
            } catch (e) {
                out.switchError = flat(e.message, 300);
            }
            out.via = await openManageEmails(app, page, lang);
            out.url = page.url();
            out.heading = flat(await page.locator('main h1').first().innerText().catch(() => null));
            const rows = await listRows(page);
            out.rowCount = rows.length;
            out.shownWords = tally(rows);
            out.firstRows = rows.slice(0, 5);
            const first = page.locator('.manageEmails__listPanel .listPanel__item').first().locator('.listPanel__itemActions button');
            out.firstButtonAccessibleName = await first.evaluate((b) => b.textContent.replace(/\s+/g, ' ').trim()).catch(() => null);
            out.firstButtonAria = await first.ariaSnapshot().catch(() => null);
            await loc(page, `Manage Emails (${lang}): first row's button`, first);
            const s = await screen(page);
            record(`${name}-${label}`, s);
            await shot(page, `${name}-${label}`);
            return out;
        };

        if (MODE === 'steps') {
            // 2-4
            facts.french = await readPage('fr_CA', 'fr');
            // control
            facts.english = await readPage('en', 'en');
        } else {
            facts.english = await readPage('en', 'en');
            facts.french = await readPage('fr_CA', 'fr');
            // the French button still opens the email's window
            const first = page.locator('.manageEmails__listPanel .listPanel__item').first().locator('.listPanel__itemActions button');
            try {
                await first.click();
                await idle(page);
                const dlg = page.locator('[role="dialog"]:visible').last();
                await dlg.waitFor({timeout: 20_000});
                await idle(page);
                facts.frenchOpens = {dialogName: flat(await dlg.getAttribute('aria-label').catch(() => null)), heading: flat(await dlg.locator('h1, h2').first().innerText().catch(() => null)), text: flat(await dlg.innerText().catch(() => null), 300)};
                record(`${name}-fr-window`, await screen(page));
                await shot(page, `${name}-fr-window`);
            } catch (e) {
                facts.frenchOpens = {error: flat(e.message, 300)};
            }
        }
    } catch (e) {
        facts.error = flat(e.stack || e.message, 800);
        await shot(page, `${name}-error`).catch(() => {});
    } finally {
        record(name, facts);
        console.log(JSON.stringify({app: app.name, line: app.line, mode: MODE, french: facts.french && {words: facts.french.shownWords, sr: facts.french.firstButtonAccessibleName, heading: facts.french.heading, via: facts.french.via}, english: facts.english && {words: facts.english.shownWords, sr: facts.english.firstButtonAccessibleName}, opens: facts.frenchOpens, error: facts.error}));
        await close();
    }
});
