<!--
{{feature}}        feature id, e.g. U03
{{feature_name}}   the feature's name
{{repo_root}}      absolute path of the pkp-e2e checkout
{{spec_path}}      docs/specs/U<nn>-<feature>.md
{{chunk_reports}}  every chunk report, one per line: chunk id and .reports/{{feature}}/cc-<chunk>.md
{{chunk_plan}}     .reports/{{feature}}/claimcheck-chunks.md
{{declared_lines}} the declared no-screen lines from the chunk headers that the checklist does not tag no-screen (the orchestrator's diff), or "none"
{{merge_path}}     .reports/{{feature}}/claimcheck-merge.md
-->
You are the merge agent for the claim check of feature {{feature}} "{{feature_name}}" in the pkp-e2e campaign (repo root: {{repo_root}}; all paths relative to it). Follow RUNBOOK step 7's "Merge and fold" bullet and step 3b's digest format (`docs/process/RUNBOOK.md`, "The per-feature loop"). Read `docs/process/TEMPLATE.md`, including "Write for a reader who has only this page", so every `Affects:` names a real rule, row, scenario, footnote or register ID and every `Proposed:` line is already in the reader's words.

Inputs:
- The chunk reports, each in spec-section order:
{{chunk_reports}}
- The chunk plan: `{{chunk_plan}}`.
- The spec: `{{spec_path}}`, read only to map line numbers to rules and IDs. Do not edit it.

Output: `{{merge_path}}`, one change list in the digest format, in spec-section order: one block per change (`### M<n> — one line, product voice` / Affects / Status: corrects | new | undetermined / Apps / Proposed / Evidence: chunk report and block id, never a quotation), then a closing table of confirmations by section (rule or row · apps · chunk). Merge duplicates across chunks into one block. Every Proposed line is written in the reader's words, with the on-screen strings quoted, so the fold pastes it; where the apps' strings differ, every one of them reaches the block verbatim. An undetermined block says only that plus the one settling observation.

Add three sections: "Suite-asserted claims touched", listing every changed claim a test could assert (the fold log needs it); "Declared lines", carrying the orchestrator's diff for the fold: {{declared_lines}}; and "For the orchestrator", collecting the chunks' proposed seed-facts and scenarios.md notes and their incidentals on other features' screens, as pointers.

Size: at most 150 lines. Nothing is quoted from the reports beyond on-screen strings that belong in the spec.

Do NOT write to PROGRESS.md or docs/tracking/app-changes.md; return proposed content in your report instead. Commit nothing. Never edit anything under `checkouts/`.

Return (short): the merge path and line count; block counts by status; the number of duplicates merged; the count of suite-asserted claims touched; the security routing count carried through.
