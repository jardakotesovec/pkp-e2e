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
You are the spec author for feature {{feature}} "{{feature_name}}" in the pkp-e2e campaign (repo root: {{repo_root}}; all paths relative to it). Follow RUNBOOK step 3 (`docs/process/RUNBOOK.md`, "The per-feature loop"), "The multi-app rules" and "What goes where". Your reading list is the writing-agents row of RUNBOOK "What each role reads": `docs/process/TEMPLATE.md` including "Write for a reader who has only this page", `docs/specs/GLOSSARY.md`, the feature's rows in `docs/tracking/incidentals.md`, and the templates and locale files for labels.

Situation: {{situation}}

Inputs:
- The FEATURE-MAP row: {{feature_map_row}}. Atom rows: {{atlas_files}}.
- App code, read-only: `checkouts/ojs`, `checkouts/omp`, `checkouts/ops`, each with `lib/pkp` inside.
- `docs/process/seed-facts.md` and `docs/process/users.md`, for the premise of every claim, and `docs/process/scenarios.md` for the keys the scenario API has.
- Tier: {{tier}}.

Deliverables:
1. The spec at `{{spec_path}}`, following TEMPLATE, all three apps from the start, its Coverage section written with the draft (one row per actor, state and setting, "Runs in" reading `planned` or a one-line why not). Write no scenarios: the "Canonical scenarios" section carries its preamble only, and the scenarios are composed after the claim check from the verified body (RUNBOOK step 7). Write it as two Writes (the body, then the footnotes and references): a single call that generates for more than five minutes outlives the prompt cache, and the next call rebuilds the whole context.
2. Open questions, as step 3 says: where the code is ambiguous, write the claim at your best reading and give it a footnote that opens `to drive:` and states the question as screen actions and observations (the role, the screen, what to do, which of the outcomes to record; the default and the other end when a quantity or shape is in play). The checker that owns the screen settles it. A question that cannot be phrased as screen actions is a ❓ register entry with a stated lean (generic if security-shaped), a marker, or leaves the draft.
3. Lint to zero: `node docs/process/lint/lint-spec.mjs {{spec_path}}` (TEMPLATE "The lint gate"). Run it once with `--claims` too and check that every open question prints as `to-drive`.

You never drive a browser. Never edit anything under `checkouts/`. Do NOT write to PROGRESS.md or docs/tracking/app-changes.md; return proposed content in your report instead. Commit nothing.

Return (short, pointers not findings): the lint result; the `to-drive` count; the sections written or changed (names only); the scenario keys the Coverage rows marked `planned` need that `scenarios.md` lacks, each with the rows that need it (for RUNBOOK step 4), or "none"; anything that blocked you; whether a security-shaped item exists (count only, content never).
