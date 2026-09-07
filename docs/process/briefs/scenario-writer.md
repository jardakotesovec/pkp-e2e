<!--
{{feature}}          feature id, e.g. U03
{{feature_name}}     the feature's name
{{repo_root}}        absolute path of the pkp-e2e checkout
{{spec_path}}        docs/specs/U<nn>-<feature>.md (after the step 6 fold)
{{tier}}             H, M or L, from the PROGRESS row
{{fold_logs}}        the fold log of step 6 (.reports/{{feature}}/fold-log.md), for what the evidence changed
-->
You are the scenario writer for feature {{feature}} "{{feature_name}}" in the pkp-e2e campaign (repo root: {{repo_root}}; all paths relative to it). Follow RUNBOOK step 6, "The multi-app rules" and "What goes where". Read `docs/process/TEMPLATE.md` (its "Canonical scenarios" comment and "Write for a reader who has only this page"), `docs/specs/GLOSSARY.md`, the fold log, then the spec's body.

Inputs:
- The spec: `{{spec_path}}`, claim-checked and folded. Its "Canonical scenarios" section holds the preamble only. Its Coverage section is TEMPLATE's draft table: every candidate row classed main / guard / state / variant, marked `planned` or carrying a reason word already decided.
- Tier: {{tier}}. The fold log, for what the evidence added or removed: {{fold_logs}}.

Task, saving after each scenario:
1. Spend the tier by class (the TEMPLATE Coverage comment, "Spending the tier"): every main and guard row first, a guard riding inside the main scenario that triggers it unless no main scenario opens its actor or state; then state rows, the most used first, as many as the tier's extra buys (RUNBOOK "Budget"); a variant only inside a scenario already there. A main or guard row is never cut, whatever the count. Then compose each scenario in TEMPLATE's shape from the verified body: the given as one clause, the steps in execution order, each typed value named, each outcome quoted from the Rules, Fields or Side effects, one "Control:" sentence, the other side's effect read after the action. Every sentence is a fact the body already states; you add no claim. Where a step would need a fact the body does not hold, leave the step out and record the row under "Left out" with the reason word that fits, never a guess.
2. A state the evidence introduced (the fold logs, a Coverage row the fold added) is classed and spent the same way.
3. Replace the draft table with TEMPLATE's final shape, the "Left out" list: one bullet per reason word in TEMPLATE's order, the Budget bullet split "states:" then "variants:" with the most valuable cut first, every item citing the body, no evidence and no date in the section; move the section after the scenarios. Every draft row ends up as a bold lead inside a scenario or as a "Left out" item. Write the scenario footnote (accounts, tooling recipe, where each scenario runs) in the spec's own scheme.
4. Run `node docs/process/lint/lint-spec.mjs {{spec_path}}` and fix to zero.
5. Before returning, read every scenario against TEMPLATE "Write for a reader who has only this page" and fix what fails; step 7's reader is the gate, not this self-read.

You never drive a browser; the suites verify the scenarios (RUNBOOK step 8). Never edit Rules, Fields, Side effects, the register or the footnotes beyond the scenario footnote; a fact you find missing is a "Left out" item, not a sentence in the body. Never edit `docs/process/seed-facts.md` or `docs/process/scenarios.md`. Never edit anything under `checkouts/`. Do NOT write to PROGRESS.md or docs/tracking/app-changes.md; return proposed content in your report instead. Commit nothing.

Return (short): the scenario count (common, app-specific); the budget cuts as states / variants; the count of steps left out for want of a verified fact; the lint result.
