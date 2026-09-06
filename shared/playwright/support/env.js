/**
 * @file lib/pkp/playwright/support/env.js
 *
 * The one parser for the harness's env files (.env.playwright in an app
 * checkout, plain .env at the pkp-e2e repo root): `KEY=value` lines,
 * optional single or double quotes, `#` comments. `readEnvFile` returns a
 * map, for a process that holds several apps' files at once (the probe
 * kit); `loadEnv` puts the map into process.env, where values already
 * exported in the shell win, so `TEST_API_KEY=other npx playwright test`
 * still overrides the file.
 */
const fs = require('fs');
const path = require('path');

/**
 * @param {string} dir Directory holding the env file
 * @param {string} [fileName] env file name (default .env.playwright)
 * @returns {Object<string, string>} the file's keys, empty when it is missing
 */
function readEnvFile(dir, fileName = '.env.playwright') {
    const map = {};
    const envFile = path.join(dir, fileName);
    if (!fs.existsSync(envFile)) {
        return map;
    }
    for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        const eq = trimmed.indexOf('=');
        if (eq === -1) {
            continue;
        }
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        map[key] = value;
    }
    return map;
}

/**
 * @param {string} dir Directory holding the env file
 * @param {string} [fileName] env file name (default .env.playwright; the
 *   pkp-e2e repo root uses plain .env for app roots and shared values)
 */
function loadEnv(dir, fileName = '.env.playwright') {
    for (const [key, value] of Object.entries(readEnvFile(dir, fileName))) {
        if (!(key in process.env)) {
            process.env[key] = value;
        }
    }
}

module.exports = {readEnvFile, loadEnv};
