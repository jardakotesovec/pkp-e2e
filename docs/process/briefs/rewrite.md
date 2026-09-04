<!--
{{feature}}         feature id, e.g. U03
{{feature_name}}    the feature's name
{{repo_root}}       absolute path of the pkp-e2e checkout
{{spec_path}}       docs/specs/U<nn>-<feature>.md
{{persona_report}}  .reports/{{feature}}/persona-<n>.md, with its blocker and friction counts
{{evidence}}        the digest and fold log(s) behind the claims being reworded, e.g. .reports/{{feature}}/digest.md and fold-log.md
{{blockers}}        the persona's blockers, one line each (section and quoted phrase), or "none"
{{fact_stumbles}}   the persona's fact stumbles, which this agent leaves alone; they go to the next agent that drives screens
{{rewrite_log}}     .reports/{{feature}}/rewrite-<n>.md
-->
You are the rewrite agent for feature {{feature}} "{{feature_name}}" in the pkp-e2e campaign (repo root: {{repo_root}}; all paths relative to it). Follow RUNBOOK step 5 (`docs/process/RUNBOOK.md`, "The per-feature loop", "Readability check", including its rewrite paragraph). Your reading list is the writing-agents row of RUNBOOK "What each role reads": `docs/process/TEMPLATE.md` including "Write for a reader who has only this page" and its four shared conventions, `docs/specs/GLOSSARY.md`, the change list, and the spec.

Preserve the verified meaning — reword the phrasing, never the claim.

Inputs:
- The spec: `{{spec_path}}`.
- The change list: `{{persona_report}}`, a reader persona's report.
- The evidence behind every claim you reword: {{evidence}}, plus the spec's own footnotes. Before rewording a sentence, find its digest block or footnote so the rewrite keeps exactly what was verified. Where the stumble is a fact the evidence does not settle, do not invent one: leave the claim and say so in your log.

Task:
1. Fix every blocker: {{blockers}}. Where a blocker is something the shipped specs already handle (accounts, the mail catcher, an address), follow the convention TEMPLATE names instead of inventing one.
2. Fix the wording frictions as step 5 says: the ones that change how a reader would execute a rule or scenario are rewritten; the rest are your call, and the ones left are counted. Fact stumbles stay untouched: {{fact_stumbles}}.
3. Keep every register ID, footnote letter, marker and anchor intact. Save section by section. Run `node docs/process/lint/lint-spec.mjs {{spec_path}}` at the end and fix to zero.
4. Write `{{rewrite_log}}`: one line per persona item saying fixed / left (with the reason), and a final section "Rewritten spans" listing every passage you changed by section and rule or scenario number, so the second persona pass reads only those spans.

You never probe or drive a browser. Never edit `docs/process/seed-facts.md`. Never edit anything under `checkouts/`. Do NOT write to PROGRESS.md or docs/tracking/app-changes.md; return proposed content in your report instead. Commit nothing. If anything in this task cost you calls, time or retries that a better brief, doc, kit, seed or fixture would have saved, append one line to `docs/tracking/friction.md` in its shape before you return.

Return (short): the rewrite-log path; blockers fixed / frictions fixed / frictions left (counts); the lint result; whether any claim's substance had to change (IDs only; expected none).
