// Kept check for U14's comment-delete finding (docs/reports/2026-09-26-pkp-lib-usercomment-delete-tasks.md;
// fixed when MODE=collide leaves A's report task in place). Diagnosis probe (flake-s26 u14): two journals, the ids lining up by
// construction. Journal B holds a comment with id c; journal A a comment
// with two reports, the first of which gets report id c (the report
// sequence is padded in a third journal P until it reaches c), the second
// c+1 (the control). A's manager reads the Tasks dialog, B's manager
// deletes B's comment on B's Comments page, A's manager reads again.
// MODE=control deletes a B comment whose id matches no report instead.
const path = require('path');
const ROOT = path.resolve(__dirname, '../../../../..');
const {forEachApp, launch, signIn, record, tag, note} = require('../../../probe');

const MODE = process.env.MODE || 'collide';

forEachApp(async (app) => {
    const {CommentsPage, REPORT_TASK, COMMENT_TASK} = require(path.join(ROOT, `apps/${app.name}/playwright/pages/ReaderCommentsPages.js`));
    const {TasksPanel} = require(path.join(ROOT, 'shared/playwright/pages/NotificationsPages.js'));
    const {expect} = require('@playwright/test');
    const out = {app: app.name, mode: MODE, steps: []};
    const log = (s, d) => { out.steps.push({s, ...d}); console.log(app.name, s, JSON.stringify(d || {})); };

    const T = tag('u14x');
    const A = `${T}a`, B = `${T}b`, P = `${T}p`;
    const u = (ctx, k, roles) => ({username: `${ctx}${k}`, givenName: k, familyName: 'Probe', email: `${ctx}${k}@mail.test`, roles});
    for (const ctx of [A, B, P]) {
        await app.api.createContext({tag: ctx, enablePublicComments: true,
            users: [u(ctx, 'mg', ['manager']), u(ctx, 'au', ['author']), u(ctx, 'ra', ['reader']), u(ctx, 'rb', ['reader'])]});
    }
    const seed = (ctx, sfx, userComments) => app.api.createSubmission({tag: `${ctx}${sfx}`, context: ctx, submitter: `${ctx}au`,
        title: `Article ${ctx}${sfx}`, published: true, userComments});

    // B: the comment to delete (and, in control mode, a second one whose id no report will carry).
    let bText = `B comment ${B}.`;
    const b = await seed(B, 'x', [{user: `${B}ra`, text: bText, approved: true}]);
    let c = b.userComments[0].id;
    log('B comment', {c});

    // P: learn the report sequence, then pad it to c-1.
    let aReports = null, aComment = null;
    for (let attempt = 0; attempt < 4 && !aReports; attempt++) {
        const probeSeed = await seed(P, `l${attempt}`, [{user: `${P}ra`, text: `pad ${P}.`, approved: true, reports: [{user: `${P}rb`, note: 'pad'}]}]);
        const r0 = probeSeed.userComments[0].reports[0];
        const n = c - r0 - 1;
        log('report seq', {r0, pad: n});
        if (n < 0) {
            bText = `B comment ${B} ${attempt}.`;
            c = (await seed(B, `x${attempt}`, [{user: `${B}ra`, text: bText, approved: true}])).userComments[0].id;
            log('B comment (again)', {c});
            continue;
        }
        if (n > 0) {
            await seed(P, `p${attempt}`, [{user: `${P}ra`, text: `pad ${P}.`, approved: true,
                reports: Array.from({length: n}, () => ({user: `${P}rb`, note: 'pad'}))}]);
        }
        const a = await seed(A, `y${attempt}`, [{user: `${A}ra`, text: `A comment ${A}.`, approved: true,
            reports: [{user: `${A}rb`, note: `A target report ${A}.`}, {user: `${A}rb`, note: `A control report ${A}.`}]}]);
        const ids = a.userComments[0].reports;
        log('A seeded', {comment: a.userComments[0].id, reports: ids});
        if (ids[0] === c) {
            aReports = ids; aComment = a.userComments[0].id;
        }
    }
    if (!aReports) {
        throw new Error('could not line the ids up');
    }

    let deleteId = c, deleteText = bText;
    if (MODE === 'control') {
        const b2 = await seed(B, 'z', [{user: `${B}ra`, text: `B other comment ${B}.`, approved: true}]);
        deleteId = b2.userComments[0].id;
        deleteText = `B other comment ${B}.`;
        log('control: deleting instead', {deleteId});
    }

    const {page: am, close: closeA} = await launch(app);
    const {page: bm, close: closeB} = await launch(app);
    try {
        const readA = async (label) => {
            await am.goto(`/index.php/${A}/dashboard/editorial`);
            const tasks = new TasksPanel(am);
            await expect(tasks.bell()).toBeVisible({timeout: 30_000});
            await tasks.open();
            const counts = {
                comment: await tasks.rowsOpening(COMMENT_TASK).count(),
                report: await tasks.rowsOpening(REPORT_TASK).count(),
                target: await tasks.row(`A target report ${A}.`).count(),
                control: await tasks.row(`A control report ${A}.`).count(),
            };
            await tasks.close();
            log(`A tasks ${label}`, counts);
            return counts;
        };
        await signIn(am, `${A}mg`);
        await signIn(bm, `${B}mg`);
        const before = await readA('before');

        const bComments = new CommentsPage(bm, B);
        await bComments.goto();
        if (bComments.deleteFromRow) {
            await bComments.deleteFromRow(bComments.row(deleteText));
        } else {
            await bComments.deleteCommentFromRow(bComments.row(deleteText));
            await bComments.confirmDeleteComment();
        }
        log('B deleted', {deleteId});

        const after = await readA('after');
        // The reports themselves: A's Comments page › Reported, the comment's panel.
        const aComments = new CommentsPage(am, A);
        await aComments.goto();
        await aComments.openTab('Reported');
        const reportedRow = await aComments.row(`A comment ${A}.`).count();
        await aComments.goto(`?commentId=${aComment}`);
        await expect(aComments.commentPanel()).toBeVisible({timeout: 30_000});
        const targetListed = await aComments.commentPanel().getByText(`A target report ${A}.`).count();
        const controlListed = await aComments.commentPanel().getByText(`A control report ${A}.`).count();
        log('A reports still listed', {reportedRow, targetListed, controlListed});
        out.result = {c, aReports, deleteId, before, after, reportedRow, targetListed, controlListed};
        record(`collide-${MODE}`, out);
        note(`u14 collide probe ${app.name} ${MODE}: B deleted comment ${deleteId}; A report ids ${aReports}; A report rows before ${before.report} after ${after.report} (target ${before.target}->${after.target}, control ${before.control}->${after.control}); target report still listed on A's Comments page: ${targetListed}`);
    } finally {
        await closeA();
        await closeB();
    }
});
