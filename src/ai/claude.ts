// An opponent driven by Claude through the Anthropic API.
//
// Claude acts as the commander: once per movement phase it gets a situation
// report and returns a target hex for each unit; once per combat phase it
// picks attacks from a list of legal options with their odds. The engine
// turns those orders into legal actions, so a bad order can never break the
// rules. Anything Claude does not cover (the invasion and initial phases,
// Determined Defense, advances, errors) falls back to the built-in AI.
import Anthropic from '@anthropic-ai/sdk';
import { MAP } from '../engine/data';
import { alliedVp, applyAction, benchmark, currentWeather, entryReach, landingHexes } from '../engine/game';
import { distance, neighbors, type HexId } from '../engine/hex';
import { allowedModes, cannotMove, entryModes, legalDestinations } from '../engine/movement';
import type { Action, GameState, MoveMode, Side } from '../engine/types';
import { def, goodOrder, isElite, sideOf, stepsRemaining, unitsAt, values } from '../engine/units';
import { columnLabel } from '../engine/combat';
import { bestAttackOn, expectedOutcome } from './evaluate';
import { aggressionFor, createHeuristicAi, type AiPlayer } from './heuristic';

export interface ClaudeAiOptions {
  apiKey: string;
  model: string;
  onStatus?: (s: string) => void;
}

const SYSTEM = `You command one side in a digital adaptation of the board wargame "Salerno '43" (Operation Avalanche, the Allied landings at Salerno, September 1943).
Each game turn is one day. Hexes use four-digit ids CCRR (column, row); columns run west to east, rows north to south.
Victory: the Allies score victory points for the VP hexes they hold in supply, plus bonuses for pushing into the north entry areas toward Naples; from turn 4 they must keep pace with a rising benchmark or lose automatically. Eliminated airborne units and artillery cost the owner points. The Germans try to contain the beachhead, retake VP hexes and stall the Allies.
Movement: clear and road hexes are cheap; hills and marsh are slow, especially for vehicles. Mountain hexsides stop vehicles except on roads or passes. Entering an enemy zone of control stops a unit; two friendly units two hexes apart bond the hex between them against enemy movement and supply.
Combat: one division (the Main Assault Force) attacks at full strength and everything else is halved. Infantry defending in hills, marsh or cities doubles. Tanks, elite units, air, naval gunfire and artillery shift the odds. A defender told to retreat may try a Determined Defense roll to hold instead.
Supply: units cut off from their sources may be isolated and lose steps. The US and Commonwealth forces do not attack together.
You give orders; the game engine checks every order against the rules and moves each unit along the best legal route. Be decisive and coherent: concentrate force, protect flanks and supply, and take or hold victory hexes.`;

function whereText(s: GameState, id: string): string {
  const u = s.units[id];
  switch (u.where.kind) {
    case 'map': return u.where.hex;
    case 'entry': return `offmap@${u.where.area}`;
    case 'reserve': return 'floating reserve (lands at a beachhead or port)';
    case 'followUp': return `follow-up wave (lands at ${u.where.corps} beaches)`;
    case 'atSea': return `at sea, landing at ${u.where.port}`;
    default: return u.where.kind;
  }
}

function sitrep(s: GameState, side: Side): string {
  const wb = currentWeather(s);
  const lines: string[] = [];
  lines.push(`Turn ${s.turn} of ${s.lastTurn} (${8 + s.turn} Sept 1943). You are ${side}. Phase: ${s.phase}.`);
  const bm = benchmark(s.turn);
  lines.push(`Weather: ${wb.name}. Allied VP ${alliedVp(s)}${bm !== null ? `, benchmark ${bm}` : ''}. Supply points: ${s.supplyPoints[side]}.`);
  lines.push(`Ready support: ${s.support.ready.join(', ') || 'none'}${s.support.battleships ? `; battleship uses left ${s.support.battleships}` : ''}.`);
  lines.push('VP hexes (hex: name, value, controller):');
  for (const [h, d] of Object.entries(MAP.hexes)) {
    if (d.vp) lines.push(`  ${h}: ${d.city ?? d.town ?? ''} ${d.vp}VP ${s.control[h] ?? 'German'}`);
  }
  lines.push('Beaches: ' + Object.entries(MAP.beaches).map(([n, b]) => `${n}=${b.hex}`).join(', '));
  const fmt = (id: string) => {
    const u = s.units[id];
    const d = def(id);
    const v = values(u);
    const flags = [
      u.stepsLost ? `${stepsRemaining(u)} step(s) left` : '',
      u.status !== 'good' ? u.status : '',
      u.halfEff ? 'half-effective' : '',
      u.outOfSupply ? 'unsupplied' : '',
      u.isolated ? 'isolated' : '',
      d.asu ? `${d.asu} artillery${u.fired ? ' (fired)' : ''}` : '',
      isElite(u) ? 'elite' : '',
    ].filter(Boolean).join(', ');
    return `  ${id} "${d.name}" ${d.cat} ${v.attack}-${v.defense}-${v.move} at ${whereText(s, id)}${flags ? ` [${flags}]` : ''}`;
  };
  lines.push('Your units:');
  for (const u of Object.values(s.units)) {
    if (sideOf(u) !== side) continue;
    if (['map', 'entry', 'reserve', 'followUp', 'atSea'].includes(u.where.kind)) lines.push(fmt(u.id));
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
          targetHex: { type: 'string', description: 'Four-digit hex the unit should head for (it stops at the closest reachable hex).' },
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

function isLegal(s: GameState, a: Action): boolean {
  try {
    applyAction(structuredClone({ ...s, log: [] }), a);
    return true;
  } catch {
    return false;
  }
}

function closest(hexes: Iterable<HexId>, target: HexId): HexId | null {
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
}

/** Turn "go toward `target`" into one legal action for the unit, or null. */
function orderToAction(s: GameState, unitId: string, target: HexId): Action | null {
  const u = s.units[unitId];
  if (!u || sideOf(u) !== s.activeSide || !MAP.hexes[target]) return null;
  if (u.where.kind === 'map') {
    if (u.mpSpent !== null || cannotMove(s, u)) return null;
    const here = u.where.hex;
    const modes = allowedModes(s, u);
    const order: MoveMode[] = distance(here, target) >= 5 ? ['extended', 'normal', 'tactical'] : ['normal', 'tactical'];
    for (const mode of order) {
      if (!modes.includes(mode)) continue;
      const best = closest(legalDestinations(s, unitId, mode).keys(), target);
      if (best && distance(best, target) < distance(here, target)) return { type: 'move', unitId, to: best, mode };
    }
    return null;
  }
  if (u.where.kind === 'reserve' || u.where.kind === 'followUp' || u.where.kind === 'atSea') {
    const best = closest(landingHexes(s, unitId), target);
    return best ? { type: 'land', unitId, to: best } : null;
  }
  if (u.where.kind === 'entry' && !u.where.area.startsWith('airdrop')) {
    const mode: MoveMode = entryModes(s, u).includes('normal') ? 'normal' : 'tactical';
    const best = closest(entryReach(s, unitId, mode).keys(), target);
    return best ? { type: 'enter', unitId, to: best, mode } : null;
  }
  return null;
}

type Order = { kind: 'goto'; unitId: string; target: HexId } | { kind: 'attack'; action: Action };

export function createClaudeAi(opts: ClaudeAiOptions): AiPlayer {
  const fallback = createHeuristicAi();
  const client = opts.apiKey ? new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true }) : null;
  let memoKey = '';
  let queue: Order[] = [];
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

  async function planMovement(s: GameState): Promise<void> {
    status('Claude is planning movement…');
    const res = await ask<{ plan: string; orders: { unitId: string; targetHex: string }[] }>(
      `${sitrep(s, s.activeSide)}\n\nGive movement orders for this phase. Only list units that should move. ` +
        'Units in the floating reserve or follow-up wave land at a beachhead or friendly port (landing points are limited); ' +
        'units offmap@<area> enter from that map edge. Units next to the enemy may be unable to move far.',
      MOVE_SCHEMA,
    );
    status(`Claude: ${res.plan}`);
    queue = [];
    const seen = new Set<string>();
    for (const o of res.orders) {
      if (seen.has(o.unitId) || !s.units[o.unitId]) continue;
      seen.add(o.unitId);
      queue.push({ kind: 'goto', unitId: o.unitId, target: o.targetHex });
    }
  }

  async function planCombat(s: GameState): Promise<void> {
    const side = s.activeSide;
    const aggression = aggressionFor(s, side);
    const targets = new Set<HexId>();
    for (const u of Object.values(s.units)) {
      if (u.where.kind !== 'map' || sideOf(u) !== side || u.attacked || !goodOrder(u)) continue;
      for (const n of neighbors(u.where.hex)) if (unitsAt(s, n).some((x) => sideOf(x) !== side)) targets.add(n);
    }
    const options = [...targets].map((t) => bestAttackOn(s, t, aggression)).filter((o): o is NonNullable<typeof o> => !!o);
    queue = [];
    if (!options.length) return;
    status('Claude is choosing attacks…');
    const lines = options.map((o, i) => {
      const defenders = unitsAt(s, o.plan.target).filter((u) => sideOf(u) !== side);
      const steps = defenders.reduce((a, u) => a + stepsRemaining(u), 0);
      const e = expectedOutcome(o.odds.finalIndex, o.odds.drm, steps);
      const support = [o.plan.air ? 'air' : '', o.plan.naval ? 'naval' : '', o.plan.battleships ? 'battleships' : '',
        o.plan.asus?.length ? `${o.plan.asus.length} artillery` : ''].filter(Boolean).join(', ');
      const odds = o.odds.autoDs ? 'automatic DS (overrun)' : `final odds ${columnLabel(o.odds.finalIndex)}${o.odds.drm ? `, DRM ${o.odds.drm > 0 ? '+' : ''}${o.odds.drm}` : ''}`;
      return `${i}: attack ${o.plan.target} (${defenders.map((u) => def(u.id).name).join(', ')}) with ${o.plan.attackers.map((id) => def(id).name).join(', ')}` +
        `${support ? ` + ${support}` : ''}: ${o.odds.attack} vs ${o.odds.defense}, ${odds}; expected steps lost: enemy ${e.defLoss.toFixed(2)}, you ${e.attLoss.toFixed(2)}; enemy retreat chance ${(Math.min(1, e.retreat) * 100).toFixed(0)}%`;
    });
    const res = await ask<{ plan: string; attacks: number[] }>(
      `${sitrep(s, side)}\n\nAttack options (each uses all listed units and support; options that share units or support cannot both be made):\n${lines.join('\n')}\n\n` +
        'Choose which attacks to make, in order. An empty list means no attacks.',
      ATTACK_SCHEMA,
    );
    status(`Claude: ${res.plan}`);
    for (const i of res.attacks) {
      const o = options[i];
      if (o) queue.push({ kind: 'attack', action: { type: 'attack', ...o.plan } });
    }
  }

  return {
    name: 'Claude',
    async nextAction(s: GameState): Promise<Action> {
      // The defender's choice, post-combat advances and breakthroughs are handled by the built-in AI.
      if (s.retreatQueue?.length || s.pendingDefense || s.pendingAdvance || s.breakthrough) return fallback.nextAction(s);
      const k = `${s.turn}|${s.activeSide}|${s.phase}`;
      if (k !== memoKey) {
        memoKey = k;
        queue = [];
        planned = false;
        failed = false;
      }
      if ((s.phase !== 'movement' && s.phase !== 'combat') || failed) return fallback.nextAction(s);
      if (!planned) {
        planned = true;
        try {
          if (s.phase === 'movement') await planMovement(s);
          else await planCombat(s);
        } catch (e) {
          failed = true;
          status(`Claude unavailable (${(e as Error).message}); the built-in AI plays this phase.`);
          return fallback.nextAction(s);
        }
      }
      while (queue.length) {
        const o = queue.shift()!;
        const a = o.kind === 'goto' ? orderToAction(s, o.unitId, o.target) : o.action;
        if (a && isLegal(s, a)) return a;
      }
      return { type: 'endPhase' };
    },
  };
}
