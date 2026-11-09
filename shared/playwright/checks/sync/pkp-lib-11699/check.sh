#!/bin/bash
# Kept check for docs/reports/2026-11-09-pkp-lib-11699.md: after the 3.5 -> main upgrade, edit_tasks keeps
# a `status` column a fresh install lacks (I11702_ExtendTasks uses Blueprint::removeColumn, which drops nothing).
# Usage (from the repo root), per app:
#   PKP_E2E_DATASET_BRANCH=stable-3_5_0 npm run fleet-prep -- --feature sync11699 --dataset 3 --reset --apps <app>
#   shared/playwright/checks/sync/pkp-lib-11699/check.sh <app> 3
# Prints the column in the upgraded dataset DB and in the campaign's fresh install; fixed when both say "absent".
app=${1:?app}; n=${2:-3}
export PGPASSWORD=${PGPASSWORD:-e2e}
q="select coalesce(string_agg(data_type||' default '||coalesce(column_default,'-')||' nullable '||is_nullable, ','),'absent') from information_schema.columns where table_name='edit_tasks' and column_name='status'"
echo "upgraded ${app}_test_ds${n}: $(psql -h 127.0.0.1 -U e2e -d ${app}_test_ds${n} -tAc "$q")"
echo "fresh    ${app}_test:       $(psql -h 127.0.0.1 -U e2e -d ${app}_test -tAc "$q")"
