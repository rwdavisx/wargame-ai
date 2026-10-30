// Settings dialog: players, computer opponents, pacing, display and sound.
import type { Side } from '../engine/types';
import { useRef, useState, useSyncExternalStore } from 'react';
import { DIFFICULTIES } from '../ai/heuristic';
import { addMusicFiles, musicState, next as nextTrack, removeMusicTrack, subscribeMusic } from './music';
import { setSound, sfx } from './sound';
import type { Controller, MouseControls, Settings } from './storage';

interface Props {
  settings: Settings;
  setSettings: (s: Settings) => void;
  onClose: () => void;
  inGame?: boolean;
  /** An online game: the seats decide the commanders. */
  online?: boolean;
  editorOn?: boolean;
  setEditorOn?: (b: boolean) => void;
}

export function SettingsModal({ settings: s, setSettings, onClose, inGame, online, editorOn, setEditorOn }: Props) {
  const set = (patch: Partial<Settings>) => setSettings({ ...s, ...patch });
  const setCtl = (side: Side, c: Controller) => set({ controllers: { ...s.controllers, [side]: c } });
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal settings" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Settings</h2>
          <button className="close" onClick={onClose}>✕</button>
        </header>
        <div className="settings-grid">
          {online ? (
            <section>
              <h3>Commanders</h3>
              <p className="hint">An online game: the seats taken in the lobby decide who commands each side, and the host chose the computer's skill.</p>
            </section>
          ) : (
            <section>
              <h3>Commanders</h3>
              {(['Allied', 'German'] as const).map((side) => (
                <label key={side} className="field">
                  <span>{side}</span>
                  <select value={s.controllers[side]} onChange={(e) => setCtl(side, e.target.value as Controller)}>
                    <option value="human">Human player</option>
                    <option value="heuristic">Computer</option>
                    <option value="claude">Claude (API key)</option>
                  </select>
                </label>
              ))}
              <label className="field">
                <span>Computer difficulty</span>
                <select value={s.aiLevel} onChange={(e) => set({ aiLevel: e.target.value as Settings['aiLevel'] })}>
                  {DIFFICULTIES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </label>
              <p className="hint">{DIFFICULTIES.find((d) => d.key === s.aiLevel)?.note}</p>
              <label className="field">
                <span>Claude API key</span>
                <input type="password" placeholder="sk-ant-..." value={s.claudeApiKey} onChange={(e) => set({ claudeApiKey: e.target.value.trim() })} />
              </label>
              <label className="field">
                <span>Claude model</span>
                <select value={s.claudeModel} onChange={(e) => set({ claudeModel: e.target.value })}>
                  <option value="claude-opus-5-5">Claude Opus 5.5</option>
                  <option value="claude-sonnet-5-5">Claude Sonnet 5.5</option>
                  <option value="claude-haiku-5-5">Claude Haiku 5.5</option>
                </select>
              </label>
              <p className="hint">The key stays in this browser and is sent only to api.anthropic.com.</p>
            </section>
          )}
          <section>
            <h3>Pace</h3>
            <label className="field">
              <span>Computer speed</span>
              <input type="range" min={0} max={1500} step={50} value={1500 - s.aiDelayMs} onChange={(e) => set({ aiDelayMs: 1500 - Number(e.target.value) })} />
            </label>
            <label className="field">
              <span>Animations</span>
              <select value={s.animSpeed} onChange={(e) => set({ animSpeed: Number(e.target.value) })}>
                <option value={0.5}>Fast</option>
                <option value={1}>Normal</option>
                <option value={1.5}>Slow</option>
              </select>
            </label>
            <label className="field">
              <span>Combat</span>
              <select value={s.combatDice} onChange={(e) => set({ combatDice: e.target.value as Settings['combatDice'] })}>
                <option value="watch">Step through it and roll the dice</option>
                <option value="quick">Quick result only</option>
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={s.followAi} onChange={(e) => set({ followAi: e.target.checked })} /> Camera follows the computer's moves
            </label>
            <h3>Defensive air support</h3>
            {(['Allied', 'German'] as const).map((side) => (
              <label key={side} className="field">
                <span>{side}</span>
                <select value={s.defensiveAir[side]} onChange={(e) => set({ defensiveAir: { ...s.defensiveAir, [side]: e.target.value as 'auto' | 'always' | 'never' } })}>
                  <option value="auto">When threatened</option>
                  <option value="always">Whenever attacked</option>
                  <option value="never">Never</option>
                </select>
              </label>
            ))}
          </section>
          <section>
            <h3>Display</h3>
            <label className="check">
              <input type="checkbox" checked={s.showGrid} onChange={(e) => set({ showGrid: e.target.checked })} /> Hex grid
            </label>
            <label className="check">
              <input type="checkbox" checked={s.showLabels} onChange={(e) => set({ showLabels: e.target.checked })} /> Place names
            </label>
            <label className="check">
              <input type="checkbox" checked={s.showCues !== false} onChange={(e) => set({ showCues: e.target.checked })} /> Unit cues: ready to act, odds on targets, movement left
            </label>
            <label className="check">
              <input type="checkbox" checked={s.endChecks !== false} onChange={(e) => set({ endChecks: e.target.checked })} /> Check before ending a phase: overstacks, units out of supply, open objectives, good attacks not taken
            </label>
            <label className="check">
              <input type="checkbox" checked={s.turnAlerts !== false} onChange={(e) => set({ turnAlerts: e.target.checked })} /> Online games: buzz and chime when it is your move
            </label>
            <h3>Controls</h3>
            <label className="field">
              <span>Mouse controls</span>
              <select value={s.mouseControls} onChange={(e) => set({ mouseControls: e.target.value as MouseControls })}>
                <option value="rts">Right-click to move and attack</option>
                <option value="classic">Left-click does everything</option>
              </select>
            </label>
            <h3>Sound</h3>
            <label className="check">
              <input type="checkbox" checked={s.sound} onChange={(e) => { set({ sound: e.target.checked }); setSound(e.target.checked, s.volume); if (e.target.checked) sfx.select(); }} /> Sound effects
            </label>
            <label className="field">
              <span>Volume</span>
              <input type="range" min={0} max={1} step={0.05} value={s.volume} onChange={(e) => { set({ volume: Number(e.target.value) }); setSound(s.sound, Number(e.target.value)); }}
                onPointerUp={() => sfx.select()} />
            </label>
            <MusicSettings settings={s} set={set} />
            {inGame && setEditorOn && (
              <>
                <h3>Map</h3>
                <p className="hint">Fix the transcribed map against your copy (terrain, hexsides, towns).</p>
                <button onClick={() => { setEditorOn(!editorOn); onClose(); }}>{editorOn ? 'Close the map editor' : 'Open the map editor'}</button>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** Music: on or off, its own volume, what is playing, and the player's own tracks. */
function MusicSettings({ settings: s, set }: { settings: Settings; set: (p: Partial<Settings>) => void }) {
  const m = useSyncExternalStore(subscribeMusic, musicState);
  const file = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const mine = m.tracks.filter((t) => t.mine);
  const bundled = m.tracks.filter((t) => !t.mine);
  return (
    <>
      <h3>Music</h3>
      <label className="check">
        <input type="checkbox" checked={s.music} onChange={(e) => set({ music: e.target.checked })} /> Background music
      </label>
      <label className="field">
        <span>Music volume</span>
        <input type="range" min={0} max={1} step={0.05} value={s.musicVolume} disabled={!s.music} onChange={(e) => set({ musicVolume: Number(e.target.value) })} />
      </label>
      {m.tracks.length ? (
        <div className="music-now">
          <span>{m.loading ? 'Loading…' : m.current ? <>Now playing: <b>{m.current.title}</b></> : s.music ? 'Starts with your next click' : 'Music is off'}</span>
          <button disabled={!s.music || m.tracks.length < 2} onClick={() => void nextTrack()} title="Next track">Next ▶▶</button>
        </div>
      ) : (
        <p className="hint">No music yet. Add some of your own below.</p>
      )}
      <div className="music-add">
        <button onClick={() => file.current?.click()}>Add music files…</button>
        <input ref={file} type="file" accept="audio/*,.ogg,.mp3,.m4a,.opus,.wav,.flac" multiple hidden
          onChange={(e) => {
            const f = e.target.files;
            if (!f?.length) return;
            setNote('Adding…');
            void addMusicFiles(f).then((n) => setNote(n ? `Added ${n} track${n > 1 ? 's' : ''}.` : 'Those files are not music the browser can play.'));
            e.target.value = '';
          }} />
        {note && <span className="hint">{note}</span>}
      </div>
      {mine.length > 0 && (
        <ul className="music-list">
          {mine.map((t) => (
            <li key={t.id} className={m.current?.id === t.id ? 'on' : ''}>
              <span>{t.title}</span>
              <button className="close" title="Remove" onClick={() => void removeMusicTrack(t.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      {bundled.some((t) => t.credit) && (
        <details className="music-credits">
          <summary>Music credits</summary>
          <ul>{bundled.map((t) => <li key={t.id}><b>{t.title}</b>{t.credit ? ` · ${t.credit}` : ''}</li>)}</ul>
        </details>
      )}
      <p className="hint">Your own tracks stay in this browser.</p>
    </>
  );
}
