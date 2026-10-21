// U04 housekeeping 2026-10-21, chunk H21 (claim checker cc21d): a local stand-in for ORCID's
// member API work endpoint, so a check can count the work deposits a publish sends and see
// whether a second one arrives as a new work (POST) or as an update of the first (PUT with the
// put-code the first answer gave). Nothing here reaches ORCID's service, and nothing may.
//
// Built on the CA of checks/sync/pkp-lib-13493/orcid-token-stub.js (`ensureCa`, the same
// `<dir>/ca.pem` and `<dir>/php/99-orcid-stub-ca.ini`): the app's PHP trusts it only when the
// process runs with PHP_INI_SCAN_DIR=:<dir>/php. The fleet's web servers are left as they are;
// the check queues the deposit (job_runner Off for the drive) and runs the queue with the
// probe kit's drainJobs(app) from a probe process started with that variable, so the jobs'
// HTTP calls trust the stand-in and the web requests never call out.
//
// Answers (WORK_ANSWER):
//   created   POST /v3.0/<orcid>/work -> 201, a location header naming a new put-code
//             (900001, 900002, ...); PUT /v3.0/<orcid>/work/<put-code> -> 200.
//             LOCATION_HEADER=location (default) or Location: the header name as sent.
//   notfound  every work request -> 404 (what the token stand-in answers, the incidentals
//             row's setup).
// Every request is logged: method, path, the body's put-code and title.
const fs = require('fs');
const http = require('http');
const path = require('path');
const tls = require('tls');
const {execFileSync} = require('child_process');
const {ensureCa} = require('../../sync/pkp-lib-13493/orcid-token-stub');

function hostCertificate(ca, host) {
    if (!/^[a-z0-9.-]+$/i.test(host)) throw new Error(`not a host name: ${host}`);
    const certFile = path.join(ca.dir, `host-${host}.pem`);
    if (!fs.existsSync(certFile)) {
        const csr = path.join(ca.dir, `host-${host}.csr`);
        const ext = path.join(ca.dir, `host-${host}.ext`);
        const run = (args) => execFileSync('openssl', args, {stdio: ['ignore', 'pipe', 'pipe']});
        run(['req', '-new', '-key', ca.leafKey, '-subj', `/CN=${host}`, '-out', csr]);
        fs.writeFileSync(ext, `subjectAltName=DNS:${host}\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`);
        run(['x509', '-req', '-in', csr, '-CA', ca.caFile, '-CAkey', ca.caKey, '-CAcreateserial', '-days', '30', '-sha256', '-extfile', ext, '-out', certFile]);
        fs.rmSync(csr);
        fs.rmSync(ext);
    }
    return fs.readFileSync(certFile);
}

async function startWorkStub({dir, port, answer = 'created', locationHeader = 'location', logFile, jsonFile} = {}) {
    const ca = ensureCa(dir);
    const key = fs.readFileSync(ca.leafKey);
    const contexts = new Map();
    const lines = [];
    const requests = [];
    const add = (entry) => {
        requests.push(entry);
        if (jsonFile) fs.appendFileSync(jsonFile, `${JSON.stringify(entry)}\n`);
    };
    let next = 900001;
    const log = (line) => {
        const stamped = `${new Date().toISOString()} ${line}`;
        lines.push(stamped);
        if (logFile) fs.appendFileSync(logFile, `${stamped}\n`);
    };
    const inner = http.createServer((req, res) => {
        req.socket.stubAnswered = true;
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            const host = req.socket.stubHost || req.headers.host || '?';
            const url = new URL(`https://${host}${req.url}`);
            const body = Buffer.concat(chunks).toString('utf8');
            let json = null;
            try { json = JSON.parse(body); } catch (e) { /* not JSON */ }
            const work = url.pathname.match(/^\/v3\.0\/([0-9X-]+)\/work(?:\/(\d+))?$/);
            let status = 404;
            let headers = {'Content-Type': 'application/json'};
            let out = '{"error":"not_found"}';
            if (work && answer === 'created') {
                if (req.method === 'POST' && !work[2]) {
                    const putCode = next++;
                    status = 201;
                    headers = {[locationHeader]: `https://${host}/v3.0/${work[1]}/work/${putCode}`};
                    out = '';
                } else if (req.method === 'PUT' && work[2]) {
                    status = 200;
                    out = JSON.stringify({...(json || {}), 'put-code': Number(work[2])});
                }
            }
            const entry = {
                at: new Date().toISOString(), method: req.method, path: url.pathname, status,
                bodyPutCode: json ? (json['put-code'] ?? null) : null,
                title: json && json.title && json.title.title ? json.title.title.value : null,
                location: headers[locationHeader] || null,
            };
            add(entry);
            log(`${req.method} ${url.href} -> ${status} put-code-in-body=${entry.bodyPutCode} title=${JSON.stringify(entry.title)}${entry.location ? ` ${locationHeader}: ${entry.location}` : ''}`);
            res.writeHead(status, {...headers, 'Content-Length': Buffer.byteLength(out), Connection: 'close'});
            res.end(out);
        });
    });
    const outer = http.createServer((req, res) => {
        log(`${req.method} ${req.url} -> 404 (plain request, not tunnelled)`);
        res.writeHead(404, {'Content-Type': 'text/plain', Connection: 'close'});
        res.end('not tunnelled\n');
    });
    outer.on('connect', (req, socket, head) => {
        const host = String(req.url).replace(/:\d+$/, '');
        let ctx = contexts.get(host);
        try {
            if (!ctx) { ctx = tls.createSecureContext({key, cert: hostCertificate(ca, host)}); contexts.set(host, ctx); }
        } catch (error) {
            log(`CONNECT ${req.url} -> 502 (${String(error.message).split('\n')[0]})`);
            socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
            return;
        }
        log(`CONNECT ${req.url} -> 200`);
        add({at: new Date().toISOString(), method: 'CONNECT', path: String(req.url), status: 200});
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length) socket.unshift(head);
        const secure = new tls.TLSSocket(socket, {isServer: true, secureContext: ctx});
        secure.stubHost = host;
        secure.on('error', (e) => {
            log(`[stub] TLS with the caller failed for ${host}: ${e.code || ''} (CA not trusted?)`);
            add({at: new Date().toISOString(), method: 'TLS-FAILED', path: host, status: null});
        });
        socket.on('error', () => {});
        inner.emit('connection', secure);
    });
    outer.on('clientError', (e, socket) => socket.destroy());
    await new Promise((resolve, reject) => { outer.once('error', reject); outer.listen(port, '127.0.0.1', resolve); });
    log(`[stub] work stand-in on 127.0.0.1:${port}, answer ${answer}, header ${locationHeader}`);
    return {
        port, proxyUrl: `http://127.0.0.1:${port}`, iniDir: ca.iniDir, lines, requests,
        close: () => new Promise((resolve) => { outer.closeAllConnections(); outer.close(() => resolve()); }),
    };
}

module.exports = {startWorkStub};

// Stand-alone, as its own process (a check whose drainJobs() blocks its own event loop needs
// the stand-in outside it): one JSON line per request in --json.
//   node work-stub.js --dir <dir under .reports/> --port <n> [--answer created|notfound]
//        [--location-header location|Location] --json <file> [--log <file>]
if (require.main === module) {
    const args = process.argv.slice(2);
    const value = (flag, fallback) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
    startWorkStub({
        dir: value('--dir'), port: Number(value('--port')), answer: value('--answer', 'created'),
        locationHeader: value('--location-header', 'location'), jsonFile: value('--json'), logFile: value('--log'),
    }).then((stub) => console.log(`listening ${stub.proxyUrl}`)).catch((e) => { console.error(e.message); process.exit(1); });
}
