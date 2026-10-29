/**
 * @file shared/playwright/support/personas.js
 *
 * The persona set an API permission grid names (docs/process/api.md
 * "Permission grids"): one scratch context with a throwaway user per
 * persona, a submission in it with the participants the personas need,
 * and a second context whose manager is the outsider. The base context is
 * never used: a submit there auto-assigns its section editors
 * (scenarios.md "POST scenarios/submission"), which would blur "assigned"
 * and "unassigned".
 *
 *   const set = await seedPersonas(pkpApi, appContext, {tag});
 *   set.context                   // the scratch context's path
 *   set.users['submitter']        // a username; null for "nobody signed in"
 *   set.submission('unpublished') // {submissionId, publicationId}
 *   set.submission('published')
 *
 * The unpublished submission sits in Copyediting (a journal or press: sent
 * to review, the reviewer's review completed, accepted; a preprint server
 * has no review), a stage every assigned persona's role reaches, so a grid
 * about the workflow's pages reads the ordinary case. The published one is
 * the same submission published, resting in Done.
 *
 * A context-level grid may use the plainer ALIASES below.
 * A persona the app has no role for (no reviewer on a preprint server) is
 * absent from `set.users`, and the matrix skips a grid row for it on that
 * app, so the row needs no badge; a badge is for a row whose cells differ
 * by app.
 */

/** Role keys per app (users.md "Scenario role keys"). */
const ROLE_KEYS = {
    ojs: {assistant: 'copyeditor', reviewer: 'externalReviewer'},
    omp: {assistant: 'copyeditor', reviewer: 'externalReviewer'},
    ops: {assistant: null, reviewer: null},
};

/**
 * The persona vocabulary, by the label a grid row uses. `role` is the
 * user's role in the scratch context (a key of ROLE_KEYS or a plain
 * scenario role key), `participant` how they sit on its submissions.
 */
const PERSONAS = {
    'manager': {role: 'manager'},
    'assigned section editor': {role: 'sectionEditor', participant: {canChangeMetadata: true}},
    'assigned section editor, metadata edit off': {role: 'sectionEditor', participant: {canChangeMetadata: false}},
    'unassigned section editor': {role: 'sectionEditor'},
    'assigned assistant': {role: 'assistant', participant: {}},
    'submitter': {role: 'author', submitter: true},
    'other author': {role: 'author'},
    'assigned reviewer': {role: 'reviewer', reviewer: true},
    'reader': {role: 'reader'},
    'nobody signed in': {anonymous: true},
    'manager of another context': {outsider: true},
    'site admin': {username: 'admin'},
};

/**
 * Plainer labels for a grid about the context rather than a submission
 * (announcements, institutions): the same users, named by their role alone.
 */
const ALIASES = {
    'section editor': 'unassigned section editor',
    'assistant': 'assigned assistant',
    'author': 'other author',
    'reviewer': 'assigned reviewer',
};

/** Every label a grid row may use. */
const LABELS = [...Object.keys(PERSONAS), ...Object.keys(ALIASES)];

function roleKey(appName, role) {
    const keys = ROLE_KEYS[appName];
    return role in keys ? keys[role] : role;
}

/**
 * @param {import('./api.js').PkpApi} pkpApi
 * @param {{appName: string}} appContext
 * @param {{tag: string}} options a tag of at most 28 characters (two suffixed
 *   contexts are made from it)
 */
async function seedPersonas(pkpApi, appContext, {tag}) {
    const appName = appContext.appName;
    const users = {};
    const accounts = [];
    Object.entries(PERSONAS).forEach(([label, persona], i) => {
        if (persona.anonymous) {
            users[label] = null;
            return;
        }
        if (persona.username) {
            users[label] = persona.username;
            return;
        }
        if (persona.outsider) {
            return;
        }
        const key = roleKey(appName, persona.role);
        if (!key) {
            return;
        }
        const username = `${tag}p${i}`;
        users[label] = username;
        accounts.push({username, roles: [key]});
    });

    await pkpApi.createContext({tag, users: accounts});
    const outsider = `${tag}xm`;
    await pkpApi.createContext({tag: `${tag}x`, users: [{username: outsider, roles: ['manager']}]});
    users['manager of another context'] = outsider;
    for (const [alias, label] of Object.entries(ALIASES)) {
        if (label in users) {
            users[alias] = users[label];
        }
    }

    const participants = [];
    let reviewer = null;
    let submitter = null;
    for (const [label, persona] of Object.entries(PERSONAS)) {
        const username = users[label];
        if (!username || persona.outsider) {
            continue;
        }
        if (persona.submitter) {
            submitter = username;
        }
        if (persona.reviewer) {
            reviewer = username;
        }
        if (persona.participant) {
            participants.push({username, role: roleKey(appName, persona.role), ...persona.participant});
        }
    }

    const seedSubmission = async (suffix, extra) => {
        const created = await pkpApi.createSubmission({
            tag: `${tag}${suffix}`,
            context: tag,
            submitter,
            participants,
            ...(reviewer
                ? {decisions: ['sendExternalReview', 'accept'], reviewRounds: [{reviewers: [{username: reviewer, status: 'completed'}]}]}
                : {}),
            ...extra,
        });
        return {submissionId: created.submissionId, publicationId: created.publicationId};
    };
    const submissions = {
        unpublished: await seedSubmission('u', {}),
        published: await seedSubmission('p', {published: true}),
    };

    return {
        context: tag,
        users,
        submission: (state) => {
            if (!submissions[state]) {
                throw new Error(`seedPersonas: no "${state}" submission (${Object.keys(submissions).join(', ')})`);
            }
            return submissions[state];
        },
    };
}

module.exports = {PERSONAS, LABELS, seedPersonas};
