<?php

/**
 * @file classes/testing/RorRegistrySeeder.php
 *
 * Copyright (c) 2026 Simon Fraser University
 * Copyright (c) 2026 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class RorRegistrySeeder
 *
 * @brief `POST site` `rors[]` (U43): records in the install's own copy of the
 * ROR registry (the `rors` and `ror_settings` tables), the copy the Funder
 * and affiliation fields read a registry pick's name from. App-neutral: the
 * table, its repository and the write are lib/pkp's alone.
 *
 * Each entry is a ROR API v2 organization record as https://api.ror.org
 * returns it, the same object the Funder field's browser-side search gets in
 * its `items[]` (so a suite answers its search stub and seeds the copy from
 * one fixture). It is written the way the app writes a pick of a funder the
 * copy lacks, once its server has fetched the record (PKPRorController::
 * addOrEdit, `POST rors`): the id checked against the controller's own
 * pattern, `Repo::ror()->mapFromApiRecord()` (the record's `id`, `status` and
 * `names[]`; the other registry fields the app reads nowhere), then
 * `Repo::ror()->newDataObject()` and `->updateOrInsert()`. An id the copy
 * already holds is rewritten with the given record through the same call
 * (what the monthly UpdateRorRegistryDataset refresh does to a held record),
 * so the seed is idempotent. The record is site-wide and stays: no reset
 * removes it until the database is rebuilt.
 *
 * Refusals (400, before anything is written): an id other than a full
 * `https://ror.org/…` registry address (`POST rors` answers 400), a status or
 * name entry of the wrong type, a name type the registry does not use, a
 * key the v2 record does not have, a record with no name at all (the app's
 * mapping finds none: `POST rors` answers 404 "rorNotFound" there), and one
 * id twice. A record whose only names are acronyms or aliases is stored as
 * the app stores it: under its first name.
 */

namespace PKP\testing;

use APP\facades\Repo;

class RorRegistrySeeder
{
    /** PKPRorController::addOrEdit's own check of the id a pick posts. */
    public const ROR_ID_PATTERN = '#^https://ror\.org/(0[a-hj-km-np-tv-z0-9]{6}\d{2})$#';

    /**
     * The ROR API v2 organization record's top-level fields. `id`, `status`
     * and `names` are stored; the others are accepted so a search stub's
     * record seeds as it is, and stored nowhere, as by the app's own write.
     */
    public const STORED_KEYS = ['id', 'status', 'names'];
    public const IGNORED_KEYS = ['admin', 'domains', 'established', 'external_ids', 'links', 'locations', 'relationships', 'types'];

    /** The v2 record's name types. */
    public const NAME_TYPES = ['ror_display', 'label', 'alias', 'acronym'];

    /** The v2 record's statuses. */
    public const STATUSES = ['active', 'inactive', 'withdrawn'];

    /**
     * Parse phase: no writes.
     *
     * @param Spec[] $entries the `rors` list's children
     *
     * @return array<int, array{path: string, params: array}> one plan per
     *   record: the props `mapFromApiRecord()` makes of it
     */
    public function parse(array $entries): array
    {
        if ($entries === []) {
            throw new SpecException('rors', 'rors must list at least one ROR API v2 organization record');
        }
        $plans = [];
        $seen = [];
        foreach ($entries as $entry) {
            $path = $entry->path;
            $id = $entry->require('id');
            if (!is_string($id) || !preg_match(self::ROR_ID_PATTERN, $id)) {
                throw new SpecException("{$path}.id", "{$path}.id must be a full registry address such as \"https://ror.org/01h531d29\" (the pattern POST rors accepts)");
            }
            if (isset($seen[$id])) {
                throw new SpecException("{$path}.id", "{$id} is listed twice (first as {$seen[$id]})");
            }
            $seen[$id] = $path;
            $status = $entry->require('status');
            if (!in_array($status, self::STATUSES, true)) {
                throw new SpecException("{$path}.status", "{$path}.status must be one of the registry's statuses: " . implode(', ', self::STATUSES) . ' (the copy stores "active" as active, any other as inactive)');
            }
            $names = [];
            foreach ($entry->childList('names') as $name) {
                $value = $name->require('value');
                if (!is_string($value) || trim($value) === '') {
                    throw new SpecException("{$name->path}.value", "{$name->path}.value must be a non-empty string");
                }
                $lang = $name->get('lang');
                if ($lang !== null && (!is_string($lang) || $lang === '')) {
                    throw new SpecException("{$name->path}.lang", "{$name->path}.lang must be a language code such as \"en\", or null (the registry's no-language name)");
                }
                $types = $name->require('types');
                if (!is_array($types) || !array_is_list($types) || $types === [] || array_diff($types, self::NAME_TYPES) !== []) {
                    throw new SpecException("{$name->path}.types", "{$name->path}.types must list the registry's name types: " . implode(', ', self::NAME_TYPES));
                }
                $names[] = ['value' => $value, 'lang' => $lang, 'types' => $types];
            }
            $record = ['id' => $id, 'status' => $status, 'names' => $names];
            foreach (self::IGNORED_KEYS as $key) {
                $entry->get($key);
            }
            $params = Repo::ror()->mapFromApiRecord($record);
            if ($params === null || $names === []) {
                throw new SpecException("{$path}.names", "{$path}.names must list at least one name (the app finds no name in such a record: POST rors answers it 404)");
            }
            $plans[] = ['path' => $path, 'params' => $params];
        }
        return $plans;
    }

    /**
     * Execute phase: the app's write, one record at a time.
     *
     * @return array[] each stored record read back, with the properties
     *   `POST rors` answers (its `_href` aside: the schema map builds that
     *   from the request's context, which a site-wide request lacks):
     *   {id, ror, displayLocale, isActive, name}
     */
    public function seed(array $plans): array
    {
        $stored = [];
        foreach ($plans as $plan) {
            $ror = Repo::ror()->newDataObject($plan['params']);
            $id = Repo::ror()->updateOrInsert($ror);
            $ror = Repo::ror()->get($id);
            $stored[] = [
                'id' => $ror->getId(),
                'ror' => $ror->getData('ror'),
                'displayLocale' => $ror->getData('displayLocale'),
                'isActive' => (bool) $ror->getData('isActive'),
                'name' => (object) ($ror->getData('name') ?? []),
            ];
        }
        return $stored;
    }
}
