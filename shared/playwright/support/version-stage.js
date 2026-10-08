/**
 * @file shared/playwright/support/version-stage.js
 *
 * The name of the "AO" publication stage as the app under test words it.
 * pkp-lib d320cfe91d (pkp/pkp-lib#13478, 2026-10-08, for pkp/pkp-lib#10669)
 * renamed "Author Original" to "Author's Original", the JAV term, and each
 * app shows the new name from the `lib/pkp` pointer that carries the commit.
 * Until all three do, the suites read which of the two names the checkout
 * words (`publication.versionStage.authorOriginal` in lib/pkp's English
 * texts) and assert that one exactly; any third wording is refused here.
 * The page objects' and kept checks' prefix matchers take either name.
 * Once the three pointers carry the commit, `AO` becomes the plain constant
 * "Author's Original" (docs/tracking/ci-triage.md, the pkp-lib#13478 row).
 */
const fs = require('fs');
const path = require('path');

const KEY = 'publication.versionStage.authorOriginal';
const KNOWN = ['Author Original', "Author's Original"];

/**
 * @param {string} [appRoot] the app checkout (default PKP_APP_ROOT)
 * @returns {string} the stage's name in that checkout
 */
function authorOriginalName(appRoot = process.env.PKP_APP_ROOT || '') {
    const file = path.join(appRoot, 'lib', 'pkp', 'locale', 'en', 'submission.po');
    const match = fs
        .readFileSync(file, 'utf8')
        .match(new RegExp(`^msgid "${KEY.replace(/\./g, '\\.')}"\\s*\\nmsgstr "(.*)"$`, 'm'));
    const name = match ? match[1].replace(/\\"/g, '"') : '';
    if (!KNOWN.includes(name)) {
        throw new Error(`${file}: ${KEY} reads "${name}", neither of ${JSON.stringify(KNOWN)}`);
    }
    return name;
}

module.exports = {
    authorOriginalName,
    /** The stage's name in the app under test, e.g. `${AO} 1.0`, `${AO} (AO)`. */
    get AO() {
        return authorOriginalName();
    },
};
