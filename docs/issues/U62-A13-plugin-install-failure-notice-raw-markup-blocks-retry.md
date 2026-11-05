# Plugins: a failed plugin installation's notice shows raw markup and database details, and the same package then fails with "already exists"

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OPS
  - 3.5: OJS, OPS
  - 3.4: OJS, OPS (code)
  - 3.3: OJS, OPS (code; the notice names the class only)
- **Introduced** not traced to one change; present since plugin migrations arrived, `pkp/pkp-lib#5861` for `pkp/pkp-lib#2493` · [c7e640593a](https://github.com/pkp/pkp-lib/commit/c7e640593a7eb513904949d86e68859f3bcb0e18) · 2020-05-12 · Alec Smecher (asmecher); the database's message joined the notice with `pkp/pkp-lib#6922` for `pkp/pkp-lib#6921` · [d8836e5dc2](https://github.com/pkp/pkp-lib/commit/d8836e5dc2c0f6ed37560c372b8dcd6a40c0702f) · 2021-04-07 · Nate Wright (NateWr)
- **Upstream** none found (2026-11-05)
- **Tracked in** spec U62 [A13](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U62-plugins-management.md#a13)
- **Checked** 2026-11-05, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A plugin can carry an install migration that creates its database
tables. When that migration fails during "Upload A New Plugin" and the
failure is reported, the error notice reads "Installation failed. DB:
An exception was thrown when executing the migration class
`<tt>`…`</tt>`. The exception was …". The tags `<tt>` and `</tt>` show
as text around the plugin's internal class name. The rest is the
database driver's own message, with the database host, the database
name and the statement that failed. Only the Site Administrator can
upload plugins, so only they see it.

The plugin's files are removed, but the tables its migration created
before failing stay. Uploading the same package again then fails with
"… already exists". It keeps failing, even with a corrected release of
the plugin, until someone with access to the database drops those
tables.

Today only a failing theme on a journal or a preprint server is
reported; every other failed installation, OMP's themes included, is
reported as a success
([U62-A12](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U62-A12-plugin-install-step-fails-reported-installed.md)).
OMP has the same code, so once that report is fixed every failed
installation on all three apps meets this notice and this dead end.
The fix proposed here clears the notice's markup and connection
details, and removes the leftover tables on PostgreSQL, not on MySQL.

## Impact

- **Lost**: the chance to install the plugin again until the leftover
  tables are dropped by hand. The leftover tables affect nothing else:
  no other plugin or later application upgrade reads them.
- **Who**: Site Administrators installing a theme whose install
  migration fails, on a journal or a preprint server. That takes a
  broken release, or one written for another database engine or
  application version, so it is rare.
- **Way round**: none on screen. Someone with database access can drop
  the table that the second attempt's notice names ("… already
  exists").

Low: rarely met, and the installation it blocks could not have worked
without a corrected release. It becomes medium once failed
installations of every plugin reach this notice (the fix of
[U62-A12](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U62-A12-plugin-install-step-fails-reported-installed.md)).

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS or OPS).
- A package of a small theme on the computer,
  `hkq05bt-1.0.0.0.tar.gz`, holding a folder `hkq05bt/` with:
  - `version.xml`: `<application>hkq05bt</application>`,
    `<type>plugins.themes</type>`, `<release>1.0.0.0</release>`,
    `<lazy-load>1</lazy-load>`, `<class>Hkq05btPlugin</class>`;
  - `Hkq05btPlugin.php`: class
    `APP\plugins\themes\hkq05bt\Hkq05btPlugin`, extending
    `PKP\plugins\ThemePlugin`, with an empty `init()`,
    `getDisplayName()` returning "hkq05b Half-Install Theme",
    `getDescription()` returning any text (it is abstract in `Plugin`)
    and `getInstallMigration()` returning
    `new Hkq05btPluginInstallMigration()`; the file requires the
    migration's file;
  - `Hkq05btPluginInstallMigration.php`: class
    `APP\plugins\themes\hkq05bt\Hkq05btPluginInstallMigration`,
    extending `Illuminate\Database\Migrations\Migration`, whose `up()`
    creates a table, then writes to one that does not exist, so it
    fails partway (`down()` drops `hkq05bt_items`):

    ```php
    public function up(): void
    {
        Schema::create('hkq05bt_items', function (Blueprint $table) {
            $table->bigIncrements('id');
        });
        DB::statement('INSERT INTO hkq05bt_missing (id) VALUES (1)');
    }
    ```
  - `index.php`: `return new \APP\plugins\themes\hkq05bt\Hkq05btPlugin();`
    after requiring the class file;
  - no `filter/filterConfig.xml`: a theme carrying one is reported
    installed, since that file's installation resets the failed result
    to success (U62-A12's mechanism).

  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/plugin-install-failure-notice-raw-markup-blocks-retry/lib.js)
  builds it.

Steps:

1. Sign in as `admin`.
2. Open Settings › Website
   (`/index.php/publicknowledge/management/settings/website`) and its
   "Plugins" tab.
3. Press "Upload A New Plugin", press "Upload File", choose
   `hkq05bt-1.0.0.0.tar.gz` and press "Save".
4. In the application's database (PostgreSQL; on MySQL, read
   `information_schema.tables`): `SELECT to_regclass('hkq05bt_items');`
5. Press "Upload A New Plugin", press "Upload File", choose the same
   file and press "Save".

**Expected**: step 3 says in a plain sentence that the theme's install
migration failed, with the database's reason and no markup. Step 4
finds no table: a failed installation leaves nothing behind. Step 5
fails for the same reason as step 3.

**Observed**: at step 3 the window closes and an error notice shows
(OJS; on OPS only the database name differs):

```
Installation failed. DB: An exception was thrown when executing the migration class <tt>APP\plugins\themes\hkq05bt\Hkq05btPluginInstallMigration</tt>. The exception was SQLSTATE[42P01]: Undefined table: 7 ERROR: relation "hkq05bt_missing" does not exist LINE 1: INSERT INTO hkq05bt_missing (id) VALUES (1) ^ (Connection: pgsql, Host: 127.0.0.1, Port: , Database: ojs_test_ds4, SQL: INSERT INTO hkq05bt_missing (id) VALUES (1)).
```

The theme is not listed, its folder `plugins/themes/hkq05bt` is gone
and no `versions` row was written. Step 4 gives `hkq05bt_items`.
Step 5 shows:

```
Installation failed. DB: An exception was thrown when executing the migration class <tt>APP\plugins\themes\hkq05bt\Hkq05btPluginInstallMigration</tt>. The exception was SQLSTATE[42P07]: Duplicate table: 7 ERROR: relation "hkq05bt_items" already exists (Connection: pgsql, Host: 127.0.0.1, Port: , Database: ojs_test_ds4, SQL: create table "hkq05bt_items" ("id" bigserial not null primary key)).
```

Nothing reaches the server's log at either step.

## Cause

`Plugin::register()` (`lib/pkp/classes/plugins/Plugin.php`, line 121)
hooks every registered plugin's `updateSchema()` onto
`Installer::postInstall`, and the installer's constructor registers
every plugin on the server. So one upload runs every plugin's install
migration, not only the uploaded one's. `updateSchema()` runs each
with a bare `$migration->up()` and, on an exception, calls
`$installer->setError()` with
`__('installer.installMigrationError', ['class' => get_class($migration), 'message' => $e->getMessage()])`.
Each failure overwrites the previous one, so the notice names the last
plugin that failed. Theme plugins register last on OJS and OPS, so a
failing theme's message is the one left, and no later
`installFilters()` resets the result to success (U62-A12). On OJS,
Static Pages' migration fails on every upload as well (its tables
exist), and its error is overwritten by the theme's.

`PluginHelper::installPlugin()` puts the error into
"manager.plugins.installFailed" ("Installation failed. {$errorString}"),
removes the plugin's folder and throws; `UploadPluginForm::execute()`
shows the message as an error notice. Three things go wrong on that
path:

- The text carries markup. `installer.installMigrationError` reads
  "An exception was thrown when executing the migration class
  `<tt>{$class}</tt>`. The exception was {$message}."
  (`lib/pkp/locale/en/installer.po`). The back office shows notices as
  text (`{{ notification.message }}` in
  `lib/pkp/templates/layouts/backend.tpl`), so the tags print.
- `$e->getMessage()` of a database error is Laravel's
  `QueryException` text: the driver's error, then
  `(Connection: …, Host: …, Port: …, Database: …, SQL: …)`
  (`QueryException::formatMessage()`). The notice gets all of it, and
  the server's log gets none of it.
- The migration runs outside a transaction. Laravel's own
  `Migrator::runMigration()` wraps each migration in one where the
  database can roll schema changes back (`supportsSchemaTransactions()`,
  true for PostgreSQL, unless the migration sets
  `$withinTransaction = false`); `updateSchema()` does not, so a
  migration that fails after its first `Schema::create()` leaves that
  table, and fails on it at every later attempt.

Reach:

- The Plugin Gallery's "Install" uses the same method (code).
- `installer.installParseEmailTemplatesFileError` and
  `installer.installParseFilterConfigFileError`, the errors of the
  other two install callbacks, carry `<tt>` the same way (code).
- A failed plugin upgrade's notice, "Upgrade failed. DB: …", comes from
  `Installer::executeAction()`'s migration branch, which sets
  `Config::getVar('debug', 'show_stacktrace') ? (string) $e : $e->getMessage()`:
  the same connection details, and the whole stack trace when
  `show_stacktrace` is on (seen in
  [U62-A5](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U62-A5-failed-upgrade-removes-plugin.md)).
  That branch backs out the earlier migrations through their `down()`
  but not the one that failed (code).
- The application's own installer page shows the same keys as HTML,
  where `<tt>` renders (code).

## Proposed fix

In `Plugin::updateSchema()`, run the migration in a transaction where
the database supports it, as Laravel's migrator does; give the notice
the database's own error without the connection and statement, and
send the whole exception to the server's log; and drop the tags from
the three English messages
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/plugin-install-failure-notice-raw-markup-blocks-retry/fix.diff),
`lib/pkp` only, which also adds the `use` lines for `QueryException`
and `Schema`):

```diff
             try {
-                $migration->up();
+                $connection = Schema::getConnection();
+                $connection->getSchemaGrammar()->supportsSchemaTransactions() && ($migration->withinTransaction ?? true)
+                    ? $connection->transaction(fn () => $migration->up())
+                    : $migration->up();
             } catch (Exception $e) {
-                $installer->setError(Installer::INSTALLER_ERROR_DB, __('installer.installMigrationError', ['class' => get_class($migration), 'message' => $e->getMessage()]));
+                error_log($e);
+                $message = $e instanceof QueryException && $e->getPrevious() ? $e->getPrevious()->getMessage() : $e->getMessage();
+                $installer->setError(Installer::INSTALLER_ERROR_DB, __('installer.installMigrationError', ['class' => get_class($migration), 'message' => $message]));
                 $result = false;
             }
```

and in `lib/pkp/locale/en/installer.po`, `<tt>{$class}</tt>` becomes
`{$class}` (and `<tt>{$file}</tt>` `{$file}` in the two parse errors).

Tried on `main` in OJS and OPS. Step 3 then shows the same notice
without the tags and without the bracketed connection details; step 4
finds no table; step 5 fails for the same reason as step 3; and the
server's log holds the whole exception. A control plugin whose
migration succeeds still installs and keeps the table and row its
migration made, so the transaction commits as before.

**Order with U62-A12**: land the two together, or this one first.
U62-A12's fix makes an upload run only the uploaded plugin's
migration, so the notice then always names that plugin's failure. On
its own, U62-A12's fix sends every failed installation to this notice
and this dead end. This fix on its own changes nothing in which plugin
the notice names, but logs Static Pages' failing migration on every
upload on OJS and OMP until U62-A12's fix lands (seen in the trial on
OJS: `relation "static_pages" already exists`).

**Alternatives**:

- Call the failed migration's `down()`: it also works on MySQL, but a
  migration that failed because its tables were already there (one run
  again, U62-A12) would drop a working plugin's tables and data. A
  transaction undoes only what the failed run did.
- A generic "the plugin's install migration failed" with the details
  only in the log: the Site Administrator installing plugins is the
  person who needs the database's reason, and the application's
  installer already shows it.
- Strip tags where the notice is built: hides the symptom for this one
  form and leaves the keys wrong elsewhere.

**What goes with it**:

- MySQL commits schema changes at once, so there the transaction does
  not help and a migration must check `Schema::hasTable()` itself;
  worth a line in the plugin documentation.
- 42 other locales' copies of `installer.installMigrationError` carry
  the same tags; they follow through the translation platform.
- The same message change in `Installer::executeAction()` would clear
  the connection details and the stack trace from "Upgrade failed."
  too; left out here, since that path was not walked.
- `fix.diff` applies to 3.5 and 3.4 with line offsets. 3.4's Laravel 9
  message has the statement but no server details; 3.3's notice names
  only the class ("Error executing the migration class
  `<tt>{$class}</tt>`."), so there only the transaction and the tags
  apply, in `Plugin.inc.php`.
- A test: install a plugin whose migration fails partway, then the
  same package again, and check the second notice names the first
  failure.

## Evidence

- Kept script:
  `shared/playwright/checks/issues/plugin-install-failure-notice-raw-markup-blocks-retry/walk.js`
  with `lib.js` beside it (the package builder, a copy of the U62 A12
  walk's). Run on a dataset fleet reset first
  (`npm run fleet-prep -- --feature issues-q05b --dataset 4 --reset`):
  `bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-q05b PROBE_AGENT=q05b node bin/probe.js ojs shared/playwright/checks/issues/plugin-install-failure-notice-raw-markup-blocks-retry/walk.js`
  (`ops` the same; `neighbour` as the last argument runs the control
  plugin; 3.5 with `PKP_E2E_LINE=stable-3_5_0` in front).
- Walked on PostgreSQL, PKP's default dataset (pkp/datasets
  `7421d2a8`, 2026-11-04):
  - `main`: OJS `9552aa521a`, OMP `828150a8fe`, OPS `0acd73102d`;
    lib/pkp `25fdc98a3e` (OJS, OPS), `1ae711024a` (OMP). Observed as
    written on OJS and OPS; on OMP the theme was reported installed
    (U62 A12).
  - `stable-3_5_0`: OJS `e725cc873a`, OPS `82faa21834` (lib/pkp
    `e2c62c4b7b`), OMP `e81eefc11c` (lib/pkp `c4c0aa8c52`). The same
    as `main` on all three.
- Fix trial on `main`, OJS and OPS (`node bin/try-fix.js apply … ojs ops`),
  the walk and the control plugin with the fix, the control again after
  the revert. After the trial the diff's `use` lines were moved next to
  `use PKP\install\Installer;` so that the hunk applies on 3.5 (its
  `Plugin.php` lacks the imports the first anchor needed); the code is
  otherwise unchanged. `patch --dry-run` applies it to OJS, OMP and OPS
  on `main` and 3.5, and to lib/pkp `origin/stable-3_4_0`.
- Code reads:
  - Who sees the notice: `PluginGridHandler::__construct()` grants
    `uploadPlugin`, `saveUploadPlugin` and the other upload operations
    to `ROLE_ID_SITE_ADMIN` only.
  - The 50 locales holding `installer.installMigrationError` (43 with
    `<tt>`, en included; 7 empty); `SiteHandler::showNotification_()`;
    Laravel's `Grammar::supportsSchemaTransactions()` and
    `PostgresGrammar` (`$transactions = true`).
  - 3.4: lib/pkp `origin/stable-3_4_0` `2dd24cc5ae`: `Plugin.php`
    722–724 (the same bare `up()` and message), the same key with
    `<tt>`, `backend.tpl`'s `{{ notification.message }}`, Laravel
    `v9.52.18`; the apps' `upstream/stable-3_4_0` put themes last among
    OJS's and OPS's plugin categories.
  - 3.3: lib/pkp `origin/stable-3_3_0` `df738d3a66`: `Plugin.inc.php`
    708–712 (bare `up()`, the message without the exception's text),
    `locale/en_US/installer.po` "Error executing the migration class
    `<tt>{$class}</tt>`.", the same `backend.tpl`, Laravel `v7.30.4`;
    `PluginHelper.inc.php` 129–132 removes the folder on failure.
- Upstream search (2026-11-05): pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops
  and pkp/ui-library, by the symptom's words and by
  `installMigrationError`, `updateSchema`, "already exists". Read:
  `pkp/pkp-lib#6920` (2021, closed), where a migration's "already
  exists" during an application install led to `pkp/pkp-lib#6921`
  showing the exception in the message; not this fault.
- MySQL not checked.
