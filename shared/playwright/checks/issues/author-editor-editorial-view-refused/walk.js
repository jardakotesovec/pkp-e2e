// Issue report U24 A12, A13, OPS6 (housekeeping 2026-10-21, reporter h21i): a journal, press or
// preprint server manager who is the submission's Author, opening it at the editorial dashboard's
// address, gets the editorial view, whose panels and decisions the server then refuses.
//
// On PKP's default test dataset (a dataset fleet, harness.md "Dataset fleets"), `publicknowledge`.
// The role is given on screen (admin › Users & Roles › "Invite to a role", accepted from the email),
// so reset the fleet before each run. The kit builds nothing.
//
// Modes (MODE, default `walk`):
//   walk  the Steps: grant; the author-editor's "Active submissions" row; the editorial address of
//         their own submission (dialogs, "Files for Review", decision buttons); OJS/OMP "Request
//         Revisions" › "Next"; OPS "Post the preprint"; the My Submissions address (control);
//         `dbarnes` on the same editorial address (control).
//   nb    the neighbour check for a fix: grant; the author-editor on a submission that is not theirs
//         (must keep the editorial view); `dbarnes` on the authored one (must keep it too).
//   role  ROLE=sub|asst: the author is given a Section editor (OMP Series editor, OPS Moderator) or
//         an assistant role (Copyeditor; OPS Editorial Board Member) instead, then opens the same
//         editorial address of their own submission.
//   keys  grant; the editorial address with `currentViewId` and the stage's `workflowMenuKey` added.
//   mail  grant; `dbarnes` opens a discussion with the author-editor on the stage; the author-editor
//         follows the "Reply to this comment at #…" link of their email.
//
// Reset:  npm run fleet-prep -- --feature issues-h21i --dataset 4 --reset
// Run:    PROBE_FEATURE=issues-h21i PROBE_AGENT=h21i bin/app-lock.sh shared ojs -- \
//           node bin/probe.js ojs shared/playwright/checks/issues/author-editor-editorial-view-refused/walk.js
// 3.5:    PKP_E2E_LINE=stable-3_5_0 PROBE_RUN=r35 PROBE_FEATURE=issues-h21i-3_5 … (same command)
// Facts:  .reports/<feature>/h21i/aev-<mode>-<run>-<app>.json
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, serverLog, sql} = require('../../../probe');
const {sleep, flat, wfInfo, settle, dismissError, filesForReview, inviteToRole, acceptInvitation} = require('./lib');

const MODE = process.env.MODE || 'walk';
const RUNTAG = MODE === 'role' ? `role-${process.env.ROLE || 'sub'}` : MODE;
const TAG = 'h21i';
const CASES = {
    ojs: {sub: 2, author: 'ccorino', authorName: 'Carlo Corino', role: 'Journal editor', sub_: 'Section editor', asst: 'Copyeditor', other: 4, title: 'The influence of lactation', menuKey: 'workflow_3_2', panel: 'Review Tasks & Discussions'},
    omp: {sub: 2, author: 'afinkel', authorName: 'Alvin Finkel', role: 'Press editor', sub_: 'Series editor', asst: 'Copyeditor', other: 3, title: 'The West and Beyond', menuKey: 'workflow_3_2', panel: 'Review Tasks & Discussions'},
    ops: {sub: 1, author: 'ccorino', authorName: 'Carlo Corino', role: 'Preprint Server manager', sub_: 'Moderator', asst: 'Editorial Board Member', other: 2, title: 'The influence of lactation', menuKey: 'workflow_5', panel: 'Production Tasks & Discussions'},
};

forEachApp(async (app) => {
    const c = CASES[app.name];
    const RUN = process.env.PROBE_RUN || 'main';
    const o = {app: app.name, line: app.line || 'main', mode: MODE, run: RUN, case: c};
    const {page, close} = await launch(app);
    const log = serverLog(app);
    const from = log.mark();
    const bad = [];
    page.on('response', async (r) => {
        if (r.status() < 400) return;
        const u = r.url().replace(/^https?:\/\/[^/]+/, '');
        const body = /\/api\//.test(u) ? await r.text().then((t) => flat(t, 200)).catch(() => null) : null;
        bad.push({status: r.status(), method: r.request().method(), url: u.slice(0, 200), body});
    });
    const say = (k, v) => console.log(`[h21i ${app.name} ${MODE} ${RUN}] ${k}`, JSON.stringify(v).slice(0, 1500));
    const step = async (key, fn) => {
        const b0 = bad.length;
        try { o[key] = await fn(); } catch (e) { o[key] = {threw: flat(e.message, 300)}; }
        if (o[key] && typeof o[key] === 'object' && bad.length > b0) o[key].bad = bad.slice(b0);
        say(key, o[key]);
    };
    const rel = (u) => u.replace(app.baseURL, '');
    const menuKey = () => { try { return new URL(page.url()).searchParams.get('workflowMenuKey'); } catch (e) { return null; } };
    const snap = async (label) => {
        const s = await screen(page).catch((e) => ({url: page.url(), error: flat(e.message, 200)}));
        const info = await wfInfo(page);
        record(`aev-${label}-${RUNTAG}-${RUN}`, {...s, info});
        await shot(page, `aev-${label}-${RUNTAG}-${RUN}`).catch(() => {});
        return {url: rel(page.url()), title: s.title, key: menuKey(), info, notices: s.notices};
    };
    const dash = (id) => `/index.php/${app.contextPath}/en/dashboard/editorial?workflowSubmissionId=${id}`;
    const mine = (id) => `/index.php/${app.contextPath}/en/dashboard/mySubmissions?workflowSubmissionId=${id}`;
    const openDash = async (id, label) => {
        await page.goto(app.url(dash(id)));
        await settle(page);
        const r = await snap(label);
        r.errorDialog = await dismissError(page);
        r.filesForReview = await filesForReview(page);
        r.afterOk = await wfInfo(page);
        return r;
    };
    const groupsOf = (u) => sql(app, `select string_agg(s.setting_value, ', ' order by ug.user_group_id) from users u join user_user_groups uug on uug.user_id=u.user_id join user_groups ug on ug.user_group_id=uug.user_group_id join user_group_settings s on s.user_group_id=ug.user_group_id and s.setting_name='name' and s.locale='en' where u.username='${u}' and (uug.date_end is null or uug.date_end > now())`).trim();
    try {
        // Precondition: the author is given the manager-level role on screen.
        o.groupsBefore = groupsOf(c.author);
        const subject = `Invitation ${TAG} ${app.name} ${MODE} ${RUN}`;
        const since = new Date();
        await signIn(page, 'admin', {contextPath: app.contextPath});
        const grant = MODE === 'role' ? (process.env.ROLE === 'asst' ? c.asst : c.sub_) : c.role;
        o.granted = grant;
        await step('invite', () => inviteToRole(page, app, {email: `${c.author}@mailinator.com`, role: grant, subject}));
        await signOut(page).catch(() => {});
        await step('accept', () => acceptInvitation(app, {email: `${c.author}@mailinator.com`, subject, since}));
        await sleep(1500); // a role's start is compared in whole seconds
        o.groupsAfter = groupsOf(c.author);
        say('groups', {before: o.groupsBefore, after: o.groupsAfter});

        if (MODE === 'walk') {
            // 1. sign in as the author-editor
            await signIn(page, c.author, {contextPath: app.contextPath});
            await idle(page);
            // 2. Submissions › "Active submissions": the authored submission's row
            await step('activeList', async () => {
                const link = page.getByRole('link', {name: /^Active submissions/}).first();
                if (await link.isVisible().catch(() => false)) await link.click();
                else await page.goto(app.url(`/index.php/${app.contextPath}/en/dashboard/editorial?currentViewId=active`));
                await idle(page); await sleep(1000); await idle(page);
                const row = page.getByRole('row').filter({hasText: c.title}).first();
                await row.waitFor({timeout: 15_000}).catch(() => {});
                const r = await snap('active');
                return {url: r.url, rowText: flat(await row.innerText().catch(() => null), 300),
                    viewButtons: await row.getByRole('button', {name: /^View/}).count().catch(() => null)};
            });
            // 3.–4. the editorial dashboard address of their own submission
            await step('dash', () => openDash(c.sub, 'dash'));
            if (app.name !== 'ops') {
                // 5. "Request Revisions" › "Next"
                await step('requestRevisions', async () => {
                    const act = page.locator('[data-cy="workflow-action-items"] button').filter({hasText: /^\s*Request Revisions\s*$/}).first();
                    if (!(await act.isVisible().catch(() => false))) return {offered: false, url: rel(page.url()), info: await wfInfo(page)};
                    await act.click({timeout: 8000});
                    await idle(page); await sleep(1500);
                    const win = await snap('revisions-window');
                    const radio = page.getByRole('radio', {name: /Require New Review Round/});
                    if (await radio.isVisible().catch(() => false)) await radio.check();
                    const next = page.locator('[role=dialog]:visible button').filter({hasText: /^\s*Next\s*$/}).last();
                    let after = null;
                    if (await next.isVisible().catch(() => false)) {
                        await next.click({timeout: 8000});
                        await page.waitForLoadState('domcontentloaded').catch(() => {});
                        await idle(page); await sleep(1500); await idle(page);
                        const n = await screen(page).catch(() => ({text: {}}));
                        await shot(page, `aev-revisions-next-${MODE}-${RUN}`).catch(() => {});
                        after = {url: rel(page.url()), title: n.title, main: flat(n.text && n.text.main, 300)};
                    }
                    return {offered: true, window: flat(win.info.dialogs && win.info.dialogs.join(' | '), 300), after};
                });
            } else {
                // 6. "Post the preprint"
                await step('post', async () => {
                    const before = menuKey();
                    const act = page.locator('[data-cy="workflow-action-items"] button').filter({hasText: /^\s*Post the preprint\s*$/}).first();
                    if (!(await act.isVisible().catch(() => false))) return {offered: false, url: rel(page.url()), info: await wfInfo(page)};
                    await act.click({timeout: 8000});
                    await idle(page); await sleep(2500); await idle(page);
                    const r = await snap('post');
                    return {offered: true, keyBefore: before, keyAfter: r.key, heading: r.info.heading, dialogs: r.info.dialogs, notices: r.notices};
                });
            }
            // 7. control: the My Submissions address
            await step('mine', async () => {
                await page.goto(app.url(mine(c.sub)));
                await settle(page);
                const r = await snap('mine');
                return {url: r.url, heading: r.info.heading, actions: r.info.actions, dialogs: r.info.dialogs, primary: flat(r.info.primary, 300)};
            });
            await signOut(page).catch(() => {});
            // control: dbarnes on the same address
            await signIn(page, 'dbarnes', {contextPath: app.contextPath});
            await idle(page);
            await step('ctlBarnes', () => openDash(c.sub, 'ctl-dbarnes'));
            if (app.name === 'ops') {
                await step('ctlBarnesPost', async () => {
                    const act = page.locator('[data-cy="workflow-action-items"] button').filter({hasText: /^\s*Post the preprint\s*$/}).first();
                    if (!(await act.isVisible().catch(() => false))) return {offered: false};
                    await act.click({timeout: 8000});
                    await idle(page); await sleep(2500); await idle(page);
                    const r = await snap('ctl-dbarnes-post');
                    return {offered: true, keyAfter: r.key, heading: r.info.heading};
                });
            }
            await signOut(page).catch(() => {});
        }

        if (MODE === 'nb') {
            // the author-editor on a submission that is not theirs: the editorial view must stay
            await signIn(page, c.author, {contextPath: app.contextPath});
            await idle(page);
            await step('nbOther', () => openDash(c.other, 'nb-other'));
            await signOut(page).catch(() => {});
            // dbarnes (an editor, not an author of it) on the authored submission: the editorial view must stay
            await signIn(page, 'dbarnes', {contextPath: app.contextPath});
            await idle(page);
            await step('nbBarnes', () => openDash(c.sub, 'nb-dbarnes'));
            await signOut(page).catch(() => {});
        }

        if (MODE === 'role') {
            // the author given a Section editor (Series editor, Moderator) or an assistant role
            // instead: the same editorial address of their own submission
            await signIn(page, c.author, {contextPath: app.contextPath});
            await idle(page);
            await step('roleDash', () => openDash(c.sub, 'role-dash'));
            await signOut(page).catch(() => {});
        }

        if (MODE === 'keys') {
            // the editorial address with the query values the dashboard adds (a stage's menu key,
            // the list view): where does it land
            await signIn(page, c.author, {contextPath: app.contextPath});
            await idle(page);
            await step('keysDash', async () => {
                await page.goto(app.url(`${dash(c.sub)}&currentViewId=assigned-to-me&workflowMenuKey=${c.menuKey}`));
                await settle(page);
                const r = await snap('keys');
                return {url: r.url, key: r.key, heading: r.info.heading, actions: r.info.actions, dialogs: r.info.dialogs};
            });
            await signOut(page).catch(() => {});
        }

        if (MODE === 'mail') {
            // dbarnes opens a discussion with the author-editor on the stage; the author-editor
            // follows the "Reply to this comment at #…" link in the last line of their email
            const T = require('../../../pages/TasksDiscussionsPages.js');
            const NAME = `Proof query ${TAG}`;
            const since2 = new Date(Date.now() - 2000);
            await signIn(page, 'dbarnes', {contextPath: app.contextPath});
            await step('mailAdd', async () => {
                const panel = new T.TasksDiscussionsPanel(page, app.contextPath, {title: c.panel});
                await panel.gotoEditorial(c.sub, c.menuKey);
                const add = await panel.openAdd();
                await add.nameField().fill(NAME);
                await add.tick(c.author);
                await add.typeMessage('Please check this.');
                const answer = await add.saveAndAnswer();
                await idle(page);
                return {status: answer.status()};
            });
            await step('mailFooter', async () => {
                for (let i = 0; i < 12; i++) {
                    const res = await app.fleetMail._search({to: `${c.author}@mailinator.com`, subject: NAME, since: since2});
                    const m = (res.messages || [])[0];
                    if (m) {
                        const full = await app.fleetMail.fullMessage(m.ID);
                        const link = app.fleetMail.extractLink(full.HTML || '', /^#\d+/);
                        o.footerLink = link;
                        return {subject: m.Subject, link, footerText: flat((full.Text || '').slice((full.Text || '').lastIndexOf('—')), 300)};
                    }
                    await sleep(3000);
                    await page.reload().catch(() => {});
                    await idle(page).catch(() => {});
                }
                return {mail: null};
            });
            await signOut(page).catch(() => {});
            if (o.footerLink) {
                await signIn(page, c.author, {contextPath: app.contextPath});
                await idle(page);
                await step('mailFollow', async () => {
                    await page.goto(o.footerLink);
                    await settle(page);
                    const r = await snap('mail-follow');
                    r.errorDialog = await dismissError(page);
                    return {url: r.url, heading: r.info.heading, actions: r.info.actions, headerButtons: r.info.headerButtons, errorDialog: r.errorDialog};
                });
                await signOut(page).catch(() => {});
            }
        }
    } catch (e) {
        o.fatal = flat(e.stack || e.message, 800);
    } finally {
        o.allBad = bad;
        o.serverLog = log.since(from).slice(0, 20).map((l) => flat(l, 400));
        record(`aev-${RUNTAG}-${RUN}`, o);
        say('done', {fatal: o.fatal, bad: bad.length, serverLog: o.serverLog.length});
        await close();
    }
});
