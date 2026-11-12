/**
 * @file shared/playwright/support/version-stage.js
 *
 * The name of the "AO" publication stage as `main` words it.
 * pkp-lib d320cfe91d (pkp/pkp-lib#13478, 2026-10-08, for pkp/pkp-lib#10669)
 * renamed "Author Original" to "Author's Original", the JAV term; OJS, OMP
 * and OPS all carry it since 2026-10-09, so the suites assert that name
 * exactly. The page objects' and kept checks' prefix matchers still take
 * either name, which lets them drive an app branch from before the rename.
 */
module.exports = {
    /** The stage's name, e.g. `${AO} 1.0`, `${AO} (AO)`. */
    AO: "Author's Original",
};
