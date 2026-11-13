// U14 claim check, chunk K13a (housekeeping incidentals, 2026-11-13): the PHP
// warnings "Undefined property: stdClass::$user_comment_id in
// lib/pkp/classes/core/SettingsBuilder.php" (lines 341 and 348) an issue walk
// logged during comment moderation, and the comment panels' rules the walk
// passes through. Spec: docs/specs/U14-reader-comments-and-moderation.md —
// Fields (the comment panel and the report panel rows), Rule 6b (the ORCID
// icon under a comment), Rule 12, Rule 13's approve; footnotes e, j, k.
//
// Runs on PKP's default test dataset (a dataset fleet, harness.md "Dataset
// fleets"), the state the warnings were first seen in. It replays the retired
// A6 issue walk (walk, then its neighbour mode) and reads the fleet's server
// log after every step, pinning each PHP message on the request that printed
// it (lib.js logRequests(): the fleet's php -S has one worker). On OMP and OPS
// it runs a control only: the manager switches comments on and opens the
// Comments page, then approves and hides one comment the script writes by
// SQL (no screen there writes a comment).
//
// Phases (first argument; default `all` = walk then nb in one process):
//   walk  zzedd gets an unverified ORCID iD (SQL, the state only ORCID's
//         service creates); the article signed out with comments off; rvaca
//         ticks "Enable Public Comments" and saves; zzedd and ccorino each
//         load article 17 and comment; rvaca approves Carlo Corino's comment
//         from its panel; zzedd loads the article and reports it; rvaca reads
//         Zayan Zedd's comment panel and the report panel (ORCID links pressed)
//   nb    rvaca: Carlo Corino's panel with no iD, with no iD and no
//         affiliation, with a verified iD (SQL); Zayan Zedd's panel again; the
//         panel's address opened directly, and with a number no comment has;
//         the article read as zzedd, signed out and as rvaca; Zayan Zedd's
//         comment approved, the article read signed out, the comment hidden;
//         the report
//         deleted from the report panel and the comment panel closed (table
//         reload counted); rvaca unticks the box and saves; zzedd loads the
//         article with comments off. Needs `walk` first, no reset between.
//
// Re-run (a dataset fleet reset before each run, two runs r1 and r2):
//   npm run fleet-prep -- --feature cc-u14 --dataset 3 --reset
//   PROBE_FEATURE=cc-u14 PROBE_AGENT=ccK13a PROBE_RUN=r1 PROBE_NOTES_FEATURE=U14 \
//     bin/app-lock.sh shared ojs,omp,ops -- node bin/probe.js all shared/playwright/checks/U14/K13a/k13a.js
// Outputs: .reports/cc-u14/ccK13a/ (k13a-<phase>[-<run>]-<app>.json, shots).
// Helpers: ./lib.js. No other script or env part.
const {forEachApp, launch, signIn, signOut, screen, shot, record, idle, sql, serverLog, note} = require('../../../probe');
const {clearOrcid, setUnverifiedOrcid, connectOrcid, takeAffiliation, restoreAffiliation, pressOrcidLink, readOrcidLinks, logRequests} = require('./lib');

const MODE = process.argv[2] || 'all';
const SUBMISSION = 17;
const ZZ_COMMENT = 'k13a comment by Zayan Zedd';
const CC_COMMENT = 'k13a comment by Carlo Corino';
const REPORT = 'k13a report by Zayan Zedd';
const flat = (s) => (s || '').replace(/\s+/g, ' ').trim();
const log = (...a) => console.log('[k13a]', new Date().toISOString().slice(11, 19), ...a);

/** A step: marks the server log, runs, waits the page idle, records what the log got. Never throws. */
function stepper(R, page, slog) {
    return async (name, fn) => {
        const from = slog.mark();
        const entry = {};
        try {
            entry.result = (await fn()) ?? 'ok';
        } catch (e) {
            entry.error = e.message.split('\n')[0];
            log('step', name, 'ERROR', entry.error);
            await shot(page, `k13a-${name}-error`).catch(() => {});
        }
        await idle(page).catch(() => {});
        await page.waitForTimeout(500);
        const lr = logRequests(slog.file, from);
        entry.requests = lr.requests;
        entry.warned = lr.warned;
        if (lr.trailing.length) entry.trailing = lr.trailing;
        entry.warningCount = lr.warned.reduce((n, w) => n + w.messages.length, 0) + lr.trailing.length;
        R.steps[name] = entry;
        log(name, 'warnings', entry.warningCount, lr.warned.map((w) => w.request).join(' | '));
        return entry.result;
    };
}

async function buttonStates(scope) {
    return scope.getByRole('button').evaluateAll((els) =>
        els
            .filter((b) => b.offsetParent !== null)
            .map((b) => ({
                text: b.textContent.replace(/\s+/g, ' ').trim(),
                name: b.getAttribute('aria-label'),
                disabled: b.disabled || b.getAttribute('aria-disabled') === 'true',
                cls: (b.getAttribute('class') || '').split(/\s+/).filter((c) => /primary|disabled|warnable|is-/.test(c)).join(' '),
            }))
    );
}

async function panelRead(page, comments, panel, label, {press = true, isReport = false} = {}) {
    await idle(page);
    const out = {
        url: page.url(),
        title: flat(await panel.locator('h1').first().innerText().catch(() => '')),
        submissionLine: flat(await comments.panelSubmissionLine(panel).innerText().catch(() => '')),
        person: flat(await comments.panelPerson(panel).innerText().catch(() => '')),
        orcid: await readOrcidLinks(panel),
        solidIcons: await comments.panelOrcidIcon(panel, {verified: true}).count(),
        hollowIcons: await comments.panelOrcidIcon(panel, {verified: false}).count(),
        buttons: await buttonStates(panel),
        text: flat(await panel.innerText().catch(() => '')).slice(0, 1500),
    };
    if (!isReport) out.note = flat(await comments.note().innerText().catch(() => ''));
    record(`k13a-${label}`, await screen(page));
    await shot(page, `k13a-${label}`);
    const link = panel.locator('a[href*="orcid"]').first();
    if (press && (await link.count())) out.opened = await pressOrcidLink(page, link);
    return out;
}

async function articleRead(page, article, label, texts) {
    await idle(page);
    for (const t of texts) await article.comment(t).waitFor({timeout: 30_000}).catch(() => {});
    const out = {url: page.url(), comments: []};
    const all = article.comments();
    for (let i = 0; i < (await all.count()); i++) {
        const a = all.nth(i);
        out.comments.push({
            body: flat(await article.body(a).innerText().catch(() => '')),
            author: flat(await article.author(a).innerText().catch(() => '')),
            affiliation: flat(await article.affiliation(a).innerText().catch(() => '')),
            orcid: await readOrcidLinks(a),
            text: flat(await a.innerText()).slice(0, 400),
        });
    }
    const html = await page.content();
    out.htmlShowsWarning = /Undefined property|Warning:/.test(html);
    record(`k13a-${label}`, await screen(page));
    await shot(page, `k13a-${label}`);
    return out;
}

async function control(app) {
    // OMP / OPS: no screen writes a comment; the moderation screens only.
    const P = require(`../../../../../apps/${app.name}/playwright/pages/ReaderCommentsPages.js`);
    const {page, close} = await launch(app);
    const slog = serverLog(app);
    const R = {mode: 'control', app: app.name, steps: {}};
    const step = stepper(R, page, slog);
    try {
        await signIn(page, 'rvaca');
        const tab = new P.CommentsSettingsTab(page, app.contextPath);
        await step('ctlTick', async () => {
            await tab.goto();
            record('k13a-ctl-tab', await screen(page));
            await tab.box().check();
            await tab.save();
            return {saved: true};
        });
        const comments = new P.CommentsPage(page, app.contextPath);
        await step('ctlCommentsPage', async () => {
            await comments.goto();
            record('k13a-ctl-comments', await screen(page));
            return {url: page.url()};
        });
        // No screen writes a comment here: one pending comment by SQL (the
        // state the tooling makes, footnote j), then Approve and Hide on screen.
        const ctx = app.contextTables;
        const pub = sql(app, `SELECT p.publication_id FROM publications p JOIN submissions s USING (submission_id) WHERE p.status = 3 AND s.context_id = (SELECT ${ctx.id} FROM ${ctx.table} WHERE path = '${app.contextPath}') ORDER BY 1 LIMIT 1`);
        R.seededComment = sql(app,
            `INSERT INTO user_comments (user_id, context_id, publication_id, comment_text, is_approved, created_at, updated_at) ` +
            `SELECT (SELECT user_id FROM users WHERE username IN ('ccorino', 'zzedd') ORDER BY username LIMIT 1), (SELECT ${ctx.id} FROM ${ctx.table} WHERE path = '${app.contextPath}'), ${pub}, '${CC_COMMENT}', false, now(), now() RETURNING user_comment_id`);
        await step('ctlApprove', async () => {
            await comments.goto();
            await comments.viewComment(comments.row(CC_COMMENT));
            const s = await screen(page);
            record('k13a-ctl-panel-pending', s);
            await comments.setApproval('Approve Comment');
            return {notices: (await screen(page)).notices, panel: (s.text.dialog || '').slice(0, 300)};
        });
        await step('ctlHide', async () => {
            await comments.viewComment(comments.row(CC_COMMENT));
            record('k13a-ctl-panel-approved', await screen(page));
            await comments.setApproval('Hide Comment');
            return {notices: (await screen(page)).notices};
        });
        await signOut(page);
    } catch (e) {
        R.error = e.message;
    } finally {
        record('k13a-control', R);
        await close();
    }
}

async function walk(app, page, P, step, R) {
    const article = new P.ArticleCommentsPage(page, app.contextPath);
    const comments = new P.CommentsPage(page, app.contextPath);
    R.precondition = setUnverifiedOrcid(app, 'zzedd');
    clearOrcid(app, 'ccorino');
    R.enabledBefore = sql(app, `SELECT setting_value FROM journal_settings WHERE setting_name = 'enablePublicComments'`);

    await step('w0OutArticleOff', async () => {
        await signOut(page);
        await article.goto(SUBMISSION);
        return articleRead(page, article, 'w0-out-article-off', []);
    });
    await step('w1Tick', async () => {
        await signIn(page, 'rvaca');
        const tab = new P.CommentsSettingsTab(page, app.contextPath);
        await tab.goto();
        record('k13a-w1-tab', await screen(page));
        await tab.box().check();
        return {sawSaving: await tab.save()};
    });
    R.enabledAfter = sql(app, `SELECT setting_value FROM journal_settings WHERE setting_name = 'enablePublicComments'`);

    await step('w3ZzArticle0', async () => {
        await signIn(page, 'zzedd');
        await article.goto(SUBMISSION);
        return articleRead(page, article, 'w3-zz-article-0', []);
    });
    await step('w4ZzWrite', async () => ({id: await article.writeComment(ZZ_COMMENT)}));
    await step('w5CcArticle0', async () => {
        await signIn(page, 'ccorino');
        await article.goto(SUBMISSION);
        return articleRead(page, article, 'w5-cc-article-0', []);
    });
    await step('w5CcWrite', async () => ({id: await article.writeComment(CC_COMMENT)}));

    await signIn(page, 'rvaca');
    await step('w6CommentsPage', async () => {
        await comments.goto();
        record('k13a-w6-comments', await screen(page));
        return {url: page.url()};
    });
    await step('w6CcPanelPending', async () => {
        const panel = await comments.viewComment(comments.row(CC_COMMENT));
        return panelRead(page, comments, panel, 'w6-cc-panel-pending', {press: false});
    });
    await step('w7Approve', async () => {
        await comments.setApproval('Approve Comment');
        const s = await screen(page);
        record('k13a-w7-after-approve', s);
        return {url: page.url(), notices: s.notices};
    });

    await step('w8ZzArticle2', async () => {
        await signIn(page, 'zzedd');
        await article.goto(SUBMISSION);
        return articleRead(page, article, 'w8-zz-article-2', [ZZ_COMMENT, CC_COMMENT]);
    });
    await step('w8Report', async () => {
        const dialog = await article.openReportDialog(article.comment(CC_COMMENT));
        await article.reasonBox(dialog).fill(REPORT);
        await article.submitReport(dialog);
        return 'ok';
    });

    await signIn(page, 'rvaca');
    await step('w9CommentsPage', async () => {
        await comments.goto();
        return {url: page.url()};
    });
    await step('w10ZzPanelUnverified', async () => {
        const panel = await comments.viewComment(comments.row(ZZ_COMMENT));
        const out = await panelRead(page, comments, panel, 'w10-zz-panel-unverified');
        await comments.closeCommentPanel();
        return out;
    });
    await step('w11ReportPanel', async () => {
        await comments.viewComment(comments.row(CC_COMMENT));
        const rp = await comments.viewReport(comments.reportRow(REPORT));
        const out = await panelRead(page, comments, rp, 'w11-report-panel', {isReport: true});
        await comments.closeReportPanel();
        out.urlAfterReportClose = page.url();
        await comments.closeCommentPanel();
        return out;
    });
}

async function nb(app, page, P, step, R) {
    const article = new P.ArticleCommentsPage(page, app.contextPath);
    const comments = new P.CommentsPage(page, app.contextPath);
    const ccId = sql(app, `SELECT user_comment_id FROM user_comments WHERE comment_text LIKE '%${CC_COMMENT}%'`);
    R.ccCommentId = ccId;
    let listGets = 0;
    page.on('request', (r) => {
        if (r.method() === 'GET' && /\/api\/v1\/comments(\?|$)/.test(r.url())) listGets++;
    });

    await signIn(page, 'rvaca');
    await comments.goto();
    clearOrcid(app, 'ccorino');
    await step('n1CcPanelNoId', async () => {
        const panel = await comments.viewComment(comments.row(CC_COMMENT));
        const out = await panelRead(page, comments, panel, 'n1-cc-panel-no-id');
        const before = listGets;
        await comments.closeButton(panel).click();
        await panel.waitFor({state: 'detached', timeout: 30_000}).catch(() => {});
        await page.waitForTimeout(2000);
        out.urlAfterClose = page.url();
        out.listGetsOnClose = listGets - before;
        return out;
    });
    const aff = takeAffiliation(app, 'ccorino');
    await step('n2CcPanelNoIdNoAff', async () => {
        await comments.goto();
        const panel = await comments.viewComment(comments.row(CC_COMMENT));
        const out = await panelRead(page, comments, panel, 'n2-cc-panel-no-aff');
        await comments.closeCommentPanel();
        return out;
    });
    restoreAffiliation(app, 'ccorino', aff);
    R.verifiedRows = connectOrcid(app, 'ccorino');
    await step('n3CcPanelVerified', async () => {
        await comments.goto();
        const panel = await comments.viewComment(comments.row(CC_COMMENT));
        const out = await panelRead(page, comments, panel, 'n3-cc-panel-verified');
        await comments.closeCommentPanel();
        return out;
    });
    await step('n4ZzPanelUnverified', async () => {
        const panel = await comments.viewComment(comments.row(ZZ_COMMENT));
        const out = await panelRead(page, comments, panel, 'n4-zz-panel-unverified');
        await comments.closeCommentPanel();
        return out;
    });
    // Rule 12: the address the panel writes, opened directly; a number no comment has.
    let panelUrl = null;
    await step('n5PanelAddress', async () => {
        const panel = await comments.viewComment(comments.row(CC_COMMENT));
        panelUrl = page.url();
        await comments.closeCommentPanel();
        await page.goto(panelUrl);
        await comments.commentPanel().waitFor({timeout: 30_000}).catch(() => {});
        await idle(page);
        const open = await comments.commentPanel().count();
        const out = {panelUrl, open, person: open ? flat(await comments.panelPerson().innerText().catch(() => '')) : null};
        record('k13a-n5-address', await screen(page));
        await shot(page, 'k13a-n5-address');
        if (open) await comments.closeCommentPanel();
        out.urlAfterClose = page.url();
        return out;
    });
    await step('n6BogusNumber', async () => {
        if (!panelUrl || !panelUrl.includes(ccId)) return {skipped: `panel address ${panelUrl} does not carry ${ccId}`};
        const bogus = panelUrl.replace(new RegExp(`(=|/)${ccId}(?=\\D|$)`), '$1999999');
        await page.goto(bogus);
        const dlg = comments.errorDialog();
        await dlg.waitFor({timeout: 30_000}).catch(() => {});
        await idle(page);
        const s = await screen(page);
        record('k13a-n6-bogus', s);
        await shot(page, 'k13a-n6-bogus');
        const out = {
            bogus,
            dialog: (await dlg.count()) ? flat(await dlg.innerText()) : null,
            selectedTab: flat(await page.locator('[role="tab"][aria-selected="true"]').first().innerText().catch(() => '')),
            panelOpen: await comments.commentPanel().count(),
        };
        if (await dlg.count()) {
            await dlg.getByRole('button', {name: 'OK', exact: true}).click();
            await idle(page);
            out.urlAfterOk = page.url();
            record('k13a-n6-after-ok', await screen(page));
            await page.reload();
            await dlg.waitFor({timeout: 15_000}).catch(() => {});
            await idle(page);
            out.dialogAfterReload = (await dlg.count()) ? flat(await dlg.innerText()) : null;
            record('k13a-n6-after-reload', await screen(page));
            if (await dlg.count()) await dlg.getByRole('button', {name: 'OK', exact: true}).click();
        }
        return out;
    });
    await step('n7ZzArticle', async () => {
        await signIn(page, 'zzedd');
        await article.goto(SUBMISSION);
        const out = await articleRead(page, article, 'n7-zz-article', [ZZ_COMMENT, CC_COMMENT]);
        out.opened = {};
        for (const [who, text] of [['own', ZZ_COMMENT], ['ccorino', CC_COMMENT]]) {
            const link = article.orcidLink(article.comment(text));
            if (await link.count()) out.opened[who] = await pressOrcidLink(page, link);
        }
        return out;
    });
    await step('n8OutArticle', async () => {
        await signOut(page);
        await article.goto(SUBMISSION);
        return articleRead(page, article, 'n8-out-article', [CC_COMMENT]);
    });
    await step('n9RvArticle', async () => {
        await signIn(page, 'rvaca');
        await article.goto(SUBMISSION);
        return articleRead(page, article, 'n9-rv-article', [CC_COMMENT]);
    });
    // The approval write with both values set, then cleared (Rule 13).
    await step('n9bApproveZz', async () => {
        await comments.goto();
        const panel = await comments.viewComment(comments.row(ZZ_COMMENT));
        const out = await panelRead(page, comments, panel, 'n9b-zz-panel-pending', {press: false});
        await comments.setApproval('Approve Comment');
        out.notices = (await screen(page)).notices;
        return out;
    });
    await step('n9cOutArticle2', async () => {
        await signOut(page);
        await article.goto(SUBMISSION);
        return articleRead(page, article, 'n9c-out-article-2', [ZZ_COMMENT, CC_COMMENT]);
    });
    await step('n9dHideZz', async () => {
        await signIn(page, 'rvaca');
        await comments.goto();
        const panel = await comments.viewComment(comments.row(ZZ_COMMENT));
        const out = await panelRead(page, comments, panel, 'n9d-zz-panel-approved', {press: false});
        await comments.setApproval('Hide Comment');
        out.notices = (await screen(page)).notices;
        const again = await comments.viewComment(comments.row(ZZ_COMMENT));
        out.afterHide = await panelRead(page, comments, again, 'n9d-zz-panel-hidden', {press: false});
        await comments.closeCommentPanel();
        return out;
    });
    // Rule 12's other end: something changed in the panel (a report deleted), then "Close".
    await step('n10ReportDeletedClose', async () => {
        await comments.goto();
        await comments.viewComment(comments.row(CC_COMMENT));
        await comments.viewReport(comments.reportRow(REPORT));
        await comments.deleteReportFromPanel();
        const s = await screen(page);
        record('k13a-n10-after-delete', s);
        const before = listGets;
        await comments.closeButton(comments.commentPanel()).click();
        await comments.commentPanel().waitFor({state: 'detached', timeout: 30_000}).catch(() => {});
        await page.waitForTimeout(2000);
        await idle(page);
        record('k13a-n10-after-close', await screen(page));
        return {notices: s.notices, listGetsOnClose: listGets - before, urlAfterClose: page.url()};
    });
    await step('n11Untick', async () => {
        const tab = new P.CommentsSettingsTab(page, app.contextPath);
        await tab.goto();
        await tab.box().uncheck();
        return {sawSaving: await tab.save()};
    });
    R.enabledAtEnd = sql(app, `SELECT setting_value FROM journal_settings WHERE setting_name = 'enablePublicComments'`);
    await step('n12ZzArticleOff', async () => {
        await signIn(page, 'zzedd');
        await article.goto(SUBMISSION);
        return articleRead(page, article, 'n12-zz-article-off', []);
    });
    clearOrcid(app, 'ccorino');
    await signOut(page);
}

forEachApp(async (app) => {
    if (app.name !== 'ojs') {
        await control(app);
        return;
    }
    const P = require('../../../../../apps/ojs/playwright/pages/ReaderCommentsPages.js');
    const {page, close} = await launch(app);
    const slog = serverLog(app);
    const phases = MODE === 'all' ? ['walk', 'nb'] : [MODE];
    try {
        for (const phase of phases) {
            const R = {mode: phase, app: app.name, logFile: slog.file, steps: {}};
            const step = stepper(R, page, slog);
            try {
                if (phase === 'walk') await walk(app, page, P, step, R);
                else if (phase === 'nb') await nb(app, page, P, step, R);
                else throw new Error(`unknown phase ${phase}`);
            } catch (e) {
                R.error = e.message;
                log('ERROR', phase, e.message);
            } finally {
                R.totalWarnings = Object.values(R.steps).reduce((n, s) => n + s.warningCount, 0);
                record(`k13a-${phase}`, R);
                const warnedSteps = Object.entries(R.steps).filter(([, s]) => s.warningCount).map(([k, s]) => `${k}:${s.warningCount}`);
                note(`ccK13a ${process.env.PROBE_RUN || ''} ${phase}: server-log warnings by step ${warnedSteps.join(', ') || 'none'}`);
            }
        }
    } finally {
        await close();
    }
});
