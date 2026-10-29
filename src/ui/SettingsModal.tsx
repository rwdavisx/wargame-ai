// Settings dialog: players, computer opponents, pacing, display and sound.
import type { Side } from '../engine/types';
import { setSound, sfx } from './sound';
import type { Controller, MouseControls, Settings } from './storage';

interface Props {
  settings: Settings;
  setSettings: (s: Settings) => void;
  onClose: () => void;
  inGame?: boolean;
  editorOn?: boolean;
  setEditorOn?: (b: boolean) => void;
}

export function SettingsModal({ settings: s, setSettings, onClose, inGame, editorOn, setEditorOn }: Props) {
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
