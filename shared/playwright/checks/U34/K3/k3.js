// U34 claim check, chunk K3: "Attach Files" and its sources, "Select Files", the footer,
// cancelling and finishing (the closing-window table), the active-stage guard, the recorded
// decision (Activity Log, "Login As"), the stage notices, the promoted files, the cross-feature
// pointers, on all three apps.
// Spec: docs/specs/U34-editorial-decision-recording.md lines 177–213, 232–298, 348–355, 410–419, 459–495.
//
// OJS/OMP: one scratch context per app, throwaway accounts mgr, ed, se (deciding), se2
// (recommend-only, set on screen), se3 (unassigned), ce, rv1, rv2, au, rd (OMP adds rv3 internal).
//   a1  Submission stage, two files uploaded on screen   → "Select Files" both ends (untick one), then the chain
//                                                           Cancel Review Round → Accept and Skip Review → Send To Production (nothing ticked)
//                                                           → Move To Copyediting → Move to Review: the attach groups per decision and the closing words
//   a2  round 1, rv1 + rv2 completed, se + se2           → Request Revisions → Resubmit for Review → New Review Round → (round 2) Decline → Revert Decline;
//                                                           the past round's buttons, the typed round addresses, the author's Tasks panel
//   a3  round 1, rv1 accepted, se + se2                  → rv1 uploads a reviewer file and submits; a submission Library file; the "Attach Files"
//                                                           sources on Accept Submission, the reviewer's file attached, the author's round afterwards,
//                                                           the Copyediting and Production notices; the recommendation sentences and "Recommend Accept"
//   a4  Submission stage, one file uploaded on screen    → the footer refusals, the attach-then-delete error, the spinner, the double press,
//                                                           Cancel dialog both ways, Decline → Activity Log → "Login As" Revert Decline → the log's user
//   a6  Submission stage                                 → the stale wizard (two tabs), the bookmarked wizard address
//   a8  OMP only, Submission stage                       → Send to Internal Review; a5 OMP internal round rv3 completed → Recommend Send to External Review
//                                                           (sentence), Send to External Review
// OPS: a scratch server with mgr, mod, mod2, au, rd; p1 queued (mod) → Decline (attach sources, Library both ends, refusal, cancel, record),
//      Activity Log, Login As → Revert Decline, the typed round addresses; the discussions form's composer.
//
//   PROBE_FEATURE=U34 PROBE_AGENT=ccK3 node bin/probe.js all shared/playwright/checks/U34/K3/k3.js
//   PHASES=seed,files,a4,a1,a3,a2,a6,omp,disc,ops   (default all; later phases reuse k3-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const fixture = (app, name) => path.join(REPO, `apps/${app}/playwright/fixtures/files/${name}`);
const ALL = ['seed', 'files', 'a4', 'a1', 'a3', 'a2', 'a6', 'omp', 'disc', 'ops'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k3-state-${app.name}.json`);
const D = {INTERNAL_REVIEW: 1, ACCEPT: 2, EXTERNAL_REVIEW: 3, PENDING_REVISIONS: 4, RESUBMIT: 5, DECLINE: 6, SEND_TO_PRODUCTION: 7, INITIAL_DECLINE: 8, RECOMMEND_ACCEPT: 9, NEW_EXTERNAL_ROUND: 14, REVERT_DECLINE: 15, REVERT_INITIAL_DECLINE: 16, SKIP_EXTERNAL_REVIEW: 17, SKIP_INTERNAL_REVIEW: 18, BACK_FROM_PRODUCTION: 29, BACK_FROM_COPYEDITING: 30, CANCEL_REVIEW_ROUND: 31};

async function sect(name, fn) {
    try { await fn(); } catch (e) { log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 3).join(' | ')); record(`${name.replace(/[^a-z0-9]+/gi, '-')}-FAILED`, {error: String(e.stack || e).slice(0, 800)}); }
}
async function snap(page, name, extra) {
    let s;
    try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
    if (extra) Object.assign(s, extra);
    record(name, s);
    await shot(page, name).catch(() => {});
    return s;
}
const dialogTexts = (page) => page.locator('[role="dialog"]:visible').evaluateAll((els) =>
    els.map((d) => ({
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 5000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit], a')].filter((b) => b.getClientRects().length).map((b) => ({t: (b.getAttribute('aria-label') || b.innerText || b.value || '').trim(), tag: b.tagName.toLowerCase(), href: b.getAttribute('href') || null, disabled: b.disabled || b.getAttribute('aria-disabled') === 'true', cls: b.className.slice(0, 80)})).filter((b) => b.t).slice(0, 60),
        inputs: [...d.querySelectorAll('input, select, textarea')].filter((i) => i.getClientRects().length || i.type === 'radio' || i.type === 'checkbox').map((i) => ({type: i.type, name: i.name || null, value: i.type === 'password' ? '***' : String(i.value).slice(0, 120), checked: i.checked, label: (i.id && document.querySelector(`label[for="${i.id}"]`)?.innerText || i.closest('label')?.innerText || '').trim().slice(0, 160)})).slice(0, 40),
        headings: [...d.querySelectorAll('h1,h2,h3,h4')].filter((h) => h.getClientRects().length).map((h) => h.innerText.trim().replace(/\s+/g, ' ')).slice(0, 20),
        lists: [...d.querySelectorAll('.listPanel, [class*="listPanel"]')].filter((p) => p.getClientRects().length && (p.classList.contains('listPanel'))).map((p) => ({title: (p.querySelector('.listPanel__title, h2, h3') || {}).innerText?.trim() || null, items: [...p.querySelectorAll('.listPanel__item, li')].map((it) => ({text: it.innerText.trim().replace(/\s+/g, ' ').slice(0, 220), checked: it.querySelector('input[type=checkbox]')?.checked ?? null, links: [...it.querySelectorAll('a')].map((a) => a.innerText.trim()).filter(Boolean)})).slice(0, 20), empty: /No items/i.test(p.innerText)})).slice(0, 8),
    }))).catch(() => []);
// The workflow dialog as data.
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const tables = [...root.querySelectorAll('table')].filter(vis).map((t) => ({
        name: t.getAttribute('aria-label') || (t.getAttribute('aria-labelledby') && document.getElementById(t.getAttribute('aria-labelledby'))?.innerText.trim()) || (t.querySelector('caption') || {}).innerText?.trim() || null,
        rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)),
    }));
    const hs = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis);
    const headings = hs.map((e) => e.innerText.trim()).filter(Boolean).slice(0, 60);
    const btnEls = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis);
    const buttons = btnEls.map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 80);
    const actionRegion = root.querySelector('[data-cy="workflow-action-items"]');
    const actionButtons = actionRegion ? [...actionRegion.querySelectorAll('button')].filter(vis).map((b) => ({text: b.innerText.trim(), primary: /\bbg-primary\b/.test(b.className)})) : null;
    const notices = [...root.querySelectorAll('[role=alert], [role=status], [class*="otification"], .pkpBadge, [class*="badge"]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40);
    const byHeading = (re) => { const h = hs.find((x) => re.test(x.innerText.trim())); return h && h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 400) : null; };
    const lines = (dlgs[0] ? dlgs[0].innerText : '').split('\n').map((l) => l.trim()).filter(Boolean);
    const closeAt = lines.indexOf('Close');
    const header = dlgs[0] ? lines.slice(closeAt >= 0 ? closeAt + 1 : 0, (closeAt >= 0 ? closeAt + 1 : 0) + 6).join(' | ') : null;
    const lists = [...root.querySelectorAll('ul, ol')].filter(vis).filter((l) => l.getAttribute('aria-label')).map((l) => ({name: l.getAttribute('aria-label'), items: [...l.children].map((c) => c.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)).slice(0, 30)})).slice(0, 20);
    const menu = [...root.querySelectorAll('nav button, nav a, [class*="stageMenu"] button, aside button')].filter(vis).map((b) => b.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40);
    return {dialogCount: dlgs.length, headings, buttons, actionButtons, tables, notices, lists, menu, notice: byHeading(/^Notification$/i), status: byHeading(/^Status$/i), recommendation: byHeading(/^Recommendation$/i), header, bodyStart: root.innerText.replace(/\s+/g, ' ').slice(0, 800)};
});
// The decision wizard page as data.
const wizInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const main = document.querySelector('main') || document.body;
    const txt = (e) => (e ? e.innerText.trim().replace(/\s+/g, ' ') : null);
    const labelOf = (i) => {
        const l = i.id && document.querySelector(`label[for="${i.id}"]`);
        return (l ? l.innerText : (i.closest('label') || i.getAttribute('aria-label') || i.placeholder || i.parentElement || {}).innerText || i.getAttribute('aria-label') || i.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 160);
    };
    const h1 = main.querySelector('h1');
    const desc = main.querySelector('.app__pageDescription') || (h1 && h1.nextElementSibling);
    const railList = [...main.querySelectorAll('ol, ul')].find((l) => /Complete the following steps/i.test(l.getAttribute('aria-label') || ''));
    const rail = railList ? [...railList.children].map((li) => { const c = li.querySelector('button, a') || li.querySelector('span'); return {text: txt(li), tag: c ? c.tagName.toLowerCase() : null, current: li.getAttribute('aria-current') || c?.getAttribute('aria-current') || (/current/i.test(li.className + (c ? c.className : '')) ? 'cls' : null)}; }) : null;
    const hs = [...main.querySelectorAll('h1,h2,h3,h4,legend')].filter(vis).map((e) => ({tag: e.tagName.toLowerCase(), text: txt(e), next: e.nextElementSibling && vis(e.nextElementSibling) ? txt(e.nextElementSibling).slice(0, 300) : null})).slice(0, 30);
    const btns = [...main.querySelectorAll('button, a.pkp_button, a[role=button], input[type=submit]')].filter(vis).map((b) => ({text: (b.innerText || b.getAttribute('aria-label') || b.value || '').trim().replace(/\s+/g, ' ').slice(0, 80), aria: b.getAttribute('aria-label'), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true', primary: /\bbg-primary\b|pkpButton--isPrimary/.test(b.className), warnable: /isWarnable|negative/.test(b.className), cls: b.className.slice(0, 100), inFooter: !!b.closest('[class*="footer"]')})).filter((b) => b.text).slice(0, 120);
    const footerOrder = [...main.querySelectorAll('[class*="footer"] button, [class*="footer"] a')].filter(vis).map((b) => ({text: txt(b).slice(0, 40), x: Math.round(b.getBoundingClientRect().x), disabled: b.disabled, primary: /\bbg-primary\b|pkpButton--isPrimary/.test(b.className), warnable: /isWarnable|negative/.test(b.className)})).sort((a, b) => a.x - b.x);
    const inputs = [...main.querySelectorAll('input, textarea, select')].filter((i) => vis(i) || i.type === 'checkbox' || i.type === 'radio').map((i) => ({type: i.type, name: i.name || null, id: i.id || null, label: labelOf(i), value: String(i.value).slice(0, 300), checked: i.type === 'checkbox' || i.type === 'radio' ? i.checked : undefined, disabled: i.disabled, visible: vis(i)})).slice(0, 60);
    const links = [...main.querySelectorAll('a[href]')].filter(vis).map((a) => ({text: txt(a).slice(0, 80), href: a.getAttribute('href')})).filter((a) => a.text).slice(0, 40);
    const composer = [...main.querySelectorAll('[class*="composer"]')].filter(vis).map((e) => ({cls: [...e.classList].filter((c) => /composer/.test(c)).join(' '), text: txt(e).slice(0, 240)})).slice(0, 60);
    const removeBtns = btns.filter((b) => /^(Remove|Deselect)/i.test(b.aria || b.text)).map((b) => b.aria || b.text);
    const toolbar = [...main.querySelectorAll('.tox-toolbar__primary button, .tox-toolbar button')].filter(vis).map((b) => b.getAttribute('aria-label') || b.title || b.innerText.trim()).slice(0, 30);
    const edList = window.tinymce ? (Array.isArray(window.tinymce.editors) ? window.tinymce.editors : (window.tinymce.get() || [])) : [];
    const editors = edList.map((ed) => { try { return {id: ed.id, content: ed.getContent({format: 'text'}).replace(/\s+/g, ' ').slice(0, 700)}; } catch (e) { return {id: ed.id, error: String(e.message)}; } });
    const mask = main.querySelector('.composer__loadingTemplateMask');
    const panels = [...main.querySelectorAll('.listPanel')].filter(vis).map((p) => ({title: txt(p.querySelector('.listPanel__title, h2, h3')), items: [...p.querySelectorAll('.listPanel__item')].map((it) => ({text: txt(it).slice(0, 260), checked: it.querySelector('input[type=checkbox]')?.checked ?? null, links: [...it.querySelectorAll('a')].map((a) => ({text: a.innerText.trim(), href: (a.getAttribute('href') || '').slice(0, 120)})), parts: [...it.querySelectorAll('span, div')].filter((x) => x.children.length === 0 && x.innerText.trim()).map((x) => x.innerText.trim().replace(/\s+/g, ' ').slice(0, 80)).slice(0, 12)})).slice(0, 20), empty: /No items/i.test(p.innerText)})).slice(0, 8);
    const notifications = [...main.querySelectorAll('[role=alert], .pkpNotification, [class*="pkpNotification"], [class*="notification"]')].filter(vis).map((e) => ({cls: e.className.slice(0, 80), text: txt(e).slice(0, 300), y: Math.round(e.getBoundingClientRect().y)})).slice(0, 12);
    const errors = [...main.querySelectorAll('.pkpFieldError, [class*="FieldError"], [class*="error"]')].filter(vis).map((e) => ({cls: e.className.slice(0, 80), text: txt(e).slice(0, 200)})).filter((e) => e.text).slice(0, 12);
    const skip = btns.find((b) => /Skip this email|Don't skip this email/i.test(b.text));
    const spinner = !!main.querySelector('.pkpSpinner, [class*="spinner"]:not([hidden])');
    return {url: location.href, title: document.title, h1: txt(h1), description: txt(desc), rail, headings: hs, buttons: btns, footerOrder, inputs, links, composer, removeBtns, toolbar, editors, maskVisible: !!(mask && vis(mask)), panels, notifications, errors, skip: skip ? skip.text : null, spinner, text: main.innerText.slice(0, 7000)};
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => ({text: e.textContent.trim().replace(/\s+/g, ' '), disabled: e.hasAttribute('disabled') || e.getAttribute('aria-disabled') === 'true'}))).catch(() => []);
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
async function closeTop(page) {
    const top = topWin(page);
    const c = top.locator('button:visible, a:visible').filter({hasText: /^\s*(Cancel|Close)\s*$/}).last();
    if (await c.count()) { await c.click({timeout: 5000}).catch(() => {}); await idle(page); await page.waitForTimeout(400); }
    else { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(400); }
}
const isWizard = (page) => /\/decision\/record\//.test(page.url());
async function waitWizard(page) {
    await page.waitForURL(/decision\/record/, {timeout: 20000}).catch(() => {});
    await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
    await idle(page);
    await page.waitForFunction(() => !!document.querySelector('main h1') || document.body.innerText.length > 200, null, {timeout: 15000}).catch(() => {});
}

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const PDF = fixture(app.name, isOPS ? 'preprint.pdf' : 'article.pdf');
    const TXT = fixture(app.name, 'not-an-image.txt');
    const MD = fixture(isOPS ? 'ojs' : app.name, 'notes.md');
    const ctxUrl = (p, cp) => app.url(`/index.php/${cp || sc.contextPath}${p}`);
    const workflow = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const authorWorkflow = (id, key) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const decisionUrl = (id, decision, roundId, cp) => ctxUrl(`/decision/record/${id}?decision=${decision}${roundId ? `&reviewRoundId=${roundId}` : ''}`, cp);
    const signInAs = async (page, u, cp) => { await signIn(page, u, {contextPath: cp || sc.contextPath}); await idle(page); };
    const dialogsSeen = [];
    const armDialogs = (page) => page.on('dialog', async (d) => { dialogsSeen.push({type: d.type(), message: d.message(), url: page.url()}); log('[browser dialog]', d.type(), flat(d.message(), 120)); await d.accept().catch(() => {}); });

    async function openWorkflow(page, url, label) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page).catch((e) => ({error: String(e.message)}));
        const dialogs = await dialogTexts(page);
        const s = await snap(page, label, {info, dialogs: dialogs.map((d) => ({name: d.name, buttons: d.buttons.map((b) => b.t), text: d.text.slice(0, 1500)}))});
        log(`[${label}]`, app.name, 'header:', flat(info.header, 90), '| actions:', JSON.stringify((info.actionButtons || []).map((b) => `${b.text}${b.primary ? '*' : ''}`)), '| notice:', flat(info.notice, 100), '| tables:', JSON.stringify((info.tables || []).map((t) => `${t.name}: ${t.rows.length}`)));
        return {info, dialogs, s};
    }
    async function readWizardPage(page, label, extra) {
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page);
        await page.waitForFunction(() => { const m = document.querySelector('main') || document.body; const c = m.querySelector('.composer'); if (!c) return true; const inp = [...m.querySelectorAll('input')].find((i) => /subject/i.test((i.id && document.querySelector(`label[for="${i.id}"]`)?.innerText) || i.name || i.getAttribute('aria-label') || '')); return inp && inp.value.length > 0; }, null, {timeout: 15000}).catch(() => {});
        const w = await wizInfo(page).catch((e) => ({error: String(e.message), url: page.url()}));
        await snap(page, label, {wiz: w, ...(extra || {})});
        log(`[${label}]`, 'h1:', flat(w.h1, 80), '| desc:', flat(w.description, 140), '| rail:', JSON.stringify((w.rail || []).map((r) => `${r.text}<${r.tag}>${r.current ? '*' : ''}`)), '| footer:', JSON.stringify((w.footerOrder || []).map((b) => `${b.text}${b.primary ? '*' : ''}${b.warnable ? '!' : ''}${b.disabled ? '(dis)' : ''}`)), '| skip:', w.skip, '| removeBtns:', JSON.stringify(w.removeBtns), '| panels:', JSON.stringify((w.panels || []).map((p) => `${p.title}:${p.items.map((i) => (i.checked ? '[x]' : '[ ]') + i.text.slice(0, 50)).join(';')}`)), '| errors:', JSON.stringify(w.errors), '| notif:', JSON.stringify((w.notifications || []).map((n) => n.text.slice(0, 80))));
        return w;
    }
    async function pressDecision(page, name, label, {choice} = {}) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const btn = dlg.getByRole('button', {name, exact: true}).first();
        if (!(await btn.count())) { record(`${label}-button-absent`, {name, buttons: (await wfInfo(page)).actionButtons}); log(`[${label}] button "${name}" absent`); return {absent: true}; }
        await loc(page, `${label}: "${name}"`, btn);
        const before = page.url();
        await btn.click(); await idle(page);
        const out = {pressed: name, windows: []};
        for (let i = 0; i < 4 && !isWizard(page); i++) {
            await page.waitForFunction((b) => location.href !== b || [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).length > 1, before, {timeout: 8000}).catch(() => {});
            if (isWizard(page)) break;
            const ds = await dialogTexts(page);
            const top = ds[ds.length - 1];
            if (!top || ds.length < 2) break;
            const win = {name: top.name, text: flat(top.text, 800), buttons: top.buttons.map((b) => b.t), inputs: top.inputs.filter((x) => x.type === 'radio' || x.type === 'checkbox')};
            out.windows.push(win);
            record(`${label}-window${i + 1}`, win);
            log(`[${label} window]`, win.name, '|', flat(top.text, 200), '|', JSON.stringify(win.buttons));
            const t = topWin(page);
            if (choice && typeof choice === 'number') { const radios = t.locator('input[type=radio]'); if (await radios.count() > choice) await radios.nth(choice).check({force: true}); }
            const next = t.getByRole('button', {name: /^(Next|Yes, Continue|Continue|OK)$/}).first();
            if (await next.count()) { await next.click(); await idle(page); } else break;
        }
        if (isWizard(page)) await waitWizard(page);
        out.url = page.url();
        return out;
    }
    // Walk the wizard's pages with Continue, read each; stop on the last (Record Decision visible).
    async function walkWizard(page, label) {
        const pages = [];
        for (let n = 1; n < 7; n++) {
            const w = await readWizardPage(page, `${label}-p${n}`);
            pages.push({n, h1: w.h1, description: w.description, rail: (w.rail || []).map((r) => `${r.text}<${r.tag}>${r.current ? '*' : ''}`), panelHeading: (w.headings || []).find((h) => h.tag === 'h2')?.text || null, footer: (w.footerOrder || []).map((b) => `${b.text}${b.primary ? '*' : ''}${b.warnable ? '!' : ''}`), skip: w.skip, removeBtns: w.removeBtns, panels: (w.panels || []).map((p) => ({title: p.title, items: p.items.map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.text.slice(0, 80)}`), empty: p.empty})), hasAttach: (w.buttons || []).some((b) => /^Attach Files$/.test(b.text)), url: w.url});
            const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
            if (await rec.isVisible().catch(() => false)) break;
            const cont = page.getByRole('button', {name: 'Continue', exact: true}).first();
            if (!(await cont.isVisible().catch(() => false))) break;
            await cont.click(); await idle(page); await page.waitForTimeout(300);
        }
        record(`${label}-pages`, pages);
        return pages;
    }
    async function cancelWizard(page, label, {keepWorkingFirst} = {}) {
        const cancel = page.getByRole('button', {name: 'Cancel', exact: true}).first();
        if (!(await cancel.count())) { record(`${label}-cancel-absent`, {url: page.url()}); return null; }
        await cancel.click(); await page.waitForTimeout(500); await idle(page);
        let ds = await dialogTexts(page);
        const d = ds[ds.length - 1];
        const out = {dialog: d ? {name: d.name, text: flat(d.text, 400), buttons: d.buttons.map((b) => `${b.t}<${b.tag} ${b.cls}>`)} : null};
        await shot(page, `${label}-cancel-dialog`).catch(() => {});
        if (keepWorkingFirst && d) {
            const before = await wizInfo(page);
            await topWin(page).getByRole('button', {name: 'Keep Working'}).click(); await page.waitForTimeout(500); await idle(page);
            const after = await wizInfo(page);
            out.keepWorking = {url: after.url, sameH1: before.h1 === after.h1, sameSubject: JSON.stringify(before.inputs.find((i) => /Subject/i.test(i.label))?.value) === JSON.stringify(after.inputs.find((i) => /Subject/i.test(i.label))?.value), dialogsOpen: (await dialogTexts(page)).length};
            await cancel.click(); await page.waitForTimeout(500); await idle(page);
        }
        const cd = topWin(page).getByRole('button', {name: 'Cancel Decision'}).first();
        if (await cd.count()) { await cd.click(); await idle(page); await page.waitForTimeout(800); await idle(page); }
        out.landed = page.url();
        const info = await wfInfo(page).catch(() => ({}));
        out.landedHeader = info.header; out.landedActions = (info.actionButtons || []).map((b) => b.text);
        record(`${label}-cancel`, out);
        log(`[${label} cancel]`, JSON.stringify(out).slice(0, 500));
        return out;
    }
    // "Record Decision" → the closing window → leave by its link (or close another way).
    async function recordWizard(page, label, {closeWith = 'link', sampleSpinner = false, doublePress = false} = {}) {
        const rec = page.getByRole('button', {name: 'Record Decision', exact: true}).first();
        const samples = [];
        if (doublePress) {
            await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Record Decision'); b.click(); b.click(); setTimeout(() => b.click(), 60); });
        } else await rec.click({noWaitAfter: true});
        if (sampleSpinner || doublePress) {
            const t0 = Date.now();
            while (Date.now() - t0 < 4000) {
                const s = await page.evaluate(() => { const vis = (e) => e.getClientRects().length > 0; const f = document.querySelector('[class*="footer"]'); const btns = f ? [...f.querySelectorAll('button')].filter(vis).map((b) => ({t: b.innerText.trim(), dis: b.disabled})) : []; const sp = f ? [...f.querySelectorAll('[class*="pinner"], svg, [aria-busy]')].filter(vis).map((e) => e.className.baseVal || e.className || e.tagName) : []; const dlg = [...document.querySelectorAll('[role=dialog]')].some(vis); return {t: Date.now(), btns, sp, dlg}; }).catch(() => null);
                if (s) samples.push(s);
                if (s && s.dlg) break;
                await page.waitForTimeout(40);
            }
        }
        await idle(page);
        await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].some((e) => e.getClientRects().length) || document.querySelector('[role=alert], .pkpNotification'), null, {timeout: 30000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const w = await wizInfo(page).catch(() => ({}));
        const ds = await dialogTexts(page);
        const d = ds[ds.length - 1];
        const out = {url: page.url(), dialog: d ? {name: d.name, text: flat(d.text, 600), buttons: d.buttons.map((b) => `${b.t}<${b.tag}${b.href ? ' ' + b.href.slice(0, 80) : ''}>`)} : null, dialogCount: ds.length, notifications: (w.notifications || []).map((n) => n.text), errors: w.errors, h1: w.h1, samples: samples.slice(0, 30)};
        await snap(page, `${label}-recorded`, {out});
        log(`[${label} recorded]`, JSON.stringify({dialog: out.dialog, notifications: out.notifications, errors: out.errors}).slice(0, 700), '| samples:', JSON.stringify(samples.slice(0, 4)).slice(0, 300));
        if (d && closeWith !== 'stay') {
            const t = topWin(page);
            let leave = closeWith === 'cross' ? t.getByRole('button', {name: /^Close$/}).first() : t.getByRole('link', {name: /View Submission|View All/}).first();
            if (closeWith === 'escape') { await page.keyboard.press('Escape'); await page.waitForTimeout(800); out.leftWith = 'Escape'; }
            else if (closeWith === 'backdrop') { await page.mouse.click(5, 5); await page.waitForTimeout(800); out.leftWith = 'backdrop'; }
            else {
                if (!(await leave.count())) leave = t.getByRole('button', {name: /View Submission|Close|OK/}).first();
                if (await leave.count()) { out.leftWith = flat(await leave.innerText().catch(() => '') || await leave.getAttribute('aria-label'), 60); await leave.click(); }
            }
            await idle(page); await page.waitForTimeout(1000); await idle(page);
            out.landed = page.url(); out.stillDialog = (await dialogTexts(page)).length;
            const info = await wfInfo(page).catch(() => ({}));
            out.landedHeader = info.header; out.landedActions = (info.actionButtons || []).map((b) => b.text); out.landedNotice = info.notice; out.landedStatus = info.status; out.landedTables = (info.tables || []).map((t) => ({name: t.name, rows: t.rows}));
            await snap(page, `${label}-recorded-landed`, {out});
        }
        record(`${label}-record`, out);
        log(`[${label} landed]`, out.leftWith, out.landed, '|', flat(out.landedHeader, 80), '| notice:', flat(out.landedNotice, 100), '| tables:', JSON.stringify((out.landedTables || []).map((t) => `${t.name}: ${t.rows.join(' / ').slice(0, 120)}`)).slice(0, 500));
        return out;
    }
    async function participantMenu(page, name, item, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const row = dlg.locator('li, tr').filter({hasText: new RegExp(name)}).filter({has: page.locator('button')}).last();
        const more = row.getByRole('button', {name: /More Actions|Options/}).first();
        if (!(await more.count())) { record(`${label}-participants-row`, {absent: true, name}); log(`[${label}] no row menu for ${name}`); return false; }
        await more.click(); await idle(page);
        const items = await menuItems(page);
        record(`${label}-participants-row-menu`, {name, items});
        const it = page.getByRole('menuitem', {name: new RegExp(`^${item}`)}).first();
        if (!(await it.count())) { await page.keyboard.press('Escape'); return false; }
        await it.click(); await idle(page);
        return true;
    }
    async function setRecommendOnly(page, name, label) {
        if (!(await participantMenu(page, name, 'Edit', label))) return false;
        const form = topWin(page);
        await form.waitFor({timeout: 30000});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('input[name="recommendOnly"]'); }, null, {timeout: 20000}).catch(() => {});
        await idle(page);
        const box = form.locator('input[name="recommendOnly"]');
        if (!(await box.count())) { record(`${label}-recommendOnly-box`, {absent: true}); await closeTop(page); return false; }
        await box.check();
        await form.getByRole('button', {name: /^(OK|Save)$/}).last().click(); await idle(page);
        await page.waitForTimeout(800); await idle(page);
        const info = await wfInfo(page);
        record(`${label}-recommendOnly-after`, {lists: info.lists, bodyStart: info.bodyStart});
        log(`[${label}] recommend-only set for ${name}`);
        return true;
    }
    async function activityLog(page, label) {
        const btn = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: /Activity Log/}).first();
        if (!(await btn.count())) { record(label, {absent: true}); return null; }
        await btn.click();
        const dlg = topWin(page);
        await dlg.waitFor({timeout: 30000}).catch(() => {});
        await dlg.locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        const rows = await dlg.locator('table tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ').slice(0, 300))).filter((r) => r.length > 1 && !/pkpHandler|function\(/.test(r.join(' ')))).catch(() => []);
        await snap(page, label, {rows});
        log(`[${label}]`, JSON.stringify(rows.slice(0, 5)).slice(0, 900));
        await closeTop(page);
        return rows;
    }
    async function tasksPanel(page, label) {
        const btn = page.getByRole('button', {name: /Tasks/}).first();
        if (!(await btn.count())) { record(label, {absent: true}); return null; }
        const lbl = flat(await btn.innerText().catch(() => ''), 40);
        await btn.click(); await page.waitForTimeout(500);
        const dlg = topWin(page);
        await dlg.waitFor({timeout: 15000}).catch(() => {});
        await dlg.locator('table tbody tr, li').first().waitFor({timeout: 10000}).catch(() => {});
        await idle(page);
        const d = (await dialogTexts(page)).slice(-1)[0];
        const links = await dlg.locator('a[href]').evaluateAll((els) => els.map((a) => ({text: a.innerText.trim().replace(/\s+/g, ' ').slice(0, 120), href: a.getAttribute('href')}))).catch(() => []);
        await snap(page, label, {button: lbl, dialog: d && {name: d.name, text: flat(d.text, 1500)}, links});
        log(`[${label}]`, lbl, '|', flat(d && d.text, 300));
        await closeTop(page);
        return {button: lbl, text: d && d.text, links};
    }
    // The legacy three-tab upload wizard (already open).
    async function driveWizard(page, file) {
        const wiz = page.getByRole('dialog').filter({has: page.locator('div[id^="fileUploadWizard"]')}).last();
        await wiz.waitFor({timeout: 30000});
        await wiz.locator('input[type="file"]').waitFor({state: 'attached', timeout: 30000});
        const genre = wiz.locator('select[id^="genreId"]');
        if (await genre.count()) {
            const opts = await genre.locator('option').evaluateAll((els) => els.map((o) => ({text: o.text.trim(), value: o.value})));
            const pick = opts.find((o) => o.value && o.value !== '' && !/^(Select|Choose)/i.test(o.text));
            if (pick) await genre.selectOption(pick.value);
        }
        await wiz.locator('input[type="file"]').setInputFiles(file);
        await wiz.getByRole('button', {name: 'Continue', exact: true}).waitFor({timeout: 30000});
        await idle(page);
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        await wiz.getByRole('button', {name: 'Continue', exact: true}).click(); await idle(page);
        await wiz.getByRole('button', {name: 'Complete', exact: true}).waitFor({timeout: 30000});
        await wiz.getByRole('button', {name: 'Complete', exact: true}).click(); await idle(page);
        await wiz.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page);
    }
    // "Upload" (exact) above a Vue list on the open workflow (Submission Files).
    async function uploadDirect(page, file, label, nth = 0) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const up = dlg.getByRole('button', {name: 'Upload', exact: true}).nth(nth);
        await up.click(); await idle(page);
        await driveWizard(page, file);
        await page.waitForTimeout(800); await idle(page);
        const info = await wfInfo(page);
        record(`${label}-after`, {tables: info.tables});
        log(`[${label}] tables:`, JSON.stringify(info.tables.map((t) => `${t.name}: ${t.rows.join(' | ')}`)).slice(0, 400));
        return info;
    }
    // The workflow header's "Library" → "Add a file" form → save; returns the window's rows.
    async function addLibraryFile(page, file, name, label) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const lib = dlg.getByRole('button', {name: 'Library', exact: true}).first();
        if (!(await lib.count())) { record(`${label}-library-absent`, {}); return null; }
        await lib.click(); await idle(page);
        const win = topWin(page);
        await win.waitFor({timeout: 20000});
        await win.locator('a, button').filter({hasText: /Add a file|Add File/i}).first().waitFor({timeout: 20000}).catch(() => {});
        await idle(page);
        const d0 = (await dialogTexts(page)).slice(-1)[0];
        await snap(page, `${label}-library-window`, {dialog: d0 && {name: d0.name, text: flat(d0.text, 800), buttons: d0.buttons.map((b) => b.t)}});
        const add = win.locator('a, button').filter({hasText: /Add a file|Add File/i}).first();
        if (!(await add.count())) { record(`${label}-library-add-absent`, {buttons: d0 && d0.buttons.map((b) => b.t)}); await closeTop(page); return null; }
        await add.click(); await idle(page);
        const form = topWin(page);
        await form.locator('input[name^="libraryFileName"]').first().waitFor({timeout: 20000});
        await form.locator('input[name^="libraryFileName"]').first().fill(name);
        const sel = form.locator('select[name="fileType"]');
        if (await sel.count()) { const opts = await sel.locator('option').evaluateAll((els) => els.map((o) => o.value)); const v = opts.find((o) => o && o !== ''); if (v) await sel.selectOption(v); }
        await form.locator('input[type="file"]').setInputFiles(file);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); const t = d && d.querySelector('input[name="temporaryFileId"]'); return t && t.value; }, null, {timeout: 30000}).catch(() => {});
        await idle(page);
        const d1 = (await dialogTexts(page)).slice(-1)[0];
        record(`${label}-library-form`, {dialog: d1 && {name: d1.name, text: flat(d1.text, 800), buttons: d1.buttons.map((b) => b.t), inputs: d1.inputs}});
        await form.getByRole('button', {name: /^(Save|OK)$/}).last().click(); await idle(page);
        await page.waitForTimeout(1000); await idle(page);
        const d2 = (await dialogTexts(page)).slice(-1)[0];
        await snap(page, `${label}-library-after`, {dialog: d2 && {name: d2.name, text: flat(d2.text, 800)}});
        log(`[${label}] library window after add:`, flat(d2 && d2.text, 300));
        await closeTop(page);
        return d2 && d2.text;
    }
    // The reviewer: accept the request, reach step 3, upload a reviewer file, submit the review.
    async function reviewerUploads(page, user, id, file, label, cp) {
        await signInAs(page, user, cp);
        await page.goto(ctxUrl(`/reviewer/submission/${id}`, cp)); await idle(page);
        const accept = page.getByRole('button', {name: /Accept Review, Continue to Step #2/}).filter({visible: true});
        const saveBtn = page.getByRole('button', {name: 'Save and continue', exact: true}).filter({visible: true});
        const step3 = page.getByRole('button', {name: 'Continue to Step #3'}).filter({visible: true});
        const submit = page.getByRole('button', {name: 'Submit Review', exact: true}).filter({visible: true});
        await accept.or(saveBtn).or(step3).or(submit).first().waitFor({timeout: 30000});
        await snap(page, `${label}-step1`);
        if (await accept.count() || await saveBtn.count()) {
            const privacy = page.locator('input[name="privacyConsent"]').filter({visible: true});
            if (await privacy.count()) await privacy.check();
            await accept.or(saveBtn).first().click(); await idle(page);
        }
        await step3.or(submit).first().waitFor({timeout: 30000});
        if (await step3.count()) { await step3.first().click(); await idle(page); }
        await submit.waitFor({timeout: 30000});
        await snap(page, `${label}-step3`);
        // the "Reviewer Files" grid's upload link
        const upLink = page.locator('a:visible').filter({hasText: /^\s*Upload File\s*$/}).first();
        const grid = await page.evaluate(() => { const g = [...document.querySelectorAll('.pkp_controllers_grid')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 300)); return g; });
        record(`${label}-step3-grids`, {grids: grid, uploadLink: await upLink.count()});
        if (await upLink.count()) {
            await upLink.click(); await idle(page);
            await driveWizard(page, file);
            await page.waitForTimeout(800); await idle(page);
        }
        const after = await page.evaluate(() => [...document.querySelectorAll('.pkp_controllers_grid')].filter((e) => e.getClientRects().length).map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 300)));
        await snap(page, `${label}-step3-uploaded`, {grids: after});
        log(`[${label}] step 3 grids after upload:`, JSON.stringify(after).slice(0, 400));
        // submit the review (recommendation on OJS/OMP: first option)
        const rec = page.locator('select[name="reviewerRecommendationId"]:visible, select[name="recommendation"]:visible').first();
        if (await rec.count()) { const opts = await rec.locator('option').evaluateAll((els) => els.map((o) => o.value)); const v = opts.find((o) => o && o !== ''); if (v) await rec.selectOption(v); }
        await submit.first().click(); await idle(page);
        await page.waitForTimeout(600);
        const conf = (await dialogTexts(page)).slice(-1)[0];
        record(`${label}-submit-confirm`, conf && {name: conf.name, text: flat(conf.text, 300), buttons: conf.buttons.map((b) => b.t)});
        const ok = topWin(page).getByRole('button', {name: /^(OK|Yes|Submit)$/}).last();
        if (await ok.count()) { await ok.click(); await idle(page); await page.waitForTimeout(800); }
        await snap(page, `${label}-submitted`);
        log(`[${label}] review submitted:`, flat((await page.locator('main, body').first().innerText().catch(() => '')), 200));
    }
    // "Attach Files" drives on the wizard page under the cursor: every source, both ends where reachable.
    async function attachDrives(page, label, {expectReview, attachReviewer, uploadFile, libraryEnd, submissionGroups} = {}) {
        const out = {};
        const attach = page.getByRole('button', {name: 'Attach Files', exact: true}).first();
        await loc(page, `${label}: toolbar "Attach Files"`, attach);
        await attach.click(); await page.waitForTimeout(800); await idle(page);
        let d = (await dialogTexts(page)).slice(-1)[0];
        out.window = d && {name: d.name, text: flat(d.text, 1500), buttons: d.buttons.map((b) => b.t), headings: d.headings};
        await snap(page, `${label}-attach-window`, {dialog: out.window});
        log(`[${label} attach window]`, d && d.name, '|', flat(d && d.text, 300));
        const win = () => topWin(page);
        const back = async () => { const b = win().locator('a:visible, button:visible').filter({hasText: /^\s*Back\s*$/}).first(); if (await b.count()) { await b.click(); await page.waitForTimeout(500); await idle(page); } };
        // Upload File
        const upBtn = win().getByRole('button', {name: 'Upload File', exact: true}).first();
        if (await upBtn.count()) {
            await upBtn.click(); await page.waitForTimeout(800); await idle(page);
            d = (await dialogTexts(page)).slice(-1)[0];
            out.uploadWindow = d && {name: d.name, text: flat(d.text, 800), buttons: d.buttons.map((b) => `${b.t}<${b.tag}>${b.disabled ? '(dis)' : ''}`), dropZone: await win().locator('[class*="fileUploader"], [class*="dropzone"], [class*="uploader"]').first().evaluate((e) => ({text: e.innerText.trim().replace(/\s+/g, ' ').slice(0, 200), border: getComputedStyle(e).borderStyle})).catch(() => null)};
            await snap(page, `${label}-attach-upload-window`, {dialog: out.uploadWindow});
            log(`[${label} upload window]`, JSON.stringify(out.uploadWindow).slice(0, 500));
            if (uploadFile) {
                const input = win().locator('input[type="file"]').first();
                await input.setInputFiles(uploadFile);
                const t0 = Date.now(); const prog = [];
                while (Date.now() - t0 < 6000) { const s = await win().evaluate((e) => ({text: e.innerText.replace(/\s+/g, ' ').slice(0, 400), progress: !!e.querySelector('progress, [role=progressbar], [class*="rogress"]'), buttons: [...e.querySelectorAll('button')].filter((b) => b.getClientRects().length).map((b) => `${b.innerText.trim()}${b.disabled ? '(dis)' : ''}`)})).catch(() => null); if (s) prog.push(s); if (s && /Remove/.test(s.buttons.join(' ')) && !s.progress) break; await page.waitForTimeout(150); }
                await idle(page);
                d = (await dialogTexts(page)).slice(-1)[0];
                out.uploaded = {progressSamples: prog.slice(0, 6), window: d && {text: flat(d.text, 600), buttons: d.buttons.map((b) => `${b.t}<${b.tag}>${b.disabled ? '(dis)' : ''}`)}};
                await snap(page, `${label}-attach-uploaded`, {out: out.uploaded});
                log(`[${label} uploaded]`, JSON.stringify(out.uploaded.window).slice(0, 400), '| progress seen:', prog.some((p) => p.progress));
                const att = win().getByRole('button', {name: 'Attach Files', exact: true}).first();
                await att.click(); await page.waitForTimeout(800); await idle(page);
                const w = await wizInfo(page);
                out.uploadedChip = {dialogsOpen: (await dialogTexts(page)).length, removeBtns: w.removeBtns, attached: (w.composer || []).filter((c) => /attach/i.test(c.cls)).map((c) => c.text)};
                await snap(page, `${label}-attach-upload-chip`, {out: out.uploadedChip});
                log(`[${label} upload chip]`, JSON.stringify(out.uploadedChip).slice(0, 300));
                await attach.click(); await page.waitForTimeout(800); await idle(page);
            } else await back();
        } else out.uploadWindow = {absent: true};
        // Review Files
        const rvBtn = win().getByRole('button', {name: 'Attach Review Files', exact: true}).first();
        out.reviewPanel = {present: await rvBtn.count()};
        if (await rvBtn.count()) {
            await rvBtn.click(); await page.waitForTimeout(800); await idle(page);
            d = (await dialogTexts(page)).slice(-1)[0];
            out.reviewWindow = d && {name: d.name, text: flat(d.text, 800), buttons: d.buttons.map((b) => `${b.t}${b.disabled ? '(dis)' : ''}`), lists: d.lists, inputs: d.inputs.filter((i) => i.type === 'checkbox')};
            await snap(page, `${label}-attach-review-window`, {dialog: out.reviewWindow});
            log(`[${label} review window]`, JSON.stringify(out.reviewWindow).slice(0, 500));
            if (attachReviewer) {
                const box = win().locator('input[type=checkbox]').first();
                if (await box.count()) {
                    await box.check({force: true}); await page.waitForTimeout(300);
                    out.reviewWindowTicked = {buttons: (await dialogTexts(page)).slice(-1)[0]?.buttons.map((b) => `${b.t}${b.disabled ? '(dis)' : ''}`)};
                    await win().getByRole('button', {name: 'Attach Selected', exact: true}).first().click(); await page.waitForTimeout(800); await idle(page);
                    const w = await wizInfo(page);
                    out.reviewerChip = {dialogsOpen: (await dialogTexts(page)).length, removeBtns: w.removeBtns, attached: (w.composer || []).filter((c) => /attach/i.test(c.cls)).map((c) => c.text)};
                    await snap(page, `${label}-attach-reviewer-chip`, {out: out.reviewerChip});
                    log(`[${label} reviewer chip]`, JSON.stringify(out.reviewerChip).slice(0, 300));
                    await attach.click(); await page.waitForTimeout(800); await idle(page);
                } else await back();
            } else await back();
        }
        // Submission Files
        const sfBtn = win().getByRole('button', {name: 'Attach Submission Files', exact: true}).first();
        out.submissionPanel = {present: await sfBtn.count()};
        if (await sfBtn.count()) {
            await sfBtn.click(); await page.waitForTimeout(800); await idle(page);
            d = (await dialogTexts(page)).slice(-1)[0];
            out.submissionWindow = d && {name: d.name, text: flat(d.text, 800), buttons: d.buttons.map((b) => `${b.t}${b.disabled ? '(dis)' : ''}`), lists: d.lists, headings: d.headings};
            const other = win().getByRole('button', {name: /Other Files/}).first();
            out.submissionWindow.otherFiles = await other.count();
            if (await other.count()) {
                await other.click(); await page.waitForTimeout(400);
                out.submissionWindow.groups = await page.locator('.pkpDropdown__content:visible .pkpDropdown__action, .pkpDropdown__content:visible li').evaluateAll((els) => els.map((e) => e.innerText.trim())).catch(() => []);
                await snap(page, `${label}-attach-submission-groups`, {groups: out.submissionWindow.groups});
                const second = page.locator('.pkpDropdown__content:visible .pkpDropdown__action').nth(1);
                if (await second.count()) { await second.click(); await page.waitForTimeout(800); await idle(page); const d2 = (await dialogTexts(page)).slice(-1)[0]; out.submissionWindow.secondGroup = d2 && {lists: d2.lists, headings: d2.headings}; await snap(page, `${label}-attach-submission-group2`, {dialog: out.submissionWindow.secondGroup}); }
                else await page.keyboard.press('Escape');
            }
            await snap(page, `${label}-attach-submission-window`, {dialog: out.submissionWindow});
            log(`[${label} submission window]`, JSON.stringify(out.submissionWindow).slice(0, 600));
            if (submissionGroups) {
                const box = win().locator('input[type=checkbox]').first();
                out.submissionWindow.attachSelectedBefore = (await dialogTexts(page)).slice(-1)[0]?.buttons.filter((b) => /Attach Selected/.test(b.t)).map((b) => b.disabled);
                if (await box.count()) {
                    await box.check({force: true}); await page.waitForTimeout(300);
                    out.submissionWindow.attachSelectedAfter = (await dialogTexts(page)).slice(-1)[0]?.buttons.filter((b) => /Attach Selected/.test(b.t)).map((b) => b.disabled);
                    await win().getByRole('button', {name: 'Attach Selected', exact: true}).first().click(); await page.waitForTimeout(800); await idle(page);
                    const w = await wizInfo(page);
                    out.submissionChip = {dialogsOpen: (await dialogTexts(page)).length, removeBtns: w.removeBtns, attached: (w.composer || []).filter((c) => /attach/i.test(c.cls)).map((c) => c.text)};
                    await snap(page, `${label}-attach-submission-chip`, {out: out.submissionChip});
                    // the cross removes it
                    const rm = page.getByRole('button', {name: /^Remove /}).last();
                    if (await rm.count()) { await loc(page, `${label}: chip remove`, rm); await rm.click(); await page.waitForTimeout(400); const w2 = await wizInfo(page); out.chipRemoved = {removeBtns: w2.removeBtns, attached: (w2.composer || []).filter((c) => /attach/i.test(c.cls)).map((c) => c.text)}; await snap(page, `${label}-attach-chip-removed`, {out: out.chipRemoved}); }
                    await attach.click(); await page.waitForTimeout(800); await idle(page);
                } else await back();
            } else await back();
        }
        // Library Files
        const lbBtn = win().getByRole('button', {name: 'Attach Library Files', exact: true}).first();
        out.libraryPanel = {present: await lbBtn.count()};
        if (await lbBtn.count()) {
            await lbBtn.click(); await page.waitForTimeout(800); await idle(page);
            d = (await dialogTexts(page)).slice(-1)[0];
            out.libraryWindow = d && {name: d.name, text: flat(d.text, 800), buttons: d.buttons.map((b) => `${b.t}${b.disabled ? '(dis)' : ''}`), lists: d.lists, inputs: d.inputs.filter((i) => i.type === 'checkbox')};
            await snap(page, `${label}-attach-library-window`, {dialog: out.libraryWindow});
            log(`[${label} library window]`, JSON.stringify(out.libraryWindow).slice(0, 500));
            if (libraryEnd === 'attach') {
                const box = win().locator('input[type=checkbox]').first();
                if (await box.count()) { await box.check({force: true}); await win().getByRole('button', {name: 'Attach Selected', exact: true}).first().click(); await page.waitForTimeout(800); await idle(page); const w = await wizInfo(page); out.libraryChip = {dialogsOpen: (await dialogTexts(page)).length, removeBtns: w.removeBtns}; await snap(page, `${label}-attach-library-chip`, {out: out.libraryChip}); }
                else { await back(); await closeTop(page); }
            } else { await back(); await closeTop(page); }
        } else await closeTop(page);
        const wf = await wizInfo(page);
        out.final = {dialogsOpen: (await dialogTexts(page)).length, removeBtns: wf.removeBtns};
        record(`${label}-attach`, out);
        return out;
    }
    // Refusals on the composer page under the cursor: emptied subject, bad CC, "View Error".
    async function refusals(page, label) {
        const subject = page.getByLabel(/Subject/).first();
        const original = await subject.inputValue();
        await subject.fill('');
        await page.getByRole('button', {name: 'Record Decision', exact: true}).click(); await page.waitForTimeout(1500); await idle(page);
        const w1 = await wizInfo(page);
        const out = {subjectEmpty: {notifications: w1.notifications, errors: w1.errors, h1: w1.h1, rail: (w1.rail || []).map((r) => r.text), dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)})), text: flat(w1.text, 600)}};
        await snap(page, `${label}-subject-empty`, {out});
        log(`[${label} subject empty]`, JSON.stringify(out.subjectEmpty).slice(0, 500));
        const viewErr = page.getByRole('button', {name: /View Error/}).first();
        if (await viewErr.count()) { await loc(page, `${label}: "View Error"`, viewErr); await viewErr.click(); await page.waitForTimeout(500); const wv = await wizInfo(page); out.viewError = {h1: wv.h1, url: wv.url, rail: (wv.rail || []).map((r) => `${r.text}${r.current ? '*' : ''}`), focused: await page.evaluate(() => document.activeElement && (document.activeElement.getAttribute('aria-label') || document.activeElement.id || document.activeElement.tagName)), errors: wv.errors}; }
        await subject.fill(original);
        const cc = page.getByRole('button', {name: /Add CC\/BCC/}).first();
        if (await cc.count()) await cc.click();
        const ccBox = page.getByLabel(/^CC/).first();
        if (await ccBox.count()) { await ccBox.fill('not-an-address'); await page.getByRole('button', {name: 'Record Decision', exact: true}).click(); await page.waitForTimeout(1500); await idle(page); const w2 = await wizInfo(page); out.ccInvalid = {notifications: w2.notifications, errors: w2.errors, text: flat(w2.text, 600)}; await snap(page, `${label}-cc-invalid`, {out}); await ccBox.fill(''); }
        record(`${label}-refusals`, out);
        return out;
    }
    const roundOf = (k, n) => { const r = sc.subs[k] && sc.subs[k].raw; if (!r) return null; const rounds = r.reviewRounds || []; const pick = n ? rounds[n - 1] : rounds[rounds.length - 1]; return pick ? (pick.id || pick.reviewRoundId || pick) : null; };
    const stageMenuOpen = async (page, re, label) => { const dlg = page.locator('[role="dialog"]:visible').first(); const b = dlg.getByRole('button', {name: re}).first(); if (!(await b.count())) { record(`${label}-menu-absent`, {re: String(re), buttons: (await wfInfo(page)).buttons}); return false; } await b.click(); await idle(page); await page.waitForTimeout(500); return true; };

    // =========================================================================================
    if (isOPS) {
        if (on('seed') && !sc.contextPath) {
            const t = tag('u34k3');
            const roleUsers = [['mgr', 'manager', 'Mira', 'Manager'], ['mod', 'sectionEditor', 'Mo', 'Moderator'], ['mod2', 'sectionEditor', 'Una', 'Unassigned'], ['au', 'author', 'Ava', 'Author'], ['rd', 'reader', 'Ro', 'Reader']];
            const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
            const ctx = await app.api.createContext({tag: t, context: {name: `U34 K3 ${t}`, acronym: 'U34K3', contactName: 'K3 Contact', contactEmail: `${t}contact@mail.test`}, users});
            sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
            sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
            sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`]));
            const u = sc.users;
            sc.subs = {};
            for (const [k, spec] of Object.entries({p1: {title: `K3 P1 ${t}`, participants: [{username: u.mod, role: 'sectionEditor'}]}, p2: {title: `K3 P2 ${t}`, participants: [{username: u.mod, role: 'sectionEditor'}]}})) {
                try { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec}); sc.subs[k] = {id: r.submissionId, title: spec.title, stageId: r.stageId, status: r.status, raw: r}; log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'status', r.status); }
                catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 600)); sc.subs[k] = {error: String(e.message).slice(0, 600)}; }
            }
            save(); record('seed', sc);
        }
        const u = sc.users, S = sc.subs, N = sc.names;
        const {page, close} = await launch(app);
        armDialogs(page);
        try {
            if (on('ops')) await sect('ops-p1-decline', async () => {
                await signInAs(page, u.mod);
                await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'ops-p1-mod-workflow');
                // Library both ends: first "No items found.", then a submission Library file
                await pressDecision(page, 'Decline Submission', 'ops-p1-mod-decline');
                await readWizardPage(page, 'ops-p1-mod-decline-p1');
                const a = await attachDrives(page, 'ops-p1-decline-empty', {uploadFile: TXT});
                await cancelWizard(page, 'ops-p1-mod-decline-empty', {keepWorkingFirst: true});
                await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'ops-p1-mod-workflow-2');
                await addLibraryFile(page, PDF, `K3 library ${sc.tag}`, 'ops-p1');
                await pressDecision(page, 'Decline Submission', 'ops-p1-mod-decline-2');
                await readWizardPage(page, 'ops-p1-mod-decline-2-p1');
                await attachDrives(page, 'ops-p1-decline-lib', {libraryEnd: 'attach'});
                await refusals(page, 'ops-p1-decline');
                const r = await recordWizard(page, 'ops-p1-mod-decline', {doublePress: true});
                S.p1.declined = !!(r.dialog && /Declined/i.test(r.dialog.name || r.dialog.text)); save();
                if (!isWizard(page)) { S.p1.logAfterDecline = await activityLog(page, 'ops-p1-activity-log-declined'); save(); }
            });
            if (on('ops')) await sect('ops-p1-loginas-revert', async () => {
                await signInAs(page, 'admin');
                await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'ops-p1-admin-workflow');
                if (await participantMenu(page, N.mod, 'Login As', 'ops-p1-admin')) {
                    await page.waitForTimeout(600);
                    const d = (await dialogTexts(page)).slice(-1)[0];
                    record('ops-p1-loginas-dialog', d && {name: d.name, text: flat(d.text, 300), buttons: d.buttons.map((b) => b.t)});
                    const ok = topWin(page).getByRole('button', {name: 'OK', exact: true}).first();
                    if (await ok.count()) { await ok.click(); await page.waitForURL(() => true, {timeout: 15000}).catch(() => {}); await idle(page); await page.waitForTimeout(800); }
                    await snap(page, 'ops-p1-loginas-landed');
                    await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'ops-p1-asmod-workflow');
                    const p = await pressDecision(page, 'Revert Decline', 'ops-p1-asmod-revert');
                    if (isWizard(page)) { await readWizardPage(page, 'ops-p1-asmod-revert-p1'); await recordWizard(page, 'ops-p1-asmod-revert'); if (!isWizard(page)) await activityLog(page, 'ops-p1-activity-log-reverted'); }
                    await page.goto(ctxUrl('/login/signOutAsUser')); await idle(page);
                    await snap(page, 'ops-p1-signoutas-landed');
                }
            });
            if (on('ops')) await sect('ops-rule12', async () => {
                await signInAs(page, u.mgr);
                const out = {};
                for (const [k, dec, rid] of [['accept-round1', D.ACCEPT, 1], ['accept-round-missing', D.ACCEPT, 999999], ['decline-round1', D.DECLINE, 1], ['initialdecline-round1', D.INITIAL_DECLINE, 1]]) {
                    const resp = await page.goto(decisionUrl(S.p2.id, dec, rid)).catch(() => null); await idle(page);
                    const w = await wizInfo(page).catch(() => ({}));
                    out[k] = {status: resp ? resp.status() : null, url: page.url(), h1: w.h1, text: flat(w.text, 300)};
                    await snap(page, `ops-p2-typed-${k}`, {out: out[k]});
                    if (isWizard(page)) await cancelWizard(page, `ops-p2-typed-${k}`);
                }
                record('ops-rule12', out);
                log('[ops rule12]', JSON.stringify(out).slice(0, 800));
                // the Production entry's notice box on a queued preprint (control for "The stage notices")
                await signInAs(page, u.mod);
                const {info} = await openWorkflow(page, workflow(S.p2.id, 'workflow_5'), 'ops-p2-mod-production-notice');
                record('ops-p2-notice', {notice: info.notice, status: info.status, headings: info.headings});
            });
            if (on('disc')) await sect('ops-discussion-form', async () => {
                await signInAs(page, u.mod);
                await openWorkflow(page, workflow(S.p2.id, 'workflow_5'), 'ops-p2-mod-workflow-disc');
                const dlg = page.locator('[role="dialog"]:visible').first();
                const add = dlg.getByRole('button', {name: 'Add', exact: true}).first();
                if (await add.count()) { await add.click(); await page.waitForTimeout(800); await idle(page); await page.waitForFunction(() => window.tinymce && window.tinymce.get().length, null, {timeout: 15000}).catch(() => {}); await idle(page); const d = (await dialogTexts(page)).slice(-1)[0]; const w = await wizInfo(page); await snap(page, 'ops-p2-discussion-form', {dialog: d && {name: d.name, text: flat(d.text, 1200), buttons: d.buttons.map((b) => b.t)}, toolbar: w.toolbar}); const att = topWin(page).getByRole('button', {name: 'Attach Files', exact: true}).first(); record('ops-p2-discussion-attach', {present: await att.count(), toolbar: w.toolbar}); if (await att.count()) { await att.click(); await page.waitForTimeout(800); const d2 = (await dialogTexts(page)).slice(-1)[0]; await snap(page, 'ops-p2-discussion-attach-window', {dialog: d2 && {name: d2.name, text: flat(d2.text, 800), buttons: d2.buttons.map((b) => b.t)}}); await closeTop(page); } await closeTop(page); }
                else record('ops-p2-discussion-add-absent', {buttons: (await wfInfo(page)).buttons});
            });
        } finally { record('browser-dialogs', dialogsSeen); await close(); }
        return;
    }

    // ============================================================ OJS / OMP
    if (on('seed') && !sc.contextPath) {
        const t = tag('u34k3');
        const roleUsers = [['mgr', 'manager', 'Mira', 'Manager'], ['ed', 'editor', 'Ed', 'Editor'], ['se', 'sectionEditor', 'Sela', 'Deciding'], ['se2', 'sectionEditor', 'Rec', 'Recommender'], ['se3', 'sectionEditor', 'Una', 'Unassigned'], ['ce', 'copyeditor', 'Cy', 'Copyeditor'], ['rv1', 'externalReviewer', 'Rae', 'Reviewer'], ['rv2', 'externalReviewer', 'Rob', 'Reviewer'], ['au', 'author', 'Ava', 'Author'], ['rd', 'reader', 'Ro', 'Reader']];
        if (isOMP) roleUsers.push(['rv3', 'internalReviewer', 'Ina', 'Internal']);
        const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
        const ctx = await app.api.createContext({tag: t, context: {name: `U34 K3 ${t}`, acronym: 'U34K3', contactName: 'K3 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
        sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
        sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`]));
        const u = sc.users; const part = (k, role) => ({username: u[k], role: role || 'sectionEditor'});
        const rr = (list, stage) => [{reviewers: list.map(([k, status]) => ({username: u[k], status})), ...(stage ? {stage} : {})}];
        const seeds = {
            a1: {title: `K3 A1 select files ${t}`, participants: [part('se')]},
            a2: {title: `K3 A2 review rounds ${t}`, decisions: ['sendExternalReview'], reviewRounds: rr([['rv1', 'completed'], ['rv2', 'completed']]), participants: [part('se'), part('se2')]},
            a3: {title: `K3 A3 reviewer file ${t}`, decisions: ['sendExternalReview'], reviewRounds: rr([['rv1', 'accepted']]), participants: [part('se'), part('se2')]},
            a4: {title: `K3 A4 decline ${t}`, participants: [part('se')]},
            a6: {title: `K3 A6 stale ${t}`, participants: [part('se')]},
        };
        if (isOMP) { seeds.a5 = {title: `K3 A5 internal round ${t}`, decisions: ['sendInternalReview'], reviewRounds: rr([['rv3', 'completed']], 'internal'), participants: [part('se'), part('se2')]}; seeds.a8 = {title: `K3 A8 internal ${t}`, participants: [part('se')]}; }
        sc.subs = {};
        for (const [k, spec] of Object.entries(seeds)) {
            try { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec}); sc.subs[k] = {id: r.submissionId, title: spec.title, stageId: r.stageId, status: r.status, raw: r}; log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'status', r.status, JSON.stringify(r.reviewRounds || [])); }
            catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 600)); sc.subs[k] = {error: String(e.message).slice(0, 600)}; }
        }
        save(); record('seed', sc);
    }
    const u = sc.users, S = sc.subs, N = sc.names;
    const {page, close} = await launch(app);
    armDialogs(page);
    try {
        // ---- files: a1 two submission files; a4 one; se2 recommend-only on a2, a3 (and a5)
        if (on('files')) await sect('files', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.a1.id), 'a1-mgr-workflow-files');
            await uploadDirect(page, PDF, 'a1-upload-1');
            await uploadDirect(page, MD, 'a1-upload-2');
            S.a1.files = (await wfInfo(page)).tables; save();
            await openWorkflow(page, workflow(S.a4.id), 'a4-mgr-workflow-files');
            await uploadDirect(page, MD, 'a4-upload-1');
            for (const k of ['a2', 'a3'].concat(isOMP ? ['a5'] : [])) {
                await openWorkflow(page, workflow(S[k].id), `${k}-mgr-workflow`);
                S[k].recommendOnly = await setRecommendOnly(page, N.se2, k);
            }
            save();
        });
        // ---- a4: footer refusals, attach-then-delete, spinner + double press, cancel both ways, Decline, Activity Log, Login As + Revert
        if (on('a4')) await sect('a4-refusals', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a4.id), 'a4-se-workflow');
            await pressDecision(page, 'Decline Submission', 'a4-se-decline');
            await readWizardPage(page, 'a4-se-decline-p1');
            await refusals(page, 'a4-se-decline');
            // attach a submission file, delete it in a second tab, record → the attachment error
            const attach = page.getByRole('button', {name: 'Attach Files', exact: true}).first();
            await attach.click(); await page.waitForTimeout(800); await idle(page);
            const src = topWin(page).getByRole('button', {name: 'Attach Submission Files', exact: true}).first();
            if (await src.count()) { await src.click(); await page.waitForTimeout(800); await idle(page); }
            const box = topWin(page).locator('input[type=checkbox]').first();
            if (await box.count()) await box.check({force: true});
            const sel = topWin(page).getByRole('button', {name: 'Attach Selected', exact: true}).first();
            if (await sel.count()) { await sel.click(); await page.waitForTimeout(800); await idle(page); }
            const wa = await wizInfo(page);
            await snap(page, 'a4-attached', {removeBtns: wa.removeBtns});
            const page2 = await page.context().newPage();
            let deleted = null;
            try {
                await page2.goto(workflow(S.a4.id)); await idle(page2);
                await page2.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
                await page2.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
                const tbl = page2.locator('[role="dialog"]:visible').first().getByRole('table', {name: /Submission Files/}).first();
                const rowBtn = tbl.locator('tbody tr').first().locator('button').last();
                await rowBtn.click(); await page2.waitForTimeout(400);
                const del = page2.getByRole('menuitem', {name: /^Delete/}).first();
                deleted = {hasDelete: await del.count()};
                if (deleted.hasDelete) { await del.click(); await page2.waitForTimeout(600); const ok = topWin(page2).getByRole('button', {name: /^(Delete|OK|Yes|Confirm)$/}).last(); if (await ok.count()) { await ok.click(); await idle(page2); await page2.waitForTimeout(800); } deleted.tablesAfter = (await wfInfo(page2)).tables; }
            } catch (e) { deleted = {error: String(e.message).slice(0, 300)}; }
            await page2.close();
            record('a4-file-deleted', deleted);
            const r1 = await recordWizard(page, 'a4-se-decline-attacherr', {closeWith: 'stay'});
            // clear: remove the chip; then Cancel both ways; then the spinner sample with a double press
            const rm = page.getByRole('button', {name: /^Remove /}).first();
            if (await rm.count()) { await rm.click(); await page.waitForTimeout(400); }
            const w = await wizInfo(page);
            await snap(page, 'a4-se-decline-error-cleared', {notifications: w.notifications, errors: w.errors, removeBtns: w.removeBtns});
            await cancelWizard(page, 'a4-se-decline', {keepWorkingFirst: true});
            await openWorkflow(page, workflow(S.a4.id), 'a4-se-workflow-after-cancel');
            S.a4.logAfterCancel = await activityLog(page, 'a4-activity-log-after-cancel');
            await pressDecision(page, 'Decline Submission', 'a4-se-decline-2');
            await readWizardPage(page, 'a4-se-decline-2-p1');
            const r = await recordWizard(page, 'a4-se-decline-2', {doublePress: true});
            S.a4.declined = !!(r.dialog && /Declined/i.test(r.dialog.name || r.dialog.text)); save();
            if (!isWizard(page)) { S.a4.logAfterDecline = await activityLog(page, 'a4-activity-log-declined'); save(); }
        });
        if (on('a4')) await sect('a4-loginas-revert', async () => {
            await signInAs(page, 'admin');
            await openWorkflow(page, workflow(S.a4.id), 'a4-admin-workflow');
            if (await participantMenu(page, N.se, 'Login As', 'a4-admin')) {
                await page.waitForTimeout(600);
                const d = (await dialogTexts(page)).slice(-1)[0];
                record('a4-loginas-dialog', d && {name: d.name, text: flat(d.text, 300), buttons: d.buttons.map((b) => b.t)});
                const ok = topWin(page).getByRole('button', {name: 'OK', exact: true}).first();
                if (await ok.count()) { await ok.click(); await idle(page); await page.waitForTimeout(1000); await idle(page); }
                await snap(page, 'a4-loginas-landed');
                await openWorkflow(page, workflow(S.a4.id), 'a4-asse-workflow');
                await pressDecision(page, 'Revert Decline', 'a4-asse-revert');
                if (isWizard(page)) { await readWizardPage(page, 'a4-asse-revert-p1'); await recordWizard(page, 'a4-asse-revert', {closeWith: 'escape'}); if ((await dialogTexts(page)).length && isWizard(page)) { record('a4-asse-revert-escape-stayed', {url: page.url()}); await recordWizardLeave(page); } if (!isWizard(page)) await activityLog(page, 'a4-activity-log-reverted'); }
                await page.goto(ctxUrl('/login/signOutAsUser')); await idle(page);
                await snap(page, 'a4-signoutas-landed');
            }
            async function recordWizardLeave(p) { const t = topWin(p); const l = t.getByRole('link', {name: /View Submission/}).first(); if (await l.count()) { await l.click(); await idle(p); await p.waitForTimeout(800); } }
        });
        // ---- a1: Select Files both ends, then the chain of decisions and their attach groups
        if (on('a1')) await sect('a1-select-files', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a1.id), 'a1-se-workflow');
            const btnName = isOMP ? 'Send to External Review' : 'Send for Review';
            let p = await pressDecision(page, btnName, 'a1-se-sendforreview');
            if (p.absent) p = await pressDecision(page, 'Send for Review', 'a1-se-sendforreview-b');
            await readWizardPage(page, 'a1-se-sendforreview-p1');
            await attachDrives(page, 'a1-sendforreview', {submissionGroups: true});
            await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page);
            const w = await readWizardPage(page, 'a1-se-sendforreview-p2-selectfiles');
            const rows = await page.locator('.listPanel__item:visible').evaluateAll((els) => els.map((it) => ({text: it.innerText.trim().replace(/\s+/g, ' '), checked: it.querySelector('input[type=checkbox]')?.checked, links: [...it.querySelectorAll('a')].map((a) => ({t: a.innerText.trim(), href: (a.getAttribute('href') || '').slice(0, 140)})), html: it.innerHTML.replace(/\s+/g, ' ').slice(0, 600)})));
            record('a1-selectfiles-rows', {h1: w.h1, description: w.description, panels: w.panels, rows});
            log('[a1 select files rows]', JSON.stringify(rows.map((r) => `${r.checked ? '[x]' : '[ ]'} ${r.text} ${r.links.map((l) => l.t)}`)));
            // untick the second file
            const boxes = page.locator('.listPanel__item:visible input[type=checkbox]');
            const n = await boxes.count();
            if (n > 1) { await boxes.nth(1).uncheck({force: true}); await page.waitForTimeout(300); }
            const w2 = await wizInfo(page);
            await snap(page, 'a1-se-sendforreview-p2-unticked', {panels: w2.panels});
            const r = await recordWizard(page, 'a1-se-sendforreview');
            S.a1.roundLanding = r.landed; save();
            // the round's lists and the Submission stage's list
            await openWorkflow(page, workflow(S.a1.id), 'a1-se-workflow-round');
            const m = page.url().match(/workflow_3_(\d+)/); if (m) { S.a1.roundId = Number(m[1]); save(); }
            const info = (await wfInfo(page));
            record('a1-round-tables', {tables: info.tables, url: page.url()});
            await openWorkflow(page, workflow(S.a1.id, 'workflow_1'), 'a1-se-workflow-submission-stage');
            record('a1-submission-tables', {tables: (await wfInfo(page)).tables});
        });
        if (on('a1')) await sect('a1-chain', async () => {
            await signInAs(page, u.se);
            // Cancel Review Round (a round with no reviewer)
            await openWorkflow(page, workflow(S.a1.id), 'a1-se-workflow-chain');
            await pressDecision(page, 'Cancel Review Round', 'a1-se-cancelround');
            if (isWizard(page)) { await walkWizard(page, 'a1-se-cancelround'); await recordWizard(page, 'a1-se-cancelround'); }
            // Accept and Skip Review
            await openWorkflow(page, workflow(S.a1.id), 'a1-se-workflow-after-cancelround');
            await pressDecision(page, 'Accept and Skip Review', 'a1-se-skipreview');
            if (isWizard(page)) { await walkWizard(page, 'a1-se-skipreview'); await recordWizard(page, 'a1-se-skipreview'); }
            // Send To Production with nothing copyedited: attach groups, Select Files unticked, nothing promoted
            await openWorkflow(page, workflow(S.a1.id, 'workflow_4'), 'a1-se-workflow-copyediting');
            await pressDecision(page, 'Send To Production', 'a1-se-sendtoproduction');
            if (isWizard(page)) {
                await readWizardPage(page, 'a1-se-sendtoproduction-p1');
                await attachDrives(page, 'a1-sendtoproduction', {});
                await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page);
                await readWizardPage(page, 'a1-se-sendtoproduction-p2-selectfiles');
                await recordWizard(page, 'a1-se-sendtoproduction');
                await openWorkflow(page, workflow(S.a1.id, 'workflow_5'), 'a1-se-workflow-production');
                record('a1-production-tables', {tables: (await wfInfo(page)).tables, notice: (await wfInfo(page)).notice});
            }
            // Move To Copyediting: attach group "Production Ready Files"
            await pressDecision(page, 'Move To Copyediting', 'a1-se-movetocopyediting');
            if (isWizard(page)) { await readWizardPage(page, 'a1-se-movetocopyediting-p1'); await attachDrives(page, 'a1-movetocopyediting', {}); await recordWizard(page, 'a1-se-movetocopyediting'); }
            // Move to Review: attach group "Draft Files"
            await openWorkflow(page, workflow(S.a1.id, 'workflow_4'), 'a1-se-workflow-copyediting-2');
            await pressDecision(page, 'Move to Review', 'a1-se-movetoreview');
            if (isWizard(page)) { await readWizardPage(page, 'a1-se-movetoreview-p1'); await attachDrives(page, 'a1-movetoreview', {}); await recordWizard(page, 'a1-se-movetoreview'); }
            await openWorkflow(page, workflow(S.a1.id), 'a1-se-workflow-end');
        });
        // ---- a3: reviewer file, Library file, the attach sources on Accept, the author's round, the notices, the recommendations
        if (on('a3')) await sect('a3-reviewer-and-library', async () => {
            await reviewerUploads(page, u.rv1, S.a3.id, TXT, 'a3-rv1');
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a3.id), 'a3-se-workflow');
            const m = page.url().match(/workflow_3_(\d+)/); if (m) { S.a3.roundId = Number(m[1]); save(); }
            // Library both ends: "No items found." first
            await pressDecision(page, 'Accept Submission', 'a3-se-accept-libempty');
            if (isWizard(page)) {
                await readWizardPage(page, 'a3-se-accept-libempty-p1');
                const attach = page.getByRole('button', {name: 'Attach Files', exact: true}).first();
                await attach.click(); await page.waitForTimeout(800); await idle(page);
                const lb = topWin(page).getByRole('button', {name: 'Attach Library Files', exact: true}).first();
                if (await lb.count()) { await lb.click(); await page.waitForTimeout(800); await idle(page); const d = (await dialogTexts(page)).slice(-1)[0]; await snap(page, 'a3-attach-library-empty', {dialog: d && {name: d.name, text: flat(d.text, 600), buttons: d.buttons.map((b) => `${b.t}${b.disabled ? '(dis)' : ''}`)}}); }
                await cancelWizard(page, 'a3-se-accept-libempty');
            }
            await openWorkflow(page, workflow(S.a3.id), 'a3-se-workflow-lib');
            await addLibraryFile(page, PDF, `K3 library ${sc.tag}`, 'a3');
        });
        if (on('a3')) await sect('a3-recommendations', async () => {
            await signInAs(page, u.se2);
            await openWorkflow(page, workflow(S.a3.id), 'a3-se2-workflow');
            const info = await wfInfo(page);
            const recs = (info.actionButtons || []).map((b) => b.text).filter((t) => /^Recommend/.test(t));
            const out = {};
            for (const name of recs) {
                await openWorkflow(page, workflow(S.a3.id), `a3-se2-workflow-${name.replace(/\W+/g, '-').toLowerCase()}`);
                await pressDecision(page, name, `a3-se2-${name.replace(/\W+/g, '-').toLowerCase()}`);
                if (isWizard(page)) { const w = await readWizardPage(page, `a3-se2-${name.replace(/\W+/g, '-').toLowerCase()}-p1`); out[name] = {h1: w.h1, description: w.description}; if (name === 'Recommend Accept') { await recordWizard(page, 'a3-se2-recaccept'); } else await cancelWizard(page, `a3-se2-${name.replace(/\W+/g, '-').toLowerCase()}`); }
            }
            record('a3-recommendation-sentences', out);
        });
        if (on('a3')) await sect('a3-accept-attach', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a3.id), 'a3-se-workflow-accept');
            await pressDecision(page, 'Accept Submission', 'a3-se-accept');
            await readWizardPage(page, 'a3-se-accept-p1');
            S.a3.attach = await attachDrives(page, 'a3-accept', {attachReviewer: true, uploadFile: MD, libraryEnd: 'read', submissionGroups: true}); save();
            // leave the reviewer's file and the uploaded file attached (the submission chip was removed by the drive)
            const w0 = await wizInfo(page);
            await snap(page, 'a3-se-accept-p1-final-chips', {removeBtns: w0.removeBtns});
            await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page);
            await readWizardPage(page, 'a3-se-accept-p2');
            const cont = page.getByRole('button', {name: 'Continue', exact: true}).first();
            if (await cont.isVisible().catch(() => false)) { await cont.click(); await idle(page); await readWizardPage(page, 'a3-se-accept-p3-selectfiles'); }
            const r = await recordWizard(page, 'a3-se-accept');
            S.a3.accepted = !!(r.dialog && /Accepted/i.test(r.dialog.name || r.dialog.text)); save();
            // the assigned editor's Copyediting notice
            const {info: ci} = await openWorkflow(page, workflow(S.a3.id, 'workflow_4'), 'a3-se-copyediting-notice');
            record('a3-copyediting-notice-se', {notice: ci.notice, status: ci.status, headings: ci.headings, tables: ci.tables});
            // the author's round: the reviewer's file
            await signInAs(page, u.au);
            await page.goto(authorWorkflow(S.a3.id, `workflow_3_${S.a3.roundId || ''}`)); await idle(page);
            await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            let ai = await wfInfo(page);
            if (!(ai.tables || []).some((t) => /Attachment/i.test(t.name || ''))) { await stageMenuOpen(page, /Review/, 'a3-au-review'); ai = await wfInfo(page); }
            await snap(page, 'a3-au-round', {tables: ai.tables, headings: ai.headings, menu: ai.menu, bodyStart: ai.bodyStart});
            log('[a3 author round]', JSON.stringify((ai.tables || []).map((t) => `${t.name}: ${t.rows.join(' / ')}`)).slice(0, 600));
            await tasksPanel(page, 'a3-au-tasks-after-accept');
            await authorReads(page, 'a3-au');
            // Send To Production as se: the Production notice
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a3.id, 'workflow_4'), 'a3-se-workflow-copyediting');
            await pressDecision(page, 'Send To Production', 'a3-se-sendtoproduction');
            if (isWizard(page)) { await walkWizard(page, 'a3-se-sendtoproduction'); await recordWizard(page, 'a3-se-sendtoproduction'); }
            const {info: pi} = await openWorkflow(page, workflow(S.a3.id, 'workflow_5'), 'a3-se-production-notice');
            record('a3-production-notice-se', {notice: pi.notice, status: pi.status, headings: pi.headings});
            // control: the unassigned manager's notice boxes
            await signInAs(page, u.mgr);
            const {info: mi} = await openWorkflow(page, workflow(S.a3.id, 'workflow_5'), 'a3-mgr-production-notice');
            record('a3-production-notice-mgr', {notice: mi.notice});
        });
        async function authorReads(page, label) {
            await page.goto(authorWorkflow(S.a3.id, `workflow_3_${S.a3.roundId || ''}`)); await idle(page);
            await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            const dlg = page.locator('[role="dialog"]:visible').first();
            const ai = await wfInfo(page);
            await snap(page, `${label}-round-reads`, {headings: ai.headings, tables: ai.tables, buttons: ai.buttons, bodyStart: ai.bodyStart});
            // the "Notifications" list row (the decision letter)
            const row = dlg.locator('a, button').filter({hasText: /accepted|Your submission/i}).first();
            if (await row.count()) { await row.click(); await page.waitForTimeout(800); await idle(page); const d = (await dialogTexts(page)).slice(-1)[0]; await snap(page, `${label}-letter-window`, {dialog: d && {name: d.name, text: flat(d.text, 2000), buttons: d.buttons.map((b) => b.t), links: d.buttons.filter((b) => b.href).map((b) => `${b.t} ${b.href}`)}}); log(`[${label} letter]`, flat(d && d.text, 500)); await closeTop(page); }
            else record(`${label}-letter-row-absent`, {buttons: ai.buttons});
            // "Read Review" on the author's Reviewers list
            const rr = dlg.getByRole('button', {name: /Read Review/}).first();
            if (await rr.count()) { await rr.click(); await page.waitForTimeout(800); await idle(page); const d = (await dialogTexts(page)).slice(-1)[0]; await snap(page, `${label}-read-review-window`, {dialog: d && {name: d.name, text: flat(d.text, 2000), buttons: d.buttons.map((b) => b.t), headings: d.headings}}); log(`[${label} read review]`, flat(d && d.text, 500)); await closeTop(page); }
            else record(`${label}-read-review-absent`, {buttons: ai.buttons});
        }
        if (on('au3')) await sect('au3', async () => { await signInAs(page, u.au); await authorReads(page, 'a3-au'); });
        // ---- a2: Request Revisions → Resubmit → New Review Round → round 2 → Decline → Revert; past round; typed rounds; author's tasks
        if (on('a2seed')) await sect('a2seed', async () => {
            const part = (k, role) => ({username: u[k], role: role || 'sectionEditor'});
            const r = await app.api.createSubmission({tag: `${sc.tag}a7${Date.now() % 100000}`, context: sc.contextPath, submitter: u.au, title: `K3 A7 review rounds ${sc.tag}`, decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: u.rv1, status: 'completed'}, {username: u.rv2, status: 'completed'}]}], participants: [part('se'), part('se2')]});
            S.a2 = {id: r.submissionId, title: `K3 A7 review rounds ${sc.tag}`, stageId: r.stageId, status: r.status, raw: r}; save();
            log('[a2seed]', r.submissionId, JSON.stringify(r.reviewRounds));
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.a2.id), 'a7-mgr-workflow');
            S.a2.recommendOnly = await setRecommendOnly(page, N.se2, 'a7'); save();
        });
        if (on('a2')) await sect('a2-recommendation-sentences', async () => {
            await signInAs(page, u.se2);
            const out = {};
            await openWorkflow(page, workflow(S.a2.id), 'a2-se2-workflow');
            await pressDecision(page, 'Recommend Decline', 'a2-se2-recdecline');
            if (isWizard(page)) { const w = await readWizardPage(page, 'a2-se2-recdecline-p1'); out.decline = {h1: w.h1, description: w.description}; await cancelWizard(page, 'a2-se2-recdecline'); }
            await openWorkflow(page, workflow(S.a2.id), 'a2-se2-workflow-2');
            await pressDecision(page, 'Recommend Revisions', 'a2-se2-recresubmit', {choice: 1});
            if (isWizard(page)) { const w = await readWizardPage(page, 'a2-se2-recresubmit-p1'); out.resubmit = {h1: w.h1, description: w.description}; await cancelWizard(page, 'a2-se2-recresubmit'); }
            record('a2-recommendation-sentences', out);
        });
        if (on('a2')) await sect('a2-review-decisions', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a2.id), 'a2-se-workflow');
            const m = page.url().match(/workflow_3_(\d+)/); if (m) { S.a2.round1 = Number(m[1]); save(); }
            await pressDecision(page, 'Request Revisions', 'a2-se-requestrevisions', {choice: 0});
            if (isWizard(page)) { await walkWizard(page, 'a2-se-requestrevisions'); await recordWizard(page, 'a2-se-requestrevisions'); }
            await signInAs(page, u.au);
            await page.goto(authorWorkflow(S.a2.id)); await idle(page);
            await tasksPanel(page, 'a2-au-tasks-after-revisions');
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a2.id), 'a2-se-workflow-2');
            await pressDecision(page, 'Request Revisions', 'a2-se-resubmit', {choice: 1});
            if (isWizard(page)) { await walkWizard(page, 'a2-se-resubmit'); await recordWizard(page, 'a2-se-resubmit'); }
        });
        if (on('a2') || on('a2b')) await sect('a2-round2', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a2.id), 'a2-se-workflow-3');
            if (!S.a2.round1) { const m = page.url().match(/workflow_3_(\d+)/); if (m) { S.a2.round1 = Number(m[1]); save(); } }
            let pn = await pressDecision(page, 'Create New Review Round', 'a2-se-newround');
            if (pn.absent) pn = await pressDecision(page, 'New Review Round', 'a2-se-newround-b');
            if (isWizard(page)) { await walkWizard(page, 'a2-se-newround'); await recordWizard(page, 'a2-se-newround'); }
            await openWorkflow(page, workflow(S.a2.id), 'a2-se-workflow-round2');
            const m2 = page.url().match(/workflow_3_(\d+)/); if (m2) { S.a2.round2 = Number(m2[1]); save(); }
            // Decline on round 2: the Review Files source with no reviewer file; the record; then Revert
            await pressDecision(page, 'Decline Submission', 'a2-se-decline');
            if (isWizard(page)) { await readWizardPage(page, 'a2-se-decline-p1'); await attachDrives(page, 'a2-decline-round2', {}); await walkWizard(page, 'a2-se-decline'); await recordWizard(page, 'a2-se-decline'); }
            await openWorkflow(page, workflow(S.a2.id), 'a2-se-workflow-declined');
            await pressDecision(page, 'Revert Decline', 'a2-se-revert');
            if (isWizard(page)) { await walkWizard(page, 'a2-se-revert'); await recordWizard(page, 'a2-se-revert'); }
            await openWorkflow(page, workflow(S.a2.id), 'a2-se-workflow-reverted');
            S.a2.logEnd = await activityLog(page, 'a2-activity-log-end'); save();
        });
        if (on('a2') || on('a2b')) await sect('a2-rule12', async () => {
            await signInAs(page, u.se);
            // the past round's entry: its buttons
            if (S.a2.round1) {
                const {info} = await openWorkflow(page, workflow(S.a2.id, `workflow_3_${S.a2.round1}`), 'a2-se-round1-past');
                record('a2-round1-past', {actions: info.actionButtons, header: info.header, status: info.status, url: page.url()});
                const first = (info.actionButtons || [])[0];
                if (first) { await pressDecision(page, first.text, 'a2-se-round1-past-press'); const w = await wizInfo(page).catch(() => ({})); await snap(page, 'a2-se-round1-past-pressed', {url: page.url(), h1: w.h1, text: flat(w.text, 400)}); if (isWizard(page)) await cancelWizard(page, 'a2-se-round1-past-pressed'); }
            }
            const out = {};
            const cases = [['accept-round1-past', D.ACCEPT, S.a2.round1], ['accept-round-missing', D.ACCEPT, 999999], ['accept-round-other-submission', D.ACCEPT, S.a3.roundId || roundOf('a3')], ['accept-noround', D.ACCEPT, null]];
            for (const [k, dec, rid] of cases) {
                const resp = await page.goto(decisionUrl(S.a2.id, dec, rid)).catch(() => null); await idle(page);
                const w = await wizInfo(page).catch(() => ({}));
                out[k] = {rid, status: resp ? resp.status() : null, url: page.url(), h1: w.h1, text: flat(w.text, 300)};
                await snap(page, `a2-typed-${k}`, {out: out[k]});
                if (isWizard(page)) await cancelWizard(page, `a2-typed-${k}`);
            }
            record('a2-rule12', out);
            log('[a2 rule12]', JSON.stringify(out).slice(0, 900));
        });
        if (on('a2') || on('a2b')) await sect('a2-accept-tasks', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a2.id), 'a2-se-workflow-accept');
            await pressDecision(page, 'Accept Submission', 'a2-se-accept');
            if (isWizard(page)) { await walkWizard(page, 'a2-se-accept'); await recordWizard(page, 'a2-se-accept'); }
            await signInAs(page, u.au);
            await page.goto(authorWorkflow(S.a2.id)); await idle(page);
            await tasksPanel(page, 'a2-au-tasks-after-accept');
            await page.goto(authorWorkflow(S.a2.id, `workflow_3_${S.a2.round2 || S.a2.round1 || ''}`)); await idle(page);
            await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            const ai = await wfInfo(page);
            await snap(page, 'a2-au-round-after-accept', {headings: ai.headings, notices: ai.notices, bodyStart: ai.bodyStart, tables: ai.tables});
        });
        // ---- a6: the stale wizard (two tabs) and the bookmarked address
        if (on('a6')) await sect('a6-stale', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a6.id), 'a6-se-workflow');
            await pressDecision(page, 'Accept and Skip Review', 'a6-se-skipreview-tab1');
            await walkWizard(page, 'a6-se-skipreview-tab1');
            const bookmark = page.url();
            const page2 = await page.context().newPage();
            armDialogs(page2);
            try {
                await page2.goto(workflow(S.a6.id)); await idle(page2);
                await page2.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
                await page2.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
                const btnName = isOMP ? 'Send to Internal Review' : 'Send for Review';
                const b = page2.locator('[role="dialog"]:visible').first().getByRole('button', {name: btnName, exact: true}).first();
                await b.click(); await idle(page2);
                await page2.waitForURL(/decision\/record/, {timeout: 20000}).catch(() => {});
                await page2.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
                await idle(page2);
                for (let i = 0; i < 4; i++) { const rec = page2.getByRole('button', {name: 'Record Decision', exact: true}); if (await rec.isVisible().catch(() => false)) break; await page2.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page2); }
                await page2.getByRole('button', {name: 'Record Decision', exact: true}).first().click(); await idle(page2);
                await page2.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].some((e) => e.getClientRects().length), null, {timeout: 30000}).catch(() => {});
                const d2 = (await dialogTexts(page2)).slice(-1)[0];
                record('a6-tab2-recorded', d2 && {name: d2.name, text: flat(d2.text, 400)});
                await shot(page2, 'a6-tab2-recorded').catch(() => {});
            } catch (e) { record('a6-tab2-FAILED', {error: String(e.message).slice(0, 400)}); }
            await page2.close();
            const r = await recordWizard(page, 'a6-se-skipreview-tab1-stale', {closeWith: 'stay'});
            const ds = await dialogTexts(page);
            record('a6-stale-dialog', {dialogs: ds.map((d) => ({name: d.name, text: flat(d.text, 400), buttons: d.buttons.map((b) => b.t)})), url: page.url()});
            log('[a6 stale]', JSON.stringify(ds.map((d) => [d.name, flat(d.text, 200)])));
            await closeTop(page);
            await snap(page, 'a6-stale-after-close', {url: page.url(), h1: (await wizInfo(page).catch(() => ({}))).h1});
            // the bookmarked address, reloaded
            const resp = await page.goto(bookmark).catch(() => null); await idle(page);
            const w = await wizInfo(page).catch(() => ({}));
            await snap(page, 'a6-bookmark-reloaded', {status: resp ? resp.status() : null, url: page.url(), h1: w.h1, text: flat(w.text, 400)});
            log('[a6 bookmark]', resp && resp.status(), page.url(), flat(w.h1, 60), flat(w.text, 160));
            if (isWizard(page)) await cancelWizard(page, 'a6-bookmark');
            await openWorkflow(page, workflow(S.a6.id), 'a6-se-workflow-end');
        });
        // ---- OMP: Send to Internal Review (a8), Recommend Send to External Review sentence + Send to External Review (a5)
        if (isOMP && on('omp')) await sect('omp-internal', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a8.id), 'a8-se-workflow');
            await pressDecision(page, 'Send to Internal Review', 'a8-se-sendinternal');
            if (isWizard(page)) { await walkWizard(page, 'a8-se-sendinternal'); await recordWizard(page, 'a8-se-sendinternal'); }
            await signInAs(page, u.se2);
            await openWorkflow(page, workflow(S.a5.id), 'a5-se2-workflow');
            await pressDecision(page, 'Recommend Send to External Review', 'a5-se2-recsendexternal');
            if (isWizard(page)) { await readWizardPage(page, 'a5-se2-recsendexternal-p1'); await cancelWizard(page, 'a5-se2-recsendexternal'); }
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a5.id), 'a5-se-workflow');
            await pressDecision(page, 'Send to External Review', 'a5-se-sendexternal');
            if (isWizard(page)) { await walkWizard(page, 'a5-se-sendexternal'); await recordWizard(page, 'a5-se-sendexternal'); }
        });
        // ---- a real double-click on "Record Decision" (a4 back at the Submission stage after the revert)
        if (on('dbl')) await sect('a4-dblclick', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a4.id), 'a4-se-workflow-dbl');
            const before = await activityLog(page, 'a4-activity-log-before-dbl');
            await pressDecision(page, 'Decline Submission', 'a4-se-decline-dbl');
            await readWizardPage(page, 'a4-se-decline-dbl-p1');
            const rec = page.getByRole('button', {name: 'Record Decision', exact: true}).first();
            await rec.dblclick({noWaitAfter: true});
            await idle(page);
            await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].some((e) => e.getClientRects().length), null, {timeout: 30000}).catch(() => {});
            await page.waitForTimeout(800);
            const ds = await dialogTexts(page);
            await snap(page, 'a4-se-decline-dbl-recorded', {dialogs: ds.map((d) => ({name: d.name, text: flat(d.text, 300)}))});
            const leave = topWin(page).getByRole('link', {name: /View Submission/}).first();
            if (await leave.count()) { await leave.click(); await idle(page); await page.waitForTimeout(1000); }
            await openWorkflow(page, workflow(S.a4.id), 'a4-se-workflow-after-dbl');
            const after = await activityLog(page, 'a4-activity-log-after-dbl');
            const count = (rows) => (rows || []).filter((r) => /declined this submission/.test(r.join(' '))).length;
            record('a4-dblclick', {declinedBefore: count(before), declinedAfter: count(after), delta: count(after) - count(before)});
            log('[a4 dblclick] declined lines before', count(before), 'after', count(after));
            // revert for a clean end state
            await pressDecision(page, 'Revert Decline', 'a4-se-revert-dbl');
            if (isWizard(page)) await recordWizard(page, 'a4-se-revert-dbl');
        });
        // ---- the open-review end of the author's visibility claim (context B: default review mode "open")
        if (on('open')) await sect('open-review', async () => {
            if (!sc.B) {
                const tb = tag('u34k3o');
                const usersB = [['mgr', 'manager', 'Mira', 'Manager'], ['se', 'sectionEditor', 'Sela', 'Deciding'], ['rv1', 'externalReviewer', 'Rae', 'Reviewer'], ['au', 'author', 'Ava', 'Author']].map(([k, role, g, f]) => ({username: `${tb}${k}`, roles: [role], givenName: g, familyName: f}));
                const ctxB = await app.api.createContext({tag: tb, context: {name: `U34 K3 open ${tb}`, acronym: 'U34K3O', contactName: 'K3 Contact', contactEmail: `${tb}contact@mail.test`}, users: usersB, review: {defaultReviewMode: 'open'}});
                const r = await app.api.createSubmission({tag: `${tb}b1`, context: ctxB.path || tb, submitter: `${tb}au`, title: `K3 B1 open review ${tb}`, decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: `${tb}rv1`, status: 'accepted'}]}], participants: [{username: `${tb}se`, role: 'sectionEditor'}]});
                sc.B = {tag: tb, contextPath: ctxB.path || tb, users: {mgr: `${tb}mgr`, se: `${tb}se`, rv1: `${tb}rv1`, au: `${tb}au`}, b1: {id: r.submissionId, raw: r}}; save();
                log('[open seed]', r.submissionId, JSON.stringify(r.reviewRounds));
            }
            const B = sc.B; const cp = B.contextPath;
            const wfB = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`, cp);
            const auB = (id, key) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`, cp);
            await reviewerUploads(page, B.users.rv1, B.b1.id, TXT, 'open-rv1', cp);
            // the author before the decision
            await signIn(page, B.users.au, {contextPath: cp}); await idle(page);
            await page.goto(auB(B.b1.id)); await idle(page);
            await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            let ai = await wfInfo(page);
            await snap(page, 'open-au-round-before', {tables: ai.tables, headings: ai.headings, buttons: ai.buttons, bodyStart: ai.bodyStart});
            const readReview = async (label) => { const dlg = page.locator('[role="dialog"]:visible').first(); const rr = dlg.getByRole('button', {name: /Read Review/}).first(); if (await rr.count()) { await rr.click(); await page.waitForTimeout(800); await idle(page); const d = (await dialogTexts(page)).slice(-1)[0]; await snap(page, label, {dialog: d && {name: d.name, text: flat(d.text, 2000), buttons: d.buttons.map((b) => b.t), headings: d.headings}}); log(`[${label}]`, flat(d && d.text, 400)); await closeTop(page); return d && d.text; } record(`${label}-absent`, {buttons: (await wfInfo(page)).buttons}); return null; };
            await readReview('open-au-read-review-before');
            // the editor: Accept with the reviewer's file attached
            await signIn(page, B.users.se, {contextPath: cp}); await idle(page);
            await openWorkflow(page, wfB(B.b1.id), 'open-se-workflow');
            await pressDecision(page, 'Accept Submission', 'open-se-accept');
            await readWizardPage(page, 'open-se-accept-p1');
            await attachDrives(page, 'open-accept', {attachReviewer: true});
            const w = await wizInfo(page); await snap(page, 'open-se-accept-chips', {removeBtns: w.removeBtns});
            for (let i = 0; i < 4; i++) { const r2 = page.getByRole('button', {name: 'Record Decision', exact: true}); if (await r2.isVisible().catch(() => false)) break; await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page); }
            await recordWizard(page, 'open-se-accept');
            // the author after the decision
            await signIn(page, B.users.au, {contextPath: cp}); await idle(page);
            await page.goto(auB(B.b1.id, `workflow_3_${(B.b1.raw.reviewRounds || [{}])[0].id || ''}`)); await idle(page);
            await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            ai = await wfInfo(page);
            await snap(page, 'open-au-round-after', {tables: ai.tables, headings: ai.headings, buttons: ai.buttons, bodyStart: ai.bodyStart});
            await readReview('open-au-read-review-after');
        });
        // ---- open2: the editor confirms the reviewer's review on B1's round 1; the author's "Read Review" window afterwards
        if (on('open2')) await sect('open2', async () => {
            const B = sc.B; const cp = B.contextPath; const rid = (B.b1.raw.reviewRounds || [{}])[0].id;
            await signIn(page, B.users.se, {contextPath: cp}); await idle(page);
            await openWorkflow(page, ctxUrl(`/dashboard/editorial?workflowSubmissionId=${B.b1.id}&workflowMenuKey=workflow_3_${rid}`, cp), 'open2-se-round1');
            const dlg = page.locator('[role="dialog"]:visible').first();
            const rr = dlg.getByRole('button', {name: /Read Review/}).first();
            if (await rr.count()) {
                await rr.click(); await idle(page); await page.waitForTimeout(800);
                const d = (await dialogTexts(page)).slice(-1)[0];
                await snap(page, 'open2-se-read-review', {dialog: d && {name: d.name, text: flat(d.text, 1500), buttons: d.buttons.map((b) => b.t), headings: d.headings}});
                const mark = topWin(page).getByRole('button', {name: /Mark as Complete/}).first();
                if (await mark.count()) { await mark.click(); await page.waitForTimeout(600); const d2 = (await dialogTexts(page)).slice(-1)[0]; record('open2-mark-dialog', d2 && {name: d2.name, text: flat(d2.text, 300), buttons: d2.buttons.map((b) => b.t)}); const ok = topWin(page).getByRole('button', {name: /Mark as Complete|OK|Yes/}).last(); if (await ok.count()) { await ok.click(); await idle(page); await page.waitForTimeout(1000); } }
                else { record('open2-mark-absent', {buttons: d && d.buttons.map((b) => b.t)}); await closeTop(page); }
                const info = await wfInfo(page);
                await snap(page, 'open2-se-round1-after', {tables: info.tables});
            } else record('open2-se-read-review-absent', {buttons: (await wfInfo(page)).buttons, tables: (await wfInfo(page)).tables});
            await signIn(page, B.users.au, {contextPath: cp}); await idle(page);
            await page.goto(ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${B.b1.id}&workflowMenuKey=workflow_3_${rid}`, cp)); await idle(page);
            await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            const ai = await wfInfo(page);
            await snap(page, 'open2-au-round1', {tables: ai.tables, headings: ai.headings, buttons: ai.buttons, bodyStart: ai.bodyStart});
            const arr = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: /Read Review/}).first();
            if (await arr.count()) { await arr.click(); await idle(page); await page.waitForTimeout(800); const d = (await dialogTexts(page)).slice(-1)[0]; await snap(page, 'open2-au-read-review', {dialog: d && {name: d.name, text: flat(d.text, 2000), buttons: d.buttons.map((b) => b.t), headings: d.headings}}); log('[open2 au read review]', flat(d && d.text, 600)); await closeTop(page); }
            else { record('open2-au-read-review-absent', {buttons: ai.buttons}); log('[open2 au] no Read Review; buttons', JSON.stringify(ai.buttons)); }
        });
        // ---- rvfix: finish B1's review on the journal (step 3's recommendation list), then the author's reads
        if (on('rvfix')) await sect('rvfix', async () => {
            const B = sc.B; const cp = B.contextPath; const rid = (B.b1.raw.reviewRounds || [{}])[0].id;
            await signIn(page, B.users.rv1, {contextPath: cp}); await idle(page);
            await page.goto(ctxUrl(`/reviewer/submission/${B.b1.id}`, cp)); await idle(page);
            const step3 = page.getByRole('button', {name: 'Continue to Step #3'}).filter({visible: true});
            const submit = page.getByRole('button', {name: 'Submit Review', exact: true}).filter({visible: true});
            const saveBtn = page.getByRole('button', {name: 'Save and continue', exact: true}).filter({visible: true});
            await step3.or(submit).or(saveBtn).first().waitFor({timeout: 30000});
            if (await saveBtn.count()) { await saveBtn.first().click(); await idle(page); }
            await step3.or(submit).first().waitFor({timeout: 30000});
            if (await step3.count()) { await step3.first().click(); await idle(page); }
            await submit.waitFor({timeout: 30000});
            const sel = page.locator('select:visible').filter({has: page.locator('option', {hasText: /Accept Submission/})}).first();
            const selInfo = {count: await sel.count(), name: await sel.getAttribute('name').catch(() => null)};
            if (await sel.count()) { const opts = await sel.locator('option').evaluateAll((els) => els.map((o) => ({v: o.value, t: o.textContent.trim()}))); const pick = opts.find((o) => /Accept Submission/.test(o.t)); if (pick) await sel.selectOption(pick.v); selInfo.opts = opts; }
            record('rvfix-select', selInfo);
            await submit.first().click(); await idle(page); await page.waitForTimeout(600);
            const conf = (await dialogTexts(page)).slice(-1)[0];
            record('rvfix-confirm', conf && {name: conf.name, text: flat(conf.text, 300), buttons: conf.buttons.map((b) => b.t)});
            const ok = page.locator('[role="dialog"]:visible').filter({hasText: /submit this review/}).getByRole('button', {name: 'OK', exact: true}).first();
            if (await ok.count()) { await ok.click(); }
            await page.waitForFunction(() => /Review Submitted/.test(document.body.innerText), null, {timeout: 20000}).catch(() => {});
            await idle(page);
            const errs = await page.locator('.pkp_form_error:visible, .error:visible, [class*="formError"]:visible').evaluateAll((els) => els.map((e) => e.innerText.trim()).filter(Boolean)).catch(() => []);
            await snap(page, 'rvfix-after-submit', {errs, submitted: /Review Submitted/.test(await page.locator('body').innerText())});
            log('[rvfix]', JSON.stringify(selInfo).slice(0, 200), 'errs', JSON.stringify(errs).slice(0, 300), 'submitted', /Review Submitted/.test(await page.locator('body').innerText()));
            // the author
            await signIn(page, B.users.au, {contextPath: cp}); await idle(page);
            await page.goto(ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${B.b1.id}&workflowMenuKey=workflow_3_${rid}`, cp)); await idle(page);
            await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
            await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
            const ai = await wfInfo(page);
            await snap(page, 'rvfix-au-round1', {tables: ai.tables, buttons: ai.buttons});
            const arr = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: /Read Review/}).first();
            if (await arr.count()) { await arr.click(); await idle(page); await page.waitForTimeout(800); const d = (await dialogTexts(page)).slice(-1)[0]; await snap(page, 'rvfix-au-read-review', {dialog: d && {name: d.name, text: flat(d.text, 2000), buttons: d.buttons.map((b) => b.t), headings: d.headings}}); log('[rvfix au read review]', flat(d && d.text, 600)); await closeTop(page); }
            else { record('rvfix-au-read-review-absent', {buttons: ai.buttons, tables: ai.tables}); log('[rvfix au] no Read Review', JSON.stringify(ai.tables).slice(0, 300)); }
        });
        // ---- log3: a3's Activity Log (the recommendation's line, the accept, the send-to-production)
        if (on('log3')) await sect('log3', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a3.id), 'a3-se-workflow-log');
            S.a3.log = await activityLog(page, 'a3-activity-log-end'); save();
        });
        // ---- the discussions form's composer and its "Attach Files"
        if (on('disc')) await sect('discussion-form', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.a6.id), 'a6-se-workflow-disc');
            const dlg = page.locator('[role="dialog"]:visible').first();
            const add = dlg.getByRole('button', {name: 'Add', exact: true}).first();
            if (await add.count()) { await add.click(); await page.waitForTimeout(800); await idle(page); await page.waitForFunction(() => window.tinymce && window.tinymce.get().length, null, {timeout: 15000}).catch(() => {}); await idle(page); const d = (await dialogTexts(page)).slice(-1)[0]; const tb = await page.locator('.tox-toolbar__primary button:visible').evaluateAll((els) => els.map((b) => b.getAttribute('aria-label') || b.title)).catch(() => []); await snap(page, 'a6-discussion-form', {dialog: d && {name: d.name, text: flat(d.text, 1200), buttons: d.buttons.map((b) => b.t)}, toolbar: tb}); const att = topWin(page).getByRole('button', {name: 'Attach Files', exact: true}).first(); record('a6-discussion-attach', {present: await att.count(), toolbar: tb}); if (await att.count()) { await att.click(); await page.waitForTimeout(800); const d2 = (await dialogTexts(page)).slice(-1)[0]; await snap(page, 'a6-discussion-attach-window', {dialog: d2 && {name: d2.name, text: flat(d2.text, 800), buttons: d2.buttons.map((b) => b.t)}}); await closeTop(page); } await closeTop(page); }
            else record('a6-discussion-add-absent', {buttons: (await wfInfo(page)).buttons});
        });
    } finally { record('browser-dialogs', dialogsSeen); await close(); }
});
