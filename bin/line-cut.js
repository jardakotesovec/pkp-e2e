#!/usr/bin/env node
/**
 * @file bin/line-cut.js
 *
 * Copy what follows the product from the repo root (the apps' `main`) into
 * a stable version's folder, lines/<branch>/ (docs/process/VERSIONS.md):
 *
 *   node bin/line-cut.js <branch>                  the folder's base
 *   node bin/line-cut.js <branch> --feature U26    one feature on top of it
 *   node bin/line-cut.js <branch> --all            every feature (a fresh cut)
 *
 *   --from <git ref>   copy from that commit's tree instead of the working
 *                      tree (a version whose suite lived on a branch of this
 *                      repo: `--all --from origin/ore`)
 *   --apps ojs,omp     only these apps (a version only some apps have)
 *
 * The base, for all three apps: the test library the tests are written
 * against (shared/playwright/{support,data,tests}, apps/<app>/playwright/
 * {support,fixtures}), the seeding code (shared/php, apps/<app>/php), the
 * glossary (docs/specs/GLOSSARY.md), one
 * Playwright config per app, and links to what exists once (bin/ and the
 * top-level files of shared/playwright/), so a copied file's relative
 * requires resolve inside the folder as they do at the root.
 *
 * A feature: its spec (docs/specs/U<nn>-*.md), its test files in every app
 * and every page object those tests reach.
 *
 * A file the folder already holds is never overwritten: it may have been
 * adapted to the version. The run lists what it copied and what it kept.
 */
const fs = require('fs');
const path = require('path');
const {REPO_ROOT, APPS, LINES} = require('./apps.js');

const {execFileSync} = require('child_process');
const USAGE = 'usage: node bin/line-cut.js <branch> [--feature U<nn>]… [--all] [--from <git ref>] [--apps ojs,omp,ops]';
const args = process.argv.slice(2);
const branch = args.shift();
const features = [];
let all = false;
let from = null;
let onlyApps = null;
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--feature' && /^U\d+$/.test(args[i + 1] || '')) {
        features.push(args[++i]);
    } else if (args[i] === '--all') {
        all = true;
    } else if (args[i] === '--from' && args[i + 1]) {
        from = args[++i];
    } else if (args[i] === '--apps' && args[i + 1]) {
        onlyApps = args[++i].split(',').map((name) => name.trim()).filter(Boolean);
    } else {
        console.error(`line-cut: unknown argument "${args[i]}"\n${USAGE}`);
        process.exit(1);
    }
}
if (!branch || !LINES[branch]) {
    console.error(`line-cut: ${branch ? `"${branch}" is not a line of bin/apps.js` : 'no branch named'}\n${USAGE}`);
    process.exit(1);
}

const lineDir = path.join(REPO_ROOT, 'lines', branch);
const appNames = Object.keys(APPS).filter((name) => !onlyApps || onlyApps.includes(name));
const git = (...gitArgs) => execFileSync('git', gitArgs, {cwd: REPO_ROOT, maxBuffer: 1 << 28});
/** A source file's bytes: from the working tree, or from the tree of --from. */
const read = (file) => (from ? git('show', `${from}:${file}`) : fs.readFileSync(path.join(REPO_ROOT, file)));
const exists = (file) => {
    if (!from) {
        return fs.existsSync(path.join(REPO_ROOT, file));
    }
    try {
        git('cat-file', '-e', `${from}:${file}`);
        return true;
    } catch {
        return false;
    }
};
const copied = [];
const kept = [];
const rel = (file) => path.relative(REPO_ROOT, file);

/** Every file under a root-relative directory, as root-relative paths. */
function filesUnder(dir) {
    if (from) {
        return git('ls-tree', '-r', '--name-only', from, '--', dir)
            .toString()
            .split('\n')
            .filter((file) => file && !file.split('/').some((part) => part.startsWith('.') || part === 'test-results'));
    }
    const start = path.join(REPO_ROOT, dir);
    if (!fs.existsSync(start)) {
        return [];
    }
    const found = [];
    const walk = (current) => {
        for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
            // Run leftovers (.auth, .server-logs, test-results) stay behind.
            if (entry.name.startsWith('.') || entry.name === 'test-results') {
                continue;
            }
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.isFile()) {
                found.push(rel(full));
            }
        }
    };
    walk(start);
    return found;
}

/** A directory link left by an earlier shape of the folder becomes a real directory. */
function unlinkDirs(target) {
    let dir = path.dirname(target);
    const chain = [];
    while (dir.startsWith(lineDir) && dir !== lineDir) {
        chain.unshift(dir);
        dir = path.dirname(dir);
    }
    for (const part of chain) {
        if (fs.existsSync(part) && fs.lstatSync(part).isSymbolicLink()) {
            fs.unlinkSync(part);
        }
    }
}

function copy(file) {
    const target = path.join(lineDir, file);
    unlinkDirs(target);
    if (fs.existsSync(target)) {
        kept.push(file);
        return;
    }
    fs.mkdirSync(path.dirname(target), {recursive: true});
    if (/^docs\/specs\/[^/]+\.md$/.test(file)) {
        fs.writeFileSync(target, relinked(read(file).toString()));
    } else {
        fs.writeFileSync(target, read(file));
    }
    copied.push(file);
}

/**
 * A copied spec's links to what exists once (issue reports, process and
 * tracking files) are pointed back at the root; its links to the glossary
 * and to other specs stay beside it, where the version's own copies are or
 * will be.
 */
function relinked(text) {
    const up = '../../../../docs/';
    // A version's spec carries no Planned list (docs/process/VERSIONS.md).
    text = text.replace(/^- \*\*Planned\*\*:.*\n(?:(?: {2,}.*|)\n)*?(?=- \*\*|\S)/m, '');
    return text
        .replace(/\]\(\.\.\/(issues|process|tracking|reports)\//g, `](${up}$1/`);
}

function link(file) {
    const target = path.join(lineDir, file);
    if (fs.existsSync(target) || fs.lstatSync(target, {throwIfNoEntry: false})) {
        return;
    }
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.symlinkSync(path.relative(path.dirname(target), path.join(REPO_ROOT, file)), target);
}

function base() {
    link('bin');
    // The probe kit, so a kept check under the folder's checks/ imports it
    // as one at the root does (`require('../../../probe')`).
    link(path.join('shared', 'playwright', 'probe'));
    for (const entry of fs.readdirSync(path.join(REPO_ROOT, 'shared', 'playwright'), {withFileTypes: true})) {
        if (entry.isFile() && !entry.name.startsWith('.')) {
            link(path.join('shared', 'playwright', entry.name));
        }
    }
    // The glossary is product vocabulary: the version has its own.
    copy('docs/specs/GLOSSARY.md');
    const dirs = ['shared/playwright/support', 'shared/playwright/data', 'shared/playwright/tests', 'shared/php'];
    for (const app of appNames) {
        dirs.push(`apps/${app}/playwright/support`, `apps/${app}/playwright/fixtures`, `apps/${app}/php`);
    }
    dirs.flatMap(filesUnder).forEach(copy);
    for (const app of appNames) {
        const config = path.join(lineDir, `${app}.config.js`);
        if (!fs.existsSync(config)) {
            fs.writeFileSync(
                config,
                `// The ${app.toUpperCase()} suite of ${branch} (docs/process/VERSIONS.md).\n` +
                    `module.exports = require('../../shared/playwright/line-config.js')(__dirname, '${app}');\n`
            );
            copied.push(rel(config));
        }
    }
}

/** The page objects a test or page-object file reaches, followed through their own requires. */
function pageObjectsOf(file, seen) {
    const source = read(file).toString();
    for (const match of source.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
        let required = path.join(path.dirname(file), match[1]);
        if (!/\.(js|json)$/.test(required)) {
            required += '.js';
        }
        if (!/(^|\/)playwright\/pages\//.test(required) || seen.has(required)) {
            continue;
        }
        if (!exists(required)) {
            continue;
        }
        seen.add(required);
        pageObjectsOf(required, seen);
    }
    return seen;
}

function feature(id) {
    const specs = filesUnder('docs/specs').filter((file) => path.basename(file).startsWith(`${id}-`) && !file.includes('/lines/'));
    const tests = appNames
        .flatMap((app) => filesUnder(`apps/${app}/playwright/tests`))
        .filter((file) => path.basename(file).startsWith(`${id}-`));
    if (!specs.length) {
        console.error(`line-cut: no spec docs/specs/${id}-*.md`);
        process.exit(1);
    }
    const pages = new Set();
    tests.forEach((file) => pageObjectsOf(file, pages));
    [...specs, ...tests, ...pages].forEach(copy);
}

base();
if (all) {
    filesUnder('docs/specs')
        .filter((file) => /^docs\/specs\/U\d+-[^/]+\.md$/.test(file))
        .forEach(copy);
    for (const dir of ['shared/playwright/pages', ...appNames.flatMap((app) => [`apps/${app}/playwright/tests`, `apps/${app}/playwright/pages`])]) {
        filesUnder(dir).forEach(copy);
    }
}
features.forEach(feature);

console.log(`line-cut ${branch}: copied ${copied.length}, kept ${kept.length} already there`);
copied.forEach((file) => console.log(`  + ${file}`));
if (features.length || all) {
    kept.filter((file) => /^docs\/specs\/|\/playwright\/(tests|pages)\//.test(file)).forEach((file) => console.log(`  = ${file}`));
}
