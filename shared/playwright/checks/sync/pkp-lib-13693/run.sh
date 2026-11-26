#!/usr/bin/env bash
# PR review pkp-lib#13693, round 2: one app on one line, base then head.
#   run.sh <line: main|stable-3_5_0|stable-3_4_0|stable-3_3_0|ore> <app> <pr> <plugin dir> <EMAIL_KEY|-> <new locale> [php]
# Reloads PKP's dataset into dataset fleet 1 of the line, then at the base
# (the checkout's lib/pkp) walks the tool and an upgrade; swaps in the PR head's
# classes/plugins/Plugin[.inc].php (identical at every app's pointer and the PR
# base, so this is the merge result) and walks the tool, an upgrade and a locale
# install; restores the file. The PR head is fetched as pr-<pr> in lib/pkp first.
set -u
line=$1 app=$2 pr=$3 plugin=$4 key=$5 newloc=$6 php=${7:-php}
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../../../.." && pwd)
[ "$line" = main ] && root=$repo/checkouts/$app || root=$repo/checkouts/$line/$app
f=classes/plugins/Plugin.php; [ -f "$root/lib/pkp/$f" ] || f=classes/plugins/Plugin.inc.php
cfg=$root/config.test.ds1.inc.php
lib=$root/lib/pkp
le=(); [ "$line" != main ] && le=(PKP_E2E_LINE=$line)
(cd "$repo" && env "${le[@]}" npm run "reset:$app" -- --dataset 1 2>&1 | grep -E "^dataset:.*(loaded|upgraded|schema)|rror" | sed 's/^/  /')
w() { bash "$here/walk.sh" "$root" "$cfg" "$plugin" "$key" "$1" "$php"; }
echo "### $line/$app BASE lib/pkp $(git -C $lib rev-parse --short=10 HEAD) ($f identical to pr-$pr~1 $(git -C $lib rev-parse --short=10 pr-$pr~1): $(git -C $lib diff --quiet HEAD pr-$pr~1 -- $f && echo yes || echo NO))"
w tool; w upgrade
git -C $lib checkout pr-$pr -- $f
echo "### $line/$app HEAD $f from pr-$pr $(git -C $lib rev-parse --short=10 pr-$pr)"
w tool; w upgrade; [ "$key" != - ] && w "locale:$newloc"
git -C $lib checkout HEAD -- $f
git -C $lib status --short -- classes/plugins
