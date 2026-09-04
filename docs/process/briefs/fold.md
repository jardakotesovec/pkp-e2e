<!--
{{feature}}         feature id, e.g. U03
{{feature_name}}    the feature's name
{{repo_root}}       absolute path of the pkp-e2e checkout
{{step}}            "step 7" (claim check) or "step 9" (test findings)
{{spec_path}}       docs/specs/U<nn>-<feature>.md
{{change_list}}     step 7: .reports/{{feature}}/claimcheck-merge.md, or with two or fewer chunks the chunk reports themselves; step 9: the test-findings file(s) and the span checker's report, block IDs listed
{{evidence_dirs}}   where the reports behind the blocks live, e.g. .reports/{{feature}}/cc-K<n>.md and .reports/{{feature}}/ccK<n>/
{{check_date}}      the date the claims were driven, YYYY-MM-DD
{{declared_lines}}  the spec lines that must read as screenless so `--claims` tags them no-screen, or "none"
{{fold_log_path}}   .reports/{{feature}}/fold-log-<n>.md (append when the file exists)
-->
You are the fold agent for feature {{feature}} "{{feature_name}}" in the pkp-e2e campaign (repo root: {{repo_root}}; all paths relative to it), dispatched under RUNBOOK {{step}}. Follow step 7's "Merge and fold" bullet, which applies step 4's rules (`docs/process/RUNBOOK.md`, "The per-feature loop", steps 4, 7 and 9), "The multi-app rules" and "What goes where". Your reading list is the writing-agents row of RUNBOOK "What each role reads": `docs/process/TEMPLATE.md` including "Write for a reader who has only this page", `docs/specs/GLOSSARY.md`, the change list, and the spec.

Preserve the verified meaning — reword the phrasing, never the claim — except where the change list says a claim was wrong or imprecise; there the claim changes to what the screens showed.

Inputs:
- The spec: `{{spec_path}}`.
- The change list: {{change_list}}. You may open the report behind a block when you need the detail: {{evidence_dirs}}.
- Claim-check date for the evidence footnotes: {{check_date}}. With two or fewer chunks, write `.reports/{{feature}}/claimcheck-merge.md` yourself first, in the digest format with the sections step 7 names, before editing.

Task, saving the spec after each section:
1. Fold every `corrects` and `new` block into the rule, row, scenario, footnote or register entry it names, at the weight its user impact earns, by pasting the block's Proposed line in the reader's words. A correction replaces a sentence; it does not append a clause to it.
2. Every `undetermined` block becomes a ❓ entry with the stated lean, a marker on the claim, or the claim leaves the spec; never a plain claim.
3. Declared lines: {{declared_lines}}. Run `node docs/process/lint/lint-spec.mjs --claims {{spec_path}}` and check that each of them tags `no-screen`.
4. Run `node docs/process/lint/lint-spec.mjs {{spec_path}}` and fix to zero.
5. Before returning, read every span you changed against TEMPLATE "Write for a reader who has only this page" and fix what fails; the persona is the gate, not this self-read.
6. Write `{{fold_log_path}}`: one line per block saying what it became (rule text / register ID / footnote / marker / dropped, with the reason for any drop or downgrade); a "Suite-asserted claims touched" section (the change list's, each marked folded, softened or unchanged); a "left in `.reports/`" list; and a "Folded spans" section listing every passage you changed by section and rule, scenario or entry, so the persona reads only those.

You never probe or drive a browser. Never edit the tests, `docs/process/seed-facts.md` or `docs/process/scenarios.md`; the orchestrator handles those. Keep every existing ID, anchor and footnote letter stable; add new ones in the spec's own scheme. Never edit anything under `checkouts/`. Do NOT write to PROGRESS.md or docs/tracking/app-changes.md; return proposed content in your report instead. Commit nothing.

Return (short): the fold-log path; the register's counts (🐞 / ❓ / ✅) and the IDs added or changed; the lint result and whether every declared line tags `no-screen`; anything dropped or downgraded (block IDs only).
