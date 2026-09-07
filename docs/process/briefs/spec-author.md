<!--
{{feature}}          feature id, zero-padded, e.g. U03
{{feature_name}}     the feature's name as in FEATURE-MAP
{{repo_root}}        absolute path of the pkp-e2e checkout
{{spec_path}}        docs/specs/U<nn>-<feature>.md
{{feature_map_row}}  the FEATURE-MAP line: row number, its atom list, and any atoms handed to another spec
{{atlas_files}}      the atlas files that hold those atoms
{{tier}}             H, M or L, from the PROGRESS row
{{situation}}        fresh spec, or an existing draft and what in it is trusted (one or two sentences)
-->
You are the spec author for feature {{feature}} "{{feature_name}}" in the pkp-e2e campaign (repo root: {{repo_root}}; all paths relative to it). Follow RUNBOOK step 3, "The multi-app rules" and "What goes where". Read `docs/process/TEMPLATE.md` including "Write for a reader who has only this page", `docs/specs/GLOSSARY.md`, the feature's rows in `docs/tracking/incidentals.md`, and the templates and locale files for labels.

Situation: {{situation}}

Inputs:
- The FEATURE-MAP row: {{feature_map_row}}. Atom rows: {{atlas_files}}, including the feature's `atlas/affordances-*.md` rows.
- App code, read-only: `checkouts/ojs`, `checkouts/omp`, `checkouts/ops`, each with `lib/pkp` inside.
- `docs/process/seed-facts.md` and `docs/process/users.md`, for the premise of every claim, and `docs/process/scenarios.md` for the keys the scenario API has.
- The feature's rows in `docs/tracking/incidentals.md`, what earlier sessions saw on its screens in passing: each row goes into the draft, as a claim or as a `to drive` question.
- Tier: {{tier}}.

Code existing is not evidence that a feature exists: the apps carry screens nobody can reach. Establish that a surface is reachable in the current UI first, and record dead candidates in `docs/tracking/UNASSIGNED.md`. Where a legacy path and a Vue path both do the same job, document both and say which one is primary. A rule that is merely strict is usually intended: write it plainly and add a ❓ entry with your lean.

Deliverables:
1. The spec at `{{spec_path}}`, following TEMPLATE, all three apps from the start, its Coverage section in TEMPLATE's draft table (one row per actor, state and setting, each citing the body rather than restating it, each classed main / guard / state / variant by the four tests in the TEMPLATE comment, "Runs in" reading `planned` or empty with one of the five reason words in "Why not"). Name every screen, control and message by its on-screen label, taken from the templates and locale files you are reading anyway (the app's own locale file overrides lib/pkp's key, so grep the app first); the claim check confirms the label, and the reader never meets a code concept where the screen has a word. Every affordance on the feature's screens ends up covered by a rule or scenario, delegated to another spec with a checkable pointer, or explicitly waived. Write no scenarios: the "Canonical scenarios" section carries its preamble only, and the scenarios are composed after the claim check from the verified body (RUNBOOK step 6). Write it as two Writes (the body, then the footnotes and references): a single call that generates for more than five minutes outlives the prompt cache, and the next call rebuilds the whole context.
2. Open questions, as step 3 says: where the code is ambiguous, write the claim at your best reading and give it a footnote that opens `to drive:` and states the question as screen actions and observations (the role, the screen, what to do, which of the outcomes to record; the default and the other end when a quantity or shape is in play). The checker that owns the screen settles it. A question that cannot be phrased as screen actions is a ❓ register entry with a stated lean (generic if security-shaped), a marker, or leaves the draft.
3. Lint to zero: `node docs/process/lint/lint-spec.mjs {{spec_path}}` (TEMPLATE "The lint gate"). Run it once with `--claims` too and check that every open question prints as `to-drive`.

You never drive a browser. Never edit anything under `checkouts/`. Do NOT write to PROGRESS.md or docs/tracking/app-changes.md; return proposed content in your report instead. Commit nothing.

Return (short, pointers not findings): the lint result; the `to-drive` count; the sections written or changed (names only); the Coverage counts by class (main, guard, state, variant) against the tier; the scenario keys the Coverage rows marked `planned` need that `scenarios.md` lacks, each with the rows that need it (for RUNBOOK step 4), or "none"; anything that blocked you; whether a security-shaped item exists (count only, content never).
