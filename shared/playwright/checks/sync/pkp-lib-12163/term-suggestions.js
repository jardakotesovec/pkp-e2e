// Sync claim check S18b (accommodation of pkp/pkp-lib#12163, commit 14473fe784):
// where the term fields' suggestions come from, on all three apps.
// Spec: docs/specs/U40-publication-metadata.md — the Fields row "Keywords,
// Subjects, Disciplines, Supporting Agencies", Rule 7 "Term lists", register
// entry A10 with footnote f-a10, footnote e's suggestions lookup.
//
// Seeds two scratch contexts (J1 with English and French, J2 the "other
// journal"), and in J1 a published source (P), a second published source to
// unpublish (U), a queued source (Q), a declined source (D), a queued source
// to publish later (L), a queued reader (R) and a wizard draft (W); in J2 a
// published source (X). A manager types one distinct term per source on the
// Publication › Metadata page, then every read types the shared stem on R and
// records the suggestions offered plus the browser's own vocabs request and
// answer. The author reads the wizard's Keywords field; publicknowledge is the
// read-only control (typed, never saved).
//
//   PROBE_FEATURE=sync PROBE_AGENT=ccS18b node bin/probe.js all shared/playwright/checks/sync/pkp-lib-12163/term-suggestions.js
//   PHASES=seed,terms,reads,later,unpublish,wizard,control,pick,dup,leave   (default: all; later phases reuse the seed's state file)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const ALL_PHASES = ['seed', 'terms', 'reads', 'later', 'unpublish', 'wizard', 'control', 'pick', 'dup', 'leave'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL_PHASES;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[s18b]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = 30_000;
const stateFile = (app) => path.join(outDir(), `s18b-state-${app.name}.json`);

const wf = (page) => page.locator('[role="dialog"]:visible').first();
const saveButton = (page) => wf(page).getByRole('button', {name: 'Save', exact: true});

/** Every vocabs call the page makes, with its answer's body (the kit's own listener keeps no bodies). */
function captureVocabs(page) {
    const calls = [];
    page.on('response', async (r) => {
        if (!/\/vocabs(\?|$)/.test(r.url())) return;
        let body = null;
        try {
            body = await r.text();
        } catch (e) {
            body = `<<unreadable: ${e.message}>>`;
        }
        calls.push({method: r.request().method(), url: r.url(), status: r.status(), body: body && body.length > 4000 ? `${body.slice(0, 4000)}…(${body.length} chars)` : body});
    });
    return calls;
}

async function openMetadata(page, app, ctx, sub) {
    await page.goto(app.url(`/index.php/${ctx}/dashboard/editorial?workflowSubmissionId=${sub.submissionId}&workflowMenuKey=publication_${sub.publicationId}_metadata`));
    await idle(page);
    const heading = wf(page).getByRole('heading', {name: /^(Publication|Preprint): Metadata$/i}).first();
    const landed = await heading.waitFor({state: 'visible', timeout: 15_000}).then(() => true).catch(() => false);
    if (!landed) {
        const entry = wf(page).getByRole('link', {name: 'Metadata', exact: true}).first();
        if (!(await entry.isVisible().catch(() => false))) {
            await wf(page).getByRole('link', {name: /^(Publication|Preprint)$/}).first().click().catch(() => {});
            await idle(page);
        }
        await entry.click();
        await heading.waitFor({state: 'visible', timeout: T}).catch(() => {});
    }
    const start = Date.now();
    while (Date.now() - start < 20_000 && !(await saveButton(page).count())) await sleep(250);
    await idle(page);
}

/** The term field's text input for an item and locale; opens the form's language toggle when the locale's input is hidden. */
async function termInput(page, item, locale, formId = 'metadata') {
    const input = page.locator(`[id="${formId}-${item}-control-${locale}"]`);
    if (!(await input.isVisible().catch(() => false)) && locale !== 'en') {
        const toggle = page.getByRole('button', {name: /French|Français/}).first();
        if (await toggle.count()) {
            await toggle.click();
            await sleep(400);
        }
    }
    return input;
}

async function addTerm(page, item, locale, text) {
    const input = await termInput(page, item, locale);
    await input.waitFor({state: 'visible', timeout: T});
    await input.click();
    await input.pressSequentially(text, {delay: 20});
    await sleep(900);
    await input.press('Enter');
    const chip = page.getByRole('button', {name: `Remove ${text}`});
    const added = await chip.first().waitFor({state: 'visible', timeout: 10_000}).then(() => true).catch(() => false);
    return added;
}

async function pressSave(page) {
    const button = saveButton(page);
    if (!(await button.count()) || !(await button.isEnabled().catch(() => false))) return {pressed: false, count: await button.count()};
    const responsePromise = page.waitForResponse((r) => /\/publications\/\d+/.test(r.url()) && ['POST', 'PUT'].includes(r.request().method()), {timeout: T}).catch(() => null);
    await button.click();
    const response = await responsePromise;
    await page.locator('[role="status"]:has-text("Saved")').first().waitFor({state: 'visible', timeout: 15_000}).catch(() => {});
    await sleep(400);
    return {pressed: true, apiStatus: response ? response.status() : null, footer: await wf(page).locator('[role="status"]').allInnerTexts().catch(() => [])};
}

/**
 * One read: type `text` in the field, wait out the field's debounce and its
 * request, record the options offered, the vocabs traffic of this read and
 * the screen; then empty the input again (nothing is added, nothing saved).
 */
async function readSuggestions(page, calls, input, text, name, {keep = false} = {}) {
    const from = calls.length;
    await input.waitFor({state: 'visible', timeout: T});
    await input.click();
    await input.pressSequentially(text, {delay: 60});
    await sleep(1500);
    await idle(page);
    const read = async () => ({
        options: await page.locator('[role="option"]').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []),
        listboxes: await page.locator('[role="listbox"]').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []),
    });
    let seen = await read();
    // The field drops a keystroke's lookup while an earlier one is in flight: one more character settles the list.
    const s = await screen(page);
    s.typed = text;
    s.inputValue = await input.inputValue().catch(() => null);
    s.options = seen.options;
    s.listboxes = seen.listboxes;
    s.vocabs = calls.slice(from);
    record(name, s);
    await shot(page, name).catch(() => {});
    log(name, 'typed', JSON.stringify(text), 'options', JSON.stringify(seen.options), 'calls', s.vocabs.length, s.vocabs.length ? `${s.vocabs[s.vocabs.length - 1].status} ${s.vocabs[s.vocabs.length - 1].url.replace(/^.*\/api\//, '')} -> ${String(s.vocabs[s.vocabs.length - 1].body).slice(0, 300)}` : '');
    if (!keep) {
        await input.press('ControlOrMeta+a').catch(() => {});
        await input.press('Backspace').catch(() => {});
        await input.press('Escape').catch(() => {});
        await sleep(400);
    }
    return s;
}

// --- publishing on the apps' own screens (as checks/U40/K1/k1.js does) ---
async function fillVersionDetailsIfPresent(scope) {
    for (const [sel, val] of [['select[name="versionStage"]', 'VoR'], ['select[name="versionIsMinor"]', 'false']]) {
        const el = scope.locator(sel);
        if (await el.isVisible().catch(() => false)) {
            if (!(await el.inputValue().catch(() => ''))) await el.selectOption(val).catch(() => {});
        }
    }
}

async function publishNow(page, app, ctx, name) {
    const s = {};
    const waitPublish = () => page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    if (app.name === 'ojs') {
        const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
        const pub = new PublicationScreen(page, ctx);
        const panel = await pub.openPublishPanel();
        await pub.fillVersionDetails(panel);
        const dontAssign = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
        if (await dontAssign.waitFor({state: 'visible', timeout: 5_000}).then(() => true).catch(() => false)) {
            await pub.awaitAssignmentPreselected(panel).catch(() => {});
            await dontAssign.check();
        }
        await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
        const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'});
        await confirm.waitFor({state: 'visible', timeout: T});
        const done = waitPublish();
        await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
        const r = await done;
        s.status = r ? r.status() : null;
        await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
    } else if (app.name === 'omp') {
        await page.getByRole('button', {name: 'Publish', exact: true}).first().click();
        const modal = page.getByRole('dialog', {name: /Schedule For Publication/});
        await modal.waitFor({state: 'visible', timeout: T});
        await idle(page);
        await fillVersionDetailsIfPresent(modal);
        const done = waitPublish();
        await modal.getByRole('button', {name: 'Publish', exact: true}).click();
        const r = await done;
        s.status = r ? r.status() : null;
        await page.getByRole('button', {name: 'Unpublish', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
    } else {
        const stageAction = page.getByRole('button', {name: 'Post the preprint', exact: true});
        const postControl = page.getByRole('button', {name: 'Post', exact: true});
        await stageAction.or(postControl).first().waitFor({state: 'visible', timeout: T});
        if (await stageAction.isVisible()) await stageAction.click();
        await postControl.waitFor({state: 'visible', timeout: T});
        await postControl.click();
        const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to post this?'});
        await confirm.waitFor({state: 'visible', timeout: T});
        await idle(page);
        await fillVersionDetailsIfPresent(confirm);
        const done = waitPublish();
        await confirm.getByRole('button', {name: 'Post', exact: true}).last().click();
        const r = await done;
        s.status = r ? r.status() : null;
        await page.getByRole('button', {name: 'Unpost', exact: true}).waitFor({state: 'visible', timeout: T}).catch(() => {});
    }
    await idle(page);
    s.after = await screen(page);
    record(name, s);
    log(name, 'publish status', s.status);
    return s;
}

async function unpublishNow(page, app, name) {
    const s = {};
    const word = app.name === 'ops' ? 'Unpost' : 'Unpublish';
    const button = page.getByRole('button', {name: word, exact: true}).first();
    await button.waitFor({state: 'visible', timeout: T});
    await button.click();
    const dialog = page.getByRole('dialog').filter({hasText: app.name === 'ops' ? "Are you sure you don't want this to be posted?" : "Are you sure you don't want this to be published?"}).last();
    await dialog.waitFor({state: 'visible', timeout: T});
    s.confirm = await dialog.innerText().catch(() => null);
    const done = page.waitForResponse((r) => r.url().includes('/unpublish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
    await dialog.getByRole('button', {name: word, exact: true}).last().click();
    const r = await done;
    s.status = r ? r.status() : null;
    await dialog.waitFor({state: 'detached', timeout: T}).catch(() => {});
    await idle(page);
    s.after = await screen(page);
    record(name, s);
    log(name, 'unpublish status', s.status);
    return s;
}

forEachApp(async (app) => {
    let state = fs.existsSync(stateFile(app)) ? JSON.parse(fs.readFileSync(stateFile(app), 'utf8')) : null;
    const saveState = () => fs.writeFileSync(stateFile(app), JSON.stringify(state, null, 2));

    if (on('seed')) {
        const j1 = `${tag('s18b')}a`;
        const j2 = `${j1.slice(0, -1)}b`;
        const locales = ['en', 'fr_CA'];
        const c1 = await app.api.createContext({
            tag: j1,
            context: {name: `Scratch ${j1}`, supportedLocales: locales, supportedSubmissionLocales: locales, supportedFormLocales: locales},
            metadata: {keywords: 'request', subjects: 'request'},
            users: [
                {username: `${j1}mgr`, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
                {username: `${j1}au`, roles: ['author'], givenName: 'Ada', familyName: 'Author'},
            ],
        });
        const c2 = await app.api.createContext({
            tag: j2,
            context: {name: `Scratch ${j2}`},
            users: [
                {username: `${j2}mgr`, roles: ['manager'], givenName: 'Otto', familyName: 'Other'},
                {username: `${j2}au`, roles: ['author'], givenName: 'Olga', familyName: 'Otherauthor'},
            ],
        });
        const mk = (key, extra = {}, ctx = j1) => app.api.createSubmission({tag: `${ctx}${key}`, context: ctx, submitter: `${ctx}au`, title: `S18b ${key} ${ctx}`, ...extra});
        const subs = {
            P: await mk('p', {published: true}),
            U: await mk('u', {published: true}),
            Q: await mk('q'),
            D: await mk('d', {decisions: [app.name === 'ojs' || app.name === 'omp' ? 'initialDecline' : 'decline']}),
            L: await mk('l'),
            R: await mk('r'),
            W: await mk('w', {submitted: false}),
            X: await mk('x', {published: true}, j2),
        };
        state = {j1, j2, c1: c1.contextId, c2: c2.contextId, subs, stem: `zq${j1.slice(-7, -1)}`};
        saveState();
        log('seeded', j1, j2, JSON.stringify(Object.fromEntries(Object.entries(subs).map(([k, v]) => [k, [v.submissionId, v.publicationId]]))));
    }
    if (!state) throw new Error('no state: run the seed phase first');
    const {j1, j2, subs, stem} = state;
    const term = (k) => `${stem} ${k}`;

    const a = await launch(app);
    const b = await launch(app);
    const callsA = captureVocabs(a.page);
    const callsB = captureVocabs(b.page);
    try {
        await signIn(a.page, `${j1}mgr`);

        // The sources: one distinct term per source, typed and saved on the Metadata page by the journal's manager.
        if (on('terms')) {
            const plan = [
                ['P', [['keywords', 'en', term('pubkw')], ['keywords', 'fr_CA', term('pubfr')], ['subjects', 'en', term('pubsubj')]]],
                ['U', [['keywords', 'en', term('unpubsrc')]]],
                ['Q', [['keywords', 'en', term('queuedkw')], ['subjects', 'en', term('queuedsubj')]]],
                ['D', [['keywords', 'en', term('declinedkw')]]],
                ['L', [['keywords', 'en', term('laterkw')]]],
            ];
            for (const [key, terms] of plan) {
                await openMetadata(a.page, app, j1, subs[key]);
                if (key === 'P') {
                    const s = await screen(a.page);
                    s.formFields = await wf(a.page).locator('.pkpFormField, [class*="pkpFormField "]').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 160))).catch(() => []);
                    record('metadata-published-landing', s);
                    await shot(a.page, 'metadata-published-landing').catch(() => {});
                    await loc(a.page, 'Metadata: Keywords input (en)', a.page.locator('[id="metadata-keywords-control-en"]'));
                    await loc(a.page, 'Metadata: Subjects input (en)', a.page.locator('[id="metadata-subjects-control-en"]'));
                }
                const added = [];
                for (const [item, locale, text] of terms) added.push([item, locale, text, await addTerm(a.page, item, locale, text)]);
                const saved = await pressSave(a.page);
                const s = await screen(a.page);
                s.added = added;
                s.saved = saved;
                record(`terms-saved-${key}`, s);
                log('terms', key, JSON.stringify(added), JSON.stringify(saved));
            }
            await signIn(b.page, `${j2}mgr`);
            await openMetadata(b.page, app, j2, subs.X);
            const addedX = await addTerm(b.page, 'keywords', 'en', term('otherjournal'));
            const savedX = await pressSave(b.page);
            record('terms-saved-X', {...(await screen(b.page)), added: addedX, saved: savedX});
            log('terms X', addedX, JSON.stringify(savedX));
        }

        // The reads, on the queued reader R: Keywords (en), Keywords (fr_CA), Subjects (en), and the published source's own page.
        if (on('reads')) {
            await openMetadata(a.page, app, j1, subs.R);
            await readSuggestions(a.page, callsA, await termInput(a.page, 'keywords', 'en'), stem, 'read-R-keywords-en-stem');
            await readSuggestions(a.page, callsA, await termInput(a.page, 'keywords', 'en'), 'pubkw', 'read-R-keywords-en-midword');
            await readSuggestions(a.page, callsA, await termInput(a.page, 'keywords', 'en'), stem.toUpperCase(), 'read-R-keywords-en-uppercase');
            await readSuggestions(a.page, callsA, await termInput(a.page, 'subjects', 'en'), stem, 'read-R-subjects-en-stem');
            await readSuggestions(a.page, callsA, await termInput(a.page, 'keywords', 'fr_CA'), stem, 'read-R-keywords-fr-stem');
            // The source's own page: its saved term is already a chip there.
            await openMetadata(a.page, app, j1, subs.P);
            await readSuggestions(a.page, callsA, await termInput(a.page, 'keywords', 'en'), stem, 'read-P-keywords-en-stem');
            // The other journal's manager, on the other journal's published item.
            if (!on('terms')) await signIn(b.page, `${j2}mgr`);
            await openMetadata(b.page, app, j2, subs.X);
            await readSuggestions(b.page, callsB, await termInput(b.page, 'keywords', 'en'), stem, 'read-X-otherjournal-keywords-en-stem');
        }

        // "Refreshed after each save": R stays open in window A; L is published in window B; A types again with no reload.
        if (on('later')) {
            await openMetadata(a.page, app, j1, subs.R);
            await readSuggestions(a.page, callsA, await termInput(a.page, 'keywords', 'en'), stem, 'later-R-before-publish');
            await signIn(b.page, `${j1}mgr`);
            await openMetadata(b.page, app, j1, subs.L);
            let published = null;
            try {
                published = await publishNow(b.page, app, j1, 'later-L-publish');
            } catch (e) {
                published = {error: e.message};
                record('later-L-publish-error', {error: e.message, screen: await screen(b.page).catch(() => null)});
                await shot(b.page, 'later-L-publish-error').catch(() => {});
            }
            log('later publish', JSON.stringify({status: published.status, error: published.error}));
            await readSuggestions(a.page, callsA, await termInput(a.page, 'keywords', 'en'), stem, 'later-R-after-publish-no-reload');
            // A term saved on an already published item while A stays open.
            await openMetadata(b.page, app, j1, subs.P);
            const added = await addTerm(b.page, 'keywords', 'en', term('pubsecond'));
            const saved = await pressSave(b.page);
            record('later-P-second-term-saved', {...(await screen(b.page)), added, saved});
            await readSuggestions(a.page, callsA, await termInput(a.page, 'keywords', 'en'), stem, 'later-R-after-second-save-no-reload');
        }

        // Unpublishing a source.
        if (on('unpublish')) {
            if (!on('later')) await signIn(b.page, `${j1}mgr`);
            await b.page.goto(app.url(`/index.php/${j1}/dashboard/editorial?workflowSubmissionId=${subs.U.submissionId}&workflowMenuKey=publication_${subs.U.publicationId}_titleAbstract`));
            await idle(b.page);
            let un = null;
            try {
                un = await unpublishNow(b.page, app, 'unpublish-U');
            } catch (e) {
                un = {error: e.message};
                record('unpublish-U-error', {error: e.message, screen: await screen(b.page).catch(() => null)});
            }
            log('unpublish', JSON.stringify({status: un.status, error: un.error}));
            await openMetadata(a.page, app, j1, subs.R);
            await readSuggestions(a.page, callsA, await termInput(a.page, 'keywords', 'en'), stem, 'unpublish-R-after-unpublish');
        }

        // The submission wizard's Keywords field (Details step), as the author.
        if (on('wizard')) {
            const w = await launch(app);
            const callsW = captureVocabs(w.page);
            try {
                await signIn(w.page, `${j1}au`);
                await w.page.goto(app.url(`/index.php/${j1}/submission?id=${subs.W.submissionId}`));
                await idle(w.page);
                let input = w.page.locator('[id="titleAbstract-keywords-control-en"]');
                // The draft reopens on its last step: the Details step is opened from the rail (collapsed on a narrow rail).
                for (let attempt = 0; attempt < 3 && !(await input.isVisible().catch(() => false)); attempt++) {
                    if (await w.page.locator('.pkpSteps--collapsed').count()) await w.page.locator('.pkpSteps__controls button').first().click().catch(() => {});
                    const rail = w.page.locator('button.pkpSteps__step__label').filter({hasText: /Details\s*$/}).first();
                    // A seeded draft opens on "Upload Files" with "Details" not yet reached (a plain rail entry): "Continue" reaches it.
                    if (await rail.count()) await rail.click().catch(() => {});
                    else await w.page.getByRole('button', {name: 'Continue', exact: true}).first().click().catch(() => {});
                    await sleep(1500);
                    await idle(w.page);
                }
                const s = await screen(w.page);
                s.keywordsInputCount = await input.count();
                s.subjectsInputCount = await w.page.locator('[id="forTheEditors-subjects-control-en"]').count();
                record('wizard-details-landing', s);
                await shot(w.page, 'wizard-details-landing').catch(() => {});
                await loc(w.page, 'Wizard Details: Keywords input (en)', input);
                if (await input.count()) {
                    await readSuggestions(w.page, callsW, input, stem, 'wizard-keywords-en-stem');
                    const fr = w.page.locator('[id="titleAbstract-keywords-control-fr_CA"]');
                    if (await fr.isVisible().catch(() => false)) await readSuggestions(w.page, callsW, fr, stem, 'wizard-keywords-fr-stem');
                }
            } finally {
                await w.close();
            }
        }

        // Read-only control on publicknowledge (typed, emptied, never saved): a letter pair the seeded keywords carry, and the scratch stem.
        if (on('control')) {
            const c = await launch(app);
            const callsC = captureVocabs(c.page);
            try {
                await signIn(c.page, 'admin');
                await c.page.goto(app.url(`/index.php/${app.contextPath}/dashboard/editorial?currentViewId=active`));
                await idle(c.page);
                const s = await screen(c.page);
                record('control-dashboard', s);
                const view = c.page.getByRole('button', {name: /^View /}).first();
                await view.waitFor({state: 'visible', timeout: 10_000}).catch(() => {});
                if (!(await view.count())) log('control: no active submission on', app.contextPath, '(a fresh reset seeds none): no read-only control there');
                if (await view.count()) {
                    await view.click();
                    await idle(c.page);
                    const entry = wf(c.page).getByRole('link', {name: 'Metadata', exact: true}).first();
                    if (!(await entry.isVisible().catch(() => false))) {
                        await wf(c.page).getByRole('link', {name: /^(Publication|Preprint)$/}).first().click().catch(() => {});
                        await idle(c.page);
                    }
                    await entry.click();
                    await wf(c.page).getByRole('heading', {name: /^(Publication|Preprint): Metadata$/i}).first().waitFor({state: 'visible', timeout: T}).catch(() => {});
                    const start = Date.now();
                    while (Date.now() - start < 20_000 && !(await saveButton(c.page).count())) await sleep(250);
                    await idle(c.page);
                    const landing = await screen(c.page);
                    landing.chips = await wf(c.page).getByRole('button', {name: /^Remove /}).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.innerText)).catch(() => []);
                    record('control-metadata-landing', landing);
                    const kw = c.page.locator('[id="metadata-keywords-control-en"]');
                    if (await kw.count()) {
                        for (const probe of (process.env.CONTROL_TERMS || 'a,e,pro').split(',')) await readSuggestions(c.page, callsC, kw, probe, `control-keywords-en-${probe}`);
                        await readSuggestions(c.page, callsC, kw, stem, 'control-keywords-en-scratch-stem');
                    }
                }
            } finally {
                await c.close();
            }
        }

        // Picking a suggestion with a click (nothing saved): on the reader, then on the source's own page where the term is already a chip.
        if (on('pick')) {
            const chips = (page) => wf(page).getByRole('button', {name: /^Remove /}).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.innerText.trim())).catch(() => []);
            for (const [key, name] of [['R', 'pick-R-reader'], ['P', 'pick-P-own-chip']]) {
                await openMetadata(a.page, app, j1, subs[key]);
                const before = await chips(a.page);
                const input = await termInput(a.page, 'keywords', 'en');
                const s = await readSuggestions(a.page, callsA, input, 'pubkw', `${name}-typed`, {keep: true});
                const option = a.page.locator('[role="option"]').filter({hasText: term('pubkw')}).first();
                const offered = await option.count();
                if (offered) await option.click();
                await sleep(600);
                const after = await screen(a.page);
                after.chipsBefore = before;
                after.chipsAfter = await chips(a.page);
                after.offered = offered;
                after.inputValueAfter = await input.inputValue().catch(() => null);
                after.saveEnabled = await saveButton(a.page).isEnabled().catch(() => null);
                // The chip's own remove button (on the reader only; nothing is saved).
                if (key === 'R' && after.chipsAfter.length) {
                    await wf(a.page).getByRole('button', {name: `Remove ${term('pubkw')}`}).first().click();
                    await sleep(500);
                    after.chipsAfterRemove = await chips(a.page);
                }
                record(name, after);
                await shot(a.page, name).catch(() => {});
                log(name, JSON.stringify({offered, options: s.options, before, after: after.chipsAfter, afterRemove: after.chipsAfterRemove}));
            }
        }

        // The same term twice on one field, saved (on the queued source Q): what the save keeps.
        if (on('dup')) {
            const chips = (page) => wf(page).getByRole('button', {name: /^Remove /}).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.innerText.trim())).catch(() => []);
            await openMetadata(a.page, app, j1, subs.Q);
            const before = await chips(a.page);
            const input = await termInput(a.page, 'keywords', 'en');
            await input.click();
            await input.pressSequentially(term('queuedkw'), {delay: 20});
            await sleep(900);
            await input.press('Enter');
            await sleep(600);
            const typedTwice = await chips(a.page);
            const saved = await pressSave(a.page);
            const s = await screen(a.page);
            Object.assign(s, {chipsBefore: before, chipsTypedTwice: typedTwice, saved});
            record('dup-Q-saved', s);
            await openMetadata(a.page, app, j1, subs.Q);
            const back = await screen(a.page);
            back.chips = await chips(a.page);
            record('dup-Q-reopened', back);
            await shot(a.page, 'dup-Q-reopened').catch(() => {});
            log('dup', JSON.stringify({before, typedTwice, saved, reopened: back.chips}));
        }

        // Leaving the page with a chip added and not saved.
        if (on('leave')) {
            await openMetadata(a.page, app, j1, subs.R);
            let browserDialog = null;
            a.page.once('dialog', async (d) => {
                browserDialog = {type: d.type(), message: d.message()};
                await d.dismiss().catch(() => {});
            });
            const added = await addTerm(a.page, 'keywords', 'en', term('unsavedchip'));
            await wf(a.page).getByRole('link', {name: 'Title & Abstract', exact: true}).first().click();
            await sleep(1500);
            await idle(a.page);
            const s = await screen(a.page);
            s.added = added;
            s.browserDialog = browserDialog;
            s.dialogCount = await a.page.locator('[role="dialog"]:visible').count();
            record('leave-unsaved-chip', s);
            await wf(a.page).getByRole('link', {name: 'Metadata', exact: true}).first().click();
            await sleep(1500);
            await idle(a.page);
            const back = await screen(a.page);
            back.chips = await wf(a.page).getByRole('button', {name: /^Remove /}).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') || e.innerText)).catch(() => []);
            record('leave-unsaved-chip-back', back);
            log('leave', JSON.stringify({added, browserDialog, dialogCount: s.dialogCount, chipsBack: back.chips}));
        }
        record('vocabs-all-window-A', callsA);
        record('vocabs-all-window-B', callsB);
    } finally {
        await a.close();
        await b.close();
    }
});
