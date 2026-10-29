# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U41 | The contributor edit API (`PUT` on a publication's contributor; API only) | An edit whose body has no `contributorType` empties every name field of the contributor (given, family, preferred public name); the same edit with the type set keeps them. The screens always send the type. Not walked further. | 2026-10-27 | Seen by the daily upstream session's helper on OJS `main` (lib/pkp `c27153abdd`, PKP's default dataset); a rerun with `contributorType` kept the names. |
