/**
 * @file shared/playwright/ini.js
 *
 * The one ini patcher behind the test configs: make-test-config.js derives
 * config.test.inc.php from the app's config.TEMPLATE.inc.php with it, and
 * config-factory.js derives the validation variant from that.
 */

/**
 * Rewrite config keys in place inside their section (an active or commented
 * assignment at line start), appending under the section header when the
 * section lacks the key. A later active assignment of a patched key would
 * win in ini, so it is dropped; commented lines stay. Returns the patched
 * text.
 *
 * @param {string} text the ini file
 * @param {Object<string, Object<string, string>>} patches {section: {key: value}}
 * @returns {string}
 */
function patchIni(text, patches) {
    const out = [];
    let pending = {};
    let done = new Set();
    const flushPending = () => {
        for (const [key, value] of Object.entries(pending)) {
            out.push(`${key} = ${value}`);
        }
        pending = {};
        done = new Set();
    };
    for (const line of text.split('\n')) {
        const sectionMatch = line.match(/^\[(\w+)\]/);
        if (sectionMatch) {
            flushPending();
            pending = {...(patches[sectionMatch[1]] || {})};
            out.push(line);
            continue;
        }
        const keyMatch = line.match(/^(;?)\s*([a-z_]+)\s*=/);
        if (keyMatch && pending[keyMatch[2]] !== undefined) {
            out.push(`${keyMatch[2]} = ${pending[keyMatch[2]]}`);
            done.add(keyMatch[2]);
            delete pending[keyMatch[2]];
            continue;
        }
        if (keyMatch && keyMatch[1] === '' && done.has(keyMatch[2])) {
            continue;
        }
        out.push(line);
    }
    flushPending();
    return out.join('\n');
}

module.exports = {patchIni};
