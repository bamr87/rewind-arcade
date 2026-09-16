import clsx from 'clsx';
import { Database, Gamepad, Gamepad2, HardDrive, Info, Keyboard, Palette, RotateCcw } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useCatalog } from '../catalog/store';
import { mb } from '../catalog/format';
import {
  clearStored,
  forgetFolder,
  grantFolder,
  pickFolder,
  supportsFolder,
  useRomLibrary,
} from '../emulate/library';
import { useRoms } from '../emulate/roms';
import { padGlyph, padRoles, subscribePad, type PadButton, type PadInfo } from '../engine/gamepad';
import { hrefFor } from '../engine/router';
import {
  PAD_LAYOUTS,
  PHOSPHORS,
  resetSettings,
  setSetting,
  useSettings,
  type MotionPref,
} from '../settings/store';
import { useGamepads, useMuted } from './hooks';
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

        <RomLibraryPanel />

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

        <GamepadPanel />

        <Panel title="Keyboard" icon={<Keyboard />}>
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

/**
 * The dumps this browser can reach. On a deployed site this is the only source there is,
 * so it lives in settings as well as on the Emulate page.
 */
function RomLibraryPanel() {
  const lib = useRomLibrary();
  const roms = useRoms();
  const stored = roms.bySystem.size
    ? [...roms.bySystem.values()].flat().filter((r) => r.source === 'stored')
    : [];
  const storedBytes = stored.reduce((n, r) => n + r.size, 0);

  return (
    <Panel title="ROM library" icon={<HardDrive />}>
      <SettingRow
        label="Roms folder"
        help={
          lib.folderStatus === 'granted'
            ? `Reading ${lib.folderName} on demand. Nothing was copied.`
            : lib.folderStatus === 'prompt'
              ? `${lib.folderName ?? 'A folder'} is remembered, but a browser only re-grants access from a click.`
              : supportsFolder()
                ? 'Grant a roms/<system-id>/ folder once and this browser reopens it on every visit.'
                : 'This browser has no folder access. Add files on the Emulate page instead; they are kept here.'
        }
      >
        {lib.folderStatus === 'granted' ? (
          <Button variant="ghost" disabled={lib.busy} onClick={() => void forgetFolder()}>
            Forget folder
          </Button>
        ) : lib.folderStatus === 'prompt' ? (
          <Button disabled={lib.busy} onClick={() => void grantFolder()}>
            Re-open folder
          </Button>
        ) : (
          <Button disabled={lib.busy || !supportsFolder()} onClick={() => void pickFolder()}>
            Open roms folder
          </Button>
        )}
      </SettingRow>
      <SettingRow
        label="Kept in this browser"
        help={
          stored.length
            ? `${stored.length} dump${stored.length === 1 ? '' : 's'}, ${mb(storedBytes)}. Stored on this device only — nothing is uploaded.`
            : 'Dumps you drop on the Emulate page are stored here so they survive a reload.'
        }
      >
        <Button
          variant="danger"
          disabled={!stored.length || lib.busy}
          onClick={() => {
            void clearStored();
            toast('Cleared the dumps kept in this browser');
          }}
        >
          Clear
        </Button>
      </SettingRow>
      <p className="mt-4 text-[13px] text-faint">
        {roms.counts.server > 0
          ? `The dev server is also listing ${roms.count - roms.counts.folder - roms.counts.stored} dump(s) from ${roms.root}.`
          : 'No game files are ever downloaded or shipped — the site only plays what you point it at.'}
      </p>
    </Panel>
  );
}

function GamepadPanel() {
  const s = useSettings();
  const pads = useGamepads();
  const { confirm, cancel } = padRoles();
  const layout = PAD_LAYOUTS.find((l) => l.id === s.padLayout);

  return (
    <Panel title="Gamepad" icon={<Gamepad />}>
      <SettingRow
        label="Gamepad navigation"
        help="Steer the carousel and gamelists, move a focus ring across the other pages, and play every recreation."
      >
        <Switch label="Gamepad navigation" checked={s.gamepad} onChange={(v) => setSetting('gamepad', v)} />
      </SettingRow>
      <SettingRow label="Button layout" help={layout?.note}>
        <Segmented
          id="pad-layout"
          value={s.padLayout}
          options={PAD_LAYOUTS.map((l) => ({ value: l.id, label: l.label }))}
          onChange={(v) => setSetting('padLayout', v)}
        />
      </SettingRow>
      <SettingRow label="Rumble" help="A short bump when a game launches and when you beat a record.">
        <Switch label="Rumble" checked={s.rumble} onChange={(v) => setSetting('rumble', v)} />
      </SettingRow>
      <PadTester pads={pads} />
      <p className="mt-3 text-[13px] leading-relaxed text-faint">
        {padGlyph(confirm)} selects · {padGlyph(cancel)} goes back · {padGlyph('start')} opens the menu ·{' '}
        {padGlyph('north')} searches · {padGlyph('l1')}/{padGlyph('r1')} jump ten at a time. In a game the pad is the
        game's, apart from {padGlyph('start')} for pause.
      </p>
    </Panel>
  );
}

const TEST_BUTTONS: PadButton[] = [
  'up', 'down', 'left', 'right',
  'south', 'east', 'west', 'north',
  'l1', 'r1', 'l2', 'r2',
  'select', 'start',
];

/** Live button read-out, so a mapping can be checked rather than guessed at. */
function PadTester({ pads }: { pads: PadInfo[] }) {
  const [held, setHeld] = useState<Set<PadButton>>(() => new Set());

  useEffect(
    () =>
      subscribePad((e) => {
        setHeld((prev) => {
          // Auto-repeat re-reports a button that is already lit.
          if (e.down === prev.has(e.button)) return prev;
          const next = new Set(prev);
          if (e.down) next.add(e.button);
          else next.delete(e.button);
          return next;
        });
      }),
    [],
  );

  return (
    <div className="mt-4 rounded-xl bg-white/4 p-4 ring-1 ring-inset ring-white/8">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
          {pads.length ? pads[0].id : 'No controller yet'}
        </span>
        {pads.length > 1 && <span className="shrink-0 font-mono text-[11px] text-faint">+{pads.length - 1}</span>}
      </div>
      <p className="mt-1 text-[13px] text-faint">
        {pads.length
          ? 'Press buttons to check the mapping.'
          : 'Connect one and press any button — browsers keep a pad hidden until it is used.'}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {TEST_BUTTONS.map((b) => (
          <span
            key={b}
            className={clsx(
              'grid h-7 min-w-9 place-items-center rounded-lg px-2 font-mono text-[11px] ring-1 ring-inset transition',
              held.has(b) ? 'bg-accent/20 text-accent ring-accent/50' : 'bg-white/4 text-faint ring-white/10',
            )}
          >
            {padGlyph(b)}
          </span>
        ))}
      </div>
    </div>
  );
}
