// U34 claim check, chunk K2: the email page and the Composer.
// Rule 3 (an email page, "Skip this email"), Rule 4 (recipients), Rule 5 (placeholders and
// "Insert Content"), Rule 7 (loading a template, "Find Template"), Rule 8 (switching the language),
// Side effects "The author's email" (with the per-decision template/subject/log table), "The
// reviewers' emails", "The author's task"; the settings bullets "Notify All Authors", "The email
// templates" and "Forms" languages; register A3 and A5.
// Spec: docs/specs/U34-editorial-decision-recording.md lines 144–176, 214–231, 356–405, 425–443, 597–608, 619–629.
//
// OJS/OMP: one scratch context C (tag u34k2) with mgr, ed (manager-level editor), se (deciding section
// editor, assigned everywhere), se2 (made recommend-only on screen), rv1..rv3 + rvd (external reviewers),
// au, au2, au3 (authors), and these submissions (submitter au unless stated):
//   s1  Submission stage → "Send for Review" (Insert Content roster), "New Review Round", "Cancel Review Round", "Decline" (Review), "Revert Decline" (Review)
//   s2  Submission stage, au3 a second assigned author → "Decline Submission" with an attachment (the author mail), then "Revert Decline" under "Login As"
//   s3  Submission stage → "Accept and Skip Review" skipped with an emptied subject (never checked, sends nothing), then "Move to Review"
//   s4  round 1 rv1 + rv2 completed → Rules 3, 4, 5, 7 reads on "Accept Submission"; then Accept recorded untouched (A3 one name each), "Send To Production", "Move To Copyediting"; A5 as au
//   s5  round 1 rv1 + rv2 completed → se2 recommend-only ("Notify Editors" chips); "Request Revisions" with a word typed (A3 both names); au's task and Notifications list; then Accept skipped → the task cleared
//   s6  round 1 rv1 + rv2 completed → "Resubmit for Review"; au's task
//   s7  round 1 empty, round 2 rv3 invited → Accept has no "Notify Reviewers"; "Cancel Review Round" lists rv3 and records ("Review Cancel")
//   s8  Submission stage, a contributor without an account → Decline at the default "Notify All Authors" (two mails)
//   s9  the same after the setting is flipped (one mail)
//   s10 round 1 rv1 + rvd completed → rvd disabled: the reviewers' list without rvd
//   s11 Submission stage, submitter au2 → au2 disabled: no "Notify Authors" page
//   s12 Submission stage → the decline template edited and an alternative added: the list and the letter
//   m1  {OMP} Submission stage → "Send to Internal Review", then "Send to External Review" from the internal round
// Context F (tag u34k2f): French under "UI" only, then "Forms" ticked on screen: the "Switch to French" link, its dialog, the French letter and mail (all three apps).
// OPS: a scratch server P with mgr, mod, au, au2: Decline and Revert Decline (Production), Insert Content, Find Template, the contributor mails, the author's view (A5), the disabled author.
//
//   PROBE_FEATURE=U34 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U34/K2/k2.js
//   PHASES=seed,s4,s5,s6,s7,s1,s2,s3,s8,s9,s10,s11,s12,omp,locale,ops   (default all; later phases reuse k2-state-<app>.json)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const REPO = path.resolve(__dirname, '../../../../..');
const PDF = path.join(REPO, 'apps/ojs/playwright/fixtures/files/article.pdf');
const ALL = ['seed', 's4', 's5', 's6', 's7', 's1', 's2', 's3', 's8', 's9', 's10', 's11', 's12', 'omp', 'locale', 'ops'];
const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ALL;
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const flat = (s, n) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n || 400));
const firstLine = (s) => ((s || '').split('\n').map((l) => l.trim()).filter(Boolean)[0] || null);
const stateFile = (app) => path.join(outDir(), `k2-state-${app.name}.json`);

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
// Every visible dialog as data.
const dialogTexts = (page) => page.locator('[role="dialog"]:visible').evaluateAll((els) =>
    els.map((d) => ({
        name: d.getAttribute('aria-label') || (d.getAttribute('aria-labelledby') && document.getElementById(d.getAttribute('aria-labelledby'))?.innerText) || null,
        text: d.innerText.slice(0, 6000),
        buttons: [...d.querySelectorAll('button, a[role=button], a.pkp_button, input[type=submit], a')].filter((b) => b.getClientRects().length).map((b) => ({t: (b.getAttribute('aria-label') || b.innerText || b.value || '').trim().replace(/\s+/g, ' ').slice(0, 80), tag: b.tagName.toLowerCase(), cls: b.className.slice(0, 120), href: b.getAttribute('href')})).filter((b) => b.t).slice(0, 60),
        inputs: [...d.querySelectorAll('input, textarea, select')].map((i) => ({type: i.type, name: i.name || i.id || null, value: String(i.value).slice(0, 200), checked: i.type === 'checkbox' || i.type === 'radio' ? i.checked : undefined, label: (i.id && document.querySelector(`label[for="${i.id}"]`)?.innerText || i.getAttribute('aria-label') || i.placeholder || '').trim().slice(0, 120)})).slice(0, 40),
        headings: [...d.querySelectorAll('h1,h2,h3,h4')].filter((h) => h.getClientRects().length).map((h) => h.innerText.trim()).filter(Boolean).slice(0, 30),
    }))).catch(() => []);
// The workflow dialog as data (K1's reader).
const wfInfo = (page) => page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const dlgs = [...document.querySelectorAll('[role=dialog]')].filter(vis);
    const root = dlgs[0] || document.body;
    const tables = [...root.querySelectorAll('table')].filter(vis).map((t) => ({
        name: t.getAttribute('aria-label') || (t.getAttribute('aria-labelledby') && document.getElementById(t.getAttribute('aria-labelledby'))?.innerText.trim()) || (t.querySelector('caption') || {}).innerText?.trim() || null,
        columns: [...t.querySelectorAll('thead th')].map((th) => th.innerText.trim()),
        rows: [...t.querySelectorAll('tbody tr')].map((tr) => tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 260)),
        rowButtons: [...t.querySelectorAll('tbody tr button, tbody tr a')].filter(vis).map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim()).filter(Boolean).slice(0, 30),
    }));
    const hs = [...root.querySelectorAll('h1,h2,h3,h4')].filter(vis);
    const headings = hs.map((e) => e.innerText.trim()).filter(Boolean).slice(0, 60);
    const btnEls = [...root.querySelectorAll('button, a.pkp_button, a[role=button]')].filter(vis);
    const buttons = btnEls.map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 80);
    const actionRegion = root.querySelector('[data-cy="workflow-action-items"]');
    const actionButtons = actionRegion ? [...actionRegion.querySelectorAll('button')].filter(vis).map((b) => ({text: b.innerText.trim(), primary: /\bbg-primary\b/.test(b.className)})) : null;
    const byHeading = (re) => { const h = hs.find((x) => re.test(x.innerText.trim())); return h && h.nextElementSibling ? h.nextElementSibling.innerText.trim().replace(/\s+/g, ' ').slice(0, 400) : null; };
    const lines = (dlgs[0] ? dlgs[0].innerText : '').split('\n').map((l) => l.trim()).filter(Boolean);
    const closeAt = lines.indexOf('Close');
    const header = dlgs[0] ? lines.slice(closeAt >= 0 ? closeAt + 1 : 0, (closeAt >= 0 ? closeAt + 1 : 0) + 6).join(' | ') : null;
    const lists = [...root.querySelectorAll('ul, ol')].filter(vis).filter((l) => l.getAttribute('aria-label')).map((l) => ({name: l.getAttribute('aria-label'), items: [...l.children].map((c) => c.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)).slice(0, 30)})).slice(0, 20);
    const notices = [...root.querySelectorAll('[role=alert], [role=status], [class*="otification"]')].filter(vis).map((e) => e.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 40);
    return {dialogCount: dlgs.length, headings, buttons, actionButtons, tables, lists, notices, notice: byHeading(/^Notification$/i), status: byHeading(/^Status$/i), recommendation: byHeading(/^Recommendation$/i), header, text: root.innerText.replace(/\s+/g, ' ').slice(0, 3000)};
});
// The decision wizard page as data (K1's reader, plus the composer's template entries with their snippets and the skip notice).
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
    const rail = railList ? [...railList.children].map((li) => { const c = li.querySelector('button, a') || li.querySelector('span'); return {text: txt(li), tag: c ? c.tagName.toLowerCase() : null, current: li.getAttribute('aria-current') || c?.getAttribute('aria-current') || (/current/i.test(li.className + (c ? c.className : '')) ? 'cls' : null), completed: /completed/.test(li.className + ' ' + (c ? c.className : ''))}; }) : null;
    const hs = [...main.querySelectorAll('h1,h2,h3,h4,legend')].filter(vis).map((e) => ({tag: e.tagName.toLowerCase(), text: txt(e), next: e.nextElementSibling && vis(e.nextElementSibling) ? txt(e.nextElementSibling).slice(0, 400) : null})).slice(0, 30);
    const btns = [...main.querySelectorAll('button, a.pkp_button, a[role=button], input[type=submit]')].filter(vis).map((b) => ({text: (b.innerText || b.getAttribute('aria-label') || b.value || '').trim().replace(/\s+/g, ' ').slice(0, 80), aria: b.getAttribute('aria-label'), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true', primary: /\bbg-primary\b|pkpButton--isPrimary/.test(b.className), cls: b.className.slice(0, 100), inFooter: !!b.closest('[class*="footer"]'), inToolbar: !!b.closest('.tox-toolbar, [class*="toolbar"]')})).filter((b) => b.text).slice(0, 120);
    const inputs = [...main.querySelectorAll('input, textarea, select')].filter((i) => vis(i) || i.type === 'checkbox' || i.type === 'radio').map((i) => ({type: i.type, name: i.name || null, id: i.id || null, label: labelOf(i), value: String(i.value).slice(0, 300), checked: i.type === 'checkbox' || i.type === 'radio' ? i.checked : undefined, disabled: i.disabled, visible: vis(i)})).slice(0, 60);
    const composer = main.querySelector('.composer');
    const templates = [...main.querySelectorAll('.composer__template')].filter(vis).map((e) => ({name: txt(e.querySelector('.composer__template__name')), snippet: txt(e.querySelector('.composer__template__body'))})).slice(0, 30);
    const templatesHeading = txt(main.querySelector('.composer__templates__heading'));
    const chips = [...main.querySelectorAll('.composer__recipients [class*="autosuggest__selected"] > *, .composer__recipients [class*="autosuggest__selection"], .composer__recipients .pkpBadge, .composer__recipients [class*="election"]')].filter(vis).map((e) => ({cls: e.className.slice(0, 80), text: txt(e).slice(0, 120), removeBtn: (e.querySelector('button') || {}).getAttribute?.('aria-label') || null})).slice(0, 12);
    const recipientsBox = main.querySelector('.composer__recipients');
    const recipientsDisabled = recipientsBox ? !!(recipientsBox.querySelector('input[disabled], [aria-disabled="true"]') || /disabled/.test(recipientsBox.className)) : null;
    const recipientsText = txt(recipientsBox);
    const removeBtns = btns.filter((b) => /^(Remove|Deselect)/i.test(b.aria || b.text)).map((b) => b.aria || b.text);
    const toolbar = [...main.querySelectorAll('.tox-toolbar__primary button, .tox-toolbar button, .tox-tbtn')].filter(vis).map((b) => b.getAttribute('aria-label') || b.title || b.innerText.trim()).slice(0, 30);
    const edList = window.tinymce ? (Array.isArray(window.tinymce.editors) && window.tinymce.editors.length ? window.tinymce.editors : (window.tinymce.get() || [])) : [];
    const editors = edList.map((ed) => { try { const c = ed.getContainer && ed.getContainer(); return {id: ed.id, visible: !!(c && c.getClientRects().length), content: ed.getContent({format: 'text'}).replace(/\s+/g, ' ').slice(0, 900), html: ed.getContent().slice(0, 600)}; } catch (e) { return {id: ed.id, error: String(e.message)}; } }).sort((a, b) => (b.visible ? 1 : 0) - (a.visible ? 1 : 0));
    const mask = main.querySelector('.composer__loadingTemplateMask');
    const panels = [...main.querySelectorAll('.listPanel')].filter(vis).map((p) => ({title: txt(p.querySelector('.listPanel__title, h2, h3')), items: [...p.querySelectorAll('.listPanel__item')].map((it) => ({text: txt(it).slice(0, 220), checked: it.querySelector('input[type=checkbox]')?.checked ?? null})).slice(0, 20), empty: /No items/i.test(p.innerText)})).slice(0, 8);
    const notifications = [...main.querySelectorAll('[role=alert], .pkpNotification, [class*="pkpNotification"], [class*="notification"]')].filter(vis).map((e) => ({cls: e.className.slice(0, 80), text: txt(e).slice(0, 300)})).slice(0, 12);
    const errors = [...main.querySelectorAll('.pkpFieldError, [class*="FieldError"], [class*="error"]')].filter(vis).map((e) => ({cls: e.className.slice(0, 80), text: txt(e).slice(0, 200)})).filter((e) => e.text).slice(0, 12);
    const locales = main.querySelector('.composer__locales');
    const switchTo = locales ? {text: txt(locales), buttons: [...locales.querySelectorAll('button')].map((b) => txt(b))} : null;
    const skip = btns.find((b) => /Skip this email|Don't skip this email/i.test(b.text));
    const skipPanel = main.querySelector('.decision__skipStep, [class*="skipStep"], [class*="emailSkipped"]');
    const attachments = [...main.querySelectorAll('.composer__attachment')].filter(vis).map((e) => txt(e).slice(0, 200));
    const subjectInput = [...main.querySelectorAll('input')].filter(vis).find((i) => /^Subject/i.test(labelOf(i)));
    return {url: location.href, title: document.title, h1: txt(h1), description: txt(desc), rail, headings: hs, buttons: btns, inputs, hasComposer: !!composer, templatesHeading, templates, chips, recipientsDisabled, recipientsText, removeBtns, toolbar, editors, maskVisible: !!(mask && vis(mask)), panels, notifications, errors, switchTo, skip: skip ? skip.text : null, skipPanel: txt(skipPanel), attachments, subject: subjectInput ? subjectInput.value : null, text: main.innerText.slice(0, 8000)};
});
const menuItems = (page) => page.locator('[role="menuitem"]:visible').evaluateAll((els) => els.map((e) => e.textContent.trim().replace(/\s+/g, ' '))).catch(() => []);
const topWin = (page) => page.locator('[role="dialog"]:visible').last();
async function closeTop(page) {
    const top = topWin(page);
    const c = top.locator('button:visible, a:visible').filter({hasText: /^\s*(Cancel|Close)\s*$/}).last();
    if (await c.count()) { await c.click({timeout: 5000}).catch(() => {}); await idle(page); await page.waitForTimeout(400); }
    else { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(400); }
}
async function closeAll(page) {
    for (let i = 0; i < 4 && (await page.locator('[role="dialog"]:visible').count()) > 0; i++) await closeTop(page);
}
const isWizard = (page) => /\/decision\/record\//.test(page.url());
async function waitWizard(page) {
    await page.waitForURL(/decision\/record/, {timeout: 20000}).catch(() => {});
    await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
    await idle(page);
    await page.waitForFunction(() => !!document.querySelector('main h1') || document.body.innerText.length > 200, null, {timeout: 15000}).catch(() => {});
}
// The editor of the letter: the one with content (tinymce.get() on this build).
const editorId = (page) => page.evaluate(() => { const l = window.tinymce ? (Array.isArray(window.tinymce.editors) && window.tinymce.editors.length ? window.tinymce.editors : (window.tinymce.get() || [])) : []; const vis = (x) => { try { const c = x.getContainer(); return !!(c && c.getClientRects().length); } catch (_) { return false; } }; const e = l.find(vis) || l.find((x) => { try { return x.getContent().length > 0; } catch (_) { return false; } }) || l[0]; return e ? e.id : null; });
const editorText = (page, id) => page.evaluate((i) => { const e = window.tinymce.get(i); return e ? e.getContent({format: 'text'}) : null; }, id);
// Type into the letter the way a person does: click the editor's body, go to its start, type.
async function typeIntoEditor(page, id, html) {
    const text = String(html).replace(/<[^>]+>/g, '');
    const focused = await page.evaluate((i) => { const e = window.tinymce.get(i); if (!e) return false; e.focus(); const p = e.getBody().firstElementChild || e.getBody(); e.selection.select(p, true); e.selection.collapse(true); return true; }, id);
    if (focused) {
        await page.keyboard.type(text + ' ', {delay: 10});
        await page.waitForTimeout(200);
        return;
    }
    await page.evaluate(([i, h]) => { const e = window.tinymce.get(i); e.focus(); const p = e.getBody().firstElementChild || e.getBody(); e.selection.select(p, true); e.selection.collapse(true); e.insertContent(h); e.fire('change'); e.fire('input'); }, [id, html]);
}

forEachApp(async (app) => {
    const sf = stateFile(app);
    const sc = fs.existsSync(sf) ? JSON.parse(fs.readFileSync(sf, 'utf8')) : {};
    const save = () => fs.writeFileSync(sf, JSON.stringify(sc, null, 2));
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const ctxUrl = (p, cp) => app.url(`/index.php/${cp || sc.contextPath}${p}`);
    const workflow = (id, key, cp) => ctxUrl(`/dashboard/editorial?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`, cp);
    const authorWorkflow = (id, key, cp) => ctxUrl(`/dashboard/mySubmissions?workflowSubmissionId=${id}${key ? `&workflowMenuKey=${key}` : ''}`, cp);
    const roundKey = (s, n = 0) => (s.raw && s.raw.reviewRounds && s.raw.reviewRounds[n] ? `workflow_${s.raw.reviewRounds[n].stageId}_${s.raw.reviewRounds[n].id}` : undefined);
    const roundId = (s, n = 0) => (s.raw && s.raw.reviewRounds && s.raw.reviewRounds[n] ? s.raw.reviewRounds[n].id : null);
    const signInAs = async (page, u, cp) => { await signIn(page, u, {contextPath: cp || sc.contextPath}); await idle(page); };
    const mailOf = (u) => `${u}@mail.test`;
    const dialogsSeen = [];
    const armDialogs = (page) => page.on('dialog', async (d) => { dialogsSeen.push({type: d.type(), message: d.message(), url: page.url()}); log('[browser dialog]', d.type(), flat(d.message(), 120)); await d.accept().catch(() => {}); });

    async function openWorkflow(page, url, label) {
        await page.goto(url); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page).catch((e) => ({error: String(e.message)}));
        const s = await snap(page, label, {info});
        log(`[${label}]`, app.name, 'header:', flat(info.header, 90), '| actions:', JSON.stringify((info.actionButtons || []).map((b) => `${b.text}${b.primary ? '*' : ''}`)), '| tables:', JSON.stringify((info.tables || []).map((t) => `${t.name}:${t.rows.length}`)));
        return {info, s};
    }
    async function readWizardPage(page, label, extra) {
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page);
        await page.waitForFunction(() => { const m = document.querySelector('main') || document.body; const c = m.querySelector('.composer'); if (!c) return true; if (/This step has been skipped/.test(m.innerText)) return true; const inp = [...m.querySelectorAll('input')].find((i) => /subject/i.test((i.id && document.querySelector(`label[for="${i.id}"]`)?.innerText) || i.name || i.getAttribute('aria-label') || '')); return inp && inp.value.length > 0; }, null, {timeout: 15000}).catch(() => {});
        await page.waitForTimeout(300);
        const w = await wizInfo(page).catch((e) => ({error: String(e.message), url: page.url()}));
        await snap(page, label, {wiz: w, ...(extra || {})});
        log(`[${label}]`, 'h1:', flat(w.h1, 80), '| rail:', JSON.stringify((w.rail || []).map((r) => `${r.text}${r.current ? '*' : ''}`)), '| templates:', JSON.stringify((w.templates || []).map((t) => t.name)), '| subject:', flat(w.subject, 100), '| chips:', JSON.stringify((w.chips || []).map((c) => c.text)), '| remove:', JSON.stringify(w.removeBtns), '| switchTo:', JSON.stringify(w.switchTo), '| skip:', w.skip, '| first line:', flat(firstLine((w.editors || [])[0] && (w.editors[0].content || '')), 80));
        return w;
    }
    // Press a decision button on the open workflow; handle a choice window; land on the wizard.
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
            const t = topWin(page);
            if (choice && typeof choice === 'number') { const radios = t.locator('input[type=radio]'); if (await radios.count() > choice) await radios.nth(choice).check({force: true}); }
            const next = t.getByRole('button', {name: /^(Next|Yes, Continue|Continue|OK)$/}).first();
            if (await next.count()) { await next.click(); await idle(page); } else break;
        }
        if (isWizard(page)) await waitWizard(page);
        out.url = page.url();
        return out;
    }
    // Walk the wizard's pages with Continue (no skipping), read each; stops on the last page.
    async function walkWizard(page, label) {
        const pages = [];
        for (let n = 1; n < 7; n++) {
            const w = await readWizardPage(page, `${label}-p${n}`);
            pages.push({n, h1: w.h1, rail: (w.rail || []).map((r) => `${r.text}${r.current ? '*' : ''}`), panelHeading: (w.headings || []).find((h) => h.tag === 'h2')?.text || null, guidance: (w.headings || []).find((h) => h.tag === 'h2')?.next || null, templatesHeading: w.templatesHeading, templates: w.templates, subject: w.subject, chips: (w.chips || []).map((c) => c.text), removeBtns: w.removeBtns, recipientsDisabled: w.recipientsDisabled, recipientsText: w.recipientsText, firstLine: firstLine((w.editors || [])[0]?.content), skip: w.skip, switchTo: w.switchTo, panels: (w.panels || []).map((p) => ({title: p.title, items: p.items.map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.text.slice(0, 60)}`), empty: p.empty})), url: w.url});
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
    async function cancelWizard(page, label) {
        const cancel = page.getByRole('button', {name: 'Cancel', exact: true}).first();
        if (!(await cancel.count())) { record(`${label}-cancel-absent`, {url: page.url()}); return null; }
        await cancel.click(); await page.waitForTimeout(500); await idle(page);
        const ds = await dialogTexts(page);
        const d = ds[ds.length - 1];
        const out = {dialog: d ? {name: d.name, text: flat(d.text, 400), buttons: d.buttons.map((b) => b.t)} : null};
        const cd = topWin(page).getByRole('button', {name: 'Cancel Decision'}).first();
        if (await cd.count()) { await cd.click(); await idle(page); await page.waitForTimeout(800); await idle(page); }
        out.landed = page.url();
        record(`${label}-cancel`, out);
        return out;
    }
    // "Record Decision" → the closing window → leave by its link. Returns the landing too.
    async function recordWizard(page, label) {
        const rec = page.getByRole('button', {name: 'Record Decision', exact: true}).first();
        await rec.click(); await idle(page);
        await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].some((e) => e.getClientRects().length) || document.querySelector('[role=alert], .pkpNotification, .pkpFieldError'), null, {timeout: 30000}).catch(() => {});
        await page.waitForTimeout(800); await idle(page);
        const w = await wizInfo(page).catch(() => ({}));
        const ds = await dialogTexts(page);
        const d = ds[ds.length - 1];
        const out = {url: page.url(), dialog: d ? {name: d.name, text: flat(d.text, 600), buttons: d.buttons.map((b) => `${b.t}<${b.tag}>`)} : null, notifications: (w.notifications || []).map((n) => n.text), errors: w.errors, h1: w.h1};
        await snap(page, `${label}-recorded`, {out});
        log(`[${label} recorded]`, JSON.stringify(out).slice(0, 500));
        if (d) {
            const t = topWin(page);
            let leave = t.getByRole('link', {name: /View Submission|View All/}).first();
            if (!(await leave.count())) leave = t.getByRole('button', {name: /View Submission|Close|OK/}).first();
            if (await leave.count()) { out.leftWith = flat(await leave.innerText().catch(() => '') || await leave.getAttribute('aria-label'), 60); await leave.click(); await idle(page); await page.waitForTimeout(1000); await idle(page); out.landed = page.url(); const info = await wfInfo(page).catch(() => ({})); out.landedHeader = info.header; out.landedActions = (info.actionButtons || []).map((b) => b.text); out.landedTables = info.tables; await snap(page, `${label}-recorded-landed`, {out}); }
        }
        record(`${label}-record`, out);
        log(`[${label} landed]`, out.leftWith, out.landed, '|', flat(out.landedHeader, 80));
        return out;
    }
    // Continue to the last page ticking nothing, then Record (skips nothing).
    async function continueAndRecord(page, label) {
        const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
        for (let i = 0; i < 6 && !(await rec.isVisible().catch(() => false)); i++) { await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page); await page.waitForTimeout(300); }
        return recordWizard(page, label);
    }
    async function activityLog(page, label) {
        const btn = page.locator('[role="dialog"]:visible').first().getByRole('button', {name: /Activity Log/}).first();
        if (!(await btn.count())) { record(label, {absent: true}); return null; }
        await btn.click();
        const dlg = topWin(page);
        await dlg.waitFor({timeout: 30000}).catch(() => {});
        await dlg.locator('table tbody tr td').first().waitFor({timeout: 30000}).catch(() => {});
        await idle(page);
        const tabs = await dlg.getByRole('tab').allInnerTexts().catch(() => []);
        const rows = await dlg.locator('table tbody tr').evaluateAll((els) => els.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.innerText.trim().replace(/\s+/g, ' ').slice(0, 300)).filter((c) => c && !/pkpHandler|\$\$\$call\$\$\$/.test(c)))).catch(() => []);
        const links = await dlg.locator('table tbody tr a').evaluateAll((els) => els.map((a) => a.innerText.trim()).filter(Boolean)).catch(() => []);
        await snap(page, label, {rows, tabs, links});
        log(`[${label}]`, JSON.stringify(rows.slice(0, 5)).slice(0, 700));
        await closeTop(page);
        return {rows, tabs, links};
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
        const rows = await dlg.locator('tr.gridRow').evaluateAll((els) => els.map((tr) => ({text: tr.innerText.trim().replace(/\s+/g, ' ').slice(0, 300), href: tr.querySelector('a')?.getAttribute('href') || null}))).catch(() => []);
        await snap(page, label, {button: lbl, dialog: d && {name: d.name, text: flat(d.text, 1500)}, rows});
        log(`[${label}]`, lbl, '|', JSON.stringify(rows).slice(0, 400));
        await closeTop(page);
        return {button: lbl, text: d && d.text, rows};
    }
    async function mailFor(email, label, opts) {
        try {
            const m = await app.mail.find({to: email, timeoutMs: 25000, ...(opts || {})});
            const full = await app.mail.fullMessage(m.ID).catch(() => null);
            const out = {to: email, subject: m.Subject, from: m.From, toList: m.To, cc: m.Cc, attachments: full && (full.Attachments || []).map((a) => a.FileName), text: flat(full && (full.Text || ''), 1200), firstLine: firstLine(full && full.Text), date: m.Created, id: m.ID};
            record(label, out);
            log(`[${label}]`, JSON.stringify({subject: out.subject, from: out.from, attachments: out.attachments, first: out.firstLine}).slice(0, 400));
            return out;
        } catch (e) { record(label, {to: email, none: true, error: String(e.message).slice(0, 200)}); log(`[${label}] no mail:`, flat(e.message, 100)); return null; }
    }
    // Attach the fixture PDF through "Attach Files" › "Upload File" (K4's idiom).
    async function attachFile(page, label) {
        const att = page.getByRole('button', {name: 'Attach Files', exact: true}).first();
        if (!(await att.count())) { record(`${label}-attach`, {absent: true}); return false; }
        await att.click(); await idle(page);
        const win = topWin(page);
        await win.waitFor({timeout: 30000});
        await page.waitForTimeout(600); await idle(page);
        const up = win.getByRole('button', {name: /Upload File/}).first();
        if (!(await up.count())) { await closeTop(page); return false; }
        await up.click(); await idle(page); await page.waitForTimeout(400);
        const input = win.locator('input[type="file"]').first();
        await input.waitFor({state: 'attached', timeout: 15000});
        await input.setInputFiles(PDF);
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && /article\.pdf/.test(d.innerText); }, null, {timeout: 30000}).catch(() => {});
        await idle(page); await page.waitForTimeout(800);
        const add = win.getByRole('button', {name: 'Attach Files', exact: true}).last();
        if (await add.count()) { await add.click(); await idle(page); }
        await page.waitForFunction(() => [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).length === 0, null, {timeout: 15000}).catch(() => {});
        await idle(page); await page.waitForTimeout(400);
        if ((await dialogTexts(page)).length) await closeAll(page);
        const w = await wizInfo(page);
        record(`${label}-attach-after`, {attachments: w.attachments});
        return (w.attachments || []).some((a) => /article\.pdf/.test(a));
    }
    // Rule 5: "Insert Content" on the current email page. Puts the cursor at the end of the letter's first paragraph first.
    async function insertContentProbe(page, label, filter = 'name') {
        const id = await editorId(page);
        const out = {editorId: id};
        if (!id) { record(`${label}-insert`, out); return out; }
        out.firstParagraphBefore = await page.evaluate((i) => window.tinymce.get(i).getBody().firstElementChild?.innerText || null, id);
        await page.evaluate((i) => { const e = window.tinymce.get(i); e.focus(); const p = e.getBody().firstElementChild || e.getBody(); e.selection.select(p, true); e.selection.collapse(false); }, id);
        const btn = page.locator('.tox-tbtn:visible').filter({hasText: /^Insert Content$/}).first();
        out.buttonCount = await btn.count();
        if (!out.buttonCount) { record(`${label}-insert`, out); return out; }
        await loc(page, `${label}: the toolbar's "Insert Content" button`, btn);
        await btn.click(); await idle(page);
        const dlg = topWin(page);
        await dlg.waitFor({timeout: 15000}).catch(() => {});
        await dlg.locator('.insertContent__item').first().waitFor({timeout: 15000}).catch(() => {});
        await page.waitForTimeout(300);
        const d = (await dialogTexts(page)).slice(-1)[0];
        out.window = d && {name: d.name, headings: d.headings, inputs: d.inputs, buttons: d.buttons.map((b) => `${b.t}<${b.tag}>`).slice(0, 12)};
        const readItems = () => dlg.locator('.insertContent__item').evaluateAll((els) => els.map((e) => ({value: e.querySelector('.insertContent__item__value')?.innerText.trim().replace(/\s+/g, ' ').slice(0, 200), description: e.querySelector('.insertContent__item__description')?.innerText.trim().replace(/\s+/g, ' ').slice(0, 200), control: [...e.querySelectorAll('button, a')].map((b) => `${b.innerText.trim()}<${b.tagName.toLowerCase()}>`).join('|')}))).catch(() => []);
        out.items = await readItems();
        out.listLabel = await dlg.locator('ol.insertContent__items').getAttribute('aria-label').catch(() => null);
        await snap(page, `${label}-insert-window`, {out});
        const search = dlg.locator('input[type="search"], input[type="text"], [role="searchbox"]').first();
        out.searchLabel = await search.getAttribute('aria-label').catch(() => null);
        out.searchPlaceholder = await search.getAttribute('placeholder').catch(() => null);
        out.searchLabelElement = await search.evaluate((i) => { const l = i.closest('label') || (i.id && document.querySelector(`label[for="${i.id}"]`)); return l ? {text: l.innerText.trim(), html: l.innerHTML.replace(/\s+/g, ' ').slice(0, 400)} : null; }).catch(() => null);
        await loc(page, `${label}: "Insert Content" search box`, search);
        await search.fill(filter); await page.waitForTimeout(400);
        out.filtered = {phrase: filter, items: await readItems()};
        await snap(page, `${label}-insert-filtered`, {filtered: out.filtered});
        await search.fill(''); await page.waitForTimeout(300);
        const items = await readItems();
        const idx = Math.max(0, items.findIndex((it) => /journal|press|server|context/i.test(it.description || '') && !/url|address|link/i.test(it.description || '')));
        const target = dlg.locator('.insertContent__item').nth(idx).locator('button, a').first();
        out.inserted = {index: idx, value: items[idx] && items[idx].value, description: items[idx] && items[idx].description};
        await target.click(); await idle(page); await page.waitForTimeout(400);
        out.inserted.windowStillOpen = (await page.locator('[role="dialog"]:visible').count()) > 0;
        out.inserted.firstParagraphAfter = await page.evaluate((i) => window.tinymce.get(i).getBody().firstElementChild?.innerText || null, id);
        out.inserted.editorText = flat(await editorText(page, id), 400);
        await snap(page, `${label}-insert-after`, {inserted: out.inserted});
        record(`${label}-insert`, out);
        log(`[${label} insert]`, 'window:', out.window && out.window.name, '| items:', JSON.stringify(out.items.map((i) => i.value)).slice(0, 400), '| after:', flat(out.inserted.firstParagraphAfter, 160));
        return out;
    }
    // Rule 7: the "Find Template" search, the greying pause, and the typed word.
    async function findTemplateProbe(page, label, {phrase = 'copyedit', pick = /Request Copyedit/} = {}) {
        const out = {};
        const find = page.locator('.composer__templates__search input').first();
        out.present = await find.count();
        if (!out.present) { record(`${label}-find`, out); return out; }
        out.findLabel = await find.getAttribute('aria-label').catch(() => null);
        out.findPlaceholder = await find.getAttribute('placeholder').catch(() => null);
        await loc(page, `${label}: the "Find Template" box`, find);
        const subjectBefore = (await wizInfo(page)).subject;
        const id = await editorId(page);
        await typeIntoEditor(page, id, '<p>K2 typed word</p>');
        out.typedWordPresent = /K2 typed word/.test(await editorText(page, id));
        const resp = page.waitForResponse((r) => /emailTemplates\?/.test(r.url()), {timeout: 15000}).catch(() => null);
        await find.fill(phrase); await find.press('Enter');
        out.searchingSeen = await page.waitForFunction(() => /Searching/.test((document.querySelector('main') || document.body).innerText), null, {timeout: 3000}).then(() => true).catch(() => false);
        const r = await resp;
        out.searchResponse = r ? {status: r.status(), url: r.url().replace(/^https?:\/\/[^/]+/, '').replace(/&_=\d+/, '')} : null;
        await page.waitForFunction(() => !/Searching/.test((document.querySelector('main') || document.body).innerText), null, {timeout: 15000}).catch(() => {});
        await idle(page); await page.waitForTimeout(500);
        const errDialogs = await dialogTexts(page);
        if (errDialogs.length) {
            out.errorDialog = errDialogs.map((d) => ({name: d.name, text: flat(d.text, 300), buttons: d.buttons.map((b) => b.t)}));
            await snap(page, `${label}-find-error-dialog`, {errorDialog: out.errorDialog});
            const ok = topWin(page).getByRole('button', {name: /^OK$/}).first();
            if (await ok.count()) { await ok.click(); await page.waitForTimeout(400); await idle(page); }
        }
        const ws = await wizInfo(page);
        out.results = ws.templates; out.moreButton = ws.buttons.filter((b) => /\d+ more/i.test(b.text)).map((b) => b.text);
        out.resultsHeading = (ws.text.match(/Search Results[^\n]*/) || [null])[0];
        out.templatesPanelText = await page.locator('.composer__templates').innerText().then((t) => flat(t, 900)).catch(() => null);
        out.notifications = ws.notifications.map((n) => n.text);
        await snap(page, `${label}-find-results`, {out});
        const more = page.locator('main').getByRole('button', {name: /\d+ more/}).first();
        if (await more.count()) { await more.click(); await page.waitForTimeout(500); out.afterMore = (await wizInfo(page)).templates.map((t) => t.name); }
        const target = page.locator('.composer__template').filter({hasText: pick}).first();
        out.targetListed = await target.count();
        if (out.targetListed) {
            const t0 = Date.now();
            await target.locator('.composer__template__name, button').first().click();
            out.maskSeen = await page.locator('.composer__loadingTemplateMask').waitFor({state: 'visible', timeout: 3000}).then(() => true).catch(() => false);
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
            out.loadMs = Date.now() - t0;
            await idle(page); await page.waitForTimeout(300);
            const wl = await wizInfo(page);
            out.loaded = {subjectBefore, subjectAfter: wl.subject, firstLine: firstLine((wl.editors || [])[0]?.content), typedWordSurvived: /K2 typed word/.test(await editorText(page, id)), dialogs: (await dialogTexts(page)).map((d) => d.name)};
            await snap(page, `${label}-find-loaded`, {out});
        }
        // clear the search so the default list is back for the next read
        const clear = page.locator('.composer__templates__search button:visible').first();
        if (await clear.count()) { out.clearButton = await clear.getAttribute('aria-label').catch(() => null) || flat(await clear.innerText().catch(() => ''), 40); await clear.click({timeout: 5000}).catch(() => {}); }
        else { await find.fill(''); await find.press('Enter'); }
        await page.waitForTimeout(400); out.afterClear = (await wizInfo(page)).templates.map((t) => t.name);
        record(`${label}-find`, out);
        log(`[${label} find]`, JSON.stringify({results: (out.results || []).map((r) => r.name), mask: out.maskSeen, ms: out.loadMs, loaded: out.loaded}).slice(0, 600));
        return out;
    }
    // A listed template pressed: the pause and the replacement (the letter first edited with a word).
    async function loadListedTemplate(page, label, nth = 0) {
        const id = await editorId(page);
        const before = await wizInfo(page);
        await typeIntoEditor(page, id, '<p>K2 listed word</p>');
        const t = page.locator('.composer__template:visible').nth(nth);
        const out = {count: await page.locator('.composer__template:visible').count(), pressed: flat(await t.innerText().catch(() => null), 200)};
        if (!out.count) { record(`${label}-listed-load`, out); return out; }
        const t0 = Date.now();
        await t.locator('.composer__template__name, button').first().click();
        out.maskSeen = await page.locator('.composer__loadingTemplateMask').waitFor({state: 'visible', timeout: 3000}).then(() => true).catch(() => false);
        const maskAt = Date.now();
        await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
        out.maskMs = Date.now() - maskAt; out.totalMs = Date.now() - t0;
        await idle(page); await page.waitForTimeout(300);
        const after = await wizInfo(page);
        out.subjectBefore = before.subject; out.subjectAfter = after.subject;
        out.typedWordSurvived = /K2 listed word/.test(await editorText(page, id));
        out.dialogs = (await dialogTexts(page)).map((d) => d.name);
        out.firstLine = firstLine((after.editors || [])[0]?.content);
        record(`${label}-listed-load`, out);
        log(`[${label} listed load]`, JSON.stringify(out).slice(0, 400));
        return out;
    }
    // Rule 3: skip the current page; read what follows; go back; un-skip.
    async function skipProbe(page, label, {twoPages = true} = {}) {
        const id = await editorId(page);
        const before = await wizInfo(page);
        if (id) await typeIntoEditor(page, id, '<p>K2 skip word</p>');
        const skip = page.getByRole('button', {name: /^Skip this email$/}).first();
        const out = {skipPresent: await skip.count(), skipInFooter: before.buttons.find((b) => /Skip this email/.test(b.text))?.inFooter ?? null, subjectBefore: before.subject};
        if (!out.skipPresent) { record(`${label}-skip`, out); return out; }
        await loc(page, `${label}: "Skip this email"`, skip);
        await skip.click(); await idle(page); await page.waitForTimeout(500);
        const w1 = await wizInfo(page);
        out.afterSkip = {h1: w1.h1, rail: (w1.rail || []).map((r) => `${r.text}${r.current ? '*' : ''}${r.completed ? '(done)' : ''}`), skipBtn: w1.skip, skipPanel: w1.skipPanel, hasComposer: w1.hasComposer, notifications: w1.notifications.map((n) => n.text), text: flat(w1.text, 600)};
        await snap(page, `${label}-skipped`, {afterSkip: out.afterSkip});
        if (twoPages) {
            const prev = page.getByRole('button', {name: 'Previous', exact: true}).first();
            if (await prev.count()) { await prev.click(); await idle(page); await page.waitForTimeout(400); }
        }
        const w2 = await wizInfo(page);
        out.skippedPage = {h1: w2.h1, rail: (w2.rail || []).map((r) => `${r.text}${r.current ? '*' : ''}`), skipBtn: w2.skip, skipPanel: w2.skipPanel, hasComposer: w2.hasComposer, text: flat(w2.text, 600)};
        await snap(page, `${label}-skipped-page`, {skippedPage: out.skippedPage});
        const unskip = page.getByRole('button', {name: /^Don't skip this email$/}).first();
        out.unskipPresent = await unskip.count();
        if (out.unskipPresent) {
            await loc(page, `${label}: "Don't skip this email"`, unskip);
            await unskip.click(); await idle(page); await page.waitForTimeout(500);
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
            const w3 = await wizInfo(page);
            const id3 = await editorId(page);
            out.afterUnskip = {h1: w3.h1, subject: w3.subject, sameSubject: w3.subject === before.subject, typedWordKept: id3 ? /K2 skip word/.test(await editorText(page, id3)) : null, firstLine: firstLine((w3.editors || [])[0]?.content), skipBtn: w3.skip, chips: (w3.chips || []).map((c) => c.text)};
            await snap(page, `${label}-unskipped`, {afterUnskip: out.afterUnskip});
        }
        record(`${label}-skip`, out);
        log(`[${label} skip]`, JSON.stringify(out).slice(0, 700));
        return out;
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
        record(`${label}-recommendOnly-after`, {lists: (await wfInfo(page)).lists});
        return true;
    }
    // Contributors page: "Add Contributor" without an account.
    async function addContributor(page, id, given, family, email, label) {
        await page.goto(workflow(id, `publication_${id}_contributors`)); await idle(page);
        await page.getByRole('dialog').first().waitFor({timeout: 30000});
        await idle(page);
        const wf = page.locator('[role="dialog"]:visible').first();
        // a manager's landing rewrites the key to the workflow: open the side menu's "Contributors" entry
        // (the key carries the PUBLICATION id, not the submission's, so the typed address lands on the workflow)
        const menuBtn = page.getByText('Contributors', {exact: true}).first();
        if (await menuBtn.count()) { await menuBtn.click(); await idle(page); await page.waitForTimeout(500); }
        const addBtn = wf.getByRole('button', {name: 'Add Contributor', exact: true});
        await addBtn.waitFor({timeout: 30000});
        await addBtn.click();
        const addDlg = page.getByRole('dialog', {name: 'Add Contributor'});
        await addDlg.waitFor({timeout: 30000});
        await idle(page);
        await addDlg.locator('input[name^="givenName-"]').first().fill(given);
        await addDlg.locator('input[name^="familyName-"]').first().fill(family);
        await addDlg.locator('input[name="email"]').fill(email);
        const country = addDlg.locator('select[name="country"]');
        if (await country.count()) await country.selectOption({index: 1});
        const authorRole = addDlg.getByRole('checkbox', {name: 'Author', exact: true});
        if (await authorRole.count()) { if (await authorRole.isChecked()) await authorRole.uncheck(); await authorRole.check(); }
        await addDlg.getByRole('button', {name: 'Save', exact: true}).click();
        await idle(page);
        await addDlg.waitFor({state: 'hidden', timeout: 30000}).catch(() => {});
        await idle(page);
        const info = await wfInfo(page);
        await snap(page, `${label}-contributors-after`, {tables: info.tables, lists: info.lists});
        log(`[${label}] contributors:`, JSON.stringify(info.tables.map((t) => t.rows)).slice(0, 300));
    }
    // Users & Roles: the row of <username> → menu → item (Disable User: reason + OK; Login As: confirm).
    async function usersRowMenu(page, username, item, label, cp) {
        await page.goto(ctxUrl('/management/settings/access', cp)); await idle(page);
        const table = page.getByRole('table', {name: /Current Users/});
        await table.waitFor({timeout: 30000});
        await idle(page);
        let row = table.getByRole('row').filter({hasText: mailOf(username)});
        if (!(await row.count())) {
            const search = page.locator('main').getByRole('searchbox').first();
            if (await search.count()) { await search.fill(username); await search.press('Enter'); await idle(page); await page.waitForTimeout(800); }
            row = table.getByRole('row').filter({hasText: mailOf(username)});
        }
        const out = {username, item, rowFound: await row.count()};
        if (!out.rowFound) { record(`${label}-users-row`, out); return out; }
        await row.first().getByRole('button', {name: /options/i}).click();
        await page.getByRole('menuitem').first().waitFor({timeout: 10000});
        out.menu = await menuItems(page);
        const it = page.getByRole('menuitem', {name: new RegExp(`^${item}`)}).first();
        out.itemFound = await it.count();
        if (!out.itemFound) { await page.keyboard.press('Escape'); record(`${label}-users-row`, out); return out; }
        await it.click(); await idle(page); await page.waitForTimeout(600);
        const d = (await dialogTexts(page)).slice(-1)[0];
        out.dialog = d && {name: d.name, text: flat(d.text, 500), buttons: d.buttons.map((b) => b.t)};
        await snap(page, `${label}-users-${item.toLowerCase().replace(/\s+/g, '-')}-dialog`, {out});
        if (d) {
            const dlg = topWin(page);
            const ta = dlg.locator('textarea').first();
            if (await ta.count()) await ta.fill(`K2: ${item} for the claim check`);
            const ok = dlg.getByRole('button', {name: /^(OK|Save|Disable|Confirm|Yes|Login As)/}).first();
            if (await ok.count()) { await ok.click(); await idle(page); await page.waitForTimeout(1000); await idle(page); }
        }
        out.landed = page.url();
        record(`${label}-users-row`, out);
        log(`[${label}] users row "${item}" →`, out.landed, '|', flat(out.dialog && out.dialog.text, 120));
        return out;
    }
    // Settings › Workflow › Emails: the "Notify All Authors" radios, optionally set to a value ('true' | 'false').
    async function notifyAllAuthorsSetting(page, label, setTo, cp) {
        await page.goto(ctxUrl('/management/settings/workflow', cp)); await idle(page);
        const tab = page.locator('#emails-button').or(page.getByRole('tab', {name: 'Emails', exact: true})).first();
        await tab.waitFor({timeout: 30000}); await tab.click(); await idle(page);
        const radios = page.locator('input[name="notifyAllAuthors"]');
        await radios.first().waitFor({timeout: 30000});
        const read = () => radios.evaluateAll((els) => els.map((e) => ({value: e.value, checked: e.checked, label: (document.querySelector(`label[for="${e.id}"]`) || e.closest('label') || {}).innerText?.trim()})));
        const out = {before: await read()};
        out.block = await radios.first().evaluate((e) => { const f = e.closest('.pkpFormField, fieldset'); return f ? f.innerText.trim().replace(/\s+/g, ' ').slice(0, 500) : null; });
        out.groupHeading = await radios.first().evaluate((e) => { let n = e.closest('.pkpFormField, fieldset'); while (n && !n.querySelector('h2, h3, legend')) n = n.parentElement; const h = n && n.querySelector('h2, h3, legend'); return h ? h.innerText.trim() : null; });
        await loc(page, `${label}: "Notify All Authors" radios`, radios);
        await snap(page, `${label}-settings-emails`, {out});
        if (setTo) {
            const target = page.locator(`input[name="notifyAllAuthors"][value="${setTo}"], input[name="notifyAllAuthors"][value="${setTo === 'true' ? '1' : '0'}"]`).first();
            await target.check();
            const panel = page.getByRole('tabpanel', {name: 'Emails', exact: true});
            await panel.getByRole('button', {name: 'Save', exact: true}).first().click();
            await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 15000}).catch(() => {});
            await idle(page);
            out.after = await read();
            await snap(page, `${label}-settings-emails-saved`, {after: out.after});
        }
        record(`${label}-notify-all-authors`, out);
        log(`[${label}] notifyAllAuthors:`, JSON.stringify(out.before), setTo ? `→ ${JSON.stringify(out.after)}` : '');
        return out;
    }
    // Manage Emails: the mailable <name>: its window, its default template edited (subject prefix) and an alternative added.
    async function manageEmailsEdit(page, name, label, {subjectPrefix, addAlternative} = {}) {
        await page.goto(ctxUrl('/management/settings/manageEmails')); await idle(page);
        const main = page.locator('main');
        await main.locator('.listPanel__item').first().waitFor({timeout: 30000}).catch(() => {});
        const search = main.getByRole('searchbox', {name: /Search by name or description/}).or(main.locator('input[type="search"]')).first();
        await search.fill(name); await search.press('Enter'); await idle(page);
        await page.waitForFunction((n) => [...document.querySelectorAll('.listPanel__item')].some((i) => i.innerText.includes(n)) || document.body.innerText.includes('No items'), name, {timeout: 10000}).catch(() => {});
        await idle(page);
        // the item whose first line IS the name (a substring filter picks "Reinstate Submission Declined…" for "Submission Declined")
        const idx = await main.locator('.listPanel__item').evaluateAll((els, n) => els.findIndex((e) => (e.innerText.split('\n').map((l) => l.trim()).filter(Boolean)[0] || '') === n), name);
        const item = main.locator('.listPanel__item').nth(Math.max(idx, 0));
        const out = {name, present: idx >= 0};
        if (!out.present) { record(`${label}-manage-emails`, out); return out; }
        out.listText = flat(await item.innerText(), 400);
        await item.getByRole('button', {name: /^Edit/}).first().click(); await idle(page);
        const dlg = topWin(page);
        await dlg.waitFor({timeout: 30000});
        await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.innerText.length > 40; }, null, {timeout: 20000}).catch(() => {});
        await idle(page); await page.waitForTimeout(400);
        const outer = (await dialogTexts(page)).slice(-1)[0];
        out.window = {name: outer && outer.name, text: flat(outer && outer.text, 900), buttons: outer && outer.buttons.map((b) => b.t)};
        await snap(page, `${label}-mailable-window`, {out});
        if (subjectPrefix) {
            const inner = dlg.getByRole('button', {name: /^Edit$/}).first();
            await inner.click(); await idle(page);
            await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('input[name^="subject"]'); }, null, {timeout: 20000}).catch(() => {});
            await idle(page);
            const subj = topWin(page).locator('input[name^="subject"]').first();
            const old = await subj.inputValue();
            out.defaultSubject = old;
            out.defaultName = await topWin(page).locator('input[name^="name"]').first().inputValue().catch(() => null);
            await subj.fill(`${subjectPrefix} ${old}`);
            await topWin(page).getByRole('button', {name: /^Save$/}).first().click(); await idle(page);
            await page.waitForTimeout(1000); await idle(page);
            out.edited = {subject: `${subjectPrefix} ${old}`, dialogs: (await dialogTexts(page)).map((x) => x.name)};
            await snap(page, `${label}-template-edited`, {out});
        }
        if (addAlternative) {
            const add = topWin(page).getByRole('button', {name: /^Add Template$/}).first();
            out.addTemplatePresent = await add.count();
            if (out.addTemplatePresent) {
                await add.click(); await idle(page);
                await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).pop(); return d && d.querySelector('input[name^="subject"]'); }, null, {timeout: 20000}).catch(() => {});
                await idle(page); await page.waitForTimeout(400);
                const w = topWin(page);
                const fields = await w.locator('input:visible, textarea:visible').evaluateAll((els) => els.map((e) => ({name: e.name || e.id, value: (e.value || '').slice(0, 100)})));
                out.addForm = {fields};
                await w.locator('input[name^="name"]').first().fill(addAlternative.name);
                await w.locator('input[name^="subject"]').first().fill(addAlternative.subject);
                await page.evaluate((b) => { const ed = window.tinymce && window.tinymce.activeEditor; if (ed) { ed.setContent(`<p>${b}</p>`); ed.fire('change'); ed.fire('input'); ed.save(); } }, addAlternative.body).catch(() => {});
                await w.getByRole('button', {name: /^Save$/}).first().click(); await idle(page);
                await page.waitForTimeout(1000); await idle(page);
                const after = (await dialogTexts(page)).slice(-1)[0];
                out.afterAdd = {name: after && after.name, text: flat(after && after.text, 900)};
                await snap(page, `${label}-alternative-added`, {out});
            }
        }
        await closeAll(page);
        record(`${label}-manage-emails`, out);
        log(`[${label} manage emails]`, JSON.stringify(out).slice(0, 500));
        return out;
    }
    // Website › Setup › Languages: tick "Forms" for fr_CA; read the grid before and after.
    async function tickFormsFrench(page, label, cp) {
        await page.goto(ctxUrl('/management/settings/website', cp)); await idle(page);
        const setupTab = page.locator('#setup-button');
        if ((await setupTab.getAttribute('aria-selected').catch(() => null)) !== 'true') await setupTab.click();
        await page.getByRole('tab', {name: 'Languages', exact: true}).click(); await idle(page);
        await page.locator('#languageGridContainer .pkp_controllers_grid').waitFor({timeout: 20000});
        const gridRows = () => page.locator('#languageGridContainer').evaluate((c) => ({columns: [...c.querySelectorAll('thead th')].map((t) => t.innerText.trim()), rows: [...c.querySelectorAll('tbody tr.gridRow')].map((r) => ({text: r.innerText.trim().replace(/\s+/g, ' '), boxes: [...r.querySelectorAll('input[type=checkbox]')].map((b) => ({id: b.id, checked: b.checked, disabled: b.disabled}))}))}));
        const out = {before: await gridRows()};
        await snap(page, `${label}-languages-before`, {grid: out.before});
        const formsBox = page.locator('#languageGridContainer input[type=checkbox][id*="fr_CA-formLocale"]').first();
        out.formsBoxCount = await formsBox.count();
        if (out.formsBoxCount && !(await formsBox.isChecked())) {
            const w = page.waitForResponse((r) => r.request().method() === 'POST' && /save-language-setting/.test(r.url()), {timeout: 10000}).catch(() => null);
            await formsBox.click();
            const resp = await w;
            out.post = resp ? resp.status() : null;
            await idle(page);
            await page.waitForFunction(() => { const b = [...document.querySelectorAll('#languageGridContainer input[id*="fr_CA-formLocale"]')].pop(); return b && b.checked; }, null, {timeout: 10000}).catch(() => {});
        }
        out.after = await gridRows();
        await snap(page, `${label}-languages-after`, {grid: out.after});
        record(`${label}-languages`, out);
        return out;
    }
    // Rule 8: the "Switch to" line, the dialog, the confirmed switch.
    async function switchLocaleProbe(page, label) {
        const w = await wizInfo(page);
        const out = {switchTo: w.switchTo, subjectBefore: w.subject, chipsBefore: (w.chips || []).map((c) => c.text), firstLineBefore: firstLine((w.editors || [])[0]?.content), templates: w.templates};
        const btn = page.locator('.composer__locales button').first();
        out.linkCount = await btn.count();
        if (!out.linkCount) { record(`${label}-switch`, out); return out; }
        await loc(page, `${label}: the "Switch to" link`, btn);
        out.linkText = flat(await btn.innerText(), 60);
        await btn.click(); await page.waitForTimeout(500); await idle(page);
        const d = (await dialogTexts(page)).slice(-1)[0];
        out.dialog = d && {name: d.name, text: flat(d.text, 500), buttons: d.buttons.map((b) => `${b.t}${/primary/.test(b.cls) ? '*' : ''}`)};
        await snap(page, `${label}-switch-dialog`, {out});
        const cancel = topWin(page).getByRole('button', {name: /^Cancel$/}).first();
        if (await cancel.count()) { await cancel.click(); await page.waitForTimeout(400); await idle(page); out.afterCancel = {subject: (await wizInfo(page)).subject, dialogs: (await dialogTexts(page)).length}; }
        await btn.click(); await page.waitForTimeout(500); await idle(page);
        const confirm = topWin(page).getByRole('button', {name: /^Switch to/}).first();
        out.confirmCount = await confirm.count();
        if (out.confirmCount) {
            await confirm.click(); await idle(page);
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 15000}).catch(() => {});
            await page.waitForTimeout(500); await idle(page);
            const w2 = await wizInfo(page);
            out.after = {switchTo: w2.switchTo, subject: w2.subject, chips: (w2.chips || []).map((c) => c.text), firstLine: firstLine((w2.editors || [])[0]?.content), templates: w2.templates, templatesHeading: w2.templatesHeading, labels: (w2.inputs || []).map((i) => i.label).filter(Boolean).slice(0, 8), text: flat(w2.text, 800)};
            await snap(page, `${label}-switched`, {out});
        }
        record(`${label}-switch`, out);
        log(`[${label} switch]`, JSON.stringify(out).slice(0, 800));
        return out;
    }
    // The author's view: the Tasks panel, the workflow page (the stage's text) and the "Notifications" list with its first row opened.
    async function authorView(page, user, id, key, label, cp) {
        await signInAs(page, user, cp);
        await page.goto(ctxUrl('/dashboard/mySubmissions', cp)); await idle(page);
        const tasks = await tasksPanel(page, `${label}-tasks`);
        await page.goto(authorWorkflow(id, key, cp)); await idle(page);
        await page.locator('[role="dialog"]:visible').first().waitFor({timeout: 30000}).catch(() => {});
        await page.waitForFunction(() => !document.body.innerText.includes('Loading'), null, {timeout: 15000}).catch(() => {});
        await idle(page); await page.waitForTimeout(500);
        const info = await wfInfo(page);
        const out = {tasks: tasks && tasks.rows, headings: info.headings, notices: info.notices, notice: info.notice, status: info.status, lists: info.lists, tables: info.tables, text: flat(info.text, 1500), url: page.url()};
        const hasNotifications = info.headings.some((h) => /^Notifications$/i.test(h));
        out.notificationsHeading = hasNotifications;
        await snap(page, `${label}-workflow`, {out});
        if (hasNotifications) {
            const dlg = page.locator('[role="dialog"]:visible').first();
            const h = dlg.getByRole('heading', {name: 'Notifications', exact: true}).first();
            const section = h.locator('xpath=ancestor::*[self::div or self::section][1]');
            out.notificationRows = await section.locator('li, tr, button, a').evaluateAll((els) => els.map((e) => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 200)).filter(Boolean).slice(0, 10)).catch(() => []);
            const firstRow = section.locator('button, a').first();
            if (await firstRow.count()) {
                await firstRow.click(); await idle(page); await page.waitForTimeout(800);
                const d = (await dialogTexts(page)).slice(-1)[0];
                out.letter = d && {name: d.name, text: flat(d.text, 1200), inputs: d.inputs.length, buttons: d.buttons.map((b) => b.t)};
                await snap(page, `${label}-notification-letter`, {letter: out.letter});
                await closeTop(page);
            }
        }
        record(`${label}-author-view`, out);
        log(`[${label} author]`, 'tasks:', JSON.stringify(out.tasks).slice(0, 200), '| notifications heading:', hasNotifications, '| rows:', JSON.stringify(out.notificationRows));
        return out;
    }
    const decisionMailFor = async (email, title, label) => mailFor(email, label, {contains: title});

    // ====================================================================== OPS
    if (isOPS) {
        if (on('seed') && !sc.contextPath) {
            const t = tag('u34k2');
            const roleUsers = [['mgr', 'manager', 'Mira', 'Manager'], ['mod', 'sectionEditor', 'Mo', 'Moderator'], ['au', 'author', 'Ava', 'Author'], ['au2', 'author', 'Dan', 'Disabledauthor'], ['au3', 'author', 'Bea', 'Coauthor']];
            const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
            const ctx = await app.api.createContext({tag: t, context: {name: `U34 K2 ${t}`, acronym: 'U34K2', contactName: 'K2 Contact', contactEmail: `${t}contact@mail.test`}, users});
            sc.tag = t; sc.contextPath = ctx.path || t;
            sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
            sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`]));
            const u = sc.users;
            const seeds = {
                p1: {title: `K2 P1 decline and revert ${t}`, participants: [{username: u.mod, role: 'sectionEditor'}, {username: u.au3, role: 'author'}]},
                p2: {title: `K2 P2 contributor default ${t}`, participants: [{username: u.mod, role: 'sectionEditor'}]},
                p3: {title: `K2 P3 contributor assigned-only ${t}`, participants: [{username: u.mod, role: 'sectionEditor'}]},
                p4: {title: `K2 P4 disabled author ${t}`, submitter: u.au2, participants: [{username: u.mod, role: 'sectionEditor'}]},
                p5: {title: `K2 P5 template edit ${t}`, participants: [{username: u.mod, role: 'sectionEditor'}]},
            };
            sc.subs = {};
            for (const [k, spec] of Object.entries(seeds)) {
                try { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec}); sc.subs[k] = {id: r.submissionId, title: spec.title, stageId: r.stageId, raw: r}; log(`[seed ${k}]`, r.submissionId); }
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
                await pressDecision(page, 'Decline Submission', 'ops-p1-mod-decline');
                const w = await readWizardPage(page, 'ops-p1-mod-decline-na');
                record('ops-p1-mod-decline-na-fields', {templatesHeading: w.templatesHeading, templates: w.templates, subject: w.subject, chips: w.chips, recipientsDisabled: w.recipientsDisabled, recipientsText: w.recipientsText, removeBtns: w.removeBtns, firstLine: firstLine((w.editors || [])[0]?.content), editor: (w.editors || [])[0]?.content, toolbar: w.toolbar, skip: w.skip, switchTo: w.switchTo, footer: w.buttons.filter((b) => b.inFooter).map((b) => b.text), headings: w.headings});
                await insertContentProbe(page, 'ops-p1-mod-decline', 'name');
                await findTemplateProbe(page, 'ops-p1-mod-decline', {phrase: 'copyedit', pick: /Request Copyedit|Copyedit/});
                await cancelWizard(page, 'ops-p1-mod-decline-read');
                // record with an attachment, the letter untouched
                await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'ops-p1-mod-workflow-2');
                await pressDecision(page, 'Decline Submission', 'ops-p1-mod-decline2');
                const w2 = await readWizardPage(page, 'ops-p1-mod-decline2-na');
                sc.p1Subject = w2.subject;
                await loadListedTemplate(page, 'ops-p1-mod-decline2', 0);
                await attachFile(page, 'ops-p1-mod-decline2');
                await recordWizard(page, 'ops-p1-mod-decline2');
                await decisionMailFor(mailOf(u.au), S.p1.title, 'ops-p1-au-mail');
                await decisionMailFor(mailOf(u.au3), S.p1.title, 'ops-p1-au3-mail');
                await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'ops-p1-mod-after-decline');
                await activityLog(page, 'ops-p1-activity-log-after-decline');
                // Revert Decline under "Login As" (admin acting as mod)
                await signIn(page, 'admin', {contextPath: sc.contextPath}); await idle(page);
                const la = await usersRowMenu(page, u.mod, 'Login As', 'ops-p1-admin');
                record('ops-p1-loginas', la);
                await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'ops-p1-loginas-workflow');
                await pressDecision(page, 'Revert Decline', 'ops-p1-loginas-revert');
                const w3 = await readWizardPage(page, 'ops-p1-loginas-revert-na');
                record('ops-p1-loginas-revert-na-fields', {templates: w3.templates, subject: w3.subject, chips: w3.chips, firstLine: firstLine((w3.editors || [])[0]?.content), header: flat(w3.text, 300)});
                await recordWizard(page, 'ops-p1-loginas-revert');
                await openWorkflow(page, workflow(S.p1.id, 'workflow_5'), 'ops-p1-loginas-after-revert');
                await activityLog(page, 'ops-p1-activity-log-after-revert');
                await mailFor(mailOf(u.au), 'ops-p1-au-revert-mail', {subject: 'reversed'});
                save();
            });
            if (on('ops')) await sect('ops-author-view-a5', async () => {
                await authorView(page, u.au, S.p1.id, 'workflow_5', 'ops-p1-au');
            });
            if (on('ops')) await sect('ops-notify-all', async () => {
                await signInAs(page, u.mgr);
                await notifyAllAuthorsSetting(page, 'ops-mgr-default');
                await addContributor(page, S.p2.id, 'Cora', 'Coauthor', `${sc.tag}cora@mail.test`, 'ops-p2');
                await openWorkflow(page, workflow(S.p2.id, 'workflow_5'), 'ops-p2-mgr-workflow');
                await pressDecision(page, 'Decline Submission', 'ops-p2-mgr-decline');
                await readWizardPage(page, 'ops-p2-mgr-decline-na');
                await recordWizard(page, 'ops-p2-mgr-decline');
                await decisionMailFor(mailOf(u.au), S.p2.title, 'ops-p2-au-mail');
                await decisionMailFor(`${sc.tag}cora@mail.test`, S.p2.title, 'ops-p2-cora-mail');
                await notifyAllAuthorsSetting(page, 'ops-mgr-flip', 'false');
                await addContributor(page, S.p3.id, 'Cora', 'Coauthor', `${sc.tag}cora3@mail.test`, 'ops-p3');
                await openWorkflow(page, workflow(S.p3.id, 'workflow_5'), 'ops-p3-mgr-workflow');
                await pressDecision(page, 'Decline Submission', 'ops-p3-mgr-decline');
                await readWizardPage(page, 'ops-p3-mgr-decline-na');
                await recordWizard(page, 'ops-p3-mgr-decline');
                await decisionMailFor(mailOf(u.au), S.p3.title, 'ops-p3-au-mail');
                const coraCount = await app.mail.count({to: `${sc.tag}cora3@mail.test`, contains: S.p3.title});
                record('ops-p3-cora-count', {count: coraCount});
                log('[ops-p3] cora3 mails:', coraCount);
            });
            if (on('ops')) await sect('ops-disabled-author', async () => {
                await signInAs(page, u.mgr);
                await openWorkflow(page, workflow(S.p4.id, 'workflow_5'), 'ops-p4-mgr-workflow-before');
                await pressDecision(page, 'Decline Submission', 'ops-p4-mgr-decline-before');
                await walkWizard(page, 'ops-p4-mgr-decline-before');
                await cancelWizard(page, 'ops-p4-mgr-decline-before');
                await usersRowMenu(page, u.au2, 'Disable User', 'ops-p4-mgr');
                await openWorkflow(page, workflow(S.p4.id, 'workflow_5'), 'ops-p4-mgr-workflow-after');
                await pressDecision(page, 'Decline Submission', 'ops-p4-mgr-decline-after');
                await walkWizard(page, 'ops-p4-mgr-decline-after');
                await cancelWizard(page, 'ops-p4-mgr-decline-after');
            });
            if (on('ops')) await sect('ops-template-edit', async () => {
                await signInAs(page, u.mgr);
                await manageEmailsEdit(page, 'Submission Declined', 'ops-p5-mgr', {subjectPrefix: 'K2EDIT', addAlternative: {name: 'K2 Alternative Decline', subject: 'K2 alternative subject', body: 'K2 alternative body for {$recipientName}.'}});
                await openWorkflow(page, workflow(S.p5.id, 'workflow_5'), 'ops-p5-mgr-workflow');
                await pressDecision(page, 'Decline Submission', 'ops-p5-mgr-decline');
                const w = await readWizardPage(page, 'ops-p5-mgr-decline-na');
                record('ops-p5-mgr-decline-na-fields', {templates: w.templates, subject: w.subject, firstLine: firstLine((w.editors || [])[0]?.content)});
                const alt = page.locator('.composer__template').filter({hasText: 'K2 Alternative Decline'}).first();
                if (await alt.count()) { await alt.locator('.composer__template__name').click(); await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 15000}).catch(() => {}); await idle(page); await page.waitForTimeout(300); const w2 = await wizInfo(page); record('ops-p5-mgr-decline-alt-loaded', {subject: w2.subject, firstLine: firstLine((w2.editors || [])[0]?.content)}); }
                await recordWizard(page, 'ops-p5-mgr-decline');
                await mailFor(mailOf(u.au), 'ops-p5-au-mail', {subject: 'K2 alternative subject'});
                await openWorkflow(page, workflow(S.p5.id, 'workflow_5'), 'ops-p5-mgr-after');
                await activityLog(page, 'ops-p5-activity-log');
            });
            if (on('opstmpl')) await sect('ops-template-edit-2', async () => {
                if (!S.p6) { const r = await app.api.createSubmission({tag: `${sc.tag}p6`, context: sc.contextPath, submitter: u.au, title: `K2 P6 template edit ${sc.tag}`, participants: [{username: u.mod, role: 'sectionEditor'}]}); S.p6 = {id: r.submissionId, title: `K2 P6 template edit ${sc.tag}`, raw: r}; save(); }
                await signInAs(page, u.mgr);
                await manageEmailsEdit(page, 'Submission Declined', 'ops-p6-mgr', {subjectPrefix: 'K2EDIT', addAlternative: {name: 'K2 Alternative Decline', subject: 'K2 alternative subject', body: 'K2 alternative body for {$recipientName}.'}});
                await openWorkflow(page, workflow(S.p6.id, 'workflow_5'), 'ops-p6-mgr-workflow');
                await pressDecision(page, 'Decline Submission', 'ops-p6-mgr-decline');
                const w = await readWizardPage(page, 'ops-p6-mgr-decline-na');
                record('ops-p6-mgr-decline-na-fields', {templates: w.templates, subject: w.subject, firstLine: firstLine((w.editors || [])[0]?.content)});
                const alt = page.locator('.composer__template').filter({hasText: 'K2 Alternative Decline'}).first();
                if (await alt.count()) { await alt.locator('.composer__template__name').click(); await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 15000}).catch(() => {}); await idle(page); await page.waitForTimeout(300); const w2 = await wizInfo(page); record('ops-p6-mgr-decline-alt-loaded', {subject: w2.subject, firstLine: firstLine((w2.editors || [])[0]?.content)}); }
                await recordWizard(page, 'ops-p6-mgr-decline');
                await mailFor(mailOf(u.au), 'ops-p6-au-mail', {subject: 'K2 alternative subject'});
                await openWorkflow(page, workflow(S.p6.id, 'workflow_5'), 'ops-p6-mgr-after');
                await activityLog(page, 'ops-p6-activity-log');
            });
            if (on('locale')) await sect('ops-locale', async () => {
                if (!sc.F) {
                    const tb = tag('u34k2f');
                    const ctxB = await app.api.createContext({tag: tb, context: {name: `U34 K2 fr ${tb}`, acronym: 'U34K2F', supportedLocales: ['en', 'fr_CA'], contactName: 'K2 Contact', contactEmail: `${tb}contact@mail.test`}, users: [{username: `${tb}mgr`, roles: ['manager'], givenName: 'Fran', familyName: 'Manager'}, {username: `${tb}au`, roles: ['author'], givenName: 'Ana', familyName: 'Auteur'}]});
                    const r = await app.api.createSubmission({tag: `${tb}f1`, context: ctxB.path || tb, submitter: `${tb}au`, title: `K2 F1 two languages ${tb}`});
                    sc.F = {tag: tb, contextPath: ctxB.path || tb, mgr: `${tb}mgr`, au: `${tb}au`, f1: r.submissionId, title: `K2 F1 two languages ${tb}`};
                    save();
                }
                const F = sc.F;
                await signInAs(page, F.mgr, F.contextPath);
                await openWorkflow(page, workflow(F.f1, 'workflow_5', F.contextPath), 'ops-f1-mgr-workflow-before');
                await pressDecision(page, 'Decline Submission', 'ops-f1-mgr-decline-before');
                const w0 = await readWizardPage(page, 'ops-f1-mgr-decline-before-na');
                record('ops-f1-before-forms', {switchTo: w0.switchTo, text: flat(w0.text, 400)});
                await cancelWizard(page, 'ops-f1-mgr-decline-before');
                await tickFormsFrench(page, 'ops-f1-mgr', F.contextPath);
                await openWorkflow(page, workflow(F.f1, 'workflow_5', F.contextPath), 'ops-f1-mgr-workflow-after');
                await pressDecision(page, 'Decline Submission', 'ops-f1-mgr-decline-after');
                await readWizardPage(page, 'ops-f1-mgr-decline-after-na');
                await switchLocaleProbe(page, 'ops-f1-mgr-decline');
                await recordWizard(page, 'ops-f1-mgr-decline');
                await decisionMailFor(mailOf(F.au), F.title, 'ops-f1-au-mail');
            });
            note('ccK2 [ops] · Decision email page on a preprint server: driven Decline/Revert Decline (Production), Insert Content, Find Template, the contributor mails, Login As, the disabled author, the French switch: see .reports/U34/cc-K2.md.');
        } finally { await close(); }
        return;
    }

    // ====================================================================== OJS / OMP
    if (on('seed') && !sc.contextPath) {
        const t = tag('u34k2');
        const roleUsers = [['mgr', 'manager', 'Mira', 'Manager'], ['ed', 'editor', 'Edda', 'Editor'], ['se', 'sectionEditor', 'Sid', 'Section'], ['se2', 'sectionEditor', 'Rec', 'Recommender'],
            ['rv1', 'externalReviewer', 'Rita', 'Reviewerone'], ['rv2', 'externalReviewer', 'Ravi', 'Reviewertwo'], ['rv3', 'externalReviewer', 'Rob', 'Reviewerthree'], ['rvd', 'externalReviewer', 'Dee', 'Disabledrev'],
            ['au', 'author', 'Ava', 'Author'], ['au2', 'author', 'Dan', 'Disabledauthor'], ['au3', 'author', 'Bea', 'Coauthor']];
        const users = roleUsers.map(([k, role, g, f]) => ({username: `${t}${k}`, roles: [role], givenName: g, familyName: f}));
        const ctx = await app.api.createContext({tag: t, context: {name: `U34 K2 ${t}`, acronym: 'U34K2', contactName: 'K2 Contact', contactEmail: `${t}contact@mail.test`}, users});
        sc.tag = t; sc.contextPath = ctx.path || t;
        sc.users = Object.fromEntries(roleUsers.map(([k]) => [k, `${t}${k}`]));
        sc.names = Object.fromEntries(roleUsers.map(([k, , g, f]) => [k, `${g} ${f}`]));
        const u = sc.users;
        const se = {username: u.se, role: 'sectionEditor'};
        const completed = (k) => ({username: u[k], status: 'completed', comments: `Seeded comments of ${k} for the author for ${t}.`});
        const seeds = {
            s1: {title: `K2 S1 review chain ${t}`, participants: [se]},
            s2: {title: `K2 S2 decline with attachment ${t}`, participants: [se, {username: u.au3, role: 'author'}]},
            s3: {title: `K2 S3 skip and empty ${t}`, participants: [se]},
            s4: {title: `K2 S4 accept composer ${t}`, participants: [se], decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [completed('rv1'), completed('rv2')]}]},
            s5: {title: `K2 S5 request revisions ${t}`, participants: [se, {username: u.se2, role: 'sectionEditor'}], decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [completed('rv1'), completed('rv2')]}]},
            s6: {title: `K2 S6 resubmit ${t}`, participants: [se], decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [completed('rv1'), completed('rv2')]}]},
            s7: {title: `K2 S7 invited only ${t}`, participants: [se], decisions: ['sendExternalReview'], reviewRounds: [{reviewers: []}, {reviewers: [{username: u.rv3, status: 'invited'}]}]},
            s8: {title: `K2 S8 contributor default ${t}`, participants: [se]},
            s9: {title: `K2 S9 contributor assigned-only ${t}`, participants: [se]},
            s10: {title: `K2 S10 disabled reviewer ${t}`, participants: [se], decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [completed('rv1'), completed('rvd')]}]},
            s11: {title: `K2 S11 disabled author ${t}`, submitter: u.au2, participants: [se]},
            s12: {title: `K2 S12 template edit ${t}`, participants: [se]},
            ...(isOMP ? {m1: {title: `K2 M1 internal review ${t}`, participants: [se]}} : {}),
        };
        sc.subs = {};
        for (const [k, spec] of Object.entries(seeds)) {
            try { const r = await app.api.createSubmission({tag: `${t}${k}`, context: sc.contextPath, submitter: u.au, ...spec}); sc.subs[k] = {id: r.submissionId, title: spec.title, stageId: r.stageId, raw: r}; log(`[seed ${k}]`, r.submissionId, 'rounds', JSON.stringify(r.reviewRounds || [])); }
            catch (e) { log(`[seed ${k} FAILED]`, String(e.message).slice(0, 600)); sc.subs[k] = {error: String(e.message).slice(0, 600)}; }
        }
        save(); record('seed', sc);
    }
    const u = sc.users, S = sc.subs, N = sc.names;
    const sendForReview = isOMP ? 'Send to External Review' : 'Send for Review';
    const {page, close} = await launch(app);
    armDialogs(page);
    try {
        // ---- s4: Rules 3, 4, 5, 7 on "Accept Submission" (three pages), then Accept recorded untouched, STP, MTC, A5
        const CS = S[process.env.COMP_SUB || 's4'];   // the composer reads' submission (rv1 + rv2 completed, untouched)
        if (on('s4') || on('comp')) await sect('s4-composer', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(CS.id, roundKey(CS)), 's4-se-workflow');
            await pressDecision(page, 'Accept Submission', 's4-se-accept');
            const w = await readWizardPage(page, 's4-se-accept-na');
            record('s4-se-accept-na-fields', {templatesHeading: w.templatesHeading, templates: w.templates, subject: w.subject, chips: w.chips, recipientsDisabled: w.recipientsDisabled, recipientsText: w.recipientsText, removeBtns: w.removeBtns, firstLine: firstLine((w.editors || [])[0]?.content), editor: (w.editors || [])[0]?.content, toolbar: w.toolbar, skip: w.skip, skipInFooter: w.buttons.find((b) => /Skip this email/.test(b.text))?.inFooter, switchTo: w.switchTo, footer: w.buttons.filter((b) => b.inFooter).map((b) => b.text), headings: w.headings, inputs: w.inputs.map((i) => `${i.type}:${i.label}=${String(i.value).slice(0, 40)}`)});
            await insertContentProbe(page, 's4-se-accept-na', 'name');
            await skipProbe(page, 's4-se-accept-na', {twoPages: true});
            await findTemplateProbe(page, 's4-se-accept-na', {phrase: 'copyedit', pick: /Request Copyedit/});
            await loadListedTemplate(page, 's4-se-accept-na', 0);
            // Notify Reviewers: chips, the sentence, the letter's first line, an emptied "To"
            await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page);
            const wr = await readWizardPage(page, 's4-se-accept-nr');
            record('s4-se-accept-nr-fields', {templates: wr.templates, subject: wr.subject, chips: wr.chips, recipientsDisabled: wr.recipientsDisabled, recipientsText: wr.recipientsText, removeBtns: wr.removeBtns, firstLine: firstLine((wr.editors || [])[0]?.content), editor: (wr.editors || [])[0]?.content, headings: wr.headings, skip: wr.skip, footer: wr.buttons.filter((b) => b.inFooter).map((b) => b.text)});
            await insertContentProbe(page, 's4-se-accept-nr', 'decision');
            for (const r of wr.removeBtns || []) { const b = page.getByRole('button', {name: r, exact: true}).first(); if (await b.count()) { await loc(page, `s4 Notify Reviewers: "${r}"`, b); await b.click(); await page.waitForTimeout(300); } }
            const wr2 = await wizInfo(page);
            record('s4-se-accept-nr-emptied', {chips: wr2.chips, recipientsText: wr2.recipientsText, firstLine: firstLine((wr2.editors || [])[0]?.content), errors: wr2.errors});
            await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page);
            const wf = await readWizardPage(page, 's4-se-accept-files');
            const rec = page.getByRole('button', {name: 'Record Decision', exact: true}).first();
            if (await rec.count()) { await rec.click(); await idle(page); await page.waitForTimeout(1000); await idle(page); }
            const we = await wizInfo(page);
            record('s4-se-accept-nr-emptied-record', {h1: we.h1, rail: (we.rail || []).map((r) => `${r.text}${r.current ? '*' : ''}`), notifications: we.notifications, errors: we.errors, dialogs: (await dialogTexts(page)).map((d) => ({name: d.name, text: flat(d.text, 300)})), url: page.url(), text: flat(we.text, 800)});
            await snap(page, 's4-se-accept-nr-emptied-record');
            const viewError = page.getByRole('button', {name: /View Error/}).or(page.getByRole('link', {name: /View Error/})).first();
            if (await viewError.count()) { await viewError.click(); await idle(page); await page.waitForTimeout(400); const wv = await wizInfo(page); record('s4-se-accept-nr-emptied-view-error', {h1: wv.h1, errors: wv.errors, notifications: wv.notifications, chips: wv.chips}); await snap(page, 's4-se-accept-nr-emptied-view-error'); }
            void wf;
            await cancelWizard(page, 's4-se-accept-read');
            // the manager-level editor: the same "Find Template" search (the Section editor's answers 401)
            await signInAs(page, u.ed);
            await openWorkflow(page, workflow(CS.id, roundKey(CS)), 's4-ed-workflow');
            await pressDecision(page, 'Accept Submission', 's4-ed-accept');
            await readWizardPage(page, 's4-ed-accept-na');
            await findTemplateProbe(page, 's4-ed-accept-na', {phrase: 'copyedit', pick: /Request Copyedit/});
            await findTemplateProbe(page, 's4-ed-accept-na-assign', {phrase: 'assign', pick: /Assign Editor/});
            await loadListedTemplate(page, 's4-ed-accept-na', 0);
            await cancelWizard(page, 's4-ed-accept-read');
        });
        if (on('s4')) await sect('s4-accept-record', async () => {
            await signInAs(page, u.se);
            const {info} = await openWorkflow(page, workflow(S.s4.id, roundKey(S.s4)), 's4-se-workflow-before-accept');
            record('s4-reviewers-before', {tables: info.tables.filter((t) => /Reviewer/i.test(t.name || '') || t.rows.some((r) => /Review/i.test(r)))});
            await pressDecision(page, 'Accept Submission', 's4-se-accept2');
            const w = await readWizardPage(page, 's4-se-accept2-na');
            sc.s4 = {naSubject: w.subject, naTemplates: w.templates};
            await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page);
            const wr = await readWizardPage(page, 's4-se-accept2-nr');
            sc.s4.nrSubject = wr.subject; sc.s4.nrFirstLine = firstLine((wr.editors || [])[0]?.content); sc.s4.nrSentence = (wr.headings || []).find((h) => h.tag === 'h2')?.next;
            await continueAndRecord(page, 's4-se-accept2');
            const m1 = await mailFor(mailOf(u.rv1), 's4-rv1-mail', {contains: S.s4.title});
            const m2 = await mailFor(mailOf(u.rv2), 's4-rv2-mail', {contains: S.s4.title});
            const ma = await decisionMailFor(mailOf(u.au), S.s4.title, 's4-au-mail');
            record('s4-a3-untouched', {rv1First: m1 && m1.firstLine, rv2First: m2 && m2.firstLine, rv1Subject: m1 && m1.subject, rv2Subject: m2 && m2.subject, rv1Text: m1 && m1.text, authorSubject: ma && ma.subject, authorFrom: ma && ma.from, authorTo: ma && ma.toList});
            const {info: after} = await openWorkflow(page, workflow(S.s4.id, roundKey(S.s4)), 's4-se-workflow-after-accept');
            record('s4-reviewers-after', {tables: after.tables.filter((t) => /Reviewer/i.test(t.name || '') || t.rows.some((r) => /Review/i.test(r)))});
            await activityLog(page, 's4-activity-log-after-accept');
            save();
        });
        if (on('s4')) await sect('s4-stp-mtc', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.s4.id, 'workflow_4'), 's4-se-copyediting');
            await pressDecision(page, 'Send To Production', 's4-se-stp');
            const w = await readWizardPage(page, 's4-se-stp-na');
            record('s4-se-stp-na-fields', {templates: w.templates, subject: w.subject, chips: w.chips, firstLine: firstLine((w.editors || [])[0]?.content)});
            await insertContentProbe(page, 's4-se-stp-na', 'signature');
            await continueAndRecord(page, 's4-se-stp');
            await openWorkflow(page, workflow(S.s4.id, 'workflow_5'), 's4-se-production');
            await activityLog(page, 's4-activity-log-after-stp');
            await pressDecision(page, 'Move To Copyediting', 's4-se-mtc');
            const w2 = await readWizardPage(page, 's4-se-mtc-na');
            record('s4-se-mtc-na-fields', {templates: w2.templates, subject: w2.subject, chips: w2.chips, firstLine: firstLine((w2.editors || [])[0]?.content), skip: w2.skip, footer: w2.buttons.filter((b) => b.inFooter).map((b) => b.text)});
            // Rule 3 on a one-page wizard: skip stays on the page
            await skipProbe(page, 's4-se-mtc-na', {twoPages: false});
            await recordWizard(page, 's4-se-mtc');
            await openWorkflow(page, workflow(S.s4.id, 'workflow_4'), 's4-se-copyediting-after-mtc');
            await activityLog(page, 's4-activity-log-after-mtc');
            await decisionMailFor(mailOf(u.au), S.s4.title, 's4-au-mail-latest');
        });
        if (on('s4')) await sect('s4-a5-author', async () => {
            await authorView(page, u.au, S.s4.id, 'workflow_4', 's4-au-after-accept');
        });
        // ---- s5: se2 recommend-only ("Notify Editors" chips), Request Revisions with a typed word (A3), the author's task and Notifications, then Accept skipped
        if (on('s5')) await sect('s5-notify-editors', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.s5.id, roundKey(S.s5)), 's5-mgr-workflow');
            sc.s5RecommendOnly = await setRecommendOnly(page, N.se2, 's5-mgr');
            await signInAs(page, u.se2);
            await openWorkflow(page, workflow(S.s5.id, roundKey(S.s5)), 's5-se2-workflow');
            await pressDecision(page, 'Recommend Accept', 's5-se2-recaccept');
            const w = await readWizardPage(page, 's5-se2-recaccept-ne');
            record('s5-se2-recaccept-ne-fields', {templates: w.templates, subject: w.subject, chips: w.chips, recipientsDisabled: w.recipientsDisabled, recipientsText: w.recipientsText, removeBtns: w.removeBtns, firstLine: firstLine((w.editors || [])[0]?.content), headings: w.headings, skip: w.skip, footer: w.buttons.filter((b) => b.inFooter).map((b) => b.text)});
            await insertContentProbe(page, 's5-se2-recaccept-ne', 'recommend');
            await cancelWizard(page, 's5-se2-recaccept');
            save();
        });
        if (on('s5')) await sect('s5-request-revisions', async () => {
            await signInAs(page, u.se);
            const {info} = await openWorkflow(page, workflow(S.s5.id, roundKey(S.s5)), 's5-se-workflow');
            record('s5-reviewers-before', {tables: info.tables.filter((t) => /Reviewer/i.test(t.name || '') || t.rows.some((r) => /Review/i.test(r)))});
            await pressDecision(page, 'Request Revisions', 's5-se-rr', {choice: 0});
            const w = await readWizardPage(page, 's5-se-rr-na');
            record('s5-se-rr-na-fields', {templates: w.templates, subject: w.subject, chips: w.chips, firstLine: firstLine((w.editors || [])[0]?.content)});
            await insertContentProbe(page, 's5-se-rr-na', 'comments');
            await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page);
            const wr = await readWizardPage(page, 's5-se-rr-nr');
            const id = await editorId(page);
            await typeIntoEditor(page, id, '<p>K2 one word.</p>');
            const wr2 = await wizInfo(page);
            record('s5-se-rr-nr-edited', {chips: wr.chips, subject: wr.subject, firstLineBefore: firstLine((wr.editors || [])[0]?.content), editorAfter: flat((wr2.editors || [])[0]?.content, 500)});
            await continueAndRecord(page, 's5-se-rr');
            const m1 = await mailFor(mailOf(u.rv1), 's5-rv1-mail', {contains: S.s5.title});
            const m2 = await mailFor(mailOf(u.rv2), 's5-rv2-mail', {contains: S.s5.title});
            const ma = await decisionMailFor(mailOf(u.au), S.s5.title, 's5-au-mail');
            record('s5-a3-edited', {rv1First: m1 && m1.firstLine, rv2First: m2 && m2.firstLine, rv1Text: m1 && m1.text, rv2Text: m2 && m2.text, rv1Subject: m1 && m1.subject, rv1From: m1 && m1.from, rv1To: m1 && m1.toList, authorSubject: ma && ma.subject});
            const {info: after} = await openWorkflow(page, workflow(S.s5.id, roundKey(S.s5)), 's5-se-workflow-after');
            record('s5-reviewers-after', {tables: after.tables.filter((t) => /Reviewer/i.test(t.name || '') || t.rows.some((r) => /Review/i.test(r)))});
            await activityLog(page, 's5-activity-log-after-rr');
        });
        if (on('s5')) await sect('s5-author-task', async () => {
            await authorView(page, u.au, S.s5.id, roundKey(S.s5), 's5-au-after-rr');
        });
        if (on('s5')) await sect('s5-accept-clears', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.s5.id, roundKey(S.s5)), 's5-se-workflow-2');
            await pressDecision(page, 'Accept Submission', 's5-se-accept');
            await readWizardPage(page, 's5-se-accept-na');
            // skip every email page, record
            for (let i = 0; i < 4; i++) { const sk = page.getByRole('button', {name: /^Skip this email$/}).first(); if (await sk.count()) { await sk.click(); await idle(page); await page.waitForTimeout(400); } else break; }
            await continueAndRecord(page, 's5-se-accept');
            await authorView(page, u.au, S.s5.id, 'workflow_4', 's5-au-after-accept');
        });
        // ---- s6: Resubmit for Review
        if (on('s6')) await sect('s6-resubmit', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.s6.id, roundKey(S.s6)), 's6-se-workflow');
            await pressDecision(page, 'Request Revisions', 's6-se-resubmit', {choice: 1});
            const w = await readWizardPage(page, 's6-se-resubmit-na');
            record('s6-se-resubmit-na-fields', {h1: w.h1, templates: w.templates, subject: w.subject, chips: w.chips, firstLine: firstLine((w.editors || [])[0]?.content)});
            await page.getByRole('button', {name: 'Continue', exact: true}).first().click(); await idle(page);
            const wr = await readWizardPage(page, 's6-se-resubmit-nr');
            record('s6-se-resubmit-nr-fields', {templates: wr.templates, subject: wr.subject, chips: wr.chips, firstLine: firstLine((wr.editors || [])[0]?.content), editor: (wr.editors || [])[0]?.content});
            await continueAndRecord(page, 's6-se-resubmit');
            const m1 = await mailFor(mailOf(u.rv1), 's6-rv1-mail', {contains: S.s6.title});
            record('s6-reviewer-sentence', {rv1Text: m1 && m1.text, subject: m1 && m1.subject});
            await decisionMailFor(mailOf(u.au), S.s6.title, 's6-au-mail');
            await openWorkflow(page, workflow(S.s6.id, roundKey(S.s6)), 's6-se-workflow-after');
            await activityLog(page, 's6-activity-log');
            await authorView(page, u.au, S.s6.id, roundKey(S.s6), 's6-au-after-resubmit');
        });
        // ---- s7: an invited reviewer only: Accept has no Notify Reviewers; Cancel Review Round lists the invited one
        if (on('s7')) await sect('s7-invited', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.s7.id, roundKey(S.s7, 1)), 's7-se-workflow');
            await pressDecision(page, 'Accept Submission', 's7-se-accept');
            await walkWizard(page, 's7-se-accept');
            await cancelWizard(page, 's7-se-accept');
            await openWorkflow(page, workflow(S.s7.id, roundKey(S.s7, 1)), 's7-se-workflow-2');
            await pressDecision(page, 'Cancel Review Round', 's7-se-cancelround');
            const pages = await walkWizard(page, 's7-se-cancelround');
            const nr = pages.find((p) => /Notify Reviewers/i.test(p.h1 || ''));
            record('s7-se-cancelround-nr', nr || {absent: true});
            await recordWizard(page, 's7-se-cancelround');
            await mailFor(mailOf(u.rv3), 's7-rv3-mail', {contains: S.s7.title});
            await decisionMailFor(mailOf(u.au), S.s7.title, 's7-au-mail');
            await openWorkflow(page, workflow(S.s7.id), 's7-se-workflow-after');
            await activityLog(page, 's7-activity-log');
        });
        // ---- s1: the review chain from the Submission stage
        if (on('s1')) await sect('s1-chain', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.s1.id, 'workflow_1'), 's1-se-submission');
            await pressDecision(page, sendForReview, 's1-se-sfr');
            const w = await readWizardPage(page, 's1-se-sfr-na');
            record('s1-se-sfr-na-fields', {templates: w.templates, subject: w.subject, chips: w.chips, firstLine: firstLine((w.editors || [])[0]?.content), headings: w.headings});
            await insertContentProbe(page, 's1-se-sfr-na', 'title');
            const r1 = await continueAndRecord(page, 's1-se-sfr');
            await decisionMailFor(mailOf(u.au), S.s1.title, 's1-au-mail-sfr');
            const landedKey = (m) => (m && m.landed && (m.landed.match(/workflowMenuKey=([^&]+)/) || [])[1]) || undefined;
            await openWorkflow(page, workflow(S.s1.id, landedKey(r1)), 's1-se-round1');
            await activityLog(page, 's1-activity-log-after-sfr');
            await pressDecision(page, 'Create New Review Round', 's1-se-newround');
            const w2 = await readWizardPage(page, 's1-se-newround-na');
            record('s1-se-newround-na-fields', {h1: w2.h1, templates: w2.templates, subject: w2.subject, chips: w2.chips, firstLine: firstLine((w2.editors || [])[0]?.content)});
            const r2 = await continueAndRecord(page, 's1-se-newround');
            await openWorkflow(page, workflow(S.s1.id, landedKey(r2)), 's1-se-round2');
            await activityLog(page, 's1-activity-log-after-newround');
            await pressDecision(page, 'Cancel Review Round', 's1-se-cancelround');
            const w3 = await readWizardPage(page, 's1-se-cancelround-na');
            record('s1-se-cancelround-na-fields', {templates: w3.templates, subject: w3.subject, chips: w3.chips, firstLine: firstLine((w3.editors || [])[0]?.content), rail: (w3.rail || []).map((r) => r.text)});
            const r3 = await continueAndRecord(page, 's1-se-cancelround');
            await openWorkflow(page, workflow(S.s1.id, landedKey(r3)), 's1-se-after-cancelround');
            await activityLog(page, 's1-activity-log-after-cancelround');
            await pressDecision(page, 'Decline Submission', 's1-se-decline');
            const w4 = await readWizardPage(page, 's1-se-decline-na');
            record('s1-se-decline-na-fields', {templates: w4.templates, subject: w4.subject, chips: w4.chips, firstLine: firstLine((w4.editors || [])[0]?.content), rail: (w4.rail || []).map((r) => r.text)});
            const r4 = await continueAndRecord(page, 's1-se-decline');
            await openWorkflow(page, workflow(S.s1.id, landedKey(r4)), 's1-se-after-decline');
            await activityLog(page, 's1-activity-log-after-decline');
            await pressDecision(page, 'Revert Decline', 's1-se-revert');
            const w5 = await readWizardPage(page, 's1-se-revert-na');
            record('s1-se-revert-na-fields', {templates: w5.templates, subject: w5.subject, chips: w5.chips, firstLine: firstLine((w5.editors || [])[0]?.content)});
            const r5 = await continueAndRecord(page, 's1-se-revert');
            await openWorkflow(page, workflow(S.s1.id, landedKey(r5)), 's1-se-after-revert');
            await activityLog(page, 's1-activity-log-after-revert');
            await decisionMailFor(mailOf(u.au), S.s1.title, 's1-au-mail-latest');
        });
        // ---- s2: Decline with an attachment (the author mail: From, subject, attachment, two assigned authors), then Login As → Revert Decline
        if (on('s2')) await sect('s2-decline-mail', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.s2.id, 'workflow_1'), 's2-se-submission');
            await pressDecision(page, 'Decline Submission', 's2-se-decline');
            const w = await readWizardPage(page, 's2-se-decline-na');
            record('s2-se-decline-na-fields', {templates: w.templates, subject: w.subject, chips: w.chips, recipientsDisabled: w.recipientsDisabled, removeBtns: w.removeBtns, firstLine: firstLine((w.editors || [])[0]?.content), editor: (w.editors || [])[0]?.content});
            await attachFile(page, 's2-se-decline');
            await recordWizard(page, 's2-se-decline');
            const ma = await decisionMailFor(mailOf(u.au), S.s2.title, 's2-au-mail');
            const mb = await decisionMailFor(mailOf(u.au3), S.s2.title, 's2-au3-mail');
            record('s2-author-mail', {au: ma && {from: ma.from, to: ma.toList, subject: ma.subject, attachments: ma.attachments, firstLine: ma.firstLine}, au3: mb && {from: mb.from, to: mb.toList, subject: mb.subject, attachments: mb.attachments, firstLine: mb.firstLine}, sameMessage: !!(ma && mb && ma.id === mb.id)});
            await openWorkflow(page, workflow(S.s2.id, 'workflow_1'), 's2-se-after-decline');
            await activityLog(page, 's2-activity-log-after-decline');
        });
        if (on('s2')) await sect('s2-loginas-revert', async () => {
            await signIn(page, 'admin', {contextPath: sc.contextPath}); await idle(page);
            const la = await usersRowMenu(page, u.se, 'Login As', 's2-admin');
            record('s2-loginas', la);
            await openWorkflow(page, workflow(S.s2.id, 'workflow_1'), 's2-loginas-workflow');
            await pressDecision(page, 'Revert Decline', 's2-loginas-revert');
            const w = await readWizardPage(page, 's2-loginas-revert-na');
            record('s2-loginas-revert-na-fields', {templates: w.templates, subject: w.subject, chips: w.chips, firstLine: firstLine((w.editors || [])[0]?.content), signature: flat((w.editors || [])[0]?.content, 900)});
            await recordWizard(page, 's2-loginas-revert');
            await openWorkflow(page, workflow(S.s2.id, 'workflow_1'), 's2-loginas-after-revert');
            await activityLog(page, 's2-activity-log-after-revert');
            const m = await mailFor(mailOf(u.au), 's2-au-revert-mail', {subject: 'reversed'});
            record('s2-revert-mail-from', {from: m && m.from, subject: m && m.subject});
            await authorView(page, u.au, S.s2.id, 'workflow_1', 's2-au-after-revert');
        });
        // ---- s3: Accept and Skip Review with the email skipped and its subject emptied; then Move to Review (the control)
        if (on('s3')) await sect('s3-skip-empty', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.s3.id, 'workflow_1'), 's3-se-submission');
            await pressDecision(page, 'Accept and Skip Review', 's3-se-skipreview');
            const w = await readWizardPage(page, 's3-se-skipreview-na');
            record('s3-se-skipreview-na-fields', {templates: w.templates, subject: w.subject, chips: w.chips, firstLine: firstLine((w.editors || [])[0]?.content)});
            const subj = page.getByLabel(/^Subject/).first();
            await subj.fill('');
            const id = await editorId(page);
            await page.evaluate((i) => { const e = window.tinymce.get(i); e.setContent(''); e.fire('change'); e.fire('input'); }, id);
            const wEmpty = await wizInfo(page);
            record('s3-se-skipreview-na-emptied', {subject: wEmpty.subject, editor: (wEmpty.editors || [])[0]?.content, errors: wEmpty.errors});
            const skip = page.getByRole('button', {name: /^Skip this email$/}).first();
            await skip.click(); await idle(page); await page.waitForTimeout(500);
            const ws = await wizInfo(page);
            record('s3-se-skipreview-skipped', {h1: ws.h1, rail: (ws.rail || []).map((r) => `${r.text}${r.current ? '*' : ''}`), panels: ws.panels, errors: ws.errors, notifications: ws.notifications.map((n) => n.text)});
            await snap(page, 's3-se-skipreview-skipped');
            const before = await app.mail.count({to: mailOf(u.au), contains: S.s3.title});
            await continueAndRecord(page, 's3-se-skipreview');
            await openWorkflow(page, workflow(S.s3.id, 'workflow_4'), 's3-se-copyediting');
            await activityLog(page, 's3-activity-log-after-skipreview');
            await pressDecision(page, 'Move to Review', 's3-se-mtr');
            const w2 = await readWizardPage(page, 's3-se-mtr-na');
            record('s3-se-mtr-na-fields', {templates: w2.templates, subject: w2.subject, chips: w2.chips, firstLine: firstLine((w2.editors || [])[0]?.content)});
            await recordWizard(page, 's3-se-mtr');
            const control = await decisionMailFor(mailOf(u.au), S.s3.title, 's3-au-mail-mtr');
            const after = await app.mail.count({to: mailOf(u.au), contains: S.s3.title});
            const copyediting = await app.mail.count({to: mailOf(u.au), subject: 'copyediting'});
            record('s3-skipped-sends-nothing', {before, after, controlSubject: control && control.subject, copyeditingSubjectCount: copyediting});
            log('[s3 mails]', before, '→', after, '| copyediting subject:', copyediting);
            await openWorkflow(page, workflow(S.s3.id), 's3-se-after-mtr');
            await activityLog(page, 's3-activity-log-after-mtr');
        });
        // ---- s8/s9: Notify All Authors at both ends
        if (on('s8')) await sect('s8-notify-all-default', async () => {
            await signInAs(page, u.mgr);
            await notifyAllAuthorsSetting(page, 's8-mgr-default', 'true');
            await addContributor(page, S.s8.id, 'Cora', 'Coauthor', `${sc.tag}cora@mail.test`, 's8-mgr');
            await openWorkflow(page, workflow(S.s8.id, 'workflow_1'), 's8-mgr-submission');
            await pressDecision(page, 'Decline Submission', 's8-mgr-decline');
            const w = await readWizardPage(page, 's8-mgr-decline-na');
            record('s8-mgr-decline-na-fields', {chips: w.chips, subject: w.subject});
            await recordWizard(page, 's8-mgr-decline');
            const ma = await decisionMailFor(mailOf(u.au), S.s8.title, 's8-au-mail');
            const mc = await decisionMailFor(`${sc.tag}cora@mail.test`, S.s8.title, 's8-cora-mail');
            record('s8-both-mails', {author: ma && {subject: ma.subject, from: ma.from, firstLine: ma.firstLine}, cora: mc && {subject: mc.subject, from: mc.from, to: mc.toList, firstLine: mc.firstLine, text: mc.text}});
        });
        if (on('s9')) await sect('s9-notify-assigned-only', async () => {
            await signInAs(page, u.mgr);
            await notifyAllAuthorsSetting(page, 's9-mgr-flip', 'false');
            await addContributor(page, S.s9.id, 'Cora', 'Coauthor', `${sc.tag}cora9@mail.test`, 's9-mgr');
            await openWorkflow(page, workflow(S.s9.id, 'workflow_1'), 's9-mgr-submission');
            await pressDecision(page, 'Decline Submission', 's9-mgr-decline');
            await readWizardPage(page, 's9-mgr-decline-na');
            await recordWizard(page, 's9-mgr-decline');
            const ma = await decisionMailFor(mailOf(u.au), S.s9.title, 's9-au-mail');
            const coraCount = await app.mail.count({to: `${sc.tag}cora9@mail.test`, contains: S.s9.title});
            record('s9-assigned-only', {authorSubject: ma && ma.subject, coraCount});
            log('[s9] cora9 mails:', coraCount);
            await notifyAllAuthorsSetting(page, 's9-mgr-restore', 'true');
        });
        // ---- s10: a disabled reviewer leaves the "Notify Reviewers" list
        if (on('s10')) await sect('s10-disabled-reviewer', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.s10.id, roundKey(S.s10)), 's10-mgr-workflow-before');
            await pressDecision(page, 'Accept Submission', 's10-mgr-accept-before');
            const before = await walkWizard(page, 's10-mgr-accept-before');
            await cancelWizard(page, 's10-mgr-accept-before');
            await usersRowMenu(page, u.rvd, 'Disable User', 's10-mgr');
            await openWorkflow(page, workflow(S.s10.id, roundKey(S.s10)), 's10-mgr-workflow-after');
            await pressDecision(page, 'Accept Submission', 's10-mgr-accept-after');
            const after = await walkWizard(page, 's10-mgr-accept-after');
            await cancelWizard(page, 's10-mgr-accept-after');
            record('s10-reviewer-lists', {before: before.map((p) => ({h1: p.h1, chips: p.chips, firstLine: p.firstLine})), after: after.map((p) => ({h1: p.h1, chips: p.chips, firstLine: p.firstLine}))});
        });
        // ---- s11: a disabled author leaves "Notify Authors" out
        if (on('s11')) await sect('s11-disabled-author', async () => {
            await signInAs(page, u.mgr);
            await openWorkflow(page, workflow(S.s11.id, 'workflow_1'), 's11-mgr-workflow-before');
            await pressDecision(page, 'Decline Submission', 's11-mgr-decline-before');
            const before = await walkWizard(page, 's11-mgr-decline-before');
            await cancelWizard(page, 's11-mgr-decline-before');
            await usersRowMenu(page, u.au2, 'Disable User', 's11-mgr');
            await openWorkflow(page, workflow(S.s11.id, 'workflow_1'), 's11-mgr-workflow-after');
            await pressDecision(page, 'Decline Submission', 's11-mgr-decline-after');
            const after = await walkWizard(page, 's11-mgr-decline-after');
            await cancelWizard(page, 's11-mgr-decline-after');
            record('s11-author-pages', {before: before.map((p) => ({h1: p.h1, rail: p.rail, chips: p.chips})), after: after.map((p) => ({h1: p.h1, rail: p.rail, chips: p.chips}))});
        });
        // ---- s12: the decline template edited and an alternative added
        if (on('s12')) await sect('s12-template-edit', async () => {
            await signInAs(page, u.mgr);
            await manageEmailsEdit(page, 'Submission Declined (Pre-Review)', 's12-mgr', {subjectPrefix: 'K2EDIT', addAlternative: {name: 'K2 Alternative Decline', subject: 'K2 alternative subject', body: 'K2 alternative body for {$recipientName}.'}});
            await openWorkflow(page, workflow(S.s12.id, 'workflow_1'), 's12-mgr-submission');
            await pressDecision(page, 'Decline Submission', 's12-mgr-decline');
            const w = await readWizardPage(page, 's12-mgr-decline-na');
            record('s12-mgr-decline-na-fields', {templates: w.templates, subject: w.subject, firstLine: firstLine((w.editors || [])[0]?.content)});
            const alt = page.locator('.composer__template').filter({hasText: 'K2 Alternative Decline'}).first();
            record('s12-alternative-listed', {count: await alt.count()});
            if (await alt.count()) { await alt.locator('.composer__template__name').click(); await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 15000}).catch(() => {}); await idle(page); await page.waitForTimeout(300); const w2 = await wizInfo(page); record('s12-mgr-decline-alt-loaded', {subject: w2.subject, firstLine: firstLine((w2.editors || [])[0]?.content), editor: (w2.editors || [])[0]?.content}); await snap(page, 's12-mgr-decline-alt-loaded'); }
            await recordWizard(page, 's12-mgr-decline');
            await mailFor(mailOf(u.au), 's12-au-mail', {subject: 'K2 alternative subject'});
            await openWorkflow(page, workflow(S.s12.id, 'workflow_1'), 's12-mgr-after');
            await activityLog(page, 's12-activity-log');
            await authorView(page, u.au, S.s12.id, 'workflow_1', 's12-au-after-decline');
        });
        // ---- OMP: Send to Internal Review, then Send to External Review from the internal round
        if (isOMP && on('omp')) await sect('omp-m1-internal', async () => {
            await signInAs(page, u.se);
            await openWorkflow(page, workflow(S.m1.id, 'workflow_1'), 'm1-se-submission');
            await pressDecision(page, 'Send to Internal Review', 'm1-se-internal');
            const w = await readWizardPage(page, 'm1-se-internal-na');
            record('m1-se-internal-na-fields', {templates: w.templates, subject: w.subject, chips: w.chips, firstLine: firstLine((w.editors || [])[0]?.content)});
            const r1 = await continueAndRecord(page, 'm1-se-internal');
            await decisionMailFor(mailOf(u.au), S.m1.title, 'm1-au-mail-internal');
            const key = (r1 && r1.landed && (r1.landed.match(/workflowMenuKey=([^&]+)/) || [])[1]) || undefined;
            await openWorkflow(page, workflow(S.m1.id, key), 'm1-se-internal-round');
            await activityLog(page, 'm1-activity-log-after-internal');
            await pressDecision(page, 'Send to External Review', 'm1-se-external');
            const w2 = await readWizardPage(page, 'm1-se-external-na');
            record('m1-se-external-na-fields', {templates: w2.templates, subject: w2.subject, chips: w2.chips, firstLine: firstLine((w2.editors || [])[0]?.content)});
            const r2 = await continueAndRecord(page, 'm1-se-external');
            const key2 = (r2 && r2.landed && (r2.landed.match(/workflowMenuKey=([^&]+)/) || [])[1]) || undefined;
            await openWorkflow(page, workflow(S.m1.id, key2), 'm1-se-external-round');
            await activityLog(page, 'm1-activity-log-after-external');
            await decisionMailFor(mailOf(u.au), S.m1.title, 'm1-au-mail-external');
        });
        // ---- locale: context F, French under UI only, then Forms ticked on screen
        if (on('locale')) await sect('locale', async () => {
            if (!sc.F) {
                const tb = tag('u34k2f');
                const ctxB = await app.api.createContext({tag: tb, context: {name: `U34 K2 fr ${tb}`, acronym: 'U34K2F', supportedLocales: ['en', 'fr_CA'], contactName: 'K2 Contact', contactEmail: `${tb}contact@mail.test`}, users: [{username: `${tb}mgr`, roles: ['manager'], givenName: 'Fran', familyName: 'Manager'}, {username: `${tb}au`, roles: ['author'], givenName: 'Ana', familyName: 'Auteur'}]});
                const r = await app.api.createSubmission({tag: `${tb}f1`, context: ctxB.path || tb, submitter: `${tb}au`, title: `K2 F1 two languages ${tb}`});
                sc.F = {tag: tb, contextPath: ctxB.path || tb, mgr: `${tb}mgr`, au: `${tb}au`, f1: r.submissionId, title: `K2 F1 two languages ${tb}`};
                save();
            }
            const F = sc.F;
            await signInAs(page, F.mgr, F.contextPath);
            await openWorkflow(page, workflow(F.f1, 'workflow_1', F.contextPath), 'f1-mgr-workflow-before');
            await pressDecision(page, 'Decline Submission', 'f1-mgr-decline-before');
            const w0 = await readWizardPage(page, 'f1-mgr-decline-before-na');
            record('f1-before-forms', {switchTo: w0.switchTo, templatesHeading: w0.templatesHeading, text: flat(w0.text, 400)});
            await cancelWizard(page, 'f1-mgr-decline-before');
            await tickFormsFrench(page, 'f1-mgr', F.contextPath);
            await openWorkflow(page, workflow(F.f1, 'workflow_1', F.contextPath), 'f1-mgr-workflow-after');
            await pressDecision(page, 'Decline Submission', 'f1-mgr-decline-after');
            await readWizardPage(page, 'f1-mgr-decline-after-na');
            await switchLocaleProbe(page, 'f1-mgr-decline');
            await recordWizard(page, 'f1-mgr-decline');
            await decisionMailFor(mailOf(F.au), F.title, 'f1-au-mail');
        });
    } finally { await close(); }
    if (on('s4') || on('s5')) note(`ccK2 [${app.name}] · The email page and the Composer driven for U34 K2 (Rules 3, 4, 5, 7, 8; the author's and reviewers' mails; the three settings): see .reports/U34/cc-K2.md and the kept script shared/playwright/checks/U34/K2/k2.js.`);
});
