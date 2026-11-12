// @ts-check
/**
 * @file shared/playwright/support/locale-install.js
 *
 * One language install at a time per test database, across every worker and
 * every runner of the machine (ci-triage "Two contexts adding French at the
 * same moment"; U57 A6; `.reports/flake-2026-11-02/french-context-race/`).
 *
 * The app installs a language's default email texts with no transaction and
 * no lock: `Locale::installLocale()` → `installEmailTemplateLocaleData()`
 * deletes and re-inserts each `(email_key, locale)` row of the site-wide
 * `email_templates_default_data`, whether or not the rows are already there.
 * A scratch context seeded with a second "Forms" language
 * (`ContextFactory::enableFormLocales()`, in autocommit) runs it, and so do a
 * "Forms" tick, a "Submissions" tick, "Reload defaults" and "Install Locale"
 * on screen. Two at once interleave DELETE, DELETE, INSERT, INSERT on one key
 * and the later INSERT answers 500 (unique violation). A person meets it only
 * when two managers add the same language in the same instant (risk
 * accepted, U57 A6); parallel tests meet it whenever two of them seed or
 * tick French together. So every harness path that installs a language holds
 * this lock for its request: `PkpApi.createContext()` with a second form
 * language, and the language lists' presses and windows (LanguagesPages).
 * A test that wants two installs at once (U57 A6 itself) drives them without
 * this lock.
 *
 * The lock is a directory (mkdir is atomic) under the OS temp dir, named for
 * the app's test database (app, slot, line), holding its owner's pid; a
 * holder that died (a worker torn down mid-request) is noticed by its pid
 * and the lock taken over. It is a plain file-system lock, so it holds on
 * any database driver (PRINCIPLES D8).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const POLL_MS = 50;
const MAX_WAIT_MS = 300_000;

/** The app this process drives: the suite's config sets PKP_APP_NAME, the probe kit PKP_APP_ROOT. */
function currentApp() {
    if (process.env.PKP_APP_NAME) {
        return process.env.PKP_APP_NAME;
    }
    const root = process.env.PKP_APP_ROOT ? path.basename(process.env.PKP_APP_ROOT) : '';
    return ['ojs', 'omp', 'ops'].includes(root) ? root : 'app';
}

/** The lock's directory: one per test database (app, slot, line). */
function lockDir(app = currentApp()) {
    let slot = process.env.PKP_E2E_SLOT || '0';
    try {
        slot = String(require('../../../bin/apps.js').resolveSlot().n);
    } catch {
        // outside the repo layout: the environment's slot
    }
    const line = process.env.PKP_E2E_LINE || 'main';
    return path.join(os.tmpdir(), 'pkp-e2e-locale-install', `${app}-s${slot}-${line}`);
}

/** Is a process with this pid alive (on this machine)? */
function alive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return /** @type {NodeJS.ErrnoException} */ (e).code === 'EPERM';
    }
}

/** The holder's pid, or null while the holder has not written it yet. */
function ownerOf(dir) {
    try {
        const pid = Number(fs.readFileSync(path.join(dir, 'owner'), 'utf8').split(' ')[0]);
        return Number.isInteger(pid) && pid > 0 ? pid : null;
    } catch {
        return null;
    }
}

/**
 * Take the lock; resolves to a release function. A dead holder's lock is
 * moved aside once (rename is atomic, so two waiters cannot both take it
 * over) and taken.
 */
async function acquire(dir, {maxWaitMs = MAX_WAIT_MS} = {}) {
    fs.mkdirSync(path.dirname(dir), {recursive: true});
    const token = `${process.pid} ${Date.now()} ${Math.random().toString(36).slice(2)}`;
    const started = Date.now();
    for (;;) {
        try {
            fs.mkdirSync(dir);
            fs.writeFileSync(path.join(dir, 'owner'), token);
            return () => {
                try {
                    if (fs.readFileSync(path.join(dir, 'owner'), 'utf8') === token) {
                        fs.rmSync(dir, {recursive: true, force: true});
                    }
                } catch {
                    // already gone
                }
            };
        } catch (e) {
            if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'EEXIST') {
                throw e;
            }
        }
        const pid = ownerOf(dir);
        if (pid !== null && !alive(pid)) {
            const aside = `${dir}.dead-${process.pid}-${Date.now()}`;
            try {
                fs.renameSync(dir, aside);
                if (ownerOf(aside) === pid) {
                    fs.rmSync(aside, {recursive: true, force: true});
                } else {
                    // A live holder took it in between: put it back.
                    fs.renameSync(aside, dir);
                }
            } catch {
                // another waiter moved it first
            }
            continue;
        }
        if (Date.now() - started > maxWaitMs) {
            throw new Error(`locale-install lock ${dir} still held by pid ${pid} after ${maxWaitMs} ms`);
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
}

/**
 * Run `fn` holding the language-install lock of this process's test
 * database; returns what `fn` returns.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{app?: string}} [options]
 * @returns {Promise<T>}
 */
async function withLocaleInstall(fn, {app} = {}) {
    const release = await acquire(lockDir(app));
    try {
        return await fn();
    } finally {
        release();
    }
}

/**
 * Does a `POST scenarios/context` spec install a language? It does when
 * `context.supportedFormLocales` lists one beyond the primary
 * (`ContextFactory::enableFormLocales()`); "UI" and "Submissions" locales
 * alone install nothing on the seed path.
 *
 * @param {any} spec
 */
function contextSpecInstallsLocale(spec) {
    const forms = spec && spec.context && spec.context.supportedFormLocales;
    return Array.isArray(forms) && forms.length > 1;
}

module.exports = {withLocaleInstall, contextSpecInstallsLocale, lockDir};
