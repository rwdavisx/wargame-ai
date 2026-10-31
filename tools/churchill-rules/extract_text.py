"""Extracts the text of the Churchill (GMT, 2nd Edition) rulebook PDF in reading order.

    python3 -I tools/churchill-rules/extract_text.py Churchill_Rules2ndEd.pdf > Churchill_Rules2ndEd.txt

The PDF is GMT's free download:
https://s3-us-west-2.amazonaws.com/gmtwebsiteassets/churchill/Churchill_Rules2ndEd.pdf

The rulebook is set in two columns, so plain `pdftotext` interleaves the columns and `-layout`
keeps them side by side. This reads every text line with its position (`pdftotext -bbox-layout`,
poppler-utils) and emits each page in reading order: the running header; then, between any
lines that run across the gutter (titles, wide captions), the left column followed by the
right column; then the copyright footer. Lines that share a baseline within a column (tables,
a count beside its description) are joined into one row, and words hyphenated across a line
break are rejoined. The three-column index page is emitted with `-layout` instead. The output is not committed: the rule text is GMT's.
"""
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

HEADER_BOTTOM = 44   # page number and "Churchill Rules" sit above this
FOOTER_TOP = 742     # "© 2015, 2016 GMT Games, LLC" sits below this
GUTTER = 306         # the columns meet at the page centre
SLACK = 3            # points a column line may overhang the gutter
ROW_TOL = 3          # lines whose tops are this close form one row
WORD_GAP = 0.8       # a superscript ordinal this close is part of its number ("1st")
ORDINALS = {'st', 'nd', 'rd', 'th'}
LAYOUT_PAGES = {36}  # the index is set in three columns
NS = '{http://www.w3.org/1999/xhtml}'


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout


def lines_of(page):
    out = []
    for line in page.iter(NS + 'line'):
        text, prev_x = '', None
        for w in line.iter(NS + 'word'):
            tight = prev_x is not None and float(w.get('xMin')) - prev_x <= WORD_GAP
            if prev_x is not None and not (tight and w.text in ORDINALS):
                text += ' '
            text += w.text or ''
            prev_x = float(w.get('xMax'))
        box = [float(line.get(k)) for k in ('xMin', 'yMin', 'xMax', 'yMax')]
        out.append((*box, text))
    return out


def rows(lines):
    """Groups lines into rows by their top edge and joins each row left to right."""
    out, cur = [], []
    for ln in sorted(lines, key=lambda l: (l[1], l[0])):
        if cur and ln[1] - cur[0][1] > ROW_TOL:
            out.append(cur)
            cur = []
        cur.append(ln)
    if cur:
        out.append(cur)
    return ['   '.join(l[4] for l in sorted(r, key=lambda l: l[0])) for r in out]


def join_hyphens(text):
    """Rejoins words the typesetter broke across lines ("confer-" / "ence")."""
    return re.sub(r'([a-z])-\n([a-z][^\s]*) ?', r'\1\2\n', text)


def page_text(lines):
    header = [l for l in lines if l[3] <= HEADER_BOTTOM]
    footer = [l for l in lines if l[1] >= FOOTER_TOP]
    body = [l for l in lines if l[3] > HEADER_BOTTOM and l[1] < FOOTER_TOP]
    spans = sorted((l for l in body if l[0] < GUTTER - SLACK and l[2] > GUTTER + SLACK),
                   key=lambda l: l[1])
    cols = [l for l in body if l not in spans]

    parts = ['\n'.join(rows(header))]
    top = HEADER_BOTTOM
    for bottom in sorted({s[1] for s in spans}) + [FOOTER_TOP + 1]:
        band = [l for l in cols if top <= l[1] < bottom]
        left = [l for l in band if (l[0] + l[2]) / 2 < GUTTER]
        right = [l for l in band if (l[0] + l[2]) / 2 >= GUTTER]
        parts += ['\n'.join(rows(left)), '\n'.join(rows(right))]
        span = [s for s in spans if s[1] == bottom]
        parts.append('\n'.join(rows(span)))
        top = bottom
    parts.append('\n'.join(rows(footer)))
    return join_hyphens('\n\n'.join(p for p in parts if p.strip()))


def main(pdf):
    doc = ET.fromstring(run('pdftotext', '-bbox-layout', pdf, '-'))
    for n, page in enumerate(doc.iter(NS + 'page'), 1):
        if n in LAYOUT_PAGES:
            text = run('pdftotext', '-layout', '-f', str(n), '-l', str(n), pdf, '-').strip('\n\f')
        else:
            text = page_text(lines_of(page))
        print(f'===== Page {n} =====\n{text}\n')


if __name__ == '__main__':
    main(sys.argv[1])
