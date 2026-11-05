# Plugins: a plugin whose own database step fails is reported "Successfully installed" and kept as installed

- **Severity** medium
- **Effort** medium
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** not traced to one change. `Plugin::installFilters()` has overwritten the installation's result since [78ca0ce930](https://github.com/pkp/pkp-lib/commit/78ca0ce93012565a708aab5e26835a9e1a53d0be) (2010-10-13, jerico.dev, no PR). An installed plugin's install migration that runs again throws, where the ADOdb schema it replaced did not, since `pkp/pkp-lib#5861` for `pkp/pkp-lib#2493` · [c7e640593a](https://github.com/pkp/pkp-lib/commit/c7e640593a7eb513904949d86e68859f3bcb0e18) · 2020-05-12 · Alec Smecher (asmecher)
- **Upstream** none found (2026-11-05)
- **Tracked in** spec U62 [A12](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U62-plugins-management.md#a12)
- **Checked** 2026-11-05, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A plugin can carry an install migration that creates its database
tables. When the Site Administrator installs such a plugin with
"Upload A New Plugin" (or the Plugin Gallery's "Install") and the
migration fails partway, the notice still reads "Successfully
installed version 1.0.0.0". The plugin is listed and recorded as
installed, and the tables the migration created before failing stay.
Nothing reaches the server's log, so nobody learns the plugin is half
set up until it fails in use.

This holds for generic plugins and themes on a press, and for most
other plugin types. A failing plugin of a type the application loads
after its import/export plugins (themes, report and payment plugins on
a journal or a preprint server) is reported as failed instead; that
notice has faults of its own
([U62-A13](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U62-A13-plugin-install-failure-notice-raw-markup-blocks-retry.md)).

Each installation also runs the install migration of every plugin
already installed, and hides their failures the same way. With the
plugins that ship with the applications this does no harm today:
"Static Pages Plugin" fails at its first statement and writes nothing.
A plugin whose migration adds rows would add them again on every
installation of another plugin.

The fix has two parts: an installation runs only the installed
plugin's own steps, and a failed step makes it fail.

## Impact

- **Lost**: a working plugin. The administrator believes it is
  installed while its tables are incomplete. "Delete" and installing
  again does not repair it: "Delete" leaves the tables, and the second
  installation's migration fails on them and is again reported as a
  success.
- **Who**: Site Administrators installing a plugin with an install
  migration. It fails only for a broken release, or one whose SQL the
  site's database engine or version rejects; no released plugin is
  known to fail this way. The re-runs happen on every installation.
- **Way round**: none on screen. Someone with access to the database
  can compare the plugin's tables with its code.

Medium: a rarely met failure, but a silent one, reported as success. A
released plugin that fails on a common database, or one whose
migration adds rows each time it runs, would raise the severity.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS, OMP or OPS).
- Two packages of small generic plugins on the computer, as `.tar.gz`
  files, each holding a folder named after the plugin (`hkq05bc`,
  `hkq05bf`) with:
  - `version.xml`: `<application>` the folder's name,
    `<type>plugins.generic</type>`, `<release>1.0.0.0</release>`,
    `<lazy-load>1</lazy-load>`, `<class>` the plugin class's name;
  - `Hkq05bcPlugin.php` (`Hkq05bfPlugin.php`): class
    `APP\plugins\generic\hkq05bc\Hkq05bcPlugin`, extending
    `PKP\plugins\GenericPlugin`, with `getDisplayName()` returning the
    name given below, `getDescription()` returning any text (it is
    abstract in `Plugin`) and `getInstallMigration()` returning
    `new Hkq05bcPluginInstallMigration()`; the file requires the
    migration's file;
  - `Hkq05bcPluginInstallMigration.php`: class
    `APP\plugins\generic\hkq05bc\Hkq05bcPluginInstallMigration`,
    extending `Illuminate\Database\Migrations\Migration`, using the
    facades `Illuminate\Support\Facades\Schema` and
    `Illuminate\Support\Facades\DB` and
    `Illuminate\Database\Schema\Blueprint`, with the `up()` below and a
    `down()` that drops the plugin's table;
  - `index.php`: `return new \APP\plugins\generic\hkq05bc\Hkq05bcPlugin();`
    after requiring the class file.

  The two plugins:
  - `hkq05bc-1.0.0.0.tar.gz`, "hkq05b Counter Plugin": its migration
    adds a row to its own table each time it runs, so the row count
    says how often it ran:

    ```php
    public function up(): void
    {
        if (!Schema::hasTable('hkq05bc_runs')) {
            Schema::create('hkq05bc_runs', function (Blueprint $table) {
                $table->bigIncrements('id');
            });
        }
        DB::table('hkq05bc_runs')->insert(['id' => DB::table('hkq05bc_runs')->count() + 1]);
    }
    ```
  - `hkq05bf-1.0.0.0.tar.gz`, "hkq05b Half-Install Plugin" (the same
    files with `hkq05bf` and `Hkq05bf`): its migration creates a
    table, then writes to one that does not exist, so it fails partway:

    ```php
    public function up(): void
    {
        Schema::create('hkq05bf_items', function (Blueprint $table) {
            $table->bigIncrements('id');
        });
        DB::statement('INSERT INTO hkq05bf_missing (id) VALUES (1)');
    }
    ```

  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/plugin-install-step-fails-reported-installed/lib.js)
  builds both.

Steps:

1. Sign in as `admin`.
2. Open Settings › Website
   (`/index.php/publicknowledge/management/settings/website`) and its
   "Plugins" tab.
3. Press "Upload A New Plugin", press "Upload File", choose
   `hkq05bc-1.0.0.0.tar.gz` and press "Save". The notice reads
   "Successfully installed version 1.0.0.0".
4. In the application's database, count the counter's rows:
   `SELECT count(*) FROM hkq05bc_runs;` gives 1.
5. Press "Upload A New Plugin", press "Upload File", choose
   `hkq05bf-1.0.0.0.tar.gz` and press "Save".
6. Reload the page and open "Plugins" again.
7. In the database (PostgreSQL or MySQL):

   ```sql
   SELECT major, minor, revision, build, current FROM versions WHERE product = 'hkq05bf';
   SELECT table_name FROM information_schema.tables WHERE table_name = 'hkq05bf_items';
   SELECT count(*) FROM hkq05bc_runs;
   ```

**Expected**: step 5 shows "Installation failed." with the reason, and
"hkq05b Half-Install Plugin" is not listed at step 5 or after the
reload. Step 7 finds no `versions` row for `hkq05bf`, no
`hkq05bf_items` table (removing it is
[U62-A13](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U62-A13-plugin-install-failure-notice-raw-markup-blocks-retry.md)'s
part), and the counter still at 1: installing one plugin runs that
plugin's migration only.

**Observed**: step 5 closes the window with the green notice
"Successfully installed version 1.0.0.0", and "hkq05b Half-Install
Plugin" is listed unticked under "Generic Plugins", also after the
reload at step 6. The save's answer is `{"status":true,…}` and the
server's log stays empty. Step 7 gives:

```
 major | minor | revision | build | current
-------+-------+----------+-------+---------
     1 |     0 |        0 |     0 |       1

  table_name
---------------
 hkq05bf_items

 count
-------
     2
```

## Cause

`PluginHelper::installPlugin()` (`lib/pkp/classes/plugins/PluginHelper.php`)
copies the package into `plugins/<category>/<name>` and runs an
`Install` installer with the plugin's own `install.xml` or the default
`lib/pkp/xml/defaultPluginInstall.xml`. Its result decides between the
two notices:
`$installer->execute() || throw new Exception(__('manager.plugins.installFailed', …))`.

A plugin's own steps run at the end of `execute()`, in
`Installer::postInstall()` (`lib/pkp/classes/install/Installer.php`),
which fires the hook `Installer::postInstall` with one shared
`$result`. `Plugin::register()` puts the callbacks on it: every plugin
adds `installFilters()`; a plugin with an install migration also adds
`updateSchema()`, one with a site settings file `installSiteSettings()`,
one with an email templates file `installEmailTemplates()`. The
installer's constructor calls `PluginRegistry::loadAllPlugins()`, so
every plugin on the server is registered, and each registered plugin's
callbacks run, for whichever plugin is being installed. That is right
for the application's own installer, which installs all bundled
plugins at once, and wrong for a single plugin's installation.

Two faults follow:

- `Plugin::updateSchema()` catches a failing migration, records the
  error and sets `$result` to false. `Plugin::installFilters()` then
  sets `$result = $installer->installFilterConfig($filterConfigFile)`
  for each filter configuration it finds, which is true for a valid
  one. So any plugin with a `filter/filterConfig.xml` whose callback
  runs later turns the failure back into success. The callbacks run in
  the order the plugins registered, by category in
  `Application::getPluginCategories()`. Filter configurations sit in
  the metadata plugin "Dublin Core 1.1", the import/export plugins and
  the generic Crossref, DataCite and DOAJ plugins. A failing plugin of
  a category after "importexport" therefore reaches the screen as a
  failure: "oaiMetadataFormats", "paymethod", "pubIds", "reports" and
  "themes" on OJS and OPS, "oaiMetadataFormats", "paymethod" and
  "reports" on OMP, where "themes" comes before "importexport". Only the
  generic plugin and the theme were walked.
- Every installed plugin's `updateSchema()` runs its install migration
  again. A migration written with `Schema::create()` and no
  `Schema::hasTable()` check throws "already exists", which the same
  overwrite hides. `StaticPagesSchemaMigration::up()` (OJS, OMP) is
  one; it throws at its first `Schema::create()`, so it changes
  nothing. Citation Style Language's `DeleteUserGroupSettings` deletes
  four obsolete settings again; `ManualPaymentPlugin` (OJS, OMP) hooks
  its own `updateSchema()`, whose migration does nothing outside an
  upgrade of the application from before 3.4. None of the bundled
  migrations adds rows when run again.

The overwrite came with
[78ca0ce930](https://github.com/pkp/pkp-lib/commit/78ca0ce93012565a708aab5e26835a9e1a53d0be)
(2010), which replaced "set false and stop on an invalid filter
configuration" with an assignment. The re-runs were harmless while
plugins described their tables in ADOdb XML schemas, which change only
what differs; plugin migrations
([c7e640593a](https://github.com/pkp/pkp-lib/commit/c7e640593a7eb513904949d86e68859f3bcb0e18),
2020) made a repeated migration throw instead.

Reach:

- "Upload A New Plugin" on Administration › Site Settings' "Plugins"
  opens the same form, and the Plugin Gallery's "Install"
  (`PluginGalleryGridHandler::installPlugin()`) calls the same
  `PluginHelper::installPlugin()` (code).
- A row's "Upgrade" with a package that carries an `upgrade.xml`:
  `PluginHelper::upgradePlugin()` then runs an `Upgrade` installer,
  which fires the same hook, so every plugin's install migration runs
  again, the upgraded plugin's own included (walked), with the same
  overwrite (code). Without an `upgrade.xml` no installer runs.
- The application's installer and `tools/upgrade.php` run the same
  callbacks on purpose. Bundled plugins rely on it: Citation Style
  Language's install migration is a cleanup meant to run at each
  application upgrade. Static Pages' migration throws at every
  application upgrade too, hidden by the same overwrite: read from the
  code on OMP, and seen on OJS when the overwrite is removed (the first
  alternative below).
- `lib/pkp/tools/installPluginVersion.php` calls one plugin's
  callbacks directly, with the same overwrite in `installFilters()`
  (code).

## Proposed fix

A plugin's installation should run only that plugin's own steps, and
fail when one of them fails. The fix tells the installer which plugin
it installs, lets each of `Plugin`'s install callbacks skip other
plugins, and has `PluginHelper::installPlugin()` treat a recorded error
as a failure
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/plugin-install-step-fails-reported-installed/fix.diff),
`lib/pkp` only, the same for the three apps):

```diff
// Installer.php
+    public function setPluginToInstall(Version $version): void
+    {
+        $this->pluginToInstall = $version;
+    }
+
+    public function runsInstallStepsOf(Plugin $plugin): bool
+    {
+        return !$this->pluginToInstall
+            || ($this->pluginToInstall->getProductType() === 'plugins.' . $plugin->getCategory()
+                && $this->pluginToInstall->getProduct() === $plugin->getDirName());
+    }

// Plugin.php: at the top of updateSchema(), installSiteSettings(), installEmailTemplates(), installFilters()
+        if (!$args[0]->runsInstallStepsOf($this)) {
+            return false;
+        }

// PluginHelper.php, installPlugin()
                 $installer->setCurrentVersion($pluginVersion);
-                $installer->execute() || throw new Exception(__('manager.plugins.installFailed', ['errorString' => $installer->getErrorString()]));
+                $installer->setPluginToInstall($pluginVersion);
+                // A failed step records its error; a later callback of the same plugin (installFilters()) may still leave the result true
+                ($installer->execute() && !$installer->getErrorType()) || throw new Exception(__('manager.plugins.installFailed', ['errorString' => $installer->getErrorString()]));
```

An installer that names no plugin (the application's installer and
upgrade, `installPluginVersion.php`, a plugin upgrade) runs every
callback as before, so the bundled plugins that rely on that keep
working. A failed installation then takes the path a failing theme
takes today: "Installation failed. DB: …", the plugin's files removed,
nothing recorded. The tables the migration made before failing still
stay; [U62-A13](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U62-A13-plugin-install-failure-notice-raw-markup-blocks-retry.md)'s
fix removes them on PostgreSQL and cleans up the notice. Land the two
together, or U62-A13 first: with this fix alone, every failed
installation meets that notice and its retry dead end.

Tried on `main` in OJS, OMP and OPS. The Steps then show "Installation
failed. DB: …" at step 5, the plugin not listed, no `versions` row and
the counter still at 1. A failing generic plugin with its own filter
configuration, and a failing theme, fail the same way on all three
apps. Two checks show the fix reaches no further:

- A good plugin installed after the counter still reports
  "Successfully installed version 1.0.0.0" and makes its table; the
  counter stays at 1 (2 without the fix).
- The counter's "Upgrade" to a 1.0.1.0 with an `upgrade.xml` step
  reports "Successfully upgraded to version 1.0.1.0", runs that step
  and runs the counter's install migration again, with and without the
  fix alike.

The application's upgrade (`php tools/upgrade.php upgrade`, OJS, the
3.5 dataset to `main`) still ends "Successfully upgraded to version
3.6.0.0".

The guard sits inside `Plugin`'s methods, so a plugin that overrides
one without calling the parent, or hooks `Installer::postInstall`
itself, still runs on every installation. `ManualPaymentPlugin` (OJS,
OMP) does both for `updateSchema()`; it is harmless, since its
migration acts only on an application upgrade from before 3.4.
Third-party plugins that do the same need the check themselves
(`$args[0]->runsInstallStepsOf($this)`), which the plugin
documentation should name.

**Alternatives**:

- Fix only `installFilters()`, setting `$result = false` on a failure
  and otherwise leaving it alone (the pattern of
  `installEmailTemplates()`): on its own it turns Static Pages'
  repeated migration into a failure of every plugin installation and
  every application upgrade on OJS and OMP. Tried on OJS: the
  application's upgrade from the 3.5 dataset then stops with "Upgrade
  failed: DB: An exception was thrown when executing the migration
  class
  `<tt>APP\plugins\generic\staticPages\StaticPagesSchemaMigration</tt>`.
  The exception was SQLSTATE[42P07]: Duplicate table: 7 ERROR: relation
  "static_pages" already exists …"
  ([alt-installfilters.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/plugin-install-step-fails-reported-installed/alt-installfilters.diff)).
- Make every bundled install migration re-runnable (`hasTable()`
  checks): needed for Static Pages either way, but third-party plugins
  would keep failing other plugins' installations.
- Wrap each callback where `Plugin::register()` adds it, rather than
  guarding inside the methods: this would also cover overrides, but
  not plugins that add their own `Installer::postInstall` hooks; not
  tried.
- Scope the callbacks for plugin upgrades too: an upgrade runs the
  upgraded plugin's install migration again today, and some plugins
  may rely on that to add tables; which steps an upgrade should run is
  a decision for the team, so it is left out here.

**What goes with it**:

- Plugins already recorded as installed with incomplete tables stay as
  they are; nothing in the database tells them apart, so no repair is
  proposed.
- The `installFilters()` overwrite stays on the application's installer
  and upgrade, where it hides Static Pages' failing migration; a
  `hasTable()` check in `StaticPagesSchemaMigration::up()`
  (pkp/staticPages) would let it be fixed later.
- The fixes proposed for a failed upgrade
  ([U62-A5](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U62-A5-failed-upgrade-removes-plugin.md))
  and for an upgrade file's version ranges
  ([U62-A11](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/issues/U62-A11-plugin-upgrade-skips-own-version-steps.md))
  change `PluginHelper::upgradePlugin()` only and apply beside this
  one.
- 3.5 has the same four callbacks: the fix applies as written. 3.4 also
  registers `installEmailTemplateData()`, and 3.3 also
  `installControlledVocabs()` and `installEmailTemplateData()`; a
  backport guards those too. Both lines also overwrite the result in
  `$result = $installer->executeSQL($sql)` (3.4 `installEmailTemplateData()`;
  3.3 `installEmailTemplates()` and `installEmailTemplateData()`),
  which the recorded-error check in `PluginHelper` covers the same way.
  3.3's files are `PluginHelper.inc.php`, `Installer.inc.php` and
  `Plugin.inc.php`.
- A test: install a plugin whose migration fails and check the notice
  and the `versions` table; install a second plugin and check that the
  first plugin's migration did not run.

Medium: three files in pkp-lib and a new installer method that plugin
installations now depend on, with a behaviour change for any plugin
whose step ran as a side effect of other plugins' installations.

## Evidence

- Kept script:
  `shared/playwright/checks/issues/plugin-install-step-fails-reported-installed/walk.js`
  with `lib.js` beside it (the package builder: `build(dir, {product, displayName, kind, step})`,
  `step` `'count'` for the counter and `'fail'` for the failing
  plugin). Run on a dataset fleet reset first
  (`npm run fleet-prep -- --feature issues-q05b --dataset 4 --reset`):
  `bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-q05b PROBE_AGENT=q05b node bin/probe.js ojs shared/playwright/checks/issues/plugin-install-step-fails-reported-installed/walk.js`
  (`omp`, `ops` the same; `filter` as the last argument walks the
  failing plugin with a filter configuration and the failing theme,
  `neighbour` the two checks of the fix; 3.5 with
  `PKP_E2E_LINE=stable-3_5_0` in front).
- Walked on PostgreSQL, PKP's default dataset (pkp/datasets
  `7421d2a8`, 2026-11-04):
  - `main`: OJS `9552aa521a`, OMP `828150a8fe`, OPS `0acd73102d`;
    lib/pkp `25fdc98a3e` (OJS, OPS), `1ae711024a` (OMP). Observed as
    written on all three (step 7's table read as
    `to_regclass('hkq05bf_items')`). `filter`: the generic plugin with
    a filter configuration reported installed on all three; the failing
    theme reported installed on OMP and failed on OJS and OPS.
  - `stable-3_5_0`: OJS `e725cc873a`, OPS `82faa21834` (lib/pkp
    `e2c62c4b7b`), OMP `e81eefc11c` (lib/pkp `c4c0aa8c52`). The same
    Observed on all three.
- Fix trial on `main`, OJS, OMP and OPS, each part after a reset: the
  walk, `filter` and `neighbour` with the fix, `neighbour` after the
  revert. The application's upgrade:
  `PKP_E2E_DATASET_BRANCH=stable-3_5_0 npm run reset:ojs -- --dataset 4`
  (loads the 3.5 dataset and runs `php tools/upgrade.php upgrade`), with
  `fix.diff` (exit 0), with `alt-installfilters.diff` alone (exit 2,
  the Static Pages error above) and with neither (exit 0).
- Static Pages' repeated migration: no screen or log shows it on
  today's code. With the U62-A13 fix in (which logs a failed
  migration), every plugin installation on OJS `main` wrote
  `QueryException: SQLSTATE[42P07]: Duplicate table: 7 ERROR: relation "static_pages" already exists`
  to the server's log; OMP is read from the code.
- Code reads beyond the Cause:
  - Filter configurations on OJS `main`: `plugins/metadata/dc11`,
    `plugins/importexport/native`, `pubmed`,
    `lib/pkp/plugins/importexport/users`, `plugins/generic/crossref`,
    `datacite`, `doaj`.
  - `ManualPaymentPlugin::register()` (line 72) and `updateSchema()`
    (227), `ManualPaymentEmailDataMigration::nameShouldBeMigrated()`
    (109: only from `ojs2` before 3.4.0.0).
  - `PluginGridHandler::__construct()`: upload, upgrade and delete are
    granted to `ROLE_ID_SITE_ADMIN` only.
  - Reinstall after "Delete": `PluginHelper::installPlugin()` refuses
    only when a current version is recorded and the folder exists;
    "Delete" leaves the tables (spec U62 Rule 21).
  - 3.4: lib/pkp `origin/stable-3_4_0` `2dd24cc5ae` (apps
    `upstream/stable-3_4_0`: OJS `8bd9e6f9a0`, OMP `e92ae5b6d`, OPS
    `d6dd7247c9`): `Plugin.php` `register()` 116–135 (adds
    `installEmailTemplateData()`), `executeSQL` overwrite 633,
    `installFilters()` 695, `Installer.php` 126, `PluginHelper.php`
    141–148; "themes" last on OJS and OPS, before "importexport" on OMP.
    Same fault.
  - 3.3: lib/pkp `origin/stable-3_3_0` `df738d3a66` (apps
    `upstream/stable-3_3_0`: OJS `2f766afdb1`, OMP `220e3e2f7`, OPS
    `1f02fc5641`): `Plugin.inc.php` 90–113 (adds
    `installControlledVocabs()`, `installEmailTemplateData()`),
    `executeSQL` overwrites 608 and 632, `installFilters()` 685,
    `Installer.inc.php` 98, `PluginHelper.inc.php` 127–132; the same
    category orders. Same fault.
- Upstream search (2026-11-05): pkp/pkp-lib, pkp/ojs, pkp/omp, pkp/ops
  and pkp/ui-library, by the symptom's words and by `installFilters`,
  `Installer::postInstall`, `updateSchema`, `loadAllPlugins`. Read and
  not the same fault: `pkp/pkp-lib#6920` (a usage statistics migration
  failing during an application install, 2021, closed without a cause).
- MySQL not checked.
- Unverified: whether a failing report or payment plugin shows the
  failure (from the code only); which third-party plugins have install
  migrations that are not re-runnable or that add rows each time.
