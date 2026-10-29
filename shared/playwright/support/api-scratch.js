/**
 * @file shared/playwright/support/api-scratch.js
 *
 * A scratch context for an API check (docs/process/api.md "API checks"):
 * one throwaway user per key of `users`, each `<tag><key>` with that role,
 * and their clients at the context's address. Through the `scratch`
 * fixture:
 *
 *   const j = await scratch({users: {mg: 'manager', au: 'author'}, enablePublicComments: true});
 *   j.path                  // the context's path (its tag)
 *   j.user('au')            // the username
 *   j.id('au')              // the user's id
 *   const api = await j.as('mg');       // that user's client; j.as(null): nobody signed in
 *   await j.submission('a', {submitter: 'au', published: true})  // scenarios/submission in it
 *
 * Every other key goes to `scenarios/context` as given (scenarios.md).
 * `users` defaults to a manager alone (`mg`).
 */

/**
 * @param {import('./api.js').PkpApi} pkpApi
 * @param {(username: string|null, options: {context: string}) => Promise<import('./api-client.js').ApiClient>} apiAs
 * @param {string} tag a unique tag (patterns.md), at most 28 characters
 * @param {{users?: Object<string, string>}} spec
 */
async function createScratch(pkpApi, apiAs, tag, {users = {mg: 'manager'}, ...context} = {}) {
    const user = (key) => `${tag}${key}`;
    const seeded = await pkpApi.createContext({
        tag,
        ...context,
        users: Object.entries(users).map(([key, role]) => ({username: user(key), roles: [role]})),
    });
    return {
        path: tag,
        seeded,
        user,
        id: (key) => seeded.users.find((u) => u.username === user(key)).id,
        as: (key) => apiAs(key ? user(key) : null, {context: tag}),
        /** A submission in this context; `submitter` names a user key. */
        submission: (suffix, {submitter, ...spec} = {}) =>
            pkpApi.createSubmission({tag: `${tag}${suffix}`, context: tag, ...(submitter ? {submitter: user(submitter)} : {}), ...spec}),
    };
}

module.exports = {createScratch};
