# compare.py <appRoot> <filter_groups dump: symbolic|display_name|description|input_type|output_type>
# Prints each installed group whose row differs from its filterConfig.xml, and the
# filterConfig groups with no row. Run with python3 -I.
import sys, os
import xml.etree.ElementTree as ET
root, dump = sys.argv[1], sys.argv[2]
want = {}
for d, _, fs in os.walk(root):
    if any(x in d for x in ('/node_modules', '/.git', '/vendor', '/cache')): continue
    for f in fs:
        if f == 'filterConfig.xml':
            for g in ET.parse(os.path.join(d, f)).iter('filterGroup'):
                a = g.attrib
                want[a['symbolic']] = (a.get('displayName'), a.get('description'), a.get('inputType'), a.get('outputType'), os.path.relpath(os.path.join(d, f), root))
have = {}
for line in open(dump):
    p = line.rstrip('\n').split('|')
    if len(p) == 5: have[p[0]] = tuple(p[1:])
names = ('displayName', 'description', 'inputType', 'outputType')
diff = 0
for s, w in sorted(want.items()):
    if s not in have:
        print(f'  no row: {s} ({w[4]})'); diff += 1; continue
    for i, n in enumerate(names):
        if have[s][i] != w[i]:
            print(f'  differs: {s} {n}: db "{have[s][i]}" xml "{w[i]}"'); diff += 1
extra = sorted(set(have) - set(want))
print(f'  rows {len(have)}, filterConfig groups {len(want)}, differences {diff}; rows no filterConfig defines: {len(extra)} {" ".join(extra)}')
