// U62 I23B: a minimal theme plugin package of our own (no third-party code), built at run time.
// The theme's parent is the app's "Default Theme"; it overrides the context's home page template with a copy of the
// app's own file that also includes `frontend/<product>-only.tpl`, a template only this theme has. Requiring this runs
// nothing.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

/** The home page template of each app, relative to its templates/ folder. */
const HOME_TPL = {ojs: 'frontend/pages/indexJournal.tpl', omp: 'frontend/pages/index.tpl', ops: 'frontend/pages/indexServer.tpl'};

/** A theme's names from its product name (lower-case letters and digits). */
function themeNames(product) {
    const className = `${product.charAt(0).toUpperCase()}${product.slice(1)}ThemePlugin`;
    return {product, className, id: className.toLowerCase(), marker: `${product}-marker`, onlyTpl: `frontend/${product}-only.tpl`};
}

/**
 * Build the package from the app at `appRoot` (its own home page template is copied) and return its path.
 * @param {string} outDir
 * @param {{appName: string, appRoot: string, product: string, displayName: string}} spec
 */
function buildTheme(outDir, {appName, appRoot, product, displayName}) {
    const {className, marker, onlyTpl} = themeNames(product);
    const home = HOME_TPL[appName];
    const original = fs.readFileSync(path.join(appRoot, 'templates', home), 'utf8');
    const include = `{include file="${onlyTpl}"}`;
    const headerRe = /(\{include file="frontend\/components\/header\.tpl"[^}]*\})/;
    if (!headerRe.test(original)) throw new Error(`no header include in ${home}`);
    const override = original.replace(headerRe, `$1\n${include}`);
    const src = path.join(outDir, `src-${product}`);
    fs.rmSync(src, {recursive: true, force: true});
    const files = {
        'version.xml': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE version SYSTEM "../../../lib/pkp/dtd/pluginVersion.dtd">
<version>
	<application>${product}</application>
	<type>plugins.themes</type>
	<release>1.0.0.0</release>
	<date>2026-10-23</date>
	<lazy-load>1</lazy-load>
	<class>${className}</class>
</version>
`,
        [`${className}.php`]: `<?php
namespace APP\\plugins\\themes\\${product};

use PKP\\plugins\\ThemePlugin;

class ${className} extends ThemePlugin
{
    public function init()
    {
        $this->setParent('defaultthemeplugin');
    }

    public function getDisplayName()
    {
        return '${displayName}';
    }

    public function getDescription()
    {
        return 'A scratch theme of the U62 I23B claim check: the Default Theme with its own home page template.';
    }
}
`,
        'index.php': `<?php
require_once __DIR__ . '/${className}.php';
return new \\APP\\plugins\\themes\\${product}\\${className}();
`,
        [`templates/${home}`]: override,
        [`templates/${onlyTpl}`]: `<div id="${marker}" class="${marker}">${displayName}: the theme's own template</div>\n`,
    };
    for (const [rel, body] of Object.entries(files)) {
        const file = path.join(src, product, rel);
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, body);
    }
    const out = path.join(outDir, `${product}.tar.gz`);
    execFileSync('tar', ['--format', 'ustar', '-czf', out, '-C', src, product], {env: {...process.env, COPYFILE_DISABLE: '1'}});
    return out;
}

/** The theme's folder under the app root if it is there (null otherwise). */
function themeFolder(appRoot, product) {
    const dir = path.join(appRoot, 'plugins', 'themes', product);
    return fs.existsSync(dir) ? dir : null;
}

/** Remove the theme's folder if the app's Delete left it; returns what was removed. */
function removeThemeFolder(appRoot, product) {
    const dir = themeFolder(appRoot, product);
    if (dir) fs.rmSync(dir, {recursive: true, force: true});
    return dir;
}

module.exports = {HOME_TPL, themeNames, buildTheme, themeFolder, removeThemeFolder};
