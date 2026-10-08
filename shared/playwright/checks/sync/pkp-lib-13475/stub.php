<?php
/**
 * Stand-in for api.openalex.org and api.crossref.org, served by `php -S` from lookups.php (PR review
 * of pkp/pkp-lib#13475). It answers with the shapes the two services document, cut down to what
 * `openAlex\Inbound::getWork()` and `crossref\Inbound::getWork()` read.
 *   /works/doi:10.1234/names     an OpenAlex work whose authors are a mononym, a one-word organisation,
 *                                a "Family, Given" name, a two-word name and a three-word organisation
 *   /works/doi:10.1234/noauthors an OpenAlex work with no `authorships` key
 *   /works/?query.bibliographic= a Crossref hit scoring 120 whose title is in the query, with no `author`
 */
header('Content-Type: application/json');
$uri = urldecode($_SERVER['REQUEST_URI']);

$work = [
    'id' => 'https://openalex.org/W13475',
    'title' => 'Alpha study of things',
    'publication_date' => '2020-05-04',
    'type' => 'article',
    'type_crossref' => 'journal-article',
    'biblio' => ['volume' => '7', 'issue' => '2', 'first_page' => '11', 'last_page' => '19'],
    'locations' => [['source' => ['display_name' => 'Journal of Things', 'issn_l' => '1234-5678', 'host_organization_name' => 'Test Press', 'type' => 'journal'], 'raw_source_name' => 'Journal of Things']],
    'ids' => ['wikidata' => null],
];
$authorship = fn (string $name, int $n) => [
    'author' => ['id' => "https://openalex.org/A1347{$n}", 'display_name' => $name, 'orcid' => null],
    'raw_author_name' => $name,
];

if (str_contains($uri, '/works/doi:10.1234/names')) {
    $work['authorships'] = [
        $authorship('Plato', 1),
        $authorship('UNESCO', 2),
        $authorship('Lovelace, Ada', 3),
        $authorship('Grace Hopper', 4),
        $authorship('World Health Organization', 5),
    ];
    echo json_encode($work);
} elseif (str_contains($uri, '/works/doi:10.1234/noauthors')) {
    echo json_encode($work);
} elseif (str_contains($uri, '/works/?query.bibliographic=')) {
    echo json_encode(['status' => 'ok', 'message' => ['items' => [[
        'DOI' => '10.1234/crossref-hit',
        'score' => 120,
        'title' => ['Alpha study of things'],
    ]]]]);
} else {
    http_response_code(404);
    echo json_encode(['error' => 'not found']);
}
