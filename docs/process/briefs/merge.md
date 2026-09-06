<!--
{{feature}}        feature id, e.g. U03
{{feature_name}}   the feature's name
{{repo_root}}      absolute path of the pkp-e2e checkout
{{spec_path}}      docs/specs/U<nn>-<feature>.md
{{chunk_reports}}  every chunk report, one per line: chunk id and .reports/{{feature}}/cc-<chunk>.md
{{chunk_plan}}     .reports/{{feature}}/claimcheck-chunks.md
{{declared_lines}} the orchestrator's subset check: the chunk headers' declared no-screen lines minus the checklist's `no-screen` lines, which must be empty or explained; "none" when empty
{{merge_path}}     .reports/{{feature}}/claimcheck-merge.md
-->
You are the merge agent for the claim check of feature {{feature}} "{{feature_name}}" in the pkp-e2e campaign (repo root: {{repo_root}}; all paths relative to it), dispatched only with three or more chunks. Follow RUNBOOK step 6. Read `docs/process/TEMPLATE.md`, including "Write for a reader who has only this page", so every `Affects:` names a real rule, row, scenario, footnote or register ID and every `Proposed:` line is already in the reader's words.

Inputs:
- The chunk reports, each in spec-section order:
{{chunk_reports}}
- The chunk plan: `{{chunk_plan}}`.
- The spec: `{{spec_path}}`, read only to map line numbers to rules and IDs. Do not edit it.

Output: `{{merge_path}}`, one change list of digest blocks in the shape of `docs/process/briefs/digest-block.md` (ID `M<n>`; Evidence: chunk report and block id), in spec-section order, one block per change, then a closing table of confirmations by section (rule or row · apps · chunk). Merge duplicates across chunks into one block.

Add three sections: "Suite-asserted claims touched", listing every changed claim a test could assert (the fold log needs it); "Declared lines", carrying the orchestrator's diff for the fold: {{declared_lines}}; and "For the orchestrator", collecting the chunks' proposed seed-facts and scenarios.md notes and their incidentals on other features' screens, as pointers.

Size: at most 150 lines. Nothing is quoted from the reports beyond on-screen strings that belong in the spec.

Do NOT write to PROGRESS.md or docs/tracking/app-changes.md; return proposed content in your report instead. Commit nothing. Never edit anything under `checkouts/`.

Return (short): the merge path and line count; block counts by status; the number of duplicates merged; the count of suite-asserted claims touched; the security routing count carried through.
