<?php
// Validates JATS files against the JATS Journal Publishing 1.2 DTD the app checkout ships (dtd/jats/1.2), with
// no network: the document's root is moved under a DOCTYPE that names the local file.
//   php validate-dtd.php <app checkout> <file.xml> […]
// Prints one line per file, "valid" or each error; exits 1 when any file is not valid.
[$self, $root] = $argv;
$dtd = realpath("$root/dtd/jats/1.2/JATS-journalpublishing1.dtd") ?: exit("no DTD under $root\n");
libxml_use_internal_errors(true);
$bad = 0;
foreach (array_slice($argv, 2) as $file) {
    $source = new DOMDocument();
    // An OAI record wraps the article and puts it in a namespace the DTD does not know: read the article alone, without it
    $xml = file_get_contents($file);
    if (preg_match('~<article[\s>].*</article>~s', $xml, $m)) {
        $xml = str_replace(' xmlns="https://jats.nlm.nih.gov/publishing/1.2/"', '', $m[0]);
    }
    if (!$source->loadXML($xml, LIBXML_NONET)) {
        echo basename($file) . ": not well-formed\n";
        $bad++;
        libxml_clear_errors();
        continue;
    }
    $article = $source->getElementsByTagName('article')->item(0);
    $impl = new DOMImplementation();
    $doc = $impl->createDocument(null, '', $impl->createDocumentType('article', '-//NLM//DTD JATS (Z39.96) Journal Publishing DTD v1.2 20190208//EN', $dtd));
    $doc->appendChild($doc->importNode($article, true));
    $check = new DOMDocument();
    $check->loadXML($doc->saveXML(), LIBXML_DTDLOAD | LIBXML_DTDATTR | LIBXML_NONET);
    $valid = $check->validate();
    $errors = array_map(fn ($e) => trim($e->message), libxml_get_errors());
    libxml_clear_errors();
    echo basename($file) . ': ' . ($valid ? 'valid' : implode(' | ', array_unique($errors))) . "\n";
    $bad += $valid ? 0 : 1;
}
exit($bad ? 1 : 0);
