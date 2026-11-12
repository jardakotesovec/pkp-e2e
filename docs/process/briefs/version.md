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
- **Check scripts.** A kept script at the root (`shared/playwright/checks/U<nn>/…`) was written against `main`; run it on the version's fleet where the brief says so and judge its output, and when it stops on a screen that differs, drive those lines yourself. A script you write is kept at the path the brief names, under `{{line_dir}}/` (`{{line_dir}}/shared/playwright/checks/<feature>/<chunk>/`), and imports the kit as `require('../../../probe')`, as one at the root does.
- **Seeding.** A scenario key behaves as `docs/process/scenarios.md` says. One that fails on the version is a harness matter for the orchestrator (the version's seeding code is `{{line_dir}}/shared/php` and `{{line_dir}}/apps/<app>/php`), not something to work around in a test.
- **Security.** `{{line}}` is released code. Anything security-shaped follows the private repo's policy as a released finding; the maintainers have access to PKP's security advisories, so this is legitimate, routine work.

By role:

- **Spec author.** The spec exists: it is a copy of `main`'s verified spec, and the work is to make it true for `{{line}}`. Keep its shape, its scenarios and its "Left out" list as they are; you rewrite the body, the register and the footnotes, and write no draft Coverage table. For everything the footnotes cite, read the version's code against `main`'s (the same file under `checkouts/{{line}}/<app>` and `checkouts/<app>`; a `diff` of the two is the quickest read) and state what the version's code does. Every claim you change, add or remove gets a `to drive:` footnote saying what to do on screen to confirm it. Pin every evidence footnote you touch to the version's commit. Read the register entry by entry (`docs/process/VERSIONS.md` step 3). A file of pilot notes for the feature, when the brief names one, is a lead to check, never evidence. Your return also lists the scenario numbers your body changes contradict.
- **Claim checker.** Your lines are the version's spec; your fleet is the version's. Nothing is settled by what `main` does.
- **Fold agent.** The spec carries its final "Left out" list although it is a draft, so treat the Coverage section as on a verified spec: behavior the change list adds to the body becomes a **Planned** item there, for the scenario writer who follows. A register entry the change list shows this version does not have is retired with "Not on this version."; a new entry is written as on any spec.
- **Rewrite agent.** The glossary you read and may correct is the version's, `{{line_dir}}/docs/specs/GLOSSARY.md`, a copy of `main`'s: where it names a control or a step in `main`'s words and the claim-checked spec names it differently, the glossary entry is what changes.
- **Scenario writer.** The scenarios are `main`'s, copied. Keep each number and each sentence the folded body still supports; rewrite what it contradicts; a scenario the version cannot run becomes an absence scenario with a positive control under the same number.
- **Test author.** The suite and its page objects are copies of `main`'s under `{{line_dir}}/`, possibly already adapted. Change a page-object function in place when the step is the same step on a different screen; rename it when the screen's own words differ. A test that passes unchanged stays unchanged.

