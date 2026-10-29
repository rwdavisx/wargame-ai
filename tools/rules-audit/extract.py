"""Lists every numbered rule section and case in the Salerno '43 rulebook, in order.

    python3 tools/rules-audit/extract.py RULES.txt > /tmp/cases.json

RULES.txt is `pdftotext -layout` (or plain) output of the living rules PDF you own. Only the
numbers and headings are kept (no rule text), so the inventory can be checked against the book:
every case must appear in tools/rules-audit/inventory.json with a status and its tests.
"""
import json
import re
import sys

text = open(sys.argv[1], encoding='utf-8').read().splitlines()
seen = {}
order = []
pat_section = re.compile(r'^\s*((?:S)?\d{1,2}\.\d{1,2})\s+([A-Z0-9][^\n]{1,70})$')
pat_case = re.compile(r'^\s*\(((?:S)?\d{1,2}\.\d{1,2}\.\d{1,2})\)\s*([^:.\n]{1,70})')
for line in text:
    m = pat_case.match(line) or pat_section.match(line)
    if not m:
        continue
    rid, title = m.group(1), m.group(2).strip().rstrip(':').strip()
    if rid in seen:
        continue
    major = int(re.sub(r'^S', '', rid).split('.')[0])
    if not rid.startswith('S') and major > 25:
        continue
    seen[rid] = title
    order.append(rid)

def key(r):
    s = r.startswith('S')
    return (1 if s else 0, [int(x) for x in re.sub(r'^S', '', r).split('.')])

out = [{'id': r, 'title': seen[r]} for r in sorted(order, key=key)]
json.dump(out, sys.stdout, indent=1)
print(file=sys.stderr, end=f'{len(out)} rule sections and cases\n')
