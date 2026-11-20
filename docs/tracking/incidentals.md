# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| Workflow screen & stage access | Contributors address typed per role | An assigned copyeditor (OJS, OMP) typing the Contributors address of an item still at the Submission stage lands on "Workflow: Submission" with "You don't currently have access to that stage of the workflow."; on OPS the assigned Editorial Board Member gets the "Error" window "The current role does not have access to this operation."; the reader and the reviewer get `user/authorizationDenied` with the same sentence; the submitter typing the editorial dashboard's address lands on the journal's reader home | 2026-11-20 | U41 drift sweep, claim check ccSW20, `.reports/U41/cc-SW20.md` (snapshots `access-*-as-s-contributors`, `rd-s`, `rv-s`, `au-s-editorial-address`); kept script `shared/playwright/checks/U41/SW20/sw20.js` part `access` |
