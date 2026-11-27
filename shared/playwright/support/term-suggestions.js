/**
 * @file playwright/support/term-suggestions.js
 *
 * The suggestion list of a term field (Keywords, Subjects, Disciplines,
 * Supporting Agencies: ui-library `FieldControlledVocab`) takes a lookup's
 * answer in two steps. The answer's handler (jQuery's success callback)
 * stores it and calls the debounced `setSuggestions()`, which applies it
 * to the list a quarter of a second later, filtering by the field's text
 * as it is *then*. A read taken inside that quarter second sees the list
 * before the answer, and a field emptied inside it gets the whole answer
 * back as an open list under the empty field (U40 S2's "expected 0,
 * received 1", flake diagnosis 2026-11-27, u40s2; an app defect).
 */
const {waitForJQueryIdle} = require('./legacy.js');

/** `FieldControlledVocab.vue`: `setSuggestions: debounce(…, 250)`. */
const APPLY_DEBOUNCE_MS = 250;

/**
 * Resolve once the page has applied a term lookup's answer to the list.
 * Call it after the lookup's response has arrived. jQuery's in-flight count
 * drops to 0 only after the success callbacks have run, so the app's
 * filter is scheduled by then; a timer of the page's own, set after it and
 * due later, runs after it on the page's event loop whatever the load.
 *
 * @param {import('@playwright/test').Page} page
 */
async function termSuggestionsApplied(page) {
    await waitForJQueryIdle(page);
    await page.evaluate(
        (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        APPLY_DEBOUNCE_MS + 50
    );
}

module.exports = {termSuggestionsApplied};
