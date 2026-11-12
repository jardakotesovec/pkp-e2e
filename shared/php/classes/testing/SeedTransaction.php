<?php

/**
 * @file classes/testing/SeedTransaction.php
 *
 * Copyright (c) 2026 Simon Fraser University
 * Copyright (c) 2026 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class SeedTransaction
 *
 * @brief Opens the transaction a scenario build runs in.
 *
 * On MySQL and MariaDB the build's transaction reads committed rows, as
 * PostgreSQL's does by default. Under their own default (repeatable read) a
 * DELETE that matches no row locks the gap at the end of the index until the
 * commit, and the app deletes before it inserts (an author's roles, a
 * context's settings): two workers seeding at once each hold that gap and
 * each wait on the other's insert, a deadlock on every busy run (the first
 * MySQL and MariaDB runs, 2026-11-12: sixteen first attempts and U65 S5/S6).
 * The app itself commits each statement on its own, so it never holds the
 * gap; only the build's long transaction does. The level is set for this one
 * transaction: the connection is persistent, and the requests under test
 * keep the database's default.
 */

namespace PKP\testing;

use Illuminate\Support\Facades\DB;

class SeedTransaction
{
    public static function begin(): void
    {
        if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::statement('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        }
        DB::beginTransaction();
    }
}
