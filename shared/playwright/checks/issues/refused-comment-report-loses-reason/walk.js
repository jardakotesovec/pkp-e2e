// U14 A14 issue walk: a report the server refuses closes the "Report Comment" window and loses the
// typed reason. On PKP's default test dataset, OJS (a press and a preprint server have no reader
// comments). Steps: docs/issues/U14-A14-refused-comment-report-loses-reason.md.
//
//   PROBE_FEATURE=issues-q26d PROBE_AGENT=q26d node bin/probe.js ojs \
//     shared/playwright/checks/issues/refused-comment-report-loses-reason/walk.js
//
// MODE=walk (default) takes the Steps: dbarnes switches comments on, ckwantes comments on article 17,
// dbarnes approves it; lchristopher (window A) opens "Report" on it and types a reason, dbarnes
// (window B) hides the comment on Content › Comments, lchristopher presses "Submit", then "OK", then
// opens "Report" again. MODE=session, the second failure, alone: lchristopher opens "Report" and types
// a reason, logs out in a second tab of the same browser, then presses "Submit". MODE=nb, the
// neighbour, alone: an accepted report and "Cancel" still close the window. Every step records what
// it saw rather than throwing, so the fix's state is read too.
const {forEachApp, launch, signIn, signOut, record, screen, serverLog, idle} = require('../../../probe');
const L = require('./lib.js');

const MODE = process.env.MODE || 'walk';
const ARTICLE = 17; // "Antimicrobial, heavy metal resistance and plasmid profile of coliforms …", published
const COMMENT = 'hkq26d comment by ckwantes';
const REASON = 'hkq26d reason: off-topic advertising';

forEachApp(async (app) => {
    if (app.name !== 'ojs') return; // the surface is OJS's alone
    const A = app.contextPath;
    const out = {mode: MODE};
    const step = (name, data) => { out[name] = data; record(MODE, out); };
    const guard = async (name, fn) => {
        try { const v = await fn(); step(name, v === undefined ? 'ok' : v); return v; } catch (e) { step(name, {error: L.flat(e && e.message, 500)}); return null; }
    };
    const log = serverLog(app);
    const a = await launch(app);
    const b = await launch(app);
    try {
        // Preconditions, through the screens.
        await signIn(b.page, 'dbarnes');
        step('p1-enable-comments', await L.enableComments(b.page, A));
        await signIn(a.page, 'ckwantes');
        step('p2-ckwantes-comment-id', await L.writeComment(a.page, A, ARTICLE, COMMENT));
        await L.moderate(b.page, A, COMMENT, 'Approve Comment');
        step('p3-approved', true);
        await signOut(a.page);

        const {ArticleCommentsPage} = L.po();
        await signIn(a.page, 'lchristopher');
        const landing = new ArticleCommentsPage(a.page, A);

        if (MODE === 'nb') {
            // Neighbour: an accepted report closes the window; "Cancel" closes it.
            await landing.goto(ARTICLE);
            await idle(a.page);
            const dialog = await landing.openReportDialog(landing.comment(COMMENT));
            await landing.reasonBox(dialog).fill(REASON);
            step('n1-accepted-submit', await L.submitAndRead(a.page, dialog));
            await guard('n2-cancel', async () => {
                const d = await landing.openReportDialog(landing.comment(COMMENT));
                await landing.reasonBox(d).fill('hkq26d cancelled');
                await d.getByRole('button', {name: 'Cancel', exact: true}).click();
                await a.page.waitForTimeout(1500);
                return {dialogs: await L.dialogs(a.page)};
            });
            step('n-screen', await screen(a.page));
            return;
        }

        if (MODE === 'session') {
            // The session ends in another tab before "Submit"; then "OK", and what is left.
            await landing.goto(ARTICLE);
            await idle(a.page);
            const dialog = await landing.openReportDialog(landing.comment(COMMENT));
            await landing.reasonBox(dialog).fill(REASON);
            const tab = await a.page.context().newPage();
            await signOut(tab);
            step('x1-logged-out-in-tab', tab.url());
            await tab.close();
            const from = log.mark();
            step('x2-submit', await L.submitAndRead(a.page, dialog));
            step('x2-server-log', log.since(from));
            await guard('x3-ok', async () => {
                await a.page.getByRole('dialog', {name: 'Error', exact: true}).getByRole('button', {name: 'OK', exact: true}).click();
                await a.page.waitForTimeout(1500);
                return {dialogs: await L.dialogs(a.page)};
            });
            step('x-screen', await screen(a.page));
            return;
        }

        // 1-3. lchristopher opens the article, "…" › "Report" on ckwantes's comment, types the reason.
        await landing.goto(ARTICLE);
        await idle(a.page);
        const dialog = await landing.openReportDialog(landing.comment(COMMENT));
        await landing.reasonBox(dialog).fill(REASON);
        step('s3-before-submit', {dialogs: await L.dialogs(a.page)});
        // 4. dbarnes hides the comment on Content › Comments (window B).
        await L.moderate(b.page, A, COMMENT, 'Hide Comment');
        step('s4-hidden', true);
        // 5. lchristopher presses "Submit" (page not reloaded).
        const from = log.mark();
        step('s5-submit', await L.submitAndRead(a.page, dialog));
        step('s5-screen', await screen(a.page));
        step('s5-server-log', log.since(from));
        // 6. "OK" on the "Error" window, then "…" › "Report" on the same comment again.
        await guard('s6-ok', async () => {
            await a.page.getByRole('dialog', {name: 'Error', exact: true}).getByRole('button', {name: 'OK', exact: true}).click();
            await a.page.waitForTimeout(1500);
            return {dialogs: await L.dialogs(a.page)};
        });
        await guard('s6-report-again', async () => {
            if (await landing.reportDialog().count()) {
                return {stillOpen: true, dialogs: await L.dialogs(a.page)};
            }
            if (!(await landing.comment(COMMENT).count())) {
                return {stillOpen: false, commentListed: false, comments: await landing.comments().count()};
            }
            const d = await landing.openReportDialog(landing.comment(COMMENT));
            return {stillOpen: false, reasonBox: await landing.reasonBox(d).inputValue(), dialogs: await L.dialogs(a.page)};
        });
        step('s6-screen', await screen(a.page));
    } catch (e) {
        step('error', String((e && e.stack) || e).slice(0, 2000));
        throw e;
    } finally {
        await a.close();
        await b.close();
    }
});
