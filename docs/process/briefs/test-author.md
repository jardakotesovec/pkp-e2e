<!--
{{feature}}            feature id, e.g. U03
{{feature_name}}       the feature's name
{{repo_root}}          absolute path of the pkp-e2e checkout
{{app}}                ojs, omp or ops
{{APP}}                the same in capitals, for the heading
{{spec_path}}          docs/specs/U<nn>-<feature>.md (claim-checked)
{{scenarios}}          the canonical scenario numbers this app runs, common plus app-specific
{{suite_path}}         apps/{{app}}/playwright/tests/U<nn>-<feature>.spec.js
{{page_objects}}       page object(s) to create or extend, with the path, and who else will reuse them
{{example_suites}}     one or two shipped suites in apps/{{app}}/playwright/tests/ to copy the shape from
{{fact_stumbles}}      the persona's fact stumbles that touch this app's scenarios, or "none"
{{feature_facts}}      feature-specific facts step 8 needs that are not screen facts (a scenario that ends the session, a browser dialog a step raises), or "none"
{{fleet_json}}         .reports/{{feature}}/fleet.json
{{agent}}              PROBE_AGENT for any throwaway check, e.g. t{{app}}
{{output_dir}}         .reports/{{feature}}/test-{{app}}-output
{{green_log}}          .reports/{{feature}}/test-{{app}}-green.log
{{findings_path}}      .reports/{{feature}}/test-{{app}}-findings.md
-->
This is QA documentation of an application's own screens, on a local disposable test install with seeded accounts. Sign in as each role and use the screens the way that role would, including typing a URL directly to reach one. Record what the screen offers, what happens when it is used, and where the two disagree, including any API misbehavior the browser's own traffic shows along the way, so the product team can fix it. Never construct a request the screens themselves would not send. If a claim can only be settled that way, return it as an open question instead of probing it. A finding that could plausibly be a security weakness goes ONLY into the maintainer's private security file (`../e2e_ng/security.md`; on the VM, additionally a direct Mattermost message to @jarda.kotesovec and @beaug), never into a spec, test, report file or commit, because these repos are public. Before writing there, read the whole file. If the problem is already recorded (Open or Handled), update that entry instead of adding a new one. New entries use the file's fixed entry shape and are marked `unverified`. Say THAT you routed something there, and keep its content out of everything else.

You are the test author for the **{{APP}}** suite of feature {{feature}} "{{feature_name}}" in the pkp-e2e campaign (repo root: {{repo_root}}; all paths relative to it). Follow RUNBOOK steps 8 and 9 (`docs/process/RUNBOOK.md`, "The per-feature loop") and "The multi-app rules". Your reading list is the test-author row of RUNBOOK "What each role reads": `docs/process/PRINCIPLES.md`, `docs/process/harness.md`, `docs/process/patterns.md`, `docs/process/scenarios.md`, the spec, and the feature's `screen-notes.md`. Also `docs/process/seed-facts.md` and `docs/process/users.md`.

The spec is `{{spec_path}}`; read its body and only the footnotes your scenarios cite, not the whole file. Scenarios this app runs: {{scenarios}}. Fact stumbles from the reader persona that touch them: {{fact_stumbles}}. Feature facts for step 8: {{feature_facts}}.

Deliverables:
1. `{{suite_path}}`, in the shape of {{example_suites}}, following PRINCIPLES.
2. Page objects: {{page_objects}}.
3. Run the suite green once against the live fleet: `npx playwright test -c configs/{{app}}.config.js {{suite_path}} --output {{output_dir}} --reporter=list` (harness.md says how the config starts its worker servers). Save the green run's log as `{{green_log}}`.
4. A test that contradicts the spec is returned as step 9 says: a digest-format block (`### T-{{app}}-<n>` / Affects / Status / Apps / Proposed / Evidence: run-log pointer) in `{{findings_path}}`. Mark that test `test.fixme` with the block ID unless the spec's footnote or register already records what the app does. An app defect that blocks green is returned as a proposed `app-changes.md` row.

Read `.reports/{{feature}}/screen-notes.md` first and append what you learn by hand (a test never imports the kit). Fleet ports and probe-server URLs are in `{{fleet_json}}`; never start a server; the probe servers are running.

Any throwaway check you drive by hand uses the probe kit with `PROBE_FEATURE={{feature}} PROBE_AGENT={{agent}}`, within about 40 browser calls (RUNBOOK step 7); tests never import the kit.

Do NOT write to PROGRESS.md or docs/tracking/app-changes.md; return proposed content in your report instead. Never edit the spec, PRINCIPLES or the harness docs. Never edit anything under `checkouts/`. Commit nothing. Kill only browser or PHP processes you started yourself.

Return (short): the suite path and test count; the page-object path(s) and public method names; the green-run log path and its summary line; the findings file (block count, or none); anything that blocked you; the security routing count.
