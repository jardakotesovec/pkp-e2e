#!/usr/bin/env node
/**
 * @file bin/unmount.js
 *
 * Reverse bin/mount.js for the named apps (default: every app with
 * <APP>_ROOT set): delete the files the mount manifest records (skipping,
 * with a warning, any the app checkout has since modified), prune emptied
 * directories, and drop the managed .git/info/exclude block.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const {APPS, REPO_ROOT, resolveApp} = require('./apps.js');

const sha = (file) =>
    crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function unmount(appName) {
    const app = resolveApp(appName);
    const manifestFile = path.join(app.root, '.pkp-e2e-mount.json');
    if (!fs.existsSync(manifestFile)) {
        console.log(`${appName}: not mounted (no manifest) — nothing to do`);
        return;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    let removed = 0;
    const dirs = new Set();
    for (const [rel, hash] of Object.entries(manifest)) {
        const target = path.join(app.root, rel);
        if (!fs.existsSync(target)) {
            continue;
        }
        if (sha(target) !== hash) {
            console.warn(`${appName}: ${rel} was modified — left in place`);
            continue;
        }
        fs.rmSync(target);
        removed++;
        for (let d = path.dirname(target); d !== app.root; d = path.dirname(d)) {
            dirs.add(d);
        }
    }
    [...dirs]
        .sort((a, b) => b.length - a.length)
        .forEach((d) => {
            if (fs.existsSync(d) && fs.readdirSync(d).length === 0) {
                fs.rmdirSync(d);
            }
        });
    fs.rmSync(manifestFile);

    const excludeFile = path.join(app.root, '.git', 'info', 'exclude');
    if (fs.existsSync(excludeFile)) {
        const content = fs.readFileSync(excludeFile, 'utf8');
        fs.writeFileSync(
            excludeFile,
            content.replace(
                /# >>> pkp-e2e mount[\s\S]*?# <<< pkp-e2e mount\n?/,
                ''
            )
        );
    }
    console.log(`${appName}: removed ${removed} files from ${app.root}`);
}

const requested = process.argv.slice(2);
const names = requested.length
    ? requested
    : Object.keys(APPS).filter((name) => {
          require('../shared/playwright/support/env.js').loadEnv(REPO_ROOT, '.env');
          return !!process.env[`${name.toUpperCase()}_ROOT`];
      });
names.forEach(unmount);
