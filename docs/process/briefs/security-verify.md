<!--
{{feature}}        feature id, e.g. U03
{{feature_name}}   the feature's name
{{repo_root}}      absolute path of the pkp-e2e checkout
{{security_file}}  absolute path of ../e2e_ng/security.md
{{entry_hint}}     how to find the entry to verify without naming its content: the date on its `observed` line and the report that said it routed (e.g. "observed 2026-09-03; .reports/U03/pF/report.md, item P27's folder holds the snapshots")
{{fleet_json}}     .reports/{{feature}}/fleet.json
{{agent}}          PROBE_AGENT, e.g. sec (scripts and outputs under .reports/{{feature}}/{{agent}}/)
{{date}}           today's date, YYYY-MM-DD
{{vm_or_local}}    "on the VM: send the direct Mattermost message the Frame names" or "on the maintainer's machine: send no Mattermost message"
{{frame}}          docs/process/briefs/frame.md, pasted verbatim
-->
{{frame}}

## The private file

`../e2e_ng/security.md` is maintainer-only and outside every repo, and only verified problems stay there. What is security-shaped is decided by substance: a role seeing or doing more than it is entitled to, a guard that does not hold, data exposed to the wrong audience, anything you would not publish before a fix. Ordinary UX defects are not security concerns; they go to the register.

An observation enters marked `unverified`. Before the session report, the orchestrator dispatches one targeted verification probe on the disposable install, through the screens where possible. Where only a direct request can settle it, that single constructed check is allowed for verification, never for exploration, and its content obeys the same quarantine. Confirmed: the entry stays, marked `verified` with the date and its `verified-by` line. Not confirmed, or not verifiable in this environment: the entry is deleted, and if the underlying claim still matters the spec gets a generic ❓ entry.

Any agent may write the file; the quarantine is about where content goes, not who writes it. Every write is read-first: read the whole file, and if an observation matches an existing entry (same guard, same screen, same root cause, even on another app or role), update that entry's `observed` line with the date and new context instead of adding another. One entry per distinct problem, ever. Every entry uses this shape:

```
## SEC-YYYYMMDD-<slug> — one-line problem statement
status: unverified | verified YYYY-MM-DD
where: <app(s) · screen · role>
observed: <2–4 lines, what was actually seen>
verified-by: <the one check that settled it>
```

The file has two sections. **Open** holds the entries above. **Handled** holds one line per closed item (`SEC-id — disposition, date`, where the disposition is fixed, accepted or dismissed); the maintainer moves entries there on review. Handled lines are tombstones: check them before filing, and do not re-file a handled problem unless the behavior has demonstrably changed (then file a new Open entry naming the old id). If the file is absent, create it with the two headings. An absent file or an empty Open section means "no open concerns", not "never checked". At session end, after the verification pass, the file is left tidy: dismissed entries deleted, duplicates merged, every remaining Open entry distinct and `verified`.

The repos are public, so such a finding's content never appears in a spec, test, `.reports/` file, PROGRESS note or commit message; the claim it would have supported is left out or kept generic until the fix ships. The fact of routing is never silent: a return or report says "one observation routed to the security file, verified" (or "dismissed") so the maintainer knows to look. On the VM the same file is written at the same path relative to the repo, and the session also sends a direct Mattermost message to @jarda.kotesovec and @beaug with the observation, so they see it without opening the VM; the content never appears in a channel post.

## The probe

You are the security verification probe for feature {{feature}} "{{feature_name}}" in the pkp-e2e campaign (repo root: {{repo_root}}; all paths relative to it). Follow "The private file" above: the orchestrator dispatches one targeted verification probe before the session report, and this is that probe. Read `docs/process/patterns.md` ("Locator pitfalls", "Probe kit"), `docs/process/users.md`, and the feature's `screen-notes.md`. Use scratch contexts for anything that mutates; `publicknowledge` and the seeded users are read-only.

Task:
1. Read the whole private file `{{security_file}}`. Find the Open entry to verify: {{entry_hint}}.
2. Verify it as "The private file" says, on every app the entry names, through the screens where possible.
3. Update the entry as "The private file" says (confirmed: `status: verified {{date}}` with its `verified-by:` line; not confirmed or not verifiable here: delete it, or revert an older entry to what it was before this feature's probe extended it). Leave the file tidy as it says.
4. Keep every detail inside the private file. Scripts and snapshots go under `.reports/{{feature}}/{{agent}}/` with neutral names (`check-1`), and neither file names nor contents describe the problem; if a snapshot would itself reveal the concern, do not save it. Run scripts with `PROBE_FEATURE={{feature}} PROBE_AGENT={{agent}} node bin/probe.js <app> <script>`. This session is {{vm_or_local}}.

Read `.reports/{{feature}}/screen-notes.md` first and append what you learn (`note()` in the kit). Fleet ports and probe-server URLs are in `{{fleet_json}}`; never start a server; the probe servers are running.

Size: about 15 browser calls; finish the item even if it takes more.

Do NOT write to PROGRESS.md or docs/tracking/app-changes.md; return proposed content in your report instead. Never edit anything under `checkouts/`. Commit nothing. If anything in this task cost you calls, time or retries that a better brief, doc, kit, seed or fixture would have saved, append one line to `docs/tracking/friction.md` in its shape before you return.

Return (short, counts and status words only, never the content): "verified" or "dismissed" for the entry and its SEC id; the number of Open entries left in the file; whether anything blocked you.
