/**
 * @file playwright/support/legacy.js
 *
 * Re-export of the shared legacy-jQuery helpers (see
 * shared/playwright/support/legacy.js — the helper lived here app-local until
 * the OPS suite became its second consumer and it was promoted).
 */
module.exports = require('../../../../shared/playwright/support/legacy.js');
