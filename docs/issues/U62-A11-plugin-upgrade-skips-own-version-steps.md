# Plugins: "Upgrade" skips an upgrade step the plugin limits to its own earlier versions, and still reports success

- **Severity** low
- **Effort** small
- **Kind** defect
- **Affects**
  - main: OJS, OMP, OPS
  - 3.5: OJS, OMP, OPS
  - 3.4: OJS, OMP, OPS (code)
  - 3.3: OJS, OMP, OPS (code)
- **Introduced** present since the web-based plugin upgrade arrived in OJS, [ab8022c5d0](https://github.com/pkp/ojs/commit/ab8022c5d04720932bd02778ee182b06c8e7df08) (2008-10-20); no later change brought it in
- **Upstream** `pkp/pkp-lib#9545` reported this fault; it was closed without a fix on 2023-12-06, the team preferring to replace `upgrade.xml` later rather than change it
- **Tracked in** spec U62 [A11](https://github.com/jardakotesovec/pkp-e2e/blob/main/docs/specs/U62-plugins-management.md#a11)
- **Checked** 2026-10-27, each branch's tip (the commits in Evidence)
- **Model** claude-opus-5-5

## Summary

A plugin's new version can limit a step of its upgrade to sites coming
from certain plugin versions, such as a database change meant only for
sites still on the plugin's 1.0.0.x. When the Site Administrator
upgrades the plugin with its row's "Upgrade", that limit is compared
with the application's version instead of the plugin version being
replaced. Upgrading 1.0.0.0 to 1.0.1.0 skips a step limited to
1.0.0.0–1.0.0.9. It also runs a step the plugin limited to its own 3.0
and later, because the application (3.6) falls in that range.

The notice still reads "Successfully upgraded to version 1.0.1.0".
Nothing tells the administrator; only what the step should have left in
the database shows it.

This is the fault `pkp/pkp-lib#9545` reported in 2023, closed without a
fix because the team preferred to replace `upgrade.xml` later. This
report adds: the fault re-verified today on OJS, OMP and OPS, `main`
and 3.5; its cause, one missing line; that line tried as a fix, with a
second upgrade showing it runs exactly the steps meant for the version
replaced; a read of every Plugin Gallery release; and the fix's
dependence on the `pkp/pkp-lib#13608` guard, which no release carries
yet (Proposed fix).

## Impact

- **Lost**: what a skipped step should have done (a new table, a
  column, a data repair). In the other direction, a step the plugin
  meant for later plugin versions runs on a site it was not written
  for; if it cannot run there (a table it creates already exists), the
  upgrade fails.
- **Who**: Site Administrators upgrading a plugin through its row's
  "Upgrade" or the Plugin Gallery's "Upgrade", for a plugin whose
  upgrade file limits a step to a range of versions (the 593 Plugin
  Gallery releases have none). The command-line upgrade
  (`php tools/upgrade.php upgrade`) runs no plugin's upgrade file at
  all, so it is neither another path to this fault nor a way round.
- **Way round**: administrators have none, on screen or off; only
  someone who reads the plugin's code can do a skipped step's work by
  hand. Plugin authors can leave the range out and compare versions in
  the step's own code, reading the plugin version still recorded on the
  site (the one being replaced).

Low: no released plugin is affected. A plugin release that limits a
database step to its own earlier versions would make this medium or
higher, since every site upgrading to it would skip that step.

## Steps to reproduce

Preconditions:

- PKP's default test dataset for `main` (OJS, OMP or OPS).
- Two packages of one small generic plugin on the computer, as
  `.tar.gz` files, each holding a folder `hkq27b/` with:
  - `version.xml`: `<application>hkq27b</application>`,
    `<type>plugins.generic</type>`, `<release>` as below,
    `<lazy-load>1</lazy-load>`, `<class>Hkq27bPlugin</class>`;
  - `Hkq27bPlugin.php`: class
    `APP\plugins\generic\hkq27b\Hkq27bPlugin extends
    PKP\plugins\GenericPlugin`, whose `getDisplayName()` returns
    "hkq27b Range Test Plugin";
  - `index.php`: `return new
    \APP\plugins\generic\hkq27b\Hkq27bPlugin();` after requiring the
    class file.

  The two packages:
  - `hkq27b-1.0.0.0.tar.gz`, `<release>1.0.0.0</release>`;
  - `hkq27b-1.0.1.0.tar.gz`, `<release>1.0.1.0</release>`, with two
    more files. `upgrade.xml` has one step for every upgrade, one for
    sites coming from the plugin's 1.0.0.x, and one for sites coming
    from the plugin's 3.0 or later:

    ```xml
    <install version="1.0.1.0">
        <migration class="APP\plugins\generic\hkq27b\Hkq27bTableMigration" table="hkq27b_always" />
        <upgrade minversion="1.0.0.0" maxversion="1.0.0.9">
            <migration class="APP\plugins\generic\hkq27b\Hkq27bTableMigration" table="hkq27b_from_1_0_0" />
        </upgrade>
        <upgrade minversion="3.0.0.0">
            <migration class="APP\plugins\generic\hkq27b\Hkq27bTableMigration" table="hkq27b_from_3_0" />
        </upgrade>
    </install>
    ```

    `Hkq27bTableMigration.php` is a step that leaves a trace: it creates
    the table its `table` attribute names.

    ```php
    namespace APP\plugins\generic\hkq27b;

    use Illuminate\Database\Schema\Blueprint;
    use Illuminate\Support\Facades\Schema;
    use PKP\migration\Migration;

    class Hkq27bTableMigration extends Migration
    {
        public function up(): void
        {
            Schema::create($this->_attributes['table'], function (Blueprint $table) {
                $table->bigIncrements('id');
            });
        }

        public function down(): void
        {
            Schema::dropIfExists($this->_attributes['table']);
        }
    }
    ```

  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/plugin-upgrade-skips-own-version-steps/lib.js)
  builds both (`buildPackages()`).

Steps:

1. Sign in as `admin`.
2. Open Settings › Website
   (`/index.php/publicknowledge/management/settings/website`) and its
   "Plugins" tab.
3. Press "Upload A New Plugin", press "Upload File", choose
   `hkq27b-1.0.0.0.tar.gz` and press "Save". The notice reads
   "Successfully installed version 1.0.0.0".
4. Press the "hkq27b Range Test Plugin" row's arrow, then "Upgrade". In
   the "Upgrade Plugin" window, press "Upload File", choose
   `hkq27b-1.0.1.0.tar.gz` and press "Save".
5. In the application's database, list the plugin's tables
   (PostgreSQL; on MySQL, `table_schema = DATABASE()`):

   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = current_schema() AND table_name LIKE 'hkq27b%' ORDER BY 1;
   ```

**Expected**: step 4 runs the steps meant for a site coming from
1.0.0.0. Step 5 lists `hkq27b_always` and `hkq27b_from_1_0_0`, and not
`hkq27b_from_3_0`, since the plugin was never at a version 3.0 or later.

**Observed**: step 4 closes the window with the notice "Successfully
upgraded to version 1.0.1.0", and the server's log stays empty. Step 5
lists:

```
hkq27b_always
hkq27b_from_3_0
```

The application's own version (3.6.0.0) and the plugin's version
records (1.0.0.0 replaced by 1.0.1.0) are as expected.

## Cause

`PluginHelper::upgradePlugin()` (`lib/pkp/classes/plugins/PluginHelper.php`)
runs the new version's `upgrade.xml` through an `Upgrade` installer
without telling it which version is being upgraded. `Installer::preInstall()`
(`lib/pkp/classes/install/Installer.php`) then fills the installer's
current version, when none was set, from
`VersionDAO::getCurrentVersion()` with no arguments: the application's
own version row.

`Installer::parseInstallNodes()` runs an `<upgrade>` block's steps only
when that current version lies between its `minversion` and
`maxversion`. During a plugin upgrade, those bounds are therefore
compared with the application's version (3.6.0.0 on `main`), never with
the plugin's. Yet the `<install version="…">` of the same file names the
plugin's new version, so one file holds plugin version numbers in one
place and is compared with the application's version number in
another.

`PluginHelper::installPlugin()` gets this right: it calls
`$installer->setCurrentVersion($pluginVersion)` before `execute()`, so
an installation file's ranges meet the plugin's own version. The upgrade
path never had the matching call. It was missing when the web-based
plugin upgrade arrived in OJS's `PluginManagementHandler` (2008), and
stayed missing through the move to pkp-lib's `UploadPluginForm`
([cca0be2b21](https://github.com/pkp/pkp-lib/commit/cca0be2b21ff350c4c305d7487ffa52bbb8b8334),
2012) and to `PluginHelper`
([2af7328276](https://github.com/pkp/pkp-lib/commit/2af732827661dd5ccfe9e698954593c2b60b0c8a),
2014). The install path gained the setter in 2010
([78b2c118c6](https://github.com/pkp/pkp-lib/commit/78b2c118c6a59a250ccb82fe86d8374469120c3d),
pkp-lib) and its call at the same time
([f905b7fe49](https://github.com/pkp/ojs/commit/f905b7fe499688bec3ca786847be3b025bb3328e),
OJS); the upgrade path got neither.

Reach:

- The row's "Upgrade" on a context's Settings › Website (walked) and on
  Administration › Site Settings' "Plugins" (a site with more than one
  context), which opens the same form (code).
- The Plugin Gallery's "Upgrade"
  (`PluginGalleryGridHandler::upgradePlugin()`) calls the same method
  (code).
- A code or migration step of the upgrade file that reads
  `$installer->getCurrentVersion()` also gets the application's version
  (code).
- No other caller runs a plugin's `upgrade.xml`. The command-line
  upgrade runs the application's own upgrade file, whose last step,
  `Installer::addPluginVersions()`, only records the version each
  plugin folder's `version.xml` names (code).
- Released plugins: of the 593 releases in the Plugin Gallery, 40 carry
  an `upgrade.xml`; none limits a step to a range of versions, and none
  of their code reads the installer's current version.

## Proposed fix

In `PluginHelper::upgradePlugin()`, give the upgrade installer the
installed plugin version before it runs, as `installPlugin()` does with
the version it installs
([fix.diff](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/plugin-upgrade-skips-own-version-steps/fix.diff)):

```diff
                     ], $upgradeFile, true);
+                    // The file's <upgrade> ranges name plugin versions: compare them with the one replaced
+                    $installer->setCurrentVersion($installedPlugin);
                     // Run the upgrade/migration
                     $installer->execute() || throw new Exception(__('manager.plugins.upgradeFailed', ['errorString' => $installer->getErrorString()]));
```

`$installedPlugin` is already read a few lines above, for the downgrade
check. `fix.diff` applies to `main` only, since the lines around it
differ on the older branches. The added line is the same everywhere:

- 3.5 and 3.4: in `classes/plugins/PluginHelper.php`, right after
  `$installer = new Upgrade($params, $upgradeFile, true);` (line 226 on
  both).
- 3.3: in `classes/plugins/PluginHelper.inc.php`, right after the same
  `new Upgrade(...)` line (line 222), indented with three tabs.

Tried on `main` in OJS, OMP and OPS: the Steps then show
`hkq27b_always` and `hkq27b_from_1_0_0`, not `hkq27b_from_3_0`. To check
that the fix does not simply run every limited step, a second upgrade
followed, from 1.0.1.0 to a 1.0.2.0 whose steps are limited to 1.0.0.x,
1.0.1.x and 3.0 and later. It ran only the 1.0.1.x step (and the step
with no range); without the fix, the same upgrade ran the 3.0 step
instead. The application's version row was unchanged throughout.

**Risk**: the fix changes what an existing range means. A plugin outside
the Plugin Gallery whose author wrote a range meaning the application's
version (`minversion="3.4.0.0"`, the only reading the code has ever
honoured; `lib/pkp/dtd/install.dtd` does not say which version is
meant) would stop running that step after the fix, silently. Plugins
outside the Gallery were not read. A line in
the release notes for plugin authors would cover it.

**Alternatives**:

- Keep comparing with the application's version and document it, adding
  separate plugin-version bounds as `pkp/pkp-lib#9545` suggested: a new
  attribute for every plugin author to learn, while `minversion` and
  `maxversion`, sitting beside `<install version>`, look as if they name
  plugin versions already.
- Leave `upgrade.xml` as it is until it is replaced by a Laravel-style
  migration flow (the 2023 position on `pkp/pkp-lib#9545`): until then,
  a plugin author who writes a range gets a silently skipped step.
- Set the version in `Installer::preInstall()` for any plugin installer:
  the installer does not know which plugin it is running, while the
  caller does.

**What goes with it**:

- The fix depends on `Installer::updateVersion()` not recording a
  plugin's version as the application's: the `!$this->isPlugin` guard
  of `pkp/pkp-lib#13608`, all of 2026-10-23:
  - `main`: [4271093dc3](https://github.com/pkp/pkp-lib/commit/4271093dc3084ba0b39fda18f23db60b6c717f66)
  - 3.5: [dc1a84c50d](https://github.com/pkp/pkp-lib/commit/dc1a84c50dc1efcff0e100609cf18dfe2bff75df)
  - 3.4: [83e78a85e5](https://github.com/pkp/pkp-lib/commit/83e78a85e5f3e3a7730ad81ec33761ccbd78162c)
  - 3.3: [93722c9179](https://github.com/pkp/pkp-lib/commit/93722c91793ef2f87eaa7d73916a723fe26660e7)

  No release carries the guard yet: the latest tags, `3_5_0-5`,
  `3_4_0-11` and `3_3_0-23`, predate it. Without the guard, every plugin
  upgrade with an `upgrade.xml` would write the plugin's new version
  over the application's (1.0.1.0 here), so this fix must not ship, be
  cherry-picked or be patched onto a release without it.
- No stored data to repair: a skipped step left no record of having
  been skipped.
- A test: an upgrade whose limited steps create tables, as in the
  Steps, checked after "Upgrade".

Small: one line, tried on all three apps; the guard it needs is already
on every branch, so it adds nothing to the change, only an order to
keep when releasing or backporting.

## Evidence

- By hand: the Steps above, with the two packages built by
  [lib.js](https://github.com/jardakotesovec/pkp-e2e/blob/main/shared/playwright/checks/issues/plugin-upgrade-skips-own-version-steps/lib.js)
  (`buildPackages(dir)` writes `pkg/hkq27b-1.0.0.0.tar.gz`,
  `-1.0.1.0` and the second upgrade's `-1.0.2.0` under `dir`).
- Kept script:
  `shared/playwright/checks/issues/plugin-upgrade-skips-own-version-steps/walk.js`
  (helpers copied from the U62 A5 walk). Run on a dataset fleet, reset
  first: `npm run fleet-prep -- --feature issues-q27b --dataset 4 --reset`,
  then
  `bin/app-lock.sh shared ojs -- env PROBE_FEATURE=issues-q27b PROBE_AGENT=q27b node bin/probe.js ojs shared/playwright/checks/issues/plugin-upgrade-skips-own-version-steps/walk.js`
  (`omp`, `ops` the same; `neighbour` as the last argument adds the
  second upgrade, 1.0.1.0 to 1.0.2.0, that checks the fix). 3.5:
  `PKP_E2E_LINE=stable-3_5_0` in front, feature `issues-q27b-3_5`,
  `PROBE_RUN=r35`. The script removes the plugin folder and the
  `hkq27b_*` tables at its end.
- Walked on PostgreSQL (the default dataset, pkp/datasets `accd72de`,
  2026-10-26):
  - `main`: OJS `5153465178`, OMP `ceae6e275f`, OPS `66a3bb98a5`, each
    lib/pkp `c27153abdd`. Observed as written on all three.
  - `stable-3_5_0`: OJS `a9e01889b0`, OMP `3c8c7c4964` (lib/pkp
    `3fd17879b3`), OPS `07926c35b4` (lib/pkp `9a0212faff`), core
    version 3.5.0.5. The same Observed on all three: `hkq27b_always`
    and `hkq27b_from_3_0`, notice "Successfully upgraded to version
    1.0.1.0".
- Fix trial on `main`, OJS, OMP, OPS: `node bin/try-fix.js apply
  shared/playwright/checks/issues/plugin-upgrade-skips-own-version-steps/fix.diff ojs omp ops`,
  the walk (`PROBE_RUN=fix`), the second upgrade with the fix (`nb-in`)
  and after the revert (`nb-out`), each after a fleet reset.
- Code reads:
  - `main` and 3.5: `PluginHelper::upgradePlugin()` (no
    `setCurrentVersion()`; 3.5 line 226) and `installPlugin()` (3.5
    line 142); `Installer::preInstall()` (main 164–167, 3.5 166) and
    `parseInstallNodes()` (main 353–358, 3.5 355);
    `Installer::updateVersion()`'s `isPlugin` guard (main 319, 3.5 318).
  - 3.4: `origin/stable-3_4_0` `3a26bb98d6` of lib/pkp (the app
    `upstream/stable-3_4_0` `6895dcb6d6`): `PluginHelper.php` 142 vs
    226 (the install path's `setCurrentVersion()`, the upgrade path's
    `new Upgrade`), `Installer.php` 168, 349, guard 312. Same code,
    same fault.
  - 3.3: `origin/stable-3_3_0` `f80a52ed4d` of lib/pkp (the app
    `upstream/stable-3_3_0` `c6590e2012`): `PluginHelper.inc.php` 128
    vs 222, `Installer.inc.php` 136, 303, guard 268. Same code, same
    fault; `$installedPlugin` is in scope there too.
  - No app's `classes/install/Upgrade.php` overrides `preInstall()` or
    sets the current version.
  - History: `git log -S setCurrentVersion` in lib/pkp and in the OJS
    repository; `ab8022c5d0` (OJS, 2008) added the upload, install and
    upgrade of plugins with the same `new Upgrade(...)` and no version
    set; in 2010 pkp-lib `78b2c118c6` added the setter and OJS
    `f905b7fe49` its call, on the install path only.
  - The guard commits: `git merge-base --is-ancestor` on each stable
    branch, and `git tag --contains` (none) in lib/pkp.
  - The command-line upgrade: `UpgradeTool::upgrade()`, the app's
    `dbscripts/xml/upgrade.xml` (last step `addPluginVersions`) and
    `Installer::addPluginVersions()`.
- Plugin Gallery read (2026-10-27): every package of
  `pkp/plugin-gallery`'s `plugins.xml` (593 releases) downloaded and
  read: 40 have an `upgrade.xml` (pkp/pln, lepidus's deiaSurvey,
  OASwitchboard, dataversePlugin, reviewReminder, doiInSummary,
  plaudit); the one `<upgrade>` element (pln 2.0.4.3) has no version
  bounds; no package's code calls the installer's `getCurrentVersion()`.
- MySQL not checked; nothing in the fault depends on the database.
- Unverified: whether a plugin outside the Plugin Gallery uses a range
  in its `upgrade.xml`.
