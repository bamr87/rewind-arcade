import { Database, Gamepad2, Info, Keyboard, Palette, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { useCatalog } from '../catalog/store';
import { hrefFor } from '../engine/router';
import { PHOSPHORS, resetSettings, setSetting, useSettings, type MotionPref } from '../settings/store';
import { useMuted } from './hooks';
import { Button, buttonClass, Kbd, MOD, PageHeader, Panel, Segmented, SettingRow, Switch } from './kit';

const SHORTCUTS: [string[], string][] = [
  [[MOD, 'K'], 'Command palette'],
  [['←', '→'], 'Browse systems'],
  [['↑', '↓'], 'Browse a gamelist'],
  [['Enter'], 'Select or launch'],
  [['Esc'], 'Back'],
  [['F1'], 'Main menu'],
  [['/'], 'Search a gamelist'],
  [['A–Z'], 'Jump to a letter'],
  [['Space'], 'Pause or confirm in game'],
  [['P'], 'Pause in game'],
];

const MOTION: { value: MotionPref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'reduced', label: 'Reduced' },
  { value: 'full', label: 'Full' },
];

export function SettingsPage() {
  const s = useSettings();
  const [muted, toggleMute] = useMuted();
  const catalog = useCatalog();

  return (
    <div className="mx-auto w-full max-w-4xl px-5 pb-16 pt-8 sm:px-8">
      <PageHeader
        kicker="Setup"
        title="Settings"
        actions={
          <Button
            variant="ghost"
            onClick={() => {
              resetSettings();
              toast('Preferences reset');
            }}
          >
            <RotateCcw />
            Reset to defaults
          </Button>
        }
      >
        Preferences for this browser. Nothing here leaves your machine.
      </PageHeader>

      <div className="space-y-5">
        <Panel title="Appearance" icon={<Palette />}>
          <SettingRow label="Phosphor" help="Accent color for the frontend. Each game keeps its own palette in play.">
            <div role="radiogroup" aria-label="Phosphor" className="flex gap-1.5">
              {PHOSPHORS.map((p) => {
                const on = s.phosphor === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={p.label}
                    title={p.label}
                    onClick={() => setSetting('phosphor', p.id)}
                    className="relative grid size-10 place-items-center rounded-full"
                  >
                    {on && (
                      <motion.span
                        layoutId="phosphor-ring"
                        transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                        className="absolute inset-0 rounded-full ring-2 ring-white/80"
                      />
                    )}
                    <span className="size-6 rounded-full" style={{ background: p.color, boxShadow: `0 0 18px ${p.color}` }} />
                  </button>
                );
              })}
            </div>
          </SettingRow>
          <SettingRow label="Ambient backdrop" help="The scrolling horizon grid behind every page.">
            <Switch label="Ambient backdrop" checked={s.ambient} onChange={(v) => setSetting('ambient', v)} />
          </SettingRow>
          <SettingRow label="Motion" help="System follows your operating system's reduced-motion setting.">
            <Segmented id="motion" value={s.motion} options={MOTION} onChange={(v) => setSetting('motion', v)} />
          </SettingRow>
        </Panel>

        <Panel title="Play" icon={<Gamepad2 />}>
          <SettingRow label="CRT filter" help="Scanlines, vignette, and a little extra glow over every game canvas.">
            <Switch label="CRT filter" checked={s.crt} onChange={(v) => setSetting('crt', v)} />
          </SettingRow>
          <SettingRow label="Record celebrations" help="Confetti and a toast when you beat a personal best.">
            <Switch label="Record celebrations" checked={s.confetti} onChange={(v) => setSetting('confetti', v)} />
          </SettingRow>
          <SettingRow label="Sound" help="Synthesized in the browser. There are no audio files.">
            <Switch label="Sound" checked={!muted} onChange={toggleMute} />
          </SettingRow>
        </Panel>

        <Panel title="Data" icon={<Database />}>
          <SettingRow
            label="Collection"
            help={
              catalog.status === 'ready'
                ? `${catalog.bundle?.games.length.toLocaleString()} titles from ${catalog.source === 'workspace' ? 'the local cartidx workspace' : 'an imported data.js'}.`
                : 'No cartidx export loaded. Metadata only, never game files.'
            }
          >
            <a href={hrefFor({ name: 'catalog', tab: 'library' })} className={buttonClass('soft', 'sm')}>
              Open catalog
            </a>
          </SettingRow>
          <SettingRow label="Play history" help="Sessions, records, and favorites. Back up or restore them from the Hall of Fame.">
            <a href={hrefFor({ name: 'profile' })} className={buttonClass('soft', 'sm')}>
              Hall of Fame
            </a>
          </SettingRow>
        </Panel>

        <Panel title="Keyboard and gamepad" icon={<Keyboard />}>
          <dl className="grid gap-x-10 sm:grid-cols-2">
            {SHORTCUTS.map(([keys, label]) => (
              <div key={label} className="flex items-center justify-between gap-4 border-b border-white/5 py-2.5">
                <dt className="text-sm text-dim">{label}</dt>
                <dd className="flex gap-1">
                  {keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[13px] text-faint">A gamepad's d-pad, A, B, and Start work across the system and gamelist views.</p>
        </Panel>

        <Panel title="About" icon={<Info />}>
          <p className="text-sm leading-relaxed text-dim">
            Rewind Arcade ships original recreations, loads dumps you supply into EmulatorJS cores, and browses a cartidx
            collection export. It never downloads games or BIOS, and your files never leave this machine.
          </p>
        </Panel>
      </div>
    </div>
  );
}
