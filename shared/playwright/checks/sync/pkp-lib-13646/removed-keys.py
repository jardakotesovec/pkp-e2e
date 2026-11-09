#!/usr/bin/env python3
# PR review of pkp/pkp-lib#13646: for each locale whose manager.po the OMP PR touched, the
# translation OMP held for each key it removed, beside the one pkp-lib holds at the commit OMP
# pins, so a removal that leaves a language with an empty pkp-lib entry shows (bozana's catch,
# 2026-11-09: pkp-lib had the msgid with msgstr "").
#   python3 -I removed-keys.py <omp clone> <omp commit before> <omp commit after>
import re, subprocess, sys
omp, before, after = sys.argv[1:4]
git = lambda *a, cwd=omp: subprocess.run(['git', *a], cwd=cwd, capture_output=True, text=True).stdout
def entries(text):
    out, key, buf, mode = {}, None, [], None
    for line in text.split('\n') + ['']:
        if line.startswith('msgid '):
            if key is not None: out[key] = ''.join(buf)
            key, buf, mode = re.match(r'msgid "(.*)"', line).group(1), [], 'id'
        elif line.startswith('msgstr '):
            buf, mode = [re.match(r'msgstr "(.*)"', line).group(1)], 'str'
        elif line.startswith('"') and mode == 'str':
            buf.append(line[1:-1])
        elif mode == 'str' and not line.strip():
            if key is not None: out[key] = ''.join(buf)
            key, mode = None, None
    return out
pkp = git('ls-tree', after, 'lib/pkp').split()[2]
files = [f for f in git('diff', '--name-only', before, after, '--', 'locale').split() if f.endswith('manager.po')]
bad = 0
for f in files:
    old, new = entries(git('show', f'{before}:{f}')), entries(git('show', f'{after}:{f}'))
    lib = entries(git('show', f'{pkp}:{f}', cwd=omp + '/lib/pkp'))
    for k in sorted(set(old) - set(new)):
        state = 'EMPTY' if not lib.get(k) else 'ok'
        bad += state != 'ok'
        print(f'{state:5} {f.split("/")[1]:6} {k}: omp "{old[k][:50]}" | pkp-lib {pkp[:10]} "{(lib.get(k) or "")[:50]}"')
print(f'{bad} removed key(s) left without a pkp-lib translation')
