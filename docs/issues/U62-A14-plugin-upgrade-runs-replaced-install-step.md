# Plugins: "Upgrade" runs the replaced version's installation step, so the database change a new release adds is not made

- **Severity** medium
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** `pkp/pkp-lib#5861` for `pkp/pkp-lib#2493` · [c7e640593a](https://github.com/pkp/pkp-lib/commit/c7e640593a7eb513904949d86e68859f3bcb0e18) · 2020-05-12 · Alec Smecher (asmecher)
- **Upstream** none found (2026-11-23)
- **Tracked in** spec U62 [A14](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U62-plugins-management.md#a14)
- **Checked** 2026-11-23, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A plugin can carry an installation step of its own that sets up its
tables in the database. A Site Administrator upgrades such a plugin
with its row's "Upgrade" (or the Plugin Gallery's "Upgrade"), and the
new release adds a database change to that step, such as one more
table. The upgrade runs the step as the version being replaced wrote
it, so the change is not made, and the notice still reads
"Successfully upgraded to version 1.0.1.0".

Nothing on screen shows it, and the new release then runs on a
database without its change until another plugin is installed.

It happens when the new release changes that step and ships an
upgrade file (`upgrade.xml`), which is how a plugin asks "Upgrade" to
run its database steps. PKP's own PN plugin works this way, with its
data repairs inside its installation step. The next PN release that
adds a repair would be the first PN upgrade to skip one.

## Impact

- **Lost**: the database change the new release adds to its
  installation step. A page of the plugin that reads a table or column
  the release added then fails with a database error; a data repair
  the release added is not done, and nothing shows that. Nobody is
  told: the notice is the same as for a complete upgrade.
- **Who**: Site Administrators who upgrade a plugin with its row's
  "Upgrade" (a journal's Settings › Website › "Plugins", or
  Administration › Site Settings › "Plugins"), or with the Plugin
  Gallery's "Upgrade" for an enabled generic plugin, when the new
  release ships an `upgrade.xml` and changes its installation step.
  An upgrade of the whole application is not affected: there the new
  plugin files are put in place first and
  `php tools/upgrade.php upgrade` runs every plugin's installation step
  from them.
- **Way round**: none on screen. The change is made by the next "Upload
  A New Plugin" of any plugin, or on the server by
  `php lib/pkp/tools/installPluginVersion.php plugins/generic/<plugin>/version.xml`,
  for an administrator who knows to do either.

Medium: the upgrade looks done and is not, silently, and the way
PKP's own plugins bring a site up to date goes through it; the next
plugin installation repairs it. A release whose missing change breaks
the plugin's pages for every site that upgrades would raise it to high.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS, OMP or OPS).
- Three plugin packages on the computer, each a `.tar.gz` of one
  folder.
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/plugin-upgrade-runs-replaced-install-step/lib.js)
  builds them (`buildPackages(dir)`); by hand, `tar -czf <file> <folder>`
  in the folder's parent.
  - `u62n23i-1.0.0.0.tar.gz`, folder `u62n23i/` with four files.

    `version.xml`:

    ```xml
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE version SYSTEM "../../../lib/pkp/dtd/pluginVersion.dtd">
    <version>
        <application>u62n23i</application>
        <type>plugins.generic</type>
        <release>1.0.0.0</release>
        <date>2026-11-23</date>
        <lazy-load>1</lazy-load>
        <class>U62n23iPlugin</class>
    </version>
    ```

    `index.php`:

    ```php
    <?php
    require_once __DIR__ . '/U62n23iPlugin.php';
    return new \APP\plugins\generic\u62n23i\U62n23iPlugin();
    ```

    `U62n23iPlugin.php`, the plugin, whose installation step is the
    migration class below:

    ```php
    <?php
    namespace APP\plugins\generic\u62n23i;

    use PKP\plugins\GenericPlugin;

    class U62n23iPlugin extends GenericPlugin
    {
        public function getDisplayName()
        {
            return 'u62n23i Schema Test Plugin';
        }

        public function getDescription()
        {
            return 'u62n23i Schema Test Plugin, version 1.0.0.0.';
        }

        public function getInstallMigration()
        {
            return new U62n23iSchemaMigration();
        }
    }
    ```

    `U62n23iSchemaMigration.php`, the installation step:

    ```php
    <?php
    namespace APP\plugins\generic\u62n23i;

    use Illuminate\Database\Migrations\Migration;
    use Illuminate\Database\Schema\Blueprint;
    use Illuminate\Support\Facades\Schema;

    class U62n23iSchemaMigration extends Migration
    {
        public function up(): void
        {
            if (!Schema::hasTable('u62n23i_items')) {
                Schema::create('u62n23i_items', function (Blueprint $table) {
                    $table->bigIncrements('item_id');
                });
            }
        }

        public function down(): void
        {
            Schema::dropIfExists('u62n23i_tags');
            Schema::dropIfExists('u62n23i_items');
        }
    }
    ```
  - `u62n23i-1.0.1.0.tar.gz`: the same folder with
    `<release>1.0.1.0</release>` (and "1.0.1.0" in the description).
    Its `up()` adds the change this release brings, after the first
    table:

    ```php
            if (!Schema::hasTable('u62n23i_tags')) {
                Schema::create('u62n23i_tags', function (Blueprint $table) {
                    $table->bigIncrements('tag_id');
                });
            }
    ```

    and a fifth file, `upgrade.xml`, with no steps of its own, as the
    PN plugin's:

    ```xml
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE install SYSTEM "../../../lib/pkp/dtd/install.dtd">
    <install version="1.0.1.0">
    </install>
    ```
  - `u62n23ix-1.0.0.0.tar.gz`, folder `u62n23ix/`: another plugin with
    no installation step. Its `version.xml` is the first one with
    `u62n23ix` and `U62n23ixPlugin`; its `index.php` the same with
    those names; its `U62n23ixPlugin.php` the class
    `APP\plugins\generic\u62n23ix\U62n23ixPlugin extends GenericPlugin`
    with `getDisplayName()` returning "u62n23i Other Plugin" and a
    `getDescription()`, and nothing else.

Steps:

1. Sign in as `admin`.
2. Open Settings › Website
   (`/index.php/publicknowledge/management/settings/website`) and its
   "Plugins" tab.
3. Press "Upload A New Plugin", press "Upload File", choose
   `u62n23i-1.0.0.0.tar.gz` and press "Save". The notice reads
   "Successfully installed version 1.0.0.0".
4. Press the "u62n23i Schema Test Plugin" row's arrow, then "Upgrade".
   In the "Upgrade Plugin" window, press "Upload File", choose
   `u62n23i-1.0.1.0.tar.gz` and press "Save".
5. In the application's database, list the plugin's tables:

   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_name IN ('u62n23i_items', 'u62n23i_tags') ORDER BY 1;
   ```

Later, the change arriving by accident:

6. Press "Upload A New Plugin" again, choose `u62n23ix-1.0.0.0.tar.gz`
   and press "Save".
7. Run step 5's query again.

Before a second run, remove what the steps made: delete the folders
`plugins/generic/u62n23i` and `plugins/generic/u62n23ix` on the
server, then

```sql
DROP TABLE IF EXISTS u62n23i_items, u62n23i_tags;
DELETE FROM versions WHERE product IN ('u62n23i', 'u62n23ix');
DELETE FROM plugin_settings WHERE plugin_name IN ('u62n23iplugin', 'u62n23ixplugin');
```

**Expected**: step 4 runs 1.0.1.0's installation step. Step 5 lists
`u62n23i_items` and `u62n23i_tags`.

**Observed**: step 4 closes the window with the notice "Successfully
upgraded to version 1.0.1.0", and the server's PHP error log stays
empty. The plugin's folder holds 1.0.1.0 and its version record reads
1.0.1.0. Step 5 lists:

```
u62n23i_items
```

Step 6 reads "Successfully installed version 1.0.0.0", and step 7 lists
both tables.

## Cause

The row's "Upgrade" posts `saveUploadPlugin` to the plugin grid
(`SettingsPluginGridHandler` on a journal, press or server,
`AdminPluginGridHandler` on the site). Since the request carries
`category` and `plugin`, the grid adds `PluginAccessPolicy`, whose
`PluginRequiredPolicy` loads that category
(`PluginRegistry::loadCategory()`). The installed release's plugin
object is registered before anything is replaced, and
`Plugin::register()` (`lib/pkp/classes/plugins/Plugin.php`, line 120)
decides whether to hook `updateSchema()` onto
`Installer::postInstall` by calling `$this->getInstallMigration()`.
That call instantiates the migration class, so PHP has the 1.0.0.0
class before the upgrade begins.

`PluginHelper::upgradePlugin()` then replaces the plugin's folder with
the 1.0.1.0 files and, when the new release has an `upgrade.xml`, runs
it through an `Upgrade` installer. The installer's `postInstall()`
calls the hooked `updateSchema()`, which asks for the migration again.
The class name is the same, so PHP uses the class it already has:
1.0.0.0's `up()` runs. PHP cannot load a second definition of a class
in one request, so anything loaded before the swap runs as the
replaced release. A `<migration>` step in `upgrade.xml` naming the
installation step's class meets the same copy
(`Installer::executeAction()`). Without an `upgrade.xml`, no installer
runs and no installation step runs at all.

The change arrives at the next "Upload A New Plugin" because
`PluginHelper::installPlugin()` builds an `Install` installer, and
`Installer::__construct()` calls `PluginRegistry::loadAllPlugins()`
(`Installer.php`, line 121). In that new request every plugin is
registered from the files on disk, and `postInstall()` runs every
plugin's installation step, 1.0.1.0's now.
`installPluginVersion.php` and the application's own upgrade run in a
new process the same way.

The eager call came with the migrations-based plugin schema
([c7e640593a](https://github.com/pkp/pkp-lib/commit/c7e640593a7eb513904949d86e68859f3bcb0e18)),
which hooked `updateSchema()` when
`getInstallSchemaFile() || getInstallMigration()`. A schema file was
an XML file read from disk when the hook ran, so it was always the new
release's; a migration class loaded at `register()` is not.
[ebaf20b7ca](https://github.com/pkp/pkp-lib/commit/ebaf20b7ca85559bc48a2d69415ef3e992354e78)
(2020-11-27) dropped the schema file from the condition, leaving the
migration call alone, before the 3.3.0 release; line 120 on `main` is
the 2021 reformat of that line.

Reach:

- The row's "Upgrade" on Settings › Website (walked) and on
  Administration › Site Settings' "Plugins" (the same form and policy,
  code).
- The Plugin Gallery's "Upgrade" reaches
  `PluginHelper::upgradePlugin()` through
  `PluginGalleryGridHandler::installPlugin()`, which adds no plugin
  policy. Its request registers only the enabled generic and pubIds
  plugins (`Dispatcher`, lines 147–148), so an enabled generic plugin
  meets the same fault. A disabled one is first loaded by the `Upgrade`
  installer's constructor, after the swap, so its new step runs (code;
  the Gallery does not load on the test installs).
- Only a release that changes the installation step's own class is
  affected. Classes the step uses that were not loaded before the swap,
  and upgrade-only migration classes that `upgrade.xml` names, load
  from the new files.
- Released plugins: the PKP PN plugin (`pkp/pln`) runs its data repairs
  from its installation step (`SchemaMigration::up()`, five on `main`)
  behind an empty `upgrade.xml`. Its 4.0.0.0 and 4.0.1.0 have the same
  step, so no PN upgrade has skipped a repair yet.
- The replaced plugin object decides which hooks run:
  `getInstallMigration()` is its method. A release that adds an
  installation step where the replaced one had none is not run on
  "Upgrade" either. The hooks for `getInstallSitePluginSettingsFile()`
  and `getInstallEmailTemplatesFile()` are likewise added only when the
  replaced release names a file; a file it named is read from the new
  folder when the hook runs.

## Proposed fix

In `Plugin::register()`, add the `updateSchema()` hook without asking
for the migration, so the class is first loaded when the installer
runs it, after the upgrade has put the new files in place
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/plugin-upgrade-runs-replaced-install-step/fix.diff)):

```diff
         $this->pluginPath = $path;
         $this->pluginCategory = $category;
-        if ($this->getInstallMigration()) {
-            Hook::add('Installer::postInstall', $this->updateSchema(...));
-        }
+        // updateSchema() asks for the migration when the installer runs, not here: a plugin upgrade replaces
+        // the plugin's files after register(), and a migration class loaded now would run as the replaced copy
+        Hook::add('Installer::postInstall', $this->updateSchema(...));
         if ($this->getInstallSitePluginSettingsFile()) {
```

`updateSchema()` already checks `if ($migration = $this->getInstallMigration())`
and does nothing for a plugin without one, the way `installFilters()`
is hooked for every plugin and checks for its files when it runs. The
change also stops every request from building each plugin's migration
object just to test that it exists.

Tried on `main` in OJS, OMP and OPS: with the fix, step 3 still
creates `u62n23i_items`, and after step 4's "Successfully upgraded to
version 1.0.1.0" step 5 lists `u62n23i_items` and `u62n23i_tags`. A
plugin with no installation step, which the fix now hooks too, upgrades
as before, with the fix in and out: "u62n23i Other Plugin" 1.0.0.0 to
a 1.0.1.0 whose `upgrade.xml` names an upgrade-only migration gives the
same notice and that migration's table, and the PHP error log stays empty.

What it does not cover, read in the code and not walked:

- A release that adds an installation step where the replaced one had
  none: the replaced object's `getInstallMigration()` returns `null`,
  so no step runs, as today.
- A release that renames the step's class: the replaced object's
  `getInstallMigration()` instantiates the old name, whose file is
  gone, and PHP throws an `Error` ("Class … not found").
  `updateSchema()` catches only `Exception`; `Hook::run()` catches the
  `Throwable`, `PluginFailureHandler::logIfPluginFailure()` writes it
  to the PHP error log (the trace runs through the plugin's class), and
  the upgrade goes on to "Successfully upgraded". Today the same rename
  runs the old class without a trace. Either way the new step does not
  run.

Both come from running the upgrade with the replaced plugin object, and
only a new request can avoid that (the first alternative). The
recommended fix is preferred because the case it covers, a release
that changes its step's code under the same class name, is the one
plugins following PKP's pattern meet, and it costs three lines; adding
a step or renaming its class can go into plugin authors' notes until
the upgrade flow changes.

**Alternatives**:

- Run the upgrade's installer in a new request or process after the
  files are swapped (a redirect to a second step, or the
  `installPluginVersion.php` path): the only way to run new code for a
  class already loaded, and it would also cover a release that adds or
  renames its step. A larger change to the upgrade flow and its
  messages.
- Tell plugin authors to put every change in an upgrade-only
  migration named in `upgrade.xml`: that works today, but the
  installation step is the pattern PKP's own plugins follow (pkp/pln),
  and nothing warns an author who follows it.

**What goes with it**:

- On a server whose PHP never rechecks its compiled files
  (`opcache.validate_timestamps=0`), a file the upgrade replaces can
  still be served from the old compiled copy until PHP restarts, with
  or without this fix; that is the spec's open question
  [A15](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U62-plugins-management.md#a15),
  not part of this fix.
- No stored data to repair: a site that upgraded such a plugin gets
  the missing change at its next plugin installation, or from
  `installPluginVersion.php`.
- Backport: `fix.diff` applies to 3.5 as it is (line 118). It does not
  apply to 3.4, whose line reads
  `Hook::add('Installer::postInstall', [$this, 'updateSchema']);`
  (`classes/plugins/Plugin.php`, line 118): the same change keeps that
  form. On 3.3, `classes/plugins/Plugin.inc.php` line 93 with
  `HookRegistry::register('Installer::postInstall', [$this, 'updateSchema']);`
  (its `updateSchema()` checks the migration the same way).
- A test: the Steps as an e2e scenario (a Planned item of the spec).

Small: three lines in one shared class, following the `installFilters()`
pattern, tried on all three apps.

## Evidence

- By hand: the Steps above, with the three packages built by
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/plugin-upgrade-runs-replaced-install-step/lib.js)
  (`buildPackages(dir)` writes `pkg/u62n23i-1.0.0.0.tar.gz`,
  `-1.0.1.0`, `pkg/u62n23ix-1.0.0.0.tar.gz` and the neighbour's
  `u62n23ix-1.0.1.0` under `dir`).
- Kept script:
  `shared/playwright/checks/issues/plugin-upgrade-runs-replaced-install-step/walk.js`
  (helpers copied from the U62 A11 walk). Run on a dataset fleet, reset
  first: `npm run fleet-prep -- --feature issues-n23i --dataset 3 --reset`,
  then
  `bin/app-lock.sh exclusive ojs -- env PROBE_FEATURE=issues-n23i PROBE_AGENT=n23i node bin/probe.js ojs shared/playwright/checks/issues/plugin-upgrade-runs-replaced-install-step/walk.js`
  (`omp`, `ops` the same; `neighbour` as the last argument runs the
  fix's neighbour check alone). 3.5: `PKP_E2E_LINE=stable-3_5_0` in
  front, feature `issues-n23i-3_5`, `PROBE_RUN=r35`. The script removes
  the plugin folders, their version rows and the `u62n23i*` tables at
  its end.
- Walked on PostgreSQL (the default dataset, pkp/datasets `abdb5d17`,
  2026-11-22), as `admin` on `publicknowledge`:
  - `main`: OJS `1e1d3fc49b`, OMP `bdfae3fe7`, OPS `69d3cf6bad`, each
    lib/pkp `3ea73a1a7e`. Observed as written on all three.
  - `stable-3_5_0`: OJS `7f23f05a93`, OMP `272333e34`, OPS
    `5a7aec98df`, each lib/pkp `9295edd4f0`, core version 3.5.0.6.
    The same Observed on all three: "Successfully upgraded to version
    1.0.1.0", only `u62n23i_items` at step 5, both tables at step 7,
    the PHP error log empty.
  - The only failed request in the walks was the Plugin Gallery's list
    (500, the test installs cannot reach PKP's site), not part of the
    Steps.
- Fix trial on `main`: `node bin/try-fix.js apply shared/playwright/checks/issues/plugin-upgrade-runs-replaced-install-step/fix.diff <app>`,
  the walk (`PROBE_RUN=fix`) and the neighbour (`neighbour`,
  `PROBE_RUN=nb-in`), then `revert` and the neighbour again
  (`PROBE_RUN=nb-out`), each after a reset of the app's dataset fleet,
  one app at a time under its exclusive lock, on OJS, OMP and OPS.
- Mechanism: the spec's claim check of 2026-11-23 (kept script
  `shared/playwright/checks/U62/I62/i62.js`, parts `web` and `cli`)
  logged each `up()` call on the upgrade request: twice, from the
  `upgrade.xml` `<migration>` node and from `postInstall`, both with
  the 1.0.0.0 class's constant while the file on disk read 1.0.1.0;
  `installPluginVersion.php` ran the 1.0.1.0 class.
- Code reads:
  - `main` and 3.5: `Plugin::register()` (main line 120, 3.5 line 118),
    `Installer::__construct()` (`loadAllPlugins()`, main line 121),
    `SettingsPluginGridHandler` and `AdminPluginGridHandler`
    (`PluginAccessPolicy` when `category` and `plugin` are set),
    `PluginRegistry::loadCategory()` (its cache) and `register()`
    (skips a plugin already registered), `Hook::run()` and
    `PluginFailureHandler::logIfPluginFailure()` (the renamed-class
    case),
    `Plugin::updateSchema()` (main 849, 3.5 656), `installFilters()` (main 809);
    `PluginRequiredPolicy` (`loadCategory()`, main line 56);
    `UploadPluginForm::execute()`; `PluginHelper::upgradePlugin()`
    (main 281–356) and `installPlugin()`; `Installer::execute()`,
    `postInstall()` and `executeAction()` (`migration`);
    `PluginGalleryGridHandler::installPlugin()` and `Dispatcher`
    (lines 147–148, the enabled generic and pubIds plugins);
    `lib/pkp/tools/installPluginVersion.php`.
  - 3.4: `origin/stable-3_4_0` `1310f00fed` of lib/pkp (the app
    `upstream/stable-3_4_0` `4b437fd4c3`): `Plugin.php` 118 and 720,
    `PluginRequiredPolicy.php` 55, `PluginHelper.php` 215 and 226. Same
    code, same fault.
  - 3.3: `origin/stable-3_3_0` `cb68f48e99` of lib/pkp (the app
    `upstream/stable-3_3_0` `de6f4ead8e`): `Plugin.inc.php` 93
    (`HookRegistry::register`) and 704, `PluginRequiredPolicy.inc.php`
    44, `PluginHelper.inc.php` 212 and 222. Same code; a 3.3 plugin's
    migration file is loaded with `import()`, a `require_once` that
    skips a file already loaded, so the same fault.
  - History: `git blame` of line 120, then `git log -S` across the
    rename from `Plugin.inc.php`: `e3f570bc37` (2021, the PSR-12
    reformat), `ebaf20b7ca` (2020-11-27, the schema file dropped from
    the condition; `git tag --contains`: from `3_3_0-0`) and
    `c7e640593a` (2020-05-12, which added `getInstallMigration()` to the
    condition); its PR read from the GitHub API (`commits/<sha>/pulls`).
  - Backport: `patch --dry-run` of `fix.diff` on 3.5's committed
    `Plugin.php` (applies, offset -2) and on 3.4's (fails).
- Plugin Gallery read (2026-11-23): `pkp/plugin-gallery`'s
  `plugins.xml`, and every release package (72) of the seven plugins
  whose packages carried an `upgrade.xml` in the 2026-10-27 read of all
  593 releases (PKP's own PN plugin, pkp/pln, among them), compared
  release by release
  within each application line: the installation step's class
  (`getInstallMigration()`), its file, and whether `upgrade.xml`
  exists. pln: `SchemaMigration` and its empty `upgrade.xml`
  (4.0.0.0 and 4.0.1.0 differ in comments only). Plugins outside those
  seven were not re-read.
- MySQL not checked; nothing in the fault depends on the database.
- Unverified: what a released plugin loses in a real upgrade; no
  Gallery release was walked.
