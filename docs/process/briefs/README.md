# Brief templates

One file per role of the RUNBOOK loop. The orchestrator renders a brief by
copying the role's template and filling its slots. It never writes a brief
from scratch, and it never writes rules into one.

## How to render a brief

1. Copy the template for the role. The HTML comment at its top lists every
   `{{slot}}` the file uses and what goes there. Fill every one; a brief
   with an unfilled slot is not sent. Delete the comment from the rendered
   brief.
2. Add only the feature-specific facts the RUNBOOK step names for that
   role: which cluster or chunk, which lines, which digest blocks, which
   fact stumbles from the persona report, which other agent runs on the
   fleets at the same time. A fact about a screen (a locator, a dialog on
   the way out, a wait that hangs) belongs in
   `.reports/<feature>/screen-notes.md`, never in a brief; the template
   already points the agent there.
3. Never add a rule, a paraphrase of a rule, or a checklist of your own.
   Every rule the agent needs is reached through the pointers the template
   carries (RUNBOOK step and section names, TEMPLATE, PRINCIPLES, the row
   of "What each role reads"). A rule missing from the docs is fixed in
   the docs through maintainer review; a brief never patches it.
4. Keep the verbatim blocks as they are: the Frame paragraph (copied from
   RUNBOOK "The screen is the instrument"; when its wording changes there,
   update the four templates that carry it), the PROGRESS and app-changes
   sentence, "Commit nothing.", the friction sentence (`docs/tracking/friction.md`), the
   `checkouts/` sentence, and "Preserve the verified meaning" in the rewrite
   and fold templates.
5. The "Return (short)" block is what the agent sends back: pointers and
   counts, never findings. Do not widen it.

## Which template when

| RUNBOOK step | Template |
|---|---|
| 2, author the spec | `spec-author.md` |
| 2, draft read | `persona-draft.md` |
| 3, probe one cluster | `probe.md` |
| 3b, digest | `digest.md` |
| 4, finalize (one agent, or one slice of an H feature) | `finalizer.md` |
| 5, readability check (first pass over the body; second pass over the rules that hold the rewritten spans) | `persona.md` |
| 5, rewrite wording stumbles | `rewrite.md` |
| 5, product-owner read of the register (after the last fold) | `persona-po.md` |
| 7, one claim-check chunk (also step 9's span checker) | `claim-check.md` |
| 7, merge three or more chunks | `merge.md` |
| 7 and 9, fold a change list into the spec | `fold.md` |
| 8 and 9, one app's suite | `test-author.md` |
| "What goes where", the security verification probe | `security-verify.md` |
