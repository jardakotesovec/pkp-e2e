// PR review check — pkp/pkp-lib#13636 "Anonymize authors in unsubscribe footer" (issue pkp/pkp-lib#12879; the
// stable-3_4_0 and stable-3_5_0 ports #12882 and #12884 merged 2026-06-12). On main a discussion is an editorial task,
// and every email about it is a TemplateVariables mailable with the Discussion trait's footer "Reply to this comment at
// #{submissionId} {authorsShort} or unsubscribe …". The PR blanks {authors} and {authorsShort} in that mailable when a
// recipient holds a double-anonymous review assignment on the submission.
//
// On the seeded fleet (users.md roster, `publicknowledge`), per leg a scratch submission in its first review round with
// `reviewer.julia` accepted, the round's review method then set by SQL; `sectioneditor.ana` opens a discussion with
// the reviewer through POST submissions/<id>/tasks (the "Add" window's request), the reviewer answers through POST
// …/tasks/<id>/notes, and the footer of each email is read from Mailpit:
//
//   double     review method 2 (Anonymous Reviewer/Anonymous Author)  the reviewer's mail, then the SE's mail of the reply
//   anonymous  review method 1 (Anonymous Reviewer/Disclosed Author)  the reviewer's mail
//   open       review method 3 (Open)                                  the reviewer's mail
//   cancelled  method 2, the assignment then cancelled                 the reviewer's mail
//   author     (OPS only, no review) a discussion SE ↔ `author.alex`   the author's mail
//
// It asserts nothing, so it runs unchanged with lib/pkp at the apps' pointer (67d844dfc0, before) and at the PR head
// (631be03740).
//
//   npm run fleet-prep -- --feature <f>
//   PROBE_FEATURE=<f> PROBE_AGENT=pr13636 [PROBE_RUN=<run>] \
//     node bin/probe.js <ojs|omp|ops|all> shared/playwright/checks/sync/pkp-lib-13636/walk.js
//
// Facts: walk-<pkp-lib sha>[-<PROBE_RUN>]-<app>.json
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, launch, signIn, idle, record, sql, serverLog} = require('../../../probe');

const CONTEXT = 'publicknowledge';
const SE = 'sectioneditor.ana';
const REVIEWER = 'reviewer.julia';
const AUTHOR = 'author.alex';
const REVIEW_STAGE = 3;
const flat = (text) => (text || '').replace(/\s+/g, ' ').trim();

forEachApp(async (app) => {
    const sha = execFileSync('git', ['-C', path.join(path.resolve(app.root), 'lib/pkp'), 'rev-parse', '--short=10', 'HEAD'], {encoding: 'utf8'}).trim();
    const run = process.env.PROBE_RUN ? `-${process.env.PROBE_RUN}` : '';
    const facts = {app: app.name, libPkp: sha, legs: {}};
    const uid = (username) => Number(sql(app, `select user_id from users where username = '${username}'`));
    const log = serverLog(app);
    const from = log.mark();
    const stamp = Date.now().toString(36);

    // One signed-in page per user; `call` runs a fetch with the page's CSRF token.
    const pages = {};
    const pageOf = async (username) => {
        if (!pages[username]) {
            const {page, close} = await launch(app);
            await signIn(page, username, {contextPath: CONTEXT});
            await page.goto(`/index.php/${CONTEXT}/en/user/profile`);
            await idle(page);
            pages[username] = {page, close};
        }
        return pages[username].page;
    };
    const call = async (username, method, route, body) => (await pageOf(username)).evaluate(async ([m, r, b]) => {
        const res = await fetch(pkp.context.apiBaseUrl + r, {
            method: m,
            headers: {'X-Csrf-Token': pkp.currentUser.csrfToken, 'Content-Type': 'application/json'},
            body: b === undefined ? undefined : JSON.stringify(b),
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (e) { /* keep the text */ }
        return {status: res.status, json, text: json ? undefined : text.slice(0, 400)};
    }, [method, route, body]);

    // The newest mail to `username` with `subject`, waited for; its footer sentence and the author's family name.
    const mailTo = async (username, subject, waitFor) => {
        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
            const result = await app.mail._search({to: `${username}@mail.test`, subject});
            for (const summary of result.messages || []) {
                const m = await app.mail.fullMessage(summary.ID);
                const text = flat(m.Text);
                if (!waitFor || text.includes(waitFor)) {
                    const footer = (text.match(/Reply to this comment at .*?unsubscribe/) || [null])[0];
                    const link = (m.HTML.match(/Reply to this comment at <a href="[^"]*">([^<]*)<\/a>/) || [null, null])[1];
                    return {subject: m.Subject, footer, linkText: link, namesAuthor: /Author/.test(footer || ''), from: m.From && m.From.Address};
                }
            }
            await new Promise((r) => setTimeout(r, 1000));
        }
        return {missing: true};
    };

    const seeded = async (leg, reviewers) => app.api.createSubmission({
        tag: `pr13636${leg}${stamp}`,
        context: CONTEXT,
        submitter: AUTHOR,
        title: `Submission pr13636 ${leg} ${stamp}`,
        // OMP: the series assigns the Section Editor, as the journal's section does on OJS (U37 footnote s).
        ...(app.name === 'omp' ? {series: 'monographs'} : {}),
        ...(reviewers ? {decisions: ['sendExternalReview'], reviewRounds: [{reviewers}]} : {}),
    });

    const discussion = async (leg, sid, stageId, to) => {
        const title = `pr13636 ${leg} ${stamp}`;
        const add = await call(SE, 'POST', `submissions/${sid}/tasks`, {
            type: 1,
            title,
            stageId,
            description: `<p>Opening message for ${leg}.</p>`,
            participants: [{userId: uid(SE)}, {userId: uid(to)}],
        });
        return {title, add: {status: add.status, id: add.json && add.json.id, error: add.status >= 300 ? (add.json || add.text) : undefined}};
    };

    try {
        const legs = app.name === 'ops' ? [] : [['double', 2], ['anonymous', 1], ['open', 3], ['cancelled', 2]];
        for (const [leg, method] of legs) {
            const s = await seeded(leg, [{username: REVIEWER, status: 'accepted'}]);
            const sid = s.submissionId;
            sql(app, `update review_assignments set review_method = ${method} where submission_id = ${sid}`);
            if (leg === 'cancelled') {
                sql(app, `update review_assignments set cancelled = 1 where submission_id = ${sid}`);
            }
            const f = {submissionId: sid, reviewMethod: sql(app, `select review_method || '/' || cancelled from review_assignments where submission_id = ${sid}`)};
            const d = await discussion(leg, sid, REVIEW_STAGE, REVIEWER);
            Object.assign(f, d);
            if (d.add.status === 200) {
                f.reviewerMail = await mailTo(REVIEWER, d.title, `Opening message for ${leg}.`);
                f.seOwnMail = await mailTo(SE, d.title, `Opening message for ${leg}.`);
                if (leg === 'double') {
                    const reply = await call(REVIEWER, 'POST', `submissions/${sid}/tasks/${d.add.id}/notes`, {contents: '<p>Reply from the reviewer.</p>'});
                    f.reply = {status: reply.status, error: reply.status >= 300 ? (reply.json || reply.text) : undefined};
                    f.seReplyMail = await mailTo(SE, d.title, 'Reply from the reviewer.');
                    f.reviewerReplyMail = await mailTo(REVIEWER, d.title, 'Reply from the reviewer.');
                }
            }
            facts.legs[leg] = f;
        }
        // Control on every app: a discussion with the Author on the submission's own stage.
        {
            const s = await seeded('author', null);
            const sid = s.submissionId;
            const stageId = Number(sql(app, `select stage_id from submissions where submission_id = ${sid}`));
            const f = {submissionId: sid, stageId};
            const d = await discussion('author', sid, stageId, AUTHOR);
            Object.assign(f, d);
            if (d.add.status === 200) {
                f.authorMail = await mailTo(AUTHOR, d.title, 'Opening message for author.');
            }
            facts.legs.author = f;
        }
    } finally {
        for (const {close} of Object.values(pages)) {
            await close();
        }
        facts.serverErrors = log.since(from);
        record(`walk-${sha}${run}`, facts);
    }
});
