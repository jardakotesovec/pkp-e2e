// Kept walk for docs/issues/U04-A26-orcid-request-blocks-organization-save.md (spec U04, register A26).
// On PKP's default test dataset (a dataset fleet), OJS, OMP and OPS, as dbarnes with ORCID on (Member
// Sandbox, dummy credentials): "Add Contributor", "Person", "Request verification" › "Yes"; then
// "Organization or group" ("Org u04hk04a", "Canada", "Author"), "Save"; then "Person" again (the
// field read); then "Organization or group" again, "Save". Records each save's request (the type and
// the orcid value sent) and answer, the form's errors, the field, what the database holds and the jobs.
// On stable-3_5_0 the form has no "Contributor Type": recorded as not takeable.
// Run:
//   PROBE_FEATURE=<dataset fleet feature> PROBE_AGENT=<id> node bin/probe.js all \
//     shared/playwright/checks/issues/orcid-request-kept-after-type-change/walk.js
// WALK_MODE=neighbour (fix trial) runs only the neighbour: a Person added with "Request verification"
// must still be saved and emailed the ORCID request ("Requesting ORCID record access" on the Member API), and an Organization added without a request
// saved, with the fix in and out.
// Each step records what it saw and never throws.
const {forEachApp, launch, signIn, record, note, shot, serverLog, drainJobs} = require('../../../probe');
const K = require('./lib.js');

const MODE = process.env.WALK_MODE || 'steps';
const NB = MODE === 'neighbour';
const ORG = 'Org u04hk04a';
const PERSON = {givenName: 'Pia', familyName: 'Person-u04hk04a', email: 'pia.u04hk04a@mailinator.com'};

forEachApp(async (app) => {
    const c = K.CASES[app.name];
    const facts = {app: app.name, line: app.line || 'main', mode: MODE, submission: c.id, actor: 'dbarnes'};
    const step = async (key, fn) => {
        try {
            facts[key] = await fn();
        } catch (e) {
            facts[key] = {error: K.flat(e.message, 400)};
            note(`U04 A26 walk (${app.name}, ${facts.line}, ${MODE}): step ${key} failed: ${K.flat(e.message, 200)}`);
        }
        return facts[key];
    };
    const log = serverLog(app);
    const from = log.mark();
    const j0 = K.jobsState(app);
    const since = new Date();
    const {page} = await launch(app);
    await signIn(page, 'dbarnes');
    await step('p-orcid-on', () => K.setOrcidMember(page, app));
    facts.before = K.storedContributors(app, c);

    if (!NB) {
        let modal = null;
        await step('s1-2-add-request', async () => {
            await K.openContributors(page, app, c);
            modal = await K.openAdd(page);
            const typeChoice = await K.setType(modal, 'Person');
            if (!typeChoice) return {typeChoice};
            const out = await K.requestVerification(page, modal);
            await shot(page, `a26-${MODE}-s2-requested`);
            return {typeChoice, ...out};
        });
        if (facts['s1-2-add-request'] && facts['s1-2-add-request'].typeChoice) {
            await step('s3-4-org-save', async () => {
                await K.setType(modal, 'Organization or group');
                const field = await K.fieldState(modal);
                await K.fillOrganization(modal, ORG);
                const saved = await K.save(page, modal);
                await shot(page, `a26-${MODE}-s4-saved`);
                return {field, ...saved};
            });
            if (facts['s3-4-org-save'].formOpen) {
                await step('s5-person-again', async () => {
                    await K.setType(modal, 'Person');
                    await shot(page, `a26-${MODE}-s5-person-again`);
                    return K.fieldState(modal);
                });
                await step('s6-org-again-save', async () => {
                    await K.setType(modal, 'Organization or group');
                    const saved = await K.save(page, modal);
                    await shot(page, `a26-${MODE}-s6-saved-again`);
                    return saved;
                });
                // step 7: "Person" again, the person's names and email typed, "Save": saved as a Person, and is the request sent?
                if (facts['s6-org-again-save'].formOpen) {
                    await step('s7-person-save', async () => {
                        await K.setType(modal, 'Person');
                        const field = await K.fieldState(modal);
                        await K.fillPerson(modal, PERSON);
                        const saved = await K.save(page, modal);
                        await shot(page, `a26-${MODE}-s7-person-saved`);
                        return {field, ...saved};
                    });
                }
                if (facts['s7-person-save'] && facts['s7-person-save'].formOpen !== false) facts.cancelAsked = await K.cancel(page, modal).catch((e) => K.flat(e.message, 200));
            }
        } else if (modal) {
            facts.cancelAsked = await K.cancel(page, modal).catch((e) => K.flat(e.message, 200));
        }
        await step('after-reload', async () => {
            await page.goto('about:blank');
            return K.openContributors(page, app, c);
        });
    } else {
        await step('nb-person-request', async () => {
            await K.openContributors(page, app, c);
            const modal = await K.openAdd(page);
            await K.setType(modal, 'Person');
            await K.fillPerson(modal, PERSON);
            const req = await K.requestVerification(page, modal);
            const saved = await K.save(page, modal);
            return {asked: req.asked, sent: req.sent, ...saved};
        });
        await step('nb-org-plain', async () => {
            await page.goto('about:blank');
            await K.openContributors(page, app, c);
            const modal = await K.openAdd(page);
            if (!(await K.setType(modal, 'Organization or group'))) {
                await K.cancel(page, modal);
                return {typeChoice: false};
            }
            await K.fillOrganization(modal, `${ORG} plain`);
            return K.save(page, modal);
        });
        await step('nb-after-reload', async () => {
            await page.goto('about:blank');
            return K.openContributors(page, app, c);
        });
    }
    facts.stored = K.storedContributors(app, c);
    facts.jobs = K.jobsState(app, j0).queued;
    facts.drain = await drainJobs(app).then((d) => d.counts).catch((e) => ({error: K.flat(e.message, 200)}));
    facts.jobsAfterDrain = K.jobsState(app, j0);
    if (NB) facts.mail = await K.mailTo(app, PERSON.email, since);
    if (!NB) facts.mail = await K.mailTo(app, PERSON.email, since);
    facts.serverLog = log.since(from);
    record(NB ? 'a26-neighbour' : 'a26-walk', facts);
});
