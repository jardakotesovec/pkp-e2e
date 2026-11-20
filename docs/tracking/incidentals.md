# Incidentals

What a session saw in passing on another feature's screens; the spec
author reads their feature's rows at RUNBOOK step 3 and the row is deleted
when the spec absorbs it.

| Feature | Screen | Seen | Date | Evidence |
|---|---|---|---|---|
| U45 | issue reports `docs/issues/U45-OJS5-…` and `U45-OJS13-…` | both still link the deleted A18 report and say a deposit that cannot connect stays "Submitted"; A18 retired 2026-11-20 (deposits now read "Error"), so their sentences and links owe a refresh | 2026-11-20 | `upstream-sync.md` 2026-11-20 |
| U62 | Installed Plugins › Upgrade, and Plugin Gallery › Upgrade | An upgraded plugin's `upgrade.xml` migration, and the `Installer::postInstall` `updateSchema()` hook, run the pre-upgrade copy of the class `getInstallMigration()` returns: `Plugin::register()` instantiates it on every request (stable-3_5_0 `lib/pkp/classes/plugins/Plugin.php:118`), so the upgrade request has the old class loaded before `PluginHelper::upgradePlugin()` swaps the files, and code a release adds to that class never runs on the web upgrade path (the CLI `installPluginVersion.php` runs the new one). Candidate issue report. | 2026-11-20 | a plugin-review sandbox drive: the new release's added `up()` step did not run after a gallery upgrade, ran under `installPluginVersion.php` |
