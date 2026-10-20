<?php
// PR review check — pkp/pkp-lib#13563, pkp/jatsTemplate#126: ArticleBack at two commits of the plugin, side by side
// on the same references, with the app's classes and no database read.
//   PKP_CONFIG_FILE=<config> php differential.php <app checkout> <base sha> <head sha|worktree> [<cases>] [<out dir>]
// The references are a fixed list (the PR's own cases, edge shapes) and <cases> (default 5000) lines put together
// by a seeded generator from words, typed markup and identifiers in the forms people write them (doi.org and
// dx.doi.org addresses, "doi:", "DOI:", a bare DOI, arXiv, handle and URN forms, web addresses with "&", "'",
// brackets and trailing punctuation, links typed as HTML). Each goes through ExtractPidsHelper as the app's
// import does; a tenth also gets a DOI set by hand. Unstructured ones become <mixed-citation>, structured ones
// <element-citation>; a data citation per identifier type is added. Reads, per reference:
//   text      the reference's text is the same at both commits
//   markup    the elements other than ext-link and pub-id are the same, in the same order
//   links     every link of the base is at the head an ext-link or a pub-id with the same address
//   tagged    at the head, each identifier the reference holds is a <pub-id> of its type, or why not
//   exact     a pub-id's text is the identifier whole: the text does not run on past it in an identifier
//   dtd       the reference list of all references is valid against the checkout's JATS 1.2 DTD, at each commit
// Exits 1 when `text`, `markup`, `links` or the head's `dtd` has a failure.
[$self, $root, $base, $head] = $argv + [null, null, null, null];
$cases = (int) ($argv[4] ?? 5000);
$out = isset($argv[5]) ? realpath($argv[5]) : null;
$plugin = "$root/plugins/generic/jatsTemplate";
if (!$head || !is_dir($plugin) || !getenv('PKP_CONFIG_FILE')) {
    exit("usage: PKP_CONFIG_FILE=<config> php differential.php <app checkout> <base sha> <head sha> [<cases>] [<out dir>]\n");
}
chdir($root);
define('INDEX_FILE_LOCATION', "$root/index.php");
require "$root/lib/pkp/includes/bootstrap.php";

use APP\publication\Publication;
use PKP\citation\Citation;
use PKP\citation\pid\ExtractPidsHelper;
use PKP\dataCitation\DataCitation;

$stub = sys_get_temp_dir() . '/jats-back-differential-' . getmypid();
mkdir($stub);
foreach (['base' => $base, 'head' => $head] as $side => $sha) {
    // "worktree" reads the file as it is in the checkout, e.g. with a tried fix applied
    $source = $sha === 'worktree'
        ? file_get_contents("$plugin/classes/ArticleBack.php")
        : shell_exec('git -C ' . escapeshellarg($plugin) . ' show ' . escapeshellarg("$sha:classes/ArticleBack.php"));
    $source ?: exit("no classes/ArticleBack.php at $sha\n");
    $source = str_replace(
        'namespace APP\plugins\generic\jatsTemplate\classes;',
        "namespace back$side;\nuse APP\\plugins\\generic\\jatsTemplate\\classes\\JatsHelper;",
        $source
    );
    file_put_contents("$stub/$side.php", $source);
    require "$stub/$side.php";
}
array_map('unlink', glob("$stub/*"));
rmdir($stub);

// ---- the references
mt_srand(13563);
$r = fn (array $a) => $a[mt_rand(0, count($a) - 1)];
$fixed = [
    'Author, A. (2020). A <i>cited</i> work. https://doi.org/10.1234/Cited. arXiv:2001.12345. urn:nbn:de:101:1-123',
    'Author, B. (2021). Another work. <a href="https://doi.org/10.1234/linked">https://doi.org/10.1234/linked</a>',
    'Author, C. (2022). A third work. https://example.com/third.',
    'Old, O. (1997). A SICI DOI. doi:10.1002/(SICI)1097-4636(199706)35:4<429::AID-JBM5>3.0.CO;2-P',
    'Link, L. (2020). <a href="https://doi.org/10.1234/text">doi:10.1234/text</a>',
    'Link, M. (2020). <a href="https://example.org/search?q=10.1234/search">search for it</a> 10.1234/search',
    'Link, N. (2020). <a href="https://doi.org/10.1234/split"><i>10.1234/split</i></a>',
    'Quote, Q. (2020). https://example.org/q?x="y" and https://doi.org/10.1234/quote',
    'Amp, A. (2020). https://example.org/?a=1&amp;b=2 typed as an entity',
    'Bracket, B. (2020). (https://doi.org/10.1234/bracket).',
    'Case, C. (2020). HTTPS://DOI.ORG/10.1234/CASE',
    'Two, T. (2020). https://doi.org/10.1234/two.v2 then https://doi.org/10.1234/two',
];
$words = ['Smith, J.', 'Garcia, M.', '(2019).', 'A study of', '<i>Species</i>', 'in', 'the', 'Journal of Tests,', '12(3),', '45-67.', 'Retrieved', 'from', 'et al.', 'Proceedings', '&amp;', 'p&lt;0.05', '«quoted»', 'Ünïcode', '—'];
$dois = ['10.1234/abc', '10.1000/xyz.123', '10.1093/ajae/aaq063', '10.48550/arXiv.2101.00001', '10.1371/journal.pone.0123456', '10.5555/ABC-def_ghi', '10.1234/a(b)c'];
$doiForms = ['https://doi.org/%s', 'http://dx.doi.org/%s', 'doi:%s', 'DOI: %s', 'doi.org/%s', '%s', 'https://doi.org/%s.', '(doi:%s)', '<a href="https://doi.org/%1$s">https://doi.org/%1$s</a>', '<a href="https://doi.org/%1$s">link</a>', 'https://www.example.org/view/%s/pdf'];
$others = ['arXiv:2001.12345', 'arXiv:2001.12345v2', 'https://arxiv.org/abs/2001.54321', 'arXiv:hep-th/9901001', 'hdl:10419/12345', 'https://hdl.handle.net/10419/67890', 'handle:2027/mdp.39015', 'urn:nbn:de:101:1-2017123456', 'URN:NBN:fi-fe2020', 'https://example.org/page?a=1&b=2', "https://example.org/it's", 'https://example.org/q="x"', 'ftp://ftp.example.org/file.txt', '[https://example.org/bracket]', 'https://example.org/trail,'];
$lines = $fixed;
for ($i = 0; $i < $cases; $i++) {
    $parts = [];
    for ($n = mt_rand(3, 8); $n > 0; $n--) {
        $parts[] = $r($words);
    }
    for ($n = mt_rand(0, 3); $n > 0; $n--) {
        $parts[] = mt_rand(0, 1) ? sprintf($r($doiForms), $r($dois)) : $r($others);
        if (mt_rand(0, 2) === 0) {
            $parts[] = $r($words);
        }
    }
    $lines[] = implode(' ', $parts);
}

$citations = [];
foreach ($lines as $i => $line) {
    $c = new Citation();
    $c->setRawCitation($line);
    (new ExtractPidsHelper())->execute($c);
    if ($i % 10 === 9) {
        $c->setData('doi', mt_rand(0, 1) ? '10.9999/hand' . $i : strtoupper($c->getData('doi') ?? '10.9999/x' . $i));
    }
    if ($i % 7 === 6) {
        // structured: an identifier, a title and an author row, sometimes with empty names (U42 A13)
        $c->setData('title', 'A title ' . $i);
        $c->setData('authors', [mt_rand(0, 2) ? ['givenName' => 'Ann', 'familyName' => 'Author'] : ['givenName' => '', 'familyName' => '']]);
        if (!$c->isStructured()) {
            $c->setData('urn', 'urn:nbn:de:' . $i);
        }
    }
    $c->setData('isStructured', $c->isStructured());
    $citations[] = $c;
}
$dataCitations = [];
foreach (['DOI', 'Accession', 'PURL', 'ARK', 'URI', 'ARXIV', 'ECLI', 'Handle', 'ISSN', 'ISBN', 'PMID', 'PMCID', 'UUID', ''] as $j => $type) {
    $d = new DataCitation();
    $d->setAttribute('title', "Data $type");
    $d->setAttribute('relationshipType', 'supporting');
    if ($type !== '') {
        $d->setAttribute('identifierType', $type);
        $d->setAttribute('identifier', "id-$type");
    }
    $d->setAttribute('authors', $j % 2 ? [['givenName' => '', 'familyName' => '']] : [['givenName' => 'Dana', 'familyName' => 'Data']]);
    $dataCitations[] = $d;
}

$publication = new Publication();
$publication->setData('citations', collect($citations));
$publication->setData('dataCitations', collect($dataCitations));
$publication->setData('dataAvailability', []);

$docs = [];
foreach (['base', 'head'] as $side) {
    $class = "back$side\\ArticleBack";
    $doc = new $class();
    $doc->create($publication);
    $docs[$side] = $doc;
}

// ---- the reads
$elements = function (DOMNode $n, array $skip) use (&$elements): array {
    $names = [];
    foreach ($n->childNodes as $c) {
        if ($c instanceof DOMElement) {
            if (!in_array($c->nodeName, $skip)) {
                $names[] = $c->nodeName;
            }
            array_push($names, ...$elements($c, $skip));
        }
    }
    return $names;
};
$links = function (DOMDocument $d, DOMElement $ref): array {
    $x = new DOMXPath($d);
    $l = [];
    // the xlink prefix is a plain attribute name here (as the plugin writes it), so it is read by name
    foreach ($x->query('.//ext-link | .//pub-id', $ref) as $e) {
        if ($e->hasAttribute('xlink:href')) {
            $l[] = $e->getAttribute('xlink:href');
        }
    }
    return $l;
};
$counts = ['refs' => 0, 'mixed' => 0, 'element' => 0, 'data' => 0, 'text' => 0, 'markup' => 0, 'links' => 0, 'changed' => 0, 'notExact' => 0];
$tagged = [];
$fails = [];
$samples = [];
$xb = new DOMXPath($docs['base']);
$xh = new DOMXPath($docs['head']);
$refsB = $xb->query('/back/ref-list/ref');
$refsH = $xh->query('/back/ref-list/ref');
$all = array_merge($citations, $dataCitations);
for ($i = 0; $i < $refsB->length; $i++) {
    $b = $refsB->item($i);
    $h = $refsH->item($i);
    $counts['refs']++;
    $kind = $h->firstChild->nodeName === 'mixed-citation' ? 'mixed' : ($i >= count($citations) ? 'data' : 'element');
    $counts[$kind]++;
    $bx = $docs['base']->saveXML($b);
    $hx = $docs['head']->saveXML($h);
    if ($bx !== $hx) {
        $counts['changed']++;
    }
    $what = $i < count($lines) ? $lines[$i] : 'data ' . $i;
    if ($kind === 'mixed' && $b->textContent !== $h->textContent) {
        $counts['text']++;
        $fails[] = ['read' => 'text', 'line' => $what, 'base' => $bx, 'head' => $hx];
    }
    if ($kind === 'mixed' && $elements($b, ['ext-link', 'pub-id']) !== $elements($h, ['ext-link', 'pub-id'])) {
        $counts['markup']++;
        $fails[] = ['read' => 'markup', 'line' => $what, 'base' => $bx, 'head' => $hx];
    }
    if ($kind === 'mixed') {
        $missing = array_diff($links($docs['base'], $b), $links($docs['head'], $h));
        if ($missing) {
            $counts['links']++;
            $fails[] = ['read' => 'links', 'line' => $what, 'missing' => array_values($missing), 'base' => $bx, 'head' => $hx];
        }
        $c = $all[$i];
        foreach (['doi', 'handle', 'arxiv', 'urn'] as $type) {
            $id = $c->getData($type);
            if (!$id) {
                continue;
            }
            $jatsType = $type === 'urn' ? 'other' : $type;
            $hit = null;
            foreach ($xh->query("mixed-citation/pub-id[@pub-id-type='$jatsType']", $h) as $p) {
                if (strcasecmp($p->textContent, $id) === 0) {
                    $hit = $p;
                }
            }
            if ($hit) {
                $why = 'tagged' . ($hit->hasAttribute('xlink:href') ? ', with the link' : '');
                $next = $hit->nextSibling;
                if ($next && preg_match('~^[A-Za-z0-9/_-]|^\.[A-Za-z0-9]~', $next->textContent)) {
                    $counts['notExact']++;
                    $why .= ', the text runs on';
                    $samples['runs on'][] = $hx;
                }
            } elseif (stripos($b->textContent, $id) === false) {
                $why = 'not in the text';
            } else {
                $why = 'in the text, not tagged';
                $samples["$type in the text, not tagged"][] = $hx;
            }
            $tagged["$type: $why"] = ($tagged["$type: $why"] ?? 0) + 1;
        }
    }
    if ($kind !== 'mixed' && $bx !== $hx) {
        $samples["$kind changed"][] = ['base' => $bx, 'head' => $hx];
    }
}

// the DTD: the reference lists inside a minimal article, each ref on its own line, at each commit
$dtd = realpath("$root/dtd/jats/1.2/JATS-journalpublishing1.dtd");
$dtdRead = [];
foreach ($docs as $side => $doc) {
    $refLines = [];
    foreach ((new DOMXPath($doc))->query('/back/ref-list/ref') as $ref) {
        $refLines[] = $doc->saveXML($ref);
    }
    $xml = "<?xml version=\"1.0\"?>\n<!DOCTYPE article PUBLIC \"-//NLM//DTD JATS (Z39.96) Journal Publishing DTD v1.2 20190208//EN\" \"$dtd\">\n"
        . "<article xmlns:xlink=\"http://www.w3.org/1999/xlink\" xmlns:mml=\"http://www.w3.org/1998/Math/MathML\" dtd-version=\"1.2\">\n<front><journal-meta><journal-id journal-id-type='publisher-id'>j</journal-id><issn>1234-5678</issn></journal-meta><article-meta><title-group><article-title>t</article-title></title-group></article-meta></front>\n<back><ref-list>\n"
        . implode("\n", $refLines) . "\n</ref-list></back></article>\n";
    libxml_use_internal_errors(true);
    $check = new DOMDocument();
    $check->loadXML($xml, LIBXML_DTDLOAD | LIBXML_DTDATTR | LIBXML_NONET);
    $valid = $check->validate();
    $byMessage = [];
    foreach (libxml_get_errors() as $e) {
        $m = trim($e->message);
        $byMessage[$m] = ($byMessage[$m] ?? 0) + 1;
    }
    libxml_clear_errors();
    arsort($byMessage);
    $dtdRead[$side] = ['valid' => $valid, 'errors' => array_sum($byMessage), 'messages' => array_slice($byMessage, 0, 15, true)];
    if ($out) {
        file_put_contents("$out/reflist-$side.xml", $xml);
    }
}

ksort($tagged);
$report = ['references' => count($lines), 'counts' => $counts, 'identifiers at the head' => $tagged, 'dtd' => $dtdRead,
    'fails' => array_slice($fails, 0, 20), 'samples' => array_map(fn ($s) => array_slice($s, 0, 4), $samples)];
echo json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), "\n";
exit($counts['text'] || $counts['markup'] || $counts['links'] || !$dtdRead['head']['valid'] ? 1 : 0);
