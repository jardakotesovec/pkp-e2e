# A deleted announcement's picture, and a picture replaced by one of another type, stay on the server and online

- **Severity** medium
- **Effort** small
- **Kind** regression
- **Crash** server
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: none (code)
  - 3.3: none (code; no announcement picture)
- **Introduced** `pkp/pkp-lib#10787` for `pkp/pkp-lib#10668` · [0b2ca57ed8](https://github.com/pkp/pkp-lib/commit/0b2ca57ed84822c48eb23c13de3726371623a02e) · 2025-01-09 · Touhidur Rahman (touhidurabir); the file left by a replacement since `pkp/pkp-lib#10382` for `pkp/pkp-lib#10328` · [070aa6f77b](https://github.com/pkp/pkp-lib/commit/070aa6f77b2b14e31b9089b5f82a48e8ba11c329) · 2024-09-30 · Vitalii Bezsheiko (Vitaliy-1)
- **Upstream** none found (2026-10-23)
- **Tracked in** spec U12 [A12](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U12-announcements.md#a12)
- **Checked** 2026-10-27, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-27: an edit whose new picture is refused is now stopped
before anything is written, by the fix for
[pkp-e2e#1076](https://github.com/jardakotesovec/pkp-e2e/issues/1076),
merged in pkp-lib as
[334906a436](https://github.com/pkp/pkp-lib/commit/334906a43628e679b4f57d2f47b0244b5c8a30a9) (`main`)
and [c31cbe60f8](https://github.com/pkp/pkp-lib/commit/c31cbe60f8b81b6d584e3938b277273d8721bcc6)
(`stable-3_5_0`), Alec Smecher (asmecher); see Reach. Walked again on
`main` and 3.5: deletes and replacements still leave their files. The
report now also says what a failed file copy on an edit leaves.

## Summary

"Delete Announcement" › "Yes" removes an announcement and its pages,
but its picture file stays on the server and is still served at its
old address. That address is named after the announcement's number, so
anyone can guess it. Every delete, of an announcement with a picture or
without, also writes a PHP warning to the server log.

When a manager replaces a picture with one of another type, for
example a GIF in place of a PNG, the old file stays beside the new one
in the same way. A new picture of the same type overwrites the old file,
as it should.

Nothing on screen shows these files, so the manager is not told. The
site's announcements leave their pictures the same way. There "Remove"
then "Save" leaves the file too, and on a press or preprint server that
save fails with a server error and the picture stays on the
announcement.

## Impact

- **Lost:** nothing on any page. A picture the journal took down with
  its announcement is still online.
- **Who:** every journal, press and server that deletes an announcement
  with a picture, or changes a picture's type; and the site
  administrator, for the site's announcements.
- **Way round:** on a journal, press or server, "Edit" › "Remove" ›
  "Save" before "Delete" removes the file. None for the site's
  announcements: on OMP and OPS that save answers 500 (a `TypeError`),
  keeps the rest of the edit and keeps the picture; the fix mends it.
  Files already left behind can only be removed on the server.

Medium: the delete looks complete, but the deleted announcement's
picture stays public at an address anyone can work out. It would be low if the files left behind were not served.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`. It has no announcements, and
  announcements are off.
- Two pictures on the computer: a PNG named `photo.png` and a GIF named
  `photo.gif`.
- Access to the install's public files folder, where the pictures are
  stored: `public/journals/1/announcements/` (OMP `public/presses/1/…`,
  OPS `public/contexts/1/…`), and `public/site/announcements/` for the
  site's.

A journal's announcements:

1. Sign in as `rvaca`.
2. Go to Settings › Website › Setup › "Announcements", tick "Enable
   announcements" and press "Save".
3. Reload, and open "Announcements" in the side menu.
4. Press "Add Announcement". Enter Title `u12r2 Spring notice`; under
   "Image" press "Upload File" and pick `photo.png`; press "Save". The
   folder holds `1.png` (the announcement's number, 1 on the dataset).
5. On that row press "Edit". Under "Image" press "Remove", then "Upload
   File" and pick `photo.gif`; press "Save".
6. Open the announcement's page,
   `/index.php/publicknowledge/announcement/view/1`, and note its
   picture's address.
7. Back on "Announcements", press "Delete" on the row, then "Yes" in
   "Delete Announcement" ("Are you sure you want to permanently delete
   the announcement u12r2 Spring notice?").
8. Open the picture's address from step 6.

**Expected:** after step 5 the folder holds `1.gif` alone. After step 7
it holds no `1.*` file, and step 8 answers "404 Not Found".

**Observed:** after step 5 the folder holds `1.gif` and `1.png`: the
replacement left `1.png`. After step 7 the row is gone and the delete
answers 200, but the folder still holds both files: the delete left
`1.gif`. Step 8 still serves the GIF (`200`, `image/gif`). The server
log has, for the delete:

```
PHP Warning:  Attempt to read property "image" on null in …/lib/pkp/classes/announcement/Announcement.php on line 301
```

Every delete logs this line: an announcement added without a picture
("u12r2 Plain notice"), then "Delete" › "Yes", logs it too.

Control: on a second announcement with `photo.png`, "Edit" › "Remove" ›
"Save" deletes its file.

The site's announcements (the site shows its "Announcements" tab once
it hosts a second journal, press or server):

1. Sign in as `admin`.
2. Administration › Hosted Journals › "Create Journal" (OMP "Hosted
   Presses" › "Create Press", OPS "Hosted Servers" › "Create Server"):
   name `u12r2 Second`, initials `U12R2`, contact `u12r2 Second`,
   `u12r2second@mailinator.com`, country Canada, path `u12r2second`,
   English, enabled; "Save".
3. Administration › Site Settings › "Announcements" › "Settings": tick
   "Enable announcements" and press "Save".
4. Reload the page, open the "Announcements" tab again, and in it the
   "Announcements" tab beside "Settings", which holds the list. "Add
   Announcement": Title `u12r2 Site notice`, `photo.png`; "Save". The
   folder holds `1.png`.
5. On that row "Edit" › "Remove" › "Upload File" `photo.gif` › "Save".
6. "Delete" on the row, then "Yes".
7. "Add Announcement": Title `u12r2 Site remove`, `photo.png`; "Save"
   (`2.png`). Then "Edit" › "Remove", change the title to `u12r2 Site
   remove (edited)`, "Save".

**Expected:** `1.gif` alone after step 5, no `1.*` after step 6, and
after step 7 the save goes through and `2.png` is gone.

**Observed:** after step 5 the folder holds `1.gif` and `1.png`, and
after step 6 still both. In step 7 OJS saves (200) and clears the
picture, but `2.png` stays. OMP and OPS answer 500, the panel stays
open, and the announcement keeps both its new title and its picture:

```
{"error":"APP\\file\\PublicFileManager::getContextFilesPath(): Argument #1 ($contextId) must be of type int, null given, called in …/lib/pkp/classes/announcement/Announcement.php on line 306"}
```

## Cause

`Announcement::deleteImage()` in pkp-lib
(`classes/announcement/Announcement.php`, line 301) finds the file to
delete by reading the announcement back from the database:

```php
protected function deleteImage(): void
{
    $image = $this->fresh()->image;
```

It has three call sites. Two of them run it after the database has
already changed, so it reads the wrong picture or none:

- `delete()` calls it after `parent::delete()`. `fresh()` on a deleted
  model returns `null`, so reading `->image` on it logs the warning
  above on every delete, and `$image` is `null`: no file is removed.
- `save()` calls it, for a new picture, after `parent::save()` has
  written the new picture data. That data holds only the upload's
  temporary file id and its alternate text, with no `uploadName`, so
  the old file is not removed. `handleImageUpload()` then writes
  `{id}.{extension}`: over the old file when the type is the same,
  beside it when not.

The third, "Remove" then "Save", works. `parent::save()` leaves the
removed picture's setting row in the database, so `fresh()` still reads
the old picture, and `save()` deletes that row afterwards.

History. Until 3.4, `PKP\announcement\Repository` deleted the file from
the announcement as loaded, before the edit or the delete. PR
`pkp/pkp-lib#10382` (2024) moved the image handling into the model,
where `deleteImage()` read the current attribute after the write. Within
that PR, 070aa6f77b made a new picture on an edit reach the
`deleteImage()` call in `save()`'s edit branch, and
replacements stopped removing the old file. 0b2ca57ed8
(`pkp/pkp-lib#10787`) added the "Remove" branch and switched
`deleteImage()` to `fresh()`, which stopped the delete from removing the
file.

Reach:

- "Delete Announcement" on a journal's, press's or server's
  announcement, and on the site's (on screen, all three apps).
- A replacement by a picture of another type, on a journal's
  announcements and on the site's (on screen).
- The site's "Remove" then "Save" reaches `deleteImage()` with the old
  picture, and fails on its folder test (see the Proposed fix): OJS
  looks in `public/journals/0` and leaves the file, OMP and OPS throw
  the `TypeError` above (on screen).
- An edit whose new picture is refused never reaches `save()`:
  `PKP\announcement\Repository::validate()` refuses it first (the fix
  for pkp-e2e#1076, merged after this report was first filed), so the
  stored picture, its file and the page stay as they were (on screen).
  That fix changed only `Repository::validate()`, so it and this one do
  not overlap.
- Removing an announcement type, and deleting a journal, delete the
  announcements with a query (`Announcement::withTypeIds()->delete()` in
  `AnnouncementTypeDAO::deleteById()`, `Announcement::withContextIds()->delete()`
  in `PKPContextService::delete()`), which never calls the model's
  `delete()`, so their files stay too (code). In 3.4 both went through
  `Repo::announcement()->deleteMany()`, which removes each file, so this
  is the same regression from `pkp/pkp-lib#10382`. Both are left out of
  the fix (below).
- Highlights keep the 3.4 pattern (`PKP\highlight\Repository::edit()`
  and `delete()` take the file name from the highlight as loaded), and
  are not affected (code).

## Proposed fix

Take the picture to delete from the announcement as it was loaded,
before the write, and pass it to `deleteImage()`; on a replacement,
remove the old file only once the new one is copied; and pick the
folder the way `storeTemporaryFile()` does
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/announcement-image-files-left-behind/fix.diff)):

```diff
     public function delete()
     {
+        // The image as loaded (or as last saved); the row is gone once parent::delete() returns
+        $image = $this->getOriginal('image');
         $deleted = parent::delete();
         if ($deleted) {
-            $this->deleteImage();
+            $this->deleteImage($image);
         }
```

- `save()` reads `$storedImage = $this->getOriginal('image')` before
  `parent::save()` (null for a new announcement). It passes it to
  `handleImageUpload()` for a new picture, and uses it in place of
  `$this->fresh()->image` in the "Remove" condition.
- `handleImageUpload(?object $storedImage)` removes the stored file
  only once the new file is copied, and only when its name differs
  (a new picture of the same type has just overwritten it). A failed
  copy removes no file (what it does to the announcement is below).
- `deleteImage(?object $image)` takes the picture to remove and no
  longer calls `fresh()`, so a delete logs no warning.
- `deleteImage()` picks the folder with `$this->assocId ?
  getContextFilesPath($this->assocId) : getSiteFilesPath()`, as
  `storeTemporaryFile()` does. Today it tests
  `$this->hasAttribute('assocId')`, which is always true because the
  schema casts declare `assocId`, so a site announcement's folder is
  picked wrong (Reach, the site's "Remove" then "Save"). Today only the
  site's "Remove" then "Save" gets that far. With the `getOriginal()`
  changes the site's delete and replacement do too, so the folder test
  must change with them.

`getOriginal()` returns the picture as the announcement was loaded with
`find()`, which is how the edit and delete endpoints load it. After a
save, Eloquent re-syncs the originals, so on an instance that was just
saved it returns the new data. Two paths inside `handleImageUpload()`
call `save()` or `delete()` again on such an instance. The nested
`save()` after a good copy has no new picture, so it removes nothing.
A failed copy calls `$this->delete()`, whose original is by then the
temporary data. On an edit this deletes the whole announcement and
leaves its stored file on disk: the same leftover this report is about,
on a path the fix does not cover. It is left out for two reasons. The
copy into the public files folder fails only on a server-side fault (a
full disk, the folder's permissions). And whether a failed copy on an
edit should delete the announcement at all is a separate question,
which the report on refused pictures (pkp-e2e#1076) raised; if that
`delete()` stays, it should also remove `$storedImage`.

Tried on `main` in all three apps: the Steps then showed the Expected,
and the delete logged no warning. A refused edit (Reach) kept `1.png`,
with the fix in and out. As a neighbour check, a same-type replacement kept the
new file, a title-only edit kept the file, and "Remove" then "Save"
still deleted it, with the fix in and out. On the site's announcements
(walked on OMP) the replacement left `1.gif` alone, the delete emptied
the folder, and "Remove" then "Save" answered 200, kept the new title
and removed `2.png`.

**Alternatives:**

- Keep `fresh()`, and call `deleteImage()` before `parent::delete()` and
  `parent::save()`. This fixes the two call sites, but deletes the old
  file even when the write then fails, and keeps a database read per
  call.
- Remove the old file before `handleImageUpload()` copies the new one,
  where `save()` calls `deleteImage()` today. Simpler, but a failed
  copy then removes the old file as well.
- Delete every `{id}.*` file in the folder. This would also clean up
  after past replacements, but it guesses at file names instead of
  reading the stored one.

**What goes with it:**

- An e2e scenario in U12 (a Planned item): the folder after a delete and
  after a replacement of another type, on a journal and on the site. Or
  a unit test of `Announcement::delete()` and `save()` with a stored
  picture.
- The type removal and the journal delete are left out. The type
  removal belongs to the report on removing an announcement type, which
  asks whether it should delete announcements at all. Both would load
  the announcements and call `delete()` on each
  (`->get()->each->delete()`) to remove the files.
- `imageUrl()` builds the picture's address with the same
  `hasAttribute('assocId')` test. `announcement_summary.tpl` and
  `announcement_full.tpl` print it, so the site's Announcements page
  (`/index.php/index/announcement`), a site announcement's own page
  (`/index.php/index/announcement/view/{id}`) and the site's home page,
  when it lists announcements, call `getContextFilesPath(null)` for a
  site announcement with a picture. On OMP and OPS that throws the same
  `TypeError` (code; not walked). It is left out; the same one-line
  change applies.
- Files left by earlier deletes and replacements stay. A cleanup would
  compare each `announcements/` folder with the stored `uploadName`s.
  It is not needed for the fix.
- 3.5 takes the diff as written.

Small: three call sites, two signatures and the folder test in one
class, with a test.

## Evidence

- Kept script:
  [walk.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/announcement-image-files-left-behind/walk.js)
  (helpers in `lib.js` and the pictures beside it), run on an install
  freshly loaded with the default dataset:
  `node bin/probe.js all shared/playwright/checks/issues/announcement-image-files-left-behind/walk.js`.
  It lists the public files folder after each step, reads the
  announcement's `image` setting from the database, and records the
  server log lines each step causes; the Control and the delete of an
  announcement without a picture follow the Steps. `MODE=neighbour`
  runs the neighbour check (a PNG replacing the PNG, a title-only edit,
  then "Remove" and "Save"). `MODE=site` takes the site Steps, listing
  `public/site/announcements/`.
- `MODE=refused` walks the refused edit of Reach (`renamed.jpg`, a copy
  of `photo.png`): the answer, the folder, the stored `image` setting
  and the announcement's page.
- 2026-10-23, on PostgreSQL with pkp/datasets 300c68e (2026-10-22): the
  journal Steps, the Control and the delete without a picture walked on
  `main` and `stable-3_5_0` (OJS, OMP, OPS; `main` lib/pkp 1f415a07ca,
  3.5 lib/pkp 5b54f59ed7); the warning names line 301 on `main` and 302
  on 3.5, whose file has one more `use` line. The
  site Steps walked on `main` (OJS, OMP, OPS). The fix tried on `main`:
  the journal Steps, the neighbour check and `MODE=refused` on all
  three apps, the site Steps on OMP only (OPS runs the same code); the
  neighbour check and `MODE=refused` also without the fix.
- 2026-10-03, with pkp/datasets 566bb1f: the site's add, replacement
  and delete walked on `stable-3_5_0`. The site's "Remove" then "Save"
  was not walked on 3.5.
- 2026-10-27, on PostgreSQL with pkp/datasets accd72de (2026-10-26):
  the journal Steps, the Control, the delete without a picture and
  `MODE=refused` walked again on `main` and `stable-3_5_0` (OJS, OMP,
  OPS); OMP and OPS with the #1076 fix applied, which their pkp-lib
  pointers do not carry yet. The warning still names line 301 on `main` and 302
  on 3.5. The fix tried again on `main`: the journal Steps, the
  neighbour check and `MODE=refused` on all three apps and the site
  Steps on OMP, the neighbour check and `MODE=refused` also without
  it.
- Tips (2026-10-27): `main` OJS 4227223332 (lib/pkp 334906a436), OMP
  ceae6e275f and OPS 66a3bb98a5 (lib/pkp c27153abdd); `stable-3_5_0`
  OJS b877c7e2a3 (lib/pkp c31cbe60f8), OMP 3c8c7c4964 (lib/pkp
  3fd17879b3) and OPS 07926c35b4 (lib/pkp 9a0212faff).
- 3.4 and 3.3 (code): lib/pkp `stable-3_4_0` 366030b017 (its
  `PKP\announcement\Repository::delete()` and `edit()` still remove the
  file of the announcement as loaded) and `stable-3_3_0` 126b86bc2e
  (its announcement schema has no image).
- Introduced: `git blame` on `deleteImage()`'s `fresh()` line gives
  0b2ca57ed8 (PR `pkp/pkp-lib#10787`, merged 2025-01-23). At its parent,
  `deleteImage()` read `$this->getAttribute('image')`. That held the
  stored picture on a delete, and the new one on a replacement, and
  logged nothing; the `fresh()` call brought the warning with it. In
  c9cda06979 the edit branch tested a top-level `temporaryFileId`,
  which the panel never sends; 070aa6f77b read `temporaryFileId` from
  the picture instead.
- Upstream: searched by symptom words, by `deleteImage` and by the
  warning's text. `pkp/pkp-lib#12744` (open) quotes the warning in its
  server log, but it is about `.jpeg` pictures being refused, not about
  the files or the warning.
