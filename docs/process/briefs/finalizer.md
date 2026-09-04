<!--
{{feature}}             feature id, e.g. U03
{{feature_name}}        the feature's name
{{repo_root}}           absolute path of the pkp-e2e checkout
{{spec_path}}           docs/specs/U<nn>-<feature>.md (the draft)
{{digest_path}}         .reports/{{feature}}/digest.md
{{slice}}               M or L: "the whole digest"; H: the digest section or spec section this agent folds, by block IDs or section name
{{probe_date}}          the date the probes ran, YYYY-MM-DD
{{orchestrator_notes}}  facts step 4 names that the digest cannot carry: a block already folded by another slice, a block whose Evidence report the agent should open, or "none"
{{fold_log_path}}       .reports/{{feature}}/fold-log.md
-->
You are the finalizer for feature {{feature}} "{{feature_name}}" in the pkp-e2e campaign (repo root: {{repo_root}}; all paths relative to it). Follow RUNBOOK step 4 (`docs/process/RUNBOOK.md`, "The per-feature loop", "Finalize the spec"), "The multi-app rules" and "What goes where". Your reading list is the writing-agents row of RUNBOOK "What each role reads": `docs/process/TEMPLATE.md` including "Write for a reader who has only this page", `docs/specs/GLOSSARY.md`, the digest, and the spec.

Inputs:
- The draft: `{{spec_path}}`.
- The digest: `{{digest_path}}`, your slice: {{slice}}. It is the only evidence artifact you read by default; you may open the one probe report behind a block when you need the detail (its Evidence line names the file).
- Probe date for the evidence footnotes: {{probe_date}}. Notes from the orchestrator: {{orchestrator_notes}}.

Task: fold your slice into the draft as step 4 says, so the spec describes what the running apps do, written to TEMPLATE "Write for a reader who has only this page". Leave the frontmatter `status:` as it is (TEMPLATE's frontmatter says when it changes). Fold section by section and save as you go. Then run `node docs/process/lint/lint-spec.mjs {{spec_path}}` and fix what it reports until it is zero.

Write `{{fold_log_path}}` (append if another slice wrote it first): one line per digest block saying what it became (rule text / register ID / footnote / marker / dropped, with the reason for any drop or downgrade); a "left in `.reports/`" list of what did not clear the bar and what belongs to another feature, one line each naming the owning feature and screen; and a "seed-facts lines proposed" section copied from the digest for the orchestrator.

You never probe or drive a browser. Never edit `docs/process/seed-facts.md` or `docs/process/scenarios.md`; the orchestrator handles those. Never edit anything under `checkouts/`. Do NOT write to PROGRESS.md or docs/tracking/app-changes.md; return proposed content in your report instead. Commit nothing.

Return (short, pointers not findings): the fold-log path; the register's counts (🐞 / ❓ / ✅) and the IDs added or changed; the lint result; anything dropped or downgraded (block IDs only); the security count carried through.
