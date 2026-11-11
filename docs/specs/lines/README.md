# Differences on older versions (pilot)

A spec in `docs/specs/` describes `main`. This folder holds, per stable
version and per feature, only what that version does differently:

```
docs/specs/lines/<branch>/U<nn>-<feature>.md
```

A feature with no file here has no known difference on that version.
This is a pilot on `stable-3_5_0` with two features, to judge the shape
before any rule in `docs/process/` changes.

## Reading a differences file

- **Anything not listed is assumed the same as the spec.** The file's
  "Basis" line says what that rests on: which scenarios were walked on
  the version and which parts were only compared in the code.
- **The headings are the spec's own**, and only the ones where something
  differs appear. An entry names the spec's rule number, Actors row,
  field label, setting or scenario number, and is one of three kinds:
  - **not here**: the spec has it, this version does not;
  - **different here**: both have it and it behaves differently. The
    rule or scenario is written out whole, as this version has it, so
    the reader needs no merge of two texts;
  - **only here**: this version has something `main` no longer has.
- **Findings are not in these files.** A spec's Findings register lists
  every finding once, and its "Versions" column says which versions
  show it. A finding `main` no longer shows and an older version still
  does sits under "Older versions only" in that register. A differences
  file states what the version's screen does, as a spec does, and marks
  the spot with ⚠ and a link to that entry.
- **Evidence is in the footnotes**, as in a spec: the commits read, the
  date, the kept script and its snapshots.

## What a "Versions" cell says

- `main 3.5`: seen on both.
- `main`: seen on `main`; walked on 3.5 and not there, or 3.5 has no
  such surface (the footnote says which).
- `3.5`: fixed on `main`, still on 3.5.
- `(code)` after a version: read in that version's code, not walked.
- `3.5 not checked`: nobody looked; never read it as "not affected".
