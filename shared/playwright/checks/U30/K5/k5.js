// U30 claim check, chunk K5: the press and the preprint server, and the request page by address.
// Spec: docs/specs/U30-author-response-to-reviews.md — Purpose lines 31–44 (the absence
// paragraph: OMP and OPS), Rule 14 "By address" (lines 293–307; OJS, OMP, and the OPS answer),
// register OMP1 (lines 563–583).
//
// Seeds one scratch context per app with throwaway accounts at every permission level the
// spec names (manager, an assigned section editor, an unassigned one, funding coordinator,
// author, reviewer, reader; OPS: manager, moderator, author, reader, editorial board member)
// and, on OJS/OMP, S1 (one completed review: the ready round), S2 (two rounds: round 1
// completed, round 2 accepted); on OMP also S3 (Internal Review, one accepted review); on
// OPS S4 (a submitted preprint). `admin` is enrolled in every scratch context by the API.
//
//   PROBE_FEATURE=U30 PROBE_AGENT=ccK5 node bin/probe.js all shared/playwright/checks/U30/K5/k5.js
//   PHASES=seed,r14,omp,ops   (default: all; later phases reuse k5-scratch-<app>.json)
//
// Phases: r14 (OJS, OMP) — Rule 14 by every role, the typed page's Cancel / Submit / control /
// Escape, another submission's round, an unknown round; omp — the two review stages without
// the table (ready, awaiting, revisions requested), the request email's button, the Request
// Revisions wizard's message and email, where both buttons land the author (OMP1); ops — the
// preprint's Production stage and the typed address per role.
const fs = require('fs');
const path = require('path');
const {forEachApp, launch, signIn, signOut, screen, shot, record, loc, note, idle, tag, outDir} =
    require('../../../probe');

const PHASES = process.env.PHASES ? process.env.PHASES.split(',') : ['seed', 'r14', 'omp', 'ops'];
const on = (p) => PHASES.includes(p);
const log = (...a) => console.log(...a);
const scratchFile = (app) => path.join(outDir(), `k5-scratch-${app.name}.json`);
const factsFile = (app) => path.join(outDir(), `k5-facts-${app.name}.json`);

function watchConsole(page) {
    const sink = [];
    page.on('console', (m) => sink.push({type: m.type(), text: m.text().slice(0, 300)}));
    page.on('pageerror', (e) => sink.push({type: 'pageerror', text: String(e.message).slice(0, 300)}));
    page.on('dialog', (d) => { sink.push({type: 'browser-dialog', text: d.message()}); d.accept(); });
    return sink;
}
const consoleSummary = (sink) => ({total: sink.length, notable: sink.filter((m) => ['error', 'pageerror', 'browser-dialog'].includes(m.type))});
async function headings(scope) {
    return scope.locator('h1,h2,h3,h4,h5').evaluateAll((hs) =>
        hs.filter((h) => h.offsetParent !== null).map((h) => `${h.tagName.toLowerCase()}: ${h.innerText.trim().replace(/\s+/g, ' ')}`)).catch(() => null);
}
async function dialogTexts(page) {
    const out = [];
    for (const d of await page.locator('[role="dialog"]:visible').all()) out.push((await d.innerText().catch(() => '')).trim());
    return out;
}
// A settled read of the screen plus the verbatim text of open dialogs (the workflow screen is one).
async function capture(page, name, extra = {}) {
    await idle(page);
    const s = await screen(page);
    s.landedUrl = page.url();
    s.dialogText = await dialogTexts(page);
    s.bodyText = (await page.locator('body').innerText().catch(() => '')).trim().slice(0, 4000);
    Object.assign(s, extra);
    record(name, s);
    await shot(page, name);
    return s;
}
// The request page: wait for the template (Subject filled, the TinyMCE iframe attached, "Loading" gone).
async function waitRequestPage(page) {
    const submit = page.getByRole('button', {name: 'Submit Request', exact: true});
    const rendered = await submit.waitFor({timeout: 20_000}).then(() => true).catch(() => false);
    if (!rendered) return false;
    await page.waitForFunction(() => {
        const el = [...document.querySelectorAll('input')].find((i) => /subject/i.test(i.getAttribute('aria-label') || i.name || ''));
        return !!(el && el.value);
    }, null, {timeout: 30_000}).catch(() => {});
    await page.locator('iframe').first().waitFor({timeout: 30_000}).catch(() => {});
    await page.getByText('Loading', {exact: true}).waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
    await page.waitForFunction(() => { const f = document.querySelector('iframe'); const b = f && f.contentDocument && f.contentDocument.body; return b && b.innerText.trim().length > 20; }, null, {timeout: 30_000}).catch(() => {});
    await idle(page);
    return true;
}
async function requestPageState(page) {
    const s = {rendered: (await page.getByRole('button', {name: 'Submit Request', exact: true}).count()) > 0, textboxes: [], buttons: [], message: null, anchors: null};
    for (const t of await page.getByRole('textbox').all()) {
        s.textboxes.push({name: await t.getAttribute('aria-label') || await t.getAttribute('name') || await t.getAttribute('id'), value: await t.inputValue().catch(() => null)});
    }
    for (const b of await page.getByRole('button').all()) if (await b.isVisible()) s.buttons.push({text: (await b.innerText()).trim(), enabled: await b.isEnabled()});
    const frame = page.locator('iframe').first();
    if (await frame.count()) {
        const body = page.frameLocator('iframe').first().locator('body');
        s.message = (await body.innerText().catch(() => '')).trim();
        s.anchors = await body.evaluate((b) => [...b.querySelectorAll('a')].map((a) => ({text: a.innerText.trim(), href: a.getAttribute('href')}))).catch(() => null);
    }
    return s;
}
// A workflow stage as data: the headings of the side modal, the tables, the two controls the spec names.
async function stageState(page) {
    const wf = page.getByRole('dialog').first();
    await wf.waitFor({timeout: 30_000}).catch(() => {});
    await wf.getByRole('table').first().waitFor({timeout: 20_000}).catch(() => {});
    await idle(page);
    return {
        headings: await headings(wf),
        tables: await wf.getByRole('table').evaluateAll((ts) => ts.map((t) => t.getAttribute('aria-label') || (t.getAttribute('aria-labelledby') && document.getElementById(t.getAttribute('aria-labelledby'))?.innerText) || '')).catch(() => null),
        buttons: await wf.getByRole('button').evaluateAll((bs) => bs.map((b) => b.innerText.trim()).filter(Boolean)).catch(() => null),
        authorResponseTable: await page.getByRole('table', {name: 'Author Response'}).count(),
        authorResponseInText: (await page.locator('body').innerText()).includes('Author Response'),
        requestResponseButtons: await page.getByRole('button', {name: 'Request Response', exact: true}).count(),
        submitResponseButtons: await page.getByRole('button', {name: 'Submit Response', exact: true}).count(),
        viewSubmittedResponseButtons: await page.getByRole('button', {name: 'View Submitted Response', exact: true}).count(),
        dialogsOpen: await page.locator('[role="dialog"]:visible').count(),
    };
}
async function gotoStage(page, app, ctxPath, kind, id, menuKey) {
    await page.goto(app.url(`/index.php/${ctxPath}/dashboard/${kind}?workflowSubmissionId=${id}${menuKey ? `&workflowMenuKey=${menuKey}` : ''}`));
    await idle(page);
    await page.getByRole('dialog').first().waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
}
async function mailOf(app, {to, contains, subject, skipIds = []}) {
    await app.mail.find({to, contains, timeoutMs: 20_000}).catch(() => null);
    const list = await app.mail.inboxFor(to).catch(() => []);
    for (const m of list) {
        if (skipIds.includes(m.ID)) continue;
        const full = await app.mail.fullMessage(m.ID);
        if (contains && !(full.Text || '').includes(contains) && !(full.Subject || '').includes(contains)) continue;
        if (subject && !(full.Subject || '').includes(subject)) continue;
        return {id: m.ID, subject: full.Subject, from: full.From, to: full.To, cc: full.Cc, date: full.Date,
            href: app.mail.extractLink(full.HTML, 'Submit Author Response'), text: (full.Text || '').slice(0, 3500)};
    }
    return null;
}

forEachApp(async (app) => {
    const ojsOmp = app.name !== 'ops';
    let sc = fs.existsSync(scratchFile(app)) ? JSON.parse(fs.readFileSync(scratchFile(app), 'utf8')) : null;
    const saveScratch = () => fs.writeFileSync(scratchFile(app), JSON.stringify(sc, null, 2));
    const facts = fs.existsSync(factsFile(app)) ? JSON.parse(fs.readFileSync(factsFile(app), 'utf8')) : {app: app.name, steps: {}};
    const done = (label, data) => { facts.steps[label] = data; log(`[${label}]`, app.name, JSON.stringify(data).slice(0, 1200)); fs.writeFileSync(factsFile(app), JSON.stringify(facts, null, 2)); };

    // ---- seed ---------------------------------------------------------------
    if (on('seed') && !sc) {
        const t = tag('u30k5');
        const u = {mgr: `${t}mgr`, se: `${t}se`, se2: `${t}se2`, au: `${t}au`, rd: `${t}rd`};
        const users = [
            {username: u.mgr, roles: ['manager'], givenName: 'Mira', familyName: 'Manager'},
            {username: u.se, roles: ['sectionEditor'], givenName: 'Sena', familyName: 'Editor'},
            {username: u.se2, roles: ['sectionEditor'], givenName: 'Sol', familyName: 'Unassigned'},
            {username: u.au, roles: ['author'], givenName: 'Ava', familyName: 'Author'},
            {username: u.rd, roles: ['reader'], givenName: 'Rea', familyName: 'Reader'},
        ];
        if (ojsOmp) {
            u.fund = `${t}fund`; u.rev = `${t}rev`;
            users.push({username: u.fund, roles: ['funding'], givenName: 'Fia', familyName: 'Funding'});
            users.push({username: u.rev, roles: ['externalReviewer'], givenName: 'Rowan', familyName: 'Reviewer'});
            if (app.name === 'omp') { u.irev = `${t}irev`; users.push({username: u.irev, roles: ['internalReviewer'], givenName: 'Ines', familyName: 'Internal'}); }
        } else {
            u.ebm = `${t}ebm`;
            users.push({username: u.ebm, roles: ['editorialBoardMember'], givenName: 'Eda', familyName: 'Board'});
        }
        const ctx = await app.api.createContext({tag: t, users});
        sc = {tag: t, path: ctx.path || t, contextId: ctx.contextId, users: u, subs: {}};
        const sub = async (key, spec) => {
            const r = await app.api.createSubmission({tag: `${t}${key.toLowerCase()}`, context: sc.path, submitter: u.au, ...spec});
            sc.subs[key] = {id: r.submissionId, rounds: r.reviewRounds || [], title: spec.title, stageId: r.stageId};
        };
        if (ojsOmp) {
            await sub('S1', {title: `K5 S1 ready ${t}`, decisions: ['sendExternalReview'],
                participants: [{username: u.se, role: 'sectionEditor'}, {username: u.fund, role: 'funding'}],
                reviewRounds: [{reviewers: [{username: u.rev, status: 'completed'}]}]});
            await sub('S2', {title: `K5 S2 two rounds ${t}`, decisions: ['sendExternalReview'],
                participants: [{username: u.se, role: 'sectionEditor'}],
                reviewRounds: [{reviewers: [{username: u.rev, status: 'completed'}]}, {reviewers: [{username: u.rev, status: 'accepted'}]}]});
            if (app.name === 'omp') {
                await sub('S3', {title: `K5 S3 internal ${t}`, decisions: ['sendInternalReview'],
                    participants: [{username: u.se, role: 'sectionEditor'}],
                    reviewRounds: [{stage: 'internal', reviewers: [{username: u.irev, status: 'accepted'}]}]});
            }
        } else {
            await sub('S4', {title: `K5 S4 preprint ${t}`, participants: [{username: u.se, role: 'sectionEditor'}]});
        }
        saveScratch();
        done('seed', sc);
    }
    if (!sc) throw new Error('no scratch context; run with PHASES=seed first');
    const U = sc.users;
    const P = sc.path;
    const addr = (id, round, stageId = 3) => app.url(`/index.php/${P}/reviewResponse/requestAuthorResponse?stageId=${stageId}&reviewRoundId=${round}&submissionId=${id}`);
    const auMail = `${U.au}@mail.test`;

    const {page, close} = await launch(app);
    const sink = watchConsole(page);
    const asUser = (username) => (username === 'admin' ? signIn(page, 'admin') : signIn(page, username, {contextPath: P}));
    try {
        // ---- r14: the request page by address (OJS, OMP) ------------------------
        if (on('r14') && ojsOmp) {
            const S1 = sc.subs.S1, S2 = sc.subs.S2;
            const r1 = S1.rounds[0].id;
            const mailBefore = await app.mail.count({to: auMail, contains: S1.title});
            await asUser(U.mgr);
            // the page for the manager, no ret
            await page.goto(addr(S1.id, r1));
            await waitRequestPage(page);
            await capture(page, 'r14-mgr-page', await requestPageState(page));
            await loc(page, 'K5 typed request page: "Submit Request"', page.getByRole('button', {name: 'Submit Request', exact: true}));
            const cancel = page.getByRole('button', {name: 'Cancel', exact: true});
            await loc(page, 'K5 typed request page: "Cancel"', cancel);
            await cancel.click();
            await page.waitForURL((x) => !/requestAuthorResponse/.test(x.href), {timeout: 15_000}).catch(() => {});
            await capture(page, 'r14-mgr-after-cancel', {pageTitle: await page.title()});
            // Submit Request, then the dialog's control, then Escape
            await page.goto(addr(S1.id, r1));
            await waitRequestPage(page);
            await page.getByRole('button', {name: 'Submit Request', exact: true}).click();
            const dlg = page.getByRole('dialog').filter({hasText: 'Request for review response sent'});
            await dlg.waitFor({timeout: 30_000}).catch(() => {});
            await idle(page);
            const controls = await dlg.locator('a, button').evaluateAll((els) => els.map((e) => ({tag: e.tagName, text: e.innerText.trim(), href: e.getAttribute('href'), role: e.getAttribute('role'), cls: e.className.slice(0, 80)}))).catch(() => null);
            await capture(page, 'r14-mgr-sent-dialog', {controls, dialogLinks: await dlg.getByRole('link').count().catch(() => null), dialogButtons: await dlg.getByRole('button').count().catch(() => null)});
            const ctl = dlg.getByText('View Submission', {exact: true});
            await loc(page, 'K5 sent dialog (typed address): "View Submission"', ctl);
            await ctl.first().click({timeout: 5_000}).catch(() => {});
            await page.waitForURL((x) => !/requestAuthorResponse/.test(x.href), {timeout: 6_000}).catch(() => {});
            await capture(page, 'r14-mgr-after-control', {dialogsOpen: await page.locator('[role="dialog"]:visible').count()});
            await page.keyboard.press('Escape');
            await page.waitForURL((x) => !/requestAuthorResponse/.test(x.href), {timeout: 10_000}).catch(() => {});
            await capture(page, 'r14-mgr-after-escape', {pageTitle: await page.title(), dialogsOpen: await page.locator('[role="dialog"]:visible').count()});
            const requestMail = await mailOf(app, {to: auMail, contains: S1.title, subject: 'Request For Author Response'});
            sc.requestMail = requestMail; saveScratch();
            done('r14-mail', {before: mailBefore, after: await app.mail.count({to: auMail, contains: S1.title}), requestMail});
            // any of its rounds: S2's round 1 and round 2
            for (const [i, rd] of S2.rounds.entries()) {
                await page.goto(addr(S2.id, rd.id));
                await waitRequestPage(page);
                await capture(page, `r14-mgr-s2-round${i + 1}`, await requestPageState(page));
            }
            // a round that does not exist; another submission's round
            await page.goto(addr(S1.id, 99999));
            await capture(page, 'r14-mgr-round-unknown');
            await page.goto(addr(S1.id, S2.rounds[0].id));
            await capture(page, 'r14-mgr-round-of-other-submission');
            // the other editorial levels: assigned section editor, site admin, unassigned section editor
            for (const [label, who] of [['se', U.se], ['admin', 'admin'], ['se2', U.se2]]) {
                await asUser(who);
                await page.goto(addr(S1.id, r1));
                const rendered = await waitRequestPage(page);
                await capture(page, `r14-${label}-page`, rendered ? await requestPageState(page) : {rendered});
            }
            // the roles the spec refuses
            for (const [label, who] of [['fund', U.fund], ['au', U.au], ['rev', U.rev], ['rd', U.rd]]) {
                await asUser(who);
                await page.goto(addr(S1.id, r1));
                await capture(page, `r14-${label}-page`, {dialogsOpen: await page.locator('[role="dialog"]:visible').count(), authorResponseInText: (await page.locator('body').innerText()).includes('Author Response'), pageTitle: await page.title()});
            }
            await signOut(page);
        }

        // ---- omp: the absence paragraph and OMP1 ------------------------------------
        if (on('omp') && app.name === 'omp') {
            const S1 = sc.subs.S1, S3 = sc.subs.S3, S2 = sc.subs.S2;
            const r1 = S1.rounds[0].id;
            await asUser(U.se);
            await gotoStage(page, app, P, 'editorial', S1.id, `workflow_3_${r1}`);
            await capture(page, 'omp-se-external-ready', await stageState(page));
            await loc(page, 'K5 OMP External Review: Reviewers table', page.getByRole('dialog').first().getByRole('table', {name: 'Reviewers'}));
            await gotoStage(page, app, P, 'editorial', S3.id, `workflow_2_${S3.rounds[0].id}`);
            await capture(page, 'omp-se-internal-awaiting', await stageState(page));
            await gotoStage(page, app, P, 'editorial', S2.id, `workflow_3_${S2.rounds[1].id}`);
            await capture(page, 'omp-se-external-round2-awaiting', await stageState(page));
            // the author from the request email's button (sent in r14)
            if (sc.requestMail && sc.requestMail.href) {
                await asUser(U.au);
                sink.length = 0;
                const r = await page.goto(sc.requestMail.href);
                await page.getByRole('dialog').first().waitFor({timeout: 30_000}).catch(() => {});
                await capture(page, 'omp1-au-from-request-mail', Object.assign(await stageState(page), {status: r && r.status(), console: consoleSummary(sink)}));
            }
            // the author's Internal Review stage
            await asUser(U.au);
            await gotoStage(page, app, P, 'mySubmissions', S3.id, `workflow_2_${S3.rounds[0].id}`);
            await capture(page, 'omp-au-internal', await stageState(page));
            // Request Revisions as the assigned section editor: the Notify Authors message, the decision, the email
            await asUser(U.se);
            await gotoStage(page, app, P, 'editorial', S1.id, `workflow_3_${r1}`);
            const wf = page.getByRole('dialog').first();
            const rr = wf.getByRole('button', {name: 'Request Revisions', exact: true});
            await rr.waitFor({timeout: 30_000});
            await loc(page, 'K5 OMP External Review: "Request Revisions"', rr);
            await rr.click();
            const modal = page.getByRole('dialog').filter({hasText: 'Require New Review Round'});
            const hasModal = await modal.waitFor({timeout: 10_000}).then(() => true).catch(() => false);
            if (hasModal) {
                await idle(page);
                await modal.getByRole('radio', {name: 'Revisions will not be subject to a new round of peer reviews.'}).check();
                await modal.getByRole('button', {name: 'Next', exact: true}).click();
            }
            await page.waitForURL(/decision/, {timeout: 30_000}).catch(() => {});
            await idle(page);
            await page.locator('.composer__loadingTemplateMask').waitFor({state: 'hidden', timeout: 30_000}).catch(() => {});
            await page.locator('iframe').first().waitFor({timeout: 30_000}).catch(() => {});
            await page.waitForFunction(() => { const f = document.querySelector('iframe'); const b = f && f.contentDocument && f.contentDocument.body; return b && b.innerText.trim().length > 20; }, null, {timeout: 30_000}).catch(() => {});
            await capture(page, 'omp1-wizard-notify-authors', Object.assign(await requestPageState(page), {hasModal, headings: await headings(page.locator('body'))}));
            const cont = page.getByRole('button', {name: 'Continue', exact: true});
            const rec = page.getByRole('button', {name: 'Record Decision', exact: true});
            for (let i = 0; i < 5 && !(await rec.isVisible().catch(() => false)); i++) { await cont.click(); await idle(page); }
            await rec.click();
            await page.getByRole('dialog').first().waitFor({timeout: 30_000}).catch(() => {});
            await capture(page, 'omp1-decision-recorded');
            const decisionMail = await mailOf(app, {to: auMail, contains: S1.title, subject: 'encourage you to submit revisions', skipIds: sc.requestMail ? [sc.requestMail.id] : []});
            sc.decisionMail = decisionMail; saveScratch();
            done('omp1-decision-mail', decisionMail);
            // the editor's stage after the decision: still no table
            await gotoStage(page, app, P, 'editorial', S1.id, `workflow_3_${r1}`);
            await capture(page, 'omp-se-external-revisions', await stageState(page));
            // the author from the decision email's button
            await asUser(U.au);
            if (decisionMail && decisionMail.href) {
                sink.length = 0;
                const r = await page.goto(decisionMail.href);
                await page.getByRole('dialog').first().waitFor({timeout: 30_000}).catch(() => {});
                await capture(page, 'omp1-au-from-decision-mail', Object.assign(await stageState(page), {status: r && r.status(), console: consoleSummary(sink)}));
            }
            await signOut(page);
        }

        // ---- ops: the preprint server -------------------------------------------
        if (on('ops') && app.name === 'ops') {
            const S4 = sc.subs.S4;
            await asUser(U.mgr);
            await gotoStage(page, app, P, 'editorial', S4.id);
            await capture(page, 'ops-mgr-workflow', await stageState(page));
            for (const [label, who] of [['mgr', U.mgr], ['se', U.se], ['au', U.au], ['ebm', U.ebm], ['rd', U.rd]]) {
                if (label !== 'mgr') await asUser(who);
                const r = await page.goto(addr(S4.id, 1));
                await capture(page, `ops-${label}-address`, {status: r && r.status(), pageTitle: await page.title(), headings: await headings(page.locator('body'))});
            }
            // the other end of the address: the preprint's own stage id (Production, 5)
            await asUser(U.mgr);
            const r5 = await page.goto(addr(S4.id, 1, 5));
            await capture(page, 'ops-mgr-address-stage5', {status: r5 && r5.status(), pageTitle: await page.title()});
            await signOut(page);
        }
    } finally {
        await close();
    }
});
