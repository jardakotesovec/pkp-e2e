// PR review of pkp/pkp-lib#13552 (PRs #13555 main, #13554 stable-3_5_0): the "Roles" column of the
// Settings wizard's "Users" grid and of the "Merge user" window (UserGridHandler, the one caller of
// UserUserGroup::scopeWithActiveAndActiveInFuture()) leaves out assignments with no date_start.
// On a fleet (any line), as admin:
//   - admin's row on the wizard grid (the Journal/Press/Server manager role PKPContextService::add()
//     gives the context's creator with no start date);
//   - one user given four assignments shaped by SQL, the upgrade's shape and its neighbours:
//       a. the user's own role with date_start NULL (a 3.4 assignment after I9462)  → listed
//       b. another group, date_start NULL and date_end in the past (ended)         → not listed
//       c. another group, date_start in the future (not begun)                      → listed (unchanged)
//       d. another group, dated and ended in the past                               → not listed
//     read on the wizard grid, in the "Merge user" window (opened from another user's row on
//     Settings > Users & Roles), and on the Users & Roles list (control);
//   - the shaped rows are put back afterwards.
//   PROBE_FEATURE=sync PROBE_AGENT=<id> [PKP_E2E_LINE=stable-3_5_0] node bin/probe.js all shared/playwright/checks/sync/pkp-lib-13552/walk.js
const {forEachApp, launch, signIn, signOut, record, screen, sql} = require('../../../probe');
const H = require('../../issues/users-grid-roles-admin-empty-ended-listed/lib.js');

const SUBJECT = 'author.bea';
const OPENER = 'reader.rosa';

function groupName(app, id) {
    return sql(app, `select setting_value from user_group_settings where user_group_id = ${id} and setting_name = 'name' and locale = 'en'`);
}

/** Shape the subject's assignments; returns {expectListed, expectHidden, undo}. */
function shape(app) {
    const userId = Number(sql(app, `select user_id from users where username = '${SUBJECT}'`));
    const own = sql(app, `select user_user_group_id, user_group_id, date_start from user_user_groups where user_id = ${userId} order by user_user_group_id limit 1`).split('|');
    const [ownRowId, ownGroupId, ownStart] = own;
    // three groups of the first context the subject holds none of, managers and the site admin left out
    const others = sql(app, `select user_group_id from user_groups where context_id = 1 and role_id not in (1, 16)
        and user_group_id not in (select user_group_id from user_user_groups where user_id = ${userId})
        order by user_group_id limit 3`).split('\n').filter(Boolean).map(Number);
    if (others.length < 3) {
        throw new Error(`need three other groups, found ${others.length}`);
    }
    const [endedNoStart, future, endedDated] = others;
    sql(app, `update user_user_groups set date_start = null where user_user_group_id = ${ownRowId}`);
    const ins = (g, s, e) => sql(app, `insert into user_user_groups (user_id, user_group_id, date_start, date_end) values (${userId}, ${g}, ${s}, ${e}) returning user_user_group_id`);
    const added = [
        ins(endedNoStart, 'null', `'2001-01-01 00:00:00'`),
        ins(future, `'2999-01-01 00:00:00'`, 'null'),
        ins(endedDated, `'2000-01-01 00:00:00'`, `'2001-01-01 00:00:00'`),
    ].map((r) => Number(r.split('\n')[0]));
    return {
        groups: {
            ownNullStart: groupName(app, ownGroupId),
            endedNoStart: groupName(app, endedNoStart),
            future: groupName(app, future),
            endedDated: groupName(app, endedDated),
        },
        undo() {
            sql(app, `delete from user_user_groups where user_user_group_id in (${added.join(',')})`);
            sql(app, `update user_user_groups set date_start = '${ownStart}' where user_user_group_id = ${ownRowId}`);
        },
    };
}

function split(cell) {
    return (cell || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function verdict(groups, roles) {
    const listed = split(roles);
    return {
        ownNullStartListed: listed.includes(groups.ownNullStart),
        futureListed: listed.includes(groups.future),
        endedNoStartHidden: !listed.includes(groups.endedNoStart),
        endedDatedHidden: !listed.includes(groups.endedDated),
    };
}

forEachApp(async (app) => {
    const facts = {app: app.name, line: process.env.PKP_E2E_LINE || 'main'};
    const shaped = shape(app);
    facts.groups = shaped.groups;
    facts.stored = H.storedRoles(app, SUBJECT);
    facts.storedAdmin = H.storedRoles(app, 'admin');
    const {page, close} = await launch(app);
    try {
        await signIn(page, 'admin');
        const {grid} = await H.openWizardUsers(page, app);
        facts.gridAdmin = await H.searchGrid(grid, 'admin');
        facts.gridSubject = await H.searchGrid(grid, SUBJECT);
        facts.gridVerdict = verdict(shaped.groups, facts.gridSubject && facts.gridSubject.roles);
        record('01-wizard-grid', await screen(page));

        const control = await H.usersListRow(page, app, `${SUBJECT}@mail.test`);
        facts.usersListSubject = control.cells;
        record('02-users-and-roles', await screen(page));

        const merge = await H.openMergeWindow(page, control.list, control.list.row(`${OPENER}@mail.test`).first());
        facts.mergeAdmin = await H.searchGrid(merge.grid, 'admin');
        facts.mergeSubject = await H.searchGrid(merge.grid, SUBJECT);
        facts.mergeVerdict = verdict(shaped.groups, facts.mergeSubject && facts.mergeSubject.roles);
        record('03-merge-window', await screen(page));
        await H.closeMergeWindow(page, merge);
        await signOut(page);
    } catch (e) {
        facts.error = String(e && e.stack || e).slice(0, 1500);
        record('error', await screen(page).catch(() => ({})));
        throw e;
    } finally {
        shaped.undo();
        facts.restored = H.storedRoles(app, SUBJECT);
        record('facts', facts);
        console.log(JSON.stringify(facts, null, 1));
        await close();
    }
});
