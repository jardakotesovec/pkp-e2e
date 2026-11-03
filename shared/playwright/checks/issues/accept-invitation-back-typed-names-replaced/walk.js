// Kept walk of issue report docs/issues/U06-A18-accept-invitation-back-typed-names-replaced.md (U06 A18).
// On PKP's default test dataset (context publicknowledge, ORCID off), as `rvaca`: Settings > Users &
// Roles, "Invite to a role" for u06hk4-newcomer@example.com with Given Name "Ina", Family Name
// "Nonce" and a role row (Copyeditor; OPS: Moderator; today; "Does not appear on the masthead"),
// sent. Then, in a second, signed-out browser, the email's accept link: "Create … account"
// (u06hk4newcomer, the consent ticked), "Save and continue"; on "Enter details" the names replaced
// by "Iris" / "Quill", Affiliation "Typed University", Country "Canada", not saved; "Back";
// "Save and continue" on "Create … account"; what "Enter details" shows then; "Save and continue";
// "Review & create account"; "Accept And Continue to …"; the users list row (as rvaca) and the new
// account's Profile > Identity. Each step is recorded, never thrown on, so the fixed code's state
// is recorded the same way.
//
// `neighbour` as argument walks only the neighbour check instead, two cases, no "Back" in either:
//   plain   the same invitation (u06hk4-plain@example.com), the names typed over and saved straight
//           from "Enter details": the review and the account carry the typed names;
//   french  Settings > Website > Setup > Languages: French made the journal's primary language;
//           an invitation (u06hk4-french@example.com, names "Ina" / "Nonce" in the first boxes);
//           on "Enter details" the first (French) boxes typed over as "Iris" / "Quill", the
//           English ones left empty, saved: the site's primary language (English) gets the names
//           copied in by the server, and the review step shows them (pkp/pkp-lib#12513).
//
// `variants` as argument walks three neighbouring cases instead, each with the "Back" of steps 7-8:
//   nonames    the invitation sent with no names (u06hk4-nonames@example.com);
//   givenonly  the invitation sent with Given Name "Ina" only (u06hk4-givenonly@example.com);
//   revisit    "Enter details" saved first ("Iris" / "Quill"), the review's "Edit", Given Name typed
//              over as "Ivy", then the "Back" (u06hk4-revisit@example.com).
//
// Reset first:  npm run fleet-prep -- --feature issues-hk4 --dataset 2 --reset
// Run (main):   bin/app-lock.sh shared <app> -- env PROBE_FEATURE=issues-hk4 PROBE_AGENT=hk4 \
//                   node bin/probe.js <app> shared/playwright/checks/issues/accept-invitation-back-typed-names-replaced/walk.js [neighbour]
// 3.5:          PKP_E2E_LINE=stable-3_5_0 in front of both (feature issues-hk4-3_5), PROBE_RUN=r35
// Facts: .reports/<feature>/hk4/walk[-<run>]-<app>.json (neighbour: neighbour[-<run>]-<app>.json)
const {forEachApp, launch, signIn, record, shot, screen, idle, sql, serverLog} = require('../../../probe');
const H = require('./lib.js');

const neighbour = process.argv.slice(2).includes('neighbour');
const variants = process.argv.slice(2).includes('variants');
const INVITED = {given: 'Ina', family: 'Nonce'};
const TYPED = {given: 'Iris', family: 'Quill', affiliation: 'Typed University', countryLabel: 'Canada'};
const PASSWORD = 'u06hk4pass';

forEachApp(async (app) => {
    const role = H.ROLE[app.name];
    const name = variants ? 'variants' : neighbour ? 'neighbour' : 'walk';
    const facts = {app: app.name, line: app.line || 'main', dataset: app.dataset, role, steps: {}, errors: {}};
    const save = () => record(name, facts);
    const log = serverLog(app);
    const mark = log.mark();
    const browsers = [];
    const browser = async () => {
        const b = await launch(app);
        browsers.push(b);
        return b.page;
    };
    const step = async (key, fn) => {
        try {
            facts.steps[key] = await fn();
        } catch (e) {
            facts.errors[key] = H.flat(String(e.stack || e), 900);
        }
        save();
        return facts.steps[key];
    };
    const snap = async (page, key) => {
        const s = await screen(page);
        record(`${name}-${key}`, s);
        await shot(page, `${name}-${key}`).catch(() => {});
        return s;
    };
    // the accept link in English screens: a signed-out visitor otherwise gets the journal's
    // primary language, French in the `french` case
    const english = (link) => link.replace(/\/publicknowledge\/(?:fr_CA\/)?/, '/publicknowledge/en/').replace('/en/en/', '/en/');

    /** One invitation sent and accepted; `back` takes the "Back" of steps 7-8. */
    const invitation = async (mp, key, {address, username, back, invited = INVITED, revisit = false}) => {
        const since = new Date(Date.now() - 2000);
        await step(`${key}-send`, async () => {
            await H.openAndSearch(mp, app, address);
            await H.fillInvite(mp, {...invited, role});
            return {dialog: await H.sendInvite(mp)};
        });
        const mail = await step(`${key}-mail`, () => H.acceptLink(app, address, since));
        if (!mail) return;
        const vp = await browser();
        await step(`${key}-create-account`, async () => {
            await H.openLink(vp, english(mail.link));
            const first = await H.heading(vp);
            await snap(vp, `${key}-create-account`);
            await H.createAccount(vp, {username, password: PASSWORD});
            return {first};
        });
        await step(`${key}-details-arrived`, async () => {
            await snap(vp, `${key}-details-arrived`);
            return {heading: await H.heading(vp), fields: await H.details(vp)};
        });
        await step(`${key}-typed`, async () => {
            await H.typeDetails(vp, TYPED);
            return {fields: await H.details(vp)};
        });
        if (revisit) {
            // saved first: "Save and continue", the review's "Edit", Given Name typed over again
            await step(`${key}-revisit`, async () => {
                await H.toReview(vp);
                const s = await snap(vp, `${key}-first-review`);
                const firstReview = H.flat(s.text && s.text.main, 1500);
                await vp.locator('main').getByRole('button', {name: 'Edit', exact: true}).first().click();
                await vp.getByRole('heading', {name: /Enter details/}).waitFor({timeout: H.T});
                await H.sleep(500);
                const reopened = await H.details(vp);
                await H.typeDetails(vp, {given: 'Ivy'});
                return {firstReview, reopened, typedAgain: await H.details(vp)};
            });
        }
        if (back) {
            await step(`${key}-back`, async () => {
                await H.back(vp);
                await snap(vp, `${key}-after-back`);
                return {heading: await H.heading(vp), account: await H.accountFields(vp)};
            });
            await step(`${key}-details-again`, async () => {
                await H.forwardToDetails(vp);
                const s = await snap(vp, `${key}-details-again`);
                return {heading: await H.heading(vp), fields: await H.details(vp), notices: s.notices || []};
            });
        }
        await step(`${key}-review`, async () => {
            await H.toReview(vp);
            const s = await snap(vp, `${key}-review`);
            return {heading: await H.heading(vp), main: H.flat(s.text && s.text.main, 1500)};
        });
        await step(`${key}-accept`, async () => {
            const out = await H.accept(vp, app);
            out.landed = vp.url().replace(/^https?:\/\/[^/]+/, '');
            return out;
        });
        await step(`${key}-account`, async () => {
            const pp = await browser();
            await signIn(pp, username, {password: PASSWORD, contextPath: app.contextPath});
            const out = {profile: await H.profileIdentity(pp, app)};
            await snap(pp, `${key}-profile-identity`);
            out.usersList = await H.memberRows(mp, app, address);
            await snap(mp, `${key}-users-list`);
            out.db = H.accountRow(app, sql, address);
            return out;
        });
    };

    const manager = await launch(app);
    const mp = manager.page;
    try {
        // 1. rvaca
        await signIn(mp, 'rvaca', {contextPath: app.contextPath});
        if (variants) {
            // the invitation without names, with a Given Name only, and "Enter details" saved
            // before the newcomer comes back to it (each with the "Back" of steps 7-8)
            await invitation(mp, 'nonames', {address: 'u06hk4-nonames@example.com', username: 'u06hk4nonames', back: true, invited: {}});
            await invitation(mp, 'givenonly', {address: 'u06hk4-givenonly@example.com', username: 'u06hk4givenonly', back: true, invited: {given: 'Ina'}});
            await invitation(mp, 'revisit', {address: 'u06hk4-revisit@example.com', username: 'u06hk4revisit', back: true, revisit: true});
        } else if (!neighbour) {
            // 2-12
            await invitation(mp, 'steps', {address: 'u06hk4-newcomer@example.com', username: 'u06hk4newcomer', back: true});
        } else {
            await invitation(mp, 'plain', {address: 'u06hk4-plain@example.com', username: 'u06hk4plain', back: false});
            await step('french-primary', async () => {
                const {JournalLanguagesTab} = require('../../../pages/LanguagesPages.js');
                const tab = new JournalLanguagesTab(mp, app.contextPath, {locale: 'en'});
                await tab.goto();
                const pressed = await tab.pressWebsite('fr_CA', 'contextPrimary');
                await snap(mp, 'french-languages');
                return {
                    status: pressed.response ? pressed.response.status() : null,
                    alerts: pressed.alerts,
                    frPrimary: await tab.website.cell('fr_CA', 'contextPrimary').isChecked().catch(() => null),
                };
            });
            await invitation(mp, 'french', {address: 'u06hk4-french@example.com', username: 'u06hk4french', back: false});
        }
    } catch (e) {
        facts.errors.top = H.flat(String(e.stack || e), 1500);
    } finally {
        facts.serverLog = log.since(mark).slice(0, 40);
        save();
        for (const b of browsers) await b.close().catch(() => {});
        await manager.close();
    }
});
