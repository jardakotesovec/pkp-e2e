// U34 claim check, chunk K1: the decision wizard page by role and by decision,
// and the screenless sections, on all three apps. Purpose, Actors & permissions,
// Fields & validation, Rule 1 (the page), Rule 2 (which pages each decision has),
// the canonical preamble, the Coverage section, register A1, A2 and OPS1.
// Spec: docs/specs/U34-editorial-decision-recording.md lines 10–143, 496–596, 630–643.
//
// OJS/OMP: one scratch context per app ("A") with one throwaway account per
// permission level, submissions
//   s1  Submission stage, se assigned, two submission files uploaded on screen  → "Send for Review" / "Accept and Skip Review" / "Decline Submission" pages, the composer refusals, the attach-then-delete error, "Revert Decline"
//   s2  review round, rv1 + rv2 completed, one revision uploaded, se + se2 (recommend-only) → Rule 1 (the page, the rail, the breadcrumb, the collapse), the composer reads, the review-stage roster, the recommendation wizard, the recorded recommendation and "Request Revisions" and their outcomes
//   s3  review round, rv1 invited                                     → "Notify Reviewers" absent on Accept/Decline/Request Revisions, present on "Cancel Review Round"
//   s3b review round, rv1 accepted (review open)                      → the same, then "Decline Submission" recorded and "Revert Decline" (Review) read
//   s4  Copyediting through review, se + ce assigned                  → the typed-address gates by role, the 404 for a review-stage decision, "Send To Production" and "Move to Review" pages
//   s5  Production                                                    → "Move To Copyediting" page
//   s6  Submission stage, au's assignment removed on Participants     → A2 (the wizard with no page)
//   s7  Submission stage, se2 (recommend-only) alone                  → Actors row 3 ("Send for Review" by a recommending editor)
//   s8  review round, rv1 completed, se2 (recommend-only) alone       → Actors row 2 (no deciding editor: no buttons, typed address 404), the emptied "To" refusal as ed
//   s9  OMP only: internal round, rv3 completed, se + se2             → the press's internal-round roster and "Recommend Send to External Review"
// and a second scratch context ("B") with French under "Forms" and one submission f1 → "Switch to French".
// OPS: a scratch server with mgr, mod, mod2, eb, au, rd; preprints q1 (mod), d1 declined (mod), q2 (mod2 recommend-only), q3 (nobody), and B with f1.
//
//   PROBE_FEATURE=U34 PROBE_AGENT=ccK1 node bin/probe.js all shared/playwright/checks/U34/K1/k1.js
//   PHASES=seed,flags,files,rule1,composer,pages,recs,gates,record,a2,s1,s3,s4,s5,s9,locale,payment,ops   (default all; later phases reuse k1-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const PDF = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const MD = path.join(REPO, 'apps/ojs/playwright/fixtures/files/notes.md');
const ALL = ['seed', 'flags', 'files', 'rule1', 'composer', 'pages', 'recs', 'gates', 'record', 'a2', 's1', 's3', 'round2', 's4', 's5', 's9', 'locale', 'payment', 'revertaddr', 'tmpl', 'tmpl2', 'notes', 'notes2', 'last', 'ops', 'opsfix'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const stateFile = (app) => path.join(outDir(), `k1-state-${app.name}.json`);
const D = {INTERNAL_REVIEW: 1, ACCEPT: 2, EXTERNAL_REVIEW: 3, PENDING_REVISIONS: 4, RESUBMIT: 5, DECLINE: 6, SEND_TO_PRODUCTION: 7, INITIAL_DECLINE: 8, RECOMMEND_ACCEPT: 9, RECOMMEND_PENDING_REVISIONS: 10, RECOMMEND_RESUBMIT: 11, RECOMMEND_DECLINE: 12, RECOMMEND_EXTERNAL_REVIEW: 13, NEW_EXTERNAL_ROUND: 14, REVERT_DECLINE: 15, REVERT_INITIAL_DECLINE: 16, SKIP_EXTERNAL_REVIEW: 17, SKIP_INTERNAL_REVIEW: 18, ACCEPT_INTERNAL: 19, RECOMMEND_ACCEPT_INTERNAL: 23, BACK_FROM_PRODUCTION: 29, BACK_FROM_COPYEDITING: 30, CANCEL_REVIEW_ROUND: 31, CANCEL_INTERNAL_REVIEW_ROUND: 32};

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
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit], a')].filter((b) => b.getClientRects().length).map((b) => ({t: (b.getAttribute('aria-label') || b.innerText || b.value || '').trim(), tag: b.tagName.toLowerCase(), href: b.getAttribute('href') || null})).filter((b) => b.t).slice(0, 60),
        inputs: [...d.querySelectorAll('input, select, textarea')].filter((i) => i.getClientRects().length || i.type === 'radio' || i.type === 'checkbox').map((i) => ({type: i.type, name: i.name || null, value: i.type === 'password' ? '***' : String(i.value).slice(0, 120), checked: i.checked, label: (i.id && document.querySelector(`label[for="${i.id}"]`)?.innerText || i.closest('label')?.innerText || '').trim().slice(0, 160)})).slice(0, 40),
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
    return {dialogCount: dlgs.length, headings, buttons, actionButtons, tables, notices, lists, notice: byHeading(/^Notification$/i), status: byHeading(/^Status$/i), recommendation: byHeading(/^Recommendation$/i), header, bodyStart: root.innerText.replace(/\s+/g, ' ').slice(0, 800)};
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
    const crumbs = [...document.querySelectorAll('nav[aria-label*="readcrumb" i] li, .app__breadcrumbs li, [class*="breadcrumb"] li')].filter(vis).map((li) => ({text: txt(li), href: li.querySelector('a')?.getAttribute('href') || null})).slice(0, 8);
    const railList = [...main.querySelectorAll('ol, ul')].find((l) => /Complete the following steps/i.test(l.getAttribute('aria-label') || '')) || main.querySelector('.pkpSteps ol, [class*="steps"] ol');
    const rail = railList ? [...railList.children].map((li) => { const c = li.querySelector('button, a') || li.querySelector('span'); return {text: txt(li), tag: c ? c.tagName.toLowerCase() : null, cls: (li.className + ' ' + (c ? c.className : '')).trim().slice(0, 160), current: li.getAttribute('aria-current') || c?.getAttribute('aria-current') || (/current/i.test(li.className + (c ? c.className : '')) ? 'cls' : null), visibleWidth: li.getBoundingClientRect().width}; }) : null;
    const railName = railList ? railList.getAttribute('aria-label') : null;
    const railCls = railList ? (railList.parentElement?.className || '') : null;
    const stepsCount = (main.innerText.match(/\d+\s*\/\s*\d+ steps/) || [null])[0];
    const hs = [...main.querySelectorAll('h1,h2,h3,h4,legend')].filter(vis).map((e) => ({tag: e.tagName.toLowerCase(), text: txt(e), next: e.nextElementSibling && vis(e.nextElementSibling) ? txt(e.nextElementSibling).slice(0, 300) : null})).slice(0, 30);
    const btns = [...main.querySelectorAll('button, a.pkp_button, a[role=button], input[type=submit]')].filter(vis).map((b) => ({text: (b.innerText || b.getAttribute('aria-label') || b.value || '').trim().replace(/\s+/g, ' ').slice(0, 80), aria: b.getAttribute('aria-label'), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true', primary: /\bbg-primary\b|pkpButton--isPrimary/.test(b.className), warnable: /isWarnable|negative/.test(b.className), cls: b.className.slice(0, 100), inFooter: !!b.closest('[class*="footer"]'), inToolbar: !!b.closest('.tox-toolbar, [class*="toolbar"]')})).filter((b) => b.text).slice(0, 120);
    const inputs = [...main.querySelectorAll('input, textarea, select')].filter((i) => vis(i) || i.type === 'checkbox' || i.type === 'radio').map((i) => ({type: i.type, name: i.name || null, id: i.id || null, label: labelOf(i), value: String(i.value).slice(0, 300), checked: i.type === 'checkbox' || i.type === 'radio' ? i.checked : undefined, disabled: i.disabled, visible: vis(i)})).slice(0, 60);
    const links = [...main.querySelectorAll('a[href]')].filter(vis).map((a) => ({text: txt(a).slice(0, 80), href: a.getAttribute('href')})).filter((a) => a.text).slice(0, 40);
    const composer = [...main.querySelectorAll('[class*="composer"]')].filter(vis).map((e) => ({cls: [...e.classList].filter((c) => /composer/.test(c)).join(' '), text: txt(e).slice(0, 240)})).slice(0, 60);
    const templates = [...main.querySelectorAll('[class*="composer__template"] button, button[class*="composer__template"], [class*="composer__template"] li')].filter(vis).map((e) => ({cls: e.className.slice(0, 80), text: txt(e).slice(0, 240)})).slice(0, 30);
    const chips = [...main.querySelectorAll('[class*="autosuggest"] [class*="selected"] > *, [class*="autosuggest__selection"], [class*="pkpAutosuggest__selection"]')].filter(vis).map((e) => ({cls: e.className.slice(0, 80), text: txt(e).slice(0, 120), removeBtn: (e.querySelector('button') || {}).getAttribute?.('aria-label') || null})).slice(0, 12);
    const removeBtns = btns.filter((b) => /^(Remove|Deselect)/i.test(b.aria || b.text)).map((b) => b.aria || b.text);
    const toolbar = [...main.querySelectorAll('.tox-toolbar__primary button, .tox-toolbar button')].filter(vis).map((b) => b.getAttribute('aria-label') || b.title || b.innerText.trim()).slice(0, 30);
    const edList = window.tinymce ? (Array.isArray(window.tinymce.editors) ? window.tinymce.editors : (window.tinymce.get() || [])) : [];
    const editors = edList.map((ed) => { try { return {id: ed.id, content: ed.getContent({format: 'text'}).replace(/\s+/g, ' ').slice(0, 700)}; } catch (e) { return {id: ed.id, error: String(e.message)}; } });
    const mask = main.querySelector('.composer__loadingTemplateMask');
    const panels = [...main.querySelectorAll('.listPanel, [class*="listPanel"]')].filter(vis).filter((p) => /listPanel$/.test(p.className.split(' ')[0] || '') || p.classList.contains('listPanel')).map((p) => ({title: txt(p.querySelector('.listPanel__title, h2, h3')), items: [...p.querySelectorAll('.listPanel__item, li')].map((it) => ({text: txt(it).slice(0, 220), checked: it.querySelector('input[type=checkbox]')?.checked ?? null})).slice(0, 20), empty: /No items/i.test(p.innerText)})).slice(0, 8);
    const notifications = [...main.querySelectorAll('[role=alert], .pkpNotification, [class*="pkpNotification"], [class*="notification"]')].filter(vis).map((e) => ({cls: e.className.slice(0, 80), text: txt(e).slice(0, 300), y: Math.round(e.getBoundingClientRect().y)})).slice(0, 12);
    const errors = [...main.querySelectorAll('.pkpFieldError, [class*="FieldError"], [class*="error"]')].filter(vis).map((e) => ({cls: e.className.slice(0, 80), text: txt(e).slice(0, 200)})).filter((e) => e.text).slice(0, 12);
    const switchTo = (main.innerText.match(/Switch to [^\n]{1,40}/) || [null])[0];
    const skip = btns.find((b) => /Skip this email|Don't skip this email/i.test(b.text));
    return {url: location.href, title: document.title, h1: txt(h1), description: txt(desc), crumbs, railName, railCls, rail, stepsCount, headings: hs, buttons: btns, inputs, links, composer, templates, chips, removeBtns, toolbar, editors, maskVisible: !!(mask && vis(mask)), panels, notifications, errors, switchTo, skip: skip ? skip.text : null, text: main.innerText.slice(0, 7000)};
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
    const ctxUrl = (p, cp) => app.url(`/index.php/${cp || sc.contextPath}${p}`);
    const workflow = (id, key) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`);
    const authorWorkflow = (id) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}`);
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
        log(`[${label}]`, app.name, 'header:', flat(info.header, 90), '| actions:', JSON.stringify((info.actionButtons || []).map((b) => `${b.text}${b.primary ? '*' : ''}`)), '| rec:', flat(info.recommendation, 80), '| headings:', JSON.stringify((info.headings || []).slice(0, 8)));
        return {info, dialogs, s};
    }
    // Read the wizard page under the cursor, snapshot it.
    async function readWizardPage(page, label, extra) {
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page);
        // a composer page fills its subject after idle() returns: wait for it (bounded), a page with no composer passes at once
        await page.waitForFunction(() => { const m = document.querySelector('main') || document.body; const c = m.querySelector('.composer'); if (!c) return true; const inp = [...m.querySelectorAll('input')].find((i) => /subject/i.test((i.id && document.querySelector(`label[for="${i.id}"]`)?.innerText) || i.name || i.getAttribute('aria-label') || '')); return inp && inp.value.length > 0; }, null, {timeout: 15000}).catch(() => {});
        const w = await wizInfo(page).catch((e) => ({error: String(e.message), url: page.url()}));
        await snap(page, label, {wiz: w, ...(extra || {})});
        log(`[${label}]`, 'h1:', flat(w.h1, 80), '| desc:', flat(w.description, 100), '| rail:', JSON.stringify((w.rail || []).map((r) => `${r.text}<${r.tag}>${r.current ? '*' : ''}`)), '| crumbs:', JSON.stringify((w.crumbs || []).map((c) => c.text)), '| footer:', JSON.stringify((w.buttons || []).filter((b) => b.inFooter).map((b) => `${b.text}${b.primary ? '*' : ''}${b.disabled ? '(dis)' : ''}`)), '| skip:', w.skip, '| chips:', JSON.stringify((w.chips || []).map((c) => c.text)), '| removeBtns:', JSON.stringify(w.removeBtns), '| panels:', JSON.stringify((w.panels || []).map((p) => `${p.title}:${p.items.map((i) => (i.checked ? '[x]' : '[ ]') + i.text.slice(0, 40)).join(';')}`)), '| switchTo:', w.switchTo, '| errors:', JSON.stringify(w.errors), '| notif:', JSON.stringify((w.notifications || []).map((n) => n.text.slice(0, 80))));
        return w;
    }
    // Press a decision button on the open workflow; handle the choice window and the minimum-reviews warning; land on the wizard.
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
            await shot(page, `${label}-window${i + 1}`).catch(() => {});
            log(`[${label} window]`, win.name, '|', flat(top.text, 200), '|', JSON.stringify(win.buttons));
            const t = topWin(page);
            if (choice === 'close') { const x = t.getByRole('button', {name: /^Close$/}).first(); await x.click().catch(() => {}); await page.waitForTimeout(800); out.closedWithCross = true; break; }
            if (choice && typeof choice === 'number') { const radios = t.locator('input[type=radio]'); if (await radios.count() > choice) await radios.nth(choice).check({force: true}); }
            const next = t.getByRole('button', {name: /^(Next|Yes, Continue|Continue|OK)$/}).first();
            if (await next.count()) { await next.click(); await idle(page); } else break;
        }
        if (isWizard(page)) await waitWizard(page);
        out.url = page.url();
        return out;
    }
    // Walk the wizard's pages with Continue (no skipping), read each, and return the pages.
    async function walkWizard(page, label) {
        const pages = [];
        for (let n = 1; n < 7; n++) {
            const w = await readWizardPage(page, `${label}-p${n}`);
            pages.push({n, h1: w.h1, description: w.description, rail: (w.rail || []).map((r) => `${r.text}<${r.tag}>${r.current ? '*' : ''}`), panelHeading: (w.headings || []).find((h) => h.tag === 'h2')?.text || null, guidance: (w.headings || []).find((h) => h.tag === 'h2')?.next || null, footer: (w.buttons || []).filter((b) => b.inFooter).map((b) => `${b.text}${b.primary ? '*' : ''}`), skip: w.skip, chips: (w.chips || []).map((c) => c.text), removeBtns: w.removeBtns, panels: (w.panels || []).map((p) => ({title: p.title, items: p.items.map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.text.slice(0, 60)}`), empty: p.empty})), hasAttach: (w.buttons || []).some((b) => /^Attach Files$/.test(b.text)), hasInsert: (w.toolbar || []).some((t) => /Insert Content/i.test(t)) || (w.buttons || []).some((b) => /Insert Content/i.test(b.text)), templates: (w.templates || []).map((t) => t.text.slice(0, 80)), switchTo: w.switchTo, url: w.url});
            const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
            if (await rec.isVisible().catch(() => false)) break;
            const cont = page.getByRole('button', {name: 'Continue', exact: true}).first();
            if (!(await cont.isVisible().catch(() => false))) break;
            await cont.click(); await idle(page); await page.waitForTimeout(300);
        }
        record(`${label}-pages`, pages);
        return pages;
    }
    // "Cancel" → dialog → "Cancel Decision" → landing.
    async function cancelWizard(page, label, {keepWorkingFirst} = {}) {
        const cancel = page.getByRole('button', {name: 'Cancel', exact: true}).first();
        if (!(await cancel.count())) { record(`${label}-cancel-absent`, {url: page.url()}); return null; }
        await cancel.click(); await page.waitForTimeout(500); await idle(page);
        let ds = await dialogTexts(page);
        const d = ds[ds.length - 1];
        const out = {dialog: d ? {name: d.name, text: flat(d.text, 400), buttons: d.buttons.map((b) => b.t)} : null};
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
    // "Record Decision" → the closing window → leave by its link or its cross.
    async function recordWizard(page, label, {closeWith = 'link'} = {}) {
        const rec = page.getByRole('button', {name: 'Record Decision', exact: true}).first();
        await rec.click(); await idle(page);
        await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].some((e) => e.getClientRects().length) || document.querySelector('[role=alert], .pkpNotification'), null, {timeout: 30000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const w = await wizInfo(page).catch(() => ({}));
        const ds = await dialogTexts(page);
        const d = ds[ds.length - 1];
        const out = {url: page.url(), dialog: d ? {name: d.name, text: flat(d.text, 600), buttons: d.buttons.map((b) => `${b.t}<${b.tag}${b.href ? ' ' + b.href.slice(0, 80) : ''}>`)} : null, notifications: (w.notifications || []).map((n) => n.text), errors: w.errors, h1: w.h1};
        await snap(page, `${label}-recorded`, {out});
        log(`[${label} recorded]`, JSON.stringify(out).slice(0, 700));
        if (d) {
            const t = topWin(page);
            let leave = closeWith === 'cross' ? t.getByRole('button', {name: /^Close$/}).first() : t.getByRole('link', {name: /View Submission|View All/}).first();
            if (!(await leave.count())) leave = t.getByRole('button', {name: /View Submission|Close|OK/}).first();
            if (await leave.count()) { out.leftWith = flat(await leave.innerText().catch(() => '') || await leave.getAttribute('aria-label'), 60); await leave.click(); await idle(page); await page.waitForTimeout(1000); await idle(page); out.landed = page.url(); const info = await wfInfo(page).catch(() => ({})); out.landedHeader = info.header; out.landedActions = (info.actionButtons || []).map((b) => b.text); out.landedNotice = info.notice; out.landedStatus = info.status; await snap(page, `${label}-recorded-landed`, {out}); }
        }
        record(`${label}-record`, out);
        log(`[${label} landed]`, out.leftWith, out.landed, '|', flat(out.landedHeader, 80), '| status:', flat(out.landedStatus, 80));
        return out;
    }
    async function typedAddress(page, user, id, decision, roundId, label, cp) {
        await signInAs(page, user, cp);
        const url = decisionUrl(id, decision, roundId, cp);
        const resp = await page.goto(url).catch(() => null);
        await idle(page);
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        const w = await wizInfo(page).catch(() => ({}));
        const out = {user, url, status: resp ? resp.status() : null, landed: page.url(), h1: w.h1, description: w.description, rail: (w.rail || []).map((r) => r.text), footer: (w.buttons || []).filter((b) => b.inFooter).map((b) => b.text), text: flat(w.text, 400)};
        await snap(page, label, {out});
        log(`[${label}]`, user, decision, '→', out.status, '|', flat(w.h1, 60), '|', flat(w.text, 160));
        return out;
    }
    // The legacy three-tab upload wizard (already open).
    async function driveWizard(page, file, label) {
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
    // "Upload" (exact) above a Vue list on the open workflow (Submission Files, Revisions Uploaded, Production Ready Files).
    async function uploadDirect(page, file, label, nth = 0) {
        const dlg = page.locator('[role="dialog"]:visible').first();
        const up = dlg.getByRole('button', {name: 'Upload', exact: true}).nth(nth);
        await up.click(); await idle(page);
        await driveWizard(page, file, label);
        await page.waitForTimeout(800); await idle(page);
        const info = await wfInfo(page);
        record(`${label}-after`, {tables: info.tables});
        log(`[${label}] tables:`, JSON.stringify(info.tables.map((t) => `${t.name}: ${t.rows.join(' | ')}`)).slice(0, 400));
        return info;
    }
    // Upload one file into the nth "Upload/Select Files" list (U32/U33 idiom), ticking the new row before OK.
    async function uploadInto(page, nth, file, label) {
        const btns = page.getByRole('button', {name: 'Upload/Select Files', exact: true});
        await btns.nth(nth).click(); await idle(page);
        const win = page.getByRole('dialog').filter({has: page.locator('input[name="allStages"]')}).last();
        await win.waitFor({timeout: 30000});
        const up = win.getByRole('link', {name: /Upload File/}).first();
        await up.waitFor({timeout: 30000}); await idle(page);
        await up.click(); await idle(page);
        await driveWizard(page, file, label);
        const base = path.basename(file);
        await page.waitForTimeout(1000); await idle(page);
        const top = topWin(page);
        const box = top.locator(`tr:has-text("${base}") input[type=checkbox]`).first();
        if (await box.count() && !(await box.isChecked().catch(() => true))) await box.check({force: true}).catch(() => {});
        let ok = top.getByRole('button', {name: /^(Save|OK|Complete|Done)$/}).last();
        if (!(await ok.count())) ok = top.getByRole('link', {name: /^(Save|OK)$/}).last();
        if (await ok.count()) { await ok.click(); await idle(page); }
        await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).length <= 1, null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page);
        record(`${label}-after`, {tables: info.tables});
        return info;
    }
    // Participants panel row menu of <name> → item.
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
    async function removeParticipant(page, name, label) {
        if (!(await participantMenu(page, name, 'Remove', label))) return false;
        await page.waitForTimeout(500);
        const ds = await dialogTexts(page);
        const d = ds[ds.length - 1];
        record(`${label}-remove-dialog`, {name: d && d.name, text: flat(d && d.text, 400), buttons: d && d.buttons.map((b) => b.t)});
        const ok = topWin(page).getByRole('button', {name: /^(OK|Remove|Yes|Confirm)$/}).last();
        if (await ok.count()) { await ok.click(); await idle(page); await page.waitForTimeout(800); await idle(page); }
        const info = await wfInfo(page);
        record(`${label}-remove-after`, {lists: info.lists, bodyStart: info.bodyStart});
        log(`[${label}] removed ${name}; participants:`, JSON.stringify(info.lists.filter((l) => /Participant/i.test(l.name)).map((l) => l.items)).slice(0, 300));
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
        const rows = await dlg.locator('table tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ')))).catch(() => []);
        await snap(page, label, {rows});
        log(`[${label}]`, JSON.stringify(rows.slice(0, 6)).slice(0, 900));
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
    async function mailFor(email, label, opts) {
        try {
            const m = await app.mail.find({to: email, timeoutMs: 20000, ...(opts || {})});
            const full = await app.mail.fullMessage(m.ID).catch(() => null);
            const out = {to: email, subject: m.Subject, from: m.From, attachments: m.Attachments, toList: m.To, text: flat(full && (full.Text || ''), 600), date: m.Created};
            record(label, out);
            log(`[${label}]`, JSON.stringify({subject: out.subject, from: out.from, attachments: out.attachments}).slice(0, 300), '|', flat(out.text, 160));
            return out;
        } catch (e) { record(label, {to: email, none: true, error: String(e.message).slice(0, 200)}); log(`[${label}] no mail:`, flat(e.message, 100)); return null; }
    }

    // ---- OPS ------------------------------------------------------------------
    if (isOPS) {
        if (on('seed') && !sc.contextPath) {
            const t = tag('u34k1');
            const roleUsers = [['mgr', 'manager', 'Mira', 'Manager'], ['mod', 'sectionEditor', 'Mo', 'Moderator'], ['mod2', 'sectionEditor', 'Rec', 'Recommender'], ['eb', 'editorialBoardMember', 'Eb', 'Board'], ['au', 'author', 'Ava', 'Author'], ['rd', 'reader', 'Ro', 'Reader']];
            const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
            const ctx = await app.api.createContext({tag: t, context: {name: `U34 K1 ${t}`, acronym: 'U34K1', contactName: 'K1 Contact', contactEmail: `${t}contact@mail.test`}, users});
            sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
            sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
            sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`]));
            const u = sc.users; const part = (k, role) => ({username: u[k], role: role || 'sectionEditor'});
            const seeds = {
                q1: {title: `K1 Q1 queued with a title that runs well past fifty characters ${t}`, participants: [part('mod')]},
                d1: {title: `K1 D1 declined ${t}`, decisions: ['decline'], participants: [part('mod')]},
                q2: {title: `K1 Q2 recommend-only ${t}`, participants: [part('mod2')]},
                q3: {title: `K1 Q3 nobody ${t}`},
            };
            sc.subs = {};
            for (const [k, spec] of Object.entries(seeds)) {
                try { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec}); sc.subs[k] = {id: r.submissionId, title: spec.title, stageId: r.stageId, status: r.status, raw: r}; log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'status', r.status); }
                catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 600)); sc.subs[k] = {error: String(e.message).slice(0, 600)}; }
            }
            // context B: French under Forms
            try {
                const tb = tag('u34k1f');
                const ctxB = await app.api.createContext({tag: tb, context: {name: `U34 K1 fr ${tb}`, acronym: 'U34K1F', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA'], contactName: 'K1 Contact', contactEmail: `${tb}contact@mail.test`}, users: [{username: `${tb}mgr`, roles: ['manager'], givenName: 'Fran', familyName: 'Manager'}, {username: `${tb}au`, roles: ['author'], givenName: 'Ana', familyName: 'Auteur'}]});
                const r = await app.api.createSubmission({tag: `${tb}f1`, context: ctxB.path || tb, submitter: `${tb}au`, title: `K1 F1 two form languages ${tb}`});
                sc.B = {tag: tb, contextPath: ctxB.path || tb, mgr: `${tb}mgr`, f1: r.submissionId};
            } catch (e) { sc.B = {error: String(e.message).slice(0, 600)}; log('[seed B FAILED]', sc.B.error); }
            save(); record('seed', sc);
        }
        const u = sc.users, S = sc.subs, N = sc.names;
        const {page, close} = await launch(app);
        armDialogs(page);
        try {
            if (on('ops') || on('flags')) await sect('ops-flags', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.q2.id), 'ops-q2-mgr-workflow');
                const set = await setRecommendOnly(page, N.mod2, 'ops-q2');
                sc.q2RecommendOnly = set; save();
            });
            if (on('ops')) await sect('ops-mgr-decline', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.q1.id), 'ops-q1-mgr-workflow');
                const pr = await pressDecision(page, 'Decline Submission', 'ops-q1-mgr-decline');
                record('ops-q1-mgr-decline-press', pr);
                const pages = await walkWizard(page, 'ops-q1-mgr-decline');
                // the composer: templates, To, skip, Attach Files sources
                const w = await wizInfo(page);
                record('ops-q1-mgr-decline-composer', {templates: w.templates, composer: w.composer, chips: w.chips, removeBtns: w.removeBtns, toolbar: w.toolbar, switchTo: w.switchTo, skip: w.skip, subject: w.inputs.find((i) => /Subject/i.test(i.label))?.value, editors: w.editors});
                log('[ops composer]', JSON.stringify(w.templates).slice(0, 300), '| toolbar:', JSON.stringify(w.toolbar).slice(0, 300));
                const attach = page.getByRole('button', {name: 'Attach Files', exact: true}).first();
                if (await attach.count()) {
                    await attach.click(); await page.waitForTimeout(800); await idle(page);
                    const ds = await dialogTexts(page);
                    const d = ds[ds.length - 1];
                    await snap(page, 'ops-q1-attach-window', {dialog: d && {name: d.name, text: flat(d.text, 1500), buttons: d.buttons.map((b) => b.t)}});
                    log('[ops attach]', d && d.name, '|', flat(d && d.text, 300), '|', JSON.stringify(d && d.buttons.map((b) => b.t)));
                    await closeTop(page);
                }
                // the rail in a narrow window (one page: nothing to collapse)
                await page.setViewportSize({width: 480, height: 900}); await page.waitForTimeout(500);
                const wn = await wizInfo(page);
                record('ops-q1-mgr-decline-narrow', {rail: wn.rail, stepsCount: wn.stepsCount, buttons: wn.buttons.filter((b) => /steps/i.test(b.text)).map((b) => b.text)});
                await page.setViewportSize({width: 1280, height: 900}); await page.waitForTimeout(300);
                await cancelWizard(page, 'ops-q1-mgr-decline', {keepWorkingFirst: true});
            });
            if (on('ops')) await sect('ops-mod-decline-and-revert', async () => {
                await signInAs(page, u.mod);
                const {info} = await openWorkflow(page, workflow(S.q1.id), 'ops-q1-mod-workflow');
                await pressDecision(page, 'Decline Submission', 'ops-q1-mod-decline');
                await walkWizard(page, 'ops-q1-mod-decline');
                await cancelWizard(page, 'ops-q1-mod-decline');
                const {info: i2} = await openWorkflow(page, workflow(S.d1.id), 'ops-d1-mod-workflow');
                await pressDecision(page, 'Revert Decline', 'ops-d1-mod-revert');
                await walkWizard(page, 'ops-d1-mod-revert');
                await cancelWizard(page, 'ops-d1-mod-revert');
            });
            if (on('ops')) await sect('ops-gates', async () => {
                const id = S.q1.id;
                const out = {};
                out.eb = await typedAddress(page, u.eb, id, D.INITIAL_DECLINE, null, 'ops-gate-eb-decline');
                out.au = await typedAddress(page, u.au, id, D.INITIAL_DECLINE, null, 'ops-gate-au-decline');
                out.rd = await typedAddress(page, u.rd, id, D.INITIAL_DECLINE, null, 'ops-gate-rd-decline');
                out.mod2Unassigned = await typedAddress(page, u.mod2, id, D.INITIAL_DECLINE, null, 'ops-gate-mod2-unassigned-decline');
                out.mgrUnassignedQ3 = await typedAddress(page, u.mgr, S.q3.id, D.INITIAL_DECLINE, null, 'ops-gate-mgr-q3-decline');
                out.adminQ3 = await typedAddress(page, 'admin', S.q3.id, D.INITIAL_DECLINE, null, 'ops-gate-admin-q3-decline');
                out.mgrAccept = await typedAddress(page, u.mgr, id, D.ACCEPT, null, 'ops-gate-mgr-accept');
                out.mgrRecommend = await typedAddress(page, u.mgr, id, D.RECOMMEND_ACCEPT, null, 'ops-gate-mgr-recommend');
                out.mgrSendToProduction = await typedAddress(page, u.mgr, id, D.SEND_TO_PRODUCTION, null, 'ops-gate-mgr-sendtoproduction');
                out.mgrRevertOnQueued = await typedAddress(page, u.mgr, id, D.REVERT_INITIAL_DECLINE, null, 'ops-gate-mgr-revert-on-queued');
                out.mgrBadNumber = await typedAddress(page, u.mgr, id, 99, null, 'ops-gate-mgr-99');
                out.mod2RecommendQ2 = await typedAddress(page, u.mod2, S.q2.id, D.RECOMMEND_ACCEPT, null, 'ops-gate-mod2-q2-recommend');
                out.mod2DeclineQ2 = await typedAddress(page, u.mod2, S.q2.id, D.INITIAL_DECLINE, null, 'ops-gate-mod2-q2-decline');
                record('ops-gates', out);
            });
            if (on('ops')) await sect('ops-q2-recommend-only', async () => {
                await signInAs(page, u.mod2);
                const {info} = await openWorkflow(page, workflow(S.q2.id), 'ops-q2-mod2-workflow');
                record('ops-q2-mod2-recommendation-box', {recommendation: info.recommendation, actions: info.actionButtons, headings: info.headings});
            });
            if (on('ops')) await sect('ops-a2', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.q3.id), 'ops-q3-mgr-workflow');
                const removed = await removeParticipant(page, N.au, 'ops-q3');
                if (removed) {
                    await pressDecision(page, 'Decline Submission', 'ops-q3-a2-decline');
                    const w = await readWizardPage(page, 'ops-q3-a2-decline-page');
                    record('ops-q3-a2-decline-read', {h1: w.h1, description: w.description, rail: w.rail, footer: w.buttons.filter((b) => b.inFooter).map((b) => b.text), headings: w.headings, text: flat(w.text, 800)});
                    const r = await recordWizard(page, 'ops-q3-a2-decline');
                    await pressDecision(page, 'Revert Decline', 'ops-q3-a2-revert');
                    const w2 = await readWizardPage(page, 'ops-q3-a2-revert-page');
                    record('ops-q3-a2-revert-read', {h1: w2.h1, description: w2.description, rail: w2.rail, footer: w2.buttons.filter((b) => b.inFooter).map((b) => b.text), text: flat(w2.text, 800)});
                    await recordWizard(page, 'ops-q3-a2-revert', {closeWith: 'cross'});
                    await mailFor(`${u.au}@mail.test`, 'ops-q3-a2-author-mail', {timeoutMs: 5000});
                }
            });
            if (on('ops')) await sect('ops-record-decline', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.q1.id), 'ops-q1-mgr-workflow-2');
                await pressDecision(page, 'Decline Submission', 'ops-q1-record-decline');
                await readWizardPage(page, 'ops-q1-record-decline-p1');
                const r = await recordWizard(page, 'ops-q1-record-decline', {closeWith: 'cross'});
                await mailFor(`${u.au}@mail.test`, 'ops-q1-author-mail');
                await openWorkflow(page, workflow(S.q1.id), 'ops-q1-after-decline');
                await activityLog(page, 'ops-q1-activity-log');
            });
            if (on('opsfix')) await sect('ops-fix-revert', async () => {
                // d1 (seeded declined) as mod, q1 and q3 (declined by this script) as mgr: the workflow opened with the Production key
                await signInAs(page, u.mod);
                const {info: d} = await openWorkflow(page, workflow(S.d1.id), 'ops-d1-mod-workflow-default');
                record('ops-d1-mod-default-landing', {url: page.url(), header: d.header, actions: d.actionButtons, headings: d.headings});
                await openWorkflow(page, workflow(S.d1.id, 'workflow_5'), 'ops-d1-mod-workflow-production');
                let pr = await pressDecision(page, 'Revert Decline', 'ops-d1-mod-revert2');
                record('ops-d1-mod-revert2-press', pr);
                if (isWizard(page)) { await walkWizard(page, 'ops-d1-mod-revert2'); await cancelWizard(page, 'ops-d1-mod-revert2'); }
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.q3.id, 'workflow_5'), 'ops-q3-mgr-workflow-production');
                pr = await pressDecision(page, 'Revert Decline', 'ops-q3-a2-revert2');
                record('ops-q3-a2-revert2-press', pr);
                if (isWizard(page)) {
                    const w2 = await readWizardPage(page, 'ops-q3-a2-revert2-page');
                    record('ops-q3-a2-revert2-read', {h1: w2.h1, description: w2.description, rail: w2.rail, footer: w2.buttons.filter((b) => b.inFooter).map((b) => b.text), text: flat(w2.text, 800)});
                    await recordWizard(page, 'ops-q3-a2-revert2', {closeWith: 'cross'});
                    await openWorkflow(page, workflow(S.q3.id, 'workflow_5'), 'ops-q3-after-revert');
                    await activityLog(page, 'ops-q3-activity-log');
                }
                await openWorkflow(page, workflow(S.q1.id, 'workflow_5'), 'ops-q1-mgr-workflow-declined');
                pr = await pressDecision(page, 'Revert Decline', 'ops-q1-mgr-revert');
                record('ops-q1-mgr-revert-press', pr);
                if (isWizard(page)) { await walkWizard(page, 'ops-q1-mgr-revert'); await cancelWizard(page, 'ops-q1-mgr-revert', {keepWorkingFirst: true}); }
                // a hand-typed "Revert Decline" on a queued preprint (q2): opens; record it and read the outcome
                await openWorkflow(page, workflow(S.q2.id, 'workflow_5'), 'ops-q2-mgr-before-revert-by-address');
                const t = await typedAddress(page, u.mgr, S.q2.id, D.REVERT_INITIAL_DECLINE, null, 'ops-q2-mgr-typed-revert');
                if (isWizard(page)) { await readWizardPage(page, 'ops-q2-mgr-typed-revert-p1'); const r = await recordWizard(page, 'ops-q2-mgr-typed-revert'); await openWorkflow(page, workflow(S.q2.id, 'workflow_5'), 'ops-q2-after-typed-revert'); await activityLog(page, 'ops-q2-activity-log'); await mailFor(`${u.au}@mail.test`, 'ops-q2-au-mail-after-typed-revert', {timeoutMs: 5000}); }
            });
            if (on('locale') && sc.B && sc.B.contextPath) await sect('ops-locale', async () => {
                await signInAs(page, sc.B.mgr, sc.B.contextPath);
                await openWorkflow(page, workflow(sc.B.f1).replace(`/${sc.contextPath}/`, `/${sc.B.contextPath}/`), 'ops-B-f1-workflow');
                await pressDecision(page, 'Decline Submission', 'ops-B-f1-decline');
                const w = await readWizardPage(page, 'ops-B-f1-decline-p1');
                record('ops-B-switch', {switchTo: w.switchTo, composer: w.composer.filter((c) => /locale|switch/i.test(c.cls + c.text))});
                await cancelWizard(page, 'ops-B-f1-decline');
            });
            if (on('ops')) await sect('ops-sweep-unsaved-leave', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.q2.id), 'ops-q2-mgr-workflow-sweep');
                await pressDecision(page, 'Decline Submission', 'ops-q2-sweep');
                await readWizardPage(page, 'ops-q2-sweep-p1');
                const subj = page.locator('main input').filter({has: page.locator('xpath=self::*')}).first();
                const subject = page.getByLabel(/Subject/).first();
                if (await subject.count()) { await subject.fill('K1 unsaved edit'); }
                const before = dialogsSeen.length;
                const crumb = page.locator('nav[aria-label*="readcrumb" i] a, .app__breadcrumbs a').first();
                if (await crumb.count()) { await crumb.click(); await page.waitForTimeout(1500); await idle(page); }
                record('ops-q2-sweep-leave', {landed: page.url(), browserDialogs: dialogsSeen.slice(before), appDialogs: (await dialogTexts(page)).map((d) => d.name)});
                log('[ops sweep leave]', page.url(), JSON.stringify(dialogsSeen.slice(before)));
            });
        } finally { record('browser-dialogs', dialogsSeen); await close(); }
        return;
    }

    // ---- OJS / OMP ------------------------------------------------------------
    if (on('seed') && !sc.contextPath) {
        const t = tag('u34k1');
        const roleUsers = [['mgr', 'manager', 'Mira', 'Manager'], ['ed', 'editor', 'Ed', 'Editor'], ['se', 'sectionEditor', 'Sela', 'Deciding'], ['se2', 'sectionEditor', 'Rec', 'Recommender'], ['se3', 'sectionEditor', 'Una', 'Unassigned'], ['ce', 'copyeditor', 'Cy', 'Copyeditor'], ['le', 'layoutEditor', 'Lay', 'Layout'], ['pr', 'proofreader', 'Pia', 'Proof'], ['rv1', 'externalReviewer', 'Rae', 'Reviewer'], ['rv2', 'externalReviewer', 'Rob', 'Reviewer'], ['au', 'author', 'Ava', 'Author'], ['au2', 'author', 'Bo', 'Stranger'], ['rd', 'reader', 'Ro', 'Reader']];
        if (isOMP) roleUsers.push(['rv3', 'internalReviewer', 'Ina', 'Internal']);
        const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
        const ctx = await app.api.createContext({tag: t, context: {name: `U34 K1 ${t}`, acronym: 'U34K1', contactName: 'K1 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t; sc.contextId = ctx.contextId;
        sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
        sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`]));
        const u = sc.users; const part = (k, role) => ({username: u[k], role: role || 'sectionEditor'});
        const rr = (list) => [{reviewers: list.map(([k, status]) => ({username: u[k], status}))}];
        const seeds = {
            s1: {title: `K1 S1 ${t}`, participants: [part('se')]},
            s2: {title: `K1 S2 two completed reviews and a title that runs well past fifty characters ${t}`, decisions: ['sendExternalReview'], reviewRounds: rr([['rv1', 'completed'], ['rv2', 'completed']]), participants: [part('se'), part('se2')]},
            s3: {title: `K1 S3 invited ${t}`, decisions: ['sendExternalReview'], reviewRounds: rr([['rv1', 'invited']]), participants: [part('se')]},
            s3b: {title: `K1 S3b accepted ${t}`, decisions: ['sendExternalReview'], reviewRounds: rr([['rv1', 'accepted']]), participants: [part('se')]},
            s4: {title: `K1 S4 copyediting ${t}`, decisions: ['sendExternalReview', 'accept'], reviewRounds: rr([['rv1', 'completed']]), participants: [part('se'), part('ce', 'copyeditor')]},
            s5: {title: `K1 S5 production ${t}`, decisions: ['sendExternalReview', 'accept', 'sendToProduction'], reviewRounds: rr([['rv1', 'completed']]), participants: [part('se')]},
            s6: {title: `K1 S6 no author ${t}`, participants: [part('se')]},
            s7: {title: `K1 S7 recommender at submission ${t}`, participants: [part('se2')]},
            s8: {title: `K1 S8 recommender alone ${t}`, decisions: ['sendExternalReview'], reviewRounds: rr([['rv1', 'completed']]), participants: [part('se2')]},
        };
        if (isOMP) seeds.s9 = {title: `K1 S9 internal round ${t}`, decisions: ['sendInternalReview'], reviewRounds: rr([['rv3', 'completed']]), participants: [part('se'), part('se2')]};
        sc.subs = {};
        for (const [k, spec] of Object.entries(seeds)) {
            try { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec}); sc.subs[k] = {id: r.submissionId, title: spec.title, stageId: r.stageId, status: r.status, raw: r}; log(`[seed ${k}]`, r.submissionId, 'stage', r.stageId, 'status', r.status, JSON.stringify(r).slice(0, 300)); }
            catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 600)); sc.subs[k] = {error: String(e.message).slice(0, 600)}; }
        }
        try {
            const tb = tag('u34k1f');
            const ctxB = await app.api.createContext({tag: tb, context: {name: `U34 K1 fr ${tb}`, acronym: 'U34K1F', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA'], contactName: 'K1 Contact', contactEmail: `${tb}contact@mail.test`}, users: [{username: `${tb}mgr`, roles: ['manager'], givenName: 'Fran', familyName: 'Manager'}, {username: `${tb}au`, roles: ['author'], givenName: 'Ana', familyName: 'Auteur'}]});
            const r = await app.api.createSubmission({tag: `${tb}f1`, context: ctxB.path || tb, submitter: `${tb}au`, title: `K1 F1 two form languages ${tb}`});
            sc.B = {tag: tb, contextPath: ctxB.path || tb, mgr: `${tb}mgr`, f1: r.submissionId};
        } catch (e) { sc.B = {error: String(e.message).slice(0, 600)}; log('[seed B FAILED]', sc.B.error); }
        save(); record('seed', sc);
    }
    const u = sc.users, S = sc.subs, N = sc.names;
    const roundOf = (k) => { const r = S[k] && S[k].raw; if (!r) return null; const rounds = r.reviewRounds || r.rounds || []; const last = rounds[rounds.length - 1]; return last ? (last.id || last.reviewRoundId || last) : (S[k].roundId || null); };
    const {page, close} = await launch(app);
    armDialogs(page);
    try {
        // ---- flags: recommend-only for se2 on s2, s7, s8 (and s9); the round ids from the wizard's own address
        if (on('flags')) await sect('flags', async () => {
            await signInAs(page, u.mgr);
            for (const k of ['s2', 's7', 's8'].concat(isOMP ? ['s9'] : [])) {
                if (!S[k] || !S[k].id) continue;
                await openWorkflow(page, workflow(S[k].id), `${k}-mgr-workflow`);
                S[k].recommendOnly = await setRecommendOnly(page, N.se2, `${k}`);
            }
            save();
        });
        // ---- files: two submission files on s1; one revision on s2; a draft and a copyedited file on s4
        if (on('files')) await sect('files', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.s1.id), 's1-mgr-workflow-files');
            await uploadDirect(page, PDF, 's1-upload-1');
            await uploadDirect(page, MD, 's1-upload-2');
            S.s1.files = (await wfInfo(page)).tables; save();
            await openWorkflow(page, workflow(S.s2.id), 's2-mgr-workflow-files');
            const info = await wfInfo(page);
            record('s2-review-lists', {tables: info.tables, buttons: info.buttons});
            // "Revisions Uploaded" has its own "Upload"; "Files for Review" has "Upload/Select Files"
            await uploadDirect(page, MD, 's2-upload-revision').catch(async (e) => { record('s2-upload-revision-FAILED', {error: String(e.message).slice(0, 300)}); });
            S.s2.files = (await wfInfo(page)).tables; save();
            await openWorkflow(page, workflow(S.s4.id), 's4-mgr-workflow-files');
            await uploadInto(page, 0, MD, 's4-upload-draft').catch((e) => record('s4-upload-draft-FAILED', {error: String(e.message).slice(0, 300)}));
            await uploadInto(page, 1, PDF, 's4-upload-copyedited').catch((e) => record('s4-upload-copyedited-FAILED', {error: String(e.message).slice(0, 300)}));
            S.s4.files = (await wfInfo(page)).tables; save();
        });
        // ---- rule1: the page, the rail, the breadcrumb, the collapse, "Keep Working", the unsaved leave (ed on s2 Accept Submission)
        if (on('rule1')) await sect('rule1', async () => {
            await signInAs(page, u.ed);
            const {info} = await openWorkflow(page, workflow(S.s2.id), 's2-ed-workflow');
            record('s2-ed-actions', {actions: info.actionButtons, recommendation: info.recommendation});
            const pr = await pressDecision(page, 'Accept Submission', 's2-ed-accept');
            record('s2-ed-accept-press', pr);
            const m = page.url().match(/reviewRoundId=(\d+)/); if (m) { S.s2.roundId = Number(m[1]); save(); }
            const pages = await walkWizard(page, 's2-ed-accept');
            // on the last page: the rail's visited items are links back; press the first
            const w3 = await wizInfo(page);
            const railL = page.getByRole('list', {name: /Complete the following steps/}).first();
            const first = railL.locator('li button, li a').first();
            const railBack = {clickable: await first.count()};
            if (railBack.clickable) { await first.click(); await idle(page); await page.waitForTimeout(300); const wb = await wizInfo(page); railBack.afterH1 = wb.h1; railBack.rail = wb.rail.map((r) => `${r.text}<${r.tag}>${r.current ? '*' : ''}`); railBack.url = wb.url; await snap(page, 's2-ed-accept-rail-back', {railBack}); }
            record('s2-ed-accept-rail-back', railBack);
            log('[rail back]', JSON.stringify(railBack));
            // an unvisited page in the rail: is it clickable? (we are on page 1 again; page 3 was visited, so open a fresh wizard later for that)
            // narrow window
            await page.setViewportSize({width: 480, height: 900}); await page.waitForTimeout(800);
            const wn = await wizInfo(page);
            const unfold = page.locator('main button:has-text("Show all steps"), main button:has-text("steps")').first();
            const narrow = {stepsCount: wn.stepsCount, rail: wn.rail, railCls: wn.railCls, unfoldButton: await unfold.count() ? flat(await unfold.innerText(), 60) : null, buttonsWithSteps: wn.buttons.filter((b) => /step/i.test(b.text)).map((b) => b.text), text: flat(wn.text, 300)};
            await snap(page, 's2-ed-accept-narrow', {narrow});
            if (await unfold.count()) { await unfold.click(); await page.waitForTimeout(500); const wu = await wizInfo(page); narrow.unfolded = {rail: wu.rail, stepsCount: wu.stepsCount, text: flat(wu.text, 300)}; await snap(page, 's2-ed-accept-narrow-unfolded', {narrow}); }
            record('s2-ed-accept-narrow', narrow);
            log('[narrow]', JSON.stringify(narrow).slice(0, 600));
            await page.setViewportSize({width: 1280, height: 900}); await page.waitForTimeout(500);
            // "Previous" on page 2
            await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page);
            const w2 = await wizInfo(page);
            const prev = page.getByRole('button', {name: 'Previous', exact: true}).first();
            const prevOut = {present: await prev.count()};
            if (prevOut.present) { await prev.click(); await idle(page); const wp = await wizInfo(page); prevOut.h1After = wp.h1; prevOut.presentOnFirst = await prev.count(); }
            record('s2-ed-accept-previous', prevOut);
            // Cancel → Keep Working → Cancel Decision
            await cancelWizard(page, 's2-ed-accept', {keepWorkingFirst: true});
            // a fresh wizard: an unvisited rail item is plain text (click it: nothing should happen)
            await pressDecision(page, 'Accept Submission', 's2-ed-accept-2');
            await readWizardPage(page, 's2-ed-accept-2-p1');
            const unvisited = page.getByRole('list', {name: /Complete the following steps/}).first().locator('li').nth(2);
            const uv = {text: flat(await unvisited.innerText().catch(() => null), 60), tag: await unvisited.locator('button, a, span').first().evaluate((e) => e.tagName.toLowerCase()).catch(() => null)};
            await unvisited.click({timeout: 3000}).catch(() => {});
            await page.waitForTimeout(500);
            uv.h1After = (await wizInfo(page)).h1;
            record('s2-ed-accept-unvisited-click', uv);
            // the unsaved leave: edit the subject, press the breadcrumb's "Dashboard"
            const subject = page.getByLabel(/Subject/).first();
            if (await subject.count()) await subject.fill('K1 unsaved edit');
            const before = dialogsSeen.length;
            const crumb = page.locator('nav[aria-label*="readcrumb" i] a, .app__breadcrumbs a').first();
            const crumbText = flat(await crumb.innerText().catch(() => null), 40);
            if (await crumb.count()) { await crumb.click(); await page.waitForTimeout(1500); await idle(page); }
            record('s2-ed-accept-unsaved-leave', {crumb: crumbText, landed: page.url(), browserDialogs: dialogsSeen.slice(before), appDialogs: (await dialogTexts(page)).map((d) => d.name)});
            log('[unsaved leave]', crumbText, page.url(), JSON.stringify(dialogsSeen.slice(before)));
            // the breadcrumb's submission link
            await openWorkflow(page, workflow(S.s2.id), 's2-ed-workflow-2');
            await pressDecision(page, 'Accept Submission', 's2-ed-accept-3');
            await readWizardPage(page, 's2-ed-accept-3-p1');
            const crumb2 = page.locator('nav[aria-label*="readcrumb" i] a, .app__breadcrumbs a').nth(1);
            const c2 = {text: flat(await crumb2.innerText().catch(() => null), 80), href: await crumb2.getAttribute('href').catch(() => null)};
            if (await crumb2.count()) { await crumb2.click(); await page.waitForTimeout(1500); await idle(page); c2.landed = page.url(); c2.header = (await wfInfo(page).catch(() => ({}))).header; }
            record('s2-ed-accept-crumb-submission', c2);
            log('[crumb submission]', JSON.stringify(c2));
        });
        // ---- composer: the Fields rows on "Notify Authors" and "Notify Reviewers" (ed on s2 Accept Submission)
        if (on('composer')) await sect('composer', async () => {
            await signInAs(page, u.ed);
            await openWorkflow(page, workflow(S.s2.id), 's2-ed-workflow-composer');
            await pressDecision(page, 'Accept Submission', 's2-ed-composer');
            const w = await readWizardPage(page, 's2-ed-composer-na');
            const subjectBox = page.getByLabel(/Subject/).first();
            const out = {templates: w.templates, composer: w.composer, subject: await subjectBox.inputValue().catch(() => null), toolbar: w.toolbar, editors: w.editors, chips: w.chips, removeBtns: w.removeBtns, skip: w.skip, switchTo: w.switchTo, attach: w.buttons.filter((b) => /Attach Files|Insert Content|Add CC\/BCC/i.test(b.text)).map((b) => b.text), inputs: w.inputs.map((i) => `${i.type}:${i.label}=${String(i.value).slice(0, 60)}`)};
            record('s2-ed-composer-na-fields', out);
            log('[composer NA]', 'subject:', out.subject, '| templates:', JSON.stringify(out.templates).slice(0, 400), '| toolbar:', JSON.stringify(out.toolbar).slice(0, 300), '| attach/insert/cc:', JSON.stringify(out.attach));
            // "Add CC/BCC"
            const cc = page.getByRole('button', {name: /Add CC\/BCC/}).first();
            if (await cc.count()) { await cc.click(); await page.waitForTimeout(400); const wc = await wizInfo(page); record('s2-ed-composer-ccbcc', {inputs: wc.inputs.filter((i) => /CC|BCC/i.test(i.label)).map((i) => ({label: i.label, name: i.name, type: i.type})), ccButtonStill: wc.buttons.some((b) => /Add CC\/BCC/i.test(b.text)), text: flat(wc.text, 500)}); await snap(page, 's2-ed-composer-ccbcc'); }
            // "Find Template": type "copyedit"; catch "Searching"
            const find = page.getByRole('searchbox').or(page.getByPlaceholder(/Find Template/i)).or(page.getByLabel(/Find Template/i)).first();
            const findOut = {present: await find.count()};
            if (findOut.present) {
                await find.fill('copyedit'); await find.press('Enter');
                const searching = await page.waitForFunction(() => /Searching/.test((document.querySelector('main') || document.body).innerText), null, {timeout: 3000}).then(() => true).catch(() => false);
                findOut.searchingSeen = searching;
                await page.waitForFunction(() => !/Searching/.test((document.querySelector('main') || document.body).innerText), null, {timeout: 15000}).catch(() => {});
                await idle(page); await page.waitForTimeout(500);
                const ws = await wizInfo(page);
                findOut.results = ws.templates; findOut.composer = ws.composer; findOut.moreButton = ws.buttons.filter((b) => /more$/i.test(b.text)).map((b) => b.text); findOut.text = flat(ws.text, 1200);
                await snap(page, 's2-ed-composer-find-copyedit', {findOut});
                // "{n} more"
                const more = page.locator('main').getByRole('button', {name: /\d+ more/}).first();
                if (await more.count()) { await more.click(); await page.waitForTimeout(500); findOut.afterMore = (await wizInfo(page)).templates; }
                // type a word into Message first, then load a listed template: does it survive? and the pause
                const edId = ws.editors && ws.editors[0] && ws.editors[0].id;
                if (edId) await page.evaluate((id) => { const e = window.tinymce.get(id); e.setContent('<p>K1 typed word</p>' + e.getContent()); e.fire('change'); e.fire('input'); }, edId);
                const reqBtn = page.locator('main').getByRole('button', {name: /Request Copyedit/}).first();
                findOut.requestCopyeditListed = await reqBtn.count();
                const target = findOut.requestCopyeditListed ? reqBtn : page.locator('main button[class*="composer__template"], main [class*="composer__template"] button').first();
                if (await target.count()) {
                    const t0 = Date.now();
                    await target.click();
                    const maskSeen = await page.locator('.composer__loadingTemplateMask').waitFor({state: 'visible', timeout: 3000}).then(() => true).catch(() => false);
                    await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
                    findOut.load = {maskSeen, ms: Date.now() - t0};
                    await idle(page); await page.waitForTimeout(300);
                    const wl = await wizInfo(page);
                    findOut.load.subject = await subjectBox.inputValue().catch(() => null);
                    findOut.load.editor = wl.editors && wl.editors[0] && wl.editors[0].content.slice(0, 300);
                    findOut.load.typedWordSurvived = /K1 typed word/.test(findOut.load.editor || '');
                    await snap(page, 's2-ed-composer-template-loaded', {findOut});
                }
            }
            record('s2-ed-composer-find', findOut);
            log('[find template]', JSON.stringify(findOut).slice(0, 900));
            // Notify Reviewers: chips removable; the letter's first line
            await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page);
            const wr = await readWizardPage(page, 's2-ed-composer-nr');
            record('s2-ed-composer-nr-fields', {chips: wr.chips, removeBtns: wr.removeBtns, skip: wr.skip, editors: wr.editors, subject: wr.inputs.find((i) => /Subject/i.test(i.label))?.value, templates: wr.templates, attach: wr.buttons.filter((b) => /Attach Files|Insert Content|Add CC\/BCC/i.test(b.text)).map((b) => b.text), toolbar: wr.toolbar, switchTo: wr.switchTo});
            // Skip this email → the notice and the jump; Don't skip
            const skip = page.getByRole('button', {name: /^Skip this email$/}).first();
            if (await skip.count()) { await skip.click(); await idle(page); await page.waitForTimeout(400); const wk = await wizInfo(page); record('s2-ed-composer-nr-skipped', {h1: wk.h1, rail: wk.rail.map((r) => `${r.text}${r.current ? '*' : ''}`), skipBtn: wk.skip, notifications: wk.notifications, text: flat(wk.text, 500)}); await snap(page, 's2-ed-composer-nr-skipped'); const prev = page.getByRole('button', {name: 'Previous', exact: true}).first(); if (await prev.count()) { await prev.click(); await idle(page); const wk2 = await wizInfo(page); record('s2-ed-composer-nr-skipped-back', {h1: wk2.h1, skipBtn: wk2.skip, notifications: wk2.notifications, text: flat(wk2.text, 400)}); await snap(page, 's2-ed-composer-nr-skipped-back'); } }
            await cancelWizard(page, 's2-ed-composer');
        });
        // ---- pages: Rule 2's review-stage rows as ed on s2; Send for Review, Accept and Skip, Decline on s1
        if (on('pages')) await sect('pages-s2', async () => {
            await signInAs(page, u.ed);
            for (const [name, label, opt] of [['Request Revisions', 's2-ed-requestrevisions', {}], ['Request Revisions', 's2-ed-resubmit', {choice: 1}], ['Request Revisions', 's2-ed-requestrevisions-cross', {choice: 'close'}], ['Create New Review Round', 's2-ed-newround', {}], ['Cancel Review Round', 's2-ed-cancelround', {}], ['Decline Submission', 's2-ed-decline', {}]]) {
                await openWorkflow(page, workflow(S.s2.id), `${label}-workflow`);
                const pr = await pressDecision(page, name, label, opt);
                record(`${label}-press`, pr);
                if (isWizard(page)) { await walkWizard(page, label); await cancelWizard(page, label); }
                else { record(`${label}-no-wizard`, {url: page.url(), dialogs: (await dialogTexts(page)).map((d) => d.name)}); await closeTop(page); }
            }
        });
        if (on('pages')) await sect('pages-s1', async () => {
            await signInAs(page, u.ed);
            const names = isOMP ? ['Send to External Review', 'Send to Internal Review', 'Accept and Skip Review', 'Decline Submission'] : ['Send for Review', 'Accept and Skip Review', 'Decline Submission'];
            for (const name of names) {
                const label = `s1-ed-${name.toLowerCase().replace(/[^a-z]+/g, '')}`;
                await openWorkflow(page, workflow(S.s1.id), `${label}-workflow`);
                const pr = await pressDecision(page, name, label);
                record(`${label}-press`, pr);
                if (isWizard(page)) { await walkWizard(page, label); await cancelWizard(page, label); }
            }
        });
        // ---- recs: the recommendation wizard as se2 on s2 (and s9 on OMP)
        if (on('recs')) await sect('recs', async () => {
            await signInAs(page, u.se2);
            const {info} = await openWorkflow(page, workflow(S.s2.id), 's2-se2-workflow');
            record('s2-se2-actions', {actions: info.actionButtons, recommendation: info.recommendation, buttons: info.buttons.slice(0, 40)});
            for (const [name, label, opt] of [['Recommend Accept', 's2-se2-recaccept', {}], ['Recommend Revisions', 's2-se2-recrevisions', {}], ['Recommend Revisions', 's2-se2-recresubmit', {choice: 1}], ['Recommend Decline', 's2-se2-recdecline', {}]]) {
                await openWorkflow(page, workflow(S.s2.id), `${label}-workflow`);
                const pr = await pressDecision(page, name, label, opt);
                record(`${label}-press`, pr);
                if (isWizard(page)) {
                    const pages = await walkWizard(page, label);
                    if (name === 'Recommend Accept') {
                        const w = await wizInfo(page);
                        record('s2-se2-recaccept-composer', {chips: w.chips, removeBtns: w.removeBtns, skip: w.skip, templates: w.templates, subject: w.inputs.find((i) => /Subject/i.test(i.label))?.value, editors: w.editors, attach: w.buttons.filter((b) => /Attach Files|Insert Content|Add CC\/BCC/i.test(b.text)).map((b) => b.text), toolbar: w.toolbar, switchTo: w.switchTo, footer: w.buttons.filter((b) => b.inFooter).map((b) => b.text)});
                        await cancelWizard(page, label, {keepWorkingFirst: true});
                    } else await cancelWizard(page, label);
                }
            }
            // se2 typing a decision's address on s2: refused? and the recommendation address: opens
            const rid = S.s2.roundId || roundOf('s2');
            record('s2-se2-typed-accept', await typedAddress(page, u.se2, S.s2.id, D.ACCEPT, rid, 's2-se2-typed-accept'));
            record('s2-se2-typed-recaccept', await typedAddress(page, u.se2, S.s2.id, D.RECOMMEND_ACCEPT, rid, 's2-se2-typed-recaccept'));
            record('s2-ed-typed-recaccept', await typedAddress(page, u.ed, S.s2.id, D.RECOMMEND_ACCEPT, rid, 's2-ed-typed-recaccept'));
            record('s2-se-typed-recaccept', await typedAddress(page, u.se, S.s2.id, D.RECOMMEND_ACCEPT, rid, 's2-se-typed-recaccept'));
        });
        // ---- gates: Actors rows 1 and 4 by typed address on s4 (Copyediting), Actors rows 2 and 3 on s8 and s7
        if (on('gates')) await sect('gates', async () => {
            const id = S.s4.id;
            const out = {};
            for (const k of ['ce', 'le', 'pr', 'rv1', 'au', 'au2', 'rd', 'se3']) out[k] = await typedAddress(page, u[k], id, D.SEND_TO_PRODUCTION, null, `s4-gate-${k}`);
            for (const k of ['mgr', 'ed', 'se']) { out[k] = await typedAddress(page, u[k], id, D.SEND_TO_PRODUCTION, null, `s4-gate-${k}`); if (isWizard(page)) await cancelWizard(page, `s4-gate-${k}`); }
            out.admin = await typedAddress(page, 'admin', id, D.SEND_TO_PRODUCTION, null, 's4-gate-admin'); if (isWizard(page)) await cancelWizard(page, 's4-gate-admin');
            out.mgrAcceptOnCopyediting = await typedAddress(page, u.mgr, id, D.ACCEPT, null, 's4-gate-mgr-accept');
            out.mgrDeclineOnCopyediting = await typedAddress(page, u.mgr, id, D.INITIAL_DECLINE, null, 's4-gate-mgr-initialdecline');
            out.mgrBackFromCopyeditingHand = await typedAddress(page, u.mgr, id, D.BACK_FROM_COPYEDITING, null, 's4-gate-mgr-backfromcopyediting'); if (isWizard(page)) await cancelWizard(page, 's4-gate-mgr-backfromcopyediting');
            out.mgrBadNumber = await typedAddress(page, u.mgr, id, 99, null, 's4-gate-mgr-99');
            out.mgrNoRound = await typedAddress(page, u.mgr, S.s2.id, D.ACCEPT, null, 's2-gate-mgr-accept-noround');
            // s8: se2 alone (no deciding editor)
            await signInAs(page, u.se2);
            const {info: i8} = await openWorkflow(page, workflow(S.s8.id), 's8-se2-workflow');
            record('s8-se2-actions', {actions: i8.actionButtons, recommendation: i8.recommendation, headings: i8.headings, bodyStart: i8.bodyStart});
            let rid8 = S.s8.roundId || roundOf('s8');
            if (!rid8) { await signInAs(page, u.ed); await openWorkflow(page, workflow(S.s8.id), 's8-ed-workflow'); await pressDecision(page, 'Accept Submission', 's8-ed-accept-forround'); const m = page.url().match(/reviewRoundId=(\d+)/); if (m) { rid8 = Number(m[1]); S.s8.roundId = rid8; save(); } if (isWizard(page)) await cancelWizard(page, 's8-ed-accept-forround'); }
            out.s8se2Recommend = await typedAddress(page, u.se2, S.s8.id, D.RECOMMEND_ACCEPT, rid8, 's8-se2-typed-recaccept');
            out.s8se2Accept = await typedAddress(page, u.se2, S.s8.id, D.ACCEPT, rid8, 's8-se2-typed-accept');
            // s7: se2 at the Submission stage: the buttons, and "Send for Review" by address
            await signInAs(page, u.se2);
            const {info: i7} = await openWorkflow(page, workflow(S.s7.id), 's7-se2-workflow');
            record('s7-se2-actions', {actions: i7.actionButtons, recommendation: i7.recommendation, bodyStart: i7.bodyStart});
            const sendForReview = isOMP ? D.INTERNAL_REVIEW : D.EXTERNAL_REVIEW;
            out.s7se2SendForReview = await typedAddress(page, u.se2, S.s7.id, sendForReview, null, 's7-se2-typed-sendforreview');
            if (isWizard(page)) { await walkWizard(page, 's7-se2-typed-sendforreview'); await cancelWizard(page, 's7-se2-typed-sendforreview'); }
            if (isOMP) { out.s7se2SendExternal = await typedAddress(page, u.se2, S.s7.id, D.SKIP_INTERNAL_REVIEW, null, 's7-se2-typed-sendexternal'); if (isWizard(page)) await cancelWizard(page, 's7-se2-typed-sendexternal'); }
            out.s7se2SkipReview = await typedAddress(page, u.se2, S.s7.id, D.SKIP_EXTERNAL_REVIEW, null, 's7-se2-typed-skipreview'); if (isWizard(page)) await cancelWizard(page, 's7-se2-typed-skipreview');
            out.s7se2Decline = await typedAddress(page, u.se2, S.s7.id, D.INITIAL_DECLINE, null, 's7-se2-typed-decline'); if (isWizard(page)) await cancelWizard(page, 's7-se2-typed-decline');
            record('gates', out);
        });
        // ---- record: Recommend Accept as se2 on s2; Request Revisions as ed on s2; the outcomes
        if (on('record')) await sect('record-recommendation', async () => {
            await signInAs(page, u.se2);
            await openWorkflow(page, workflow(S.s2.id), 's2-se2-workflow-record');
            await pressDecision(page, 'Recommend Accept', 's2-se2-record-recaccept');
            await readWizardPage(page, 's2-se2-record-recaccept-p1');
            const r = await recordWizard(page, 's2-se2-record-recaccept', {closeWith: 'cross'});
            const {info} = await openWorkflow(page, workflow(S.s2.id), 's2-se2-after-recommendation');
            record('s2-se2-after-recommendation-box', {recommendation: info.recommendation, actions: info.actionButtons, buttons: info.buttons, headings: info.headings, tables: info.tables, lists: info.lists});
            const disc = page.locator('[role="dialog"]:visible').first().getByRole('table', {name: /Discussions/i}).first();
            record('s2-se2-discussions', {rows: await disc.locator('tbody tr').allInnerTexts().catch(() => []), name: await disc.getAttribute('aria-label').catch(() => null)});
            await signInAs(page, u.ed);
            const {info: ie} = await openWorkflow(page, workflow(S.s2.id), 's2-ed-after-recommendation');
            record('s2-ed-after-recommendation-box', {recommendation: ie.recommendation, actions: ie.actionButtons, headings: ie.headings, tables: ie.tables, lists: ie.lists, notices: ie.notices});
            await activityLog(page, 's2-ed-activity-log-after-recommendation');
            await mailFor(`${u.ed}@mail.test`, 's2-ed-recommendation-mail');
            await mailFor(`${u.se}@mail.test`, 's2-se-recommendation-mail');
        });
        if (on('record')) await sect('record-request-revisions', async () => {
            await signInAs(page, u.ed);
            await openWorkflow(page, workflow(S.s2.id), 's2-ed-workflow-record');
            await pressDecision(page, 'Request Revisions', 's2-ed-record-revisions');
            await readWizardPage(page, 's2-ed-record-revisions-p1');
            await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page);
            await readWizardPage(page, 's2-ed-record-revisions-p2');
            const skip = page.getByRole('button', {name: /^Skip this email$/}).first();
            if (await skip.count()) { await skip.click(); await idle(page); await page.waitForTimeout(400); await readWizardPage(page, 's2-ed-record-revisions-p2-skipped'); }
            const r = await recordWizard(page, 's2-ed-record-revisions');
            const m = await mailFor(`${u.au}@mail.test`, 's2-au-revisions-mail');
            await mailFor(`${u.rv1}@mail.test`, 's2-rv1-mail-after-revisions', {timeoutMs: 4000});
            await openWorkflow(page, workflow(S.s2.id), 's2-ed-after-revisions');
            await activityLog(page, 's2-ed-activity-log-after-revisions');
            // the author's view
            await signInAs(page, u.au);
            const {info: ia} = await openWorkflow(page, authorWorkflow(S.s2.id), 's2-au-workflow');
            record('s2-au-workflow-read', {headings: ia.headings, lists: ia.lists, tables: ia.tables, notices: ia.notices, bodyStart: ia.bodyStart, buttons: ia.buttons});
            const notif = page.locator('[role="dialog"]:visible').first().locator(':is(h2,h3,h4):has-text("Notifications")').first();
            if (await notif.count()) { const sib = await notif.evaluate((h) => (h.nextElementSibling ? h.nextElementSibling.innerText.trim().slice(0, 1200) : (h.parentElement && h.parentElement.innerText.trim().slice(0, 1200)))); record('s2-au-notifications-list', {text: sib}); log('[au notifications]', flat(sib, 300)); }
            await tasksPanel(page, 's2-au-tasks');
        });
        // ---- a2: s6 with the author's assignment removed
        if (on('a2')) await sect('a2', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.s6.id), 's6-mgr-workflow');
            const removed = await removeParticipant(page, N.au, 's6');
            record('s6-author-removed', {removed});
            if (removed) {
                await pressDecision(page, 'Decline Submission', 's6-a2-decline');
                const w = await readWizardPage(page, 's6-a2-decline-page');
                record('s6-a2-decline-read', {h1: w.h1, description: w.description, rail: w.rail, railName: w.railName, footer: w.buttons.filter((b) => b.inFooter).map((b) => `${b.text}${b.primary ? '*' : ''}`), buttons: w.buttons.map((b) => b.text), headings: w.headings, text: flat(w.text, 800)});
                await recordWizard(page, 's6-a2-decline');
                await pressDecision(page, 'Revert Decline', 's6-a2-revert');
                const w2 = await readWizardPage(page, 's6-a2-revert-page');
                record('s6-a2-revert-read', {h1: w2.h1, description: w2.description, rail: w2.rail, footer: w2.buttons.filter((b) => b.inFooter).map((b) => b.text), text: flat(w2.text, 800)});
                await recordWizard(page, 's6-a2-revert', {closeWith: 'cross'});
                await mailFor(`${u.au}@mail.test`, 's6-au-mail-after-a2', {timeoutMs: 5000});
                await openWorkflow(page, workflow(S.s6.id), 's6-after-a2');
                await activityLog(page, 's6-activity-log');
            }
        });
        // ---- s1: the composer refusals, the attach-then-delete error, Decline recorded, Revert Decline read
        if (on('s1')) await sect('s1-refusals', async () => {
            await signInAs(page, u.ed);
            await openWorkflow(page, workflow(S.s1.id), 's1-ed-workflow-refusals');
            await pressDecision(page, 'Decline Submission', 's1-ed-decline-refusals');
            await readWizardPage(page, 's1-ed-decline-refusals-p1');
            const subject = page.getByLabel(/Subject/).first();
            const original = await subject.inputValue();
            await subject.fill('');
            await page.getByRole('button', {name: 'Record Decision', exact: true}).click(); await page.waitForTimeout(1500); await idle(page);
            const w1 = await wizInfo(page);
            const refusal = {subjectEmpty: {notifications: w1.notifications, errors: w1.errors, h1: w1.h1, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)})), text: flat(w1.text, 600)}};
            await snap(page, 's1-ed-decline-subject-empty', {refusal});
            log('[subject empty]', JSON.stringify(refusal.subjectEmpty).slice(0, 600));
            const viewErr = page.getByRole('button', {name: /View Error/}).first();
            if (await viewErr.count()) { await viewErr.click(); await page.waitForTimeout(500); const wv = await wizInfo(page); refusal.viewError = {h1: wv.h1, url: wv.url, focused: await page.evaluate(() => document.activeElement && (document.activeElement.getAttribute('aria-label') || document.activeElement.id || document.activeElement.tagName)), errors: wv.errors}; }
            // CC invalid, subject restored
            await subject.fill(original);
            const cc = page.getByRole('button', {name: /Add CC\/BCC/}).first();
            if (await cc.count()) await cc.click();
            const ccBox = page.getByLabel(/^CC/).first();
            if (await ccBox.count()) { await ccBox.fill('not-an-address'); await page.getByRole('button', {name: 'Record Decision', exact: true}).click(); await page.waitForTimeout(1500); await idle(page); const w2 = await wizInfo(page); refusal.ccInvalid = {notifications: w2.notifications, errors: w2.errors, text: flat(w2.text, 600)}; await snap(page, 's1-ed-decline-cc-invalid', {refusal}); await ccBox.fill(''); }
            // Message emptied
            const w0 = await wizInfo(page);
            const edId = w0.editors && w0.editors[0] && w0.editors[0].id;
            if (edId) { await page.evaluate((id) => { const e = window.tinymce.get(id); e.setContent(''); e.fire('change'); e.fire('input'); }, edId); await page.getByRole('button', {name: 'Record Decision', exact: true}).click(); await page.waitForTimeout(1500); await idle(page); const w3 = await wizInfo(page); refusal.messageEmpty = {notifications: w3.notifications, errors: w3.errors, text: flat(w3.text, 600), dialogs: (await dialogTexts(page)).map((d) => d.name)}; await snap(page, 's1-ed-decline-message-empty', {refusal}); }
            record('s1-refusals', refusal);
            await cancelWizard(page, 's1-ed-decline-refusals');
        });
        if (on('s1')) await sect('s1-attach-error', async () => {
            await signInAs(page, u.ed);
            await openWorkflow(page, workflow(S.s1.id), 's1-ed-workflow-attach');
            await pressDecision(page, 'Decline Submission', 's1-ed-decline-attach');
            await readWizardPage(page, 's1-ed-decline-attach-p1');
            const attach = page.getByRole('button', {name: 'Attach Files', exact: true}).first();
            await attach.click(); await page.waitForTimeout(800); await idle(page);
            let d = (await dialogTexts(page)).slice(-1)[0];
            await snap(page, 's1-attach-window', {dialog: d && {name: d.name, text: flat(d.text, 1500), buttons: d.buttons.map((b) => b.t)}});
            log('[attach window]', d && d.name, '|', JSON.stringify(d && d.buttons.map((b) => b.t)));
            const src = topWin(page).getByRole('button', {name: /Submission Files/}).first();
            if (await src.count()) { await src.click(); await page.waitForTimeout(800); await idle(page); }
            d = (await dialogTexts(page)).slice(-1)[0];
            await snap(page, 's1-attach-submission-files', {dialog: d && {name: d.name, text: flat(d.text, 1500), buttons: d.buttons.map((b) => b.t), inputs: d.inputs}});
            const box = topWin(page).locator('input[type=checkbox]').first();
            if (await box.count()) await box.check({force: true});
            const sel = topWin(page).getByRole('button', {name: /Attach Selected/}).first();
            if (await sel.count()) { await sel.click(); await page.waitForTimeout(800); await idle(page); }
            const wa = await wizInfo(page);
            const attached = {chips: wa.composer.filter((c) => /attach/i.test(c.cls)), removeBtns: wa.removeBtns, buttons: wa.buttons.filter((b) => /Remove/i.test(b.aria || b.text)).map((b) => b.aria || b.text), text: flat(wa.text, 600)};
            await snap(page, 's1-attached', {attached});
            log('[attached]', JSON.stringify(attached).slice(0, 400));
            // delete that file in a second page (same session)
            const page2 = await page.context().newPage();
            let deleted = null;
            try {
                await page2.goto(workflow(S.s1.id)); await idle(page2);
                await page2.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
                await page2.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
                const tbl = page2.locator('[role="dialog"]:visible').first().getByRole('table', {name: /Submission Files/}).first();
                const rowBtn = tbl.locator('tbody tr').first().locator('button').last();
                await rowBtn.click(); await page2.waitForTimeout(400);
                const items = await menuItems(page2);
                const del = page2.getByRole('menuitem', {name: /^Delete/}).first();
                deleted = {menu: items.map((i) => i.text), hasDelete: await del.count()};
                if (deleted.hasDelete) { await del.click(); await page2.waitForTimeout(600); const dd = (await dialogTexts(page2)).slice(-1)[0]; deleted.dialog = dd && {name: dd.name, text: flat(dd.text, 300), buttons: dd.buttons.map((b) => b.t)}; const ok = topWin(page2).getByRole('button', {name: /^(Delete|OK|Yes|Confirm)$/}).last(); if (await ok.count()) { await ok.click(); await idle(page2); await page2.waitForTimeout(800); } deleted.tablesAfter = (await wfInfo(page2)).tables; }
            } catch (e) { deleted = {error: String(e.message).slice(0, 300)}; }
            await page2.close();
            record('s1-file-deleted', deleted);
            log('[deleted]', JSON.stringify(deleted).slice(0, 400));
            const r = await recordWizard(page, 's1-ed-decline-attach');
            S.s1.declinedByAttach = !!(r.dialog && /Declined/i.test(r.dialog.name || r.dialog.text)); save();
            if (!isWizard(page)) await openWorkflow(page, workflow(S.s1.id), 's1-after-attach-record');
            else { record('s1-still-on-wizard', {url: page.url()}); await cancelWizard(page, 's1-ed-decline-attach'); }
        });
        if (on('s1')) await sect('s1-decline-and-revert', async () => {
            await signInAs(page, u.ed);
            const {info} = await openWorkflow(page, workflow(S.s1.id), 's1-ed-workflow-revert');
            if ((info.actionButtons || []).some((b) => b.text === 'Decline Submission')) {
                await pressDecision(page, 'Decline Submission', 's1-ed-decline-record');
                await readWizardPage(page, 's1-ed-decline-record-p1');
                await recordWizard(page, 's1-ed-decline-record');
                await mailFor(`${u.au}@mail.test`, 's1-au-decline-mail');
                await openWorkflow(page, workflow(S.s1.id), 's1-ed-workflow-declined');
            }
            await pressDecision(page, 'Revert Decline', 's1-ed-revert');
            if (isWizard(page)) { await walkWizard(page, 's1-ed-revert'); await cancelWizard(page, 's1-ed-revert'); }
            await activityLog(page, 's1-activity-log');
        });
        // ---- s3 / s3b: "Notify Reviewers" by review state; Decline recorded on s3b for the "Revert Decline" (Review) read
        if (on('s3')) await sect('s3', async () => {
            await signInAs(page, u.ed);
            for (const k of ['s3', 's3b']) {
                for (const [name, opt] of [['Accept Submission', {}], ['Cancel Review Round', {}], ['Decline Submission', {}], ['Request Revisions', {}]]) {
                    const label = `${k}-ed-${name.toLowerCase().replace(/[^a-z]+/g, '')}`;
                    await openWorkflow(page, workflow(S[k].id), `${label}-workflow`);
                    const pr = await pressDecision(page, name, label, opt);
                    record(`${label}-press`, pr);
                    if (isWizard(page)) { await walkWizard(page, label); await cancelWizard(page, label); }
                    else { await closeTop(page); }
                }
            }
            await openWorkflow(page, workflow(S.s3b.id), 's3b-ed-workflow-decline');
            await pressDecision(page, 'Decline Submission', 's3b-ed-decline-record');
            await readWizardPage(page, 's3b-ed-decline-record-p1');
            await recordWizard(page, 's3b-ed-decline-record');
            await openWorkflow(page, workflow(S.s3b.id), 's3b-ed-workflow-declined');
            await pressDecision(page, 'Revert Decline', 's3b-ed-revert');
            if (isWizard(page)) { await walkWizard(page, 's3b-ed-revert'); await cancelWizard(page, 's3b-ed-revert'); }
        });
        // ---- round2: "Cancel Review Round" lives on a second round only; a round 2 with an invited reviewer and one with a declined reviewer
        if (on('round2')) await sect('round2', async () => {
            if (!S.s10) {
                for (const [k, status] of [['s10', 'invited'], ['s11', 'declined']]) {
                    try { const r = await app.api.createSubmission({tag: `${sc.tag}${k}`, context: sc.contextPath, submitter: u.au, title: `K1 ${k.toUpperCase()} round two ${status} ${sc.tag}`, decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: u.rv1, status: 'completed'}]}, {reviewers: [{username: u.rv2, status}]}], participants: [{username: u.se, role: 'sectionEditor'}]}); S[k] = {id: r.submissionId, stageId: r.stageId, raw: r}; log(`[seed ${k}]`, r.submissionId, JSON.stringify(r.reviewRounds), JSON.stringify(r.reviewAssignments).slice(0, 300)); }
                    catch (e) { S[k] = {error: String(e.message).slice(0, 600)}; log(`[seed ${k} FAILED]`, S[k].error); }
                }
                save();
            }
            await signInAs(page, u.ed);
            for (const k of ['s10', 's11']) {
                if (!S[k] || !S[k].id) continue;
                for (const name of ['Cancel Review Round', 'Accept Submission']) {
                    const label = `${k}-ed-${name.toLowerCase().replace(/[^a-z]+/g, '')}`;
                    await openWorkflow(page, workflow(S[k].id), `${label}-workflow`);
                    const pr = await pressDecision(page, name, label);
                    record(`${label}-press`, pr);
                    if (isWizard(page)) { await walkWizard(page, label); await cancelWizard(page, label); } else await closeTop(page);
                }
            }
        });
        // ---- s4 / s5: the Copyediting and Production one- and two-page wizards
        if (on('s4')) await sect('s4', async () => {
            await signInAs(page, u.ed);
            for (const name of ['Send To Production', 'Move to Review']) {
                const label = `s4-ed-${name.toLowerCase().replace(/[^a-z]+/g, '')}`;
                await openWorkflow(page, workflow(S.s4.id), `${label}-workflow`);
                const pr = await pressDecision(page, name, label);
                record(`${label}-press`, pr);
                if (isWizard(page)) { await walkWizard(page, label); await cancelWizard(page, label); }
            }
        });
        if (on('s5')) await sect('s5', async () => {
            await signInAs(page, u.ed);
            await openWorkflow(page, workflow(S.s5.id), 's5-ed-workflow');
            const pr = await pressDecision(page, 'Move To Copyediting', 's5-ed-movetocopyediting');
            record('s5-ed-movetocopyediting-press', pr);
            if (isWizard(page)) { await walkWizard(page, 's5-ed-movetocopyediting'); await cancelWizard(page, 's5-ed-movetocopyediting'); }
        });
        // ---- s9 (OMP): the internal round's roster
        if (on('s9') && isOMP && S.s9 && S.s9.id) await sect('s9', async () => {
            await signInAs(page, u.ed);
            for (const [name, opt] of [['Send to External Review', {}], ['Accept Submission', {}], ['Request Revisions', {}], ['Create New Review Round', {}], ['Cancel Review Round', {}], ['Decline Submission', {}]]) {
                const label = `s9-ed-${name.toLowerCase().replace(/[^a-z]+/g, '')}`;
                await openWorkflow(page, workflow(S.s9.id), `${label}-workflow`);
                const pr = await pressDecision(page, name, label, opt);
                record(`${label}-press`, pr);
                if (isWizard(page)) { await walkWizard(page, label); await cancelWizard(page, label); } else await closeTop(page);
            }
            await signInAs(page, u.se2);
            const {info} = await openWorkflow(page, workflow(S.s9.id), 's9-se2-workflow');
            record('s9-se2-actions', {actions: info.actionButtons, recommendation: info.recommendation});
            for (const name of ['Recommend Send to External Review', 'Recommend Accept']) {
                const label = `s9-se2-${name.toLowerCase().replace(/[^a-z]+/g, '')}`;
                await openWorkflow(page, workflow(S.s9.id), `${label}-workflow`);
                const pr = await pressDecision(page, name, label);
                record(`${label}-press`, pr);
                if (isWizard(page)) { await walkWizard(page, label); await cancelWizard(page, label); }
            }
        });
        // ---- locale: "Switch to French" on context B
        if (on('locale') && sc.B && sc.B.contextPath) await sect('locale', async () => {
            await signInAs(page, sc.B.mgr, sc.B.contextPath);
            await openWorkflow(page, workflow(sc.B.f1).replace(`/${sc.contextPath}/`, `/${sc.B.contextPath}/`), 'B-f1-workflow');
            await pressDecision(page, 'Decline Submission', 'B-f1-decline');
            const w = await readWizardPage(page, 'B-f1-decline-p1');
            const out = {switchTo: w.switchTo, composer: w.composer.filter((c) => /locale|switch/i.test(c.cls + ' ' + c.text)), buttons: w.buttons.filter((b) => /French|Switch|English/i.test(b.text)).map((b) => b.text), subject: w.inputs.find((i) => /Subject/i.test(i.label))?.value};
            const sw = page.locator('main').getByRole('button', {name: /French|fran/i}).first();
            if (await sw.count()) {
                await sw.click(); await page.waitForTimeout(600);
                const d = (await dialogTexts(page)).slice(-1)[0];
                out.confirm = d && {name: d.name, text: flat(d.text, 400), buttons: d.buttons.map((b) => b.t)};
                await snap(page, 'B-f1-switch-confirm', {out});
                const yes = topWin(page).getByRole('button', {name: /^(Yes|OK|Confirm|Switch)/}).first();
                if (await yes.count()) { await yes.click(); await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 15000}).catch(() => {}); await idle(page); await page.waitForTimeout(500); const w2 = await wizInfo(page); out.after = {switchTo: w2.switchTo, subject: w2.inputs.find((i) => /Subject/i.test(i.label))?.value, editor: w2.editors && w2.editors[0] && w2.editors[0].content.slice(0, 200), templates: w2.templates}; await snap(page, 'B-f1-switched', {out}); }
            }
            record('B-switch', out);
            log('[switch]', JSON.stringify(out).slice(0, 600));
            await cancelWizard(page, 'B-f1-decline');
        });
        // ---- revertaddr: a hand-typed "Revert Decline" on an active submission (the wizard opened on OPS): both journal ends
        if (on('revertaddr')) await sect('revertaddr', async () => {
            const out = {};
            out.s7SubmissionStage = await typedAddress(page, u.mgr, S.s7.id, D.REVERT_INITIAL_DECLINE, null, 's7-mgr-typed-revert-initial');
            if (isWizard(page)) {
                await readWizardPage(page, 's7-mgr-typed-revert-initial-p1');
                out.s7Recorded = await recordWizard(page, 's7-mgr-typed-revert-initial');
                const {info} = await openWorkflow(page, workflow(S.s7.id), 's7-after-typed-revert');
                out.s7After = {header: info.header, actions: (info.actionButtons || []).map((b) => b.text), status: info.status};
                out.s7Log = await activityLog(page, 's7-activity-log-after-typed-revert');
                out.s7Mail = await mailFor(`${u.au}@mail.test`, 's7-au-mail-after-typed-revert', {timeoutMs: 5000});
            }
            const rid = S.s2.roundId || roundOf('s2');
            out.s2ReviewStage = await typedAddress(page, u.mgr, S.s2.id, D.REVERT_DECLINE, rid, 's2-mgr-typed-revert-review');
            if (isWizard(page)) { await readWizardPage(page, 's2-mgr-typed-revert-review-p1'); await cancelWizard(page, 's2-mgr-typed-revert-review'); }
            record('revertaddr', out);
        });
        // ---- tmpl: the template list's load (the pause, the replaced text, a typed word), a search result's load, the search for discussion templates
        if (on('tmpl')) await sect('tmpl', async () => {
            await signInAs(page, u.ed);
            await openWorkflow(page, workflow(S.s4.id), 's4-ed-workflow-tmpl');
            await pressDecision(page, 'Send To Production', 's4-ed-tmpl');
            const w0 = await readWizardPage(page, 's4-ed-tmpl-p1');
            const subjectBox = page.getByLabel(/Subject/).first();
            const out = {initialSubject: await subjectBox.inputValue().catch(() => null), initialBody: w0.editors && w0.editors[0] && w0.editors[0].content.slice(0, 120), templates: (w0.templates || []).map((t) => t.text.slice(0, 90))};
            const edId = w0.editors && w0.editors[0] && w0.editors[0].id;
            const typeWord = () => page.evaluate((id) => { const e = window.tinymce.get(id); e.setContent('<p>K1 typed word</p>' + e.getContent()); e.fire('change'); e.fire('input'); }, edId);
            const calls = [];
            page.on('response', (r) => { if (/emailTemplates/.test(r.url())) calls.push({url: r.url().replace(/^.*api\/v1\//, ''), status: r.status(), at: Date.now()}); });
            // a listed template (the decision's own)
            await subjectBox.fill('K1 edited subject');
            await typeWord();
            const listed = page.locator('main button.composer__template, main [class*="composer__template"] button').first();
            out.listedButton = flat(await listed.innerText().catch(() => null), 80);
            let t0 = Date.now();
            await listed.click();
            const maskSeen = await page.locator('.composer__loadingTemplateMask').waitFor({state: 'visible', timeout: 2500}).then(() => true).catch(() => false);
            const maskText = maskSeen ? flat(await page.locator('.composer__loadingTemplateMask').innerText().catch(() => ''), 80) : null;
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
            await idle(page); await page.waitForTimeout(400);
            let w1 = await wizInfo(page);
            out.listedLoad = {maskSeen, maskText, ms: Date.now() - t0, subject: await subjectBox.inputValue().catch(() => null), body: w1.editors && w1.editors[0] && w1.editors[0].content.slice(0, 160), typedWordSurvived: /K1 typed word/.test((w1.editors && w1.editors[0] && w1.editors[0].content) || ''), calls: calls.splice(0)};
            await snap(page, 's4-ed-tmpl-listed-loaded', {out});
            // a search result
            const find = page.getByRole('searchbox').first();
            await find.fill('declined'); await find.press('Enter');
            await page.waitForFunction(() => !/Searching/.test((document.querySelector('main') || document.body).innerText), null, {timeout: 15000}).catch(() => {});
            await idle(page); await page.waitForTimeout(500);
            let ws = await wizInfo(page);
            out.searchDeclined = {results: (ws.templates || []).map((t) => t.text.slice(0, 80)), calls: calls.splice(0)};
            await subjectBox.fill('K1 edited subject 2');
            await typeWord();
            const result = page.locator('main button.composer__template, main [class*="composer__template"] button').first();
            out.resultButton = flat(await result.innerText().catch(() => null), 80);
            t0 = Date.now();
            await result.click();
            const maskSeen2 = await page.locator('.composer__loadingTemplateMask').waitFor({state: 'visible', timeout: 2500}).then(() => true).catch(() => false);
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
            await idle(page); await page.waitForTimeout(1500);
            w1 = await wizInfo(page);
            out.resultLoad = {maskSeen: maskSeen2, ms: Date.now() - t0, subject: await subjectBox.inputValue().catch(() => null), body: w1.editors && w1.editors[0] && w1.editors[0].content.slice(0, 160), typedWordSurvived: /K1 typed word/.test((w1.editors && w1.editors[0] && w1.editors[0].content) || ''), calls: calls.splice(0), templatesNow: (w1.templates || []).map((t) => t.text.slice(0, 60))};
            await snap(page, 's4-ed-tmpl-result-loaded', {out});
            // discussion templates by search
            for (const q of ['Request', 'discussion', 'Copyedit']) {
                await find.fill(q); await find.press('Enter');
                await page.waitForFunction(() => !/Searching/.test((document.querySelector('main') || document.body).innerText), null, {timeout: 15000}).catch(() => {});
                await idle(page); await page.waitForTimeout(500);
                ws = await wizInfo(page);
                out[`search_${q}`] = {results: [...new Set((ws.templates || []).map((t) => t.text.slice(0, 50)))], more: (ws.buttons || []).filter((b) => /more$/i.test(b.text)).map((b) => b.text), calls: calls.splice(0)};
            }
            // an empty search: the list back?
            const clear = page.locator('main').getByRole('button', {name: /Clear search phrase/}).first();
            if (await clear.count()) { await clear.click(); await idle(page); await page.waitForTimeout(500); ws = await wizInfo(page); out.afterClear = [...new Set((ws.templates || []).map((t) => t.text.slice(0, 50)))]; }
            record('tmpl', out);
            log('[tmpl]', JSON.stringify(out).slice(0, 1500));
            await cancelWizard(page, 's4-ed-tmpl');
        });
        // ---- tmpl2: an unlisted template loaded from a search result; the "{n} more" of the "Request" search
        if (on('tmpl2')) await sect('tmpl2', async () => {
            await signInAs(page, u.ed);
            await openWorkflow(page, workflow(S.s4.id), 's4-ed-workflow-tmpl2');
            await pressDecision(page, 'Send To Production', 's4-ed-tmpl2');
            const w0 = await readWizardPage(page, 's4-ed-tmpl2-p1');
            const subjectBox = page.getByLabel(/Subject/).first();
            const edId = w0.editors && w0.editors[0] && w0.editors[0].id;
            const calls = [];
            page.on('response', (r) => { if (/emailTemplates/.test(r.url())) calls.push({url: r.url().replace(/^.*api\/v1\//, ''), status: r.status()}); });
            const out = {};
            const find = page.getByRole('searchbox').first();
            await find.fill('Request'); await find.press('Enter');
            await page.waitForFunction(() => !/Searching/.test((document.querySelector('main') || document.body).innerText), null, {timeout: 15000}).catch(() => {});
            await idle(page); await page.waitForTimeout(400);
            const more = page.locator('main').getByRole('button', {name: /\d+ more/}).first();
            out.moreButton = await more.count() ? flat(await more.innerText(), 20) : null;
            if (await more.count()) { await more.click(); await page.waitForTimeout(500); }
            let ws = await wizInfo(page);
            out.requestAll = [...new Set((ws.templates || []).map((t) => t.text.slice(0, 45)))];
            out.requestCopyeditListed = (ws.templates || []).some((t) => /^Request Copyedit/.test(t.text));
            await snap(page, 's4-ed-tmpl2-request-all', {out});
            // load an unlisted one: "Submission Declined (Pre-Review)" from the "declined" search
            await find.fill('declined'); await find.press('Enter');
            await page.waitForFunction(() => !/Searching/.test((document.querySelector('main') || document.body).innerText), null, {timeout: 15000}).catch(() => {});
            await idle(page); await page.waitForTimeout(400);
            await subjectBox.fill('K1 edited subject 2');
            if (edId) await page.evaluate((id) => { const e = window.tinymce.get(id); e.setContent('<p>K1 typed word</p>' + e.getContent()); e.fire('change'); e.fire('input'); }, edId);
            const result = page.locator('main').getByRole('button', {name: /^Submission Declined \(Pre-Review\)/}).first();
            out.resultPresent = await result.count();
            if (out.resultPresent) {
                calls.length = 0;
                const t0 = Date.now();
                await result.click();
                const maskSeen = await page.locator('.composer__loadingTemplateMask').waitFor({state: 'visible', timeout: 2500}).then(() => true).catch(() => false);
                await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
                await idle(page); await page.waitForTimeout(1500);
                const w1 = await wizInfo(page);
                out.resultLoad = {maskSeen, ms: Date.now() - t0, subject: await subjectBox.inputValue().catch(() => null), body: w1.editors && w1.editors[0] && w1.editors[0].content.slice(0, 160), typedWordSurvived: /K1 typed word/.test((w1.editors && w1.editors[0] && w1.editors[0].content) || ''), calls: calls.slice(), templatesNow: [...new Set((w1.templates || []).map((t) => t.text.slice(0, 45)))], searchBoxValue: await find.inputValue().catch(() => null)};
                await snap(page, 's4-ed-tmpl2-result-loaded', {out});
            }
            record('tmpl2', out);
            log('[tmpl2]', JSON.stringify(out).slice(0, 1500));
            await cancelWizard(page, 's4-ed-tmpl2');
        });
        // ---- notes: what this chunk learned, through the kit's note()
        if (on('notes') && !isOMP) await sect('notes', async () => {
            note('ccK1 · Decision wizard rail: getByRole("list", {name: /Complete the following steps/}); the current and every visited step are <button>s (a visited one drops its number for a check icon and carries pkpSteps__step__label--completed), an unreached step is a plain <span> that ignores clicks; the breadcrumb is a separate list, so `main ol li button` hits "Dashboard" first. Narrowed to 480 px the rail collapses to "{n}/{total} steps" plus a "Show all steps" button (also on a one-step OPS wizard: "1/1 steps"). All three apps.');
            note('ccK1 · Composer reads: the Subject fills after idle() returns (the initial template load), wait for input labelled Subject to be non-empty; the editor is tinymce.get() (no `editors` array), id discussion-body-control; "Find Template" is getByRole("searchbox") and commits on Enter only (fill() alone searches nothing); the "Clear search phrase" button sits inside .composer__templates__search, so a `[class*=composer__template] button` locator picks it before any result; a listed template shows the "Loading" mask ~1.7 s and replaces subject and body (a typed word is lost). OJS and OMP.');
            note('ccK1 · Typed decision addresses: a wrong-stage decision, a recommendation on OPS and an unknown number all land on the access-denied page (user/authorizationDenied) with the policy sentence ("The submission is not at the appropriate stage…", "This decision could not be found…", "You do not have permission…", "The current role does not have access…", "You must be assigned…"); only a review-stage decision with no reviewRoundId, or a recommendation with no deciding editor, answers the bare "404 Not Found". "Revert Decline" (16 at Submission/Production, 15 on a round) opens and RECORDS on a never-declined submission. All three apps.');
            note('ccK1 · OPS: a declined preprint\'s workflow opens on its publication tab (workflowMenuKey=publication_<id>_titleAbstract) with no decision buttons; "Revert Decline" is on the Production entry (workflowMenuKey=workflow_5). A recommend-only Moderator sees "Post the preprint" only (no "Decline Submission"), no "Recommendation" box.');
            note('ccK1 · "Cancel Review Round" is offered on a round 2 only (seed reviewRounds with two entries: the second builds round 2), and not when its only reviewer declined. The completion dialogs have no close cross: the one control is the "View Submission Summary" link (with ret) or "View Submission" + "View All Submissions" (hand-typed address). Leaving a wizard through the breadcrumb with an edited subject prompts nothing on any app.');
            note('ccK1 · Participants row menu "Remove" (author): dialog "Remove Participant" / "You are about to remove this participant from all stages." OK/Cancel; the decision wizard then has no page (no rail, footer "Cancel" + "Record Decision"). Payments on OJS per ccK4\'s note works with input[name=paymentsEnabled], select[name=currency] (label "US Dollar"), select[name=paymentPluginName] ("Manual Fee Payment"), textarea[name=manualInstructions], then /payments › a[name=paymentTypes] › input[name=publicationFee]; "Accept Submission" then opens on "Request Payment" (legend "Payment", radios "Request publication fee (100 USD)" preselected and "Waive").');
        });
        // ---- last: the emptied "To" refusal (s8 as ed), "Select Files" recorded with nothing ticked (s4), A1's closing window (s11)
        if (on('last')) await sect('last-to-empty', async () => {
            await signInAs(page, u.ed);
            await openWorkflow(page, workflow(S.s8.id), 's8-ed-workflow-toempty');
            await pressDecision(page, 'Accept Submission', 's8-ed-accept-toempty');
            // walk to the "Notify Reviewers" page by its heading (a fee-charging journal opens on "Request Payment")
            for (let i = 0; i < 5; i++) { const w = await readWizardPage(page, `s8-ed-accept-toempty-p${i + 1}`); if (/Notify Reviewers$/.test(w.h1 || '')) break; await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page); }
            const w2 = await wizInfo(page);
            const out = {h1: w2.h1, chipsBefore: (w2.chips || []).map((c) => c.text)};
            for (let i = 0; i < 4; i++) { const rm = page.locator('main').getByRole('button', {name: /^(Remove|Deselect) /}).first(); if (!(await rm.count())) break; await rm.click(); await page.waitForTimeout(300); }
            const w3 = await wizInfo(page);
            out.chipsAfter = (w3.chips || []).map((c) => c.text); out.inputsTo = (w3.inputs || []).filter((i) => /^To/i.test(i.label)).map((i) => `${i.type}:${i.label}`); out.errorsAtOnce = w3.errors;
            await snap(page, 's8-ed-accept-toempty-emptied', {out});
            // the box offers the round's reviewers back? open it
            const toBox = page.locator('main').getByRole('combobox').or(page.locator('main input[id*="to"]')).first();
            if (await toBox.count()) { await toBox.click().catch(() => {}); await page.waitForTimeout(500); out.offered = await page.locator('main [role="option"], main [role="listbox"] li').allInnerTexts().catch(() => []); await page.keyboard.press('Escape').catch(() => {}); }
            for (let i = 0; i < 4; i++) { const rec = page.getByRole('button', {name: 'Record Decision', exact: true}); if (await rec.isVisible().catch(() => false)) break; await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page); await page.waitForTimeout(300); }
            await readWizardPage(page, 's8-ed-accept-toempty-last');
            await page.getByRole('button', {name: 'Record Decision', exact: true}).first().click(); await page.waitForTimeout(1500); await idle(page);
            const w4 = await wizInfo(page);
            out.afterRecord = {h1: w4.h1, url: w4.url, notifications: (w4.notifications || []).map((n) => n.text), errors: w4.errors, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)}))};
            await snap(page, 's8-ed-accept-toempty-recorded', {out});
            const viewErr = page.getByRole('button', {name: /View Error/}).first();
            if (await viewErr.count()) { await viewErr.click(); await page.waitForTimeout(600); const w5 = await wizInfo(page); out.viewError = {h1: w5.h1, errors: w5.errors, rail: (w5.rail || []).map((r) => `${r.text}${r.current ? '*' : ''}`)}; await snap(page, 's8-ed-accept-toempty-viewerror', {out}); }
            record('last-to-empty', out);
            log('[to empty]', JSON.stringify(out).slice(0, 1200));
            if (isWizard(page)) await cancelWizard(page, 's8-ed-accept-toempty');
        });
        if (on('last')) await sect('last-none-ticked', async () => {
            await signInAs(page, u.ed);
            // OJS: s6 (Submission stage, one file uploaded here) → "Send for Review"; OMP: s4 → "Send To Production"
            const k = isOMP ? 's4' : 's6';
            const name = isOMP ? 'Send To Production' : 'Send for Review';
            await openWorkflow(page, workflow(S[k].id), `${k}-ed-workflow-nonticked`);
            if (!isOMP) await uploadDirect(page, MD, 's6-upload-1');
            await pressDecision(page, name, `${k}-ed-nonticked`);
            await readWizardPage(page, `${k}-ed-nonticked-p1`);
            const skip = page.getByRole('button', {name: /^Skip this email$/}).first();
            if (await skip.count()) { await skip.click(); await idle(page); await page.waitForTimeout(400); }
            const w2 = await readWizardPage(page, `${k}-ed-nonticked-p2`);
            const boxes = page.locator('main').getByRole('checkbox');
            const n = await boxes.count();
            for (let i = 0; i < n; i++) { if (await boxes.nth(i).isChecked().catch(() => false)) await boxes.nth(i).uncheck({force: true}).catch(() => {}); }
            await page.waitForTimeout(300);
            const w3 = await wizInfo(page);
            const out = {boxes: (w3.inputs || []).filter((i) => i.type === 'checkbox').map((i) => `${i.label}=${i.checked}`)};
            await snap(page, `${k}-ed-nonticked-unticked`, {out});
            out.recorded = await recordWizard(page, `${k}-ed-nonticked`);
            const {info} = await openWorkflow(page, workflow(S[k].id, isOMP ? 'workflow_5' : undefined), `${k}-after-nonticked`);
            out.next = {header: info.header, tables: info.tables, notice: info.notice};
            record('last-none-ticked', out);
            log('[none ticked]', JSON.stringify(out).slice(0, 1200));
        });
        if (on('last') && !(S.s11 && S.s11.a1Done)) await sect('last-a1-closing', async () => {
            S.s11.a1Done = true; save();
            await signInAs(page, u.ed);
            await openWorkflow(page, workflow(S.s11.id), 's11-ed-workflow-a1');
            await pressDecision(page, 'Create New Review Round', 's11-ed-newround-record');
            await readWizardPage(page, 's11-ed-newround-record-p1');
            const skip = page.getByRole('button', {name: /^Skip this email$/}).first();
            if (await skip.count()) { await skip.click(); await idle(page); await page.waitForTimeout(400); }
            await readWizardPage(page, 's11-ed-newround-record-p2');
            const r = await recordWizard(page, 's11-ed-newround-record');
            const {info} = await openWorkflow(page, workflow(S.s11.id), 's11-after-newround');
            record('last-a1-closing', {closing: r.dialog, landed: r.landed, header: info.header});
            await activityLog(page, 's11-activity-log');
        });
        if (on('notes2') && !isOMP) await sect('notes2', async () => {
            note('ccK1 · Correction to the "Cancel Review Round" note above: the button is not a round-2 thing. Seen on a round 2 with an invited reviewer and on a round 1 with no reviewer at all; absent on a round 1 holding an invited, accepted or completed reviewer and on a round 2 whose only reviewer declined (OJS and OMP). Its wizard: "Notify Authors" then "Notify Reviewers" listing the invited reviewer.');
            note('ccK1 · "Notify Reviewers" with every chip removed and "Record Decision" pressed: the refusal is the banner "There was a problem with the Notify Reviewers step." with "View Error" jumping to that page; no message renders under the emptied "To" box (OJS and OMP, `.pkpFieldError` absent). Chips are removed with getByRole("button", {name: /^Remove /}); the emptied box is a plain text input labelled "To:" that offered nothing when clicked.');
        });
        // ---- payment (OJS): Settings › Distribution › Payments (enable, currency, plugin, instructions), then Payments › Payment Types (publicationFee); then Accept's first page
        if (on('payment') && !isOMP) await sect('payment', async () => {
            await signInAs(page, u.mgr);
            await page.goto(ctxUrl('/management/settings/distribution')); await idle(page);
            const tab = page.locator('#payments-button').first();
            if (await tab.count()) { await tab.click(); await idle(page); await page.waitForTimeout(500); }
            const out = {};
            const enable = page.locator('input[name="paymentsEnabled"]').first();
            out.enablePresent = await enable.count();
            if (out.enablePresent) {
                if (!(await enable.isChecked().catch(() => false))) await enable.check({force: true});
                await page.waitForTimeout(600);
                const cur = page.locator('select[name="currency"]').first();
                if (await cur.count()) await cur.selectOption({label: 'US Dollar'}).catch(() => cur.selectOption('USD'));
                const plug = page.locator('select[name="paymentPluginName"]').first();
                if (await plug.count()) { await plug.selectOption({label: 'Manual Fee Payment'}).catch(() => {}); await page.waitForTimeout(600); }
                const instr = page.locator('textarea[name*="manualInstructions"], input[name*="manualInstructions"]').first();
                if (await instr.count()) await instr.fill('K1 manual payment instructions'); else { const rich = await page.evaluate(() => (window.tinymce && window.tinymce.get() || []).map((e) => e.id)); out.richIds = rich; for (const id of rich) { if (/instruction/i.test(id)) await page.evaluate((i) => { const e = window.tinymce.get(i); e.setContent('<p>K1 manual payment instructions</p>'); e.fire('change'); }, id); } }
                out.formInputs = await page.locator('#payments input, #payments select, #payments textarea, main input, main select').evaluateAll((els) => els.filter((e) => e.getClientRects().length).map((e) => ({name: e.name, type: e.type, value: e.type === 'checkbox' ? e.checked : String(e.value).slice(0, 40)})).slice(0, 30));
                const saveBtn = page.locator('form').filter({has: enable}).first().getByRole('button', {name: 'Save', exact: true}).first();
                if (await saveBtn.count()) { await saveBtn.click(); await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 15000}).catch(() => {}); await idle(page); }
                await snap(page, 'payments-saved', {out});
                out.saved = (await page.locator('[role="status"]').allInnerTexts().catch(() => [])).join(' | ');
                out.formErrors = await page.locator('.pkpFieldError, .pkpFormPage__status').allInnerTexts().catch(() => []);
                // Payments › Payment Types
                await page.goto(ctxUrl('/payments')); await idle(page);
                out.paymentsPageUrl = page.url();
                const s1 = await snap(page, 'payments-page');
                const pt = page.locator('a[name="paymentTypes"], #paymentTypes-button, [role=tab]:has-text("Payment Types")').first();
                if (await pt.count()) { await pt.click(); await idle(page); await page.waitForTimeout(500); }
                const fee = page.locator('input[name="publicationFee"]').first();
                out.feePresent = await fee.count();
                if (out.feePresent) {
                    await fee.fill('100');
                    const feeForm = page.locator('#paymentTypesForm, form').filter({has: fee}).first();
                    const feeSave = feeForm.getByRole('button', {name: 'Save', exact: true}).first();
                    if (await feeSave.count()) { await feeSave.click(); await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 15000}).catch(() => {}); await idle(page); }
                    else { const legacy = feeForm.locator('button[type=submit], input[type=submit], .submitFormButton').first(); if (await legacy.count()) { await legacy.click(); await idle(page); await page.waitForTimeout(800); } }
                    out.feeSaved = (await page.locator('[role="status"]').allInnerTexts().catch(() => [])).join(' | ');
                    await snap(page, 'payments-fee-saved', {out});
                }
            }
            record('payments-setup', out);
            log('[payments]', JSON.stringify(out).slice(0, 800));
            await signInAs(page, u.ed);
            await openWorkflow(page, workflow(S.s2.id), 's2-ed-workflow-payment');
            await pressDecision(page, 'Accept Submission', 's2-ed-accept-payment');
            if (isWizard(page)) { await walkWizard(page, 's2-ed-accept-payment'); await cancelWizard(page, 's2-ed-accept-payment'); }
            await openWorkflow(page, workflow(S.s7.id), 's7-ed-workflow-payment');
            await pressDecision(page, 'Accept and Skip Review', 's7-ed-skipreview-payment');
            if (isWizard(page)) { await walkWizard(page, 's7-ed-skipreview-payment'); await cancelWizard(page, 's7-ed-skipreview-payment'); }
        });
    } finally { record('browser-dialogs', dialogsSeen); save(); await close(); }
});
