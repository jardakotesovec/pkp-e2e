// U28 claim check, chunk K9 — what the "4. Completion" step holds under the
// thank-you text, on OJS and OMP (docs/process/briefs/claim-check.md).
//
// Behind test finding T-ojs-1: Rule 13 says step 4 reads "Review Submitted"
// and the thank-you paragraph "and nothing else"; scenario 6 says "with
// nothing under it"; Rule 12 places the "Review Tasks & Discussions" panel
// on step 3. The OJS suite read the step-4 tab panel and found the panel
// there. pC (P19) and K3 recorded step 4 without it. This script records
// step 4 at several moments — the instant the tab lands, once the panel's
// own data has arrived, on a fresh load, on a typed ?step=4 — and compares
// the panel with step 3's.
//
// Seeds its own scratch context per app (a section editor as stage
// participant, an author, one external reviewer "Kira Reviewer"; one
// submission on External Review, the reviewer seeded `accepted`, so the
// wizard opens on step 1 with "Save and continue").
//
//   PROBE_FEATURE=U28 PROBE_AGENT=ccK9 node bin/probe.js all shared/playwright/checks/U28/K9/k9.js
//
// OPS has no reviewer role: the script records that and returns there.
// No assertions: every screen is recorded with screen()/shot(); the console
// log carries the facts the report cites.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const SCRATCH_FILE = path.join(outDir(), 'scratch.json');
const scratchAll = fs.existsSync(SCRATCH_FILE) ? JSON.parse(fs.readFileSync(SCRATCH_FILE, 'utf8')) : {};
const saveScratch = () => fs.writeFileSync(SCRATCH_FILE, JSON.stringify(scratchAll, null, 2));
const log = (...a) => console.log(...a);
const flat = (s, n = 1500) => (s || '').replace(/\s*\n+\s*/g, ' | ').slice(0, n);
const PANEL = 'Review Tasks & Discussions';

const tabsOf = (page) => page.getByRole('tab').evaluateAll((els) =>
    els.map((e) => `${e.textContent.trim()}:disabled=${e.getAttribute('aria-disabled')}:selected=${e.getAttribute('aria-selected')}`));
const AE = (page) => page.frameLocator('iframe[id^="comments"]:not([id^="commentsPrivate"])').locator('body');
const EO = (page) => page.frameLocator('iframe[id^="commentsPrivate"]').locator('body');

async function snap(page, name) { const s = await screen(page); record(name, s); await shot(page, name); return s; }
async function waitTab(page, n) {
    await page.waitForFunction((n) => document.querySelector('[role=tab][aria-selected=true]')?.textContent.trim().startsWith(`${n}.`), n, {timeout: 30000}).catch(() => {});
    await idle(page);
}
// The two discussion containers the templates mount: step 3's
// `discussionManager-{uuid}` and step 4's `discussionManagerComplete-{uuid}`.
// For each: which tab panel holds it, whether it is visible, its text.
const panels = (page) => page.evaluate((PANEL) => {
    const out = [];
    for (const el of document.querySelectorAll('[id^="discussionManager-"], [id^="discussionManagerComplete-"]')) {
        const tp = el.closest('[role=tabpanel]');
        out.push({
            id: el.id.replace(/-[0-9a-f-]{8,}$/, '-*'),
            tabpanel: tp ? (document.getElementById(tp.getAttribute('aria-labelledby'))?.textContent.trim() || tp.id) : 'none',
            visible: el.offsetParent !== null,
            hasHeading: el.innerText.includes(PANEL),
            addButtons: [...el.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Add').length,
            text: el.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 600),
        });
    }
    return out;
}, PANEL);
const tabpanel4 = (page) => page.getByRole('tabpanel', {name: '4. Completion'});
async function describe4(page, name) {
    const tp = tabpanel4(page);
    const text = await tp.innerText().catch(() => '(no tabpanel 4)');
    const headings = await tp.getByRole('heading').allInnerTexts().catch(() => []);
    const adds = await tp.getByRole('button', {name: 'Add', exact: true}).count().catch(() => -1);
    log(`[${name} tabpanel 4] headings=`, JSON.stringify(headings), 'Add buttons=', adds);
    log(`[${name} tabpanel 4 text]`, flat(text, 1200));
    log(`[${name} containers]`, JSON.stringify(await panels(page)));
    return text;
}
// Wait for step 4's panel to render (the component is `v-if="submission"`:
// nothing shows until its own GET of the submission returns).
async function waitPanel4(page) {
    const t0 = Date.now();
    const ok = await page.waitForFunction((PANEL) => {
        const tp = [...document.querySelectorAll('[role=tabpanel]')].find((p) => document.getElementById(p.getAttribute('aria-labelledby'))?.textContent.includes('4.'));
        return tp && tp.innerText.includes(PANEL) && !/Loading/.test(tp.innerText);
    }, PANEL, {timeout: 30000}).then(() => true).catch(() => false);
    await idle(page);
    return {ok, ms: Date.now() - t0};
}

forEachApp(async (app) => {
    if (app.name === 'ops') { log('[ops] no reviewer role, no wizard (K6): nothing to drive'); return; }
    const sc = scratchAll[app.name] || {};
    scratchAll[app.name] = sc;

    if (!sc.submissionId) {
        const t = tag('u28k9');
        const usersSpec = [
            {username: `${t}ed`, roles: ['sectionEditor'], givenName: 'Edna', familyName: 'Editor'},
            {username: `${t}auth`, roles: ['author'], givenName: 'Arno', familyName: 'Author'},
            {username: `${t}rev`, roles: ['externalReviewer'], givenName: 'Kira', familyName: 'Reviewer'},
        ];
        const ctx = await app.api.createContext({
            tag: t,
            context: {name: `K9 journal ${t}`, contactName: 'K9 Contact', contactEmail: `${t}contact@mail.test`},
            users: usersSpec,
        });
        const r = await app.api.createSubmission({
            tag: `${t}s1`, context: ctx.path, submitter: `${t}auth`, submitted: true,
            title: `U28 K9 S1 ${t}s1`,
            decisions: ['sendExternalReview'],
            reviewRounds: [{reviewers: [{username: `${t}rev`, status: 'accepted'}]}],
            participants: [{username: `${t}ed`, role: 'sectionEditor'}],
        });
        Object.assign(sc, {tag: t, contextPath: ctx.path, rev: `${t}rev`, submissionId: r.submissionId, assignments: r.reviewAssignments});
        saveScratch();
        log(`[seed ${app.name}]`, JSON.stringify(sc));
    }
    const wiz = (q = '') => app.url(`/index.php/${sc.contextPath}/reviewer/submission/${sc.submissionId}${q}`);
    const list = (view) => app.url(`/index.php/${sc.contextPath}/dashboard/reviewAssignments?currentViewId=${view}`);

    const {page, close} = await launch(app);
    const apiLog = [];
    page.on('response', (r) => { const u = r.url(); if (/\/api\/v1\//.test(u) || (/reviewer\/(saveStep|step)/.test(u))) apiLog.push(`${r.request().method()} ${u.replace(app.baseURL, '')} ${r.status()}`); });
    try {
        await signIn(page, sc.rev);
        // to step 3
        await page.goto(wiz()); await idle(page);
        log('[open] tabs=', JSON.stringify(await tabsOf(page)));
        const sc1 = page.getByRole('button', {name: 'Save and continue'});
        if (await sc1.count()) { await sc1.click(); await waitTab(page, 2); }
        const c3 = page.getByRole('button', {name: 'Continue to Step #3'});
        if (await c3.count() && !(await c3.isDisabled())) { await c3.click(); await waitTab(page, 3); }
        await page.locator('iframe[id^="comments"]').first().waitFor({timeout: 30000}).catch(() => {});
        await page.locator('main').getByText(PANEL).first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        const s3 = await snap(page, `step3-${app.name}`);
        log('[step3] tabs=', JSON.stringify(await tabsOf(page)));
        log('[step3 containers]', JSON.stringify(await panels(page)));
        const step3PanelText = (await panels(page)).find((p) => p.id.startsWith('discussionManager-'))?.text || '';
        await loc(page, 'step 3 › "Review Tasks & Discussions" › Add', page.getByRole('tabpanel', {name: '3. Download & Review'}).getByRole('button', {name: 'Add', exact: true}));

        // submit
        await AE(page).fill(`K9 text for author and editor ${sc.tag}`);
        await EO(page).fill('K9 private text');
        const rec = page.locator('select#reviewerRecommendationId');
        if (await rec.count()) await rec.selectOption({label: 'Accept Submission'});
        await page.getByRole('button', {name: 'Submit Review'}).click();
        const confirm = page.getByRole('dialog', {name: 'Confirm'});
        await confirm.waitFor({timeout: 10000});
        apiLog.length = 0;
        await confirm.getByRole('button', {name: 'OK', exact: true}).click();
        await waitTab(page, 4);
        // the instant the tab lands (what pC/K3 recorded)
        const immediate = await snap(page, `step4-landing-immediate-${app.name}`);
        log('[step4 immediate] tabs=', JSON.stringify(await tabsOf(page)), 'panel in main text=', immediate.text.main.includes(PANEL));
        await describe4(page, 'step4 immediate');
        // once the panel has rendered
        const w = await waitPanel4(page);
        log('[step4 settled] panel rendered=', w.ok, 'after ms=', w.ms, 'requests since OK=', JSON.stringify(apiLog));
        const settled = await snap(page, `step4-landing-settled-${app.name}`);
        log('[step4 settled] panel in main text=', settled.text.main.includes(PANEL));
        const t4 = await describe4(page, 'step4 settled');
        log('[step4 settled main text]', flat(settled.text.main, 1600));
        await loc(page, 'step 4 › "Review Tasks & Discussions" › Add', tabpanel4(page).getByRole('button', {name: 'Add', exact: true}));
        await loc(page, 'step 4 tab panel', tabpanel4(page));
        const step4PanelText = (await panels(page)).find((p) => p.id.startsWith('discussionManagerComplete-'))?.text || '';
        log('[panel texts equal step3 vs step4]', step3PanelText === step4PanelText, '| step3=', step3PanelText.slice(0, 300), '| step4=', step4PanelText.slice(0, 300));

        // "Add" on step 4
        const add4 = tabpanel4(page).getByRole('button', {name: 'Add', exact: true});
        if (await add4.count()) {
            await add4.first().click();
            const dlg = page.getByRole('dialog').last();
            await dlg.waitFor({timeout: 15000}).catch(() => {});
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); return d && d.innerText.length > 120; }, null, {timeout: 15000}).catch(() => {});
            await idle(page);
            const d = {aria: await dlg.ariaSnapshot().catch(() => ''), text: await dlg.innerText().catch(() => '')};
            record(`step4-add-modal-${app.name}`, d); await shot(page, `step4-add-modal-${app.name}`);
            log('[step4 Add modal]', flat(d.text, 900));
            await dlg.getByRole('button', {name: 'Cancel', exact: true}).first().click().catch(() => page.keyboard.press('Escape'));
            await dlg.waitFor({state: 'hidden', timeout: 10000}).catch(() => {});
        } else log('[step4 Add] no Add button in tab panel 4');

        // a fresh load (what "View" opens) and the typed ?step=4
        for (const [q, name] of [['', 'fresh'], ['?step=4', 'typed4'], ['?step=3', 'typed3']]) {
            await page.goto(wiz(q)); await idle(page);
            const w2 = await waitPanel4(page);
            if (name === 'typed3') { await page.locator('iframe[id^="comments"]').first().waitFor({timeout: 30000}).catch(() => {}); await page.locator('main').getByText(PANEL).first().waitFor({timeout: 30000}).catch(() => {}); await idle(page); }
            const s = await snap(page, `step4-${name}-${app.name}`);
            log(`[${name}] tabs=`, JSON.stringify(await tabsOf(page)), 'panel4 rendered=', w2.ok, 'ms=', w2.ms, 'panel in main text=', s.text.main.includes(PANEL));
            await describe4(page, name);
        }
        // "View" from the list
        await page.goto(list('reviewer-assignments-completed')); await idle(page);
        await page.waitForFunction(() => { const tb = document.querySelector('main table'); return tb && !/Loading/.test(tb.innerText) && tb.querySelector('tbody tr td'); }, null, {timeout: 30000}).catch(() => {});
        const row = page.getByRole('row').filter({hasText: `${sc.tag}s1`}).first();
        log('[list row]', flat(await row.innerText().catch(() => '(no row)'), 200));
        await row.locator('td').last().locator('a, button').first().click();
        await page.waitForURL(/reviewer\/submission/, {timeout: 30000}); await idle(page);
        const w3 = await waitPanel4(page);
        const v = await snap(page, `step4-view-${app.name}`);
        log('[View] tabs=', JSON.stringify(await tabsOf(page)), 'panel4 rendered=', w3.ok, 'ms=', w3.ms, 'panel in main text=', v.text.main.includes(PANEL));
        await describe4(page, 'View');
        await signOut(page);
    } finally { await close(); }
});
