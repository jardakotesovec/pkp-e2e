/**
 * @file shared/playwright/support/order.js
 *
 * Reads of lists the application does not order. PostgreSQL returns rows a
 * query does not order (no ORDER BY, or a tie on a non-unique sort key: a
 * shared `seq`, a date stamped to the second, a shared role level) in the
 * order they sit on disk, which parallel tests change by updating and
 * deleting rows and reusing the space. Such a list is compared as a
 * multiset, never by position (fix list B, flake-s26, 2026-09-26).
 */
const {expect} = require('@playwright/test');

/**
 * A sorted copy of `list`, for a comparison that ignores the order: two
 * lists holding the same items the same number of times give equal copies.
 * Items are strings or JSON-serialisable values (compared by their JSON).
 *
 * @template T
 * @param {T[]} list
 * @returns {T[]}
 */
function unordered(list) {
    const key = (item) => (typeof item === 'string' ? item : JSON.stringify(item));
    return [...list].sort((a, b) => {
        const ka = key(a);
        const kb = key(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
}

/**
 * Wait until the server's clock (the Date header of a static file) shows a
 * later second than when called. A row stamped with the time to the second
 * (a submission's date submitted or last change, a notification's creation)
 * ties with one seeded in the same second, and a list ordered by that date
 * then shows the tied rows in the database's order; a scenario that needs
 * the date order seeds its rows one server second apart.
 *
 * @param {import('@playwright/test').APIRequestContext} request any request context on the app's server
 */
async function nextServerSecond(request) {
    const serverNow = async () => Date.parse((await request.head('/README.md')).headers()['date'] || '');
    const start = await serverNow();
    await expect.poll(serverNow, {intervals: [250], timeout: 10_000}).toBeGreaterThan(start);
}

/**
 * The web-first form of an order-free read: the locator matches as many
 * elements as `expected` has, and their texts (trimmed, inner whitespace
 * collapsed) are `expected` in some order. Retries like `toHaveText`.
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {string[]} expected
 * @param {{timeout?: number, message?: string}} [options]
 */
async function expectTextsInAnyOrder(locator, expected, {timeout, message} = {}) {
    await expect(locator, message).toHaveCount(expected.length, {timeout});
    await expect
        .poll(async () => unordered((await locator.allTextContents()).map((t) => t.replace(/\s+/g, ' ').trim())), {message, timeout})
        .toEqual(unordered(expected));
}

module.exports = {unordered, nextServerSecond, expectTextsInAnyOrder};
