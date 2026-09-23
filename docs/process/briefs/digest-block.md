# The digest block

The one shape every evidence hand-over in the loop uses: a chunk report's
entries that are not "holds" and everything the sweep found (`K<n>-<m>`),
the merge's change list (`M<n>`), a test author's findings (`T-<app>-<n>`).
A change list is a file of them.

> `### K<n>-<m> — <one line, product voice: what a person sees or gets, on which screen, as which role>`
> `Affects:` Rule 9 | Actors row 2 | Coverage row | register A5 | new
> `Status:` corrects | new | undetermined
> `Apps:` the apps it holds for (per-app difference stated in the line)
> `Proposed:` 🐞 | ❓ | ✅ | plain claim · rule text | register entry | footnote | drop
> `Evidence:` snapshot or report pointer, never a quotation
> `Crash:` server <status> <request> | script <console message> — only when the app failed during the drive

Each line reads as product behavior in the spec's own voice, on-screen
strings quoted, so the fold pastes reader language instead of translating
checker prose (TEMPLATE "Write for a reader who has only this page"). Where
the apps' strings differ, the block quotes every one of them verbatim. An
`undetermined` block says only that, plus the one observation that would
settle it. A fact seen in one run only is `undetermined`, never `corrects`.
`Proposed:` is a suggestion; the fold decides. The `Crash:` line is
present whenever the drive behind the block saw the app fail (the kit's
run record lists every response of 500 or more and every page error under
`crashes`), even when the screen showed nothing: a window that silently
stays open and a request that died on the server are different bugs to the
developer who reads the register, and the fold carries the line into the
entry's crash word (GLOSSARY "Findings register").
