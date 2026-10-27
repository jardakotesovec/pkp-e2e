# An announcement edit whose new picture is refused breaks the announcement's picture, and every later "Save" fails

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Crash** server
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS (the branch only; no tagged release carries it)
  - 3.4: none (code; the refused edit deletes the announcement instead)
  - 3.3: none (code; no announcement picture)
- **Introduced** `pkp/pkp-lib#9260` for `pkp/pkp-lib#9253` · [b0be24e79b](https://github.com/pkp/pkp-lib/commit/b0be24e79bed051ab6584f735753057c6a7db6f0) · 2023-11-08 · Nate Wright (NateWr). Until `pkp/pkp-lib#13512` · [07bc43fe67](https://github.com/pkp/pkp-lib/commit/07bc43fe6732e0da9d486cea432ac9898d0603ab) · 2026-10-16 · Alec Smecher (asmecher), the same refusal deleted the whole announcement, so the broken picture could not be seen before it
- **Upstream** none found (2026-10-27)
- **Tracked in** spec U12 [A21](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U12-announcements.md#a21)
- **Checked** 2026-10-27, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

Update 2026-10-27: a team member asked for a fix that keeps request
handling out of the `Announcement` model. The proposed fix now checks
the new picture in `PKP\announcement\Repository::validate()`, before
the write, and leaves the model unchanged; it was tried again on `main`
with the same outcome.

## Summary

A manager edits an announcement that has a picture and uploads a new
one that the "Image" box lets in but "Save" does not accept: a BMP, SVG
or TIFF picture, or a file whose content does not match its name, such
as a PNG named "renamed.jpg". "Save" shows "There was an error
uploading this image." and says the form was not saved, so the manager
expects the announcement to stay as it was.

It does not: the picture is already gone. The announcement's page and
the public Announcements page no longer show it, and "Edit" shows no
preview. After that, no "Save" of the announcement succeeds, not even
one that only changes the title, yet each failed save stores the new
title. The manager who uploaded the refused file sees the same refusal
again. Any other manager gets a server error: "An unexpected error has
occurred. Please reload the page and try again.". There is a way round
on screen.

No release carries this yet: it is on `main` and on the 3.5 branch,
and ships with 3.5's next patch release unless fixed first. Released
3.5 versions delete the whole announcement on the same refusal instead.

## Impact

- **Lost:** the announcement's picture and its alternate text on its
  page and in the public list. The message misleads: it says the form
  was not saved, while the picture has already been replaced and later
  saves store the title. The old picture's file stays on the server,
  but no screen can put it back.
- **Who:** a manager who uploads, on an edit, a file the "Image" box
  accepts and "Save" refuses (above); then every manager who edits that
  announcement.
- **Way round:** before closing the panel, "Restore Original" then
  "Save". After closing it, any manager can press "Remove" then "Save",
  and then upload an accepted picture.

Medium: the edit misleads and the public pages lose the picture
silently, but there is a way round on screen and it takes an unusual
file. It would be high if no screen offered a way back.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main`. It has no announcements, and
  announcements are off.
- Two files on the computer: a PNG picture named `photo.png`, and a copy
  of it renamed to `renamed.jpg` (a PNG whose name says JPEG, which
  "Save" refuses because the content does not match the name).

Steps:

1. Sign in as `rvaca`.
2. Settings › Website › Setup › "Announcements": tick "Enable
   announcements" and press "Save".
3. Reload, and open "Announcements" in the side menu.
4. Press "Add Announcement". Title `hkq27c Spring notice`; under "Image"
   press "Upload File" and pick `photo.png`; "Alternate text" `Spring
   picture`; press "Save".
5. Open the announcement's page,
   `/index.php/publicknowledge/announcement/view/1`. It shows the
   picture; note its address ("Copy image address").
6. Back on "Announcements", press "Edit" on the row. Under "Image" press
   "Remove", then "Upload File" and pick `renamed.jpg`; press "Save".
7. Close the panel, and open the announcement's page again.
8. Back on "Announcements" (reloaded), press "Edit" on the row and look
   at "Image".
9. In that panel change the Title to `hkq27c Spring notice (edited)` and
   press "Save".
10. Reload "Announcements".
11. Press "Edit", under "Image" press "Remove", and press "Save".
12. Open the picture's address from step 5.

**Expected:** step 6 is refused, and nothing of the edit is stored.
After step 7 the page still shows the picture with its alternate text
"Spring picture", and in step 8 "Image" shows its preview. Step 9 saves
and closes the panel. Step 11 saves, and step 12 answers "404 Not
Found": the removed picture's file is gone.

**Observed:** step 6 is refused as expected: "There was an error
uploading this image." under "Image", "Please correct one error." at
the panel's foot, and the notice "The form was not saved because 1
error(s) were encountered. Please correct these errors and try
again.". The request answers:

```
PUT /index.php/publicknowledge/api/v1/announcements/1  400
{"image":["There was an error uploading this image."]}
```

After step 7 the announcement's page and the public Announcements page
show no picture: they print `<img src="…/announcements/?" alt="">`,
which answers 404. In step 8 "Image" shows no preview and an empty
"Alternate text". Step 9 is refused with the same message and answer,
yet after step 10 the row reads "hkq27c Spring notice (edited)". Step 11
saves and the page has no picture, but step 12 still opens the PNG
(200, `image/png`).

Another manager's save, after steps 1 to 7:

1. Sign out, and sign in as `admin` (a Journal Manager in the dataset).
2. "Announcements", "Edit" on the row, change the Title to `hkq27c
   Spring notice (admin)`, press "Save".

**Expected:** "Save" goes through.

**Observed:** the panel stays open with "An unexpected error has
occurred. Please reload the page and try again.", and the new title is
stored all the same. The request answers 500, and the server log has:

```
production.ERROR: PKP\announcement\Announcement::getImageFilename(): Argument #1 ($temporaryFile) must be of type PKP\file\TemporaryFile, null given, called in …/lib/pkp/classes/announcement/Announcement.php on line 335
```

## Cause

`Announcement::save()` in pkp-lib
(`classes/announcement/Announcement.php`) writes the announcement first
and checks the new picture afterwards:

```php
$newlyCreated = !$this->exists;
$saved = parent::save($options);
…
if ($hasNewImage) {
    $this->deleteImage();
    $this->handleImageUpload();
}
```

`parent::save()` stores every field of the request, the picture's
included. For a new picture that field is the upload's temporary
reference, `{"temporaryFileId":N}`, not a stored picture. Only then does
`handleImageUpload()` run `FileManager::isValidImage()` on the
temporary file, and when it fails it throws
`StoreTemporaryFileException`. `PKPAnnouncementController::edit()`
catches it and answers 400, but the write is already done: the edit's
title and dates, and the temporary reference in place of the stored
picture. This order is as old as announcement pictures; it shows since
`pkp/pkp-lib#13512` removed the controller's delete of the whole
announcement on that refusal.

Everything after follows from that stored reference:

- The pages build the picture's address from its `uploadName`, which
  the reference lacks, hence `…/announcements/?`.
- The edit panel sends the reference back with every later "Save".
  `handleImageUpload()` looks the temporary file up for the user who
  saves (`TemporaryFileManager::getFile()`). For the manager who
  uploaded it the check refuses it again. For anyone else the lookup
  returns null, and `getImageFilename(null)` throws the `TypeError`
  above.
- "Remove" then "Save" clears the setting, but `deleteImage()` finds
  the file through the stored setting, which no longer names it, so the
  file stays.

Reach (each item says whether it was walked in the browser or read in
the code):

- "Edit Announcement" on a journal's, press's or server's announcements
  (walked), and on the site's, which uses the same model (code).
- The same request from a program, `PUT /api/v1/announcements/{id}`,
  takes the same path (code).
- "Add Announcement" with a refused picture writes the row, raises the
  `Announcement::add` hook, and then `PKPAnnouncementController::add()`
  deletes the row again, so nothing stays (walked).
- Highlights do the same in `PKP\highlight\Repository::edit()`: the row
  is updated, and the old picture's file deleted, before the check
  (code). That is spec U11's
  [A11](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U11-highlights.md#a11),
  a finding of its own, left to its own fix.
- The journal's and the site's settings images and a publication's
  cover image are checked and copied before the row is written
  (`PKPContextService::edit()`, `PKPSiteService::edit()`,
  `PKP\publication\Repository::edit()`), so a refused file leaves the
  stored image as it was (code).
- A separate matter in the same method: when the check passes but the
  copy into the public files folder fails, `handleImageUpload()` calls
  `$this->delete()`, which on an edit deletes the whole announcement
  after the edit was written (code). The fix below leaves that branch as
  it is.

## Proposed fix

Check a new picture in `PKP\announcement\Repository::validate()`, which
`PKPAnnouncementController::add()` and `edit()` both call before
`Announcement::create()` or `update()`. Resolve the temporary file there
for the current user, and refuse a missing file or one that is not an
image the announcement can store with the field error "There was an
error uploading this image."
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/refused-picture-edit-breaks-announcement-picture/fix.diff)):

```diff
 use PKP\context\Context;
+use PKP\file\TemporaryFileManager;
 use PKP\plugins\Hook;
…
         ValidatorFactory::allowedLocales($validator, $this->schemaService->getMultilingualProps($schema), $allowedLocales);
 
+        // A new image must be the current user's upload and an image the announcement
+        // can store; check it here, before Announcement::save() writes anything
+        $validator->after(function ($validator) use ($props) {
+            $temporaryFileId = $props['image']['temporaryFileId'] ?? null;
+            if (!$temporaryFileId || $validator->errors()->get('image')) {
+                return;
+            }
+            $temporaryFileManager = new TemporaryFileManager();
+            $temporaryFile = $temporaryFileManager->getFile((int) $temporaryFileId, $this->request->getUser()?->getId());
+            if (!$temporaryFile || !$temporaryFileManager->isValidImage($temporaryFile)) {
+                $validator->errors()->add('image', __('api.400.errorUploadingImage'));
+            }
+        });
+
         $errors = [];
```

- The closest example is `PKP\publication\Repository::validate()`,
  which adds `api.400.errorUploadingImage` to `coverImage` from a
  `$validator->after()` rule (since 7269eaf6f0, `pkp/pkp-lib#13561`).
  The context and site services and the highlight repository also check
  in their `validate()` that an upload exists for the user of the
  request (`ValidatorFactory::temporaryFilesExist()`).
- The repository already holds the request (`$this->request`), so
  `Announcement` gains no request or user lookup, and `save()` stays the
  writer, unchanged.
- The controller answers a validation error with its existing 400
  (`{"image":["There was an error uploading this image."]}`), the same
  body the panel shows today under "Image".
- A refused edit then stores nothing: not the reference, and not the
  title or dates of the same edit, which matches the form's "The form
  was not saved".
- A refused add is refused before the row is inserted, so the
  `Announcement::add` hook no longer fires for an announcement that is
  then deleted.
- A second manager's save of an announcement already left with a
  reference finds no temporary file for that manager, and is refused
  with the same 400 instead of the `TypeError`.
- `handleImageUpload()` keeps its own check and its
  `Application::get()->getRequest()->getUser()` read. Taking the read
  out would mean passing a user into `save()`, whose signature is
  Eloquent's (reached through `create()` and `update()`), or looking the
  file up by id alone and leaving its owner check to `validate()`, so
  that a caller who skips `validate()` would attach any user's upload.
  Either is a design change that goes beyond this fault. The read was
  there before this fault, so the fix leaves it.

Tried on `main` in all three apps: both groups of Steps then showed
their Expected. On an announcement broken before the fix was applied,
another manager's save was refused with "There was an error uploading
this image." (400, no server error) and stored nothing, and that
manager's "Remove" then "Save" still cleared the picture. As a neighbour
check, with the fix in and out: a GIF replacing the picture saved and
showed, a title-only edit kept the picture, "Add Announcement" with
`renamed.jpg` was refused and added nothing, and "Restore Original" then
"Save" after a refused save put the picture back.

**Alternatives:**

- Check the picture in `Announcement::save()` before `parent::save()`.
  It covers callers who skip
  `validate()`, but adds a request and user lookup to the model; the
  repository's validation is where pkp-lib checks an upload before the
  write.
- `ValidatorFactory::temporaryFilesExist()` for the missing file, as
  the context and site services and the highlight repository use. Its
  error reads "The file you uploaded could not be found. Please try to
  upload it again.", which is odd for a manager who uploaded nothing.
  The proposed rule gives one message for both cases.
- Wrap `$announcement->update($params)` in a database transaction in
  `PKPAnnouncementController::edit()`, or restore the stored picture in
  its catch. Both would undo the write for this one caller only.
  Restoring the picture in the catch would also leave the rest of the
  refused edit stored.

**What goes with it:**

- A caller that writes an announcement without `validate()` (a plugin,
  a script) still meets the old order: `handleImageUpload()`'s check
  runs after the write. pkp-lib leaves validation to its callers in the
  same way for every repository.
- An e2e guard in U12 (a Planned item there): an edit whose new picture
  is refused keeps the announcement's picture on its page, and a later
  title-only "Save" goes through. Or a unit test of `validate()` with an
  invalid, a missing and another user's temporary image.
- Announcements already left with a reference stay without a picture
  until a manager presses "Remove" then "Save"; with the fix, other
  saves of them are refused with the 400 instead of failing. Their old
  file stays behind. No repair is proposed: the stored data no longer
  names the file to restore.
- The fix for the picture files left behind by deletes and replacements
  ([pkp-e2e#771](https://github.com/jardakotesovec/pkp-e2e/issues/771))
  changes `Announcement::save()`, which this fix leaves alone: the two
  apply independently. With both in, a refused picture touches neither
  the stored setting nor the old file.
- 3.5 takes the diff as written.

Small: one validation rule in one class, following the publication
repository's pattern, with a test.

## Evidence

- Kept scripts, beside the pictures and their helpers (`lib.js`) in
  [refused-picture-edit-breaks-announcement-picture/](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/refused-picture-edit-breaks-announcement-picture/),
  each run on an install freshly loaded with the default dataset.
  `walk.js` takes Steps 1 to 12; it reads the announcement's stored
  `image` setting from the database, lists the public files folder after
  each step and records the server log lines each step causes.
  `MODE=neighbour` runs the neighbour check (a GIF replacement, a
  title-only edit, a refused "Add Announcement", "Restore Original" then
  "Save" after a refused save). `reach.js` takes the second group of
  Steps, then "Remove" and "Save" as `admin`; `PART=break` stops after
  step 7 and `PART=other` starts at `admin`'s sign-in, which is how the
  fix was tried on an announcement broken without it. Run with
  `node bin/probe.js all shared/playwright/checks/issues/refused-picture-edit-breaks-announcement-picture/<script>`;
  the fix applied with `node bin/try-fix.js apply <fix.diff> ojs omp ops`.
- 2026-10-27, on PostgreSQL with pkp/datasets accd72de (2026-10-26):
  the Steps walked on `main` and `stable-3_5_0`, OJS, OMP and OPS; the
  second group on `main` (OJS, OMP, OPS) and OJS `stable-3_5_0`, where
  the `TypeError` names line 336 (the 3.5 file has one more `use`
  line). The fix (the `validate()` version) tried on `main` in all
  three apps: walk.js, reach.js (whole, and `PART=other` on an
  announcement broken before the apply), and `MODE=neighbour` with the
  fix in and out. Without the fix a
  refused "Add Announcement" also logs `PHP Warning: Attempt to read
  property "image" on null in …/Announcement.php on line 301` (the
  delete's warning, pkp-e2e#771); with it, nothing.
- Tips (2026-10-27): `main` OJS 5153465178, OMP ceae6e275f and OPS
  66a3bb98a5 (lib/pkp c27153abdd); `stable-3_5_0` OJS a9e01889b0, OMP
  3c8c7c4964 (lib/pkp 3fd17879b3) and OPS 07926c35b4 (lib/pkp
  9a0212faff). On 3.5, `save()`, `handleImageUpload()` and the
  controller's `edit()` read the same as on `main`.
- Releases: `git tag --contains` lists no tag for 07bc43fe67 (`main`)
  nor for its 3.5 commit 092ec34b0f (2026-10-14). The newest 3.5 tag,
  `3_5_0-5` (lib/pkp 8b5f0fdc8d, 2026-06-30), has the controller's
  `$announcement->delete()` in `edit()`'s catch.
- 3.4 (code): lib/pkp `stable-3_4_0` 3a26bb98d6. Its
  `PKP\announcement\Repository::edit()` updates the row, deletes the old
  file and then checks the new one, and `PKPAnnouncementHandler::edit()`
  answers the refusal with `Repo::announcement()->delete($announcement)`.
- 3.3 (code): lib/pkp `stable-3_3_0` f80a52ed4d; its
  `schemas/announcement.json` has no image.
- Introduced: `git blame` on `save()`'s `parent::save()` gives
  c9cda06979 (`pkp/pkp-lib#10328`, 2024-09-02), which moved the
  repository's code into the model with the same order. At b0be24e79b
  `Repository::edit()` ran `$this->dao->update()` before
  `handleImageUpload()`'s `isValidImage()`. 07bc43fe67 was committed
  without a PR.
- Upstream: searched pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops and
  pkp/ui-library by symptom words ("announcement image", "error
  uploading", "broken image") and by `temporaryFileId`,
  `handleImageUpload` and `errorUploadingImage`.
  `pkp/pkp-lib#12744` (open) is about ".jpeg" names being refused, not
  what a refusal leaves stored; `pkp/pkp-lib#10668` (closed) about a
  picture not saved on an add.
- Not driven: the site's announcements, the REST API by a program and
  the failed-copy branch (code). Unverified: `TemporaryFileManager::_performPeriodicCleanup()`
  deletes expired temporary files, after which the reference's own
  manager would also meet the `TypeError` (code).
