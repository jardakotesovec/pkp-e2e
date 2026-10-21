// U74 A22 {OMP}: Tools › "ONIX 3.0 Monograph Export Plugin". Each digital format's ONIX product
// states its file size (Extent, type 22, in Mbytes) as the whole megabytes of the format's
// approved files followed by ".3": 1.9 MB reads "1.3", 3.8 MB "3.3", and a format with no files
// "0.3". The issue report's Steps, on PKP's default test dataset, as `dbarnes`: the press's four
// ONIX details filled, a digital format "EPUB h21k" added to submission 4 ("How Canadians
// Communicate", whose "PDF" is remotely hosted with no files), one 1.9 MB file uploaded and
// approved, the book exported; a second 1.9 MB file, exported again.
// Spec: docs/specs/U74-onix-metadata-export.md, register A22 (Rule 24c).
//
// Run (reset the dataset fleet first):
//   PROBE_FEATURE=<dataset fleet feature> PROBE_AGENT=<id> node bin/probe.js omp \
//     shared/playwright/checks/issues/onix-digital-format-file-size-wrong/walk.js [neighbour]
// (PKP_E2E_LINE=stable-3_5_0 in front for 3.5.) The exported files are kept in the run folder
// (`a22-onix-<name>.xml`).
// `neighbour` runs alone what a fix must leave alone: a physical format "Paperback h21k" (its
// "Physical format" ticked) and a digital one with a file of 300 KB, both on submission 4, then
// one export: the paperback carries no file-size Extent, the small file reads under one megabyte;
// and a digital "Tiny h21k" with one approved 200-byte file (a positive value, never 0.000).
// `import` runs alone the Native XML round trip (see its comment; LEGACY=<path of a Native XML
// file exported before a fix> imports that file instead of a fresh export).
// Records the screens, asserts nothing.
const {forEachApp, launch, signIn, record, screen, shot, serverLog} = require('../../../probe');
const L = require('./lib');

const MODE = process.argv[2] || process.env.MODE || 'walk';
const RUN = process.env.PROBE_RUN || 'r0';
const EPUB = 'EPUB h21k';
const PAPER = 'Paperback h21k';
const SMALL = 'Sample h21k';
const TINY = 'Tiny h21k';
const BYTES = 1992294; // 1.9 MB, under the dataset config's 2 MB upload limit

forEachApp(async (app) => {
    if (app.name !== 'omp') return;
    const {page, close} = await launch(app);
    const log = serverLog(app);
    const facts = {mode: MODE, run: RUN, line: app.line};
    const fact = (k, v) => {
        facts[k] = v;
        console.log(`[a22 ${MODE} ${RUN} ${app.line}] ${k}:`, String(JSON.stringify(v)).slice(0, 2400));
    };
    const act = async (name, fn) => {
        const from = log.mark();
        const out = await L.step(page, name, fn);
        const errs = log.since(from).map((l) => L.flat(l, 400));
        await shot(page, `a22-${MODE}-${name}`).catch(() => {});
        return errs.length ? {...out, serverLog: errs} : out;
    };
    try {
        await signIn(page, 'dbarnes');
        fact('p0-publisher-identity', await act('p0', () => L.fillPublisherIdentity(app, page)));
        fact('stored-0', L.storedFormats(app));

        if (MODE === 'walk') {
            // Steps 1-2: the formats page, a digital format added.
            fact('s2-add-epub', await act('s2', () => L.addFormat(app, page, EPUB)));
            // Step 3: one 1.9 MB file, approved.
            fact('s3-file-1', await act('s3', () => L.uploadAndApprove(app, page, EPUB, L.makeFile('ebook-part1.pdf', BYTES))));
            record(`a22-${MODE}-s3-page`, await screen(page));
            fact('s3-stored', L.storedFormats(app));
            // Step 4: the export.
            fact('s4-export-one-file', await act('s4', () => L.exportOnix(app, page, `${MODE}-one-file`)));
            // Step 5: a second 1.9 MB file, approved.
            fact('s5-file-2', await act('s5', () => L.uploadAndApprove(app, page, EPUB, L.makeFile('ebook-part2.pdf', BYTES))));
            fact('s5-stored', L.storedFormats(app));
            // Step 6: the export again.
            fact('s6-export-two-files', await act('s6', () => L.exportOnix(app, page, `${MODE}-two-files`)));
        } else if (MODE === 'import') {
            // A book moved with the Native XML plugin: the digital format "Sample h21k" with one approved
            // 300 KB file; the book exported (or, with LEGACY=<path>, that earlier export used instead),
            // imported as a new book, the imported formats' stored file size read, and both books
            // exported with the ONIX tool.
            fact('m1-add-sample', await act('m1', () => L.addFormat(app, page, SMALL)));
            fact('m1-sample-file', await act('m1f', () => L.uploadAndApprove(app, page, SMALL, L.makeFile('sample.pdf', 300 * 1024))));
            fact('m1-stored', L.storedFormats(app));
            let file = process.env.LEGACY || null;
            if (!file) {
                const ex = await act('m2', () => L.nativeExport(app, page, `a22-native-${MODE}.xml`));
                fact('m2-native-export', ex);
                file = ex.kept;
            } else fact('m2-native-export', {legacy: file});
            if (file) {
                const im = await act('m3', () => L.nativeImport(app, page, file));
                fact('m3-native-import', im);
                for (const id of im.ids || []) fact(`m3-stored-imported-${id}`, L.storedFormats(app, id));
            }
            fact('m4-onix-export-both', await act('m4', () => L.exportOnix(app, page, `${MODE}-both`)));
            // The imported book's "Sample h21k" › "Metadata" › "Save": the tab sends no "override", so the save clears a stored size.
            const imported = ((facts['m3-native-import'] || {}).ids || [])[0];
            if (imported) {
                fact('m5-save-imported-metadata', await act('m5', () => L.saveMetadata(app, page, imported, SMALL)));
                fact('m5-stored-imported', L.storedFormats(app, imported));
                fact('m6-onix-export-after-save', await act('m6', () => L.exportOnix(app, page, `${MODE}-after-save`)));
            }
        } else {
            // Neighbour: a physical format and a digital one with a 300 KB file, one export.
            fact('n1-add-paperback', await act('n1', async () => {
                const pf = await L.openFormats(app, page);
                const add = await pf.openAdd();
                await add.typeName(PAPER);
                await add.physicalBox().check();
                const physical = await add.physicalBox().isChecked().catch(() => null);
                await add.ok();
                await pf.formatRow(PAPER).waitFor({state: 'visible', timeout: 30_000});
                return {physical};
            }));
            fact('n2-add-small', await act('n2', () => L.addFormat(app, page, SMALL)));
            fact('n3-small-file', await act('n3', () => L.uploadAndApprove(app, page, SMALL, L.makeFile('sample.pdf', 300 * 1024))));
            fact('n3b-add-tiny', await act('n3b', () => L.addFormat(app, page, TINY)));
            fact('n3b-tiny-file', await act('n3bf', () => L.uploadAndApprove(app, page, TINY, L.makeFile('tiny.pdf', 200))));
            fact('n3-stored', L.storedFormats(app));
            fact('n4-export', await act('n4', () => L.exportOnix(app, page, `${MODE}-export`)));
        }
    } finally {
        record(`a22-${MODE}`, facts);
        await close();
    }
});
