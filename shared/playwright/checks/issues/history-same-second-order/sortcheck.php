<?php
// U37 A33 (issue report docs/issues/U37-A33-history-same-second-order.md): what Collection::sortBy() does with the
// argument TaskResource::toArray() gives it, on real EventLogEntry objects and the app's own Laravel.
// Run from an app root (checkouts/ojs): php ../../shared/playwright/checks/issues/history-same-second-order/sortcheck.php
// It prints the ids in the order each call leaves them; the input is newest first with the entries of one second
// oldest first (2, 3, 4), as the database handed them over in the walk, and one entry out of place (6).
require 'lib/pkp/lib/vendor/autoload.php';

use Illuminate\Support\LazyCollection;
use PKP\log\event\EventLogEntry;

function entry(int $id, string $date): EventLogEntry
{
    $e = new EventLogEntry();
    $e->setData('id', $id);
    $e->setData('dateLogged', $date);
    return $e;
}

$rows = [
    5 => entry(5, '2026-10-09 10:00:05'),
    2 => entry(2, '2026-10-09 10:00:03'),
    3 => entry(3, '2026-10-09 10:00:03'),
    4 => entry(4, '2026-10-09 10:00:03'),
    1 => entry(1, '2026-10-09 10:00:01'),
    6 => entry(6, '2026-10-09 10:00:09'),
];
// the shape EntityDAO::getMany() returns: a LazyCollection keyed by id
$lazy = fn () => LazyCollection::make(function () use ($rows) {
    foreach ($rows as $id => $row) {
        yield $id => $row;
    }
});
$ids = fn ($collection) => implode(', ', array_map(fn (EventLogEntry $e) => $e->getId(), $collection->all()));

echo "input                                          ", $ids($lazy()->collect()), "\n";
echo "['dateLogged' => 'desc', 'id' => 'desc']       ", $ids($lazy()->sortBy(['dateLogged' => 'desc', 'id' => 'desc'])->collect()), "   (TaskResource today)\n";
echo "[['dateLogged', 'desc'], ['id', 'desc']]       ", $ids($lazy()->sortBy([['dateLogged', 'desc'], ['id', 'desc']])->collect()), "   (the pair form)\n";
echo "data_get(\$entry, 'dateLogged')                 ", var_export(data_get($rows[5], 'dateLogged'), true), "\n";
echo "two comparison closures                        ", $ids($lazy()->sortBy([
    fn (EventLogEntry $a, EventLogEntry $b) => $b->getDateLogged() <=> $a->getDateLogged(),
    fn (EventLogEntry $a, EventLogEntry $b) => $b->getId() <=> $a->getId(),
])->collect()), "   (newest first, of one second the highest id first)\n";
