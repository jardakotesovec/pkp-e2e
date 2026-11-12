// U37 "Tasks & discussions": the register entries walked on OJS 3.5 (stable-3_5_0), for the
// "Versions" column of the spec's Findings register. 3.5 has the older "Discussions" grid; the grid
// helpers come from ../lib.js (the body walk's), which this file only requires.
//
// Re-run, one part per process (each part makes its own scratch journal, accounts and submission,
// and touches nothing else; the 3.5 probe server must be up, harness.md "The stable lines"):
//
//   PKP_E2E_LINE=stable-3_5_0 PROBE_FEATURE=lines35 PROBE_AGENT=u37reg PROBE_RUN=r1 \
//     node bin/probe.js ojs lines/stable-3_5_0/shared/playwright/checks/U37/W1/register/walk.js <part>
//
// Run each part twice (PROBE_RUN=r1, then r2). No assertions: each screen is saved with screen() as
// <part>-<nn>-<name>-<run>-ojs.json and what the part read is in facts-<part>-<run>-ojs.json.
//
// Parts (the register entry each one walks):
//   a14   A14: a reviewer of an "Anonymous Reviewer/Disclosed Author" review, at step 3, presses "Add
//         discussion": is the Author offered under "Participants", and what does "OK" answer with the
//         Author ticked. Control: the same reviewer with only the Section Editor ticked saves.
//   a19   A19: a Journal Manager also assigned as Section Editor; the "Participants" line under them
//         in "Add discussion" as read by another Journal Manager, the Site Administrator, themselves,
//         another Section Editor and the Author.
//   a20   A20: a two-person discussion (two Section Editors); the Journal Manager removes one on the
//         Participants panel; the other renames the discussion through "Edit". Control: the same
//         rename before the removal saves.
const {forEachApp, launch, signIn, screen, record, idle, tag} = require('../../../../probe');
const L = require('../lib.js');

const PARTS = process.argv.slice(2).filter((a) => /^a\d+$/.test(a));
const mailOf = (username) => `${username}@mail.test`;

/** A recorder for one part: numbered snapshots, facts, and steps that never throw. */
function recorder(part) {
    const facts = {part, errors: []};
    let n = 0;
    return {
        facts,
        async snap(page, name) {
            n += 1;
            const data = await screen(page);
            record(`${part}-${String(n).padStart(2, '0')}-${name}`, data);
            return data;
        },
        async step(name, fn) {
            try {
                const out = await fn();
                if (out !== undefined) facts[name] = out;
                console.log(`[${part}] ${name}: ${JSON.stringify(out === undefined ? 'done' : out).slice(0, 1500)}`);
                return out;
            } catch (error) {
                facts.errors.push({step: name, error: String(error && error.message ? error.message : error).slice(0, 600)});
                console.log(`[${part}] ${name}: ERROR ${String(error && error.message).slice(0, 600)}`);
                return null;
            }
        },
        save() {
            record(`facts-${part}`, facts);
        },
    };
}

/** A scratch journal with throwaway accounts `{key: [givenName, familyName, roles]}`. */
async function journal(app, accounts, extra = {}) {
    const t = tag('l35u37r');
    const people = {};
    for (const [key, [givenName, familyName, roles]] of Object.entries(accounts)) {
        const username = `${key}${t}`;
        people[key] = {username, givenName, familyName, roles, name: `${givenName} ${familyName}`, mail: mailOf(username)};
    }
    const ctx = await app.api.createContext({
        tag: t,
        context: {name: `Journal ${t}`},
        users: Object.values(people).map(({username, givenName, familyName, roles}) => ({username, givenName, familyName, roles})),
        ...extra,
    });
    return {t, path: ctx.path, people};
}

async function browserAs(app, username, ctxPath) {
    const b = await launch(app);
    b.page.on('dialog', (d) => d.accept().catch(() => {}));
    await signIn(b.page, username, {contextPath: ctxPath});
    return b;
}

/** The reviewer's own review screen, moved on to step 3 (where the "Review Discussions" grid is). */
async function reviewerStep3(page, app, ctxPath, submissionId) {
    await page.goto(app.url(`/index.php/${ctxPath}/en/reviewer/submission/${submissionId}`));
    await idle(page);
    for (const name of ['Save and continue', 'Accept Review, Continue to Step #2', 'Continue to Step #3']) {
        const b = page.getByRole('button', {name, exact: true});
        if ((await b.count()) && (await b.first().isVisible())) {
            await b.first().click();
            await L.sleep(1500);
            await idle(page);
        }
    }
    await L.grid(page).waitFor({timeout: 30_000}).catch(() => {});
    await idle(page);
    await L.sleep(500);
}

/** The open form's dialog text (where a refusal shows), its boxes and its field errors. */
async function formState(page) {
    const form = L.queryForm(page);
    const open = (await page.locator('form#queryForm:visible').count()) > 0;
    if (!open) return {open};
    const dlg = page.locator('[role="dialog"]').filter({has: form}).last();
    return {
        open,
        boxes: await L.boxes(page, form),
        errors: await form.locator('.error:visible, label.error:visible, .pkp_form_error:visible, #formErrors:visible, .pkp_form_error_list:visible').allInnerTexts().then((a) => a.map((t) => L.flat(t, 300)).filter(Boolean)).catch(() => []),
        dialogText: L.flat(await dlg.innerText().catch(() => null), 900),
    };
}

// ---------------------------------------------------------------------------------------------
// A14: an "Anonymous Reviewer/Disclosed Author" reviewer offered the Author.
async function a14(app) {
    const R = recorder('a14');
    const {step, snap, facts} = R;
    const J = await journal(
        app,
        {se: ['Sena', 'Sectioned', ['sectionEditor']], au: ['Aura', 'Author', ['author']], rv: ['Rhea', 'Reviewer', ['externalReviewer']]},
        {review: {defaultReviewMode: 'anonymous'}}
    );
    const {se, au, rv} = J.people;
    const sub = await app.api.createSubmission({
        tag: `${J.t}a`, context: J.path, submitter: au.username, title: `Submission ${J.t}a`,
        participants: [{username: se.username, role: 'sectionEditor'}],
        decisions: ['sendExternalReview'],
        reviewRounds: [{reviewers: [{username: rv.username, status: 'accepted'}]}],
    });
    facts.journal = J.path;
    facts.seed = {reviewAssignments: sub.reviewAssignments};
    const r = await browserAs(app, rv.username, J.path);
    try {
        await reviewerStep3(r.page, app, J.path, sub.submissionId);
        await snap(r.page, 'rv-step3');
        await step('grid', () => L.readGrid(r.page));
        const form = await L.openAdd(r.page);
        await snap(r.page, 'rv-add-window');
        await step('offered', async () => (await L.readForm(r.page, form)).boxes);
        await step('withAuthor', async () => {
            await form.locator('input[name="subject"]').fill('Question on the data');
            await L.typeMessage(r.page, form, 'Where is the raw data kept?');
            const ticked = await L.tick(r.page, au.name, true);
            await L.tick(r.page, se.name, true);
            const out = await L.pressOk(r.page, form);
            await snap(r.page, 'rv-with-author-ok');
            return {authorBox: ticked, ...out, after: await formState(r.page)};
        });
        await step('control', async () => {
            if (!(await r.page.locator('form#queryForm:visible').count())) return {skipped: 'form closed'};
            // The refused form comes back re-drawn: what it kept of the ticks, the subject and the message.
            const f = L.queryForm(r.page);
            const kept = {boxes: await L.boxes(r.page, f), subject: await f.locator('input[name="subject"]').inputValue().catch(() => null), message: await L.readMessage(r.page, f).catch(() => null)};
            await L.tick(r.page, au.name, false);
            await L.tick(r.page, se.name, true);
            if (!kept.subject) await f.locator('input[name="subject"]').fill('Question on the data');
            if (!kept.message) await L.typeMessage(r.page, f, 'Where is the raw data kept?');
            const out = await L.pressOk(r.page, f);
            await snap(r.page, 'rv-control-ok');
            return {kept, ...out, after: await formState(r.page), grid: await L.readGrid(r.page)};
        });
    } finally {
        R.save();
        await r.close();
    }
}

// ---------------------------------------------------------------------------------------------
// A19: the role line under a manager who is also the submission's Section Editor.
async function a19(app) {
    const R = recorder('a19');
    const {step, snap, facts} = R;
    const J = await journal(app, {
        jm: ['Mona', 'Manager', ['manager', 'sectionEditor']],
        jm2: ['Milo', 'Manager', ['manager']],
        se: ['Sena', 'Sectioned', ['sectionEditor']],
        au: ['Aura', 'Author', ['author']],
    });
    const {jm, jm2, se, au} = J.people;
    const sub = await app.api.createSubmission({
        tag: `${J.t}a`, context: J.path, submitter: au.username, title: `Submission ${J.t}a`,
        participants: [{username: jm.username, role: 'sectionEditor'}, {username: se.username, role: 'sectionEditor'}],
    });
    facts.journal = J.path;
    const viewers = [['jm2', jm2.username, 'editorial'], ['admin', 'admin', 'editorial'], ['self', jm.username, 'editorial'], ['se', se.username, 'editorial'], ['author', au.username, 'mySubmissions']];
    facts.lines = {};
    for (const [key, username, view] of viewers) {
        await step(`as-${key}`, async () => {
            const b = await browserAs(app, username, J.path);
            try {
                await L.openStage(b.page, app, J.path, sub.submissionId, L.MENU_KEY.submission, {view});
                const grid = await L.readGrid(b.page);
                if (!grid.present) {
                    await snap(b.page, `${key}-no-grid`);
                    return {grid};
                }
                const form = await L.openAdd(b.page);
                await snap(b.page, `${key}-add-window`);
                const boxes = await L.boxes(b.page, form);
                facts.lines[key] = boxes.filter((l) => l.includes(jm.name));
                return {boxes};
            } finally {
                await b.close();
            }
        });
    }
    R.save();
}

// ---------------------------------------------------------------------------------------------
// A20: a two-person discussion after one of the two is removed from the submission.
async function a20(app) {
    const R = recorder('a20');
    const {step, snap, facts} = R;
    const J = await journal(app, {
        mgr: ['Mona', 'Manager', ['manager']],
        se1: ['Sena', 'Sectioned', ['sectionEditor']],
        se2: ['Sven', 'Sectioned', ['sectionEditor']],
        au: ['Aura', 'Author', ['author']],
    });
    const {mgr, se1, se2} = J.people;
    const sub = await app.api.createSubmission({
        tag: `${J.t}a`, context: J.path, submitter: J.people.au.username, title: `Submission ${J.t}a`,
        participants: [{username: se1.username, role: 'sectionEditor'}, {username: se2.username, role: 'sectionEditor'}],
        decisions: ['skipExternalReview', 'sendToProduction'],
    });
    facts.journal = J.path;
    const id = sub.submissionId;
    const s = await browserAs(app, se1.username, J.path);
    const m = await browserAs(app, mgr.username, J.path);
    const SUBJ = 'Two of us';
    try {
        await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
        await step('given', async () => {
            const out = await L.addDiscussion(s.page, {tickNames: [se2.name], subject: SUBJ, message: 'Just the two of us.', label: null});
            await snap(s.page, 'se1-after-add');
            return {...out, grid: await L.readGrid(s.page)};
        });
        await step('controlRename', async () => {
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
            const f = await L.openEdit(s.page, SUBJ);
            if (!f) return {edit: false};
            await snap(s.page, 'se1-edit-before-remove');
            const read = await L.readForm(s.page, f);
            await f.locator('input[name="subject"]').fill(`${SUBJ} (1)`);
            const out = await L.pressOk(s.page, f);
            await snap(s.page, 'se1-edit-before-remove-ok');
            return {boxes: read.boxes, ...out, after: await formState(s.page)};
        });
        await step('removeParticipant', async () => {
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const row = m.page.locator('li, tr').filter({hasText: se2.name}).filter({has: m.page.getByRole('button', {name: /More Actions/})}).last();
            await row.getByRole('button', {name: /More Actions/}).first().click();
            await L.sleep(500);
            await m.page.getByRole('menuitem', {name: 'Remove', exact: true}).click();
            await L.sleep(1200);
            await idle(m.page);
            const data = await snap(m.page, 'mgr-remove-participant');
            const ok = m.page.locator('[role="dialog"]:visible').last().getByRole('button', {name: /^(OK|Yes|Remove)$/}).first();
            await ok.click();
            await L.sleep(1500);
            await idle(m.page);
            await L.openStage(m.page, app, J.path, id, L.MENU_KEY.production);
            const after = await snap(m.page, 'mgr-after-remove');
            const t = after.text.dialog || after.text.main || '';
            return {dialog: L.flat(data.text.dialog, 300), participantsPanel: L.flat(t.slice(Math.max(0, t.indexOf('PARTICIPANTS'))), 300)};
        });
        await step('windowAfterRemove', async () => {
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
            const d = await L.openDiscussion(s.page, `${SUBJ} (1)`);
            if (!d) return {listed: false};
            await snap(s.page, 'se1-window-after-remove');
            const out = await L.readDiscussion(s.page, d);
            await L.closeWindow(s.page, d);
            return {participants: out.participants, editLink: out.editLink};
        });
        await step('renameAfterRemove', async () => {
            await L.openStage(s.page, app, J.path, id, L.MENU_KEY.production);
            const f = await L.openEdit(s.page, `${SUBJ} (1)`);
            if (!f) return {edit: false};
            await snap(s.page, 'se1-edit-after-remove');
            const read = await L.readForm(s.page, f);
            await f.locator('input[name="subject"]').fill(`${SUBJ} (2)`);
            const out = await L.pressOk(s.page, f);
            await snap(s.page, 'se1-edit-after-remove-ok');
            return {boxes: read.boxes, ...out, after: await formState(s.page), grid: (await L.readGrid(s.page)).rows};
        });
    } finally {
        R.save();
        await s.close();
        await m.close();
    }
}

const RUN = {a14, a19, a20};

forEachApp(async (app) => {
    if (app.line !== 'stable-3_5_0') throw new Error('register/walk.js drives OJS 3.5: put PKP_E2E_LINE=stable-3_5_0 in front');
    if (!PARTS.length) throw new Error(`register/walk.js: name a part (${Object.keys(RUN).join(', ')})`);
    for (const part of PARTS) {
        if (!RUN[part]) throw new Error(`register/walk.js: no part "${part}"`);
        await RUN[part](app);
    }
});
