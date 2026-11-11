// Helpers of walk.js (issue report docs/issues/U48-A2-body-text-save-offered-then-refused.md), copied
// from ../jats-make-available-offered-then-refused/lib.js so this folder stands alone. Requiring this
// file runs nothing. Each helper presses what a person presses and records what the screen shows; a
// control the page does not offer is recorded as such, never forced.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s, n = 400) => (s == null ? null : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/** The "Error" window, if one opens within `ms`: its text, then "OK" pressed. */
async function errorWindow(page, ms = 8_000) {
    const dialog = page.getByRole('dialog', {name: 'Error', exact: true});
    try {
        await dialog.waitFor({state: 'visible', timeout: ms});
    } catch (e) {
        return null;
    }
    const text = flat(await dialog.innerText());
    await dialog.getByRole('button', {name: 'OK', exact: true}).click();
    await dialog.waitFor({state: 'hidden', timeout: 10_000}).catch(() => {});
    await sleep(600);
    return text;
}

/** Wait for a response matching `test` while `press` runs: {status, method, override, body} or null. */
async function pressAndAnswer(page, test, press, timeout = 20_000) {
    const answered = page.waitForResponse(test, {timeout}).catch(() => null);
    await press();
    const r = await answered;
    if (!r) return null;
    let body = null;
    try {
        body = flat(await r.text(), 300);
    } catch (e) {
        // no body
    }
    return {status: r.status(), method: r.request().method(), override: r.request().headers()['x-http-method-override'] || null, body};
}

/** Side menu › the version › `label` ("Body Text", "Galleys"): heading read, or the reason it was not reached. */
async function openPage(frame, label) {
    try {
        await frame.selectPage(label);
        return {reached: true};
    } catch (e) {
        return {reached: false, error: flat(String(e), 300)};
    }
}

module.exports = {sleep, flat, errorWindow, pressAndAnswer, openPage};
