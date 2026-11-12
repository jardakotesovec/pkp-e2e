#!/usr/bin/env node
/**
 * @file bin/config-edit.js
 *
 * The one working-tree edit a stable branch's app needs before the harness
 * can drive it: lib/pkp's CONFIG_FILE define honouring PKP_CONFIG_FILE, the
 * line `main` carries since 2026-08. fetch-apps applies it to a line's
 * checkout; CI applies it to the app it checked out for a version's suite:
 *
 *   node bin/config-edit.js <app root>
 *
 * Nothing is written when the define already honours the variable. Exit 1
 * when the define is not in a known shape.
 */
const fs = require('fs');
const path = require('path');

// 3.5 and 3.4 have the namespaced define `main` had; 3.3 keeps it in
// Config.inc.php, unnamespaced.
const CONFIG_EDITS = [
    {
        file: 'Config.php',
        before: "define('CONFIG_FILE', \\PKP\\core\\Core::getBaseDir() . '/config.inc.php');",
        after: "define('CONFIG_FILE', getenv('PKP_CONFIG_FILE') ?: \\PKP\\core\\Core::getBaseDir() . '/config.inc.php');",
    },
    {
        file: 'Config.inc.php',
        before: "define('CONFIG_FILE', Core::getBaseDir() . DIRECTORY_SEPARATOR . 'config.inc.php');",
        after: "define('CONFIG_FILE', getenv('PKP_CONFIG_FILE') ?: Core::getBaseDir() . DIRECTORY_SEPARATOR . 'config.inc.php');",
    },
];

module.exports = {CONFIG_EDITS};

if (require.main === module) {
    const appRoot = process.argv[2];
    const configDir = appRoot && path.join(appRoot, 'lib', 'pkp', 'classes', 'config');
    const edit = configDir && CONFIG_EDITS.find((e) => fs.existsSync(path.join(configDir, e.file)));
    if (!edit) {
        console.error('usage: node bin/config-edit.js <app root>  (no lib/pkp/classes/config/Config.php or Config.inc.php there)');
        process.exit(1);
    }
    const file = path.join(configDir, edit.file);
    const source = fs.readFileSync(file, 'utf8');
    if (source.includes('PKP_CONFIG_FILE')) {
        console.log(`config-edit: ${edit.file} already honours PKP_CONFIG_FILE`);
    } else if (!source.includes(edit.before)) {
        console.error(`config-edit: ${file}: no CONFIG_FILE define in the expected shape`);
        process.exit(1);
    } else {
        fs.writeFileSync(file, source.replace(edit.before, edit.after));
        console.log(`config-edit: ${edit.file} edited in the working tree to honour PKP_CONFIG_FILE`);
    }
}
