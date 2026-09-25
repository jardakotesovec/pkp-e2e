// U16 claim check, chunk K2: the "Categories" tab's rules — the tree, the order of every category list, the
// tab's arrows, saving, the path as address, editing, deleting — and register A4, A8, A11.
// Spec: docs/specs/U16-categories.md lines 129–177, 463–472, 496–503, 517–525; footnotes c, d, e, g, i, j,
// td1, td2, td5, td6, f-a4, f-a8, f-a11.
//
//   PROBE_FEATURE=U16 PROBE_AGENT=ccK2 node bin/probe.js all shared/playwright/checks/U16/K2/k2.js
//   PHASES=seed,tab,french,add,edit,edit2,visitor,slash,order,editorlevel,admin,del2,leave,delete
//   (default: all; later phases read k2-state-<app>.json, so a phase can be re-run alone). A full run can
//   outlast the Bash cap: run one app at a time, or a few phases at a time.
//
// Scratch contexts per app (tag prefix u16k2):
//   C  en + fr_CA (UI and forms); categories seeded in this order: Zoology (fr "Animaux"), Arts (fr
//      "Beaux-arts") > Sculpture (fr "Modelage") then Painting (fr "Peinture"), Mathematics (English only),
//      Science (fr "Sciences") > Physics > Optics, Delta > Delta Sub > Delta Subsub, Movable > Movable Child;
//      Browse block on and in the sidebar; OJS: a published issue and the home page's category row.
//      Users: mg manager, ed editor ("Journal editor", manager level; OJS/OMP), se sectionEditor, au author.
//      Items: PM published in Movable; PD published in Delta; PDS published in Delta Subsub and Arts;
//      PX submitted (not published) in Delta Sub; PO submitted, unplaced (the "Select Categories" window).
//   D  a second journal with a category whose path is "shared".
// No assertions: the script records, the reader judges.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} = require('../../../probe');

const T = 30_000;
const ALL = ['seed', 'tab', 'french', 'add', 'edit', 'edit2', 'visitor', 'slash', 'order', 'editorlevel', 'admin', 'del2', 'leave', 'delete'];
const PHASES = (process.env.PHASES || ALL.join(',')).split(',');
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log('[k2]', ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const statePath = (app) => path.join(outDir(), `k2-state-${app.name}.json`);

// the app's own queue worker (the search index jobs a publish queues)
const drainJobs = (app) => {
    try {
        return execFileSync('php', ['lib/pkp/tools/jobs.php', 'run'], {cwd: app.root, env: {...process.env, PKP_CONFIG_FILE: app.configFile}, encoding: 'utf8', timeout: 180_000})
            .split('\n').filter((l) => l.trim()).slice(-3).join(' | ');
    } catch (e) { return `error: ${String(e.message).split('\n')[0]}`; }
};

forEachApp(async (app) => {
    const isOJS = app.name === 'ojs';
    const isOMP = app.name === 'omp';
    const isOPS = app.name === 'ops';
    const S = fs.existsSync(statePath(app)) ? JSON.parse(fs.readFileSync(statePath(app), 'utf8')) : {};
    const save = () => fs.writeFileSync(statePath(app), JSON.stringify(S, null, 1));
    const fact = (k, v) => { record('k2-facts', {[k]: v}, {merge: true}); log(`[${app.name} ${k}]`, JSON.stringify(v).slice(0, 4000)); };

    // ------------------------------------------------------------------ seed
    if (on('seed') && !S.seeded) {
        const t = tag('u16k2');
        S.t = t;
        const u = (p, k, roles, g, f) => ({username: `${p}${k}`, roles, givenName: g, familyName: f});
        const ctx = (p, name) => ({name: `U16 K2 ${name} ${p}`, acronym: 'KTWO', contactName: 'K2 Contact', contactEmail: `${p}c@mail.test`});
        const uname = (list, p) => Object.fromEntries(list.map((x) => [x.username.slice(p.length), x.username]));
        const pc = `${t}c`;
        const cUsers = isOPS
            ? [u(pc, 'mg', ['manager'], 'Mia', 'Manager'), u(pc, 'se', ['sectionEditor'], 'Sam', 'Moderator'), u(pc, 'au', ['author'], 'Ari', 'Author')]
            : [u(pc, 'mg', ['manager'], 'Mia', 'Manager'), u(pc, 'ed', ['editor'], 'Eve', 'Editor'), u(pc, 'se', ['sectionEditor'], 'Sam', 'Section'), u(pc, 'au', ['author'], 'Ari', 'Author')];
        const cBody = {tag: pc, context: {...ctx(pc, 'tree'), supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            categories: [
                {path: 'zoo', title: {en: 'Zoology', fr_CA: 'Animaux'}},
                {path: 'arts', title: {en: 'Arts', fr_CA: 'Beaux-arts'}, children: [
                    {path: 'sculpture', title: {en: 'Sculpture', fr_CA: 'Modelage'}},
                    {path: 'painting', title: {en: 'Painting', fr_CA: 'Peinture'}}]},
                {path: 'math', title: {en: 'Mathematics'}},
                {path: 'sci', title: {en: 'Science', fr_CA: 'Sciences'}, children: [
                    {path: 'phys', title: {en: 'Physics', fr_CA: 'Physique'}, children: [{path: 'optics', title: {en: 'Optics', fr_CA: 'Optique'}}]}]},
                {path: 'del', title: {en: 'Delta', fr_CA: 'Delta'}, children: [
                    {path: 'delsub', title: {en: 'Delta Sub', fr_CA: 'Delta Sub'}, children: [{path: 'delsubsub', title: {en: 'Delta Subsub', fr_CA: 'Delta Subsub'}}]}]},
                {path: 'movable', title: {en: 'Movable', fr_CA: 'Movable'}, children: [{path: 'movablechild', title: {en: 'Movable Child', fr_CA: 'Movable Child'}}]}],
            plugins: {browseblockplugin: {enabled: true}}, sidebar: ['browseblockplugin'], users: cUsers};
        if (isOJS) { cBody.issues = [{volume: 1, number: 1, year: 2025, published: true}]; cBody.themeOptions = {journalContentOrganization: [1, 2, 3]}; }
        let rc;
        try { rc = await app.api.createContext(cBody); } catch (e) {
            log('C seed refused', String(e.message).slice(0, 600));
            if (cBody.themeOptions) { delete cBody.themeOptions; S.themeRefused = String(e.message).slice(0, 400); rc = await app.api.createContext(cBody); } else throw e;
        }
        S.C = {path: rc.path || pc, id: rc.contextId, cats: rc.categories, u: uname(cUsers, pc)};
        save();
        const pd = `${t}d`;
        const rd = await app.api.createContext({tag: pd, context: ctx(pd, 'second'), categories: [{path: 'shared', title: 'Shared in D'}], users: [u(pd, 'mg', ['manager'], 'Dan', 'Manager')]});
        S.D = {path: rd.path || pd};
        save();
        const sub = async (key, spec) => {
            try {
                const r = await app.api.createSubmission({tag: `${t}${key}`, context: S.C.path, submitter: S.C.u.au, title: `K2 ${key} ${t}`, abstract: `${key} abstract.`, ...spec});
                log('seed', key, r.submissionId, r.publicationId, r.status);
                return {id: r.submissionId, pub: r.publicationId, status: r.status, title: `K2 ${key} ${t}`};
            } catch (e) { log('seed FAILED', key, String(e.message).slice(0, 600)); return {error: String(e.message).slice(0, 600)}; }
        };
        S.s = {};
        S.s.PM = await sub('movableitem', {categories: ['movable'], published: true});
        S.s.PD = await sub('deltaitem', {categories: ['del'], published: true});
        S.s.PDS = await sub('subsubitem', {categories: ['delsubsub', 'arts'], published: true});
        S.s.PX = await sub('workflowitem', {categories: ['delsub']});
        S.s.PO = await sub('unplaceditem', {});
        S.jobsAtSeed = drainJobs(app);
        S.seeded = true;
        save();
        record('seed', S);
    }
    if (!S.seeded) { log('no state; run seed first'); return; }
    if (PHASES.length === 1 && PHASES[0] === 'seed') return;

    // ------------------------------------------------------------------ browser and helpers
    const {page, close} = await launch(app);
    const jsDialogs = [];
    page.on('dialog', (d) => {
        jsDialogs.push({at: new Date().toISOString(), type: d.type(), message: d.message().slice(0, 300)});
        log('[browser dialog]', d.type(), flat(d.message(), 200));
        d.accept().catch(() => {});
    });
    const apiLog = [];
    page.on('response', (r) => { if (/\/api\/v1\/categories/.test(r.url())) apiLog.push(`${r.request().method()} ${r.url().replace(app.baseURL, '')} ${r.status()}`); });
    async function snap(name, extra = {}) {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), error: String(e.message).slice(0, 200)}; }
        Object.assign(s, extra);
        record(name, s);
        await shot(page, name).catch(() => {});
        return s;
    }
    async function sect(name, fn) {
        try { return await fn(); } catch (e) {
            log(`[${name} FAILED]`, String(e.stack || e).split('\n').slice(0, 4).join(' | '));
            fact(`${name}.FAILED`, String(e.message || e).slice(0, 600));
            await snap(`zz-failed-${name.replace(/[^a-z0-9]+/gi, '-')}`).catch(() => {});
            return null;
        }
    }
    const as = async (user, ctx) => { await signIn(page, user, {contextPath: ctx}); await idle(page); };
    const visitor = async () => { await signOut(page).catch(() => {}); };
    const cu = (ctx, p, lang) => app.url(`/index.php/${ctx}${lang ? `/${lang}` : ''}${p}`);
    const catPath = isOPS ? 'preprints' : 'catalog';
    const catPage = (ctx, p, lang = 'en') => cu(ctx, `/${catPath}/category/${p}`, lang);
    const itemPage = (ctx, id) => cu(ctx, isOJS ? `/article/view/${id}` : isOPS ? `/preprint/view/${id}` : `/catalog/book/${id}`, 'en');
    const MENU = isOJS ? 'Publication Settings' : isOMP ? 'Catalog Entry' : 'Preprint entry';

    // The Categories tab as data
    const TAB = () => {
        const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
        const panel = document.querySelector('#categories');
        if (!panel) return {panel: null};
        const table = panel.querySelector('table');
        const out = {panelText: txt(panel).slice(0, 1500)};
        out.buttonsOutsideTable = [...panel.querySelectorAll('button')].filter((b) => !b.closest('table')).map((b) => txt(b) || b.getAttribute('aria-label'));
        if (!table) return out;
        out.headers = [...table.querySelectorAll('thead th')].map((th) => txt(th) || (th.textContent || '').trim());
        out.rows = [...table.querySelectorAll('tbody tr')].map((tr) => {
            const cells = [...tr.querySelectorAll('td, th')];
            const arrow = tr.querySelector('td:last-child button');
            const icon = arrow ? arrow.querySelector('svg, .pkpIcon, [class*=icon], [class*=Icon]') : null;
            const r = arrow ? arrow.getBoundingClientRect() : null;
            return {name: cells[0] ? txt(cells[0]) : null, cells: cells.map(txt),
                indent: cells[0] ? getComputedStyle(cells[0].firstElementChild || cells[0]).paddingLeft : null,
                x: cells[0] ? Math.round(((cells[0].querySelector('span, div, a') || cells[0]).getBoundingClientRect()).left) : null,
                buttons: [...tr.querySelectorAll('button')].map((b) => (b.textContent || '').trim() || b.getAttribute('aria-label')),
                draggable: tr.draggable || !!tr.querySelector('[draggable=true], [class*=drag], [class*=handle]'),
                arrow: arrow ? {name: (arrow.textContent || '').trim() || arrow.getAttribute('aria-label'), ariaExpanded: arrow.getAttribute('aria-expanded'), box: `${Math.round(r.width)}x${Math.round(r.height)}`, icon: !!icon, iconBox: icon ? `${Math.round(icon.getBoundingClientRect().width)}x${Math.round(icon.getBoundingClientRect().height)}` : null, tabindex: arrow.getAttribute('tabindex')} : null};
        });
        return out;
    };
    const readTab = () => page.evaluate(TAB);
    const names = async () => ((await readTab()).rows || []).map((r) => r.name);
    async function openTab(ctx, snapName, lang) {
        await page.goto(cu(ctx, '/management/settings/context', lang)); await idle(page);
        await page.locator('#categories-button').click(); await idle(page);
        await page.locator('#categories table').first().waitFor({timeout: T}).catch(() => {});
        await sleep(500);
        const tab = await readTab();
        if (snapName) await snap(snapName, {tab});
        return tab;
    }
    const table = () => page.locator('#categories table').first();
    const row = (name) => table().locator('tbody tr').filter({has: page.getByRole('cell', {name, exact: true})}).first();
    const arrow = (name) => row(name).locator('td').last().getByRole('button');
    const pressArrow = async (name) => { const r = await arrow(name).click({timeout: 5000}).then(() => 'clicked', (e) => `click failed: ${String(e.message).split('\n')[0]}`); await sleep(700); return r; };
    async function rowMenu(name, item) {
        // the "More Actions" cell is the one before the arrow's (its name is translated on a French page)
        await row(name).locator('td:last-child').locator('xpath=preceding-sibling::td[1]').getByRole('button').first().click();
        await page.getByRole('menuitem').first().waitFor({timeout: 10_000});
        const items = (await page.getByRole('menuitem').allInnerTexts()).map((x) => x.trim());
        if (item) await page.getByRole('menuitem', {name: item, exact: true}).click();
        else await page.keyboard.press('Escape');
        return items;
    }
    const win = (title) => page.getByRole('dialog', {name: title}).last();
    const WIN = (title) => {
        const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
        const d = [...document.querySelectorAll('[role=dialog]')].filter((x) => x.getClientRects().length && (txt(x.querySelector('h1,h2')) || '').startsWith(title)).pop();
        if (!d) return {open: false};
        const out = {open: true, title: txt(d.querySelector('h1,h2'))};
        out.fields = [...d.querySelectorAll('.pkpFormField, fieldset')].filter((f) => f.getClientRects().length).map((f) => ({
            label: txt(f.querySelector('.pkpFormFieldLabel, legend')),
            description: txt(f.querySelector('.pkpFormField__description, [id$="-description"]')),
            inputs: [...f.querySelectorAll('input:not([type=hidden]):not([type=submit]), select, textarea')].filter((i) => i.type === 'file' || i.getClientRects().length).map((i) => ({name: i.name, id: i.id, type: i.type, value: i.type === 'checkbox' ? i.checked : i.tagName === 'SELECT' ? (i.options[i.selectedIndex] || {}).text : i.value, label: i.labels && i.labels[0] ? txt(i.labels[0]) : null})),
            errors: [...f.querySelectorAll('.pkpFieldError, [class*=FieldError]')].map(txt).filter(Boolean),
        }));
        out.selects = [...d.querySelectorAll('select')].map((s) => ({name: s.name, options: [...s.options].map((o) => o.text)}));
        out.footer = txt(d.querySelector('.pkpFormPage__footer, .pkpForm__footer'));
        out.text = txt(d).slice(0, 3000);
        return out;
    };
    const readWin = (title) => page.evaluate(WIN, title);
    async function waitWin(title) {
        await win(title).waitFor({timeout: T});
        await win(title).locator('#editCategory-path-control, [name="path"]').first().waitFor({timeout: T}).catch(() => {});
        await idle(page); await sleep(900);
    }
    async function saveWin(title) {
        const resp = page.waitForResponse((r) => /\/api\/v1\/categories/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
        const refetch = page.waitForResponse((r) => /\/api\/v1\/categories/.test(r.url()) && r.request().method() === 'GET', {timeout: 8_000}).catch(() => null);
        await win(title).getByRole('button', {name: 'Save', exact: true}).click();
        const r = await resp;
        let toast = null;
        for (let i = 0; i < 24 && !toast; i++) {
            toast = await page.evaluate(() => {
                const el = [...document.querySelectorAll('body *')].filter((e) => /^Category saved/.test((e.innerText || '').trim()) && e.getClientRects().length).pop();
                if (!el) return null;
                let box = el; for (let k = 0; k < 6 && box.parentElement && box.getBoundingClientRect().width < 150; k++) box = box.parentElement;
                const b = box.getBoundingClientRect();
                return {text: (box.innerText || '').replace(/\s+/g, ' ').trim(), role: (el.closest('[role]') || {}).getAttribute ? el.closest('[role]').getAttribute('role') : null, left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), vw: window.innerWidth, vh: window.innerHeight};
            });
            if (!toast) await sleep(250);
        }
        const g = r && r.status() < 400 ? await refetch : null;
        await idle(page); await sleep(700);
        return {status: r ? r.status() : null, method: r ? r.request().method() : null, url: r ? r.url().replace(app.baseURL, '') : null, toast, refetch: g ? `${g.status()} ${g.url().replace(app.baseURL, '')}` : null, stillOpen: await win(title).isVisible().catch(() => false)};
    }
    async function closeWin(title) {
        const w = win(title);
        if (await w.isVisible().catch(() => false)) await w.getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {});
        await sleep(900);
    }
    const fillName = (title, v, l = 'en') => win(title).locator(`#editCategory-title-control-${l}`).fill(v);
    const fillPath = (title, v) => win(title).locator('#editCategory-path-control').fill(v);
    async function addUnder(parent, name, p, snapName) {
        if (parent) await rowMenu(parent, 'Add'); else await page.getByRole('button', {name: 'Add Category'}).click();
        await waitWin('Add Category');
        const w = await readWin('Add Category');
        if (snapName) await snap(`${snapName}-window`, {win: w});
        await fillName('Add Category', name); await fillPath('Add Category', p);
        const s = await saveWin('Add Category');
        const tab = await readTab();
        if (snapName) await snap(`${snapName}-after`, {save: s, tab});
        return {window: {title: w.title, labels: w.fields.map((f) => f.label), mentionsParent: parent ? w.text.includes(parent) : null}, save: s, rows: (tab.rows || []).map((r) => `${r.name} @${r.x}`)};
    }
    // Delete dialog helpers
    const dlg = () => page.getByRole('dialog').filter({hasText: /Are you absolutely sure|Êtes-vous|supprimer/}).last();
    const DLG = () => page.evaluate(() => {
        const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
        const d = [...document.querySelectorAll('[role=dialog], [role=alertdialog]')].filter((x) => x.getClientRects().length).pop();
        if (!d) return null;
        return {title: txt(d.querySelector('h1,h2,h3')), text: (d.innerText || '').trim().slice(0, 2000), inputs: [...d.querySelectorAll('input')].map((i) => i.value),
            buttons: [...d.querySelectorAll('button')].map((b) => ({t: txt(b) || b.getAttribute('aria-label'), disabled: b.disabled}))};
    });
    const confirmBtn = () => dlg().getByRole('button', {name: /I understand the consequences|confirmDelete/});

    // The visitor's read of a frontend page: heading, breadcrumb, sub-category nav, Browse block, category links everywhere
    const VIS = () => {
        const txt = (e) => (e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null);
        const links = (sc) => (sc ? [...sc.querySelectorAll('a')].map((a) => ({t: txt(a), h: a.getAttribute('href')})) : []);
        const b = document.querySelector('.block_browse');
        return {title: document.title, h1: [...document.querySelectorAll('h1')].map(txt).slice(0, 3),
            bodyStart: txt(document.body).slice(0, 300),
            breadcrumb: txt(document.querySelector('.cmp_breadcrumbs')), breadcrumbLinks: links(document.querySelector('.cmp_breadcrumbs')),
            count: txt(document.querySelector('.article_count, .monograph_count, .count')),
            subcategories: links(document.querySelector('nav.subcategories, .subcategories')),
            browse: b ? {text: txt(b), links: links(b)} : null,
            homeRow: links(document.querySelector('.categoryHeader_categories, .archiveHeader_categories')),
            itemCategories: [...document.querySelectorAll('.item.categories, .categories, [class*=categor]')].filter((e) => !e.closest('.block_browse') && !e.closest('.categoryHeader_categories, .archiveHeader_categories')).map((e) => ({cls: e.className, text: txt(e).slice(0, 200), links: links(e)})).slice(0, 4),
            items: [...document.querySelectorAll('.obj_article_summary, .obj_preprint_summary, .obj_monograph_summary')].map((e) => txt(e.querySelector('.title, h3, h2, a')))};
    };
    const land = async (url, key) => {
        const resp = await page.goto(url).catch((e) => ({err: e.message}));
        await idle(page).catch(() => {});
        const o = {status: resp && resp.status ? resp.status() : resp && resp.err, finalUrl: page.url().replace(app.baseURL, ''), ...(await page.evaluate(VIS).catch((e) => ({err: e.message})))};
        await snap(`v-${key}`, {visit: o});
        return o;
    };

    // the workflow's placement page and its "Categories" field (as K3 reaches it)
    const wf = () => page.locator('[role="dialog"]:visible').first();
    const fieldLoc = () => page.locator('.pkpFormField, .pkpAutosuggest').filter({has: page.locator('.pkpFormFieldLabel, legend, label, .pkpFormField__heading').filter({hasText: /^\s*(Categories|Catégories)/})}).last();
    async function openEntry(ctx, sid, lang) {
        await page.goto(cu(ctx, `/dashboard/editorial?workflowSubmissionId=${sid}`, lang)); await idle(page); await sleep(1500);
        const link = wf().getByRole('link', {name: lang === 'fr_CA' ? /./ : MENU, exact: lang !== 'fr_CA'}).last();
        if (lang === 'fr_CA') {
            // the French menu name differs: follow the English page's key instead
            if (S.menuKey) { await page.goto(cu(ctx, `/dashboard/editorial?workflowSubmissionId=${sid}&workflowMenuKey=${S.menuKey}`, lang)); await idle(page); await sleep(1500); }
        } else {
            await link.click(); await idle(page); await sleep(1500);
            const m = /workflowMenuKey=([^&]+)/.exec(page.url());
            if (m) { S.menuKey = decodeURIComponent(m[1]); save(); }
        }
        await fieldLoc().waitFor({timeout: 12_000}).catch(() => {});
        await idle(page); await sleep(600);
    }
    const pickWin = () => page.getByRole('dialog').filter({has: page.locator('table')}).last();
    const PICK = () => {
        const txt = (e) => (e ? (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim() : null);
        const vis = (e) => e.getClientRects().length > 0;
        const d = [...document.querySelectorAll('[role=dialog]')].filter(vis).filter((x) => x.querySelector('table')).pop();
        if (!d) return {open: false};
        const tb = d.querySelector('table');
        return {open: true, heading: txt(d.querySelector('h1,h2')),
            headers: [...tb.querySelectorAll('thead th')].map((th) => (th.textContent || '').trim()),
            rows: [...tb.querySelectorAll('tbody tr')].filter(vis).map((tr) => {
                const btn = tr.querySelector('td:last-child button');
                const lab = tr.querySelector('label') || tr.querySelector('td');
                return {name: txt(lab), x: lab ? Math.round(lab.getBoundingClientRect().left) : null, box: !!tr.querySelector('input[type=checkbox]'),
                    arrow: btn ? {name: (btn.textContent || '').trim() || btn.getAttribute('aria-label'), expanded: btn.getAttribute('aria-expanded'), w: Math.round(btn.getBoundingClientRect().width)} : null};
            })};
    };
    const readPick = () => page.evaluate(PICK);
    const pickRow = (name) => pickWin().locator('tbody tr').filter({has: page.locator('label').filter({hasText: new RegExp(`^\\s*${name}\\s*$`)})}).first();
    const filtersWin = () => page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Apply Filters', exact: true})}).last();
    async function filtersSuggest(ctx, typed) {
        await page.goto(cu(ctx, '/dashboard/editorial?currentViewId=active')); await idle(page); await sleep(1000);
        await page.locator('main, #app-main').first().getByRole('button', {name: 'Filters', exact: true}).first().click();
        await filtersWin().getByRole('button', {name: 'Apply Filters', exact: true}).waitFor({timeout: T});
        await idle(page); await sleep(700);
        const o = {labels: await filtersWin().locator('.pkpFormFieldLabel, legend').allInnerTexts().catch(() => [])};
        const inp = fieldLoc().locator('input:not([type=hidden])').first();
        o.field = await fieldLoc().count();
        for (const t of typed) {
            if (!o.field) break;
            await inp.click(); await inp.fill(''); await inp.pressSequentially(t, {delay: 40}); await sleep(1500);
            o[`typed ${t}`] = (await page.locator('[role=listbox]:visible [role=option]').allInnerTexts().catch(() => [])).map((x) => flat(x, 120));
        }
        if (o.field && await fieldLoc().getByRole('button', {name: 'Select Categories'}).count()) {
            await fieldLoc().locator('input:not([type=hidden])').first().fill('').catch(() => {});
            await page.keyboard.press('Escape').catch(() => {}); await sleep(400);
            if (!(await filtersWin().isVisible().catch(() => false))) return o;
            const clicked = await fieldLoc().getByRole('button', {name: 'Select Categories'}).first().click({timeout: 6000}).then(() => true, () => false);
            if (!clicked) { o.window = 'Select Categories not clickable'; } else {
            await pickWin().waitFor({timeout: T}).catch(() => {}); await sleep(900);
            o.window = await readPick(); }
            await pickWin().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => {}); await sleep(900);
        }
        await filtersWin().getByRole('button', {name: 'Close', exact: true}).first().click().catch(() => page.keyboard.press('Escape'));
        await sleep(700);
        return o;
    }

    try {
        // ------------------------------------------------------------------ tab: what shows on load, the arrows (Rule 3, A11, td1), the order (Rule 2, td5)
        if (on('tab')) await sect('tab', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            out.onLoad = await openTab(S.C.path, 't-01-tab-onload');
            await loc(page, 'a row\'s arrow button (last cell)', arrow('Arts'));
            await loc(page, 'arrow buttons by accessible name', page.getByRole('button', {name: 'Expand sub-categories'}));
            await loc(page, 'arrow buttons named "Collapse sub-categories"', page.getByRole('button', {name: /Collapse sub-categories/}));
            out.expandNamed = await page.getByRole('button', {name: 'Expand sub-categories', exact: true}).count();
            out.pressArts = await pressArrow('Arts');
            out.artsOpen = await readTab(); await snap('t-02-arts-open', {tab: out.artsOpen});
            out.expandNamedArtsOpen = await page.getByRole('button', {name: 'Expand sub-categories', exact: true}).count();
            out.pressArtsAgain = await pressArrow('Arts');
            out.artsClosed = await names(); await snap('t-03-arts-closed', {rows: out.artsClosed});
            out.pressScience = await pressArrow('Science');
            out.scienceOpen = await readTab(); await snap('t-04-science-open', {tab: out.scienceOpen});
            out.pressPhysics = await pressArrow('Physics');
            out.physicsOpen = await readTab(); await snap('t-05-physics-open', {tab: out.physicsOpen});
            out.pressScienceClose = await pressArrow('Science');
            out.scienceClosed = await names(); await snap('t-06-science-closed', {rows: out.scienceClosed});
            out.pressScienceReopen = await pressArrow('Science');
            out.scienceReopened = await names(); await snap('t-07-science-reopened', {rows: out.scienceReopened});
            // a row with nothing under it: the pointer, then the keyboard
            out.pressMathPointer = await pressArrow('Mathematics');
            out.afterMathPointer = await names();
            await row('Mathematics').getByRole('button', {name: 'More Actions'}).focus();
            await page.keyboard.press('Tab'); await sleep(300);
            out.focusAfterTab = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return {tag: a.tagName, name: (a.textContent || '').trim() || a.getAttribute('aria-label'), box: `${Math.round(r.width)}x${Math.round(r.height)}`, row: (a.closest('tr') ? a.closest('tr').innerText.split('\n')[0] : null)}; });
            await page.keyboard.press('Enter'); await sleep(600);
            out.afterMathEnter = await names();
            await snap('t-08-leaf-arrow-keyboard', {focus: out.focusAfterTab, rows: out.afterMathEnter});
            // the keyboard on a row with sub-categories
            await row('Arts').getByRole('button', {name: 'More Actions'}).focus();
            await page.keyboard.press('Tab'); await sleep(300);
            out.focusArts = await page.evaluate(() => { const a = document.activeElement; return {name: (a.textContent || '').trim(), row: a.closest('tr') ? a.closest('tr').innerText.split('\n')[0] : null}; });
            await page.keyboard.press('Enter'); await sleep(700);
            out.afterArtsEnter = await names();
            out.focusAfterEnter = await page.evaluate(() => { const a = document.activeElement; return {name: (a.textContent || '').trim(), row: a.closest('tr') ? a.closest('tr').innerText.split('\n')[0] : null}; });
            await page.keyboard.press('Space'); await sleep(700);
            out.afterArtsSpace = await names();
            await snap('t-08b-arts-arrow-keyboard', {enter: out.afterArtsEnter, space: out.afterArtsSpace});
            // the same button pressed by the pointer, for contrast
            out.pressArtsPointer = await pressArrow('Arts'); out.afterArtsPointer = await names();
            // reload: open rows closed again?
            await page.reload(); await idle(page);
            await page.locator('#categories-button').click().catch(() => {}); await idle(page); await sleep(500);
            out.afterReload = await names(); await snap('t-09-after-reload', {rows: out.afterReload, url: page.url()});
            fact('tab', out);
        });

        // ------------------------------------------------------------------ french: the tab's order in the other language (Rule 2), the delete box against the shown name
        if (on('french')) await sect('french', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            out.tab = await openTab(S.C.path, 'fr-01-tab-french', 'fr_CA');
            out.url = page.url();
            const artsFr = 'Beaux-arts';
            out.pressArts = await pressArrow(artsFr);
            out.artsOpen = await names(); await snap('fr-02-arts-open-french', {rows: out.artsOpen});
            out.arrowNames = ((await readTab()).rows || []).map((r) => r.arrow && r.arrow.name);
            // the delete box: the name the tab shows (French) against the English one
            out.menu = await rowMenu(artsFr, null);
            await rowMenu(artsFr, out.menu[out.menu.length - 1]);
            await dlg().waitFor({timeout: T}).catch(() => {}); await sleep(500);
            out.dialog = await DLG(); await snap('fr-03-delete-arts-french', {dialog: out.dialog});
            const box = page.locator('[role=dialog]:visible input').last();
            await box.fill('Arts'); await sleep(300); out.typedEnglish = (await DLG()).buttons;
            await box.fill(artsFr); await sleep(300); out.typedFrench = (await DLG()).buttons;
            await snap('fr-04-delete-typed-french', {buttons: out.typedFrench});
            await page.locator('[role=dialog]:visible').last().getByRole('button').filter({hasText: /Annuler|Cancel/}).first().click().catch(() => {}); await sleep(900);
            out.afterCancel = await names();
            // a category with no French name
            if ((await row('Mathematics').count())) {
                await rowMenu('Mathematics', out.menu[out.menu.length - 1]);
                await dlg().waitFor({timeout: T}).catch(() => {}); await sleep(500);
                out.mathDialog = await DLG();
                await page.locator('[role=dialog]:visible input').last().fill('Mathematics'); await sleep(300);
                out.mathTyped = (await DLG()).buttons;
                await snap('fr-05-delete-math-french', {dialog: out.mathDialog, buttons: out.mathTyped});
                await page.locator('[role=dialog]:visible').last().getByRole('button').filter({hasText: /Annuler|Cancel/}).first().click().catch(() => {}); await sleep(900);
            }
            fact('french', out);
        });

        // ------------------------------------------------------------------ add: top level, a row's "Add", depth, the parent opening, saving and refusals (Rules 1, 3, 4)
        if (on('add')) await sect('add', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            await openTab(S.C.path);
            out.top = await addUnder(null, 'Top New', 'topnew', 'a-01-top');
            // a leaf row, closed: Mathematics > Algebra
            out.leafChild = await addUnder('Mathematics', 'Algebra', 'algebra', 'a-02-under-leaf');
            // a closed parent with sub-categories: Science (closed) > Biology
            await openTab(S.C.path);
            out.beforeClosedParent = await names();
            out.closedParent = await addUnder('Science', 'Biology', 'biology', 'a-03-under-closed-parent');
            // depth: Physics > Optics > Lenses > Coatings > Films (five and six levels)
            if (!(await row('Physics').count())) await pressArrow('Science');
            if (!(await row('Optics').count())) await pressArrow('Physics');
            out.lenses = await addUnder('Optics', 'Lenses', 'lenses', 'a-04-level4');
            out.coatings = await addUnder('Lenses', 'Coatings', 'coatings', 'a-05-level5');
            out.films = await addUnder('Coatings', 'Films', 'films', 'a-06-level6');
            out.deepTab = await readTab(); await snap('a-07-six-levels', {tab: out.deepTab});
            // the tab refreshed without a reload? an unrelated open row stays open after a save?
            out.apiLogSoFar = apiLog.slice(-20);
            // refused saves keep the window open
            await page.getByRole('button', {name: 'Add Category'}).click(); await waitWin('Add Category');
            const sv = win('Add Category').getByRole('button', {name: 'Save', exact: true});
            await sv.click(); await sleep(900);
            out.emptyRefused = {win: await readWin('Add Category')}; await snap('a-08-refused-empty', {win: out.emptyRefused.win});
            await fillName('Add Category', 'Taken Try'); await fillPath('Add Category', 'arts');
            out.takenRefused = await saveWin('Add Category');
            out.takenRefused.win = await readWin('Add Category'); await snap('a-09-refused-taken', {save: out.takenRefused});
            // another journal's path is free here
            await fillPath('Add Category', 'shared'); await fillName('Add Category', 'Shared in C');
            out.sharedSave = await saveWin('Add Category');
            out.rowsAfterShared = await names(); await snap('a-10-shared-saved', {save: out.sharedSave, rows: out.rowsAfterShared});
            await closeWin('Add Category');
            fact('add', out);
        });

        // ------------------------------------------------------------------ edit: the filled window, everything changed, the path moved (Rules 5, 6; A4)
        if (on('edit')) await sect('edit', async () => {
            const out = {};
            // before: the visitor's links to "Movable"
            await visitor();
            out.before = {
                home: await land(cu(S.C.path, '', 'en'), 'e-01-home-before'),
                movable: await land(catPage(S.C.path, 'movable'), 'e-02-movable-before'),
                child: await land(catPage(S.C.path, 'movablechild'), 'e-03-child-before'),
                item: S.s.PM.id ? await land(itemPage(S.C.path, S.s.PM.id), 'e-04-item-before') : null};
            await as(S.C.u.mg, S.C.path);
            await openTab(S.C.path);
            // give "Movable" saved values to be filled back: description, order, editors (OJS/OMP)
            await rowMenu('Movable', 'Edit'); await waitWin('Edit Category');
            out.editOpened = await readWin('Edit Category'); await snap('e-05-edit-movable-opened', {win: out.editOpened});
            out.pathLine = flat(await win('Edit Category').locator('#editCategory-path-control').locator('xpath=ancestor::*[contains(@class,"pkpFormField")][1]').innerText().catch(() => null), 300);
            await page.waitForFunction(() => window.tinymce && window.tinymce && window.tinymce.get().length && window.tinymce.get().every((e) => e.initialized), null, {timeout: 15_000}).catch(() => {});
            await page.evaluate(() => { const ed = (window.tinymce.get() || []).find((e) => /description-control-en/.test(e.id)); if (ed) { ed.setContent('<p>Movable description.</p>'); ed.fire('change'); ed.fire('input'); ed.fire('keyup'); } });
            await win('Edit Category').locator('select[name="sortOption"]').selectOption({label: 'Title (A-Z)'});
            const boxes = win('Edit Category').locator('input[name^="subEditors"]');
            out.boxCount = await boxes.count();
            for (let i = 0; i < Math.min(2, out.boxCount); i++) await boxes.nth(i).check();
            out.firstSave = await saveWin('Edit Category');
            out.tabAfterFirst = (await readTab()).rows.map((r) => r.cells.slice(0, 2).join(' | '));
            await rowMenu('Movable', 'Edit'); await waitWin('Edit Category');
            await sleep(1200);
            out.reopened = await readWin('Edit Category');
            out.reopenedDescription = await page.evaluate(() => { const ed = (window.tinymce.get() || []).find((e) => /description-control-en/.test(e.id)); return ed ? ed.getContent() : null; });
            await snap('e-06-edit-movable-reopened', {win: out.reopened, description: out.reopenedDescription});
            // everything changed: name (both languages), path, description, order, editors
            await fillName('Edit Category', 'Moved');
            const fr = win('Edit Category').getByRole('button', {name: 'French', exact: true});
            if (await fr.count()) { await fr.click(); await sleep(500); await fillName('Edit Category', 'Déplacé', 'fr_CA').catch(() => {}); }
            await fillPath('Edit Category', 'moved');
            await page.evaluate(() => { const ed = (window.tinymce.get() || []).find((e) => /description-control-en/.test(e.id)); if (ed) { ed.setContent('<p>Moved description.</p>'); ed.fire('change'); ed.fire('input'); ed.fire('keyup'); } });
            await win('Edit Category').locator('select[name="sortOption"]').selectOption({label: 'Title (Z-A)'});
            if (out.boxCount) await boxes.nth(0).uncheck();
            out.secondSave = await saveWin('Edit Category');
            out.tabAfterSecond = (await readTab()).rows.map((r) => r.cells.slice(0, 2).join(' | '));
            await snap('e-07-tab-after-change', {rows: out.tabAfterSecond, save: out.secondSave});
            await rowMenu('Moved', 'Edit'); await waitWin('Edit Category'); await sleep(1200);
            out.reopened2 = await readWin('Edit Category');
            out.reopened2Description = await page.evaluate(() => { const ed = (window.tinymce.get() || []).find((e) => /description-control-en/.test(e.id)); return ed ? ed.getContent() : null; });
            out.parentField = out.reopened2.fields.filter((f) => /parent/i.test(`${f.label} ${f.inputs.map((i) => i.name).join(' ')}`));
            await snap('e-08-edit-moved-reopened', {win: out.reopened2, description: out.reopened2Description});
            await closeWin('Edit Category');
            // a sub-category's window: anything naming its parent?
            await pressArrow('Moved');
            await rowMenu('Movable Child', 'Edit'); await waitWin('Edit Category');
            out.childWindow = await readWin('Edit Category'); await snap('e-09-edit-child', {win: out.childWindow});
            out.childWindowNamesParent = /Moved|Movable(?! Child)/.test(out.childWindow.text.replace(/Movable Child/g, ''));
            await closeWin('Edit Category');
            // the row menus: any "Move"?
            out.rowMenuChild = await rowMenu('Movable Child');
            // after: the visitor's links
            await visitor();
            out.after = {
                oldAddress: await land(catPage(S.C.path, 'movable'), 'e-10-old-address'),
                newAddress: await land(catPage(S.C.path, 'moved'), 'e-11-new-address'),
                home: await land(cu(S.C.path, '', 'en'), 'e-12-home-after'),
                child: await land(catPage(S.C.path, 'movablechild'), 'e-13-child-after'),
                item: S.s.PM.id ? await land(itemPage(S.C.path, S.s.PM.id), 'e-14-item-after') : null,
                french: await land(catPage(S.C.path, 'moved', 'fr_CA'), 'e-15-new-address-french')};
            fact('edit', out);
        });

        // ------------------------------------------------------------------ edit2: description and picture filled back, then changed (Rule 6)
        if (on('edit2')) await sect('edit2', async () => {
            const out = {};
            const W = 'Edit Category';
            const EDID = 'editCategory-description-control-en';
            const readDesc = () => page.evaluate((id) => { const ed = window.tinymce && window.tinymce.get(id); return ed ? ed.getContent() : null; }, EDID);
            const typeDesc = async (text) => {
                await page.waitForFunction((id) => window.tinymce && window.tinymce.get(id) && window.tinymce.get(id).initialized, EDID, {timeout: 15_000});
                const body = page.frameLocator(`#${EDID}_ifr`).locator('body');
                await body.click(); await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
                await page.keyboard.type(text, {delay: 20}); await sleep(400);
            };
            const readCover = () => win(W).evaluate((d) => ({imgs: [...d.querySelectorAll('img')].map((i) => ({src: (i.getAttribute('src') || '').slice(-80), alt: i.alt})), alt: (d.querySelector('input[name^="image"], [id*=altText], input[id*=image]') || {}).value || null,
                altBoxes: [...d.querySelectorAll('input[type=text]')].filter((i) => /alt/i.test(i.id + i.name)).map((i) => i.value)}));
            await as(S.C.u.mg, S.C.path);
            await openTab(S.C.path);
            await rowMenu('Top New', 'Edit'); await waitWin(W);
            await typeDesc('Top description one.');
            const file = path.resolve(__dirname, '../../../../../apps', app.name, 'playwright/fixtures/files/profile-image-400.png');
            const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()), {timeout: 20_000}).catch(() => null);
            await win(W).locator('input[type=file]').first().setInputFiles(file);
            out.upload = await up.then((r) => (r ? r.status() : null));
            await sleep(800);
            const alt = win(W).getByRole('textbox', {name: /Alternate text/i}).first();
            if (await alt.count()) await alt.fill('Top picture one');
            await win(W).locator('select[name="sortOption"]').selectOption({label: 'Publication date (oldest first)'});
            out.save1 = await saveWin(W);
            await snap('e2-01-saved-one', {save: out.save1});
            await rowMenu('Top New', 'Edit'); await waitWin(W); await sleep(1500);
            out.reopen1 = {desc: await readDesc(), cover: await readCover(), altValue: await alt.inputValue().catch(() => null), order: await win(W).locator('select[name="sortOption"]').evaluate((s) => s.options[s.selectedIndex].text)};
            await snap('e2-02-reopened-one', {reopen: out.reopen1});
            await typeDesc('Top description two.');
            if (await alt.count()) await alt.fill('Top picture two');
            out.save2 = await saveWin(W);
            await rowMenu('Top New', 'Edit'); await waitWin(W); await sleep(1500);
            out.reopen2 = {desc: await readDesc(), cover: await readCover(), altValue: await alt.inputValue().catch(() => null)};
            await snap('e2-03-reopened-two', {reopen: out.reopen2});
            // remove the picture, if the window offers it
            const rm = win(W).getByRole('button', {name: /Remove|Delete|Change/}).first();
            out.pictureButtons = await win(W).locator('.pkpFormField--upload button, [class*=upload] button').allInnerTexts().catch(() => []);
            await closeWin(W);
            await visitor();
            out.page = await land(catPage(S.C.path, 'topnew'), 'e2-04-topnew-page');
            fact('edit2', out);
        });

        // ------------------------------------------------------------------ visitor: the same path in two journals (Rule 5)
        if (on('visitor')) await sect('visitor', async () => {
            const out = {};
            await visitor();
            out.sharedC = await land(catPage(S.C.path, 'shared'), 'vs-01-shared-in-C');
            out.sharedD = await land(catPage(S.D.path, 'shared'), 'vs-02-shared-in-D');
            fact('visitor', out);
        });

        // ------------------------------------------------------------------ slash: a path with "/" (A8, td2), both ends of the part before the "/"
        if (on('slash')) await sect('slash', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            await openTab(S.C.path);
            out.nowhere = await addUnder(null, 'Nowhere Slash', 'nosuch/thing', 's-01-nowhere');
            out.sci = await addUnder(null, 'Science Slash', 'sci/deep', 's-02-sci');
            await rowMenu('Nowhere Slash', 'Edit'); await waitWin('Edit Category');
            out.editNowhere = await readWin('Edit Category'); await snap('s-03-edit-nowhere', {win: out.editNowhere});
            await closeWin('Edit Category');
            await visitor();
            const home = await land(cu(S.C.path, '', 'en'), 's-04-home');
            const links = [...(home.browse ? home.browse.links : []), ...home.homeRow];
            out.homeLinks = links.filter((l) => /nosuch|sci%2F|sci\/deep/.test(l.h || ''));
            const nl = links.find((l) => /nosuch/.test(l.h || ''));
            const sl = links.find((l) => /sci(%2F|\/)deep/.test(l.h || ''));
            if (nl) out.nowhereFromLink = await land(new URL(nl.h, app.baseURL).href, 's-05-nowhere-from-link');
            if (sl) out.sciFromLink = await land(new URL(sl.h, app.baseURL).href, 's-06-sci-from-link');
            out.nowhereTyped = await land(catPage(S.C.path, 'nosuch/thing'), 's-07-nowhere-typed');
            fact('slash', out);
        });

        // ------------------------------------------------------------------ order: the Browse block, a page's "Subcategories", the "Select Categories" window, both languages (Rule 2, td5; A11)
        if (on('order')) await sect('order', async () => {
            const out = {};
            await visitor();
            for (const lang of ['en', 'fr_CA']) {
                const h = await land(cu(S.C.path, '/', lang), `o-01-home-${lang}`);
                const a = await land(catPage(S.C.path, 'arts', lang), `o-02-arts-page-${lang}`);
                out[lang] = {browse: h.browse, homeRow: h.homeRow.map((l) => l.t), artsSubcategories: a.subcategories.map((l) => l.t)};
            }
            await as(S.C.u.mg, S.C.path);
            if (S.s.PO && S.s.PO.id) {
                for (const lang of ['en', 'fr_CA']) {
                    await openEntry(S.C.path, S.s.PO.id, lang === 'en' ? null : lang);
                    const btn = fieldLoc().getByRole('button').filter({hasText: /Select Categories|Sélectionner|selectCategories/}).first();
                    out[`${lang}FieldButtons`] = await fieldLoc().getByRole('button').allInnerTexts().catch(() => []);
                    if (await btn.count()) {
                        await btn.click(); await pickWin().waitFor({timeout: T}).catch(() => {}); await sleep(900);
                        const w1 = await readPick();
                        await snap(`o-03-pick-${lang}`, {pick: w1});
                        if (lang === 'en') { await loc(page, '"Select Categories" window arrows', pickWin().locator('tbody tr td:last-child button')); }
                        // open Arts's level and Science's
                        const openRow = async (n) => { const r = pickRow(n); const b = r.locator('td:last-child button'); if (await b.count()) await b.click({timeout: 4000}).catch(() => {}); await sleep(600); };
                        await openRow(lang === 'en' ? 'Arts' : 'Beaux-arts');
                        await openRow(lang === 'en' ? 'Science' : 'Sciences');
                        const w2 = await readPick();
                        await snap(`o-04-pick-opened-${lang}`, {pick: w2});
                        out[`${lang}Pick`] = {closed: w1, opened: w2};
                        await pickWin().getByRole('button').filter({hasText: /^(Close|Fermer)$/}).first().click().catch(() => page.keyboard.press('Escape')); await sleep(900);
                    } else await snap(`o-03-pick-${lang}-nobutton`);
                }
            }
            fact('order', out);
        });

        // ------------------------------------------------------------------ editorlevel: a "Journal editor" (manager level) on the tab (OJS, OMP)
        if (on('editorlevel') && !isOPS) await sect('editorlevel', async () => {
            const out = {};
            await as(S.C.u.ed, S.C.path);
            out.tab = await openTab(S.C.path, 'el-01-editor-tab');
            out.pressArts = await pressArrow('Arts'); out.artsOpen = await names();
            out.add = await addUnder('Zoology', 'Birds', 'birds', 'el-02-editor-add');
            await rowMenu('Birds', 'Edit'); await waitWin('Edit Category');
            await fillName('Edit Category', 'Birds Edited');
            out.edit = await saveWin('Edit Category');
            out.rows = await names(); await snap('el-03-editor-edited', {rows: out.rows, save: out.edit});
            await rowMenu('Birds Edited', 'Delete Category'); await dlg().waitFor({timeout: T}); await sleep(400);
            out.dialog = await DLG();
            await dlg().locator('input').first().fill('Birds Edited'); await sleep(300);
            await confirmBtn().click(); await sleep(1500);
            out.deleted = await DLG(); await snap('el-04-editor-deleted', {dialog: out.deleted});
            await page.getByRole('button', {name: 'Back to Categories'}).click().catch(() => {}); await sleep(900);
            out.rowsAfter = await names();
            fact('editorlevel', out);
        });

        // ------------------------------------------------------------------ del2: the deletes of editorlevel and admin, re-run when their first run pressed "Cancel" (a locator fault since fixed)
        if (on('del2')) await sect('del2', async () => {
            const out = {};
            const del = async (user, name, key) => {
                await as(user, S.C.path);
                await openTab(S.C.path);
                if (!(await row(name).count())) { await pressArrow('Zoology'); }
                if (!(await row(name).count())) return 'no row';
                await rowMenu(name, 'Delete Category'); await dlg().waitFor({timeout: T}); await sleep(400);
                await dlg().locator('input').first().fill(name); await sleep(300);
                const o = {before: (await DLG()).buttons};
                await confirmBtn().click(); await sleep(1500);
                o.deleted = await DLG(); await snap(key, {dialog: o.deleted});
                await page.getByRole('button', {name: 'Back to Categories'}).click().catch(() => {}); await sleep(900);
                o.rowsAfter = await names();
                return o;
            };
            if (!isOPS) out.editor = await del(S.C.u.ed, 'Birds Edited', 'el-04-editor-deleted');
            out.admin = await del('admin', 'Admin Made', 'ad-03-admin-deleted');
            fact('del2', out);
        });

        // ------------------------------------------------------------------ admin: the site administrator on the scratch context's tab
        if (on('admin')) await sect('admin', async () => {
            const out = {};
            await as('admin', S.C.path);
            out.tab = await openTab(S.C.path, 'ad-01-admin-tab');
            out.add = await addUnder(null, 'Admin Made', 'adminmade', 'ad-02-admin-add');
            await rowMenu('Admin Made', 'Delete Category'); await dlg().waitFor({timeout: T}); await sleep(400);
            await dlg().locator('input').first().fill('Admin Made'); await sleep(300);
            await confirmBtn().click(); await sleep(1500);
            out.deleted = await DLG(); await snap('ad-03-admin-deleted', {dialog: out.deleted});
            await page.getByRole('button', {name: 'Back to Categories'}).click().catch(() => {}); await sleep(900);
            out.rowsAfter = await names();
            fact('admin', out);
        });

        // ------------------------------------------------------------------ leave: an unsaved change in the window, Escape, another tab of the page, back (the sweep)
        if (on('leave')) await sect('leave', async () => {
            const out = {};
            await as(S.C.u.mg, S.C.path);
            await openTab(S.C.path);
            await rowMenu('Zoology', 'Edit'); await waitWin('Edit Category');
            await fillName('Edit Category', 'Zoology unsaved');
            await page.keyboard.press('Escape'); await sleep(900);
            out.afterEscape = {windowOpen: await win('Edit Category').isVisible().catch(() => false), rows: await names()};
            await snap('l-01-after-escape', out.afterEscape);
            if (out.afterEscape.windowOpen) await closeWin('Edit Category');
            const other = page.getByRole('tab').filter({hasNotText: /Categories/}).first();
            out.otherTab = flat(await other.innerText().catch(() => null), 60);
            await other.click().catch(() => {}); await idle(page); await sleep(700);
            await snap('l-02-other-tab');
            await page.locator('#categories-button').click(); await idle(page); await sleep(700);
            await rowMenu('Zoology', 'Edit'); await waitWin('Edit Category'); await sleep(800);
            out.reopened = (await readWin('Edit Category')).fields.filter((f) => /Name/.test(f.label || '')).map((f) => f.inputs.map((i) => i.value));
            await snap('l-03-reopened-after-tab-switch', {name: out.reopened});
            await closeWin('Edit Category');
            // the delete dialog typed, then "Close" at its top, then reopened: is the box empty?
            await rowMenu('Zoology', 'Delete Category'); await dlg().waitFor({timeout: T}); await sleep(400);
            await dlg().locator('input').first().fill('Zoo'); await sleep(200);
            await dlg().getByRole('button', {name: 'Close', exact: true}).click().catch(() => page.keyboard.press('Escape')); await sleep(900);
            await rowMenu('Zoology', 'Delete Category'); await dlg().waitFor({timeout: T}); await sleep(400);
            out.deleteReopenedBox = (await DLG()).inputs;
            await snap('l-04-delete-reopened', {inputs: out.deleteReopenedBox});
            await dlg().getByRole('button', {name: 'Cancel', exact: true}).click().catch(() => {}); await sleep(900);
            out.rowsEnd = await names();
            fact('leave', out);
        });

        // ------------------------------------------------------------------ delete: a category with two levels under it and placed articles (Rule 7, td6)
        if (on('delete')) await sect('delete', async () => {
            const out = {};
            await visitor();
            out.before = {
                del: await land(catPage(S.C.path, 'del'), 'd-01-del-before'),
                delsub: await land(catPage(S.C.path, 'delsub'), 'd-02-delsub-before'),
                delsubsub: await land(catPage(S.C.path, 'delsubsub'), 'd-03-delsubsub-before'),
                itemPD: await land(itemPage(S.C.path, S.s.PD.id), 'd-04-item-PD-before'),
                itemPDS: await land(itemPage(S.C.path, S.s.PDS.id), 'd-05-item-PDS-before')};
            await as(S.C.u.mg, S.C.path);
            out.filtersBefore = await filtersSuggest(S.C.path, ['Del']);
            await snap('d-06-filters-before', {filters: out.filtersBefore});
            await openEntry(S.C.path, S.s.PX.id);
            out.pxFieldBefore = flat(await fieldLoc().innerText().catch(() => null), 400);
            await snap('d-07-PX-entry-before', {field: out.pxFieldBefore});
            await openTab(S.C.path);
            await rowMenu('Delta', 'Delete Category'); await dlg().waitFor({timeout: T}); await sleep(500);
            out.dialog = await DLG(); await snap('d-08-delta-dialog', {dialog: out.dialog});
            await dlg().locator('input').first().fill('delta'); await sleep(300);
            out.lower = (await DLG()).buttons; await snap('d-09-delta-lowercase', {buttons: out.lower});
            await dlg().locator('input').first().fill('Delta'); await sleep(300);
            out.exact = (await DLG()).buttons; await snap('d-10-delta-exact', {buttons: out.exact});
            await dlg().getByRole('button', {name: 'Cancel', exact: true}).click(); await sleep(900);
            out.afterCancel = {dialog: await DLG(), rows: await names(), api: apiLog.slice(-3)}; await snap('d-11-after-cancel', out.afterCancel);
            await sleep(600);
            await rowMenu('Delta', 'Delete Category'); await dlg().waitFor({timeout: T}); await sleep(500);
            out.reopenedBox = (await DLG()).inputs;
            await dlg().locator('input').first().fill('Delta'); await sleep(300);
            const resp = page.waitForResponse((r) => /\/api\/v1\/categories\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: 15_000}).catch(() => null);
            await confirmBtn().click();
            const r = await resp; out.deleteResp = r ? {status: r.status(), method: r.request().method(), override: r.request().headers()['x-http-method-override'] || null} : null;
            await sleep(1500);
            out.deletedDialog = await DLG(); await snap('d-12-deleted-dialog', {dialog: out.deletedDialog});
            out.rowsBehind = await names();
            await page.getByRole('button', {name: 'Back to Categories'}).click().catch(() => {}); await sleep(1000);
            out.afterBack = {dialog: await DLG(), rows: await names(), url: page.url()}; await snap('d-13-tab-after-delete', out.afterBack);
            await openEntry(S.C.path, S.s.PX.id);
            out.pxFieldAfter = flat(await fieldLoc().innerText().catch(() => null), 400);
            await snap('d-14-PX-entry-after', {field: out.pxFieldAfter});
            out.filtersAfter = await filtersSuggest(S.C.path, ['Del']);
            await snap('d-15-filters-after', {filters: out.filtersAfter});
            await visitor();
            out.after = {
                del: await land(catPage(S.C.path, 'del'), 'd-16-del-after'),
                delsub: await land(catPage(S.C.path, 'delsub'), 'd-17-delsub-after'),
                delsubsub: await land(catPage(S.C.path, 'delsubsub'), 'd-18-delsubsub-after'),
                itemPD: await land(itemPage(S.C.path, S.s.PD.id), 'd-19-item-PD-after'),
                itemPDS: await land(itemPage(S.C.path, S.s.PDS.id), 'd-20-item-PDS-after'),
                arts: await land(catPage(S.C.path, 'arts'), 'd-21-arts-after'),
                home: await land(cu(S.C.path, '', 'en'), 'd-22-home-after')};
            out.jobs = drainJobs(app);
            out.artsAfterJobs = await land(catPage(S.C.path, 'arts'), 'd-23-arts-after-jobs');
            fact('delete', out);
        });
    } finally {
        if (jsDialogs.length) record('js-dialogs', jsDialogs);
        record('api-log', apiLog);
        await close();
    }
});
