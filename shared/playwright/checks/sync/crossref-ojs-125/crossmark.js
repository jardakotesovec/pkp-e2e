// Kept check of the PR review of pkp-lib#13766 (crossref-ojs#125, pkp-lib#13871, ojs#6118): the Crossmark
// "Latest Review of Each Reviewer" group, read from the plugin's own XML. Run at the PR heads (and at the tips for the before-evidence):
//   PROBE_FEATURE=sync PROBE_AGENT=cm node bin/probe.js ojs shared/playwright/checks/sync/crossref-ojs-125/crossmark.js
// One scratch journal: DOIs on with "Articles" and "Peer Review", DOI versioning on, Crossref with Crossmark, open
// review with public comments by default. One work, two review rounds: round 1 Ann (Accept, 2026-01-10) and
// Ben (Revisions Required, 2026-01-11); round 2 Ann (Decline, 2026-03-05) and Cleo (See Comments, 2026-03-08).
// crossmark-read.php --prepare then makes the first version "PMUR 1.0", a published "VoR 2.0" holding round 2,
// confirms the reviews, gives them DOIs, and makes Ben's review double-anonymous (no name in the Crossmark).
// At the PR heads 2026-11-25: PMUR 1.0 lists Ann (Approved) and Ben (Revisions Requested, no name); the VoR lists
// Ann's round-2 review (Not Approved), Cleo (With Comments), then Ben's PMUR review; the article XML is valid
// against Crossref's 5.4.0 schema. At the tips (OJS 6ce58ddbb2, crossref 08da83b): only the "Published" assertion.
// No assertions: the session judges.
const path = require('path');
const {execFileSync} = require('child_process');
const {forEachApp, record, tag} = require('../../../probe');

function driver(app, args) {
    return execFileSync('php', [path.resolve(__dirname, 'crossmark-read.php'), path.resolve(app.root), ...args], {
        cwd: path.resolve(app.root),
        env: {...process.env, PKP_CONFIG_FILE: path.resolve(app.root, 'config.test.inc.php')},
        encoding: 'utf8',
    }).trim();
}

forEachApp(async (app) => {
    await app.api.bootstrapProbe(app.contextPath);
    const T = tag('cm125');
    const mgr = `${T}mgr`;
    const rv = (u, g, f) => ({username: `${T}${u}`, roles: ['externalReviewer'], givenName: g, familyName: f});
    await app.api.createContext({
        tag: T,
        users: [{username: mgr, roles: ['manager'], givenName: 'Mona', familyName: 'Manager'},
            rv('ann', 'Ann', 'Arbor'), rv('ben', 'Ben', 'Birch'), rv('cleo', 'Cleo', 'Cedar')],
        review: {defaultReviewMode: 'open', defaultReviewPublicVisibility: true},
        enableDois: true, doiPrefix: '10.1234', doiVersioning: true, enabledDoiTypes: ['publication', 'peerReview'],
        publisherInstitution: 'Crossmark Press', onlineIssn: '1234-5679',
        plugins: {crossrefplugin: {enabled: true, settings: {depositorName: 'Cm Depositor', depositorEmail: 'cm.depositor@mail.test', crossmark: true, updatePolicyDoi: '10.1234/policy'}}},
        registrationAgency: 'crossrefplugin',
    });
    const r = (u, recommendation, dateCompleted) => ({username: `${T}${u}`, status: 'completed', recommendation, dateCompleted});
    const S = await app.api.createSubmission({
        tag: `${T}w`, context: T, submitter: mgr, title: `Axolotl regeneration ${T}`, submitted: true,
        reviewRounds: [
            {reviewers: [r('ann', 'accept', '2026-01-10'), r('ben', 'pendingRevisions', '2026-01-11')]},
            {reviewers: [r('ann', 'decline', '2026-03-05'), r('cleo', 'seeComments', '2026-03-08')]},
        ],
        published: true,
    });
    const sid = S.submissionId ?? S.id;
    record('seed', {T, S});
    const reviews = JSON.parse(driver(app, [T, String(sid)])).reviews;
    const ben = reviews.filter((x) => x.username === `${T}ben`).map((x) => x.review_id);
    const out = JSON.parse(driver(app, [T, String(sid), '--prepare', `--anon=${ben.join(',')}`]));
    record('crossmark', out);
    console.log(JSON.stringify(out, null, 2));
});
