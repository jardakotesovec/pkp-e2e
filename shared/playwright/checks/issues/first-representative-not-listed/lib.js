// Helpers for the U74 A20 walk: the requests a legacy table sends to redraw itself after a save
// (its row, a whole group, the whole table), with each answer. Requiring this file runs
// nothing. The table, window and "Delete" helpers are the neighbouring report's
// (../representative-window-refuses-supplier/lib.js).
const flat = (s, n = 400) => (s == null ? s : String(s).replace(/\s+/g, ' ').trim().slice(0, n));

/**
 * Record every redraw request of the representatives, publication formats and plugins tables
 * from now on: which one (`fetch-row`, `fetch-category`, `fetch-grid`), the row and group it names, the
 * status and the start of a failed answer.
 */
function watchRedraws(page) {
    const seen = [];
    const on = (r) => {
        const m = r.url().match(/(representatives-grid|publication-format-grid|plugin-grid)\/(fetch-row|fetch-category|fetch-grid)\b/);
        if (!m) return;
        const q = new URL(r.url()).searchParams;
        const entry = {table: m[1], request: m[2], rowId: q.get('rowId'), rowCategoryId: q.get('rowCategoryId'), status: r.status()};
        seen.push(
            r.status() >= 400
                ? r.text().then((t) => ({...entry, body: flat(t)})).catch(() => entry)
                : r.text().then((t) => {
                    let json = null;
                    try { json = JSON.parse(t); } catch (e) { /* not JSON */ }
                    return {...entry, elementNotFound: json ? json.elementNotFound : undefined, hasContent: json ? !!json.content : null};
                }).catch(() => entry)
        );
    };
    page.on('response', on);
    return {
        /** The requests answered since the last call. */
        async take() {
            const out = await Promise.all(seen.splice(0));
            return out;
        },
        stop: () => page.off('response', on),
    };
}

module.exports = {flat, watchRedraws};
