// Helpers for walk.js (issue report U45-OMP4). Requiring this file runs nothing.

/** Doi::STATUS_* as the DOIs page words them. */
const STATUS = {1: 'Unregistered', 2: 'Submitted', 3: 'Registered', 4: 'Error', 5: 'Needs Sync'};

/**
 * Every version of the submission with each DOI it holds and that DOI's
 * stored status: the work's own, and on a press its chapters' and formats'
 * (a read for the facts, not a step).
 * Returns [{id, version, published, dois: [{kind, doi, status}], statuses: [..unique]}].
 */
function storedVersionDois(sql, app, sid) {
    // 3.5 numbers versions in one column; main by stage, major and minor.
    const version = app.line === 'stable-3_5_0' ? `p.version::text` : `p.version_major || '.' || p.version_minor`;
    const parts = [`select p.publication_id as pid, 0 as ord, 'work' as kind, d.doi, d.status from publications p join dois d on d.doi_id = p.doi_id`];
    if (app.name === 'omp') {
        parts.push(`select c.publication_id, 1, 'chapter', d.doi, d.status from submission_chapters c join dois d on d.doi_id = c.doi_id`);
        parts.push(`select f.publication_id, 2, 'format', d.doi, d.status from publication_formats f join dois d on d.doi_id = f.doi_id`);
    }
    return sql(
        app,
        `select p.publication_id, ${version}, p.status,
                coalesce(string_agg(x.kind || ' ' || x.doi || ' ' || x.status, ',' order by x.ord, x.doi), '')
         from publications p left join (${parts.join(' union all ')}) x on x.pid = p.publication_id
         where p.submission_id = ${sid} group by p.publication_id order by p.publication_id`
    )
        .split('\n')
        .filter(Boolean)
        .map((l) => {
            const [id, v, status, list] = l.split('|');
            const dois = list
                ? list.split(',').map((d) => {
                      const [kind, doi, s] = d.split(' ');
                      return {kind, doi, status: STATUS[s] || s};
                  })
                : [];
            return {id: Number(id), version: v, published: Number(status) === 3, dois, statuses: [...new Set(dois.map((d) => d.status))]};
        });
}

/** The "View all" window's blocks as one line each: "<heading>: <type> <doi> <badge>; …". */
function windowLines(blocks) {
    return (blocks || []).map((b) => `${b.heading}: ${b.rows.map((r) => `${r.type} ${r.doi} ${r.badge}`).join('; ')}`);
}

/** Per block of the "View all" window, the distinct status badges its rows show. */
function windowStatuses(blocks) {
    return (blocks || []).map((b) => ({heading: b.heading, rows: b.rows.length, badges: [...new Set(b.rows.map((r) => r.badge))]}));
}

module.exports = {STATUS, storedVersionDois, windowLines, windowStatuses};
