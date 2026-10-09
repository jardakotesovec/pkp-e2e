<?php
// Kept check for the PR review of pkp/pkp-lib#13479 (issue pkp/pkp-lib#13477): what each PKP\pid class answers
// for a table of identifiers and reference texts, so two commits of lib/pkp can be compared line by line.
// It loads classes/pid/*.php alone (they need nothing else) from the directory given, never the app, and
// repeats ExtractPidsHelper::execute()'s order of reads (the lookup's first job) over a list of reference texts,
// with that commit's own treatment of "http://" (read from its ExtractPidsHelper.php).
// Run, from the pkp-e2e root, once per commit and diff the two outputs:
//   mkdir -p .reports/pr13479/pid/{base,head}
//   git -C checkouts/ojs/lib/pkp archive <base sha> classes/pid classes/citation/pid | tar -x -C .reports/pr13479/pid/base
//   git -C checkouts/ojs/lib/pkp archive <head sha> classes/pid classes/citation/pid | tar -x -C .reports/pr13479/pid/head
//   php shared/playwright/checks/sync/pkp-lib-13479/pid-table.php .reports/pr13479/pid/base > .reports/pr13479/pid/base.tsv
//   php shared/playwright/checks/sync/pkp-lib-13479/pid-table.php .reports/pr13479/pid/head > .reports/pr13479/pid/head.tsv
//   diff .reports/pr13479/pid/base.tsv .reports/pr13479/pid/head.tsv
// Each line: class, method, input, output (tab separated). "saved" is what a data citation of that type stores
// (dataCitation\Repository::validate() and DataCitation::boot(): extractFromString() ?: removePrefix(), then
// isValid()); "refused" there is the panel's "… is not a valid … identifier." The "lookup" lines give what the
// first job stores for a reference's text: its doi, arxiv, handle, url and urn.

$dir = rtrim($argv[1] ?? '', '/');
if (!is_dir("$dir/classes/pid")) {
    fwrite(STDERR, "usage: php pid-table.php <dir holding classes/pid>\n");
    exit(2);
}
require "$dir/classes/pid/BasePid.php";
require "$dir/classes/pid/Url.php";
foreach (glob("$dir/classes/pid/*.php") as $file) {
    require_once $file;
}

$inputs = [
    'Doi' => [
        '10.1234/abc', '10.1000/jdoi.2020.5', '10.1234/handle.5', 'doi:10.1234/abc', 'DOI: 10.1234/abc', 'doi 10.1234/abc',
        'https://doi.org/10.1234/abc', 'http://doi.org/10.1234/abc', 'https://dx.doi.org/10.1234/abc', 'http://dx.doi.org/10.1234/abc',
        'https://www.doi.org/10.1234/abc', 'http://www.doi.org/10.1234/abc', 'dx.doi.org/10.1234/abc', 'doi.org/10.1234/abc',
        'doi: https://doi.org/10.1234/abc', 'DOI https://doi.org/10.1234/abc', 'https://doi.org/doi:10.1234/abc',
        'DOI: dx.doi.org/10.1234/abc', 'doi:doi.org/10.1234/abc',
        '10.1234/abc.', '10.1234/abc,', '10.1234/abc;', '10.1234/abc)', 'doi:10.1234/abc.', 'doi:10.1234/abc,', 'doi:10.1234/abc;',
        'doi:10.1234/abc:', 'doi:10.1234/abc)', 'doi:10.1234/abc(1)', 'doi:10.1234/(abc)def', 'https://doi.org/10.1016/S0140-6736(20)30183-5',
        'doi:10.1002/(SICI)1097-4571(199806)49:8<693::AID-ASI4>3.0.CO;2-O', 'https://doi.org/10.1002/(SICI)1097-4571(199806)49:8%3C693::AID-ASI4%3E3.0.CO;2-O',
        'Smith J. Title. 2020. https://doi.org/10.1234/abc.123', 'Smith J. Title. doi:10.1234/abc, 2020', 'Smith J. Title (doi:10.1234/abc).',
        'Smith J. Title [doi:10.1234/abc].', 'Smith J. Title. doi:10.1234/abc. Accessed 2020.', 'Smith J. Title. https://doi.org/10.1234/abc/',
        'Smith J. Title. 10.1234/abc.', 'Smith J. Title. DOI 10.1234/abc', 'Smith J. Title. https://doi.org/10.1234/abc?x=1.',
        'Smith J. Title. https://doi.org/10.1234/abc... and more', 'not a doi', 'xyz',
    ],
    'Arxiv' => [
        '2101.12345', '2101.12345v2', '2101.12345V2', '2101.12345vx', 'hep-th/9901001', 'hep-th/9901001v1', 'cs.AI/0601001v1',
        'arxiv:2101.12345', 'arxiv:2101.12345v2', 'arXiv:2101.12345v2', 'arxiv: 2101.12345v2', 'arxiv 2101.12345v2', 'arxiv2101.12345v2',
        'https://arxiv.org/abs/2101.12345v2', 'http://arxiv.org/abs/2101.12345v2', 'https://arxiv.org/pdf/2101.12345v2', 'https://arxiv.org/pdf/2101.12345v2.pdf',
        'https://arxiv.org/abs/hep-th/9901001v1', 'arxiv:2101.12345v2.', 'arxiv:2101.12345v2,', 'arxiv:2101.12345v2)',
        'Doe J. Attention. arXiv:2101.12345v2 [cs.CL].', 'Doe J. Attention. arXiv:2101.12345 vol 2', 'Doe J. Attention (arXiv:2101.12345v12).',
        'Doe J. Attention. arXiv:2101.12345version', 'not-an-arxiv-id', 'xyz',
    ],
    'Handle' => [
        '20.1000/100', '10419/hdlfoo', '10419/handle-12', '2027/mdp.39015', 'handle:20.1000/100', 'Handle: 20.1000/100', 'hdl:20.1000/100', 'hdl 20.1000/100',
        'https://hdl.handle.net/20.1000/100', 'http://hdl.handle.net/20.1000/100', 'hdl.handle.net/20.1000/100', 'hdl:10419/hdlfoo',
        'hdl:20.1000/100.', 'hdl:20.1000/100,', 'hdl:20.1000/100)', 'handle:20.1000/abc def', '20.1000/abc def',
        'Report. hdl:10419/12345. Accessed 2020-01-01.', 'Report. https://hdl.handle.net/10419/12345, 2020.', 'Report (hdl:10419/12345).',
        'Report. hdl:10419/12345 https://example.com/x', 'Report. https://hdl.handle.net/1721.1/12345?show=full', 'xyz',
    ],
    'Ark' => [
        'ark:/12345/abc123', 'https://n2t.net/ark:/12345/abc123', 'http://n2t.net/ark:/12345/abc123', 'ark:/12345/abc123.', 'ark:/12345/abc 123',
        'Map. ark:/12345/abc123, accessed 2020.', 'Map (https://n2t.net/ark:/12345/abc123).', '12345/abc123', 'xyz',
    ],
    'Url' => [
        'https://example.org/data', 'http://example.org/data', 'HTTP://example.org/data', 'http://example.org/data/', 'https://example.org/data.',
        'https://example.org/data,', 'https://example.org/data:', 'https://example.org/a_(b)', 'https://example.org/a?x=1&y=2', 'https://arxiv.org/abs/1234.12345v2',
        'See http://example.org/data.', 'See (http://example.org/data).', 'example.org/data', 'ftp://example.org/data', 'xyz',
        'https://example.org/set/', 'http://example.org/set/', 'https://example.org/set/.', 'https://example.org/data3.', 'https://example.org',
        'https://example.org/', 'https://example.org/a b',
    ],
    'Purl' => [
        'http://purl.org/dc/terms/title', 'https://purl.org/dc/terms/title', 'http://purl.obolibrary.org/obo/GO_0008150', 'purl.org/dc/terms/title', 'xyz',
        'http://purl.org/dc/elements/1.1/', 'http://purl.org/dc/terms/',
    ],
    'Urn' => [
        'urn:nbn:de:101:1-2019072802401757702913', 'URN:NBN:de:101:1-2019072802401757702913', 'urn:nbn:de:1234-5678', 'urn:isbn:0451450523',
        'Thesis. urn:nbn:de:101:1-2019072802401757702913, 2019.', 'Thesis (urn:nbn:de:101:1-2019).', 'Thesis. urn:nbn:de:101:1-2019; more', 'xyz',
    ],
    'Orcid' => [
        '0000-0002-1694-233X', 'https://orcid.org/0000-0002-1694-233X', 'http://orcid.org/0000-0002-1694-233X', 'orcid:0000-0002-1694-233X',
        'ORCID: 0000-0002-1694-233X', 'orcid.org/0000-0002-1694-233X', 'ORCID: https://orcid.org/0000-0002-1694-233X', 'https://orcid.org/0000-0002-1694-233X/', 'xyz',
    ],
    'Pmid' => ['12345678', 'pmid:12345678', 'PMID12345678', 'PMID: 12345678', 'pubmed:12345678', 'https://pubmed.ncbi.nlm.nih.gov/12345678', 'http://pubmed.ncbi.nlm.nih.gov/12345678/', 'https://pubmed.ncbi.nlm.nih.gov/12345678.', 'xyz'],
    'Pmcid' => ['PMC1234567', 'pmcid:PMC1234567', 'PMCID: PMC1234567', 'pmc:PMC1234567', 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567', 'http://www.ncbi.nlm.nih.gov/pmc/articles/PMC1234567/', 'https://ncbi.nlm.nih.gov/pmc/articles/PMC1234567', 'xyz'],
    'Isbn' => ['978-0-306-40615-7', '9780306406157', '030640615X', 'isbn:978-0-306-40615-7', 'ISBN 978-0-306-40615-7', 'ISBN: 9780306406157.', 'xyz'],
    'Issn' => ['2167-8359', 'issn:2167-8359', 'ISSN 2167-8359', 'https://portal.issn.org/resource/ISSN/2167-8359', 'http://portal.issn.org/resource/ISSN/2167-8359', 'ISSN: 2167-835X.', 'xyz'],
    'Ecli' => ['ECLI:NL:HR:2020:1234', 'https://eur-lex.europa.eu/legal-content/redirect/?urn=ECLI:NL:HR:2020:1234', 'http://eur-lex.europa.eu/legal-content/redirect/?urn=ECLI:NL:HR:2020:1234', 'Case ECLI:NL:HR:2020:1234.', 'Case (ECLI:NL:HR:2020:1234).', 'xyz'],
    'Uuid' => ['550e8400-e29b-41d4-a716-446655440000', 'urn:uuid:550e8400-e29b-41d4-a716-446655440000', 'Set 550e8400-e29b-41d4-a716-446655440000.', 'xyz'],
    'Accession' => ['GSE12345', 'http://example.org/GSE12345', 'PRJNA12345.', 'doi:10.1234/abc'],
];

$show = fn ($v) => is_bool($v) ? ($v ? 'true' : 'false') : (string) $v;
foreach ($inputs as $short => $list) {
    $class = "PKP\\pid\\$short";
    foreach ($list as $in) {
        $extracted = $class::extractFromString($in);
        $bare = $class::removePrefix($in);
        $parsed = $extracted ?: $bare;
        $rows = [
            'extractFromString' => $extracted,
            'removePrefix' => $bare,
            'isValid' => $class::isValid($in),
            'saved' => $class::isValid($parsed) ? $parsed : 'refused',
        ];
        foreach ($rows as $method => $out) {
            echo implode("\t", [$short, $method, $in, $show($out)]), "\n";
        }
    }
}

// The lookup's first job, ExtractPidsHelper::execute(), step for step.
$references = [
    'Smith J. Title. 2020. https://doi.org/10.1234/abc.123', 'Smith J. Title. 2020. http://doi.org/10.1234/abc', 'Smith J. Title. http://dx.doi.org/10.1234/abc.',
    'Smith J. Title. https://www.doi.org/10.1234/abc, 2020', 'Smith J. Title. HTTP://DOI.ORG/10.1234/ABC', 'Smith J. Title. DOI:10.1234/ABC see also https://example.org/a',
    'Smith J. Title. doi: 10.1234/abc https://doi.org/10.1234/abc', 'Smith J. Title (doi:10.1234/abc). Available at http://example.org/abc.',
    'Smith J. Title. https://doi.org/10.1234/abc https://doi.org/10.5678/def', 'Smith J. Title. 10.1234/abc https://example.org/x',
    'Doe J. Attention. arXiv:2101.12345v2 [cs.CL]. https://arxiv.org/abs/2101.12345v2', 'Doe J. Attention. http://arxiv.org/abs/2101.12345v2',
    'Doe J. Attention. https://arxiv.org/pdf/2101.12345v2.pdf', 'Doe J. Attention. ARXIV:2101.12345',
    'Report. hdl:10419/12345. Accessed 2020-01-01. http://example.org/report', 'Report. http://hdl.handle.net/10419/12345, 2020.',
    'Report. HDL:10419/12345 and https://hdl.handle.net/10419/12345', 'Report. Handle 10419/12345',
    'Site. Plain address. http://example.org/data', 'Site. https://example.org/data.', 'Site. See http://example.org/report.', 'Site (http://example.org/a).',
    'Site. https://example.org/set/', 'Site. http://purl.org/dc/elements/1.1/.', 'Site. HTTP://example.org/data', 'Site. http://example.org/a http://example.org/b',
    'Site. https://example.org/a?x=1&y=2, accessed 2020', 'Site. www.example.org/data', 'Site. ftp://ftp.example.org/data',
    'Thesis. urn:nbn:de:101:1-2019072802401757702913, 2019.', 'Thesis. urn:nbn:de:101:1-2019 http://example.org/t', 'Plain reference with no identifier, 2019.',
];
$helper = "$dir/classes/citation/pid/ExtractPidsHelper.php";
if (is_file($helper)) {
    $rewrites = str_contains(file_get_contents($helper), "str_ireplace('http://', 'https://'");
    foreach ($references as $text) {
        $raw = $rewrites ? str_ireplace('http://', 'https://', $text) : $text;
        $got = ['doi' => '', 'arxiv' => '', 'handle' => '', 'url' => '', 'urn' => ''];
        foreach (['doi' => 'Doi', 'arxiv' => 'Arxiv', 'handle' => 'Handle'] as $field => $short) {
            $class = "PKP\\pid\\$short";
            $pid = $class::extractFromString($raw);
            if (!empty($pid)) {
                $got[$field] = $pid;
                $raw = $class::removePrefixesWithPid($pid, $raw);
            }
        }
        $url = PKP\pid\Url::extractFromString($raw);
        if (!empty($url)) {
            $got['url'] = $url;
            $raw = str_replace($url, '', $raw);
        }
        $got['urn'] = PKP\pid\Urn::extractFromString($raw);
        foreach ($got as $field => $value) {
            echo implode("\t", ['lookup', $field, $text, $value]), "\n";
        }
    }
}
