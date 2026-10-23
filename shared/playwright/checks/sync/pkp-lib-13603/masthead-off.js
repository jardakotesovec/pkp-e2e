// PR review of pkp-lib#13603 + ui-library#1027 (issue pkp/pkp-lib#13370 part 2,
// stable-3_5_0): with "Present a masthead based on user enrollments" off, the
// role form drops "Consider role in masthead list" (and an edit keeps the
// role's stored value), and the invitation wizard and the acceptance review
// drop the masthead column. One scratch context per run; records absence, so
// it runs unchanged at the PR's base and head.
//   on    the new-context default (box ticked): role form box, invitation
//         row, email, reviewer forms' masthead line
//   off   the box unticked through Appearance: role edit (stored value
//         before/after a save), a new role, invitations to an editor role and
//         to Reviewer, an invitation to a person who already holds a listed
//         role, "Edit user", the invitee's acceptance review, the reviewer forms
//   unset the setting row deleted (as on a context upgraded without it):
//         the role form, the wizard's columns and a send
// RUN=b1 PROBE_FEATURE=sync-3_5 PROBE_AGENT=pr13603 PKP_E2E_LINE=stable-3_5_0 node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13603/masthead-off.js
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, sql, tag} = require('../../../probe');

const RUN = process.env.RUN || 'r1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 1500) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const REVIEWER = {ojs: 'Reviewer', omp: 'External Reviewer'};
const SE = {ojs: 'Section editor', omp: 'Series editor', ops: 'Moderator'};
const MASTHEAD_BOX = 'Consider role in masthead list';

function today() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

forEachApp(async (app) => {
    const {expect} = require('@playwright/test');
    const {WebsiteSettings} = require(path.join(process.cwd(), 'shared/playwright/pages/AppearancePages.js'));
    const {RolesTab, RoleWindow} = require(path.join(process.cwd(), 'shared/playwright/pages/RolesConfigurationPages.js'));
    const T = tag('p13603');
    const facts = {app: app.name, run: RUN, tag: T, errors: {}, pageErrors: []};
    const save = () => record(`facts-${RUN}`, facts);
    const snap = async (page, name) => {
        const s = await screen(page);
        record(`${RUN}-${name}`, s);
        await shot(page, `${RUN}-${name}`);
        return s;
    };
    const step = async (key, fn) => {
        try {
            await fn();
        } catch (e) {
            facts.errors[key] = String(e.stack || e).slice(0, 1200);
            console.error(`[${app.name}] ${key} FAILED: ${e.message}`);
        }
        save();
    };
    const mail = (u) => `${u}${T}@mail.test`;
    const lastYear = new Date().getUTCFullYear() - 1;
    const {table: ctxTable, id: ctxId, settings: ctxSettings} = app.contextTables;
    let contextId = null;
    let submission = null;

    await step('seed', async () => {
        const users = [
            {username: `mgr${T}`, roles: ['manager']},
            {username: `se${T}`, givenName: 'Sela', familyName: 'Editorwoman', roles: ['sectionEditor']},
            {username: `au${T}`, givenName: 'Aldo', familyName: 'Invitee', roles: ['author']},
            {username: `au2${T}`, givenName: 'Ada', familyName: 'Unsetcase', roles: ['author']},
            {username: `rd${T}`, givenName: 'Rhea', familyName: 'Readerinvite', roles: ['reader']},
            {username: `su${T}`, givenName: 'Sumi', familyName: 'Submitter', roles: ['author']},
        ];
        if (REVIEWER[app.name]) users.push({username: `rv${T}`, givenName: 'Ravi', familyName: 'Lastyear', roles: ['externalReviewer']});
        await app.api.createContext({tag: T, users});
        contextId = sql(app, `select ${ctxId} from ${ctxTable} where path = '${T}'`);
        facts.contextId = contextId;
        if (REVIEWER[app.name]) {
            submission = await app.api.createSubmission({
                tag: `${T}s`, context: T, submitter: `su${T}`,
                decisions: ['sendExternalReview'],
                reviewRounds: [{reviewers: [{username: `rv${T}`, status: 'completed', dateCompleted: `${lastYear}-06-15`}]}],
            });
            facts.submission = (submission && (submission.id || submission.submissionId)) || sql(app, `select max(submission_id) from submissions where context_id = ${contextId}`) || null;
        }
        facts.seeded = true;
    });

    const setting = () => sql(app, `select coalesce((select setting_value from ${ctxSettings} where ${ctxId} = ${contextId} and setting_name = 'enableEnrollmentMasthead'), '<no row>')`);
    const groupId = (name) => sql(app, `select ug.user_group_id from user_groups ug join user_group_settings s on s.user_group_id = ug.user_group_id and s.setting_name = 'name' where ug.context_id = ${contextId} and s.setting_value = '${name}' limit 1`);
    const groupMasthead = (name) => sql(app, `select ug.masthead from user_groups ug join user_group_settings s on s.user_group_id = ug.user_group_id and s.setting_name = 'name' where ug.context_id = ${contextId} and s.setting_value = '${name}' limit 1`);

    const readAll = async (to) => {
        const res = await app.mail._search({to});
        const out = [];
        for (const m of (res.messages || [])) {
            const full = await app.mail.fullMessage(m.ID);
            const text = (full.Text || '').replace(/\r/g, '');
            const html = full.HTML || '';
            out.push({
                subject: full.Subject, created: m.Created,
                masthead: flat(text, 4000).match(/[^.]*masthead[^.]*\./gi) || [],
                link: ((html + text).match(/https?:\/\/[^\s"'<>]*invitation[^\s"'<>]*/i) || [null])[0],
                text: flat(text, 1500),
            });
        }
        return out;
    };
    const mailWith = async (to, marker) => {
        for (let i = 0; i < 30; i++) {
            const all = await readAll(to);
            const m = all.find((x) => x.subject === marker);
            if (m) return m;
            await sleep(1000);
        }
        return {error: `no mail "${marker}" to ${to}`};
    };

    const gotoAccess = async (page) => {
        await page.goto(`/index.php/${T}/management/settings/access`);
        await expect(page.getByRole('table', {name: /^Current Users \(/}).locator('tbody tr').first()).toBeVisible({timeout: 30_000});
        await idle(page);
    };
    const userRow = (page, text) => page.getByRole('table', {name: /^Current Users \(/}).locator('tbody tr').filter({hasText: text});
    const headers = async (page) => (await page.getByRole('columnheader').allInnerTexts()).map((h) => flat(h, 80));
    const openFor = async (page, to, key) => {
        await gotoAccess(page);
        await page.getByRole('button', {name: 'Invite to a role'}).click();
        await expect(page.getByRole('heading', {name: /Search User/})).toBeVisible({timeout: 30_000});
        await idle(page);
        await page.getByLabel(/Search for a user by email address/).fill(to);
        await page.getByRole('button', {name: 'Search User', exact: true}).click();
        await expect(page.getByRole('heading', {name: /Enter details/})).toBeVisible({timeout: 30_000});
        await idle(page);
        const s = await snap(page, `${key}-01-enter-details`);
        return {headers: await headers(page), intro: flat(s.text.main, 500)};
    };
    const newRow = (page) => page.getByRole('row').filter({has: page.getByLabel(/^Select a new role/)}).last();
    const fillNewRow = async (page, role, choice = 'Appear on the masthead') => {
        if (!(await newRow(page).count())) await page.getByRole('button', {name: 'Add Another Role'}).click();
        const r = newRow(page);
        await r.getByLabel(/^Select a new role/).selectOption({label: role});
        await r.getByRole('textbox').fill(today());
        const combos = r.getByRole('combobox');
        const n = await combos.count();
        if (n > 1 && choice) await combos.last().selectOption({label: choice});
        await sleep(300);
        return {rowText: flat(await r.innerText(), 400), combos: n, cells: await r.getByRole('cell').count()};
    };
    // The payload the wizard last sent (the invitation PUT with userGroupsToAdd).
    const payloads = [];
    const watchPayload = (page) => page.on('request', (req) => {
        if (/\/api\/v1\/invitations/.test(req.url()) && req.method() !== 'GET') {
            const body = req.postData() || '';
            if (body.includes('userGroupsToAdd')) {
                try {
                    payloads.push(JSON.parse(body).userGroupsToAdd || JSON.parse(body).invitationData?.userGroupsToAdd || body.slice(0, 600));
                } catch {
                    payloads.push(body.slice(0, 600));
                }
            }
        }
    });
    const composeAndSend = async (page, marker, key) => {
        const out = {};
        payloads.length = 0;
        await page.getByRole('button', {name: 'Save And Continue'}).click();
        const subject = page.getByLabel(/^Subject/);
        out.composeReached = await subject.waitFor({state: 'visible', timeout: 30_000}).then(() => true).catch(() => false);
        if (!out.composeReached) {
            out.stuck = flat((await snap(page, `${key}-03-no-compose`)).text.main, 800);
            out.payloads = [...payloads];
            return out;
        }
        await expect(subject).not.toHaveValue('', {timeout: 30_000});
        await expect(page.frameLocator('iframe').locator('body')).not.toHaveText('', {timeout: 30_000});
        await idle(page);
        await snap(page, `${key}-03-compose`);
        out.composeMasthead = flat(await page.frameLocator('iframe').locator('body').innerText().catch(() => ''), 4000).match(/[^.]*masthead[^.]*\./gi) || [];
        await subject.fill(marker);
        await page.getByRole('button', {name: 'Invite user to the role'}).click();
        const sent = page.getByRole('dialog').filter({hasText: 'Invitation Sent'});
        out.sentShown = await sent.waitFor({state: 'visible', timeout: 30_000}).then(() => true).catch(() => false);
        await snap(page, `${key}-04-sent`);
        if (out.sentShown) await sent.getByRole('button', {name: 'View All Users'}).click().catch(() => {});
        out.payloads = [...payloads];
        return out;
    };
    const masthead = async (page, key) => {
        const resp = await page.goto(`/index.php/${T}/about/editorialMasthead`);
        await idle(page);
        const s = await snap(page, key);
        return {status: resp && resp.status(), text: flat(s.text.main || s.text.body, 800)};
    };
    // The role window for a role (Edit) or "Create New Role", without the page
    // object's readiness wait, which needs the masthead box.
    const roleWindow = async (page, name, key) => {
        const tab = new RolesTab(page, T, {stages: []});
        await tab.goto();
        if (name) {
            const line = await tab.openRowActions(name);
            await line.getByRole('link', {name: 'Edit', exact: true}).click();
        } else {
            await tab.createLink.click();
        }
        const win = new RoleWindow(page);
        await expect(win.form).toBeVisible({timeout: 30_000});
        await expect(win.level).toBeAttached({timeout: 30_000});
        await idle(page);
        await snap(page, key);
        const box = win.form.getByRole('checkbox', {name: MASTHEAD_BOX, exact: true});
        const boxes = (await win.form.getByRole('checkbox').evaluateAll((els) => els.map((e) => (e.labels && e.labels[0] ? e.labels[0].innerText : e.name).trim())));
        return {win, out: {boxes, mastheadBox: await box.count(), mastheadChecked: (await box.count()) ? await box.isChecked() : null}};
    };
    // The reviewer forms' masthead line ("Create New Reviewer", "Enroll Existing User").
    const reviewerForms = async (page) => {
        if (!REVIEWER[app.name] || !facts.submission) return {skipped: 'no reviewer role or no submission'};
        const round = sql(app, `select review_round_id from review_rounds where submission_id = ${facts.submission} order by review_round_id desc limit 1`);
        await page.goto(`/index.php/${T}/management/settings/access`);
        const out = {round};
        for (const [label, type] of [['create', 2], ['enroll', 3]]) {
            const r = await page.request.get(`/index.php/${T}/$$$call$$$/grid/users/reviewer/reviewer-grid/show-reviewer-form?submissionId=${facts.submission}&stageId=3&reviewRoundId=${round}&selectionType=${type}`);
            const body = await r.text();
            let html = '';
            try {
                html = JSON.parse(body).content || '';
            } catch {
                html = body;
            }
            const i = html.indexOf('id="masthead');
            out[label] = {
                status: r.status(),
                mastheadBox: i >= 0,
                around: i >= 0 ? flat(html.slice(Math.max(0, i - 700), i + 400).replace(/<[^>]+>/g, ' '), 300) : null,
            };
        }
        return out;
    };

    const {page: mp} = await launch(app);
    const {page: vp} = await launch(app);
    const {page: ip} = await launch(app);
    for (const p of [mp, vp, ip]) p.on('pageerror', (e) => facts.pageErrors.push(flat(String(e), 300)));
    watchPayload(mp);
    try {
        await signIn(mp, `mgr${T}`);

        // ── on: the new-context default ─────────────────────────────────
        facts.on = {};
        await step('on', async () => {
            const out = facts.on;
            out.setting = setting();
            const {win, out: rf} = await roleWindow(mp, SE[app.name], 'on-01-role-edit');
            out.roleForm = rf;
            await win.cancel();
            out.invite = await openFor(mp, mail('rd'), 'on-inv');
            out.invite.row = await fillNewRow(mp, SE[app.name]);
            out.invite.headersFilled = await headers(mp);
            await snap(mp, 'on-inv-02-row');
            out.invite.send = await composeAndSend(mp, `On${T}rd`, 'on-inv');
            out.invite.mail = await mailWith(mail('rd'), `On${T}rd`);
            out.reviewerForms = await reviewerForms(mp);
        });

        // ── untick the enrollment masthead through the screen ───────────
        facts.off = {};
        await step('untick', async () => {
            const ws = new WebsiteSettings(mp, T);
            await ws.goto();
            await ws.openSideTab('appearance-masthead');
            const form = mp.locator('[id="appearance-masthead"] form');
            const box = form.locator('[id^="appearanceMasthead-enableEnrollmentMasthead-"] input[type="checkbox"], input[type="checkbox"][name="enableEnrollmentMasthead"]').first();
            facts.off.boxBefore = await box.isChecked();
            await form.getByText('Present a masthead based on user enrollments').click();
            await form.getByRole('button', {name: 'Save', exact: true}).click();
            await expect(form.locator('.pkpFormPage__status', {hasText: 'Saved'})).toBeVisible({timeout: 30_000});
            facts.off.setting = setting();
            facts.off.masthead = await masthead(vp, 'off-00-masthead');
        });

        await step('off-role', async () => {
            const out = facts.off.role = {};
            const se = SE[app.name];
            out.groupId = groupId(se);
            out.storedBefore = groupMasthead(se);
            const {win, out: rf} = await roleWindow(mp, se, 'off-01-role-edit');
            out.form = rf;
            const resp = await win.save();
            out.saveStatus = resp.status();
            out.storedAfterSave = groupMasthead(se);
            // a new role while the masthead is off
            const created = await roleWindow(mp, null, 'off-02-role-create');
            out.createForm = created.out;
            await created.win.nameBox().fill(`Probe role ${T}`);
            await created.win.abbrevBox().fill('PR');
            await created.win.level.selectOption({index: 1}).catch(() => {});
            out.createStatus = (await created.win.save()).status();
            out.createdStored = groupMasthead(`Probe role ${T}`);
        });

        await step('off-invite-editor', async () => {
            const out = facts.off.inviteEditor = await openFor(mp, mail('au'), 'off-inv');
            out.row = await fillNewRow(mp, SE[app.name]);
            out.headersFilled = await headers(mp);
            await snap(mp, 'off-inv-02-row');
            out.send = await composeAndSend(mp, `Off${T}au`, 'off-inv');
            out.mail = await mailWith(mail('au'), `Off${T}au`);
        });

        if (REVIEWER[app.name]) await step('off-invite-reviewer', async () => {
            const out = facts.off.inviteReviewer = await openFor(mp, mail('rd'), 'off-rev');
            out.row = await fillNewRow(mp, REVIEWER[app.name]);
            out.headersFilled = await headers(mp);
            await snap(mp, 'off-rev-02-row');
            out.send = await composeAndSend(mp, `Off${T}rd`, 'off-rev');
            out.mail = await mailWith(mail('rd'), `Off${T}rd`);
        });

        // the editor (listed role held, stored "appear") invited to Author
        await step('off-invite-holder', async () => {
            const out = facts.off.inviteHolder = await openFor(mp, mail('se'), 'off-hold');
            out.row = await fillNewRow(mp, 'Author');
            out.headersFilled = await headers(mp);
            out.heldCombos = await mp.getByRole('row').filter({hasText: SE[app.name]}).filter({hasNot: mp.getByLabel(/^Select a new role/)}).getByRole('combobox').count();
            await snap(mp, 'off-hold-02-row');
            out.send = await composeAndSend(mp, `Off${T}se`, 'off-hold');
            out.mail = await mailWith(mail('se'), `Off${T}se`);
        });

        await step('off-edit-user', async () => {
            const out = facts.off.editUser = {};
            await gotoAccess(mp);
            await userRow(mp, mail('se')).getByRole('button').last().click();
            await mp.getByRole('menuitem', {name: 'Edit', exact: true}).click();
            await expect(mp.getByRole('heading', {name: /Enter details/})).toBeVisible({timeout: 30_000});
            await idle(mp);
            await snap(mp, 'off-edit-01');
            out.headers = await headers(mp);
            out.heldCombos = await mp.getByRole('row').filter({hasText: SE[app.name]}).filter({hasNot: mp.getByLabel(/^Select a new role/)}).getByRole('combobox').count();
        });

        // the invitee opens the editor invitation and reaches its review step
        await step('off-accept', async () => {
            const out = facts.off.accept = {};
            const link = facts.off.inviteEditor && facts.off.inviteEditor.mail && facts.off.inviteEditor.mail.link;
            out.link = link ? link.replace(/key=[^&]+/, 'key=…') : null;
            if (!link) throw new Error('no invitation link in the email');
            await signIn(ip, `au${T}`);
            await ip.goto(link.replace(/&amp;/g, '&'));
            await idle(ip);
            out.pages = [];
            for (let i = 0; i < 4; i++) {
                const s = await snap(ip, `off-acc-0${i}`);
                out.pages.push({url: ip.url().replace(/key=[^&]+/, 'key=…'), headers: await headers(ip), text: flat(s.text.main || s.text.body, 400)});
                const next = ip.getByRole('button', {name: /^(Next|Continue|Save And Continue|Accept And Continue)$/});
                if (!(await next.count()) || !(await next.first().isEnabled())) break;
                await next.first().click();
                await idle(ip);
                await sleep(800);
            }
        });

        await step('off-reviewer-forms', async () => {
            facts.off.reviewerForms = await reviewerForms(mp);
        });

        // ── unset: the setting row deleted ───────────────────────────────
        facts.unset = {};
        await step('unset', async () => {
            const out = facts.unset;
            sql(app, `delete from ${ctxSettings} where ${ctxId} = ${contextId} and setting_name = 'enableEnrollmentMasthead'`);
            out.setting = setting();
            out.api = await mp.request.get(`/index.php/${T}/api/v1/contexts/${contextId}`).then(async (r) => (await r.json()).enableEnrollmentMasthead).catch((e) => `err ${e.message}`);
            const {win, out: rf} = await roleWindow(mp, SE[app.name], 'unset-01-role-edit');
            out.roleForm = rf;
            await win.cancel();
            out.invite = await openFor(mp, mail('au2'), 'unset-inv');
            out.invite.row = await fillNewRow(mp, SE[app.name]);
            out.invite.headersFilled = await headers(mp);
            out.invite.send = await composeAndSend(mp, `Unset${T}au2`, 'unset-inv');
            out.invite.mail = await mailWith(mail('au2'), `Unset${T}au2`);
            out.masthead = await masthead(vp, 'unset-02-masthead');
        });
    } finally {
        await signOut(ip).catch(() => {});
        save();
    }
});
