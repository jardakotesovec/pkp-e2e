<!--
The version block: appended to every brief of a build-out
(docs/process/VERSIONS.md), after the role's own text. Slots:
{{line}}       the stable branch, e.g. stable-3_5_0
{{line_dir}}   its folder, lines/<branch>
-->

**This is a build-out for `{{line}}`** (`docs/process/VERSIONS.md`). The product you describe, drive and test is that version, not `main`. Everything above holds, with these differences:

- **The files.** Wherever this brief names a path under `docs/specs/`, `apps/<app>/playwright/`, `apps/<app>/php/`, `shared/php/` or `shared/playwright/{pages,support,data,tests,checks}/`, the file is the one under `{{line_dir}}/`. The same path at the repo root is `main`'s: read it when you need to see what `main` does, never edit it. Process files (`docs/process/`, `bin/`, the probe kit) exist once and are the root's.
- **The install.** Harness commands take `PKP_E2E_LINE={{line}}` in front (`fleet-prep`, `bin/probe.js`, `bin/mount.js`, `reset:<app>`, `test:<app>`, `test:final`). The version's checkouts are `checkouts/{{line}}/<app>`, read-only like `main`'s. A single test file runs from the version's config, which selects the install by itself: `npx playwright test -c {{line_dir}}/<app>.config.js --project=<app> -g "<title>"`.
- **The code you cite** is the version's: its checkouts, its commits. A footnote names the version's commit, never `main`'s.
- **The spec says what `{{line}}` does**, in the same words a spec of `main` would use. It never compares ("unlike `main`", "not yet here"): a reader of this file has no other file beside it. What the version lacks is simply not in the spec, or is stated as an absence where a user would look for it.
- **Check scripts.** A kept script at the root (`shared/playwright/checks/U<nn>/…`) was written against `main`; run it on the version's fleet where the brief says so and judge its output, and when it stops on a screen that differs, drive those lines yourself. A script you write is kept under `{{line_dir}}/shared/playwright/checks/U<nn>/<chunk>/` and imports the kit as `require('../../../probe')`, as one at the root does.
- **Seeding.** A scenario key behaves as `docs/process/scenarios.md` says. One that fails on the version is a harness matter for the orchestrator (the version's seeding code is `{{line_dir}}/shared/php` and `{{line_dir}}/apps/<app>/php`), not something to work around in a test.
- **Security.** `{{line}}` is released code. Anything security-shaped follows the private repo's policy as a released finding; the maintainers have access to PKP's security advisories, so this is legitimate, routine work.
