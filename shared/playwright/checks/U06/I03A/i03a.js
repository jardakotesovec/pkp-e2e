// U06 claim check I03A (housekeeping 2026-11-03): the incidentals row on the accept wizard of a
// newcomer's invitation, and the spec lines it bears on: Rule 5 (the accept wizard per recipient),
// Rule 17 (wizard navigation, accept side) and scenario 2 ("Newcomer accepts and gets an account").
//
// PKP's default dataset (a dataset fleet). Each part makes its own scratch context through
// Administration > Hosted Journals (Presses, Servers) > "Create …" as `admin`, who becomes its
// manager and sends every invitation through Settings > Users & Roles > "Invite to a role".
// Invitees are new addresses (`<tag>…@mail.test`), except part C's member, a dataset author
// (dataset.md) who is first invited to Author on the scratch context and accepts.
//
//   PART=a  scenario 2 end to end (ORCID off): the link, "Create … account" (password minimum,
//           Pass5 refused, the consent link, a taken username), "Cancel"/"Go Back" there, a
//           Username typed and left by typing another address, "Enter details" > "Cancel" >
//           "Cancel Invitation Process", the manager's row, the link reopened, "Enter details",
//           "Review & create account" with its "Edit", accepting, "View All Submissions",
//           signing in, the role, the Invitations table.
//   PART=b  the incidentals row: Family Name, Affiliation and Country typed on "Enter details",
//           not saved, "Back" to "Create … account", "Save and continue": what "Enter details"
//           shows then, the review step, a reload, and the name the account holds (Profile and
//           the users list). Controls: the same typed without "Back"; Given Name typed with "Back".
//   PART=c  existing user (Rule 5, Rule 17): the review step alone, "Cancel" signed out and
//           signed in, the landings, the row and the roles, accepting; then ORCID enabled
//           (Settings > Users & Roles > ORCID, dummy credentials): the member's ORCID step,
//           "Cancel Invitation Process" from it, a newcomer's four steps, and the member's steps
//           once a verified iD is stamped in the database (the state ORCID's own sign-in leaves;
//           no screen makes it on a fleet that reaches no ORCID), removed again at the end.
//
// Run each part twice (r1, r2), one app per call, through the slot's app lock, e.g.:
//   bin/app-lock.sh shared ojs -- env PART=b PROBE_RUN=r1 PROBE_FEATURE=issues-cc4 PROBE_NOTES_FEATURE=U06 \
//       PROBE_AGENT=ccI03A node bin/probe.js ojs shared/playwright/checks/U06/I03A/i03a.js
// Reset the fleet first for a clean start: npm run fleet-prep -- --feature issues-cc4 --dataset 4 --reset
// Outputs: .reports/issues-cc4/ccI03A/ (record `i03a-<part>` per app and run, screens, shots).
// No other script or file is read.
const {forEachApp, launch, signIn, screen, shot, record, idle, tag, sql, note} = require('../../../probe');

const T = 30_000;
const PART = (process.env.PART || 'a').toLowerCase();
const ACR = {ojs: 'OJS', omp: 'OMP', ops: 'OPS'};
const ROLE = {ojs: 'Copyeditor', omp: 'Copyeditor', ops: 'Moderator'};
const MEMBER = {ojs: 'amwandenga', omp: 'aclark', ops: 'ccorino'};
const WORDS = {
    ojs: {hosted: 'Hosted Journals', table: 'Journals', create: 'Create Journal'},
    omp: {hosted: 'Hosted Presses', table: 'Presses', create: 'Create Press'},
    ops: {hosted: 'Hosted Servers', table: 'Servers', create: 'Create Server'},
};
const flat = (s, n = 4000) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));
const today = () => new Intl.DateTimeFormat('en-CA', {year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
const strip = (u) => String(u).replace(/^https?:\/\/[^/]+/, '').replace(/key=[^&]+/, 'key=…');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Administration > Hosted … > "Create …": name, acronym, contact, country, path, English, enabled, "Save". */
async function createContext(page, app, urlPath) {
    const {HostedJournalsPage} = require('../../../pages/HostedJournalsPages.js');
    const hosted = new HostedJournalsPage(page, WORDS[app.name]);
    await page.goto(app.url('/index.php/index/en/admin/contexts'));
    await hosted.expectOpen();
    const win = await hosted.openCreate();
    await win.type(win.title('en'), `Scratch ${urlPath}`);
    await win.type(win.initials('en'), urlPath.slice(-6).toUpperCase());
    await win.type(win.contactName, 'Scratch Contact');
    await win.type(win.contactEmail, `${urlPath}@mail.test`);
    await win.country.selectOption({label: 'Canada'});
    await win.type(win.path, urlPath);
    if (await win.languageBox('en').count()) {
        await win.setBox(win.languageBox('en'), true);
        await win.setBox(win.primaryChoice('en'), true);
    }
    await win.setBox(win.enableBox, true);
    const r = await win.pressSave();
    await page.waitForURL(/\/admin\/wizard\/\d+/, {timeout: T}).catch(() => {});
    return r.status();
}

forEachApp(async (app) => {
    const t = tag('u06i03a');
    const cp = t;
    const run = process.env.PROBE_RUN || 'r0';
    const acr = ACR[app.name];
    const facts = {app: app.name, line: app.line || 'main', run, part: PART, tag: t, steps: {}, errors: {}};
    const guard = async (name, fn) => {
        try {
            return await fn();
        } catch (e) {
            facts.errors[name] = flat(String(e.stack || e), 900);
            return null;
        }
    };
    const snap = async (page, name) => {
        const s = await screen(page);
        record(`${PART}-${name}`, s);
        return s;
    };
    const manager = await launch(app);
    const mp = manager.page;
    const browsers = [];
    const visitor = async () => {
        const b = await launch(app);
        browsers.push(b);
        return b.page;
    };

    // --- manager side -------------------------------------------------------------------------
    const access = async () => {
        await mp.goto(app.url(`/index.php/${cp}/en/management/settings/access`));
        await mp.locator('main h1').first().waitFor({timeout: T});
        await idle(mp);
    };
    const invitationRow = async (email) => {
        await access();
        // the Invitations table's row: it reads "Invited {date}" (Current Users rows do not)
        const row = mp.getByRole('row').filter({hasText: email}).filter({hasText: /Invited/}).first();
        for (let i = 0; i < 10 && !(await row.isVisible().catch(() => false)); i++) {
            const next = mp.locator('main').getByRole('button', {name: /^Next/}).first();
            if (!(await next.isEnabled().catch(() => false))) break;
            await next.click();
            await idle(mp);
        }
        return (await row.isVisible().catch(() => false)) ? flat(await row.innerText(), 300) : null;
    };
    const memberRows = async (email) => {
        await access();
        await mp.getByRole('searchbox').first().fill(email);
        await mp.keyboard.press('Enter');
        await idle(mp);
        await sleep(1000);
        return (await mp.getByRole('row').filter({hasText: email}).allInnerTexts()).map((r) => flat(r, 300));
    };
    const roleOptions = async () => mp.locator('select[name="userGroupId"]').last().evaluate((s) => [...s.options].map((o) => o.text.trim()));
    const send = async ({email, given, family, roles}) => {
        await access();
        await mp.locator('main').getByRole('button').filter({hasText: /Invite to a role/}).first().click();
        await mp.locator('input[name="search"]').fill(email);
        await mp.getByRole('button', {name: /^Search User/}).last().click();
        await mp.getByRole('button', {name: /Save And Continue/i}).waitFor({timeout: T});
        await idle(mp);
        if (given) await mp.getByLabel(/^Given Name/).first().fill(given);
        if (family) await mp.getByLabel(/^Family Name/).first().fill(family);
        const sel = mp.locator('select[name="userGroupId"]').last();
        const options = await roleOptions();
        const pick = roles.find((r) => options.includes(r));
        await sel.selectOption({label: pick});
        const row = mp.getByRole('row').filter({has: sel});
        await row.getByRole('textbox').fill(today());
        const ms = row.locator('select[name="masthead"]');
        if (await ms.count()) await ms.selectOption({label: 'Does not appear on the masthead'});
        await mp.getByRole('button', {name: /Save And Continue/i}).click();
        await mp.locator('input[name="subject"]').waitFor({timeout: T});
        await mp.locator('.composer__loadingTemplateMask').waitFor({state: 'detached', timeout: T}).catch(() => {});
        const since = new Date(Date.now() - 1000).toISOString();
        await mp.getByRole('button', {name: 'Invite user to the role'}).click();
        const sent = mp.getByRole('dialog').filter({hasText: 'Invitation Sent'});
        await sent.waitFor({timeout: T});
        const sentText = flat(await sent.innerText(), 400);
        await sent.getByRole('button', {name: 'View All Users'}).click();
        await idle(mp);
        return {role: pick, sentText, link: await acceptLink(email, since)};
    };
    const acceptLink = async (email, after) => {
        const host = new URL(app.baseURL).host;
        const deadline = Date.now() + T;
        for (;;) {
            const found = await app.mail._search({to: email, since: after});
            const links = [];
            for (const m of found.messages || []) {
                const full = await app.mail.fullMessage(m.ID);
                const hit = (full.HTML || '').includes(host) && (full.HTML || '').match(/href=['"]([^'"]*\/invitation\/accept\?[^'"]+)['"]/i);
                if (hit) links.push({date: new Date(full.Date), link: hit[1].replace(/&amp;/g, '&')});
            }
            if (links.length) return links.sort((x, y) => y.date - x.date)[0].link;
            if (Date.now() > deadline) throw new Error(`no invitation email to ${email}`);
            await sleep(1000);
        }
    };
    const contextId = () => sql(app, `select ${app.contextTables.id} from ${app.contextTables.table} where path = '${cp}'`).trim();
    const userGroups = (username) => sql(app, `select string_agg(coalesce((select setting_value from user_group_settings s where s.user_group_id = g.user_group_id and s.setting_name = 'name' and s.locale = 'en'), g.user_group_id::text), ', ' order by g.user_group_id) from user_user_groups uug join user_groups g on g.user_group_id = uug.user_group_id join users u on u.user_id = uug.user_id where u.username = '${username}' and g.context_id = ${contextId()}`).trim();
    const accountRow = (email) => sql(app, `select u.username, u.country, (select string_agg(s.setting_name || '[' || s.locale || ']=' || s.setting_value, '; ' order by s.setting_name, s.locale) from user_settings s where s.user_id = u.user_id and s.setting_name in ('givenName','familyName','affiliation','preferredPublicName')) from users u where lower(u.email) = lower('${email}')`).trim();
    const enableOrcid = async () => {
        await access();
        await mp.getByRole('tab', {name: 'ORCID', exact: true}).click();
        const box = mp.getByRole('checkbox', {name: 'Enable ORCID functionality'});
        await box.waitFor({state: 'visible', timeout: T});
        if (!(await box.isChecked())) await box.check();
        const api = mp.locator('select[name="orcidApiType"]');
        await api.waitFor({state: 'visible', timeout: T});
        await api.selectOption('publicSandbox').catch(() => api.selectOption({index: 1}));
        await mp.locator('input[name="orcidClientId"]').fill('APP-0000000000000000');
        await mp.locator('input[name="orcidClientSecret"]').fill('00000000-0000-0000-0000-000000000000');
        const saved = mp.waitForResponse((r) => /\/api\/v1\/contexts\/\d+/.test(r.url()) && r.request().method() !== 'GET', {timeout: T}).catch(() => null);
        await mp.locator('[id="orcidSettings"]').getByRole('button', {name: 'Save', exact: true}).click();
        const r = await saved;
        await snap(mp, 'orcid-settings');
        return {save: r ? r.status() : null, stored: sql(app, `select setting_name || '=' || setting_value from ${app.contextTables.settings} where ${app.contextTables.id} = ${contextId()} and setting_name in ('orcidEnabled','orcidApiType') order by 1`).split('\n')};
    };

    // --- recipient side -----------------------------------------------------------------------
    const open = async (vp, link) => {
        await vp.goto(link);
        await vp.locator('.pkpSteps, main h2').first().waitFor({timeout: T});
        await idle(vp);
        await sleep(800);
    };
    const heading = async (vp) => flat(await vp.getByRole('heading', {name: /^STEP \d/}).first().innerText({timeout: 5000}).catch(() => null), 200);
    const rail = async (vp) => (await vp.locator('main').getByRole('list').filter({hasText: 'Review & create account'}).first().getByRole('listitem').allInnerTexts().catch(() => [])).map((x) => flat(x, 80));
    const buttons = async (vp) => (await vp.locator('main').getByRole('button').allInnerTexts()).map((x) => flat(x, 60)).filter(Boolean);
    const forward = (vp) => vp.getByRole('button', {name: 'Save and continue'});
    const cancelButton = (vp) => vp.locator('main').getByRole('button', {name: 'Cancel', exact: true}).last();
    const step = async (vp, name) => {
        const s = await snap(vp, name);
        return {url: strip(vp.url()), heading: await heading(vp), rail: await rail(vp), buttons: await buttons(vp), notices: s.notices || [], main: flat(s.text && s.text.main, 1500)};
    };
    const fieldErrors = async (vp) => (await vp.locator('.pkpFormFieldError, .pkpFieldError, [id$="-error"]').allInnerTexts().catch(() => [])).map((x) => flat(x, 200)).filter(Boolean);
    const cancelDialog = async (vp, name, answer) => {
        await cancelButton(vp).click();
        const dlg = vp.getByRole('dialog').filter({hasText: 'Cancel Role Invitation Process?'});
        await dlg.waitFor({timeout: 8000});
        const s = await snap(vp, `${name}-dialog`);
        const out = {dialog: flat(s.text.dialog, 800), dialogButtons: (await dlg.getByRole('button').allInnerTexts()).map((x) => flat(x, 60))};
        if (answer === 'Go Back') {
            await dlg.getByRole('button', {name: 'Go Back'}).click();
            await dlg.waitFor({state: 'detached', timeout: 8000}).catch(() => {});
            await idle(vp);
            out.after = {dialogs: await vp.getByRole('dialog').count(), heading: await heading(vp)};
        } else {
            const nav = vp.waitForURL((u) => !/invitation\/accept/.test(u.toString()), {timeout: T}).catch(() => {});
            await dlg.getByRole('button', {name: 'Cancel Invitation Process'}).click();
            await nav;
            await vp.waitForLoadState('load').catch(() => {});
            await idle(vp);
            const l = await snap(vp, `${name}-landed`);
            out.landed = {url: strip(vp.url()), title: l.title, header: flat(l.text && l.text.header, 300), loginForm: await vp.locator('form#login').count(), main: flat(l.text && l.text.main, 300)};
        }
        return out;
    };
    const account = async (vp, {username, password}) => {
        await vp.getByLabel(/^Username/).fill(username);
        await vp.getByLabel(/^Password/).fill(password);
        const box = vp.locator('main').getByRole('checkbox').first();
        if (!(await box.isChecked())) await box.check();
        await forward(vp).click();
        await vp.getByRole('heading', {name: /Enter details/}).waitFor({timeout: T});
        await idle(vp);
        await sleep(500);
    };
    const accountFields = async (vp) => ({
        username: await vp.getByLabel(/^Username/).inputValue({timeout: 3000}).catch(() => null),
        passwordLength: (await vp.getByLabel(/^Password/).inputValue({timeout: 3000}).catch(() => '')).length,
        privacy: await vp.locator('main').getByRole('checkbox').first().isChecked({timeout: 3000}).catch(() => null),
    });
    const country = (vp) => vp.getByLabel(/^Country/).first();
    const details = async (vp) => ({
        given: await vp.getByLabel(/^Given Name/).first().inputValue({timeout: 3000}).catch(() => null),
        family: await vp.getByLabel(/^Family Name/).first().inputValue({timeout: 3000}).catch(() => null),
        affiliation: await vp.getByRole('textbox', {name: /^Affiliation/}).first().inputValue({timeout: 3000}).catch(() => null),
        country: await country(vp).evaluate((s) => (s.selectedIndex >= 0 ? s.options[s.selectedIndex].text.trim() : null), null, {timeout: 3000}).catch(() => null),
        countryLabel: flat(await country(vp).evaluate((s) => (s.labels && s.labels[0] ? s.labels[0].innerText : null), null, {timeout: 3000}).catch(() => null), 80),
        labels: (await vp.locator('main label').allInnerTexts().catch(() => [])).map((x) => flat(x, 80)),
    });
    const typeDetails = async (vp, {given, family, affiliation, countryLabel}) => {
        if (given) await vp.getByLabel(/^Given Name/).first().fill(given);
        if (family) await vp.getByLabel(/^Family Name/).first().fill(family);
        if (affiliation) await vp.getByRole('textbox', {name: /^Affiliation/}).first().fill(affiliation);
        if (countryLabel) await country(vp).selectOption({label: countryLabel});
        await sleep(300);
    };
    const back = async (vp) => {
        await vp.locator('main').getByRole('button', {name: 'Back', exact: true}).last().click();
        await idle(vp);
        await sleep(600);
    };
    const toReview = async (vp) => {
        await forward(vp).click();
        await vp.getByRole('heading', {name: /Review & create account/}).waitFor({timeout: T});
        await idle(vp);
        await sleep(500);
    };
    const acceptIt = async (vp, name) => {
        const answers = [];
        const onR = (r) => {
            if (/\/invitations\/\d+\/key\/[^/]+\/finalize/.test(r.url())) answers.push(r.status());
        };
        vp.on('response', onR);
        const acc = vp.getByRole('button', {name: new RegExp(`^Accept And Continue to ${acr}`)});
        const label = flat(await acc.innerText(), 80);
        await acc.click();
        const dlg = vp.getByRole('dialog').filter({hasText: /assigned a new role/});
        await dlg.waitFor({timeout: T}).catch(() => {});
        const s = await snap(vp, `${name}-accepted`);
        vp.off('response', onR);
        return {label, finalize: answers, dialog: flat(s.text.dialog, 400), dialogButtons: (await dlg.getByRole('button').allInnerTexts().catch(() => [])).map((x) => flat(x, 60))};
    };
    const profile = async (vp, name) => {
        const out = {};
        await vp.goto(app.url(`/index.php/${cp}/en/user/profile`));
        await vp.getByRole('heading', {name: 'Profile', exact: true}).waitFor({timeout: T}).catch(() => {});
        await idle(vp);
        await sleep(800);
        const s1 = await snap(vp, `${name}-profile-identity`);
        out.identity = {
            given: await vp.locator('input[name="givenName[en]"]').inputValue({timeout: 3000}).catch(() => null),
            family: await vp.locator('input[name="familyName[en]"]').inputValue({timeout: 3000}).catch(() => null),
            main: flat(s1.text && s1.text.main, 600),
        };
        const contact = vp.getByRole('tab', {name: 'Contact'}).or(vp.getByRole('link', {name: 'Contact', exact: true})).first();
        if (await contact.count()) {
            await contact.click();
            await idle(vp);
            await sleep(800);
            const s2 = await snap(vp, `${name}-profile-contact`);
            out.contact = {
                affiliation: await vp.locator('input[name="affiliation[en]"]').inputValue({timeout: 3000}).catch(() => null),
                country: await vp.locator('select[name="country"]').evaluate((s) => (s.selectedIndex >= 0 ? s.options[s.selectedIndex].text.trim() : null), null, {timeout: 3000}).catch(() => null),
            };
        }
        return out;
    };
    const signInAt = async (vp, username, password) => {
        await signIn(vp, username, {password, contextPath: cp});
        await idle(vp);
        return {url: strip(vp.url()), header: flat(await vp.locator('header').first().innerText({timeout: 3000}).catch(() => ''), 200)};
    };

    try {
        await signIn(mp, 'admin', {password: 'admin'});
        facts.contextSave = await createContext(mp, app, cp);
        facts.contextId = contextId();

        if (PART === 'a') {
            const s = facts.steps;
            const email = `${t}a@mail.test`;
            const user = `acc${t}`.slice(0, 32);
            const pass = `Password${t}`;
            const inv = await send({email, given: 'Nova', family: 'Quill', roles: [ROLE[app.name]]});
            s.sent = {role: inv.role, sentText: inv.sentText};
            const vp = await visitor();
            await guard('a1-link', async () => {
                await open(vp, inv.link);
                s.link = await step(vp, 'a1-create-account');
                s.link.noAccountYet = accountRow(email) || null;
                s.passwordHint = flat(await vp.getByText(/at least \d+ characters/).first().innerText({timeout: 3000}).catch(() => null), 200);
                s.consent = {label: flat(await vp.locator('main').getByRole('checkbox').first().evaluate((c) => (c.closest('label') || c.parentElement).innerText).catch(() => null), 300),
                    links: await vp.locator('main label a, main .pkpFormField--options a').evaluateAll((as) => as.map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')}))).catch(() => [])};
                s.createCancel = await cancelDialog(vp, 'a1-create-cancel', 'Go Back');
            });
            await guard('a2-leave-by-address', async () => {
                await vp.getByLabel(/^Username/).fill(user);
                await vp.goto(app.url(`/index.php/${cp}/about`));
                await idle(vp);
                s.leftTo = strip(vp.url());
                await open(vp, inv.link);
                s.reopenedAfterLeaving = {heading: await heading(vp), fields: await accountFields(vp)};
                await snap(vp, 'a2-reopened');
            });
            await guard('a3-password', async () => {
                await vp.getByLabel(/^Username/).fill(user);
                await vp.getByLabel(/^Password/).fill('Pass5');
                const box = vp.locator('main').getByRole('checkbox').first();
                if (!(await box.isChecked())) await box.check();
                await forward(vp).click();
                await idle(vp);
                await sleep(1200);
                const st = await step(vp, 'a3-pass5');
                s.pass5 = {heading: st.heading, errors: await fieldErrors(vp), notices: st.notices};
            });
            await guard('a4-taken', async () => {
                await vp.getByLabel(/^Username/).fill('admin');
                await vp.getByLabel(/^Password/).fill(pass);
                await forward(vp).click();
                await idle(vp);
                await sleep(1200);
                const st = await step(vp, 'a4-taken');
                s.taken = {heading: st.heading, errors: await fieldErrors(vp), notices: st.notices};
            });
            await guard('a5-details-cancel', async () => {
                await account(vp, {username: user, password: pass});
                s.details1 = {...(await step(vp, 'a5-details')), fields: await details(vp)};
                s.detailsCancel = await cancelDialog(vp, 'a5-details-cancel', 'Cancel Invitation Process');
            });
            s.rowAfterCancel = await guard('a6-row', () => invitationRow(email));
            await guard('a7-reopen', async () => {
                await open(vp, inv.link);
                s.reopened = {heading: await heading(vp), fields: await accountFields(vp)};
                await snap(vp, 'a7-reopened');
                await account(vp, {username: user, password: pass});
                s.details2 = {...(await step(vp, 'a7-details')), fields: await details(vp)};
                await country(vp).selectOption({label: 'Canada'});
                await toReview(vp);
                s.review = await step(vp, 'a8-review');
                const edit = vp.locator('main').getByRole('button', {name: 'Edit', exact: true});
                s.reviewEditButtons = await edit.count();
                await edit.first().click();
                await idle(vp);
                await sleep(500);
                s.afterEdit = {heading: await heading(vp), fields: await details(vp)};
                await snap(vp, 'a8-after-edit');
                await toReview(vp);
                s.reviewAgain = {heading: await heading(vp)};
                s.accepted = await acceptIt(vp, 'a9');
                const dlg = vp.getByRole('dialog').filter({hasText: /assigned a new role/});
                await Promise.all([
                    vp.waitForURL((u) => !/\/invitation\/accept/.test(String(u)), {timeout: T}).catch(() => {}),
                    dlg.getByRole('button', {name: 'View All Submissions'}).click(),
                ]);
                await vp.waitForLoadState('load').catch(() => {});
                await idle(vp);
                const l = await snap(vp, 'a10-after-view-all');
                s.afterViewAll = {url: strip(vp.url()), loginForm: await vp.locator('form#login').count(), header: flat(l.text && l.text.header, 200)};
            });
            await guard('a11-sign-in', async () => {
                s.signedIn = await signInAt(vp, user, pass);
                await snap(vp, 'a11-signed-in');
            });
            s.groups = userGroups(user);
            s.account = accountRow(email);
            s.rowAfterAccept = await guard('a12-row', () => invitationRow(email));
            s.memberRows = await guard('a12-member', () => memberRows(email));
            await snap(mp, 'a12-users-list');
        }

        if (PART === 'b') {
            const cases = [
                {key: 'b1', back: true, typed: {family: 'Quilltyped', affiliation: 'Typed University', countryLabel: 'Canada'}, reload: true},
                {key: 'b2', back: false, typed: {given: 'Givtyped', family: 'Quilltyped', affiliation: 'Typed University', countryLabel: 'Canada'}},
                {key: 'b3', back: true, typed: {given: 'Givtyped', countryLabel: 'Canada'}},
            ];
            for (const c of cases) {
                const o = (facts.steps[c.key] = {back: c.back, typed: c.typed});
                const email = `${t}${c.key}@mail.test`;
                const user = `${c.key}${t}`.slice(0, 32);
                const pass = `Password${t}`;
                await guard(`${c.key}-send`, async () => {
                    const inv = await send({email, given: 'Ina', family: 'Nonce', roles: [ROLE[app.name]]});
                    o.link = inv.link;
                });
                if (!o.link) continue;
                const vp = await visitor();
                await guard(`${c.key}-walk`, async () => {
                    await open(vp, o.link);
                    o.first = await heading(vp);
                    await account(vp, {username: user, password: pass});
                    o.arrived = await details(vp);
                    await snap(vp, `${c.key}-details-arrived`);
                    await typeDetails(vp, c.typed);
                    o.typedOnScreen = await details(vp);
                    if (c.back) {
                        await back(vp);
                        o.afterBack = {...(await step(vp, `${c.key}-after-back`)), fields: await accountFields(vp)};
                        await forward(vp).click();
                        await vp.getByRole('heading', {name: /Enter details/}).waitFor({timeout: T});
                        await idle(vp);
                        await sleep(800);
                        o.detailsAgain = {...(await step(vp, `${c.key}-details-again`)), fields: await details(vp)};
                    }
                    await toReview(vp);
                    o.review = await step(vp, `${c.key}-review`);
                    if (c.reload) {
                        await vp.reload();
                        await vp.locator('.pkpSteps, main h2').first().waitFor({timeout: T});
                        await idle(vp);
                        await sleep(800);
                        o.afterReload = {...(await step(vp, `${c.key}-reloaded`)), account: await accountFields(vp)};
                        if (/Create/.test(o.afterReload.heading || '')) {
                            await account(vp, {username: user, password: pass});
                            o.detailsAfterReload = {...(await step(vp, `${c.key}-details-after-reload`)), fields: await details(vp)};
                            if (!o.detailsAfterReload.fields.country || /Select|^$/.test(o.detailsAfterReload.fields.country)) await country(vp).selectOption({label: 'Canada'});
                            await toReview(vp);
                            o.reviewAfterReload = await step(vp, `${c.key}-review-after-reload`);
                        }
                    }
                    o.accepted = await acceptIt(vp, c.key);
                });
                o.account = accountRow(email);
                await guard(`${c.key}-profile`, async () => {
                    const pp = await visitor();
                    o.signedIn = await signInAt(pp, user, pass);
                    o.profile = await profile(pp, c.key);
                });
                o.memberRows = await guard(`${c.key}-member`, () => memberRows(email));
            }
            await snap(mp, 'b-users-list');
        }

        if (PART === 'c') {
            const s = facts.steps;
            const member = MEMBER[app.name];
            const mpass = `${member}${member}`;
            const memail = `${member}@mailinator.com`;
            s.member = member;
            // the member's usual landing, signed in fresh on the scratch context
            await guard('c0-usual-landing', async () => {
                const lp = await visitor();
                s.usualLandingBefore = await signInAt(lp, member, mpass);
            });
            // 1. Author on the scratch context, accepted signed out
            await guard('c1-author', async () => {
                const inv = await send({email: memail, roles: ['Author']});
                s.c1 = {role: inv.role};
                const vp = await visitor();
                await open(vp, inv.link);
                s.c1.opened = await step(vp, 'c1-review');
                s.c1.groupsBeforeAccept = userGroups(member);
                s.c1.accepted = await acceptIt(vp, 'c1');
                s.c1.groupsAfter = userGroups(member);
            });
            await guard('c1-usual-landing', async () => {
                const lp = await visitor();
                s.usualLanding = await signInAt(lp, member, mpass);
                await snap(lp, 'c1-usual-landing');
            });
            // 2. a further role: Cancel signed out, signed in; the row, the roles; accept
            let link2 = null;
            await guard('c2-send', async () => {
                const inv = await send({email: memail, roles: [ROLE[app.name]]});
                s.c2 = {role: inv.role};
                link2 = inv.link;
            });
            if (link2) {
                await guard('c2-signed-out', async () => {
                    const vp = await visitor();
                    await open(vp, link2);
                    s.c2.out = await step(vp, 'c2-out-review');
                    s.c2.goBack = await cancelDialog(vp, 'c2-out-goback', 'Go Back');
                    s.c2.outCancel = await cancelDialog(vp, 'c2-out-cancel', 'Cancel Invitation Process');
                    await vp.locator('input#username').fill(member);
                    await vp.locator('input#password').fill(mpass);
                    await vp.locator('form#login button[type="submit"]').click();
                    await vp.waitForURL((u) => !/\/login/.test(u.toString()), {timeout: T}).catch(() => {});
                    await idle(vp);
                    const l = await snap(vp, 'c2-out-signed-in');
                    s.c2.afterSignIn = {url: strip(vp.url()), main: flat(l.text && l.text.main, 300)};
                    // 3. signed in as themselves
                    await open(vp, link2);
                    s.c2.in = await step(vp, 'c2-in-review');
                    s.c2.inCancel = await cancelDialog(vp, 'c2-in-cancel', 'Cancel Invitation Process');
                });
                s.c2.row = await guard('c2-row', () => invitationRow(memail));
                s.c2.groupsAfterCancels = userGroups(member);
                await guard('c2-accept', async () => {
                    const vp = await visitor();
                    await open(vp, link2);
                    s.c2.reopened = await step(vp, 'c2-reopened');
                    s.c2.accepted = await acceptIt(vp, 'c2');
                    s.c2.groupsAfter = userGroups(member);
                });
                s.c2.rowAfterAccept = await guard('c2-row-after', () => invitationRow(memail));
            }
            // 4. ORCID on
            s.orcid = await guard('c3-orcid', enableOrcid);
            let link3 = null;
            await guard('c3-send', async () => {
                const inv = await send({email: memail, roles: ['Reviewer', 'Proofreader', 'Layout Editor', 'Reader', 'Internal Reviewer', 'External Reviewer', 'Production editor'].filter((r) => r !== ROLE[app.name])});
                s.c3 = {role: inv.role};
                link3 = inv.link;
            });
            if (link3) {
                await guard('c3-member-orcid', async () => {
                    const vp = await visitor();
                    await open(vp, link3);
                    s.c3.first = await step(vp, 'c3-member-first');
                    s.c3.goBack = await cancelDialog(vp, 'c3-orcid-goback', 'Go Back');
                    s.c3.cancel = await cancelDialog(vp, 'c3-orcid-cancel', 'Cancel Invitation Process');
                    s.c3.row = await invitationRow(memail);
                    s.c3.groups = userGroups(member);
                    await open(vp, link3);
                    s.c3.reopened = {heading: await heading(vp), rail: await rail(vp)};
                    const skip = vp.getByRole('button', {name: 'Skip ORCID verification'});
                    if (await skip.count()) {
                        await skip.click();
                        await idle(vp);
                        await sleep(500);
                        s.c3.afterSkip = await step(vp, 'c3-after-skip');
                    }
                });
                // a verified iD on the member, then the same link
                await guard('c4-verified', async () => {
                    const uid = sql(app, `select user_id from users where username = '${member}'`).trim();
                    sql(app, `insert into user_settings (user_id, locale, setting_name, setting_value) values (${uid}, '', 'orcid', 'https://sandbox.orcid.org/0000-0002-1825-0097'), (${uid}, '', 'orcidIsVerified', '1') on conflict do nothing`);
                    s.c4 = {stamped: sql(app, `select setting_name || '=' || setting_value from user_settings where user_id = ${uid} and setting_name like 'orcid%' order by 1`).split('\n')};
                    const vp = await visitor();
                    await open(vp, link3);
                    s.c4.opened = await step(vp, 'c4-verified-member');
                });
                await guard('c4-unstamp', async () => {
                    const uid = sql(app, `select user_id from users where username = '${member}'`).trim();
                    sql(app, `delete from user_settings where user_id = ${uid} and setting_name in ('orcid', 'orcidIsVerified')`);
                });
            }
            // 5. a newcomer with ORCID on
            await guard('c5-newcomer-orcid', async () => {
                const email = `${t}c5@mail.test`;
                const inv = await send({email, given: 'Nova', family: 'Quill', roles: [ROLE[app.name]]});
                const vp = await visitor();
                await open(vp, inv.link);
                s.c5 = {first: await step(vp, 'c5-newcomer-orcid')};
                s.c5.cancel = await cancelDialog(vp, 'c5-orcid-cancel', 'Cancel Invitation Process');
                await open(vp, inv.link);
                await vp.getByRole('button', {name: 'Skip ORCID verification'}).click();
                await idle(vp);
                await sleep(500);
                s.c5.afterSkip = await step(vp, 'c5-after-skip');
            });
        }
    } catch (e) {
        facts.errors.top = flat(String(e.stack || e), 1500);
    } finally {
        record(`i03a-${PART}`, facts);
        await shot(mp, `${PART}-manager-end`).catch(() => {});
        for (const b of browsers) await b.close().catch(() => {});
        await manager.close();
    }
    if (Object.keys(facts.errors).length) note(`ccI03A [${app.name}] part ${PART} ${run}: errors in ${Object.keys(facts.errors).join(', ')}`);
});
