# U65 I27D: read a downloaded CSV file with Python's csv module (an RFC 4180
# reader: a quote inside a quoted cell is doubled; a backslash is an ordinary
# character) and print, as JSON, every row with its cell count. Run with
# `python3 -I rfc4180.py <file>`; i27d.js calls it on every file it downloads.
import csv
import io
import json
import sys

path = sys.argv[1]
with open(path, newline='', encoding='utf-8-sig') as f:
    raw = f.read()
rows = list(csv.reader(io.StringIO(raw)))
print(json.dumps({
    'file': path,
    'bom': open(path, 'rb').read(3) == b'\xef\xbb\xbf',
    'physicalLines': raw.count('\n'),
    'rows': [{'n': len(r), 'cells': r} for r in rows],
}, ensure_ascii=False))
