// U07 drift sweep 2026-10-26, chunk SW1 (housekeeping, slot s0): spec lines 10–292 of
// docs/specs/U07-journal-identity-and-about-pages.md (Purpose, Actors & permissions, Fields &
// validation, Rules 1–11) and the register entries those lines mark (A1, A2, A3, A7, A8, A9, OMP1,
// OPS1, OPS2, OPS3). No assertions: the script records, the reader judges.
//
// Self-contained: each run seeds its own scratch contexts (tag prefix hksw1) into
// sw1-state-<PROBE_RUN>-<app>.json (the kit's outFile), and every later PART reads that file, so a
// maintenance session re-runs it as is:
//
//   for R in r1 r2; do for A in ojs omp ops; do
//     bin/app-lock.sh shared $A -- env PROBE_FEATURE=U07 PROBE_AGENT=ccSW1 PROBE_RUN=$R PART=seed,menu,levels,edit \
//       node bin/probe.js $A shared/playwright/checks/U07/SW1/sw1.js
//     bin/app-lock.sh shared $A -- env PROBE_FEATURE=U07 PROBE_AGENT=ccSW1 PROBE_RUN=$R PART=fields,french,saves,rule5,rule4,rule6 \
//       node bin/probe.js $A shared/playwright/checks/U07/SW1/sw1.js
//     bin/app-lock.sh shared $A -- env PROBE_FEATURE=U07 PROBE_AGENT=ccSW1 PROBE_RUN=$R PART=rule7,rule8,rule9,rule9b,rule10,rule11 \
//       node bin/probe.js $A shared/playwright/checks/U07/SW1/sw1.js
//     bin/app-lock.sh shared $A -- env PROBE_FEATURE=U07 PROBE_AGENT=ccSW1 PROBE_RUN=$R PART=permit,a1,masthead,about,a9,a7 \
//       node bin/probe.js $A shared/playwright/checks/U07/SW1/sw1.js
//     # the one part that changes a site-wide setting (the site's "Enable institutional statistics"),
//     # put back to false in a finally:
//     bin/app-lock.sh exclusive $A -- env PROBE_FEATURE=U07 PROBE_AGENT=ccSW1 PROBE_RUN=$R PART=inst \
//       node bin/probe.js $A shared/playwright/checks/U07/SW1/sw1.js
//   done; done
//
// PART=seed must run first in each PROBE_RUN (it writes the state file the others read). Facts land in
// sw1-facts-<run>-<app>.json (one key per leg, merged); snapshots as sw1-<name>-<run>-<app>.json|png.
//
// Seeds per app (all scratch; publicknowledge and the roster are only read):
//   S  main: manager mgr, [OJS OMP] editor ed and production editor pe, section editor se, an
//      assistant-level as, author au, [OJS OMP] reviewer rv, reader rd; masthead members (mh "Does not
//      appear", past = a past Section editor); [OJS OMP] reviewers rvl (review completed last calendar
//      year) and rvt (this year); acronym and country given; announcements and comments on;
//      [OJS OMP] the Information block in the sidebar.
//   F  fresh: no initials, no country, no support contact (UI en+fr_CA, forms en); manager fm.
//   L  English and French forms; manager lm.
//   M  identity: manager mm (also enrolled in L: two journals), m2 (this journal only), author au2;
//      a submitted submission (the managers' task) and a published one.
//   P  "Permit changes to Settings": manager pm, [OJS OMP] editor ped, production editor ppe.
//   A  a context whose manager ticks "Users must be registered and log in…" on screen.
//   N  a context that is not enabled.
//   X  a context where admin holds a Section editor role and its manager role is ended (A1).
//   I  [inst] a context for the Institutions entry.
//
// PARTs:
//   seed     the contexts above
//   menu     manager.maya on publicknowledge: side menu, the five pages (headings, titles, tabs, side tabs,
//            the address each writes), "Contact" reloaded, #setup/privacy and workflow#review by address,
//            an unknown Settings address, the users list's "Edit", the upgrade notice's absence (Rules 1–4b)
//   levels   every roster level: the side menu's "Settings", the five addresses, the About pages' "Edit";
//            signed out the same addresses (Actors row 1, 5)
//   edit     each About page's "Edit" pressed (manager.maya, editor.diana, admin) (Actors row 5)
//   fields   F: Masthead, Contact, Information, Privacy Statement on arrival; refusals client and server
//            side; the notice's lifetime; A3; F's French "Forms" ticked on Setup › Languages (OPS3)
//   french   L: per-language boxes, the language button, "1/2 languages completed", hidden on return,
//            the primary language alone required (Fields; Rule 11)
//   saves    S: a save of each tab by each level that opens the pages (Actors rows 2, 3)
//   rule5    S: unsaved changes across tabs and out of the page
//   rule4    S: "Disable Submissions": the notice on the five pages, after un-ticking (A8)
//   rule6    S vs P vs publicknowledge: one set per journal; the site's privacy page
//   rule7    M: title and initials renamed: header, browser titles, the site's list, the Tasks panel of a
//            manager of two journals and of one; a header logo (the other end)
//   rule8    M: the summary in the site's list and on the home page, the theme option both ends
//   rule9    M: the Contact tab filled; the Contact page
//   rule9b   M: the senders of the Submission Confirmation (the wizard's submit) and of "Publication Published"
//            (publish from the workflow), after rule9's contact change
//   rule10   M: the fields readers never see, filled with markers; the public pages searched; "How to Cite"
//   rule11   L: the French pages' fallback to the primary language
//   permit   P: the Roles grid, the Editor / Production editor rows' "Permit changes to Settings" unticked
//            on screen; those members' side menu, Settings addresses, Announcements, Comments,
//            Institutions, the About pages' "Edit" (A2)
//   a1       X: admin without a manager role (A1)
//   masthead S: Actors row 6 (listed, hidden, past, reviewers), the reviewers box, the enrollment box off
//   about    Actors row 4: the About pages signed out and as a reader; N signed out; A after its manager
//            ticks the sign-in box
//   a9       publicknowledge "Information For Readers": the "Privacy Statement" link pressed (A9)
//   a7       side tabs reloaded on every Settings page and on Administration › Site Settings (A7)
//   inst     site box off/on (POST site, put back), the journal's box on screen; payments on OJS (Rule 3)
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outFile, sql, drainJobs} =
    require('../../../probe');

const RUN = process.env.PROBE_RUN || 'r0';
const ALL = ['seed', 'menu', 'levels', 'edit', 'fields', 'french', 'saves', 'rule5', 'rule4', 'rule6', 'rule7', 'rule8', 'rule9', 'rule9b', 'rule10', 'rule11', 'permit', 'a1', 'masthead', 'about', 'a9', 'a7'];
const PARTS = (process.env.PART || ALL.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const on = (p) => PARTS.includes(p);
const T = 30_000;
const HASH_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 600) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const rel = (u) => String(u || '').replace(/^https?:\/\/[^/]+/, '');
const SLUGS = ['context', 'website', 'workflow', 'distribution', 'access'];
const DENIED_ROLE = /does not have access to this operation/i;
const LAST_YEAR = new Date().getFullYear() - 1;
const ENROLL = 'Present a masthead based on user enrollments';
const REVBOX = 'Enable listing of reviewers on the masthead';

forEachApp(async (app) => {
    const isOjs = app.name === 'ojs', isOmp = app.name === 'omp', isOps = app.name === 'ops';
    const PK = app.contextPath;
    const ctxWord = {ojs: 'Journal', omp: 'Press', ops: 'Server'}[app.name];
    const log = (...a) => console.log(`[sw1 ${RUN} ${app.name}]`, new Date().toISOString().slice(11, 19), ...a);
    const fact = (k, v) => { record('sw1-facts', {[k]: v}, {merge: true}); log(k, JSON.stringify(v).slice(0, 1500)); };
    const cu = (ctx, p = '') => app.url(`/index.php/${ctx}${p}`);
    const stateFile = outFile('sw1-state.json');
    await app.api.bootstrapProbe(PK);

    // ── seed ────────────────────────────────────────────────────────────────
    let st = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : null;
    if (on('seed') || !st) {
        const t = tag('hksw1');
        const P = (s) => `${t}${s}`;
        const sec = isOjs ? ['ART'] : isOps ? ['PRE'] : undefined;
        const usersS = [
            {username: P('mgr'), roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
            {username: P('se'), roles: ['sectionEditor'], givenName: 'Sam', familyName: 'Subeditor', ...(sec ? {sections: sec} : {})},
            {username: P('as'), roles: [isOps ? 'editorialBoardMember' : 'copyeditor'], givenName: 'Asa', familyName: 'Assistant'},
            {username: P('au'), roles: ['author'], givenName: 'Ada', familyName: 'Author'},
            {username: P('rd'), roles: ['reader'], givenName: 'Rita', familyName: 'Reader'},
            {username: P('mh'), roles: ['sectionEditor'], givenName: 'Hana', familyName: 'Hidden', masthead: {sectionEditor: false}},
            {username: P('past'), roles: ['reader'], givenName: 'Paul', familyName: 'Pastmember', pastRoles: [{role: 'sectionEditor'}]},
        ];
        if (!isOps) {
            usersS.push({username: P('ed'), roles: ['editor'], givenName: 'Eve', familyName: 'Editor'});
            usersS.push({username: P('pe'), roles: ['productionEditor'], givenName: 'Pat', familyName: 'Production'});
            usersS.push({username: P('rv'), roles: ['externalReviewer'], givenName: 'Rex', familyName: 'Reviewer'});
            usersS.push({username: P('rvl'), roles: ['externalReviewer'], givenName: 'Lara', familyName: 'Lastyear'});
            usersS.push({username: P('rvt'), roles: ['externalReviewer'], givenName: 'Tom', familyName: 'Thisyear'});
        }
        const S = await app.api.createContext({tag: P('s'), context: {name: `SW1 S ${t}`, acronym: 'SWS', country: 'CA'}, users: usersS,
            enableAnnouncements: true, enablePublicComments: true, ...(isOps ? {} : {sidebar: ['informationblockplugin']})});
        if (!isOps) {
            await app.api.createSubmission({tag: P('sr'), context: P('s'), submitter: P('au'), title: `SW1 reviewed ${t}`,
                decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [
                    {username: P('rvl'), status: 'completed', dateCompleted: `${LAST_YEAR}-06-15`},
                    {username: P('rvt'), status: 'completed'},
                ]}]});
        }
        const F = await app.api.createContext({tag: P('f'), context: {name: `SW1 F ${t}`, supportedLocales: ['en', 'fr_CA']},
            users: [{username: P('fm'), roles: ['manager'], givenName: 'Fern', familyName: 'Fresh'}]});
        const L = await app.api.createContext({tag: P('l'), context: {name: `SW1 L ${t}`, acronym: 'SWL', country: 'CA', supportedLocales: ['en', 'fr_CA'], supportedFormLocales: ['en', 'fr_CA']},
            users: [{username: P('lm'), roles: ['manager'], givenName: 'Lea', familyName: 'Lang'}]});
        const M = await app.api.createContext({tag: P('m'), context: {name: `SW1 M ${t}`, acronym: 'SWM', country: 'CA'},
            users: [
                {username: P('mm'), roles: ['manager'], givenName: 'Max', familyName: 'Multi'},
                {username: P('m2'), roles: ['manager'], givenName: 'Solo', familyName: 'Manager'},
                {username: P('au2'), roles: ['author'], givenName: 'Aria', familyName: 'Author'},
            ]});
        // mm also manages L: an account with roles in two journals
        await app.api.createContext({tag: P('l2'), context: {name: `SW1 L2 ${t}`, acronym: 'SWL2', country: 'CA'},
            users: [{username: P('mm'), roles: ['manager']}]});
        const subM = await app.api.createSubmission({tag: P('ms'), context: P('m'), submitter: P('au2'), title: `SW1 task ${t}`, submitted: true});
        const pubM = await app.api.createSubmission({tag: P('mp'), context: P('m'), submitter: P('au2'), title: `SW1 published ${t}`, submitted: true, published: true});
        const pUsers = [{username: P('pm'), roles: ['manager'], givenName: 'Pia', familyName: 'Manager'}];
        if (!isOps) {
            pUsers.push({username: P('ped'), roles: ['editor'], givenName: 'Ed', familyName: 'Nopermit'});
            pUsers.push({username: P('ppe'), roles: ['productionEditor'], givenName: 'Pe', familyName: 'Nopermit'});
        }
        const Pc = await app.api.createContext({tag: P('p'), context: {name: `SW1 P ${t}`, acronym: 'SWP', country: 'CA'}, users: pUsers, enableAnnouncements: true, enablePublicComments: true,
            ...(isOps ? {} : {sidebar: ['informationblockplugin']})});
        const A = await app.api.createContext({tag: P('a'), context: {name: `SW1 A ${t}`, acronym: 'SWA', country: 'CA'}, users: [{username: P('am'), roles: ['manager'], givenName: 'Ari', familyName: 'Manager'}]});
        const N = await app.api.createContext({tag: P('n'), context: {name: `SW1 N ${t}`, enabled: false}, users: [{username: P('nm'), roles: ['manager']}]});
        const X = await app.api.createContext({tag: P('x'), context: {name: `SW1 X ${t}`, acronym: 'SWX', country: 'CA'},
            users: [{username: P('xm'), roles: ['manager'], givenName: 'Xia', familyName: 'Manager'}, {username: 'admin', roles: ['sectionEditor']}]});
        st = {t, S: P('s'), F: P('f'), L: P('l'), M: P('m'), L2: P('l2'), P: P('p'), A: P('a'), N: P('n'), X: P('x'),
            ids: {S: S.contextId, F: F.contextId, L: L.contextId, M: M.contextId, P: Pc.contextId, A: A.contextId, N: N.contextId, X: X.contextId},
            subM: subM.submissionId, pubM: pubM.submissionId,
            u: Object.fromEntries(['mgr', 'se', 'as', 'au', 'rd', 'mh', 'past', 'ed', 'pe', 'rv', 'rvl', 'rvt', 'fm', 'lm', 'mm', 'm2', 'au2', 'pm', 'ped', 'ppe', 'am', 'nm', 'xm'].map((k) => [k, P(k)]))};
        // X: end admin's manager role there (no screen ends an administrator's last role; the Section editor role stays)
        const ctxT = isOjs ? 'journals' : isOmp ? 'presses' : 'servers';
        const ctxC = isOjs ? 'journal_id' : isOmp ? 'press_id' : 'server_id';
        st.xEnded = sql(app, `update user_user_groups set date_end = now() - interval '1 day' where user_id = (select user_id from users where username='admin') and user_group_id in (select user_group_id from user_groups where context_id = ${Number(X.contextId)} and role_id = 16) returning user_group_id`);
        st.xRoles = sql(app, `select ug.role_id || ' ' || coalesce(uug.date_end::text, 'open') from user_user_groups uug join user_groups ug using (user_group_id) where uug.user_id = (select user_id from users where username='admin') and ug.context_id = ${Number(X.contextId)}`);
        void ctxT; void ctxC;
        fs.writeFileSync(stateFile, JSON.stringify(st, null, 2));
        fact('seed', st);
    }
    const U = st.u;

    // ── the browser ─────────────────────────────────────────────────────────
    const {page, close} = await launch(app);
    const dialogs = [];
    page.on('dialog', async (d) => {
        dialogs.push({t: Date.now(), type: d.type(), msg: d.message(), url: rel(page.url())});
        await d.accept().catch(() => {});
    });
    const since = (arr, t0) => arr.filter((x) => x.t >= t0).map(({t, ...x}) => x);
    const as = async (u, ctx) => {
        if (!u) { await signOut(page).catch(() => {}); return; }
        await signIn(page, u, {contextPath: ctx}); await idle(page).catch(() => {});
    };
    const snap = async (name, extra = {}) => {
        let s;
        try { s = await screen(page); } catch (e) { s = {url: page.url(), title: await page.title().catch(() => null), error: flat(e.message, 300)}; }
        record(`sw1-${name}`, {...s, ...extra});
        await shot(page, `sw1-${name}`).catch(() => {});
        return s;
    };
    const nav = () => page.getByRole('navigation', {name: 'Site Navigation'});
    const readNav = async () => {
        if (!(await nav().count().catch(() => 0))) return {present: false, groups: [], settings: null};
        const groups = await nav().locator('[role="button"][aria-controls]').evaluateAll((els) => els.map((e) => {
            const region = document.getElementById(e.getAttribute('aria-controls') || '');
            const items = region ? [...region.querySelectorAll('[role="treeitem"]')].map((li) => ({label: li.getAttribute('aria-label') || li.textContent.replace(/\s+/g, ' ').trim(), href: (li.querySelector('a') || {}).getAttribute ? li.querySelector('a').getAttribute('href') : null})) : [];
            const link = e.querySelector('a');
            return {label: e.getAttribute('aria-label') || e.textContent.replace(/\s+/g, ' ').trim(), href: link ? link.getAttribute('href') : null, items};
        })).catch(() => []);
        const s = groups.find((g) => /^Settings$/.test(g.label));
        return {present: true, groups: groups.map((g) => `${g.label}${g.items.length ? ' › ' + g.items.map((i) => i.label).join(', ') : ''}`), settings: s ? s.items.map((i) => i.label) : null, raw: groups};
    };
    const bodyText = async () => (await page.locator('body').innerText().catch(() => '')) || '';
    const classify = async () => {
        const text = await bodyText();
        const url = page.url();
        return {
            url: rel(url), title: await page.title().catch(() => null),
            h1: (await page.locator('main h1, h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 120)),
            login: /\/login(\b|\?|$)/.test(url) && (await page.locator('input[name="username"], #username').count()) > 0,
            deniedRole: DENIED_ROLE.test(text), deniedPlain: /Access denied\./.test(text), notFound: /404 Not Found/i.test(text),
            tabs: (await page.getByRole('tab').allInnerTexts().catch(() => [])).map((x) => flat(x, 60)),
        };
    };
    const verdict = (c) => (c.login ? 'LOGIN' : c.deniedRole ? 'DENIED' : c.deniedPlain ? 'ACCESS-DENIED' : c.notFound ? '404' : `H1:${(c.h1 || []).join('/')}`);
    const dismissErrorDialog = async () => {
        const dlg = page.getByRole('dialog', {name: 'Error'});
        if (!(await dlg.count().catch(() => 0))) return null;
        const text = flat(await dlg.innerText().catch(() => ''), 300);
        await dlg.getByRole('button', {name: 'OK', exact: true}).click().catch(() => {});
        await dlg.waitFor({state: 'hidden', timeout: 5000}).catch(() => {});
        return text;
    };
    const dashboard = async (ctx, name) => {
        const resp = await page.goto(cu(ctx, '/submissions')).catch(() => null);
        await idle(page).catch(() => {});
        await sleep(400);
        const errorDialog = await dismissErrorDialog();
        const n = await readNav();
        await snap(name, {nav: n, errorDialog});
        return {status: resp ? resp.status() : null, url: rel(page.url()), errorDialog, nav: n};
    };
    const selectedTabs = () => page.locator('[role="tab"][aria-selected="true"]').evaluateAll((els) => els.filter((e) => e.offsetParent !== null).map((e) => e.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
    const tabBtn = (id) => page.locator(`[id="${id}-button"]`).first();
    const pressTab = async (id) => { await tabBtn(id).click(); await idle(page).catch(() => {}); await sleep(600); };
    const sideTab = async (name) => { await page.getByRole('tab', {name, exact: true}).filter({visible: true}).first().click(); await idle(page).catch(() => {}); await sleep(600); };
    const pressSide = async (name) => {
        const link = nav().getByRole('link', {name, exact: true}).first();
        if (!(await link.isVisible().catch(() => false))) {
            await nav().getByRole('button', {name: 'Settings', exact: true}).first().click().catch(() => {});
            await sleep(400);
        }
        await link.click();
        await page.waitForLoadState('load').catch(() => {});
        await idle(page).catch(() => {});
        await sleep(600);
    };
    const editLinks = async () => page.locator('a').evaluateAll((as_) => as_
        .filter((a) => /(^|\s)Edit(\s|$)/.test(a.innerText) || /management\/settings/.test(a.getAttribute('href') || ''))
        .map((a) => ({text: a.innerText.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href'), cls: a.className, sr: (a.querySelector('.-screenReader, .pkp_screen_reader') || {}).innerText || null}))).catch(() => []);
    const aboutPaths = (ctx) => {
        const p = [['about', '/about'], ['history', '/about/editorialHistory'], ['contact', '/about/contact'], ['masthead', '/about/editorialMasthead'], ['privacy', '/about/privacy'], ['software', '/about/aboutThisPublishingSystem']];
        if (!isOps) p.push(['readers', '/information/readers'], ['authors', '/information/authors'], ['librarians', '/information/librarians']);
        return p.map(([k, x]) => [k, cu(ctx, x)]);
    };
    // TinyMCE
    const waitMce = (id) => page.waitForFunction((i) => !!(window.tinymce && window.tinymce.get(i) && window.tinymce.get(i).initialized), id, {timeout: T});
    const waitAllMce = async () => {
        await page.waitForFunction(() => {
            if (!window.tinymce) return true;
            const eds = window.tinymce.get ? window.tinymce.get() : window.tinymce.editors;
            return [...(eds || [])].every((e) => e.initialized);
        }, undefined, {timeout: T}).catch(() => {});
        await sleep(300);
    };
    const mceGet = (id) => page.evaluate((i) => (window.tinymce && window.tinymce.get(i) ? window.tinymce.get(i).getContent() : null), id).catch(() => null);
    const mceType = async (id, text, {replace = true} = {}) => {
        await waitMce(id);
        const body = page.frameLocator(`[id="${id}_ifr"]`).locator('body');
        await body.click();
        if (replace) { await page.keyboard.press('Control+a'); await page.keyboard.press('Delete'); } else { await page.keyboard.press('Control+End'); }
        if (text) await page.keyboard.type(text);
        await sleep(300);
        return mceGet(id);
    };
    // Settings › Journal tabs
    const FORM_ANCHOR = {masthead: '[id^="masthead-name-control"]', contact: '#contact-contactName-control'};
    const formOf = (which) => page.locator('form').filter({has: page.locator(FORM_ANCHOR[which])}).first();
    const openCtxTab = async (ctx, which, {lang} = {}) => {
        await page.goto(cu(ctx, `${lang ? `/${lang}` : ''}/management/settings/context`));
        await idle(page).catch(() => {});
        const tb = tabBtn(which);
        await tb.waitFor({timeout: T});
        if ((await tb.getAttribute('aria-selected')) !== 'true') await tb.click();
        await page.locator(FORM_ANCHOR[which]).first().waitFor({state: 'visible', timeout: T});
        await idle(page).catch(() => {});
        await waitAllMce();
        return formOf(which);
    };
    // Settings › Website › Setup side tabs
    const openWebsiteSide = async (ctx, side) => {
        await page.goto(cu(ctx, '/management/settings/website'));
        await idle(page).catch(() => {});
        await pressTab('setup');
        if (side) { await tabBtn(side).click(); await idle(page).catch(() => {}); await sleep(600); }
        await waitAllMce();
        return page.locator(`[id="${side || 'setup'}"] form`).first();
    };
    const formShape = async (f) => {
        const shape = await f.evaluate((el) => {
            const t = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const fieldOf = (ff) => ({
                label: t(ff.querySelector('.pkpFormFieldLabel, label, legend')),
                required: !!ff.querySelector('.pkpFormFieldLabel__required, [aria-required="true"], [required]'),
                description: t(ff.querySelector('.pkpFormField__description')),
                error: t(ff.querySelector('.pkpFieldError')),
                controls: [...ff.querySelectorAll('input:not([type=hidden]), textarea, select')].map((c) => ({
                    id: c.id, tag: c.tagName, type: c.type, visible: !!(c.offsetParent || (c.tagName === 'TEXTAREA' && c.closest('.pkpFormField') && c.closest('.pkpFormField').offsetParent)),
                    value: c.tagName === 'SELECT' ? c.value : (c.value || '').slice(0, 300),
                    selectedLabel: c.tagName === 'SELECT' ? (c.selectedOptions[0] || {}).label : undefined,
                    options: c.tagName === 'SELECT' ? c.options.length : undefined,
                    firstOptions: c.tagName === 'SELECT' ? [...c.options].slice(0, 3).map((o) => o.label) : undefined,
                    lastOption: c.tagName === 'SELECT' ? (c.options[c.options.length - 1] || {}).label : undefined,
                    emptyOption: c.tagName === 'SELECT' ? [...c.options].some((o) => o.value === '') : undefined,
                    rows: c.rows || undefined,
                })),
                toolbar: [...ff.querySelectorAll('.tox-tbtn, .tox-split-button')].map((b) => b.getAttribute('aria-label') || b.title),
                text: (t(ff) || '').slice(0, 400),
            });
            const groups = [...el.querySelectorAll('.pkpFormGroup')].map((g) => ({
                heading: t(g.querySelector('.pkpFormGroup__heading, legend')),
                description: t(g.querySelector('.pkpFormGroup__description')),
                fields: [...g.querySelectorAll('.pkpFormField')].map(fieldOf),
            }));
            const buttons = [...el.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => ({text: t(b), disabled: b.disabled, pressed: b.getAttribute('aria-pressed')}));
            const footer = t(el.querySelector('.pkpFormPage__footer, .pkpFormFooter'));
            return {groups, buttons, footer, text: (t(el) || '').slice(0, 4000)};
        });
        shape.rich = {};
        for (const id of await f.locator('textarea').evaluateAll((els) => els.map((e) => e.id).filter(Boolean))) {
            const v = await mceGet(id);
            if (v !== null) shape.rich[id] = v.slice(0, 600);
        }
        return shape;
    };
    const refusalState = async (f) => {
        const flagged = await f.locator('.pkpFormField').filter({has: page.locator('.pkpFieldError')}).evaluateAll((els) => els.map((e) => ({
            label: ((e.querySelector('.pkpFormFieldLabel, label, legend') || {}).innerText || '').replace(/\s+/g, ' ').trim(),
            error: ((e.querySelector('.pkpFieldError') || {}).innerText || '').replace(/\s+/g, ' ').trim(),
            ids: [...e.querySelectorAll('input,textarea,select')].map((c) => c.id),
        }))).catch(() => []);
        const save = f.getByRole('button', {name: 'Save', exact: true});
        return {
            flagged, saveDisabled: await save.isDisabled().catch(() => null),
            jump: await f.getByRole('button', {name: 'Jump to next error'}).count(),
            goTo: (await f.locator('.pkpFormErrors button, .pkpFormErrors a').allInnerTexts().catch(() => [])).map((x) => flat(x, 160)),
            footer: flat(await f.locator('.pkpFormPage__footer').innerText().catch(() => ''), 500),
            notices: (await page.locator('.app__notifications .pkpNotification').allInnerTexts().catch(() => [])).map((x) => flat(x, 300)),
            status: (await page.locator('.pkpFormPage__status, [role="status"]').allInnerTexts().catch(() => [])).map((s) => flat(s, 100)).filter(Boolean),
        };
    };
    const pressSave = async (f, {noticeWatch = false} = {}) => {
        const reqs = [];
        const onReq = (r) => { if (/\/api\/v1\/contexts\//.test(r.url()) && r.method() !== 'GET') reqs.push({method: r.method(), url: rel(r.url()), override: r.headers()['x-http-method-override'] || null}); };
        page.on('request', onReq);
        const save = f.getByRole('button', {name: 'Save', exact: true});
        const disabledBefore = await save.isDisabled().catch(() => null);
        const w = page.waitForResponse((r) => /\/api\/v1\/contexts\//.test(r.url()) && r.request().method() !== 'GET', {timeout: 6000}).catch(() => null);
        if (!disabledBefore) await save.click().catch(() => {});
        const resp = await w;
        let body;
        if (resp && resp.status() >= 400) { try { body = await resp.json(); } catch { body = null; } }
        let saved = false;
        if (resp && resp.ok()) saved = await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
        let noticeTimeline;
        if (noticeWatch && resp) {
            noticeTimeline = [];
            const t0 = Date.now();
            await page.mouse.move(5, 890);
            while (Date.now() - t0 < 14_000) {
                const n = (await page.locator('.app__notifications .pkpNotification').allInnerTexts().catch(() => [])).map((x) => flat(x, 200));
                noticeTimeline.push({ms: Date.now() - t0, n: n.length, text: n[0] || null});
                await sleep(1000);
            }
        } else await sleep(600);
        page.off('request', onReq);
        return {disabledBefore, requests: reqs, status: resp ? resp.status() : null, saved, body, noticeTimeline, ...(await refusalState(f))};
    };
    const pub = async (url, name, {markers = [], shotIt = true} = {}) => {
        let resp = null;
        try { resp = await page.goto(url); } catch (e) { return {error: flat(e.message, 200)}; }
        await idle(page).catch(() => {});
        const data = await page.evaluate((marks) => {
            const txt = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : null);
            const main = document.querySelector('.pkp_structure_main') || document.body;
            const html = document.documentElement.outerHTML.toLowerCase();
            const head = document.head.innerHTML;
            const vis = document.body.innerText.toLowerCase();
            const hits = {};
            for (const m of marks) {
                const low = m.toLowerCase();
                hits[m] = {visible: vis.includes(low), html: html.includes(low), headLines: head.split('\n').filter((l) => l.toLowerCase().includes(low)).map((l) => l.trim()).slice(0, 4)};
            }
            return {
                siteName: txt(document.querySelector('.pkp_site_name')),
                siteNameHtml: ((document.querySelector('.pkp_site_name') || {}).innerHTML || '').replace(/\s+/g, ' ').slice(0, 400),
                h1: [...document.querySelectorAll('h1')].map(txt),
                mainText: (txt(main) || '').slice(0, 3000),
                hits,
            };
        }, markers).catch((e) => ({error: flat(e.message, 200)}));
        const out = {status: resp ? resp.status() : null, url: rel(page.url()), title: await page.title().catch(() => null), ...data};
        let s;
        try { s = await screen(page); } catch (e) { s = {error: flat(e.message, 200)}; }
        record(`sw1-${name}`, {...s, extracted: out});
        if (shotIt) await shot(page, `sw1-${name}`).catch(() => {});
        return out;
    };
    const mailsTo = async (to, sinceD) => {
        const r = await app.mail._search({to, since: sinceD}).catch(() => ({messages: []}));
        return (r.messages || []).map((m) => ({id: m.ID, from: m.From, subject: m.Subject, created: m.Created}));
    };
    const step = async (name, fn) => {
        if (!on(name)) return;
        log(`part ${name} start`);
        try { await fn(); } catch (e) {
            fact(`${name}-ERROR`, {error: flat(e.stack || e.message, 1500), url: rel(page.url())});
            await shot(page, `sw1-err-${name}`).catch(() => {});
            await signOut(page).catch(() => {});
        }
        log(`part ${name} end`);
    };

    // A tab tree of a Settings page: top tabs; for each, its side tabs and the address after each click.
    const readTabTree = async ({reloadSide = false} = {}) => {
        const topTabs = await page.locator('[role="tab"]').evaluateAll((els) => els
            .filter((e) => !e.parentElement.closest('[role="tabpanel"]'))
            .map((e) => ({id: e.id, text: e.innerText.replace(/\s+/g, ' ').trim(), controls: e.getAttribute('aria-controls')})));
        const tree = [];
        const base = page.url().replace(/#.*$/, '');
        for (const tt of topTabs) {
            await page.locator(`[id="${tt.id}"]`).first().click().catch(() => {});
            await idle(page).catch(() => {});
            await sleep(HASH_MS);
            const entry = {tab: tt.text, id: tt.id, hash: new URL(page.url()).hash};
            entry.sideTabs = await page.locator(`[id="${tt.controls}"]`).first().evaluate((panel) => [...panel.querySelectorAll('[role="tab"]')]
                .filter((e) => e.parentElement.closest('[role="tabpanel"]') === panel)
                .map((e) => ({id: e.id, text: e.innerText.replace(/\s+/g, ' ').trim(), controls: e.getAttribute('aria-controls')}))).catch(() => []);
            for (const s of entry.sideTabs) {
                if (reloadSide) {
                    // land the page afresh on the top tab, then press the side tab
                    await page.goto(`${base}#${tt.id.replace(/-button$/, '')}`).catch(() => {});
                    await page.reload().catch(() => {});
                    await idle(page).catch(() => {});
                    await page.locator(`[id="${tt.id}"]`).first().click().catch(() => {});
                    await idle(page).catch(() => {});
                    await sleep(500);
                }
                await page.locator(`[id="${s.id}"]`).first().click().catch(() => {});
                await idle(page).catch(() => {});
                await sleep(HASH_MS);
                s.hash = new URL(page.url()).hash;
                s.selected = await selectedTabs();
                if (reloadSide) {
                    await page.reload().catch(() => {});
                    await idle(page).catch(() => {});
                    await sleep(800);
                    s.afterReload = {hash: new URL(page.url()).hash, selected: await selectedTabs()};
                    // the same address typed both ways (#top/side)
                }
            }
            if (reloadSide) {
                await page.goto(`${base}#${tt.id.replace(/-button$/, '')}`).catch(() => {});
                await page.reload().catch(() => {});
                await idle(page).catch(() => {});
                await sleep(600);
                entry.topReload = {hash: new URL(page.url()).hash, selected: await selectedTabs()};
            }
            tree.push(entry);
        }
        return tree;
    };

    try {
        // ── menu (Rules 1–4b) ───────────────────────────────────────────────
        await step('menu', async () => {
            await as('manager.maya', PK);
            const d = await dashboard(PK, 'menu-mgr-dashboard');
            const out = {settingsGroup: d.nav.settings, groups: d.nav.groups, pages: {}};
            await loc(page, 'Side menu: the "Settings" group header', nav().getByRole('button', {name: 'Settings', exact: true}));
            for (const label of (d.nav.settings || [])) {
                await page.goto(cu(PK, '/submissions')); await idle(page).catch(() => {});
                await pressSide(label);
                const c = await classify();
                const nm = `menu-mgr-page-${label.replace(/\W+/g, '')}`;
                await snap(nm);
                const tree = await readTabTree();
                out.pages[label] = {url: c.url, title: c.title, h1: c.h1, notices: flat((await page.locator('main').innerText().catch(() => '')).split('\n').slice(0, 3).join(' | '), 300),
                    tree: tree.map((x) => ({tab: x.tab, hash: x.hash, side: x.sideTabs.map((s) => `${s.text}=${s.hash}`)}))};
            }
            fact('menu', out);
            // Rule 1: "Contact" reloaded; a side tab reloaded; #setup/privacy; workflow#review
            const r1 = {};
            await page.goto(cu(PK, '/management/settings/context')); await idle(page).catch(() => {});
            r1.headingContext = (await page.locator('main h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 80));
            r1.upgradeNotice = ((await bodyText()).match(/new version of[^\n]*/i) || [null])[0];
            r1.noticesOnJournal = (await page.locator('main .pkpNotification, main [role="alert"], main .notification').allInnerTexts().catch(() => [])).map((x) => flat(x, 200));
            await pressTab('contact');
            await sleep(HASH_MS);
            r1.contactHash = new URL(page.url()).hash;
            await page.reload(); await idle(page).catch(() => {}); await sleep(600);
            r1.contactAfterReload = {hash: new URL(page.url()).hash, selected: await selectedTabs()};
            await snap('menu-contact-after-reload', r1.contactAfterReload);
            await openWebsiteSide(PK, 'privacy');
            await sleep(HASH_MS);
            r1.privacyHash = new URL(page.url()).hash;
            await page.reload(); await idle(page).catch(() => {}); await sleep(800);
            r1.privacyAfterReload = {hash: new URL(page.url()).hash, selected: await selectedTabs()};
            await snap('menu-privacy-after-reload', r1.privacyAfterReload);
            for (const [k, addr] of [['setupPrivacy', '/management/settings/website#setup/privacy'], ['setupInformation', '/management/settings/website#setup/information'], ['workflowReview', '/management/settings/workflow#review'], ['privacyBare', '/management/settings/website#privacy']]) {
                await page.goto(cu(PK, '/submissions')); await idle(page).catch(() => {});
                await page.goto(cu(PK, addr)); await idle(page).catch(() => {}); await sleep(HASH_MS);
                r1[k] = {hash: new URL(page.url()).hash, selected: await selectedTabs()};
                await snap(`menu-direct-${k}`, r1[k]);
            }
            // Rule 3: unknown address; Announcements / Institutions / Comments addresses on publicknowledge
            for (const slug of ['nothing', 'announcements', 'institutions', 'userComments']) {
                const r = await page.goto(cu(PK, `/management/settings/${slug}`)).catch(() => null);
                await idle(page).catch(() => {});
                const err = await dismissErrorDialog();
                await snap(`menu-rule3-${slug}`);
                r1[`addr-${slug}`] = {status: r ? r.status() : null, errorDialog: err, ...(await classify())};
                delete r1[`addr-${slug}`].tabs;
            }
            // Rule 3: a user's "Edit" in the users list
            await page.goto(cu(PK, '/management/settings/access')); await idle(page).catch(() => {});
            const row = page.getByRole('row', {name: /Rosa Reader|reader\.rosa/}).first();
            const ue = {rowCount: await row.count()};
            if (ue.rowCount) {
                await row.getByRole('button').last().click();
                await idle(page).catch(() => {});
                ue.menu = await page.getByRole('menuitem').allInnerTexts().catch(() => []);
                await page.getByRole('menuitem', {name: 'Edit'}).first().click().catch(() => {});
                await page.waitForURL(/management\/settings\/user/, {timeout: 15_000}).catch(() => {});
                await idle(page).catch(() => {});
                ue.url = rel(page.url());
                ue.h1 = (await page.locator('main h1, h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 100));
                ue.text = flat(await page.locator('main').innerText().catch(() => ''), 800);
                await snap('menu-users-edit', ue);
            }
            r1.usersEdit = ue;
            fact('menu-rule1-3', r1);
            await as(null);
        });

        // ── levels (Actors row 1, 5) ────────────────────────────────────────
        await step('levels', async () => {
            const roster = ['admin', 'manager.maya', ...(isOps ? [] : ['editor.diana']), 'sectioneditor.ana', 'assistant.rita', ...(isOps ? [] : ['copyeditor.carla', 'reviewer.julia']), 'author.alex', 'reader.rosa'];
            const res = {};
            const levelRead = async (u, ctx, key) => {
                await as(u, ctx);
                const landing = rel(page.url());
                const d = await dashboard(ctx, `levels-${key}-dashboard`);
                const settings = {};
                for (const slug of SLUGS) {
                    const r = await page.goto(cu(ctx, `/management/settings/${slug}`)).catch(() => null);
                    await idle(page).catch(() => {});
                    await snap(`levels-${key}-settings-${slug}`);
                    const c = await classify();
                    settings[slug] = `${r ? r.status() : '?'} ${verdict(c)} ${c.url}`;
                }
                const edit = {};
                for (const [k, url] of aboutPaths(ctx)) {
                    await page.goto(url).catch(() => {}); await idle(page).catch(() => {});
                    await snap(`levels-${key}-about-${k}`);
                    edit[k] = (await editLinks()).map((e) => `${e.text} -> ${rel(e.href)}`);
                }
                await as(null);
                return {landing, settingsGroup: d.nav.settings, groups: d.nav.groups, errorDialog: d.errorDialog, settings, edit};
            };
            for (const u of roster) res[u] = await levelRead(u, PK, u.replace(/\W+/g, ''));
            if (!isOps) res.productionEditor = await levelRead(U.pe, st.S, 'pe');
            // signed out
            const so = {};
            await as(null);
            for (const slug of SLUGS) {
                const r = await page.goto(cu(PK, `/management/settings/${slug}`)).catch(() => null);
                await idle(page).catch(() => {});
                await snap(`levels-anon-settings-${slug}`);
                const c = await classify();
                so[slug] = `${r ? r.status() : '?'} ${verdict(c)} ${c.url}`;
            }
            so.edit = {};
            for (const [k, url] of aboutPaths(PK)) {
                await page.goto(url).catch(() => {}); await idle(page).catch(() => {});
                so.edit[k] = (await editLinks()).map((e) => `${e.text} -> ${rel(e.href)}`);
            }
            res.signedOut = so;
            fact('levels', res);
        });

        // ── edit (Actors row 5; Rule 21 as far as the row) ──────────────────
        await step('edit', async () => {
            const res = {};
            const who = [['manager.maya', PK], ...(isOps ? [] : [['editor.diana', PK]]), ['admin', PK]];
            for (const [u, ctx] of who) {
                await as(u, ctx);
                for (const [k, url] of aboutPaths(ctx)) {
                    await page.goto(url); await idle(page).catch(() => {});
                    const links = await editLinks();
                    const r = {links: links.map((e) => `${e.text} [${e.sr}] -> ${rel(e.href)}`)};
                    const link = page.locator('a.cmp_edit_link').first();
                    if (await link.count()) {
                        if (u === 'manager.maya') await loc(page, `"Edit" link on ${k}`, link);
                        const pagesBefore = page.context().pages().length;
                        await link.click();
                        await page.waitForLoadState('load').catch(() => {});
                        await idle(page).catch(() => {});
                        await sleep(HASH_MS);
                        r.newTab = page.context().pages().length > pagesBefore;
                        r.landed = rel(page.url());
                        r.selected = await selectedTabs();
                        r.h1 = (await page.locator('main h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 80));
                        await snap(`edit-${u.replace(/\W+/g, '')}-${k}-landed`, r);
                    }
                    res[`${u}:${k}`] = r;
                }
                await as(null);
            }
            fact('edit', res);
        });

        // ── fields (Fields & validation; A3; OPS3 via the grid) ─────────────
        await step('fields', async () => {
            const o = {};
            await as(U.fm, st.F);
            // Masthead on arrival
            let f = await openCtxTab(st.F, 'masthead');
            o.pageTabs = (await page.getByRole('tab').allInnerTexts()).map((x) => flat(x, 50));
            o.h1 = (await page.locator('main h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 80));
            o.masthead = await formShape(f);
            await snap('fields-f-masthead-arrival', {shape: o.masthead});
            await loc(page, 'Masthead: "Save"', f.getByRole('button', {name: 'Save', exact: true}));
            await loc(page, 'Masthead: the title box (primary language)', page.locator('[id^="masthead-name-control"]').first());
            await loc(page, 'Masthead: "Country"', page.locator('select[id^="masthead-country-control"]').first());
            // 1. as it stands: initials and country empty
            o.save0 = await pressSave(f);
            await snap('fields-f-masthead-save-as-is', {save: o.save0});
            // Jump to next error: the focus
            const jump = f.getByRole('button', {name: 'Jump to next error'});
            if (await jump.count()) {
                await loc(page, 'Masthead: "Jump to next error"', jump);
                await jump.click(); await sleep(400);
                o.jump1 = await page.evaluate(() => document.activeElement && document.activeElement.id);
                await jump.click().catch(() => {}); await sleep(400);
                o.jump2 = await page.evaluate(() => document.activeElement && document.activeElement.id);
            }
            // 2. initials alone
            await page.locator('[id^="masthead-acronym-control"]').first().fill('SWF');
            await sleep(300);
            o.afterInitials = await refusalState(f);
            o.save1 = await pressSave(f);
            // 3. country picked: Save comes back
            await page.locator('select[id^="masthead-country-control"]').first().selectOption({label: 'Iceland'});
            await sleep(300);
            o.afterCountry = await refusalState(f);
            // 4. [OJS] server-side refusals: ISSN and URL, the notice's lifetime
            if (isOjs) {
                await page.locator('[id^="masthead-onlineIssn-control"]').first().fill('1234-5678');
                await page.locator('[id^="masthead-printIssn-control"]').first().fill('10501234');
                await page.locator('[id^="masthead-publisherUrl-control"]').first().fill('example.org');
                o.save2 = await pressSave(f, {noticeWatch: true});
                await snap('fields-f-masthead-server-refusal', {save: o.save2});
                // the other end: valid values, check digit X; then lower-case x
                await page.locator('[id^="masthead-onlineIssn-control"]').first().fill('0378-5955');
                await page.locator('[id^="masthead-printIssn-control"]').first().fill('1050-124x');
                await page.locator('[id^="masthead-publisherUrl-control"]').first().fill('https://example.org');
                o.afterFix = await refusalState(f);
                o.save3 = await pressSave(f);
                await page.locator('[id^="masthead-printIssn-control"]').first().fill('1050-124X');
            }
            if (isOmp) {
                const ct = page.locator('select[id^="masthead-codeType-control"]').first();
                o.codeType = await ct.evaluate((s) => ({value: s.value, n: s.options.length, first: s.options[0] && s.options[0].label, last: s.options[s.options.length - 1].label, empty: [...s.options].some((x) => x.value === ''), selectedIndex: s.selectedIndex})).catch((e) => ({error: flat(e.message, 100)}));
                await ct.selectOption({label: 'ISNI (16)'}).catch((e) => { o.codeTypeErr = flat(e.message, 100); });
            }
            if (isOps) await page.locator('[id^="masthead-sponsoringOrganization-control"]').first().fill(`Sponsor ${st.t}`).catch((e) => { o.sponsorErr = flat(e.message, 100); });
            o.saveValid = await pressSave(f);
            o.saveValidSamePage = {saved: o.saveValid.saved, status: o.saveValid.status};
            await snap('fields-f-masthead-saved', {save: o.saveValid});
            f = await openCtxTab(st.F, 'masthead');
            o.mastheadReloaded = await formShape(f);
            await snap('fields-f-masthead-reloaded', {shape: o.mastheadReloaded});
            if (isOmp) o.codeTypeAfterSave = await page.locator('select[id^="masthead-codeType-control"]').first().evaluate((s) => ({value: s.value, label: s.selectedOptions[0] && s.selectedOptions[0].label, empty: [...s.options].some((x) => x.value === '')})).catch(() => null);
            // the title emptied: the other end of "required"
            await page.locator('[id^="masthead-name-control"]').first().fill('');
            o.saveNoTitle = await pressSave(f);
            await snap('fields-f-masthead-no-title', {save: o.saveNoTitle});
            // Contact on arrival; A3
            f = await openCtxTab(st.F, 'contact');
            o.contact = await formShape(f);
            await snap('fields-f-contact-arrival', {shape: o.contact});
            await page.locator('#contact-contactPhone-control').fill('+1 555 0142');
            o.cPhoneOnly = await pressSave(f);
            await snap('fields-f-contact-phone-only', {save: o.cPhoneOnly});
            await page.locator('#contact-contactEmail-control').fill('not-an-email');
            o.cBadEmailNoSupport = await pressSave(f);
            await page.locator('#contact-supportName-control').fill('Fay Support');
            await page.locator('#contact-supportEmail-control').fill('also-not-an-email');
            o.cServerRefusal = await pressSave(f, {noticeWatch: true});
            await snap('fields-f-contact-server-refusal', {save: o.cServerRefusal});
            await page.locator('#contact-contactEmail-control').fill(`${st.t}fp@mail.test`);
            await page.locator('#contact-supportEmail-control').fill(`${st.t}fs@mail.test`);
            o.cSaved = await pressSave(f);
            await snap('fields-f-contact-saved', {save: o.cSaved});
            await page.reload(); await idle(page).catch(() => {});
            f = await openCtxTab(st.F, 'contact');
            o.contactReloaded = await formShape(f);
            // Information {OJS OMP} and Privacy Statement on arrival
            await page.goto(cu(st.F, '/management/settings/website')); await idle(page).catch(() => {});
            await pressTab('setup');
            o.setupSideTabs = (await page.locator('#setup [role="tab"]').allInnerTexts().catch(() => [])).map((x) => flat(x, 50));
            if (!isOps) {
                const fi = await openWebsiteSide(st.F, 'information');
                o.information = await formShape(fi);
                await snap('fields-f-information-arrival', {shape: o.information});
            }
            const fp = await openWebsiteSide(st.F, 'privacy');
            o.privacy = await formShape(fp);
            await snap('fields-f-privacy-arrival', {shape: o.privacy});
            // OPS3 (and the OJS/OMP control): French ticked under "Forms" on Setup › Languages
            await openWebsiteSide(st.F, 'languages');
            const frForms = page.locator('input[id^="select-cell-fr_CA-formLocale"]').first();
            o.frFormsBox = {count: await frForms.count(), checked: await frForms.isChecked().catch(() => null)};
            await snap('fields-f-languages', o.frFormsBox);
            if (o.frFormsBox.count && !o.frFormsBox.checked) {
                const w = page.waitForResponse((r) => /save-language-setting/.test(r.url()), {timeout: T}).catch(() => null);
                await frForms.click();
                const r = await w;
                o.frFormsSave = r ? r.status() : null;
                await idle(page).catch(() => {}); await sleep(800);
                await tabBtn('privacy').click(); await idle(page).catch(() => {}); await sleep(600);
                o.frPrivacySamePage = await mceGet('privacy-privacyStatement-control-fr_CA');
                await openWebsiteSide(st.F, 'privacy');
                o.frPrivacyReloaded = await mceGet('privacy-privacyStatement-control-fr_CA');
                await snap('fields-f-privacy-french', {fr: o.frPrivacyReloaded});
                if (!isOps) {
                    await openWebsiteSide(st.F, 'information');
                    o.frInfoReloaded = {readers: (await mceGet('information-readerInformation-control-fr_CA') || '').slice(0, 200)};
                }
            }
            fact('fields', o);
            await as(null);
            // the French privacy page, signed out (OPS3)
            const fp2 = await pub(cu(st.F, '/fr_CA/about/privacy'), 'fields-f-privacy-page-fr');
            fact('fields-privacy-fr-page', {status: fp2.status, h1: fp2.h1, title: fp2.title, main: flat(fp2.mainText, 400)});
        });

        // ── french (Fields "per language"; Rule 11's tab side) ───────────────
        await step('french', async () => {
            const o = {};
            await as(U.lm, st.L);
            let f = await openCtxTab(st.L, 'masthead');
            o.arrival = await formShape(f);
            const frBtn = f.getByRole('button', {name: 'French', exact: true});
            o.frBtn = await frBtn.count();
            o.frVisible0 = await page.locator('[id="masthead-name-control-fr_CA"]').isVisible().catch(() => null);
            o.completed0 = (await f.innerText()).match(/\d+\/\d+ languages completed/g);
            await snap('french-l-masthead-arrival', {frVisible0: o.frVisible0, completed: o.completed0});
            if (o.frBtn) {
                await loc(page, 'Masthead (two form languages): the "French" button', frBtn.first());
                await frBtn.first().click(); await sleep(500);
                o.frVisible1 = await page.locator('[id="masthead-name-control-fr_CA"]').isVisible().catch(() => null);
                o.frLabels = (await f.locator('label').allInnerTexts().catch(() => [])).filter((x) => /French/.test(x)).map((x) => flat(x, 80));
                await snap('french-l-masthead-french-shown', {frVisible1: o.frVisible1, frLabels: o.frLabels});
                // French title and initials emptied, saved: only the primary required?
                await page.locator('[id="masthead-name-control-fr_CA"]').fill('');
                await page.locator('[id="masthead-acronym-control-fr_CA"]').fill('').catch(() => {});
                o.saveFrEmpty = await pressSave(f);
                // the English title emptied
                await page.locator('[id="masthead-name-control-en"]').fill('');
                o.saveEnEmpty = await pressSave(f);
                await snap('french-l-masthead-en-title-empty', {save: o.saveEnEmpty});
                // a tab switch and back: the French boxes hidden again?
                await pressTab('contact');
                o.contactFrVisible0 = await page.locator('[id="contact-contactAffiliation-control-fr_CA"]').isVisible().catch(() => null);
                o.contactCompleted = (await formOf('contact').innerText()).match(/\d+\/\d+ languages completed/g);
                await pressTab('masthead');
                o.frVisibleAfterReturn = await page.locator('[id="masthead-name-control-fr_CA"]').isVisible().catch(() => null);
                o.enTitleAfterReturn = await page.locator('[id="masthead-name-control-en"]').inputValue().catch(() => null);
                await snap('french-l-masthead-after-return', {frVisibleAfterReturn: o.frVisibleAfterReturn});
                f = await openCtxTab(st.L, 'masthead');
                o.frVisibleAfterLoad = await page.locator('[id="masthead-name-control-fr_CA"]').isVisible().catch(() => null);
            }
            // the French privacy statement and Information texts as created with French forms (OPS3 control)
            await openWebsiteSide(st.L, 'privacy');
            o.frPrivacy = await mceGet('privacy-privacyStatement-control-fr_CA');
            o.privacyCompleted = (await page.locator('[id="privacy"] form').innerText().catch(() => '')).match(/\d+\/\d+ languages completed/g);
            if (!isOps) {
                await openWebsiteSide(st.L, 'information');
                o.frReaders = (await mceGet('information-readerInformation-control-fr_CA') || '').slice(0, 300);
            }
            await snap('french-l-privacy', {fr: o.frPrivacy});
            fact('french', o);
            await as(null);
        });

        // ── saves (Actors rows 2, 3) ────────────────────────────────────────
        await step('saves', async () => {
            const o = {};
            const brief = (s) => ({status: s.status, saved: s.saved, flagged: s.flagged, requests: s.requests.length});
            await as(U.mgr, st.S);
            let f = await openCtxTab(st.S, 'masthead');
            await page.locator('[id^="masthead-name-control"]').first().fill(`SW1 S saved ${st.t}`);
            o.mgrMasthead = brief(await pressSave(f));
            f = await openCtxTab(st.S, 'contact');
            await page.locator('#contact-supportName-control').fill('Sid Support');
            await page.locator('#contact-supportEmail-control').fill(`${st.t}sid@mail.test`);
            o.mgrContact = brief(await pressSave(f));
            await as(null);
            if (!isOps) {
                await as(U.ed, st.S);
                f = await openWebsiteSide(st.S, 'privacy');
                await mceType('privacy-privacyStatement-control-en', `Privacy by the editor ${st.t}.`);
                o.edPrivacy = brief(await pressSave(f));
                f = await openCtxTab(st.S, 'contact');
                await page.locator('#contact-contactPhone-control').fill('+1 555 0170');
                o.edContact = brief(await pressSave(f));
                await as(null);
                await as(U.pe, st.S);
                f = await openCtxTab(st.S, 'masthead');
                await page.locator('[id^="masthead-acronym-control"]').first().fill('SWPE');
                o.peMasthead = brief(await pressSave(f));
                f = await openWebsiteSide(st.S, 'information');
                await mceType('information-readerInformation-control-en', `Readers by production ${st.t}.`);
                o.peInformation = brief(await pressSave(f));
                await as(null);
            } else {
                await as(U.mgr, st.S);
                f = await openWebsiteSide(st.S, 'privacy');
                await mceType('privacy-privacyStatement-control-en', `Privacy by the manager ${st.t}.`);
                o.mgrPrivacy = brief(await pressSave(f));
                await as(null);
            }
            await as('admin', st.S);
            f = await openCtxTab(st.S, 'masthead');
            await mceType('masthead-about-control-en', `About by admin ${st.t}.`);
            o.adminMasthead = brief(await pressSave(f));
            if (!isOps) {
                f = await openWebsiteSide(st.S, 'information');
                await mceType('information-authorInformation-control-en', `Authors by admin ${st.t}.`);
                o.adminInformation = brief(await pressSave(f));
            }
            await as(null);
            for (const [k, p] of [['about', '/about'], ['contact', '/about/contact'], ['privacy', '/about/privacy'], ...(isOps ? [] : [['readers', '/information/readers'], ['authors', '/information/authors']])]) {
                const r = await pub(cu(st.S, p), `saves-public-${k}`, {markers: [st.t, 'Sid Support', '555 0170', 'SW1 S saved']});
                o[`public-${k}`] = {status: r.status, title: r.title, hits: Object.fromEntries(Object.entries(r.hits || {}).map(([m, v]) => [m, v.visible]))};
            }
            fact('saves', o);
        });

        // ── rule5: unsaved changes ──────────────────────────────────────────
        await step('rule5', async () => {
            const o = {};
            await as(U.mgr, st.S);
            let f = await openCtxTab(st.S, 'masthead');
            const title = page.locator('[id^="masthead-name-control"]').first();
            o.stored = await title.inputValue();
            await title.fill(`Unsaved ${st.t}`);
            await mceType('masthead-description-control-en', `Unsaved summary ${st.t}`);
            let t0 = Date.now();
            await pressTab('contact');
            o.toContact = {dialogs: since(dialogs, t0), vue: (await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => [])).map((x) => flat(x, 100))};
            const phone = page.locator('#contact-supportPhone-control');
            await phone.fill('+1 555 0107');
            o.contactSave = (({status, saved}) => ({status, saved}))(await pressSave(formOf('contact')));
            await pressTab('masthead');
            o.titleAfterContactSave = await title.inputValue();
            o.summaryAfterContactSave = await mceGet('masthead-description-control-en');
            await snap('rule5-masthead-after-contact-save', {title: o.titleAfterContactSave});
            t0 = Date.now();
            await page.reload(); await idle(page).catch(() => {});
            f = await openCtxTab(st.S, 'masthead');
            o.afterReload = {title: await page.locator('[id^="masthead-name-control"]').first().inputValue(), summary: await mceGet('masthead-description-control-en'), dialogs: since(dialogs, t0)};
            await page.locator('[id^="masthead-name-control"]').first().fill(`Unsaved again ${st.t}`);
            await page.locator('[id^="masthead-name-control"]').first().blur();
            t0 = Date.now();
            await pressSide('Website');
            o.sideLeave = {dialogs: since(dialogs, t0), url: rel(page.url()), vue: (await page.locator('[role="dialog"]:visible').allInnerTexts().catch(() => [])).map((x) => flat(x, 100))};
            await snap('rule5-left-to-website', o.sideLeave);
            // Privacy Statement typed: side tab, top tab, back; then the side menu's ctxWord
            await pressTab('setup');
            await tabBtn('privacy').click(); await idle(page).catch(() => {}); await sleep(600);
            await mceType('privacy-privacyStatement-control-en', `Unsaved privacy ${st.t}`);
            await tabBtn('languages').click(); await idle(page).catch(() => {}); await sleep(600);
            await tabBtn('privacy').click(); await idle(page).catch(() => {}); await sleep(600);
            o.privAfterSide = await mceGet('privacy-privacyStatement-control-en');
            await pressTab('appearance');
            await pressTab('setup');
            o.setupReopensOn = await selectedTabs();
            await tabBtn('privacy').click(); await idle(page).catch(() => {}); await sleep(600);
            o.privAfterTop = await mceGet('privacy-privacyStatement-control-en');
            t0 = Date.now();
            await pressSide(ctxWord);
            o.privLeave = {dialogs: since(dialogs, t0), url: rel(page.url())};
            o.titleBack = await page.locator('[id^="masthead-name-control"]').first().inputValue().catch(() => null);
            await openWebsiteSide(st.S, 'privacy');
            o.privAfterLeave = await mceGet('privacy-privacyStatement-control-en');
            await snap('rule5-privacy-after-leave', {priv: o.privAfterLeave});
            fact('rule5', o);
            await as(null);
        });

        // ── rule4: not accepting submissions (A8) ───────────────────────────
        await step('rule4', async () => {
            const o = {};
            await as(U.mgr, st.S);
            await page.goto(cu(st.S, '/management/settings/workflow')); await idle(page).catch(() => {});
            await pressTab('submission');
            const sideDis = page.locator('#submission [role="tab"]').filter({hasText: /Disable|Accept/i}).first();
            o.sideTabs = (await page.locator('#submission [role="tab"]').allInnerTexts().catch(() => [])).map((x) => flat(x, 40));
            if (await sideDis.count()) { await sideDis.click(); await idle(page).catch(() => {}); await sleep(500); }
            const box = page.locator('input[name="disableSubmissions"]').first();
            o.boxLabel = await box.evaluate((e) => (e.labels && e.labels[0] ? e.labels[0].innerText : null)).catch(() => null);
            await box.check();
            const f = page.locator('form').filter({has: box}).first();
            const w = page.waitForResponse((r) => /\/api\/v1\/contexts\//.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await f.getByRole('button', {name: 'Save', exact: true}).click();
            o.disableSave = (await w)?.status() ?? null;
            await sleep(800);
            const notice = async () => ((await page.locator('main').innerText().catch(() => '')).match(/[^\n]*not accepting submissions[^\n]*/) || [null])[0];
            o.samePageAfterDisable = await notice();
            for (const slug of SLUGS) {
                await page.goto(cu(st.S, `/management/settings/${slug}`)); await idle(page).catch(() => {});
                await snap(`rule4-notice-${slug}`);
                o[slug] = await notice();
            }
            // allow again on the same page
            await page.goto(cu(st.S, '/management/settings/workflow')); await idle(page).catch(() => {});
            await pressTab('submission');
            if (await sideDis.count()) { await sideDis.click(); await idle(page).catch(() => {}); await sleep(500); }
            o.beforeUntick = await notice();
            await box.uncheck();
            const w2 = page.waitForResponse((r) => /\/api\/v1\/contexts\//.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
            await f.getByRole('button', {name: 'Save', exact: true}).click();
            o.allowSave = (await w2)?.status() ?? null;
            o.allowSaved = await page.locator('[role="status"]:has-text("Saved")').first().waitFor({timeout: 8000}).then(() => true).catch(() => false);
            await sleep(800);
            o.samePageAfterAllow = await notice();
            await snap('rule4-after-allow-same-page', {notice: o.samePageAfterAllow});
            await page.reload(); await idle(page).catch(() => {});
            o.afterReload = await notice();
            await page.goto(cu(st.S, '/management/settings/website')); await idle(page).catch(() => {});
            o.websiteAfterAllow = await notice();
            fact('rule4', o);
            await as(null);
        });

        // ── rule6: one set per journal ──────────────────────────────────────
        await step('rule6', async () => {
            const o = {};
            await as(null);
            for (const [k, ctx] of [['S', st.S], ['P', st.P], ['PK', PK]]) {
                const c = await pub(cu(ctx, '/about/contact'), `rule6-${k}-contact`, {markers: ['Sid Support'], shotIt: false});
                const p = await pub(cu(ctx, '/about/privacy'), `rule6-${k}-privacy`, {markers: ['Privacy by the'], shotIt: false});
                const a = await pub(cu(ctx, '/about'), `rule6-${k}-about`, {markers: ['About by admin'], shotIt: false});
                o[k] = {contactSupport: c.hits && c.hits['Sid Support'].visible, privacyMarker: p.hits && p.hits['Privacy by the'].visible, privacyStatus: p.status, aboutMarker: a.hits && a.hits['About by admin'].visible, aboutTitle: a.title};
            }
            const s = await pub(app.url('/index.php/index/about/privacy'), 'rule6-site-privacy');
            o.site = {status: s.status, title: s.title, h1: s.h1, main: flat(s.mainText, 200)};
            fact('rule6', o);
        });

        // ── rule7: the journal's name and initials ──────────────────────────
        await step('rule7', async () => {
            const o = {};
            const pages = [['home', ''], ['about', '/about'], ['contact', '/about/contact'], ['masthead', '/about/editorialMasthead'], ['privacy', '/about/privacy'], ['software', '/about/aboutThisPublishingSystem'],
                ['item', isOjs ? `/article/view/${st.pubM}` : isOmp ? `/catalog/book/${st.pubM}` : `/preprint/view/${st.pubM}`]];
            const tasks = async (who, ctx, name) => {
                await as(who, ctx);
                await page.goto(cu(ctx, '/submissions')); await idle(page).catch(() => {});
                const bell = page.getByRole('button', {name: /^Tasks/}).first();
                const r = {bell: await bell.getAttribute('aria-label').catch(() => null) || flat(await bell.innerText().catch(() => ''), 60)};
                await bell.click().catch((e) => { r.err = flat(e.message, 100); });
                const dlg = page.locator('[role="dialog"]:visible').last();
                await dlg.waitFor({timeout: T}).catch(() => {});
                await idle(page).catch(() => {});
                await sleep(800);
                r.text = flat(await dlg.innerText().catch(() => ''), 1500);
                r.rows = await dlg.locator('div.task, tr').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 200))).catch(() => []);
                await snap(name, r);
                await as(null);
                return r;
            };
            await as(null);
            o.before = {};
            for (const [k, p] of pages) { const r = await pub(cu(st.M, p), `rule7-before-${k}`, {shotIt: false}); o.before[k] = {title: r.title, siteName: r.siteName}; }
            o.tasksBefore = {mm: await tasks(U.mm, st.M, 'rule7-tasks-mm-before'), m2: await tasks(U.m2, st.M, 'rule7-tasks-m2-before')};
            await as(U.mm, st.M);
            const f = await openCtxTab(st.M, 'masthead');
            await page.locator('[id^="masthead-name-control"]').first().fill(`Renamed Probe ${st.t}`);
            await page.locator('[id^="masthead-acronym-control"]').first().fill('RPJ');
            o.save = (({status, saved}) => ({status, saved}))(await pressSave(f));
            await as(null);
            o.after = {};
            for (const [k, p] of pages) { const r = await pub(cu(st.M, p), `rule7-after-${k}`, {shotIt: k === 'home'}); o.after[k] = {title: r.title, siteName: r.siteName, h1: r.h1}; }
            await loc(page, 'Public header: the journal name text', page.locator('.pkp_site_name'));
            const site = await pub(app.url('/index.php/index'), 'rule7-site-index', {markers: [`Renamed Probe ${st.t}`, `SW1 M ${st.t}`]});
            o.siteIndex = {status: site.status, url: site.url, hits: site.hits};
            o.tasksAfter = {mm: await tasks(U.mm, st.M, 'rule7-tasks-mm-after'), m2: await tasks(U.m2, st.M, 'rule7-tasks-m2-after')};
            // the other end: a header logo
            await as(U.mm, st.M);
            await page.goto(cu(st.M, '/management/settings/website')); await idle(page).catch(() => {});
            await pressTab('appearance');
            await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click(); await idle(page).catch(() => {}); await sleep(500);
            const input = page.locator('input[type=file][id*="pageHeaderLogoImage"]').first();
            if (await input.count()) {
                const png = path.resolve(__dirname, `../../../../../apps/${app.name}/playwright/fixtures/files/profile-image-400.png`);
                const up = page.waitForResponse((r) => /temporaryFiles/.test(r.url()) && r.request().method() === 'POST', {timeout: T}).catch(() => null);
                await input.setInputFiles(png);
                o.logoUpload = (await up)?.status() ?? null;
                await idle(page).catch(() => {}); await sleep(800);
                const lf = page.locator('#appearance').getByRole('tabpanel', {name: 'Setup'});
                const w = page.waitForResponse((x) => /\/api\/v1\/contexts/.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await lf.getByRole('button', {name: 'Save', exact: true}).click();
                o.logoSave = (await w)?.status() ?? null;
                await sleep(800);
                await as(null);
                const h = await pub(cu(st.M, ''), 'rule7-home-with-logo');
                const a = await pub(cu(st.M, '/about'), 'rule7-about-with-logo', {shotIt: false});
                o.withLogo = {home: {title: h.title, siteName: h.siteName, html: h.siteNameHtml}, about: {title: a.title, siteName: a.siteName, html: a.siteNameHtml}};
            }
            fact('rule7', o);
            await as(null);
        });

        // ── rule8: the summary ──────────────────────────────────────────────
        await step('rule8', async () => {
            const o = {};
            const mark = `Probe summary ${st.t}`;
            await as(U.mm, st.M);
            const f = await openCtxTab(st.M, 'masthead');
            await mceType('masthead-description-control-en', mark);
            o.save = (({status, saved}) => ({status, saved}))(await pressSave(f));
            await as(null);
            const site = await pub(app.url('/index.php/index'), 'rule8-site-index', {markers: [mark]});
            o.site = {url: site.url, hit: site.hits[mark]};
            o.siteEntry = await page.evaluate((m) => {
                const li = [...document.querySelectorAll('li, .body > div')].find((e) => e.innerText.includes(m));
                return li ? li.innerText.replace(/\s+/g, ' ').trim().slice(0, 400) : null;
            }, mark).catch(() => null);
            const h0 = await pub(cu(st.M, ''), 'rule8-home-default', {markers: [mark]});
            o.homeDefault = h0.hits[mark];
            await as(U.mm, st.M);
            await page.goto(cu(st.M, '/management/settings/website')); await idle(page).catch(() => {});
            await pressTab('appearance');
            const box = page.getByRole('checkbox', {name: /Show the (journal|press|server) summary on the homepage\./});
            o.boxCount = await box.count();
            if (o.boxCount) {
                o.boxLabel = await box.first().evaluate((e) => (e.labels && e.labels[0] ? e.labels[0].innerText : null));
                o.boxDefault = await box.first().isChecked();
                await box.first().check();
                const tf = page.locator('form').filter({has: box.first()}).first();
                const w = page.waitForResponse((r) => /\/api\/v1\/contexts/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await tf.getByRole('button', {name: 'Save', exact: true}).click();
                o.themeSave = (await w)?.status() ?? null;
                await sleep(800);
                await as(null);
                const h1 = await pub(cu(st.M, ''), 'rule8-home-summary-on', {markers: [mark]});
                o.homeOn = h1.hits[mark];
            }
            fact('rule8', o);
        });

        // ── rule9: contacts and the senders ─────────────────────────────────
        await step('rule9', async () => {
            const o = {};
            await as(U.mm, st.M);
            const f = await openCtxTab(st.M, 'contact');
            o.arrival = await formShape(f);
            const C = {name: 'Pat Principal', email: `${st.t}pat@mail.test`, phone: '+1 555 0100', aff: 'Principal University', addr: '1 Probe Street\nProbe City',
                sname: 'Sam Support', semail: `${st.t}sam@mail.test`, sphone: '+1 555 0199'};
            await page.locator('#contact-contactName-control').fill(C.name);
            await page.locator('#contact-contactEmail-control').fill(C.email);
            await page.locator('#contact-contactPhone-control').fill(C.phone);
            await page.locator('[id^="contact-contactAffiliation-control"]').first().fill(C.aff);
            await page.locator('#contact-mailingAddress-control').fill(C.addr);
            await page.locator('#contact-supportName-control').fill(C.sname);
            await page.locator('#contact-supportEmail-control').fill(C.semail);
            await page.locator('#contact-supportPhone-control').fill(C.sphone);
            o.save = (({status, saved, flagged}) => ({status, saved, flagged}))(await pressSave(f));
            await as(null);
            const cp = await pub(cu(st.M, '/about/contact'), 'rule9-contact-page');
            o.contactPage = {status: cp.status, main: cp.mainText.slice(0, 1200)};
            o.structure = await page.evaluate(() => {
                const p = document.querySelector('.page_contact') || document.querySelector('.pkp_structure_main');
                return {
                    headings: [...p.querySelectorAll('h1,h2,h3,h4')].map((h) => h.tagName + ':' + h.innerText.trim()),
                    addressHtml: ((p.querySelector('.address') || {}).innerHTML || '').replace(/\s+/g, ' ').slice(0, 300),
                    primary: ((p.querySelector('.contact.primary') || {}).innerText || '').replace(/\s+/g, ' '),
                    support: ((p.querySelector('.contact.support') || {}).innerText || '').replace(/\s+/g, ' '),
                };
            }).catch(() => null);
            // the journal's own emails after the change: a submission (Submission Confirmation, AssignEditors), a publication
            const auMail = `${U.au2}@mail.test`;
            const since1 = new Date(Date.now() - 2000);
            await app.api.createSubmission({tag: `${st.t}r9s`, context: st.M, submitter: U.au2, title: `SW1 after contact ${st.t}`, submitted: true});
            await app.api.createSubmission({tag: `${st.t}r9p`, context: st.M, submitter: U.au2, title: `SW1 published after contact ${st.t}`, submitted: true, published: true});
            await drainJobs(app).catch(() => {});
            await sleep(3000);
            o.authorMail = await mailsTo(auMail, since1);
            o.managerMail = {mm: await mailsTo(`${U.mm}@mail.test`, since1), m2: await mailsTo(`${U.m2}@mail.test`, since1)};
            for (const m of o.authorMail.slice(0, 4)) {
                const full = await app.mail.fullMessage(m.id).catch(() => null);
                m.fromHeader = full ? full.From : null;
            }
            fact('rule9', o);
        });

        // ── rule9b: the senders of two journal emails sent from screens (Rule 9) ──
        // Seeding sends no mail (the harness fakes it), so: the author submits a seeded draft through
        // the wizard (Submission Confirmation), and the manager publishes a seeded item from its
        // workflow ("Publication Published"); both after the Contact tab was saved by rule9.
        await step('rule9b', async () => {
            const o = {};
            const au = U.au2, auMail = `${U.au2}@mail.test`;
            // 1. the wizard's submit
            const dTag = tag('hksw1d');
            const D = await app.api.createSubmission({tag: dTag, context: st.M, submitter: au, title: `SW1 wizard ${dTag}`, submitted: false,
                ...(isOps ? {galleys: [{label: 'PDF', file: 'preprint.pdf'}]} : {files: [{file: 'article.pdf'}]})});
            await as(au, st.M);
            await page.goto(cu(st.M, `/en/submission?id=${D.submissionId}`)); await idle(page).catch(() => {});
            await sleep(1500);
            const steps = [];
            for (let i = 0; i < 10; i++) {
                const submit = page.getByRole('button', {name: 'Submit', exact: true}).filter({visible: true});
                if (await submit.count() && await submit.last().isEnabled().catch(() => false)) break;
                const cont = page.getByRole('button', {name: 'Continue', exact: true}).filter({visible: true});
                if (!(await cont.count())) break;
                await cont.first().click().catch(() => {});
                await idle(page).catch(() => {}); await sleep(1500);
                steps.push(flat(await page.locator('[aria-current="step"], .pkpSteps__step--current').first().innerText().catch(() => ''), 60));
            }
            o.wizardSteps = steps;
            await snap('rule9b-wizard-review');
            const since1 = new Date(Date.now() - 2000);
            const submit = page.getByRole('button', {name: 'Submit', exact: true}).filter({visible: true}).last();
            if (await submit.count()) {
                await submit.click().catch((e) => { o.submitErr = flat(e.message, 100); });
                await sleep(1000);
                const dlg = page.getByRole('dialog').filter({has: page.getByRole('button', {name: 'Submit', exact: true})}).last();
                o.confirmText = flat(await dlg.innerText().catch(() => ''), 300);
                await dlg.getByRole('button', {name: 'Submit', exact: true}).click().catch((e) => { o.confirmErr = flat(e.message, 100); });
                await page.getByRole('heading', {name: /Submission complete/}).waitFor({timeout: 45_000}).catch(() => {});
                o.afterSubmit = (await page.locator('h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 80));
                await snap('rule9b-wizard-complete', o);
            }
            await as(null);
            await drainJobs(app).catch(() => {});
            await sleep(2000);
            o.afterSubmitMail = {author: await mailsTo(auMail, since1), mm: await mailsTo(`${U.mm}@mail.test`, since1), m2: await mailsTo(`${U.m2}@mail.test`, since1)};
            // 2. publish from the workflow
            const pTag = tag('hksw1q');
            const Q = await app.api.createSubmission({tag: pTag, context: st.M, submitter: au, title: `SW1 to publish ${pTag}`, submitted: true,
                ...(isOps ? {galleys: [{label: 'PDF', file: 'preprint.pdf'}]} : {decisions: ['sendToProduction']})});
            await as(U.mm, st.M);
            await page.goto(cu(st.M, `/dashboard/editorial?workflowSubmissionId=${Q.submissionId}&workflowMenuKey=publication_${Q.publicationId}_titleAbstract`));
            await idle(page).catch(() => {}); await sleep(1500);
            const since2 = new Date(Date.now() - 2000);
            try {
                if (isOjs) {
                    const {PublicationScreen} = require(path.join(app.suiteDir, 'pages', 'PublicationMetadataPages.js'));
                    const ps = new PublicationScreen(page, st.M);
                    const panel = await ps.openPublishPanel();
                    await ps.fillVersionDetails(panel);
                    const dontAssign = panel.getByRole('radio', {name: "Don't Assign To An Issue"});
                    if (await dontAssign.waitFor({state: 'visible', timeout: 5000}).then(() => true).catch(() => false)) {
                        await ps.awaitAssignmentPreselected(panel).catch(() => {});
                        await dontAssign.check();
                    }
                    await panel.getByRole('button', {name: 'Confirm', exact: true}).click();
                    const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to publish this?'});
                    await confirm.waitFor({state: 'visible', timeout: T});
                    const w = page.waitForResponse((r) => r.url().includes('/publish') && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                    await confirm.getByRole('button', {name: 'Publish', exact: true}).click();
                    o.publish = (await w)?.status() ?? null;
                } else if (isOmp) {
                    await page.getByRole('button', {name: 'Publish', exact: true}).first().click();
                    const dlg = page.getByRole('dialog').filter({hasText: 'Are you sure you want to make this catalog entry public?'});
                    await dlg.waitFor({state: 'visible', timeout: T});
                    const w = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                    await dlg.getByRole('button', {name: 'Publish', exact: true}).click();
                    o.publish = (await w)?.status() ?? null;
                } else {
                    const stageAction = page.getByRole('button', {name: 'Post the preprint', exact: true});
                    const postControl = page.getByRole('button', {name: 'Post', exact: true});
                    await stageAction.or(postControl).first().waitFor({state: 'visible', timeout: T});
                    if (await stageAction.isVisible()) await stageAction.click();
                    await postControl.waitFor({state: 'visible', timeout: T});
                    await postControl.click();
                    const confirm = page.getByRole('dialog').filter({hasText: 'Are you sure you want to post this?'});
                    await confirm.waitFor({state: 'visible', timeout: T});
                    await idle(page).catch(() => {});
                    for (const [sel, val] of [['select[name="versionStage"]', 'VoR'], ['select[name="versionIsMinor"]', 'false']]) {
                        const x = confirm.locator(sel);
                        if (await x.isVisible().catch(() => false) && !(await x.inputValue().catch(() => ''))) await x.selectOption(val).catch(() => {});
                    }
                    const w = page.waitForResponse((r) => /\/publications\/\d+\/publish/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
                    await confirm.getByRole('button', {name: 'Post', exact: true}).last().click();
                    o.publish = (await w)?.status() ?? null;
                }
            } catch (e) { o.publishErr = flat(e.message, 300); }
            await idle(page).catch(() => {}); await sleep(1000);
            await snap('rule9b-published', {publish: o.publish, err: o.publishErr});
            await as(null);
            await drainJobs(app).catch(() => {});
            await sleep(2000);
            o.afterPublishMail = {author: await mailsTo(auMail, since2)};
            for (const list of [o.afterSubmitMail.author, o.afterSubmitMail.mm, o.afterPublishMail.author]) {
                for (const m of list.slice(0, 4)) {
                    const full = await app.mail.fullMessage(m.id).catch(() => null);
                    m.fromHeader = full ? JSON.stringify(full.From) : null;
                    m.replyTo = full ? JSON.stringify(full.ReplyTo) : null;
                }
            }
            fact('rule9b', o);
        });

        // ── rule10: fields readers never see ────────────────────────────────
        await step('rule10', async () => {
            const o = {};
            const marks = {abbr: `AbbrMark${st.t}`, publisher: `PublisherMark${st.t}`, url: `https://publisher${st.t}.example.org`, location: `LocationMark${st.t}`, code: `CodeMark${st.t}`, sponsor: `SponsorMark${st.t}`, onlineIssn: '0378-5955', printIssn: '1050-124X'};
            await as(U.mm, st.M);
            let f = await openCtxTab(st.M, 'masthead');
            const fillIf = async (sel, v) => { const l = page.locator(sel).first(); if (await l.count()) { await l.fill(v); return true; } return false; };
            o.filled = {};
            if (isOjs) {
                o.filled.abbr = await fillIf('[id^="masthead-abbreviation-control"]', marks.abbr);
                o.filled.publisher = await fillIf('[id^="masthead-publisherInstitution-control"]', marks.publisher);
                o.filled.url = await fillIf('[id^="masthead-publisherUrl-control"]', marks.url);
                o.filled.onlineIssn = await fillIf('[id^="masthead-onlineIssn-control"]', marks.onlineIssn);
                o.filled.printIssn = await fillIf('[id^="masthead-printIssn-control"]', marks.printIssn);
            }
            if (isOmp) {
                o.filled.publisher = await fillIf('[id^="masthead-publisher-control"]', marks.publisher);
                o.filled.location = await fillIf('[id^="masthead-location-control"]', marks.location);
                await page.locator('select[id^="masthead-codeType-control"]').first().selectOption({label: 'ISNI (16)'}).catch(() => {});
                o.filled.code = await fillIf('[id^="masthead-codeValue-control"]', marks.code);
            }
            if (isOps) {
                o.filled.abbr = await fillIf('[id^="masthead-abbreviation-control"]', marks.abbr);
                o.filled.sponsor = await fillIf('[id^="masthead-sponsoringOrganization-control"]', marks.sponsor);
            }
            await page.locator('select[id^="masthead-country-control"]').first().selectOption({label: 'Iceland'});
            o.save = (({status, saved, flagged}) => ({status, saved, flagged}))(await pressSave(f));
            f = await openCtxTab(st.M, 'masthead');
            o.reloaded = (await formShape(f)).groups.map((g) => ({h: g.heading, f: g.fields.map((x) => `${x.label}=${(x.controls[0] || {}).selectedLabel || (x.controls[0] || {}).value || ''}`.slice(0, 120))}));
            // CSL on (off on a scratch context)
            await page.goto(cu(st.M, '/management/settings/website')); await idle(page).catch(() => {});
            await pressTab('plugins');
            await sleep(800);
            const row = page.locator('tr.gridRow').filter({hasText: 'Citation Style Language'}).first();
            await row.waitFor({timeout: T}).catch(() => {});
            const cbox = row.locator('input[type="checkbox"]').first();
            o.cslBefore = await cbox.isChecked().catch(() => null);
            if (o.cslBefore === false) { await cbox.click(); await sleep(1500); await idle(page).catch(() => {}); }
            o.cslAfter = await cbox.isChecked().catch(() => null);
            await as(null);
            // an item published after the save (the publication stamps the journal's identity when it is published)
            const nTag = tag('hksw1n');
            const NP = await app.api.createSubmission({tag: nTag, context: st.M, submitter: U.au2, title: `SW1 after abbreviation ${nTag}`, submitted: true, published: true});
            st.pubAfter = NP.submissionId;
            const mk = Object.values(marks).concat(['Iceland']);
            const pages = [['home', ''], ['about', '/about'], ['contact', '/about/contact'], ['masthead', '/about/editorialMasthead'], ['history', '/about/editorialHistory'], ['privacy', '/about/privacy'], ['submissions', '/about/submissions'], ['software', '/about/aboutThisPublishingSystem'],
                ...(isOps ? [] : [['readers', '/information/readers']]), ...(isOjs ? [['archive', '/issue/archive']] : []), ...(isOmp ? [['catalog', '/catalog']] : []), ...(isOps ? [['preprints', '/preprints']] : []),
                ['item', isOjs ? `/article/view/${st.pubM}` : isOmp ? `/catalog/book/${st.pubM}` : `/preprint/view/${st.pubM}`]];
            o.pages = {};
            for (const [k, p] of pages) {
                const r = await pub(cu(st.M, p), `rule10-pub-${k}`, {markers: mk, shotIt: k === 'item'});
                o.pages[k] = {status: r.status, visible: Object.entries(r.hits || {}).filter(([, v]) => v.visible).map(([m]) => m), headOnly: Object.entries(r.hits || {}).filter(([, v]) => !v.visible && v.html).map(([m, v]) => `${m}: ${v.headLines.join(' ').slice(0, 200)}`)};
            }
            // How to Cite, each format: the item published before the save, and the one published after it
            for (const [which, id] of [['before', st.pubM], ['after', st.pubAfter]]) {
            await page.goto(cu(st.M, isOjs ? `/article/view/${id}` : isOmp ? `/catalog/book/${id}` : `/preprint/view/${id}`)); await idle(page).catch(() => {});
            const btn = page.locator('button.citation_formats_button');
            o.cite = {button: await btn.count(), default: flat(await page.locator('#citationOutput').innerText().catch(() => ''), 400)};
            o[`head-${which}`] = await page.evaluate(() => [...document.querySelectorAll('meta')].map((m) => `${m.getAttribute('name') || m.getAttribute('property')}=${m.getAttribute('content')}`).filter((x) => /journal|issn|publisher|citation_title|DC\.Source|abbrev/i.test(x)).slice(0, 20)).catch(() => []);
            if (o.cite.button) {
                const links = page.locator('#cslCitationFormats ul.citation_formats_styles').first().locator('a');
                const n = await links.count();
                o.cite.formats = {};
                for (let i = 0; i < n; i++) {
                    await btn.click().catch(() => {}); await sleep(200);
                    const l = links.nth(i);
                    const name = flat(await l.innerText(), 60);
                    const w = page.waitForResponse((r) => /citationstylelanguage\/get/.test(r.url()), {timeout: 10_000}).catch(() => null);
                    await l.click().catch(() => {});
                    await w; await sleep(400);
                    const out = flat(await page.locator('#citationOutput').innerText().catch(() => ''), 500);
                    o.cite.formats[name] = {abbr: out.includes(marks.abbr), journalName: /Renamed Probe|SW1 M/.test(out), out: out.slice(0, 260)};
                }
                await snap(`rule10-item-citations-${which}`, {cite: o.cite});
            }
            o[`cite-${which}`] = o.cite;
            }
            const s = await pub(app.url('/index.php/index'), 'rule10-site-index', {markers: mk, shotIt: false});
            o.siteVisible = Object.entries(s.hits || {}).filter(([, v]) => v.visible).map(([m]) => m);
            fact('rule10', o);
        });

        // ── rule11: languages on the public pages ───────────────────────────
        await step('rule11', async () => {
            const o = {};
            await as(U.lm, st.L);
            let f = await openCtxTab(st.L, 'masthead');
            await page.locator('[id="masthead-name-control-en"]').fill(`SW1 L ${st.t}`);
            await mceType('masthead-about-control-en', `English about ${st.t}`);
            const frBtn = f.getByRole('button', {name: 'French', exact: true});
            if (await frBtn.count()) { await frBtn.first().click(); await sleep(400); }
            o.frTitleBefore = await page.locator('[id="masthead-name-control-fr_CA"]').inputValue().catch(() => null);
            await page.locator('[id="masthead-name-control-fr_CA"]').fill('');
            await mceType('masthead-about-control-fr_CA', '');
            o.save1 = (({status, saved, flagged}) => ({status, saved, flagged}))(await pressSave(f));
            await as(null);
            const fr1 = await pub(cu(st.L, '/fr_CA/about'), 'rule11-fr-about-en-only', {markers: [`English about ${st.t}`]});
            o.fr1 = {h1: fr1.h1, title: fr1.title, siteName: fr1.siteName, enShown: fr1.hits[`English about ${st.t}`]};
            await as(U.lm, st.L);
            f = await openCtxTab(st.L, 'masthead');
            if (await frBtn.count()) { await frBtn.first().click(); await sleep(400); }
            await mceType('masthead-about-control-fr_CA', `Texte français ${st.t}`);
            await page.locator('[id="masthead-name-control-fr_CA"]').fill(`Revue SW1 ${st.t}`);
            o.save2 = (({status, saved, flagged}) => ({status, saved, flagged}))(await pressSave(f));
            await as(null);
            const fr2 = await pub(cu(st.L, '/fr_CA/about'), 'rule11-fr-about-fr', {markers: [`Texte français ${st.t}`, `English about ${st.t}`]});
            const en2 = await pub(cu(st.L, '/en/about'), 'rule11-en-about', {markers: [`Texte français ${st.t}`, `English about ${st.t}`]});
            o.fr2 = {h1: fr2.h1, title: fr2.title, siteName: fr2.siteName, hits: fr2.hits};
            o.en2 = {h1: en2.h1, title: en2.title, siteName: en2.siteName, hits: en2.hits};
            fact('rule11', o);
        });

        // ── permit (Actors preamble; row 1; A2) ─────────────────────────────
        await step('permit', async () => {
            const o = {};
            await as(U.pm, st.P);
            const openRoles = async () => {
                await page.goto(cu(st.P, '/management/settings/access')); await idle(page).catch(() => {});
                await page.getByRole('tab', {name: 'Roles', exact: true}).click(); await idle(page).catch(() => {}); await sleep(600);
            };
            await openRoles();
            await snap('permit-roles-grid');
            o.grid = await page.locator('tr.gridRow').evaluateAll((els) => els.map((e) => ({text: e.innerText.replace(/\s+/g, ' ').trim(), controls: !!e.querySelector('a.show_extras')})));
            const roleNames = isOps ? [] : isOjs ? ['Journal editor', 'Production editor'] : ['Press editor', 'Production editor'];
            o.forms = {};
            for (const rn of roleNames) {
                await openRoles();
                const row = page.getByRole('row', {name: new RegExp(`^Settings ${rn}\\b`)}).first();
                await row.getByRole('link', {name: 'Settings'}).click();
                await row.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).click();
                const form = page.locator('#userGroupForm');
                await form.waitFor({timeout: T});
                await idle(page).catch(() => {});
                const box = form.getByRole('checkbox', {name: 'Permit changes to Settings'});
                const r = {boxes: await form.locator('input[type=checkbox]').evaluateAll((els) => els.map((e) => ({checked: e.checked, disabled: e.disabled, label: e.labels && e.labels[0] ? e.labels[0].innerText.trim().slice(0, 80) : e.name})))};
                await snap(`permit-form-${rn.replace(/\W+/g, '')}`, r);
                if (await box.count()) {
                    await box.uncheck();
                    const w = page.waitForResponse((x) => x.url().includes('update-user-group'), {timeout: 15_000}).catch(() => null);
                    await form.getByRole('button', {name: 'OK'}).click();
                    r.save = (await w)?.status() ?? null;
                    await idle(page).catch(() => {}); await sleep(800);
                    await snap(`permit-form-${rn.replace(/\W+/g, '')}-saved`);
                }
                o.forms[rn] = r;
            }
            await openRoles();
            const mRow = page.getByRole('row', {name: /^Settings (Journal|Press|Preprint Server) manager\b/i}).first();
            o.managerRow = {count: await mRow.count(), text: flat(await mRow.innerText().catch(() => ''), 200)};
            if (o.managerRow.count) {
                await mRow.getByRole('link', {name: 'Settings'}).click().catch(() => {});
                await sleep(500);
                o.managerRow.next = flat(await mRow.locator('xpath=following-sibling::tr[1]').innerText().catch(() => ''), 200);
                o.managerRow.editInNext = await mRow.locator('xpath=following-sibling::tr[1]').getByRole('link', {name: 'Edit', exact: true}).count();
                await snap('permit-manager-row', o.managerRow);
            }
            await as(null);
            for (const who of isOps ? [] : ['ped', 'ppe']) {
                await as(U[who], st.P);
                const r = {};
                const d = await dashboard(st.P, `permit-${who}-dashboard`);
                r.settingsGroup = d.nav.settings; r.groups = d.nav.groups;
                r.settings = {};
                for (const slug of SLUGS.concat(['announcements', 'userComments', 'institutions'])) {
                    const rr = await page.goto(cu(st.P, `/management/settings/${slug}`)).catch(() => null);
                    await idle(page).catch(() => {});
                    const err = await dismissErrorDialog();
                    await snap(`permit-${who}-${slug}`);
                    const c = await classify();
                    r.settings[slug] = `${rr ? rr.status() : '?'} ${verdict(c)}${err ? ' ERR:' + err : ''}`;
                }
                r.edit = {};
                for (const [k, url] of aboutPaths(st.P)) {
                    await page.goto(url); await idle(page).catch(() => {});
                    r.edit[k] = (await editLinks()).map((e) => rel(e.href));
                }
                await page.goto(cu(st.P, '/about')); await idle(page).catch(() => {});
                const link = page.locator('a.cmp_edit_link').first();
                if (await link.count()) {
                    await link.click(); await page.waitForLoadState('load').catch(() => {}); await idle(page).catch(() => {});
                    const c = await classify();
                    r.aboutEditLanded = `${verdict(c)} ${c.url}`;
                    await snap(`permit-${who}-about-edit-landed`);
                }
                o[who] = r;
                await as(null);
            }
            fact('permit', o);
        });

        // ── a1: admin without a manager role (Actors row 1; A1) ────────────
        await step('a1', async () => {
            const o = {roles: st.xRoles};
            await as('admin');
            const d = await dashboard(st.X, 'a1-x-dashboard');
            o.dashboard = {errorDialog: d.errorDialog, settingsGroup: d.nav.settings, groups: d.nav.groups};
            o.pressed = {};
            for (const label of (d.nav.settings || [])) {
                await page.goto(cu(st.X, '/submissions')); await idle(page).catch(() => {});
                await dismissErrorDialog();
                await pressSide(label).catch((e) => { o.pressed[label] = 'press failed ' + flat(e.message, 80); });
                const c = await classify();
                await snap(`a1-x-pressed-${label.replace(/\W+/g, '')}`);
                o.pressed[label] = `${verdict(c)} ${c.url}`;
            }
            o.typed = {};
            for (const slug of SLUGS) {
                await page.goto(cu(st.X, `/management/settings/${slug}`)).catch(() => {});
                await idle(page).catch(() => {});
                const c = await classify();
                o.typed[slug] = `${verdict(c)} ${c.url}`;
            }
            o.edit = {};
            for (const [k, url] of aboutPaths(st.X)) {
                await page.goto(url); await idle(page).catch(() => {});
                o.edit[k] = (await editLinks()).map((e) => rel(e.href));
            }
            await as(null);
            fact('a1', o);
        });

        // ── masthead (Actors row 6; row 5's masthead end) ───────────────────
        await step('masthead', async () => {
            const o = {};
            const readM = async (name) => {
                const r = await pub(cu(st.S, '/about/editorialMasthead'), name, {shotIt: true});
                const lists = await page.evaluate(() => [...document.querySelectorAll('.page_masthead h2')].map((h) => ({h: h.innerText.trim(), names: [...(h.nextElementSibling ? h.nextElementSibling.querySelectorAll('li .name, li') : [])].map((x) => x.innerText.replace(/\s+/g, ' ').trim().slice(0, 80))}))).catch(() => []);
                return {status: r.status, h1: r.h1, lists, text: flat(r.mainText, 1200)};
            };
            const openMF = async () => {
                await page.goto(cu(st.S, '/management/settings/website')); await idle(page).catch(() => {});
                await pressTab('appearance');
                await page.getByRole('tab', {name: 'Editorial Masthead', exact: true}).filter({visible: true}).first().click();
                await idle(page).catch(() => {}); await sleep(500);
                return page.locator('#appearance [role="tabpanel"]:visible form').first();
            };
            const setBox = async (label, value) => {
                await as(U.mgr, st.S);
                const form = await openMF();
                const b = form.getByRole('checkbox', {name: label, exact: true});
                const r = {count: await b.count()};
                if (r.count) {
                    r.before = await b.isChecked();
                    if (value) await b.check(); else await b.uncheck();
                    const w = page.waitForResponse((x) => /\/api\/v1\/contexts\//.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
                    await form.getByRole('button', {name: 'Save', exact: true}).click();
                    r.status = (await w)?.status() ?? null;
                    await sleep(800);
                }
                await as(null);
                return r;
            };
            o.m0 = await readM('masthead-default');
            o.h0 = await (async () => { const r = await pub(cu(st.S, '/about/editorialHistory'), 'masthead-history-default'); return {status: r.status, text: flat(r.mainText, 800)}; })();
            if (!isOps) {
                o.revOn = await setBox(REVBOX, true);
                o.m1 = await readM('masthead-reviewers-on');
            }
            // not based on enrollments: nobody listed; the manager's "Edit" link on the masthead
            await as(U.mgr, st.S);
            const hf = await openCtxTab(st.S, 'masthead');
            await mceType('masthead-editorialHistory-control-en', `History text ${st.t}`);
            o.historySave = (({status, saved}) => ({status, saved}))(await pressSave(hf));
            await as(null);
            o.enrollOff = await setBox(ENROLL, false);
            o.m2 = await readM('masthead-enroll-off');
            await as(U.mgr, st.S);
            await page.goto(cu(st.S, '/about/editorialMasthead')); await idle(page).catch(() => {});
            o.m2EditMgr = (await editLinks()).map((e) => `${e.text} -> ${rel(e.href)}`);
            await snap('masthead-enroll-off-manager', {edit: o.m2EditMgr});
            await as(null);
            if (!isOps) {
                await as(U.se, st.S);
                await page.goto(cu(st.S, '/about/editorialMasthead')); await idle(page).catch(() => {});
                o.m2EditSe = (await editLinks()).map((e) => rel(e.href));
                await as(null);
            }
            o.enrollOn = await setBox(ENROLL, true);
            o.m3 = await readM('masthead-enroll-on-again');
            fact('masthead', o);
        });

        // ── about (Actors row 4) ────────────────────────────────────────────
        await step('about', async () => {
            const o = {};
            const readSet = async (ctx, prefix) => {
                const r = {};
                for (const [k, url] of aboutPaths(ctx)) {
                    const resp = await page.goto(url).catch(() => null);
                    await idle(page).catch(() => {});
                    await snap(`${prefix}-${k}`);
                    const c = await classify();
                    r[k] = `${resp ? resp.status() : '?'} ${verdict(c)}`;
                }
                return r;
            };
            await as(null);
            o.anonPK = await readSet(PK, 'about-anon-pk');
            await as('reader.rosa', PK);
            o.readerPK = await readSet(PK, 'about-reader-pk');
            await as(null);
            o.anonN = await readSet(st.N, 'about-anon-n');
            await as(U.am, st.A);
            await page.goto(cu(st.A, '/management/settings/access')); await idle(page).catch(() => {});
            await pressTab('access').catch(() => {});
            const box = page.getByRole('checkbox', {name: /Users must be registered and log in to view the/});
            o.restrictBox = {count: await box.count(), label: await box.first().evaluate((e) => (e.labels && e.labels[0] ? e.labels[0].innerText : null)).catch(() => null)};
            if (o.restrictBox.count) {
                await box.first().check();
                const f = page.locator('form').filter({has: box.first()}).first();
                const w = page.waitForResponse((x) => /\/api\/v1\/contexts\//.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
                await f.getByRole('button', {name: 'Save', exact: true}).click();
                o.restrictSave = (await w)?.status() ?? null;
                await sleep(800);
            }
            o.mgrA = await readSet(st.A, 'about-mgr-a');
            await as(null);
            o.anonA = await readSet(st.A, 'about-anon-a');
            fact('about', o);
        });

        // ── a9: "For Readers" privacy link ──────────────────────────────────
        await step('a9', async () => {
            const o = {};
            if (isOps) {
                await as(null);
                for (const p of ['/information/readers', '/information/authors', '/information']) {
                    const r = await pub(cu(PK, p), `a9-ops${p.replace(/\W+/g, '-')}`, {shotIt: false});
                    o[p] = {status: r.status, h1: r.h1, url: r.url};
                }
                // the Sidebar list and the Website › Setup side tabs (OPS1)
                await as('manager.maya', PK);
                await page.goto(cu(PK, '/management/settings/website')); await idle(page).catch(() => {});
                await pressTab('setup');
                o.setupSideTabs = (await page.locator('#setup [role="tab"]').allInnerTexts().catch(() => [])).map((x) => flat(x, 40));
                await pressTab('appearance');
                await page.locator('#appearance').getByRole('tab', {name: 'Setup', exact: true}).first().click(); await idle(page).catch(() => {}); await sleep(500);
                o.sidebar = await page.locator('#appearance input[name="sidebar"]').evaluateAll((els) => els.map((e) => e.value)).catch(() => []);
                o.sidebarText = flat((await page.locator('#appearance').innerText().catch(() => '')).match(/Sidebar[\s\S]{0,400}/)?.[0], 400);
                await pressTab('plugins'); await sleep(800);
                o.infoBlockPlugin = await page.locator('tr.gridRow').filter({hasText: /Information Block/}).count();
                await as(null);
                fact('a9-ops1', o);
                return;
            }
            await as(null);
            const r = await pub(cu(PK, '/information/readers'), 'a9-readers');
            o.readers = {status: r.status, h1: r.h1};
            o.links = await page.locator('.pkp_structure_main a').evaluateAll((as_) => as_.map((a) => `${a.innerText.trim()} -> ${a.getAttribute('href')}`)).catch(() => []);
            const link = page.locator('.pkp_structure_main a').filter({hasText: /^Privacy Statement$/}).first();
            if (await link.count()) {
                await link.click(); await page.waitForLoadState('load').catch(() => {}); await idle(page).catch(() => {});
                o.landed = {url: rel(page.url()), title: await page.title(), h1: (await page.locator('h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 80))};
                await snap('a9-landed', o.landed);
            }
            // a scratch context's default text (made on the probe server, so its links resolve here)
            const r2 = await pub(cu(st.P, '/information/readers'), 'a9-p-readers', {shotIt: false});
            o.scratchLinks = await page.locator('.pkp_structure_main a').evaluateAll((as_) => as_.map((a) => `${a.innerText.trim()} -> ${a.getAttribute('href')}`)).catch(() => []);
            o.scratchStatus = r2.status;
            const plink = page.locator('.pkp_structure_main a').filter({hasText: /^Privacy Statement$/}).first();
            if (await plink.count()) {
                await plink.click(); await page.waitForLoadState('load').catch(() => {}); await idle(page).catch(() => {});
                o.scratchLanded = {url: rel(page.url()), title: await page.title(), h1: (await page.locator('h1').allInnerTexts().catch(() => [])).map((x) => flat(x, 80)),
                    privacySection: flat(await page.locator('#privacyStatement, .privacy').first().innerText().catch(() => ''), 200)};
                await snap('a9-scratch-landed', o.scratchLanded);
            }
            fact('a9', o);
        });

        // ── a7: side tabs reloaded everywhere (Rule 1; A7) ──────────────────
        await step('a7', async () => {
            const o = {};
            await as('manager.maya', PK);
            for (const slug of SLUGS) {
                await page.goto(cu(PK, `/management/settings/${slug}`)); await idle(page).catch(() => {});
                const tree = await readTabTree({reloadSide: true});
                o[slug] = tree.map((x) => ({top: `${x.tab}${x.hash}`, topReload: x.topReload && x.topReload.selected.join('>'), side: x.sideTabs.map((s) => `${s.text}${s.hash} -> reload ${s.afterReload ? s.afterReload.hash + ' [' + s.afterReload.selected.join('>') + ']' : ''}`)}));
            }
            await as(null);
            await as('admin');
            await page.goto(app.url('/index.php/index/admin/settings')); await idle(page).catch(() => {});
            const tree = await readTabTree({reloadSide: true});
            o.siteSettings = tree.map((x) => ({top: `${x.tab}${x.hash}`, side: x.sideTabs.map((s) => `${s.text}${s.hash} -> reload ${s.afterReload ? s.afterReload.hash + ' [' + s.afterReload.selected.join('>') + ']' : ''}`)}));
            await as(null);
            fact('a7', o);
        });

        // ── inst: the Institutions entry (Rule 3) — site-wide: run under the exclusive lock ──
        await step('inst', async () => {
            const o = {};
            const I = st.I || (st.I = tag('hksw1i'));
            if (!st.Icreated) {
                await app.api.createContext({tag: I, context: {name: `SW1 I ${I}`, acronym: 'SWI', country: 'CA'}, users: [{username: `${I}m`, roles: ['manager'], givenName: 'Ina', familyName: 'Manager'}]});
                st.Icreated = true; fs.writeFileSync(stateFile, JSON.stringify(st, null, 2));
            }
            const mg = `${I}m`;
            const navHas = async (who, ctx, name) => {
                await as(who, ctx);
                const d = await dashboard(ctx, name);
                const r = {institutions: d.nav.groups.some((g) => /Institutions/.test(g)), groups: d.nav.groups.filter((g) => /Institutions|Settings/.test(g))};
                await page.goto(cu(ctx, '/management/settings/institutions')); await idle(page).catch(() => {});
                r.byAddress = verdict(await classify());
                await as(null);
                return r;
            };
            const journalBox = async (tick) => {
                await as(mg, I);
                await page.goto(cu(I, '/management/settings/distribution')); await idle(page).catch(() => {});
                const hasTab = await tabBtn('statistics').count();
                if (hasTab) await pressTab('statistics');
                const box = page.locator('[role="tabpanel"]:visible input[name="enableInstitutionUsageStats"]').first();
                const r = {hasTab, box: await box.count(), checked: await box.isChecked().catch(() => null)};
                if (tick !== undefined && r.box) {
                    if (tick) await box.check({force: true}); else await box.uncheck({force: true});
                    const f = page.locator('form').filter({has: page.locator('input[name="enableInstitutionUsageStats"]')}).first();
                    const w = page.waitForResponse((x) => /\/api\/v1\/contexts\//.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
                    await f.getByRole('button', {name: 'Save', exact: true}).click();
                    r.save = (await w)?.status() ?? null;
                    await sleep(800);
                    r.navSamePage = (await readNav()).groups.some((g) => /Institutions/.test(g));
                }
                await snap(`inst-journal-box-${tick === undefined ? 'read' : tick ? 'tick' : 'untick'}`, r);
                await as(null);
                return r;
            };
            try {
                o.site0 = await app.api.setSite({enableInstitutionUsageStats: false});
                o.s0 = {admin: await navHas('admin', I, 'inst-s0-admin'), mgr: await navHas(mg, I, 'inst-s0-mgr'), box: await journalBox()};
                o.site1 = await app.api.setSite({enableInstitutionUsageStats: true});
                o.s1 = {box: await journalBox(), mgr: await navHas(mg, I, 'inst-s1-mgr')};
                o.s2 = {tick: await journalBox(true), mgr: await navHas(mg, I, 'inst-s2-mgr'), admin: await navHas('admin', I, 'inst-s2-admin')};
                if (!isOps) o.s2.ed = st.u.ped ? await navHas(st.u.ped, st.P, 'inst-s2-ped') : null;
            } finally {
                o.restored = await app.api.setSite({enableInstitutionUsageStats: false}).catch((e) => ({error: flat(e.message, 200)}));
            }
            o.s3 = {mgr: await navHas(mg, I, 'inst-s3-siteoff-mgr')};
            // OJS: payments enabled, site box off
            if (isOjs) {
                await as(mg, I);
                await page.goto(cu(I, '/management/settings/distribution')); await idle(page).catch(() => {});
                await pressTab('payments');
                const pbox = page.locator('[role="tabpanel"]:visible input[name="paymentsEnabled"]').first();
                o.payBox = await pbox.count();
                if (o.payBox) {
                    await pbox.check({force: true});
                    const f = page.locator('form').filter({has: page.locator('input[name="paymentsEnabled"]')}).first();
                    const cur = f.locator('select[name="currency"], select[id*="currency"]').first();
                    if (await cur.count()) await cur.selectOption({index: 1}).catch(() => {});
                    const w = page.waitForResponse((x) => /\/api\/v1\/contexts\//.test(x.url()) && x.request().method() !== 'GET', {timeout: T}).catch(() => null);
                    await f.getByRole('button', {name: 'Save', exact: true}).click();
                    o.paySave = (await w)?.status() ?? null;
                    await sleep(800);
                    o.payNavSamePage = (await readNav()).groups.filter((g) => /Institutions|Payments/.test(g));
                    await snap('inst-payments-saved', {nav: o.payNavSamePage});
                }
                await as(null);
                o.s4pay = {mgr: await navHas(mg, I, 'inst-s4-payments-mgr')};
            }
            fact('inst', o);
        });
    } finally {
        record('sw1-dialogs', dialogs.map(({t, ...x}) => x), {merge: false});
        await close();
    }
});
