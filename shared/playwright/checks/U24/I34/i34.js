// U24 claim check I34 (housekeeping incidentals, U24 row 2026-11-11): the
// header's "Return to Workflow" (Actors row "Return to Workflow", Rule 18)
// on OJS submission 1 of PKP's default dataset, which rests in Done, read
// and pressed by every permission level the dataset assigns to it:
//   sberardo   Section editor, assigned "Only allowed to recommend"
//   shellier   Layout Editor (assistant)            - read only
//   amwandenga Author (My Submissions)              - read only
//   dbuskins   Section editor without the limit     - presses "Confirm"
//   sberardo   again, on the returned submission    - "Return to Done" if offered
//   dbarnes, dbuskins, rvaca (Journal manager, unassigned) - "Return to Done"
//              in turn until one moves it back to Done
//   dbarnes    Journal editor, on Done                - "Return to Workflow", then
//   rvaca      "Return to Done" again
// Each step: the workflow read with screen() on landing, after every press
// and after a reload; the sweep of sberardo's header (Activity Log, Library,
// View) and of the landing page left with a change unsaved, then saved.
//
// OMP and OPS datasets hold no recommend-only assignment on a published
// item, so there the script drives only the "Return to Done" leg: the
// assigned deciding editor (OMP dbarnes on book 14, OPS dbuskins on
// preprint 2) presses "Return to Workflow" › "Confirm", then "Return to
// Done" › "Confirm"; the unassigned Journal manager rvaca is the control.
//
// No scratch context: the row is about the dataset as installed. Runs on
// dataset fleet 3 (feature inc-U24; OMP/OPS prepared with
// `npm run fleet-prep -- --feature inc-U24 --dataset 3 --notes U24 --apps omp,ops`),
// the app's fleet reset before every run, each run twice (PROBE_RUN=r1, r2):
//   npm run reset:<app> -- --dataset 3
//   PROBE_RUN=<r1|r2> PROBE_FEATURE=inc-U24 PROBE_AGENT=cc1111d \
//     bin/app-lock.sh shared <app> -- node bin/probe.js <app> shared/playwright/checks/U24/I34/i34.js
// Outputs (.reports/inc-U24/cc1111d/): `<step>-<run>-<app>.json/.png`
// snapshots and `facts-<run>-<app>.json` (outFile, written here only). No other script
// or file is read; no PART.
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, sql, note, outFile, loc} = require('../../../probe');
const fs = require('fs');

const RUN = process.env.PROBE_RUN || 'r1';
// The Done submission per app, and on OMP/OPS the assigned deciding editor
// whose "Return to Done" is driven (the OJS sequence is the one above).
const SUBS = {ojs: 1, omp: 14, ops: 2};
const DECIDER = {omp: 'dbarnes', ops: 'dbuskins'};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rel = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/index\.php\/[^/]+/, '~');
const flat = (s, n = 600) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

forEachApp(async (app) => {
    const SUB = SUBS[app.name];
    const facts = {app: app.name, run: RUN, dataset: app.dataset, sub: SUB};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[${app.name}] ${k}: ${JSON.stringify(v).slice(0, 700)}`);
        fs.writeFileSync(outFile('facts.json'), JSON.stringify(facts, null, 2));
    };
    const state = () => {
        const [stage, status] = sql(app, `select stage_id, status from submissions where submission_id=${SUB}`).split('|');
        const decisions = sql(app, `select count(*) from edit_decisions where submission_id=${SUB}`);
        const last = sql(app, `select decision, stage_id, editor_id from edit_decisions where submission_id=${SUB} order by edit_decision_id desc limit 1`);
        return {stage: +stage, status: +status, decisions: +decisions, lastDecision: last};
    };

    fact('premise', {
        state: state(),
        assignments: sql(app, `select u.username, sa.recommend_only, sa.can_change_metadata, ug.role_id
              from stage_assignments sa join users u on u.user_id=sa.user_id join user_groups ug on ug.user_group_id=sa.user_group_id
              where sa.submission_id=${SUB} order by sa.stage_assignment_id`).split('\n'),
    });

    const {page, close} = await launch(app);
    let cur = null;
    page.on('response', async (r) => {
        if (!cur) return;
        const u = r.url();
        if ((/\/api\/v1\/|\$\$\$call\$\$\$/.test(u) && !/_i18n/.test(u)) || r.status() >= 400) {
            const m = r.request().method();
            cur.req.push(`${m} ${r.status()} ${rel(u)}`);
            if (m !== 'GET' && /\/submissions\/\d+\/(decisions|returnToDone)/.test(u)) {
                cur.decision = {method: m, status: r.status(), url: rel(u), body: flat(await r.text().catch(() => ''), 400),
                    sent: flat(r.request().postData(), 200)};
            }
        }
    });
    page.on('console', (m) => cur && m.type() === 'error' && cur.console.push(flat(m.text(), 200)));
    page.on('pageerror', (e) => cur && cur.pageerror.push(flat(e.message, 200)));
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({type: d.type(), message: flat(d.message(), 200), at: cur && cur.label});
        await d.accept().catch(() => {});
    });
    const begin = (label) => (cur = {label, req: [], console: [], pageerror: []});
    const end = () => {
        const c = cur;
        cur = null;
        return c;
    };

    const wf = () => page.getByRole('dialog').filter({has: page.locator('[data-cy="sidemodal-header"]')}).first();
    const header = () => wf().locator('[data-cy="sidemodal-header"]');
    const headerButtons = async () => (await header().getByRole('button').allInnerTexts().catch(() => [])).map((s) => flat(s, 60)).filter(Boolean);
    const bubble = () => header().locator('span[class*="bg-stage-"] + span').first().innerText().catch(() => null);
    async function snap(name) {
        await idle(page).catch(() => {});
        await sleep(400);
        const s = await screen(page);
        record(`${name}-${RUN}`, s);
        await shot(page, `${name}-${RUN}`).catch(() => {});
        return s;
    }
    async function readHeader(name) {
        const s = await snap(name);
        return {url: rel(page.url()), bubble: await bubble(), buttons: await headerButtons(), dialog: flat(s.text && s.text.dialog, 500), notices: s.notices};
    }
    async function openWorkflow(dash) {
        await page.goto(app.url(`/index.php/${app.contextPath}/dashboard/${dash}?workflowSubmissionId=${SUB}`));
        await header().waitFor({timeout: 30000}).catch(() => {});
        await header().locator('span[class*="bg-stage-"]').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page).catch(() => {});
    }

    // Press a header return button, read its dialog, answer it, read the outcome.
    async function pressReturn(user, label, answers) {
        const out = {};
        for (const answer of answers) {
            const btn = header().getByRole('button', {name: label, exact: true});
            if (!(await btn.count())) {
                out[answer] = {offered: false};
                continue;
            }
            begin(`${user}-${label}-${answer}`);
            await btn.click();
            const dlg = page.getByRole('dialog', {name: label, exact: true});
            await dlg.waitFor({timeout: 20000}).catch(() => {});
            const sd = await snap(`${user}-${label.replace(/\s/g, '')}-dialog-${answer}`);
            const dialogText = flat(sd.text && sd.text.dialog, 300);
            const dialogButtons = (await dlg.getByRole('button').allInnerTexts().catch(() => [])).map((x) => flat(x, 40));
            const before = state();
            await dlg.getByRole('button', {name: answer, exact: true}).click();
            if (answer === 'Confirm') {
                await page.waitForResponse((r) => /\/submissions\/\d+\/(decisions|returnToDone)/.test(r.url()) && r.request().method() !== 'GET', {timeout: 20000}).catch(() => {});
            }
            await sleep(1500);
            const after = await readHeader(`${user}-${label.replace(/\s/g, '')}-after-${answer}`);
            const err = page.getByRole('dialog', {name: 'Error', exact: true});
            const errorWindow = (await err.count()) ? {text: flat(await err.innerText().catch(() => ''), 300),
                buttons: (await err.getByRole('button').allInnerTexts().catch(() => [])).map((x) => flat(x, 40))} : null;
            let afterOk = null;
            if (errorWindow) {
                await loc(page, 'the "Error" window over the workflow after a refused decision', err);
                await err.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
                await sleep(1000);
                afterOk = await readHeader(`${user}-${label.replace(/\s/g, '')}-after-OK`);
                afterOk.errorStillOpen = await err.count();
            }
            const sqlAfter = state();
            await page.reload();
            await header().locator('span[class*="bg-stage-"]').first().waitFor({timeout: 30000}).catch(() => {});
            const reload = await readHeader(`${user}-${label.replace(/\s/g, '')}-reload-${answer}`);
            out[answer] = {offered: true, dialogText, dialogButtons, before, after, errorWindow, afterOk, sqlAfter, reload, traffic: end()};
        }
        return out;
    }

    try {
      if (DECIDER[app.name]) {
        // OMP / OPS: the assigned deciding editor returns the submission and
        // presses "Return to Done"; the unassigned Journal manager is the control.
        const d = DECIDER[app.name];
        await signIn(page, d, {contextPath: app.contextPath});
        begin(`${d}-open`);
        await openWorkflow('editorial');
        fact(`${d} landing`, {...(await readHeader(`${d}-landing`)), traffic: end()});
        fact(`${d} return to workflow`, await pressReturn(d, 'Return to Workflow', ['Confirm']));
        fact(`${d} return to done`, await pressReturn(`${d}-rtd`, 'Return to Done', ['Confirm']));
        await signOut(page).catch(() => {});
        if (state().stage !== 6) {
            await signIn(page, 'rvaca', {contextPath: app.contextPath});
            begin('rvaca-rtd-open');
            await openWorkflow('editorial');
            fact('rvaca returned landing', {...(await readHeader('rvaca-rtd-landing')), traffic: end()});
            fact('rvaca return to done', await pressReturn('rvaca-rtd', 'Return to Done', ['Confirm']));
            await signOut(page).catch(() => {});
        }
        fact('final state', state());
      } else {
        // 1. sberardo, recommend-only, on the submission resting in Done.
        await signIn(page, 'sberardo', {contextPath: app.contextPath});
        begin('sberardo-open');
        await openWorkflow('editorial');
        const sLanding = await readHeader('sberardo-landing');
        await loc(page, 'workflow header: "Return to Workflow" button', header().getByRole('button', {name: 'Return to Workflow', exact: true}));
        fact('sberardo landing', {...sLanding, traffic: end()});

        // sweep: the header's other controls, each pressed once.
        {
            const sweep = {};
            begin('sberardo-activitylog');
            await header().getByRole('button', {name: 'Activity Log', exact: true}).click().catch(() => {});
            const log = page.getByRole('dialog').filter({hasText: 'Activity Log & Notes'});
            await log.getByText('Event', {exact: true}).waitFor({timeout: 30000}).catch(() => {});
            const sl = await snap('sberardo-activitylog');
            sweep.activityLog = {opened: await log.count(), text: flat(sl.text && sl.text.dialog, 400)};
            await log.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
            await sleep(800);
            sweep.activityLog.traffic = end();
            begin('sberardo-library');
            await header().getByRole('button', {name: 'Library', exact: true}).click().catch(() => {});
            await sleep(1500);
            const lb = await snap('sberardo-library');
            sweep.library = {text: flat(lb.text && lb.text.dialog, 400), dialogs: await page.getByRole('dialog').count()};
            await page.keyboard.press('Escape');
            await sleep(800);
            sweep.library.dialogsAfterEscape = await page.getByRole('dialog').count();
            sweep.library.traffic = end();
            begin('sberardo-view');
            const pagesBefore = page.context().pages().length;
            await header().getByRole('button', {name: 'View', exact: true}).click().catch(() => {});
            await page.waitForLoadState('load').catch(() => {});
            await sleep(1500);
            const sv = await snap('sberardo-view');
            sweep.view = {url: rel(page.url()), title: sv.title, newTabs: page.context().pages().length - pagesBefore, traffic: end()};
            fact('sberardo sweep', sweep);
        }

        // sweep: the landing publication page left with a change unsaved.
        begin('sberardo-unsaved');
        await openWorkflow('editorial');
        {
            const o = {heading: flat(await wf().locator('h2').first().innerText().catch(() => ''), 80)};
            const box = wf().locator('input[type=text]:enabled').first();
            o.editable = await box.isVisible().catch(() => false);
            if (o.editable) {
                o.field = await box.evaluate((i) => {
                    const l = i.id && document.querySelector(`label[for="${i.id}"]`);
                    return {name: i.name, label: l ? l.innerText.trim() : null, value: i.value};
                });
                await box.fill(`${o.field.value} I34`);
                await box.blur();
                const before = dialogs.length;
                await wf().locator('nav').getByRole('link', {name: 'Production', exact: true}).first().click().catch(() => {});
                await sleep(1500);
                const sp = await snap('sberardo-unsaved-left');
                o.left = {heading: flat(await wf().locator('h2').first().innerText().catch(() => ''), 80), browserDialogs: dialogs.slice(before), notices: sp.notices, innerDialogs: await page.getByRole('dialog').count()};
                await wf().locator('nav').getByRole('link', {name: 'Title & Abstract', exact: true}).last().click().catch(() => {});
                await sleep(1500);
                await snap('sberardo-unsaved-back');
                o.valueAfterReturn = await wf().locator(`input[name="${o.field.name}"]`).first().inputValue().catch(() => null);
                await page.reload();
                await header().waitFor({timeout: 30000}).catch(() => {});
                await idle(page).catch(() => {});
                o.valueAfterReload = await wf().locator(`input[name="${o.field.name}"]`).first().inputValue().catch(() => null);
            }
            o.traffic = end();
            fact('sberardo unsaved leave', o);
        }

        // sweep: the same form's "Save" (U40 Rule 10: disabled), pressed when enabled, with the Prefix changed (her
        // assignment carries no metadata-edit permission); read on the page,
        // after a reload and in the database.
        begin('sberardo-save');
        {
            const o = {};
            const box = wf().locator('input[name="prefix-en"]').first();
            o.editable = await box.isEditable().catch(() => false);
            const pubId = sql(app, `select current_publication_id from submissions where submission_id=${SUB}`);
            const latest = sql(app, `select max(publication_id) from publications where submission_id=${SUB}`);
            const dbPrefix = () => sql(app, `select coalesce(setting_value,'') from publication_settings where publication_id=${latest} and setting_name='prefix' and locale='en'`);
            o.publications = {current: pubId, latest, prefixBefore: dbPrefix()};
            if (o.editable) {
                await box.fill('I34');
                const form = box.locator('xpath=ancestor::form[1]');
                const save = form.getByRole('button', {name: 'Save', exact: true});
                o.saveDisabled = await save.isDisabled().catch(() => null);
                await loc(page, 'Title & Abstract "Save" (disabled for a viewer who may not edit)', save);
                if (o.saveDisabled === false) await save.click().catch((e) => (o.saveError = flat(e.message, 100)));
                await page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15000}).catch(() => {});
                await sleep(1500);
                const s = await snap('sberardo-save-after');
                o.samePage = {value: await box.inputValue().catch(() => null), notices: s.notices, errors: flat(await form.locator('.pkpFormField__error, [role="alert"], .pkpFormError').allInnerTexts().catch(() => []), 300),
                    dialog: flat(await page.getByRole('dialog', {name: 'Error', exact: true}).innerText().catch(() => ''), 200)};
                await page.getByRole('dialog', {name: 'Error', exact: true}).getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
                o.prefixAfter = dbPrefix();
                await page.reload();
                await header().waitFor({timeout: 30000}).catch(() => {});
                await idle(page).catch(() => {});
                await snap('sberardo-save-reload');
                o.valueAfterReload = await wf().locator('input[name="prefix-en"]').first().inputValue().catch(() => null);
            }
            o.traffic = end();
            fact('sberardo save', o);
        }

        // the incidental row: "Return to Workflow", Cancel, then Confirm.
        await openWorkflow('editorial');
        fact('sberardo return to workflow', await pressReturn('sberardo', 'Return to Workflow', ['Cancel', 'Confirm']));
        await signOut(page).catch(() => {});

        // 2. the levels that must never get it: assistant and Author.
        for (const [user, dash] of [['shellier', 'editorial'], ['amwandenga', 'mySubmissions']]) {
            await signIn(page, user, {contextPath: app.contextPath});
            begin(`${user}-open`);
            await openWorkflow(dash);
            fact(`${user} landing`, {...(await readHeader(`${user}-landing`)), traffic: end()});
            await signOut(page).catch(() => {});
        }

        // 3. the control: a Section editor without the limit confirms.
        await signIn(page, 'dbuskins', {contextPath: app.contextPath});
        begin('dbuskins-open');
        await openWorkflow('editorial');
        fact('dbuskins landing', {...(await readHeader('dbuskins-landing')), traffic: end()});
        fact('dbuskins return to workflow', await pressReturn('dbuskins', 'Return to Workflow', ['Confirm']));
        await signOut(page).catch(() => {});

        // 4. sberardo on the returned submission: what the header offers now.
        await signIn(page, 'sberardo', {contextPath: app.contextPath});
        begin('sberardo2-open');
        await openWorkflow('editorial');
        fact('sberardo returned landing', {...(await readHeader('sberardo2-landing')), traffic: end()});
        fact('sberardo return to done', await pressReturn('sberardo2', 'Return to Done', ['Cancel', 'Confirm']));
        await signOut(page).catch(() => {});

        // 5. "Return to Done" on the returned submission, by each deciding level in
        // turn until one succeeds: the Journal editor (assigned), the Section
        // editor without the limit (assigned), the Journal manager (unassigned).
        for (const user of ['dbarnes', 'dbuskins', 'rvaca']) {
            await signIn(page, user, {contextPath: app.contextPath});
            begin(`${user}-rtd-open`);
            await openWorkflow('editorial');
            fact(`${user} returned landing`, {...(await readHeader(`${user}-rtd-landing`)), traffic: end()});
            if (state().stage !== 6) {
                fact(`${user} return to done`, await pressReturn(`${user}-rtd`, 'Return to Done', ['Confirm']));
            }
            await signOut(page).catch(() => {});
        }

        // 6. the Journal editor (assigned) on Done: "Return to Workflow" › "Confirm";
        // then the Journal manager puts it back in Done.
        if (state().stage === 6) {
            await signIn(page, 'dbarnes', {contextPath: app.contextPath});
            begin('dbarnes-rtw-open');
            await openWorkflow('editorial');
            fact('dbarnes done landing', {...(await readHeader('dbarnes-rtw-landing')), traffic: end()});
            fact('dbarnes return to workflow', await pressReturn('dbarnes-rtw', 'Return to Workflow', ['Confirm']));
            await signOut(page).catch(() => {});
            if (state().stage !== 6) {
                await signIn(page, 'rvaca', {contextPath: app.contextPath});
                begin('rvaca2-open');
                await openWorkflow('editorial');
                fact('rvaca restore', await pressReturn('rvaca2-rtd', 'Return to Done', ['Confirm']));
                await signOut(page).catch(() => {});
            }
        }
        fact('final state', state());
      }
    } finally {
        facts.browserDialogs = dialogs;
        fs.writeFileSync(outFile('facts.json'), JSON.stringify(facts, null, 2));
        await close();
    }
    if (RUN === 'r1' && !DECIDER[app.name]) {
        note(`cc1111d: I34: on dataset fleet 3 OJS submission 1 opens for sberardo/dbuskins/dbarnes on "Title & Abstract" of its newest version (1.1, unpublished); the return buttons sit in [data-cy="sidemodal-header"]; a refused decision shows getByRole('dialog', {name: 'Error'}) with "OK" over the panel.`);
    }
});
