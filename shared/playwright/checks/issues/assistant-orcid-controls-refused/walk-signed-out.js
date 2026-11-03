// Kept walk for docs/issues/U04-A5-orcid-field-refusal-shown-as-done.md (spec U04, register A5), from
// its 2026-11-03 refresh: the refusal the screens still reach once the Assistant is admitted
// (pkp/pkp-lib#13517) is a session that ended while the contributor's form was open.
// On PKP's default test dataset (a dataset fleet), OJS, OMP and OPS: dbarnes turns ORCID on (Member
// Sandbox, dummy credentials), opens the contributor's "Edit", signs out in a second tab of the same
// browser (user menu › "Logout"), and back in the first tab presses "Request verification" › "Yes"
// and "OK" on the error window; then signs in again in the second tab and opens the contributor
// there. Then, once the contributor holds a verified iD (the one precondition only ORCID's sign-in
// creates, written by SQL as VerifyIdentityWithOrcid stores it), the same with "Delete" › "Yes".
// Run:
//   PROBE_FEATURE=<dataset fleet feature> PROBE_AGENT=<id> node bin/probe.js all \
//     shared/playwright/checks/issues/assistant-orcid-controls-refused/walk-signed-out.js
// WALK_MODE=neighbour runs only the neighbour check for a fix trial: the same dbarnes requests
// verification and deletes the iD without signing out; both must keep working and the field must
// change as before (the fix must not hide a success).
// Each step records what it saw and never throws, so a fix's state is recorded, not fatal.
const {forEachApp, launch, signIn, record, note, screen, shot, serverLog} = require('../../../probe');
const K = require('./lib.js');

const MODE = process.env.WALK_MODE || 'steps';
const NB = MODE === 'neighbour';

forEachApp(async (app) => {
    const c = K.CASES[app.name];
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, submission: c.id, contributor: c.contributor, actor: 'dbarnes'};
    const step = async (key, fn) => {
        try {
            facts[key] = await fn();
        } catch (e) {
            facts[key] = {error: K.flat(e.message, 400)};
            note(`U04 A5 signed-out walk (${app.name}, ${facts.line}, ${MODE}): step ${key} failed: ${K.flat(e.message, 200)}`);
        }
        return facts[key];
    };
    const log = serverLog(app);
    const from = log.mark();
    const {page} = await launch(app);
    let tab = null;
    await signIn(page, 'dbarnes');
    await step('p1-orcid-on', async () => {
        const out = await K.enableOrcid(page, app);
        return {save: out.save, savedStatus: out.savedStatus, stored: out.stored};
    });

    const field = () => page.locator('[data-cy="active-modal"] .pkpFormField').filter({hasText: 'ORCID iD'}).first();
    const reopenOn = async (p, name) => {
        await K.openContributors(p, app, c);
        const {field: f, modal} = await K.openContributor(p, c.contributor);
        const out = await K.fieldState(f);
        await shot(p, name);
        await K.closeContributor(p, modal);
        return out;
    };

    // Requesting verification (steps 1–5)
    let since = new Date();
    await step('s1-open', async () => {
        const list = await K.openContributors(page, app, c);
        const {field: f} = await K.openContributor(page, c.contributor);
        return {list, field: await K.fieldState(f)};
    });
    if (!NB) {
        await step('s2-logout-other-tab', async () => {
            const out = await K.logoutInOtherTab(page, app);
            tab = out.tab;
            return {landed: out.landed};
        });
    }
    await step('s3-request', async () => {
        since = new Date();
        const stray = NB ? [] : await K.dismissErrors(page);
        const out = await K.pressAndConfirm(page, field(), 'Request verification', '/orcid/requestAuthorVerification/');
        await shot(page, `a5so-${MODE}-s3-after-request`);
        out.notices = (await screen(page)).notices;
        return {strayErrorsBefore: stray, ...out};
    });
    await step('s5-after', async () => {
        if (NB) {
            await page.goto('about:blank');
            return {reloaded: await reopenOn(page, `a5so-${MODE}-s5-reloaded`)};
        }
        const landed = await K.loginOnTab(tab, 'dbarnes');
        return {landed, field: await reopenOn(tab, `a5so-${MODE}-s5-other-tab`)};
    });
    await step('s5-mail', () => K.mailTo(app, c.email, since));
    facts['s5-stored'] = K.stored(app, c);

    // Deleting the iD (steps 6–10), after the SQL precondition
    await step('p6-verified-id', async () => K.verifiedId(app, c));
    await step('s7-open', async () => {
        await page.goto('about:blank');
        await K.openContributors(page, app, c);
        const {field: f} = await K.openContributor(page, c.contributor);
        return K.fieldState(f);
    });
    if (!NB) {
        await step('s8-logout-other-tab', async () => {
            const out = await K.logoutInOtherTab(page, app, tab);
            tab = out.tab;
            return {landed: out.landed};
        });
    }
    await step('s9-delete', async () => {
        await K.sleep(3000);
        const stray = NB ? [] : await K.dismissErrors(page);
        const out = await K.pressAndConfirm(page, field(), 'Delete', '/orcid/deleteForAuthor/');
        await shot(page, `a5so-${MODE}-s9-after-delete`);
        return {strayErrorsBefore: stray, ...out};
    });
    await step('s10-after', async () => {
        if (NB) {
            await page.goto('about:blank');
            return {reloaded: await reopenOn(page, `a5so-${MODE}-s10-reloaded`)};
        }
        const landed = await K.loginOnTab(tab, 'dbarnes');
        return {landed, field: await reopenOn(tab, `a5so-${MODE}-s10-other-tab`)};
    });
    facts['s10-stored'] = K.stored(app, c);
    facts.serverLog = log.since(from);
    record(NB ? 'a5so-neighbour' : 'a5so-walk', facts);
});
