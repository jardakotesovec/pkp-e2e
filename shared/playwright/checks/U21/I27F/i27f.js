// U21 claim check, housekeeping chunk I27F (2026-11-27): does `main` show the 3.3 incidental row
// "step 1 refused with no category ticked answers 500 instead of redrawing the form"?
// On main the start form carries no categories (they sit on "For the Editors" / OPS "For Readers"), so the
// row's two refusals are driven at both places a refusal can reach on a context that offers categories:
//   start   three apps: the "Make a Submission" start form filled (title, a section on OJS/OPS, boxes), the
//           form token expired meanwhile (a second tab of the same browser signs out and back in, which
//           rotates the session's token), then "Begin Submission". Same-page read, then a reload.
//   closed  OJS, OPS: the start form filled with the section "Alpha" picked, the section closed meanwhile
//           (sections.is_inactive = 1, what the section window's "Mark this section as inactive…" stores),
//           then "Begin Submission". Same-page read, then a reload.
//   one     OJS, OPS: "Alpha" closed, so one section is left: the start form (no "Section" choice) and "Begin
//           Submission" with none picked; the wizard's "Submitting to…" line.
//   fte     three apps: a draft begun on screen, "Continue" to For the Editors (For Readers), no category
//           ticked, a comment typed, the token expired meanwhile (second tab), then "Continue". Same-page
//           read, the footer over 36 s, then a reload ("Unsaved Changes" › "Yes") and a second reload; then the
//           draft's section closed meanwhile (OJS, OPS) and "Continue" again.
//   ftecat  three apps: fte with "Category A" ticked in "Select Categories" (the other end of the row's axis).
//   rules   three apps: Rules 4 and 5 on the same context: the start form in a 390 px window (the Title box), leaving
//           it with a title typed, "Begin Submission" (the button while the draft is made; the draft's row, author,
//           participants), and a Journal editor (OPS Preprint Server manager) + Author choosing the editorial role.
//   ends    three apps: the For the Editors step (For Readers) of a seeded draft on two more scratch contexts:
//           categories with "let authors pick categories" off and the descriptive metadata asked (subjects at
//           "enable"; on OMP a series), and the setting on with no category.
//   control three apps: the same start form with nothing refused, to the wizard (the categories field read
//           on For the Editors).
//
//   PROBE_FEATURE=U21 PROBE_AGENT=ccI27F PROBE_RUN=r1 PROBE_NOTES_FEATURE=U21 node bin/probe.js all shared/playwright/checks/U21/I27F/i27f.js
//   PHASES=control,start,closed,one,fte,ftecat,rules,ends (default all). Run twice (PROBE_RUN=r1, r2): each run seeds its own scratch
//   context (tag prefix u21i27f) with two sections (OJS/OPS), two categories and submitWithCategories on.
//   No other script or file is read. publicknowledge is never touched.
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, sql} = require('../../../probe');
const {waitForEditorReady} = require('../../../support/richtext.js');

const ALL = ['control', 'start', 'closed', 'one', 'fte', 'ftecat', 'rules', 'ends'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const T = 30_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const endAnchored = (name) => new RegExp(`${esc(name)}\\s*$`);
const RELATION_NONE = 'This preprint has not been published elsewhere.';

forEachApp(async (app) => {
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const hasSections = !isOMP;
    const log = (...a) => console.log(`[i27f ${process.env.PROBE_RUN || ''} ${app.name}]`, ...a);
    const editorsStep = isOPS ? 'For Readers' : 'For the Editors';

    // ------------------------------------------------------------------ scratch context
    const t = tag('u21i27f');
    const body = {
        tag: t,
        submitWithCategories: true,
        categories: [{path: 'cata', title: 'Category A'}, {path: 'catb', title: 'Category B'}],
        users: [{username: `${t}au`, roles: ['author']}, {username: `${t}ed`, roles: [isOPS ? 'manager' : 'editor', 'author']}],
    };
    if (app.name === 'ojs') body.sections = [{abbrev: 'ART', title: 'Articles'}, {abbrev: 'ALP', title: 'Alpha'}];
    if (isOPS) body.sections = [{abbrev: 'PRE', title: 'Preprints', path: 'preprints'}, {abbrev: 'ALP', title: 'Alpha', path: 'alpha'}];
    const C = await app.api.createContext(body);
    const ctx = C.path || t;
    const au = `${t}au`;
    const ctxId = sql(app, `select ${app.contextTables.id} from ${app.contextTables.table} where path='${ctx}'`).split('\n')[0];
    const alphaId = hasSections
        ? sql(app, `select s.section_id from sections s join section_settings ss on ss.section_id=s.section_id where s.${app.contextTables.id}=${ctxId} and ss.setting_name='abbrev' and ss.setting_value='ALP'`).split('\n')[0]
        : null;
    const setAlpha = (inactive) => hasSections && sql(app, `update sections set is_inactive=${inactive ? 1 : 0} where section_id=${alphaId}`);
    const fact = (name, data) => record(`facts-${name}`, data, {merge: true});
    fact('context', {ctx, ctxId, alphaId, au, response: C});
    log('context', ctx, ctxId, alphaId);

    const {page, context, close} = await launch(app);
    // ------------------------------------------------------------------ traffic, errors, dialogs
    const traffic = [];
    const errs = [];
    const dialogs = [];
    context.on('response', async (r) => {
        const u = r.url();
        if (!/\/api\/v1\//.test(u) || /_test\//.test(u)) return;
        const m = r.request().method();
        const e = {at: Date.now(), m, override: r.request().headers()['x-http-method-override'] || null,
            url: u.replace(/^https?:\/\/[^/]+/, '').split('?')[0], status: r.status()};
        if (m !== 'GET') { e.body = await r.text().then((b) => b.slice(0, 600)).catch(() => null); e.sent = flat(r.request().postData(), 400); }
        traffic.push(e);
    });
    page.on('pageerror', (e) => errs.push({at: Date.now(), type: 'pageerror', text: flat(e.message, 300)}));
    page.on('console', (m) => { if (m.type() === 'error') errs.push({at: Date.now(), type: 'console', text: flat(m.text(), 300)}); });
    page.on('dialog', async (d) => {
        dialogs.push({at: Date.now(), type: d.type(), message: flat(d.message(), 300)});
        if (d.type() === 'beforeunload') await d.accept().catch(() => {}); else await d.dismiss().catch(() => {});
    });
    const since = (t0) => ({
        writes: traffic.filter((x) => x.at >= t0 && x.m !== 'GET').map((x) => ({op: x.override || x.m, url: x.url, status: x.status, body: x.body, sent: x.sent})),
        errors: errs.filter((x) => x.at >= t0),
        dialogs: dialogs.filter((x) => x.at >= t0),
    });

    async function snap(name, extra, p = page) {
        let s;
        try { s = await screen(p); } catch (e) { s = {url: p.url(), error: flat(e.message, 300), text: {}}; }
        if (extra) s.facts = extra;
        record(name, s);
        await shot(p, name).catch(() => {});
        return s;
    }
    async function sect(name, fn) {
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 5).join(' | '));
            record(`${name}-FAILED`, {error: String(e.stack || e).slice(0, 2000)});
            await snap(`${name}-FAILED-screen`).catch(() => {});
            return null;
        }
    }

    // A second tab of the same browser signs out and back in: the session (and its form token) is renewed,
    // so the first tab's page still carries the old token.
    async function expireTokenElsewhere() {
        const p2 = await context.newPage();
        const before = await page.evaluate(() => (window.pkp && pkp.currentUser ? pkp.currentUser.csrfToken : null)).catch(() => null);
        await signIn(p2, au, {contextPath: ctx});
        await idle(p2).catch(() => {});
        const after = await p2.evaluate(() => (window.pkp && pkp.currentUser ? pkp.currentUser.csrfToken : null)).catch(() => null);
        await p2.close();
        return {tokenChanged: before && after ? before !== after : null, oldTokenPresent: !!before, newTokenPresent: !!after};
    }

    // ------------------------------------------------------------------ start form
    async function openStart() {
        await page.goto(app.url(`/index.php/${ctx}/en/submission`));
        await page.getByRole('heading', {name: /Make a Submission/}).first().waitFor({timeout: T});
        await idle(page);
    }
    async function fillStart(title, section) {
        const iframe = page.locator('iframe.tox-edit-area__iframe').first();
        const id = (await iframe.getAttribute('id')).replace(/_ifr$/, '');
        await waitForEditorReady(page, id);
        const b = iframe.contentFrame().locator('body');
        await b.click();
        await b.fill(title);
        if (section) await page.getByRole('radio', {name: section, exact: true}).check();
        for (const re of [/meets all of these requirements/, /agree to have my data collected/]) {
            const box = page.getByRole('checkbox', {name: re});
            if (await box.count()) await box.check();
        }
        await sleep(300);
    }
    async function startFormState() {
        return {
            sectionRadios: await page.locator('input[type=radio][name="sectionId"]').evaluateAll((els) => els.map((e) => ({label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim(), checked: e.checked}))).catch(() => null),
            fieldErrors: await page.locator('.pkpFormField__error, .pkpFieldError, .pkpFormErrors, .pkpForm__errors').allInnerTexts().catch(() => null),
            formFoot: flat(await page.locator('.pkpFormPage__footer, .pkpFormPage__status, .pkpForm__footer').first().innerText().catch(() => null), 300),
            beginButton: await page.getByRole('button', {name: 'Begin Submission'}).evaluateAll((els) => els.map((e) => ({disabled: e.disabled, text: e.innerText.trim(), cls: e.className}))).catch(() => null),
            categoriesOnForm: await page.getByText(/Categor/).count(),
            url: page.url(),
        };
    }
    // Press "Begin Submission"; outcome: navigation to the wizard or the POST's answer, whichever comes.
    async function pressBegin() {
        const t0 = Date.now();
        const resp = page.waitForResponse((r) => /\/api\/v1\/submissions(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
        await page.getByRole('button', {name: 'Begin Submission'}).click();
        const r = await resp;
        const out = {postStatus: r ? r.status() : null};
        const nav = await page.waitForURL(/[?&]id=\d+/, {waitUntil: 'commit', timeout: 8000}).then(() => true, () => false);
        out.navigated = nav;
        await sleep(1500);
        await idle(page).catch(() => {});
        out.traffic = since(t0);
        return out;
    }

    // ------------------------------------------------------------------ wizard
    const cur = () => page.locator('.pkpSteps__step__label--current');
    const curText = async () => flat(await cur().innerText().catch(() => ''), 80);
    const footer = () => page.locator('.submissionWizard__footer');
    async function continueTo(label) {
        const button = footer().getByRole('button', {name: 'Continue', exact: true});
        for (let attempt = 0; ; attempt++) {
            await button.click({timeout: 10000});
            try { await cur().filter({hasText: endAnchored(label)}).waitFor({timeout: 8000}); await idle(page); return; } catch (e) { if (attempt >= 2) throw e; }
        }
    }
    async function nextStepName() {
        const labels = (await page.locator('.pkpSteps__step__label').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
        const c = await curText();
        const i = labels.findIndex((l) => l === c);
        return labels[i + 1].replace(/^\d+\s*/, '');
    }
    async function toStep(label) {
        for (let i = 0; i < 6; i++) {
            if (endAnchored(label).test(await curText())) return;
            await continueTo(await nextStepName());
        }
        throw new Error(`never reached ${label}`);
    }
    async function categoriesField() {
        const f = page.locator('.pkpFormField').filter({has: page.getByRole('button', {name: 'Select Categories'})});
        return {
            count: await f.count(),
            text: flat(await f.first().innerText().catch(() => null), 300),
            selected: await page.locator('input[name^="categoryIds"]').evaluateAll((els) => els.map((e) => e.value)).catch(() => null),
        };
    }
    const commentsId = async () => {
        const ifr = page.locator('iframe[id^="commentsForTheEditors"][id$="_ifr"]').first();
        if (!(await ifr.count())) return null;
        return (await ifr.getAttribute('id')).replace(/_ifr$/, '');
    };
    async function typeComment(text) {
        const id = await commentsId();
        if (!id) return 'no comments box';
        await waitForEditorReady(page, id);
        const b = page.frameLocator(`#${id}_ifr`).locator('body');
        await b.click();
        await b.fill(text);
        await sleep(200);
        return id;
    }
    const commentValue = async () => {
        const id = await commentsId();
        if (!id) return null;
        await waitForEditorReady(page, id).catch(() => {});
        return page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent({format: 'text'}) : null), id).catch(() => null);
    };
    async function wizardState() {
        return {
            step: await curText(),
            footer: flat(await footer().innerText().catch(() => null), 200),
            errorDialog: flat(await page.getByRole('dialog').filter({hasText: /Error|error/}).last().innerText().catch(() => null), 400),
            categories: await categoriesField(),
            comment: flat(await commentValue(), 200),
            url: page.url(),
        };
    }
    async function dismissErrorDialog() {
        const d = page.getByRole('dialog').filter({hasText: /unexpected error|could not be submitted|logged out/i}).last();
        if (await d.count()) {
            await d.getByRole('button', {name: 'OK', exact: true}).click({timeout: 5000}).catch(() => {});
            await sleep(500);
            return true;
        }
        return false;
    }
    async function answerRelation() {
        if (!isOPS) return null;
        const r = page.getByRole('radio', {name: RELATION_NONE, exact: true});
        if (!(await r.count())) return 'no radio';
        if (!(await r.isChecked())) await r.check();
        return 'checked';
    }

    try {
        await signIn(page, au, {contextPath: ctx});
        await idle(page).catch(() => {});

        // ============================================================== control
        if (on('control')) await sect('control', async () => {
            await openStart();
            await snap('control-01-start', await startFormState());
            await loc(page, 'start form: Begin Submission', page.getByRole('button', {name: 'Begin Submission'}));
            await fillStart(`I27F control ${t}`, hasSections ? 'Alpha' : null);
            const o = await pressBegin();
            await page.locator('.pkpSteps').waitFor({timeout: T});
            await idle(page);
            o.id = (page.url().match(/[?&]id=(\d+)/) || [])[1];
            await snap('control-02-wizard', o);
            await toStep(editorsStep);
            o.fte = await wizardState();
            await snap('control-03-editors-step', o.fte);
            await loc(page, `${editorsStep}: Categories field`, page.locator('.pkpFormField').filter({has: page.getByRole('button', {name: 'Select Categories'})}));
            fact('control', o);
            log('control', JSON.stringify({post: o.postStatus, nav: o.navigated, cats: o.fte.categories}));
        });

        // ============================================================== start: token expired meanwhile
        if (on('start')) await sect('start', async () => {
            await openStart();
            await fillStart(`I27F start token ${t}`, hasSections ? 'Alpha' : null);
            const o = {before: await startFormState()};
            await snap('start-01-filled', o.before);
            o.expire = await expireTokenElsewhere();
            await page.bringToFront();
            const b = await pressBegin();
            Object.assign(o, b);
            o.after = await startFormState();
            o.errorDialog = flat(await page.getByRole('dialog').last().innerText().catch(() => null), 400);
            await snap('start-02-after-begin', o);
            if (o.errorDialog) await loc(page, 'start form: dialog after a refused Begin', page.getByRole('dialog').last());
            o.dismissed = await dismissErrorDialog();
            await page.reload();
            await page.getByRole('heading', {name: /Make a Submission/}).first().waitFor({timeout: T}).catch(() => {});
            await idle(page).catch(() => {});
            o.reload = await startFormState();
            o.reload.title = flat(await page.locator('iframe.tox-edit-area__iframe').first().contentFrame().locator('body').innerText().catch(() => null), 200);
            await snap('start-03-reload', o.reload);
            o.drafts = sql(app, `select s.submission_id, s.submission_progress from submissions s where s.context_id=${ctxId} order by 1`);
            fact('start', o);
            log('start', JSON.stringify({expire: o.expire, post: o.postStatus, nav: o.navigated, writes: o.traffic.writes, errs: o.traffic.errors, dialog: o.errorDialog}));
        });

        // ============================================================== closed: section closed meanwhile
        if (on('closed') && hasSections) await sect('closed', async () => {
            await openStart();
            await fillStart(`I27F start closed ${t}`, 'Alpha');
            const o = {before: await startFormState()};
            await snap('closed-01-filled', o.before);
            setAlpha(true);
            const b = await pressBegin();
            Object.assign(o, b);
            o.after = await startFormState();
            o.errorDialog = flat(await page.getByRole('dialog').last().innerText().catch(() => null), 400);
            await snap('closed-02-after-begin', o);
            o.dismissed = await dismissErrorDialog();
            await page.reload();
            await page.getByRole('heading', {name: /Make a Submission/}).first().waitFor({timeout: T}).catch(() => {});
            await idle(page).catch(() => {});
            o.reload = await startFormState();
            await snap('closed-03-reload', o.reload);
            setAlpha(false);
            fact('closed', o);
            log('closed', JSON.stringify({post: o.postStatus, nav: o.navigated, writes: o.traffic.writes, errs: o.traffic.errors, fieldErrors: o.after.fieldErrors, dialog: o.errorDialog}));
        });

        // ============================================================== one: one section left
        if (on('one') && hasSections) await sect('one', async () => {
            setAlpha(true);
            await openStart();
            const o = {form: await startFormState()};
            await snap('one-01-start', o.form);
            await fillStart(`I27F one ${t}`, null);
            Object.assign(o, await pressBegin());
            await page.locator('.pkpSteps').waitFor({timeout: T});
            await idle(page);
            o.id = (page.url().match(/[?&]id=(\d+)/) || [])[1];
            o.submittingTo = flat(await page.getByText(/^Submitting to the /).first().innerText().catch(() => null), 200);
            o.sectionOfDraft = sql(app, `select ss.setting_value from publications p join section_settings ss on ss.section_id=p.section_id and ss.setting_name='title' where p.submission_id=${o.id}`);
            await snap('one-02-wizard', {submittingTo: o.submittingTo, sectionOfDraft: o.sectionOfDraft});
            setAlpha(false);
            fact('one', o);
            log('one', JSON.stringify({sections: o.form.sectionRadios, post: o.postStatus, submittingTo: o.submittingTo, sectionOfDraft: o.sectionOfDraft}));
        });

        // ============================================================== fte / ftecat: For the Editors save refused
        // The axis: no category ticked (fte, the row's case) and Category A ticked (ftecat).
        async function fte(key, withCategory) {
            await openStart();
            await fillStart(`I27F ${key} ${t}`, hasSections ? 'Alpha' : null);
            const o = await pressBegin();
            await page.locator('.pkpSteps').waitFor({timeout: T});
            await idle(page);
            o.id = (page.url().match(/[?&]id=(\d+)/) || [])[1];
            await toStep(editorsStep);
            await answerRelation();
            if (withCategory) {
                const field = page.locator('.pkpFormField').filter({has: page.getByRole('button', {name: 'Select Categories'})});
                await field.getByRole('button', {name: 'Select Categories'}).first().click();
                const win = page.getByRole('dialog', {name: 'Select Categories'}).last();
                await win.waitFor({timeout: T});
                await sleep(800);
                await snap(`${key}-00-select-window`);
                await win.locator('tbody tr').filter({has: page.locator('label').filter({hasText: /^\s*Category A\s*$/})}).first().locator('input[type=checkbox]').first().check();
                await win.getByRole('button', {name: 'Save', exact: true}).click();
                await sleep(1000);
            }
            o.typed = await typeComment(`I27F comment one ${t}`);
            o.before = await wizardState();
            await snap(`${key}-01-editors-step-typed`, o.before);
            o.expire = await expireTokenElsewhere();
            await page.bringToFront();
            const t0 = Date.now();
            await footer().getByRole('button', {name: 'Continue', exact: true}).click({timeout: 10000});
            await sleep(3000);
            await idle(page).catch(() => {});
            o.after = await wizardState();
            await snap(`${key}-02-after-continue`, o.after);
            if (o.after.errorDialog) await loc(page, `${editorsStep}: dialog after a refused step save`, page.getByRole('dialog').filter({hasText: /Error|error/}).last());
            o.dismissed = await dismissErrorDialog();
            // the footer over the next half minute (retries?)
            o.footerOverTime = [];
            for (const at of [6, 15, 36]) {
                while (Date.now() - t0 < at * 1000) await sleep(250);
                o.footerOverTime.push({at, footer: flat(await footer().innerText().catch(() => null), 200),
                    buttons: await footer().locator('button').evaluateAll((els) => els.map((e) => `${e.innerText.trim()}${e.disabled ? '[disabled]' : ''}`)).catch(() => null)});
            }
            o.press = since(t0);
            o.afterDismiss = await wizardState();
            await snap(`${key}-03-after-retries`, o.afterDismiss);
            // reload: the "Unsaved Changes" dialog, "Yes"
            const t1 = Date.now();
            await page.reload();
            await page.locator('.pkpSteps').waitFor({timeout: T}).catch(() => {});
            await idle(page).catch(() => {});
            await sleep(1000);
            const restore = page.getByRole('dialog').filter({hasText: 'Unsaved Changes'}).last();
            o.reloadDialog = flat(await restore.innerText().catch(() => null), 500);
            await snap(`${key}-04-reload`, {dialog: o.reloadDialog});
            if (o.reloadDialog) {
                await loc(page, 'wizard reload: Unsaved Changes dialog', restore);
                await restore.getByRole('button', {name: 'Yes', exact: true}).click();
                await sleep(2500);
                await idle(page).catch(() => {});
            }
            o.restore = since(t1);
            o.afterRestore = {footer: flat(await footer().innerText().catch(() => null), 200), step: await curText()};
            await snap(`${key}-05-after-restore`, o.afterRestore);
            // a second reload: what the server holds
            await page.reload();
            await page.locator('.pkpSteps').waitFor({timeout: T}).catch(() => {});
            await idle(page).catch(() => {});
            await sleep(800);
            o.reload2Dialog = flat(await page.getByRole('dialog').filter({hasText: 'Unsaved Changes'}).last().innerText().catch(() => null), 300);
            await toStep(editorsStep).catch((e) => { o.reloadNav = flat(e.message, 200); });
            o.reload2 = await wizardState();
            await snap(`${key}-06-reload2-editors-step`, o.reload2);
            if (hasSections && !withCategory) {
                // the draft's section closed meanwhile, then "Continue" from For the Editors
                await answerRelation();
                o.typed2 = await typeComment(`I27F comment two ${t}`);
                setAlpha(true);
                const t2 = Date.now();
                await footer().getByRole('button', {name: 'Continue', exact: true}).click({timeout: 10000});
                await sleep(3000);
                await idle(page).catch(() => {});
                o.closedPress = since(t2);
                o.closedAfter = await wizardState();
                await snap(`${key}-07-section-closed-continue`, o.closedAfter);
                await dismissErrorDialog();
                setAlpha(false);
            }
            fact(key, o);
            log(key, JSON.stringify({expire: o.expire, press: o.press.writes.map((w) => `${w.op} ${w.url} ${w.status}`), errs: o.press.errors.length, dialog: o.after.errorDialog, over: o.footerOverTime.map((x) => x.footer), reloadDialog: o.reloadDialog, restore: o.restore.writes.map((w) => `${w.op} ${w.url} ${w.status}`), reload2: o.reload2 && {c: o.reload2.comment, cat: o.reload2.categories}, closed: o.closedPress && o.closedPress.writes.map((w) => `${w.op} ${w.url} ${w.status}`)}));
        }
        if (on('fte')) await sect('fte', () => fte('fte', false));
        if (on('ftecat')) await sect('ftecat', () => fte('ftecat', true));

        // ============================================================== rules: Rules 4 and 5
        const subRow = (id) => ({
            submission: sql(app, `select submission_progress, date_submitted is not null as dated, stage_id from submissions where submission_id=${id}`),
            authors: sql(app, `select count(a.author_id), coalesce(max(case when a.author_id=p.primary_contact_id then 1 else 0 end),0) from publications p left join authors a on a.publication_id=p.publication_id where p.submission_id=${id}`),
            participants: sql(app, `select ugs.setting_value from stage_assignments sa join user_group_settings ugs on ugs.user_group_id=sa.user_group_id and ugs.setting_name='name' and ugs.locale='en' where sa.submission_id=${id}`).split('\n'),
            title: sql(app, `select ps.setting_value from publication_settings ps join publications p on p.publication_id=ps.publication_id where p.submission_id=${id} and ps.setting_name='title'`),
        });
        async function beginWatchingSpinner() {
            const btn = page.getByRole('button', {name: 'Begin Submission'});
            const resp = page.waitForResponse((r) => /\/api\/v1\/submissions(\?|$)/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
            await btn.click();
            const seen = [];
            for (let i = 0; i < 30; i++) {
                const st = await page.evaluate(() => {
                    const b = [...document.querySelectorAll('button')].find((x) => /Begin Submission/.test(x.innerText));
                    const st = document.querySelector('.pkpFormPage__status');
                    return b ? {spinner: !!(st && st.querySelector('.pkpSpinner')), status: st ? st.innerText.trim().slice(0, 60) : null, disabled: b.disabled} : {gone: true};
                }).catch(() => ({gone: true}));
                seen.push(st);
                if (st.gone) break;
                await sleep(100);
            }
            const r = await resp;
            const nav = await page.waitForURL(/[?&]id=\d+/, {waitUntil: 'commit', timeout: T}).then(() => true, () => false);
            return {postStatus: r ? r.status() : null, navigated: nav, spinnerSeen: seen.some((x) => x.spinner), samples: seen.slice(0, 6)};
        }
        if (on('rules')) await sect('rules', async () => {
            const o = {};
            // a 390 px window
            await page.setViewportSize({width: 390, height: 844});
            await openStart();
            o.narrow = await page.locator('iframe.tox-edit-area__iframe').first().evaluate((el) => {
                const r = el.getBoundingClientRect();
                const box = el.closest('.tox-tinymce') || el;
                const rb = box.getBoundingClientRect();
                return {iframeWidth: Math.round(r.width), editorWidth: Math.round(rb.width)};
            }).catch((e) => String(e.message).slice(0, 200));
            await snap('rules-01-start-390px', o.narrow);
            await page.setViewportSize({width: 1280, height: 900});
            // leaving with a title typed
            await openStart();
            await fillStart(`I27F leave ${t}`, null);
            const tl = Date.now();
            await page.goto(app.url(`/index.php/${ctx}/en/dashboard/mySubmissions`));
            await idle(page).catch(() => {});
            o.leave = {landed: page.url(), dialogs: since(tl).dialogs};
            await snap('rules-02-left-start', o.leave);
            // Begin Submission as Author: spinner, draft row
            await openStart();
            await fillStart(`I27F rules author ${t}`, hasSections ? (isOPS ? 'Preprints' : 'Articles') : null);
            o.author = await beginWatchingSpinner();
            await page.locator('.pkpSteps').waitFor({timeout: T});
            await idle(page);
            o.author.id = (page.url().match(/[?&]id=(\d+)/) || [])[1];
            o.author.step = await curText();
            o.author.row = subRow(o.author.id);
            await snap('rules-03-author-wizard', o.author);
            await toStep('Contributors');
            o.author.contributors = flat(await page.locator('.listPanel').filter({has: page.getByRole('button', {name: 'Add Contributor'})}).first().innerText().catch(() => null), 400);
            await snap('rules-04-author-contributors', {contributors: o.author.contributors});
            // the editorial role chosen in "Submit As"
            await signIn(page, `${t}ed`, {contextPath: ctx});
            await idle(page).catch(() => {});
            await openStart();
            o.editor = {radios: await page.locator('input[type=radio][name="userGroupId"]').evaluateAll((els) => els.map((e) => ({label: (e.labels && e.labels[0] ? e.labels[0].innerText : '').trim(), checked: e.checked})))};
            await snap('rules-05-editor-start', o.editor);
            await fillStart(`I27F rules editor ${t}`, hasSections ? (isOPS ? 'Preprints' : 'Articles') : null);
            const ed = o.editor.radios.find((r) => r.label && !/^Author$/.test(r.label));
            if (ed) await page.locator('fieldset').filter({has: page.locator('input[name="userGroupId"]')}).getByRole('radio', {name: ed.label, exact: true}).check();
            o.editor.picked = ed ? ed.label : null;
            Object.assign(o.editor, await beginWatchingSpinner());
            await page.locator('.pkpSteps').waitFor({timeout: T});
            await idle(page);
            o.editor.id = (page.url().match(/[?&]id=(\d+)/) || [])[1];
            o.editor.step = await curText();
            o.editor.row = subRow(o.editor.id);
            await toStep('Contributors');
            o.editor.contributors = flat(await page.locator('.listPanel').filter({has: page.getByRole('button', {name: 'Add Contributor'})}).first().innerText().catch(() => null), 400);
            await snap('rules-06-editor-contributors', o.editor);
            await signIn(page, au, {contextPath: ctx});
            await idle(page).catch(() => {});
            fact('rules', o);
            log('rules', JSON.stringify({narrow: o.narrow, leave: o.leave, author: {p: o.author.postStatus, spin: o.author.spinnerSeen, step: o.author.step, row: o.author.row}, editor: {radios: o.editor.radios, picked: o.editor.picked, row: o.editor.row, c: o.editor.contributors}}).slice(0, 2500));
        });

        // ============================================================== ends: the For the Editors step's other ends
        if (on('ends')) await sect('ends', async () => {
            const meta = {subjects: 'enable', disciplines: 'request', agencies: 'request', coverage: 'request', rights: 'request', source: 'request', type: 'request'};
            const variants = [
                ['x1', {categories: [{path: 'cata', title: 'Category A'}], submitWithCategories: false, metadata: meta, ...(isOMP ? {series: [{path: 'serone', title: 'Series One'}]} : {})}],
                ['x2', {submitWithCategories: true}],
            ];
            const o = {};
            for (const [k, extra] of variants) {
                const tk = `${t}${k}`;
                const b = {tag: tk, users: [{username: `${tk}au`, roles: ['author']}], ...extra};
                let Cx;
                try { Cx = await app.api.createContext(b); } catch (e) {
                    o[k] = {createError: flat(e.message, 400)};
                    if (extra.metadata) { delete b.metadata; Cx = await app.api.createContext({...b, tag: `${tk}b`}); o[k].retriedWithoutMetadata = true; } else throw e;
                }
                const cx = Cx.path || b.tag;
                const D = await app.api.createSubmission({tag: `${tk}d`, context: cx, submitter: `${tk}au`, title: `I27F ends ${k} ${t}`, submitted: false});
                await signIn(page, `${tk}au`, {contextPath: cx});
                await idle(page).catch(() => {});
                await page.goto(app.url(`/index.php/${cx}/en/submission?id=${D.submissionId}`));
                await page.locator('.pkpSteps').waitFor({timeout: T});
                await idle(page);
                await toStep(editorsStep);
                const stepForm = page.locator('.submissionWizard__step, .pkpStep').filter({has: page.locator('form')}).last();
                o[k] = {...(o[k] || {}), ctx: cx, id: D.submissionId,
                    labels: await page.locator('form .pkpFormFieldLabel, form legend').allInnerTexts().then((a) => a.map((x) => flat(x, 80))).catch(() => null),
                    categories: await categoriesField()};
                await snap(`ends-${k}-editors-step`, o[k]);
                void stepForm;
            }
            await signIn(page, au, {contextPath: ctx});
            fact('ends', o);
            log('ends', JSON.stringify(o).slice(0, 2500));
        });
    } finally {
        setAlpha(false);
        await close();
    }
});
