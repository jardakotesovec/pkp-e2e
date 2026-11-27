// Kept walk for docs/issues/U04-A5-orcid-field-refusal-shown-as-done.md (spec U04, register A5 with A25),
// from its 2026-11-27 refresh: the two refusals pkp/pkp-lib#11972 added to
// OrcidController::requestAuthorVerification(), made at once (nothing changed after the form opened).
// On PKP's default test dataset (a dataset fleet), OJS, OMP and OPS, as dbarnes with ORCID on (Member
// Sandbox, dummy credentials):
//   org      (steps 11–15) "Add Contributor" an "Organization or group" ("Lab u04hk04a"), "Save"; its
//            "Edit", "Person", "Request verification" › "Yes"; "Cancel", "Edit" again, "Person".
//   noEmail  (steps 16–18) the dataset contributor stored without an email (SQL, the state data saved
//            before pkp/pkp-lib#11972 holds); her "Edit", "Request verification" › "Yes"; "Cancel", "Edit".
// Each records the request's answer, every window shown after "Yes", the field before and after, the
// field reopened, what the database holds and the jobs queued (drained, failures read).
// On stable-3_5_0 the form has no "Contributor Type" (org is recorded as not takeable) and the server
// has no such refusals (the before side).
// Run:
//   PROBE_FEATURE=<dataset fleet feature> PROBE_AGENT=<id> node bin/probe.js all \
//     shared/playwright/checks/issues/assistant-orcid-controls-refused/walk-refused-at-once.js
// WALK_MODE=neighbour (fix trial) runs only the neighbour: the same dbarnes requests verification for
// the dataset contributor with her email kept; it must answer 200, the field read requested, the
// email arrive, with the fix in and out.
// Each step records what it saw and never throws.
const {forEachApp, launch, signIn, record, note, screen, shot, serverLog, sql, drainJobs} = require('../../../probe');
const K = require('./lib.js');

const MODE = process.env.WALK_MODE || 'steps';
const NB = MODE === 'neighbour';
const ORG = 'Lab u04hk04a';

forEachApp(async (app) => {
    const c = K.CASES[app.name];
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, submission: c.id, contributor: c.contributor, actor: 'dbarnes'};
    const step = async (key, fn) => {
        try {
            facts[key] = await fn();
        } catch (e) {
            facts[key] = {error: K.flat(e.message, 400)};
            note(`U04 A5 refused-at-once walk (${app.name}, ${facts.line}, ${MODE}): step ${key} failed: ${K.flat(e.message, 200)}`);
        }
        return facts[key];
    };
    const log = serverLog(app);
    const from = log.mark();
    const {page} = await launch(app);
    await signIn(page, 'dbarnes');
    await step('p-orcid-on', async () => {
        const out = await K.enableOrcid(page, app);
        return {save: out.save, savedStatus: out.savedStatus, stored: out.stored};
    });
    const aid = K.authorId(app, c);
    facts.authorId = aid;

    // the request pressed in `modal`, then the form closed by "Cancel" and the row's "Edit" pressed again
    const requestAndReopen = async (modal, rowText, retype, shotName) => {
        const before = await K.fieldState(K.orcidField(modal));
        const j0 = K.jobsState(app);
        const out = await K.pressAndConfirm(page, K.orcidField(modal), 'Request verification', '/orcid/requestAuthorVerification/');
        out.notices = (await screen(page)).notices;
        await shot(page, `a5ro-${MODE}-${shotName}-after`);
        // "Cancel"; a window it opens (the form changed) is recorded and answered; then the page reloaded
        await K.closeContributor(page, modal);
        const onCancel = (await page.getByRole('dialog').allInnerTexts().catch(() => [])).map((t) => K.flat(t, 200)).filter((t) => !/^Help/.test(t));
        await shot(page, `a5ro-${MODE}-${shotName}-cancelled`);
        await page.goto('about:blank');
        await K.openContributors(page, app, c);
        const again = await K.openEditFor(page, rowText);
        if (retype) await K.setType(again, 'Person');
        const reopened = await K.fieldState(K.orcidField(again));
        await shot(page, `a5ro-${MODE}-${shotName}-reopened`);
        await K.closeContributor(page, again);
        const queued = K.jobsState(app, j0);
        const drain = await drainJobs(app).then((d) => d.counts).catch((e) => ({error: K.flat(e.message, 200)}));
        return {before, ...out, onCancel, reopened, jobs: {queued: queued.queued}, drain, jobsAfterDrain: K.jobsState(app, j0)};
    };

    if (!NB) {
        // An organization shown as a Person (steps 11–15)
        await step('s11-12-add-org', async () => {
            await K.openContributors(page, app, c);
            return K.addOrganization(page, ORG);
        });
        if (facts['s11-12-add-org'] && facts['s11-12-add-org'].typeChoice && facts['s11-12-add-org'].save === 200) {
            const orgId = facts['s11-12-add-org'].id;
            await step('s13-15-org-as-person', async () => {
                await page.goto('about:blank');
                await K.openContributors(page, app, c);
                const modal = await K.openEditFor(page, ORG);
                const typed = await K.setType(modal, 'Person');
                await shot(page, `a5ro-${MODE}-s13-person-chosen`);
                const out = await requestAndReopen(modal, ORG, true, 's14');
                return {typed, ...out, stored: orgId ? K.storedAuthor(app, orgId) : null};
            });
        }

        // A person stored without an email (steps 16–18)
        await step('p16-no-email', () => {
            sql(app, `update authors set email = '' where author_id = ${aid}`);
            return K.storedAuthor(app, aid);
        });
    }
    const since = new Date();
    await step(NB ? 'nb-request' : 's17-18-no-email', async () => {
        await page.goto('about:blank');
        await K.openContributors(page, app, c);
        const modal = await K.openEditFor(page, c.contributor);
        const out = await requestAndReopen(modal, c.contributor, false, NB ? 'nb' : 's17');
        return {...out, stored: K.storedAuthor(app, aid)};
    });
    if (NB) await step('nb-mail', () => K.mailTo(app, c.email, since));
    facts.serverLog = log.since(from);
    record(NB ? 'a5ro-neighbour' : 'a5ro-walk', facts);
});
