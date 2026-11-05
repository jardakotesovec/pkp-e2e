// U62 I05B: prints the facts of i05b.js's records, one block per app and run, for the reader.
//   node shared/playwright/checks/U62/I05B/summary.js .reports/issues-cc05b/cc05b [.reports/issues-cc05b-3_5/cc05b]
// Reads install-<run>-<app>.json and api-<run>-<app>.json in each folder named; writes nothing.
const fs = require('fs');
const path = require('path');

for (const dir of process.argv.slice(2)) {
    for (const f of fs.readdirSync(dir).filter((n) => /^(install|api)-[a-z0-9]+-(ojs|omp|ops)\.json$/.test(n)).sort()) {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        console.log(`\n### ${dir} ${f}`);
        if (f.startsWith('install')) {
            if (j.premise) console.log('premise', JSON.stringify({lib: j.premise.lib, staticPages: j.premise.staticPagesTable, sp: j.premise.staticPagesVersion}));
            if (j.cancelUnsaved) console.log('cancelUnsaved', JSON.stringify(j.cancelUnsaved));
            for (const [k, x] of Object.entries(j)) {
                if (!x || typeof x !== 'object' || !('notices' in x) || !Array.isArray(x.markers)) continue;
                console.log(`== ${k} status ${x.status} | ${x.notices.map((n) => `${n.text.slice(0, 1000)} [${(n.cls.split(' ')[1] || '').replace('pkpNotification--', '')}]`).join(' / ') || '(no notice)'}`);
                console.log(`   row ${x.row.present ? `listed, ticked=${x.row.ticked} ${JSON.stringify(x.row.cat)}` : 'not listed'} | versions ${JSON.stringify(x.versions)} | folder ${x.folder} | table ${x.table}`);
                console.log(`   answer ${x.answer}`);
                console.log(`   markers ${x.markers.map((m) => `${m.product.replace(/^u62i05b/, '')}:${m.what}${m.message ? `(${m.message.slice(0, 70)})` : ''}`).join(', ')}`);
                if (x.serverLog.length) console.log(`   log ${JSON.stringify(x.serverLog)}`);
            }
            for (const k of Object.keys(j).filter((n) => n.startsWith('delete.'))) console.log(k, JSON.stringify({status: j[k].status, notices: j[k].notices.map((n) => n.text), row: j[k].row.present, folder: j[k].folder, versions: j[k].versions, table: j[k].table, log: j[k].serverLog}));
            for (const k of ['rowsAfterReload', 'gfailRowLinks', 'browserDialogs', 'error', 'scrubbed', 'gitPlugins']) if (k in j) console.log(k, JSON.stringify(j[k]).slice(0, 1500));
        } else {
            for (const who of ['signedOut', 'manager']) for (const x of j[who] || []) console.log(who, x.status, x.type, x.length, x.path, (x.body || '').slice(0, 110), x.err || '', (x.log || []).filter((l) => !/Accepted$|Closing$|\[[2-4]\d\d\]:/.test(l)).join(' | ').slice(0, 600));
            if (j.error) console.log('error', j.error);
        }
    }
}
