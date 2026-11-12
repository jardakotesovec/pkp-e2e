/**
 * @file shared/playwright/support/database.js
 *
 * Which database the app under test runs on: `pgsql` (every push, PR and
 * local fleet), `mysql` or `mariadb` (the daily configurations run, and the
 * `mysql` and `mariadb` lines; harness.md "Other databases and PHP
 * versions"). CI and bin/apps.js name it in PKP_E2E_DATABASE.
 *
 * A test asks only where the application itself answers differently by
 * database and the spec says so (full-text search matches words as the
 * database does; MySQL and MariaDB compare text without regard to case).
 * It is never the way round a failure: a fault the app shows on one
 * database stays red there and gets its ci-triage row (MAINTENANCE "The
 * configurations run").
 */
const database = process.env.PKP_E2E_DATABASE || 'pgsql';

module.exports = {database, onPostgres: database === 'pgsql'};
