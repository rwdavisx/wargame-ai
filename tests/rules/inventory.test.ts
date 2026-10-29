// The rules inventory: every numbered section and case of the rulebook (tools/rules-audit/cases.json,
// extracted from the book by tools/rules-audit/extract.py) must have an entry saying whether and where
// it is implemented, and every implemented case must be backed by a rule test tagged with its number.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface Entry { id: string; status: 'implemented' | 'partial' | 'missing' | 'n/a'; code?: string[]; tests?: string[]; notes?: string }
const root = join(__dirname, '../..');
const cases: { id: string; title: string }[] = JSON.parse(readFileSync(join(root, 'tools/rules-audit/cases.json'), 'utf8'));
const dir = join(root, 'tools/rules-audit/inventory');
const entries: Entry[] = readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
const byId = new Map(entries.map((e) => [e.id, e]));
// Rule tests name the cases they check: it('[8.4.2] ...').
const tagged = new Set<string>();
for (const f of readdirSync(__dirname).filter((x) => x.endsWith('.test.ts'))) {
  for (const m of readFileSync(join(__dirname, f), 'utf8').matchAll(/\[((?:S)?\d+\.\d+(?:\.\d+)?)\]/g)) tagged.add(m[1]);
}

describe('rules inventory', () => {
  it('has an entry for every section and case of the rulebook', () => {
    const missing = cases.filter((c) => !byId.has(c.id)).map((c) => `${c.id} ${c.title}`);
    expect(missing).toEqual([]);
  });
  it('lists only real cases, each once', () => {
    const known = new Set(cases.map((c) => c.id));
    expect(entries.filter((e) => !known.has(e.id)).map((e) => e.id)).toEqual([]);
    expect(entries.length).toBe(new Set(entries.map((e) => e.id)).size);
  });
  it('backs every implemented case with a tagged rule test', () => {
    const untested = entries.filter((e) => (e.status === 'implemented' || e.status === 'partial') && !tagged.has(e.id) && !(e.tests ?? []).some((t) => tagged.has(t)));
    expect(untested.map((e) => e.id)).toEqual([]);
  });
});
