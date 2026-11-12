# Differences on 3.5 (pilot notes)

The two files under `stable-3_5_0/` list what OJS 3.5 does differently
from `main`'s spec for "Review stage & rounds" (U26) and "Tasks &
discussions" (U37). They come from the pilot's first shape, which kept
only the differences per version.

The model now is a whole spec per version, in `lines/<branch>/docs/specs/`
(`lines/README.md`). These two files are the notes for building the 3.5
specs of those two features and are deleted once the specs exist.

Reading one: the headings are the spec's own, and only the ones where
something differs appear. An entry is **not here** (the spec has it, 3.5
does not), **different here** (written out whole as 3.5 has it) or
**only here** (3.5 has something `main` no longer has). Anything not
listed was assumed the same; the file's "Basis" line says what was
walked on 3.5 and what was only compared in the code.

## What a "Seen on" cell says

Each file ends with "Findings on 3.5": `main`'s register entries with
the versions the pilot's walk saw them on, and the entries only 3.5
shows.

- `main 3.5`: seen on both.
- `main`: seen on `main`; walked on 3.5 and not there, or 3.5 has no
  such surface (the footnote says which).
- `3.5`: fixed on `main`, still on 3.5.
- `(code)` after a version: read in that version's code, not walked.
- `3.5 not checked`: nobody looked; never read it as "not affected".
