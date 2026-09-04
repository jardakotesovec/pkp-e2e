#!/usr/bin/env node
/**
 * @file bin/fetch-apps.js
 *
 * Provision self-contained app checkouts under checkouts/<app> so the
 * campaign never drives a development checkout:
 *
 *   node bin/fetch-apps.js [ojs] [omp] [ops] [--rebuild] [--slot N]
 *   (default: all apps, slot 0)
 *
 * --slot N provisions a parallel PERMANENT ENVIRONMENT (harness.md
 * "Environments"): checkouts-s<N>/ with ports shifted by N*1000, DBs
 * <app>_test_s<N>, its own files dirs and API key. Slot 0 (the default)
 * is the classic checkouts/ set — output is unchanged.
 *
 * Per app: clone pkp/<app> `main` with FULL history (the campaign's minimal
 * main-repo changes are merged there; the jardakotesovec fork lags —
 * history matters for archaeology when chasing a defect) with the remote
 * NAMED `upstream` and its push URL disabled immediately; add the
 * jardakotesovec fork as `origin` and make it the push default — so a bare
 * `git push` can only ever reach the fork, and pkp remotes reject every
 * push. Submodule push URLs are disabled too. Then: composer install
 * (lib/pkp + plugin vendors), npm ci + UI build, write .env.playwright,
 * create the <app>_test Postgres DB and generate config.test.inc.php.
 *
 * Idempotent: done steps are skipped (--rebuild forces composer/npm/build).
 * An existing checkout's tree is left alone; to move it to the current
 * upstream main, pass --update (fetch + checkout + submodules).
 * Afterwards point .env at checkouts/<app> and run `npm run mount`.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const {execFileSync, spawnSync} = require('child_process');
const {APPS, REPO_ROOT} = require('./apps.js');

const FORK_OWNER = 'jardakotesovec';
const UPSTREAM_OWNER = 'pkp';
// Not a URL on purpose: any `git push` at a disabled remote fails loudly.
const DISABLED_PUSH_URL = 'DISABLED-push-to-pkp-remotes-is-forbidden';

const args = process.argv.slice(2);
const rebuild = args.includes('--rebuild');
const update = args.includes('--update');
let slot = 0;
const requested = [];
for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--rebuild' || a === '--update') continue;
    if (a === '--slot' || a.startsWith('--slot=')) {
        const value = a === '--slot' ? args[++i] : a.slice('--slot='.length);
        slot = Number(value);
        if (!Number.isInteger(slot) || slot < 0) {
            console.error(`--slot needs a non-negative integer, got "${value}"`);
            process.exit(1);
        }
        continue;
    }
    requested.push(a);
}

// Slot 0 keeps every historical name; slot N shifts ports and suffixes the
// rest so environments never collide (see docs/process/harness.md).
const SUFFIX = slot ? `-s${slot}` : '';
const DB_SUFFIX = slot ? `_s${slot}` : '';
const PORT_SHIFT = slot * 1000;
const CHECKOUTS = path.join(REPO_ROOT, `checkouts${SUFFIX}`);
const FILES_ROOT = path.join(CHECKOUTS, 'files');
const names = requested.length ? requested : Object.keys(APPS);
for (const name of names) {
    if (!APPS[name]) {
        console.error(`Unknown app "${name}" — one of: ${Object.keys(APPS).join(', ')}`);
        process.exit(1);
    }
}

const run = (cwd, cmd, args, opts = {}) => {
    console.log(`  $ ${cmd} ${args.join(' ')}`);
    return execFileSync(cmd, args, {cwd, stdio: 'inherit', ...opts});
};

function fetchApp(name) {
    const dir = path.join(CHECKOUTS, name);
    console.log(`== ${name} → ${dir}`);

    const fresh = !fs.existsSync(path.join(dir, '.git'));
    if (fresh) {
        fs.mkdirSync(CHECKOUTS, {recursive: true});
        // Clone from pkp (the fork lags), but NAME the remote `upstream` and
        // disable its push URL before anything else happens in the checkout.
        run(CHECKOUTS, 'git', [
            'clone', '--branch', 'main', '--origin', 'upstream',
            `https://github.com/${UPSTREAM_OWNER}/${name}.git`, name,
        ]);
    } else {
        console.log('  clone: exists, skipping (--update moves it to current upstream main)');
    }
    run(dir, 'git', ['remote', 'set-url', '--push', 'upstream', DISABLED_PUSH_URL]);

    // The fork is `origin` and the push default: a bare `git push` can only
    // ever reach the fork, and pkp rejects pushes via the disabled URL.
    const remotes = execFileSync('git', ['remote'], {cwd: dir, encoding: 'utf8'});
    if (!remotes.split('\n').includes('origin')) {
        run(dir, 'git', [
            'remote', 'add', 'origin',
            `https://github.com/${FORK_OWNER}/${name}.git`,
        ]);
    }
    run(dir, 'git', ['config', 'remote.pushDefault', 'origin']);

    // The UI bundle (js/build.js) is built from lib/ui-library; an --update
    // that moves the tree or that submodule must rebuild it, or the checkout
    // runs new PHP against a stale bundle (U43 A13 reappeared that way,
    // 2026-09-04).
    const uiRev = () => {
        try {
            return execFileSync('git', ['rev-parse', 'HEAD:lib/ui-library'], {cwd: dir, stdio: ['ignore', 'pipe', 'ignore']}).toString().trim();
        } catch { return ''; }
    };
    const uiBefore = fresh ? '' : uiRev();
    if (!fresh && update) {
        run(dir, 'git', ['fetch', 'upstream', 'main']);
        run(dir, 'git', ['checkout', '-B', 'main', 'FETCH_HEAD']);
    }
    run(dir, 'git', ['submodule', 'update', '--init', '--recursive']);
    const uiMoved = !fresh && update && uiRev() !== uiBefore;
    if (uiMoved) console.log('  lib/ui-library moved: the UI bundle will be rebuilt');

    // Submodule origins point at pkp remotes (.gitmodules) — disable pushes.
    run(dir, 'git', [
        'submodule', 'foreach', '--recursive',
        `git remote set-url --push origin ${DISABLED_PUSH_URL}`,
    ]);

    // Safety net: the recorded lib/pkp pointer must already honour
    // PKP_CONFIG_FILE (merged upstream); if an app repo lags, take pkp-lib
    // main's tip the way CI took the branch tip.
    const configPhp = path.join(dir, 'lib', 'pkp', 'classes', 'config', 'Config.php');
    if (!fs.readFileSync(configPhp, 'utf8').includes('PKP_CONFIG_FILE')) {
        console.log('  lib/pkp pointer predates PKP_CONFIG_FILE — advancing to pkp-lib main');
        const libPkp = path.join(dir, 'lib', 'pkp');
        run(libPkp, 'git', [
            'fetch',
            `https://github.com/${UPSTREAM_OWNER}/pkp-lib.git`, 'main',
        ]);
        run(libPkp, 'git', ['checkout', '--detach', 'FETCH_HEAD']);
        run(libPkp, 'git', ['submodule', 'update', '--init']);
        run(dir, 'git', [
            'submodule', 'foreach', '--recursive',
            `git remote set-url --push origin ${DISABLED_PUSH_URL}`,
        ]);
    }

    // PHP dependencies — same set CI installs (run-app.yml).
    const vendorAutoload = path.join(dir, 'lib', 'pkp', 'lib', 'vendor', 'autoload.php');
    if (rebuild || !fs.existsSync(vendorAutoload)) {
        run(dir, 'composer', [
            '--no-ansi', '--no-interaction', '--no-progress',
            '--working-dir=lib/pkp', 'install', '--no-dev', '--optimize-autoloader',
        ]);
    } else {
        console.log('  composer lib/pkp: vendor present, skipping (--rebuild forces)');
    }
    for (const plugin of ['plugins/generic/citationStyleLanguage', 'plugins/paymethod/paypal']) {
        const pluginDir = path.join(dir, plugin);
        if (
            fs.existsSync(path.join(pluginDir, 'composer.json')) &&
            (rebuild || !fs.existsSync(path.join(pluginDir, 'lib', 'vendor', 'autoload.php')))
        ) {
            run(dir, 'composer', [
                '--no-ansi', '--no-interaction', '--no-progress',
                `--working-dir=${plugin}`, 'install', '--no-dev', '--optimize-autoloader',
            ]);
        }
    }

    // UI build.
    if (rebuild || uiMoved || !fs.existsSync(path.join(dir, 'node_modules'))) {
        run(dir, 'npm', ['ci']);
    } else {
        console.log('  npm ci: node_modules present, skipping (--rebuild forces)');
    }
    if (rebuild || uiMoved || !fs.existsSync(path.join(dir, 'js', 'build.js'))) {
        run(dir, 'npm', ['run', 'build']);
    } else {
        console.log('  UI build: js/build.js present, skipping (--rebuild forces; --update rebuilds when lib/ui-library moved)');
    }

    // Runtime wiring: env file, files dir, test DB, test config.
    const envFile = path.join(dir, '.env.playwright');
    if (!fs.existsSync(envFile)) {
        fs.writeFileSync(envFile, [
            `# Generated by bin/fetch-apps.js for the self-contained ${name} checkout` +
                (slot ? ` (environment ${slot}).` : '.'),
            `PKP_CONFIG_FILE=${path.join(dir, 'config.test.inc.php')}`,
            `TEST_API_KEY=playwright-test-key${SUFFIX}`,
            `PLAYWRIGHT_BASE_PORT=${APPS[name].basePort + PORT_SHIFT}`,
            'MAILPIT_URL=http://127.0.0.1:8025',
            '',
        ].join('\n'));
        console.log(`  wrote ${envFile}`);
    }

    // The "-test" suffix matters: reset.js only wipes a files dir whose
    // basename contains "test".
    const filesDir = path.join(FILES_ROOT, `${name}-test`);
    fs.mkdirSync(filesDir, {recursive: true});

    const dbName = `${name}_test${DB_SUFFIX}`;
    const dbUser = process.env.TEST_DB_USERNAME || os.userInfo().username;
    const exists = spawnSync('psql', [
        '-XtAc', `SELECT 1 FROM pg_database WHERE datname = '${dbName}'`, 'postgres',
    ], {encoding: 'utf8'});
    if (exists.status !== 0) {
        console.error(`  psql failed — is Postgres running? ${exists.stderr}`);
        process.exit(1);
    }
    if (exists.stdout.trim() !== '1') {
        run(dir, 'createdb', [dbName]);
    }

    const configFile = path.join(dir, 'config.test.inc.php');
    if (!fs.existsSync(configFile)) {
        const generated = spawnSync('node', [
            path.join(REPO_ROOT, 'shared', 'playwright', 'make-test-config.js'),
        ], {
            encoding: 'utf8',
            env: {
                ...process.env,
                PKP_APP_ROOT: dir,
                PLAYWRIGHT_BASE_PORT: String(APPS[name].basePort + PORT_SHIFT),
                TEST_DB_NAME: dbName,
                TEST_DB_USERNAME: dbUser,
                TEST_DB_PASSWORD: process.env.TEST_DB_PASSWORD || dbUser,
                TEST_FILES_DIR: filesDir,
            },
        });
        if (generated.status !== 0) {
            console.error(generated.stderr);
            process.exit(1);
        }
        fs.writeFileSync(configFile, generated.stdout);
        console.log(`  wrote ${configFile}`);
    }

    console.log(`${name}: ready — set ${name.toUpperCase()}_ROOT=${dir} in .env, then npm run mount`);
}

names.forEach(fetchApp);
