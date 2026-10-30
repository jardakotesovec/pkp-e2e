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
 *   set.contextId                 // and its id
 *   set.users['submitter']        // a username; null for "nobody signed in"
 *   set.submission('unpublished') // {submissionId, publicationId}
 *   set.submission('published')
 *   set.submission('review')      // a journal or press only (set.states)
 *   set.issueId                   // a journal only: the published issue
 *   set.futureIssueId             // and a future (unpublished) one
 *   await set.freshSubmission('published', {extra seed keys}) // another like it, to delete
 *
 * The unpublished submission sits in Copyediting (a journal or press: sent
 * to review, the reviewer's review completed, accepted; a preprint server
 * has no review), a stage every assigned persona's role reaches, so a grid
 * about the workflow's pages reads the ordinary case. The published one is
 * the same submission published, resting in Done (on a journal, in the
 * context's published issue; the journal also has a future issue). The review one (a
 * journal or press) is sent to review, the reviewer's review accepted and
 * not yet submitted: a grid about review reads it as its `Review` column,
 * and the matrix skips that column on a preprint server.
 *
 * A context-level grid may use the plainer ALIASES below.
 * A persona the app has no role for (no reviewer on a preprint server) is
 * absent from `set.users`, and the matrix skips a grid row for it on that
 * app, so the row needs no badge; a badge is for a row whose cells differ
 * by app.
 */

/** Role keys per app (users.md "Scenario role keys"). */
const ROLE_KEYS = {
    ojs: {assistant: 'copyeditor', reviewAssistant: 'funding', reviewer: 'externalReviewer'},
    omp: {assistant: 'copyeditor', reviewAssistant: 'funding', reviewer: 'externalReviewer'},
    ops: {assistant: null, reviewAssistant: null, reviewer: null},
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
    // A funding coordinator: an assistant whose role works on the
    // submission and review stages (the copyeditor above works on
    // Copyediting only).
    'assigned review assistant': {role: 'reviewAssistant', participant: {}},
    'submitter': {role: 'author', submitter: true},
    'other author': {role: 'author'},
    'assigned reviewer': {role: 'reviewer', reviewer: true},
    'reader': {role: 'reader'},
    'nobody signed in': {anonymous: true},
    'manager of another context': {outsider: true},
    // The installer's admin, who holds the manager role in every context
    // it creates (scratch ones included), as a site's administrator does
    // in the journals they set up.
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

/**
 * Personas no grid names, each read by the matrix against the refused
 * cells of the row it stands for (`sameAs`; an object names the row for a
 * submission grid and for a context grid): a manager of the set's second
 * context who is only a reader or an author here (a role taken from the
 * wrong context), and people assigned on another submission of this
 * context (an assignment checked against the wrong submission). `role` is
 * their role here; `elsewhere` how they sit on the other submission.
 */
const DERIVED = {
    'manager elsewhere, reader here': {sameAs: 'reader', role: 'reader', managerElsewhere: true},
    'manager elsewhere, author here': {sameAs: 'other author', role: 'author', managerElsewhere: true},
    'section editor assigned elsewhere': {sameAs: 'unassigned section editor', role: 'sectionEditor', elsewhere: 'participant'},
    'submitter elsewhere': {sameAs: 'other author', role: 'author', elsewhere: 'submitter'},
    'reviewer elsewhere': {sameAs: {submission: 'reader', context: 'assigned reviewer'}, role: 'reviewer', elsewhere: 'reviewer'},
};

/** The row a derived persona stands for in a grid (a submission grid or not). */
function derivedSameAs(label, submissionGrid) {
    const {sameAs} = DERIVED[label];
    return typeof sameAs === 'string' ? sameAs : sameAs[submissionGrid ? 'submission' : 'context'];
}

/** The personas a grid about the context rather than a submission names (directly or by an alias). */
const CONTEXT_ROLES = ['manager', 'unassigned section editor', 'assigned assistant', 'other author', 'assigned reviewer', 'reader', 'nobody signed in', 'manager of another context', 'site admin'];

/** Every label a grid row may use. */
const LABELS = [...Object.keys(PERSONAS), ...Object.keys(ALIASES)];

/** The URN plugin's settings (docs/specs/U44-identifiers.md, the seed facts). */
const URN = {
    enableIssueURN: false,
    enablePublicationURN: true,
    enableRepresentationURN: false,
    urnPrefix: 'urn:nbn:de:0000-',
    urnSuffix: 'default',
    urnCheckNo: true,
    urnNamespace: 'urn:nbn:de',
    urnResolver: 'https://nbn-resolving.de/',
};

function roleKey(appName, role) {
    const keys = ROLE_KEYS[appName];
    return role in keys ? keys[role] : role;
}

/** Whether an app's persona set has this persona (a preprint server has no reviewer). */
function hasPersona(appName, label) {
    const persona = PERSONAS[ALIASES[label] || label];
    return !persona.role || roleKey(appName, persona.role) !== null;
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
    const elsewhere = [];
    Object.entries(DERIVED).forEach(([label, derived], i) => {
        const key = roleKey(appName, derived.role);
        if (!key) {
            return; // a role this app has none of (no reviewer on a preprint server)
        }
        users[label] = `${tag}d${i}`;
        accounts.push({username: users[label], roles: [key]});
        if (derived.managerElsewhere) {
            elsewhere.push({username: users[label], roles: ['manager']});
        }
    });

    const year = new Date().getFullYear();
    const issue = {volume: 1, number: '1', year};
    const context = await pkpApi.createContext({
        tag,
        users: accounts,
        // Listed for bulk email by the site, so its "Notify" tab answers (U55).
        bulkEmails: true,
        ...(appName === 'ojs' ? {issues: [{...issue, published: true}, {...issue, number: '2', published: false}]} : {}),
        // A publication identifier plugin, without which the publication's
        // "Identifiers" page answers no one (U44; a preprint server has none).
        ...(appName === 'ops' ? {} : {plugins: {urnpubidplugin: {enabled: true, settings: URN}}}),
    });
    const outsider = `${tag}xm`;
    await pkpApi.createContext({tag: `${tag}x`, users: [{username: outsider, roles: ['manager']}, ...elsewhere]});
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
            ...extra,
        });
        return {submissionId: created.submissionId, publicationId: created.publicationId, seeded: created};
    };
    const reviewed = (status, decisions) =>
        reviewer ? {decisions, reviewRounds: [{reviewers: [{username: reviewer, status}]}]} : {};
    // Each state's submission, by its tag suffix and seed.
    const seeds = {
        unpublished: ['u', reviewed('completed', ['sendExternalReview', 'accept'])],
        published: ['p', {...reviewed('completed', ['sendExternalReview', 'accept']), published: true, ...(appName === 'ojs' ? {issue} : {})}],
        ...(reviewer ? {review: ['r', reviewed('accepted', ['sendExternalReview'])]} : {}),
    };
    const submissions = {};
    for (const [state, [suffix, seed]] of Object.entries(seeds)) {
        const {submissionId, publicationId} = await seedSubmission(suffix, seed);
        submissions[state] = {submissionId, publicationId};
    }
    // Another submission of this context, in review where the app has one,
    // on which the derived personas DERIVED places there sit (and no other).
    const placed = (how) => Object.entries(DERIVED).filter(([label, d]) => d.elsewhere === how && users[label]).map(([label]) => users[label]);
    const [elsewhereReviewer] = placed('reviewer');
    await seedSubmission('e', {
        submitter: placed('submitter')[0],
        participants: placed('participant').map((username) => ({username, role: 'sectionEditor', canChangeMetadata: true})),
        ...(elsewhereReviewer ? {decisions: ['sendExternalReview'], reviewRounds: [{reviewers: [{username: elsewhereReviewer, status: 'accepted'}]}]} : {}),
    });
    let fresh = 0;

    return {
        context: tag,
        contextId: context.contextId,
        users,
        states: Object.keys(submissions),
        issueId: context.issues?.[0]?.id ?? null,
        futureIssueId: context.issues?.[1]?.id ?? null,
        /**
         * Another submission like the state's, for a call that would change
         * or remove it; `extra` adds seed keys (scenarios.md), and `seeded`
         * is the seed's whole answer (its galleys, chapters, formats).
         */
        freshSubmission: (state, extra = {}) => seedSubmission(`${seeds[state][0]}${(fresh++).toString(36)}`, {...seeds[state][1], ...extra}),
        submission: (state) => {
            if (!submissions[state]) {
                throw new Error(`seedPersonas: no "${state}" submission (${Object.keys(submissions).join(', ')})`);
            }
            return submissions[state];
        },
    };
}

module.exports = {PERSONAS, ALIASES, CONTEXT_ROLES, DERIVED, derivedSameAs, LABELS, hasPersona, seedPersonas};
