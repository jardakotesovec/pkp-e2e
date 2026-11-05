// U62 I05B: scratch plugin packages of our own (no third-party code), built at run time, each with an
// install migration (Plugin::getInstallMigration()) that marks every call of its up() in a JSON-lines file
// whose absolute path is baked into the package (a web request carries no environment of ours).
//
//   kind 'generic' | 'theme'   the category (plugins/generic, plugins/themes)
//   fail                       up() creates the plugin's table `<product>_t`, then runs a statement on a
//                              table that does not exist (so the migration fails partway); otherwise it
//                              creates the table and returns. A second up() of the same plugin (the table
//                              already there) throws "already exists" by itself, as a migration written
//                              with Schema::create and no hasTable() does.
//   filter                     the package carries filter/filterConfig.xml (an empty, valid filter config),
//                              which Plugin::installFilters() installs on Installer::postInstall
// Requiring this runs nothing.
const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const CAT = {generic: {dir: 'generic', type: 'plugins.generic', base: 'PKP\\plugins\\GenericPlugin'}, theme: {dir: 'themes', type: 'plugins.themes', base: 'PKP\\plugins\\ThemePlugin'}};

/** A plugin's names from its product (lower-case letters and digits): class, row id, table. */
function names(product) {
    const className = `${product.charAt(0).toUpperCase()}${product.slice(1)}Plugin`;
    return {product, className, id: className.toLowerCase(), table: `${product}_t`};
}

/**
 * Build one package; returns its path.
 * @param {string} outDir
 * @param {{product: string, kind?: 'generic'|'theme', fail?: boolean, filter?: boolean, displayName: string, markerFile: string, version?: string}} spec
 */
function build(outDir, {product, kind = 'generic', fail = false, filter = false, displayName, markerFile, version = '1.0.0.0'}) {
    const {className, table} = names(product);
    const c = CAT[kind];
    const ns = `APP\\plugins\\${c.dir}\\${product}`;
    const mig = `${className}Migration`;
    const src = path.join(outDir, `src-${product}`);
    fs.rmSync(src, {recursive: true, force: true});
    const themeInit = kind === 'theme' ? `
    public function init()
    {
    }
` : '';
    const files = {
        'version.xml': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE version SYSTEM "../../../lib/pkp/dtd/pluginVersion.dtd">
<version>
	<application>${product}</application>
	<type>${c.type}</type>
	<release>${version}</release>
	<date>2026-11-05</date>
	<lazy-load>1</lazy-load>
	<class>${className}</class>
</version>
`,
        [`${className}.php`]: `<?php
namespace ${ns};

require_once __DIR__ . '/${mig}.php';

use ${c.base};

class ${className} extends ${c.base.split('\\').pop()}
{
${themeInit}
    public function getDisplayName()
    {
        return '${displayName}';
    }

    public function getDescription()
    {
        return 'A scratch plugin of the U62 I05B claim check: its install migration ${fail ? 'fails partway' : 'succeeds'}${filter ? ', with a filter configuration' : ''}.';
    }

    public function getInstallMigration()
    {
        return new ${mig}();
    }
}
`,
        [`${mig}.php`]: `<?php
namespace ${ns};

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\DB;
use Illuminate\\Support\\Facades\\Schema;

class ${mig} extends Migration
{
    private function mark(string $what, array $extra = []): void
    {
        file_put_contents(${JSON.stringify(markerFile)}, json_encode([
            'product' => '${product}',
            'what' => $what,
            'uri' => $_SERVER['REQUEST_URI'] ?? PHP_SAPI,
            't' => microtime(true),
        ] + $extra) . "\\n", FILE_APPEND);
    }

    public function up(): void
    {
        $this->mark('up');
        try {
            Schema::create('${table}', function (Blueprint $table) {
                $table->bigIncrements('id');
            });
            $this->mark('created');
${fail ? `            DB::statement('INSERT INTO ${table}_missing (id) VALUES (1)');
` : ''}            $this->mark('done');
        } catch (\\Throwable $e) {
            $this->mark('threw', ['class' => get_class($e), 'message' => substr($e->getMessage(), 0, 300)]);
            throw $e;
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('${table}');
    }
}
`,
        'index.php': `<?php
require_once __DIR__ . '/${className}.php';
return new \\${ns}\\${className}();
`,
    };
    if (filter) {
        files['filter/filterConfig.xml'] = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE filterConfig SYSTEM "../../../../lib/pkp/dtd/filterConfig.dtd">
<filterConfig>
</filterConfig>
`;
    }
    for (const [rel, body] of Object.entries(files)) {
        const f = path.join(src, product, rel);
        fs.mkdirSync(path.dirname(f), {recursive: true});
        fs.writeFileSync(f, body);
    }
    const out = path.join(outDir, `${product}-${version}.tar.gz`);
    execFileSync('tar', ['--format', 'ustar', '-czf', out, '-C', src, product], {env: {...process.env, COPYFILE_DISABLE: '1'}});
    return out;
}

/** The plugin's folder under the app root ('generic' or 'theme' kind), or null. */
function folder(appRoot, kind, product) {
    const dir = path.join(appRoot, 'plugins', CAT[kind].dir, product);
    return fs.existsSync(dir) ? dir : null;
}

module.exports = {names, build, folder, CAT};
