// An opponent driven by Claude through the Anthropic API.
//
// Claude acts as the commander: once per movement phase it gets a situation
// report and returns a target hex for each unit; once per combat phase it
// picks attacks from a list of legal options with their odds. The engine
// turns those orders into legal actions, so a bad order can never break the
// rules. Anything Claude does not cover (replacements, advances, errors)
// falls back to the built-in heuristic AI.
import Anthropic from '@anthropic-ai/sdk';
import { MAP } from '../engine/data';
import { alliedVp, benchmark, currentWeather, landingHexes } from '../engine/game';
import { distance, neighbors, type HexId } from '../engine/hex';
import { entryDestinations, legalDestinations } from '../engine/movement';
import type { Action, GameState, Side } from '../engine/types';
import { def, isCombatUnit, sideOf, unitsAt, values } from '../engine/units';
import { bestAttackOn, expectedOutcome } from './evaluate';
import { aggressionFor, createHeuristicAi, type AiPlayer } from './heuristic';
import { columnLabel } from '../engine/combat';

export interface ClaudeAiOptions {
  apiKey: string;
  model: string;
  onStatus?: (s: string) => void;
}

const SYSTEM = `You are commanding one side in a digital adaptation of the board wargame "Salerno '43" (the Allied landings at Salerno, September 1943).
Each game turn is one day. Hexes use four-digit ids CCRR (column, row); columns run west to east, rows north to south.
Victory: the Allies score victory points (VP) for VP hexes they control; they must keep pace with a rising benchmark. The Germans try to contain or destroy the beachhead and hold VP hexes.
Movement: clear terrain costs 1 MP, hills 2, marsh 3; rivers and mountain hexsides cost extra unless crossed by road; roads are cheap. Units must stop on entering a hex next to an enemy unit (zone of control).
Combat: attacks are odds-based (attack strength vs defence strength), shifted by terrain, armour, air, naval gunfire and artillery. Losses are in steps.
You give orders; the game engine checks every order against the rules and moves units along the best legal route. Be decisive and coherent: concentrate force, protect your flanks and supply, and take or hold victory hexes.`;

function sitrep(s: GameState, side: Side): string {
  const wb = currentWeather(s);
  const lines: string[] = [];
  lines.push(`Turn ${s.turn} of ${s.lastTurn} (${8 + s.turn} Sept 1943). You are ${side}. Phase: ${s.phase}.`);
  lines.push(`Weather: ${wb.name}. Allied VP ${alliedVp(s)}${benchmark(s.turn) !== null ? `, benchmark ${benchmark(s.turn)}` : ''}.`);
  lines.push('VP hexes (hex: name, value, controller):');
  for (const [h, d] of Object.entries(MAP.hexes)) {
    if (d.vp) lines.push(`  ${h}: ${d.city ?? d.town ?? ''} ${d.vp}VP ${s.control[h] ?? 'German'}`);
  }
  lines.push('Beach hexes: ' + Object.entries(MAP.beaches).map(([n, b]) => `${n}=${b.hex}`).join(', '));
  const fmt = (id: string) => {
    const u = s.units[id];
    const v = values(u);
    const flags = [u.stepsLost ? 'reduced' : '', u.disrupted ? 'disrupted' : '', u.outOfSupply ? 'unsupplied' : '', def(id).type === 'asu' ? 'artillery' : '']
      .filter(Boolean).join(',');
    const where = u.where.kind === 'map' ? u.where.hex : u.where.kind === 'entry' ? `offmap@${u.where.area}` : u.where.kind;
    return `  ${id} "${def(id).name}" ${def(id).type} ${v.attack}-${v.defense}-${v.move} at ${where}${flags ? ` [${flags}]` : ''}`;
  };
  lines.push('Your units:');
  for (const u of Object.values(s.units)) {
    if (sideOf(u) !== side) continue;
    if (u.where.kind === 'map' || u.where.kind === 'entry' || u.where.kind === 'reserve') lines.push(fmt(u.id));
  }
  lines.push('Enemy units on the map:');
  for (const u of Object.values(s.units)) {
    if (sideOf(u) === side || u.where.kind !== 'map') continue;
    lines.push(fmt(u.id));
  }
  return lines.join('\n');
}

const MOVE_SCHEMA = {
  type: 'object',
  properties: {
    plan: { type: 'string', description: 'One or two sentences on your intent this turn.' },
    orders: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          unitId: { type: 'string' },
          targetHex: { type: 'string', description: 'Four-digit hex the unit should move toward (it stops at the closest reachable hex).' },
        },
        required: ['unitId', 'targetHex'],
        additionalProperties: false,
      },
    },
  },
  required: ['plan', 'orders'],
  additionalProperties: false,
};

const ATTACK_SCHEMA = {
  type: 'object',
  properties: {
    plan: { type: 'string' },
    attacks: { type: 'array', items: { type: 'integer' }, description: 'Option numbers to execute, in order.' },
  },
  required: ['plan', 'attacks'],
  additionalProperties: false,
};

export function createClaudeAi(opts: ClaudeAiOptions): AiPlayer {
  const fallback = createHeuristicAi();
  const client = opts.apiKey ? new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true }) : null;
  let memoKey = '';
  let queue: Action[] = [];
  let planned = false;
  let failed = false;
  const status = (t: string) => opts.onStatus?.(t);

  async function ask<T>(prompt: string, schema: object): Promise<T> {
    if (!client) throw new Error('No Claude API key set (Setup tab).');
    const response = await client.beta.messages.create({
      model: opts.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
      messages: [{ role: 'user', content: prompt }],
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (response.stop_reason === 'refusal') throw new Error('Claude declined to plan this phase.');
    if (response.stop_reason === 'max_tokens') throw new Error('Claude ran out of output tokens.');
    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')?.text ?? '';
    return JSON.parse(text) as T;
  }

  function closestReachable(s: GameState, unitId: string, target: HexId): Action | null {
    const u = s.units[unitId];
    if (!u || sideOf(u) !== s.activeSide || !MAP.hexes[target]) return null;
    const pick = (hexes: Iterable<HexId>) => {
      let best: HexId | null = null;
      let bd = Infinity;
      for (const h of hexes) {
        const d = distance(h, target);
        if (d < bd) {
          bd = d;
          best = h;
        }
      }
      return best;
    };
    if (u.where.kind === 'map') {
      if (u.mpSpent !== null) return null;
      const dests = legalDestinations(s, unitId, 'tactical');
      const best = pick(dests.keys());
      if (!best || distance(best, target) >= distance(u.where.hex, target)) return null;
      return { type: 'move', unitId, to: best };
    }
    if (u.where.kind === 'reserve' || (u.where.kind === 'entry' && (u.where.area === 'airdrop' || u.where.area.startsWith('hex:')))) {
      const best = pick(landingHexes(s, unitId));
      return best ? { type: 'land', unitId, to: best } : null;
    }
    if (u.where.kind === 'entry') {
      const best = pick(entryDestinations(s, unitId, u.where.area, 'tactical').keys());
      return best ? { type: 'enter', unitId, to: best } : null;
    }
    return null;
  }

  async function planMovement(s: GameState): Promise<void> {
    status('Claude is planning movement…');
    const res = await ask<{ plan: string; orders: { unitId: string; targetHex: string }[] }>(
      `${sitrep(s, s.activeSide)}\n\nGive movement orders for this phase. Only list units that should move. Units in reserve land at beaches or friendly ports; units offmap@<area> enter from that map edge.`,
      MOVE_SCHEMA,
    );
    status(`Claude: ${res.plan}`);
    queue = [];
    const seen = new Set<string>();
    for (const o of res.orders) {
      if (seen.has(o.unitId) || !s.units[o.unitId]) continue;
      seen.add(o.unitId);
      queue.push({ type: 'move', unitId: o.unitId, to: o.targetHex }); // resolved lazily against the live state
    }
  }

  async function planCombat(s: GameState): Promise<void> {
    const aggression = aggressionFor(s, s.activeSide);
    const targets = new Set<HexId>();
    for (const u of Object.values(s.units)) {
      if (u.where.kind !== 'map' || sideOf(u) !== s.activeSide || !isCombatUnit(u) || u.attacked || u.disrupted) continue;
      for (const n of neighbors(u.where.hex)) if (unitsAt(s, n).some((x) => sideOf(x) !== s.activeSide)) targets.add(n);
    }
    const options = [...targets]
      .map((t) => bestAttackOn(s, t, aggression))
      .filter((o): o is NonNullable<typeof o> => !!o);
    queue = [];
    if (!options.length) return;
    status('Claude is choosing attacks…');
    const lines = options.map((o, i) => {
      const defSteps = unitsAt(s, o.plan.target).length;
      const e = expectedOutcome(o.odds.finalIndex, o.odds.drm, defSteps);
      return `${i}: attack ${o.plan.target} (${unitsAt(s, o.plan.target).map((u) => def(u.id).name).join(', ')}) with ${o.plan.attackers.map((id) => def(id).name).join(', ')}` +
        `${o.plan.air ? ' +air' : ''}${o.plan.naval ? ' +naval' : ''}${o.plan.asus?.length ? ` +${o.plan.asus.length} artillery` : ''}: ` +
        `${o.odds.attack} vs ${o.odds.defense}, final odds ${columnLabel(o.odds.finalIndex)}; expected steps lost: enemy ${e.defLoss.toFixed(2)}, you ${e.attLoss.toFixed(2)}; enemy retreat chance ${(e.retreat * 100).toFixed(0)}%`;
    });
    const res = await ask<{ plan: string; attacks: number[] }>(
      `${sitrep(s, s.activeSide)}\n\nAttack options (each uses all listed units; options that share units cannot both be made):\n${lines.join('\n')}\n\nChoose which attacks to make, in order. An empty list means no attacks.`,
      ATTACK_SCHEMA,
    );
    status(`Claude: ${res.plan}`);
    for (const i of res.attacks) {
      const o = options[i];
      if (o) queue.push({ type: 'attack', ...o.plan });
    }
  }

  return {
    name: 'Claude',
    async nextAction(s: GameState): Promise<Action> {
      const k = `${s.turn}|${s.activeSide}|${s.phase}`;
      if (k !== memoKey) {
        memoKey = k;
        queue = [];
        planned = false;
        failed = false;
      }
      if (s.pendingAdvance || s.phase === 'initial' || failed) return fallback.nextAction(s);
      if (!planned) {
        planned = true;
        try {
          if (s.phase === 'movement') await planMovement(s);
          else if (s.phase === 'combat') await planCombat(s);
        } catch (e) {
          failed = true;
          status(`Claude unavailable (${(e as Error).message}); the built-in AI plays this phase.`);
          return fallback.nextAction(s);
        }
      }
      while (queue.length) {
        const a = queue.shift()!;
        if (a.type === 'move') {
          const resolved = closestReachable(s, a.unitId, a.to);
          if (resolved) return resolved;
          continue;
        }
        if (a.type === 'attack') {
          const stillValid = a.attackers.every((id) => {
            const u = s.units[id];
            return u.where.kind === 'map' && !u.attacked && !u.disrupted;
          }) && unitsAt(s, a.target).some((u) => sideOf(u) !== s.activeSide);
          if (stillValid) return a;
          continue;
        }
        return a;
      }
      return { type: 'endPhase' };
    },
  };
}
