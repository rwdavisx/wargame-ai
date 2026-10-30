// Settings dialog: players, computer opponents, pacing, display and sound.
import type { Side } from '../engine/types';
import { useRef, useState, useSyncExternalStore } from 'react';
import { Button, Collapsible, Dialog, DialogHeader, Icon, IconButton, Selector, Slider, Switch, Text, TextInput, VStack } from '@astryxdesign/core';
import { DIFFICULTIES } from '../ai/heuristic';
import { addMusicFiles, musicState, next as nextTrack, removeMusicTrack, subscribeMusic } from './music';
import { setSound, sfx } from './sound';
import type { Controller, MouseControls, Settings } from './storage';
import { SectionLabel } from './astryx/kit';

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

const opts = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));
const AIR = opts([['auto', 'When threatened'], ['always', 'Whenever attacked'], ['never', 'Never']]);

export function SettingsModal({ settings: s, setSettings, onClose, inGame, online, editorOn, setEditorOn }: Props) {
  const set = (patch: Partial<Settings>) => setSettings({ ...s, ...patch });
  const setCtl = (side: Side, c: Controller) => set({ controllers: { ...s.controllers, [side]: c } });
  const close = (open: boolean) => !open && onClose();
  return (
    <Dialog isOpen onOpenChange={close} width={980} maxHeight="88dvh" className="settings">
      <DialogHeader title="Settings" onOpenChange={close} />
      <div className="settings-grid">
        {online ? (
          <section>
            <SectionLabel>Commanders</SectionLabel>
            <Text color="secondary" display="block">An online game: the seats taken in the lobby decide who commands each side, and the host chose the computer's skill.</Text>
          </section>
        ) : (
          <VStack gap={3} as="section">
            <SectionLabel>Commanders</SectionLabel>
            {(['Allied', 'German'] as const).map((side) => (
              <Selector key={side} label={side} width="100%" value={s.controllers[side]} onChange={(v) => setCtl(side, v as Controller)}
                options={opts([['human', 'Human player'], ['heuristic', 'Computer'], ['claude', 'Claude (API key)']])} />
            ))}
            <Selector label="Computer difficulty" width="100%" value={s.aiLevel} onChange={(v) => set({ aiLevel: v as Settings['aiLevel'] })}
              description={DIFFICULTIES.find((d) => d.key === s.aiLevel)?.note} options={DIFFICULTIES.map((d) => ({ value: d.key, label: d.label }))} />
            <TextInput type="password" label="Claude API key" placeholder="sk-ant-..." width="100%" value={s.claudeApiKey}
              description="The key stays in this browser and is sent only to api.anthropic.com." onChange={(v) => set({ claudeApiKey: v.trim() })} />
            <Selector label="Claude model" width="100%" value={s.claudeModel} onChange={(v) => set({ claudeModel: v })}
              options={opts([['claude-opus-5-5', 'Claude Opus 5.5'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-5-5', 'Claude Haiku 5.5']])} />
          </VStack>
        )}
        <VStack gap={3} as="section">
          <SectionLabel>Pace</SectionLabel>
          <Slider label="Computer speed" min={0} max={1500} step={50} value={1500 - s.aiDelayMs} onChange={(v: number) => set({ aiDelayMs: 1500 - v })}
            formatValue={(v) => (v < 500 ? 'Slow' : v < 1100 ? 'Normal' : 'Fast')} width="100%" />
          <Selector label="Animations" width="100%" value={String(s.animSpeed)} onChange={(v) => set({ animSpeed: Number(v) })}
            options={opts([['0.5', 'Fast'], ['1', 'Normal'], ['1.5', 'Slow']])} />
          <Selector label="Combat" width="100%" value={s.combatDice} onChange={(v) => set({ combatDice: v as Settings['combatDice'] })}
            options={opts([['watch', 'Step through it and roll the dice'], ['quick', 'Quick result only']])} />
          <Switch label="Camera follows the computer's moves" value={s.followAi} onChange={(v) => set({ followAi: v })} />
          <SectionLabel>Defensive air support</SectionLabel>
          {(['Allied', 'German'] as const).map((side) => (
            <Selector key={side} label={side} width="100%" value={s.defensiveAir[side]} options={AIR}
              onChange={(v) => set({ defensiveAir: { ...s.defensiveAir, [side]: v as 'auto' | 'always' | 'never' } })} />
          ))}
        </VStack>
        <VStack gap={3} as="section">
          <SectionLabel>Display</SectionLabel>
          <Switch label="Hex grid" value={s.showGrid} onChange={(v) => set({ showGrid: v })} />
          <Switch label="Place names" value={s.showLabels} onChange={(v) => set({ showLabels: v })} />
          <Switch label="Unit cues" description="Ready to act, odds on targets, movement left." value={s.showCues !== false} onChange={(v) => set({ showCues: v })} />
          <Switch label="Check before ending a phase" description="Overstacks, units out of supply, open objectives, good attacks not taken."
            value={s.endChecks !== false} onChange={(v) => set({ endChecks: v })} />
          <Switch label="Turn alerts in online games" description="Buzz and chime when it is your move." value={s.turnAlerts !== false} onChange={(v) => set({ turnAlerts: v })} />
          <SectionLabel>Controls</SectionLabel>
          <Selector label="Mouse controls" width="100%" value={s.mouseControls} onChange={(v) => set({ mouseControls: v as MouseControls })}
            options={opts([['rts', 'Right-click to move and attack'], ['classic', 'Left-click does everything']])} />
          <SectionLabel>Sound</SectionLabel>
          <Switch label="Sound effects" value={s.sound} onChange={(v) => { set({ sound: v }); setSound(v, s.volume); if (v) sfx.select(); }} />
          <Slider label="Volume" min={0} max={1} step={0.05} value={s.volume} width="100%" formatValue={(v) => `${Math.round(v * 100)}%`}
            onChange={(v: number) => { set({ volume: v }); setSound(s.sound, v); }} onChangeEnd={() => sfx.select()} />
          <MusicSettings settings={s} set={set} />
          {inGame && setEditorOn && (
            <>
              <SectionLabel>Map</SectionLabel>
              <Text color="secondary" display="block">Fix the transcribed map against your copy (terrain, hexsides, towns).</Text>
              <Button label={editorOn ? 'Close the map editor' : 'Open the map editor'} onClick={() => { setEditorOn(!editorOn); onClose(); }} />
            </>
          )}
        </VStack>
      </div>
    </Dialog>
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
      <SectionLabel>Music</SectionLabel>
      <Switch label="Background music" value={s.music} onChange={(v) => set({ music: v })} />
      <Slider label="Music volume" min={0} max={1} step={0.05} value={s.musicVolume} isDisabled={!s.music} width="100%"
        formatValue={(v) => `${Math.round(v * 100)}%`} onChange={(v: number) => set({ musicVolume: v })} />
      {m.tracks.length ? (
        <div className="music-now">
          <Text color="secondary">{m.loading ? 'Loading…' : m.current ? <>Now playing: <b>{m.current.title}</b></> : s.music ? 'Starts with your next click' : 'Music is off'}</Text>
          <Button label="Next ▶▶" size="sm" isDisabled={!s.music || m.tracks.length < 2} onClick={() => void nextTrack()} tooltip="Next track" />
        </div>
      ) : (
        <Text color="secondary" display="block">No music yet. Add some of your own below.</Text>
      )}
      <div className="music-add">
        <Button label="Add music files…" size="sm" onClick={() => file.current?.click()} />
        <input ref={file} type="file" accept="audio/*,.ogg,.mp3,.m4a,.opus,.wav,.flac" multiple hidden
          onChange={(e) => {
            const f = e.target.files;
            if (!f?.length) return;
            setNote('Adding…');
            void addMusicFiles(f).then((n) => setNote(n ? `Added ${n} track${n > 1 ? 's' : ''}.` : 'Those files are not music the browser can play.'));
            e.target.value = '';
          }} />
        {note && <Text color="secondary">{note}</Text>}
      </div>
      {mine.length > 0 && (
        <ul className="music-list">
          {mine.map((t) => (
            <li key={t.id} className={m.current?.id === t.id ? 'on' : ''}>
              <span>{t.title}</span>
              <IconButton label={`Remove ${t.title}`} icon={<Icon icon="close" />} size="sm" variant="ghost" onClick={() => void removeMusicTrack(t.id)} />
            </li>
          ))}
        </ul>
      )}
      {bundled.some((t) => t.credit) && (
        <Collapsible className="music-credits" trigger={<Text type="label" color="secondary">Music credits</Text>}>
          <ul>{bundled.map((t) => <li key={t.id}><b>{t.title}</b>{t.credit ? ` · ${t.credit}` : ''}</li>)}</ul>
        </Collapsible>
      )}
      <Text color="secondary" display="block">Your own tracks stay in this browser.</Text>
    </>
  );
}
