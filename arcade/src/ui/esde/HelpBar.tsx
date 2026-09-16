import { padGlyph, padRoles } from '../../engine/gamepad';
import { useSettings } from '../../settings/store';
import { useGamepads } from '../hooks';

type Role = 'confirm' | 'cancel' | 'plain';
type Row = [glyph: string, label: string, role?: Role];

/**
 * The prompts along the bottom. They show the buttons on the controller in the user's
 * hands when one is connected — glyphs follow the layout preference, so a Nintendo pad
 * is told to press A on the right — and the matching keys when one is not.
 */
export function HelpBar({ context }: { context: 'system' | 'gamelist' | 'menu' | 'other' }) {
  const settings = useSettings();
  const pads = useGamepads();
  const pad = settings.gamepad && pads.length > 0;
  const { confirm, cancel } = padRoles();

  const ok = pad ? padGlyph(confirm) : 'Enter';
  const no = pad ? padGlyph(cancel) : 'Esc';
  const menu = pad ? padGlyph('start') : 'F1';
  const find = pad ? padGlyph('north') : '/';
  const jump = pad ? `${padGlyph('l1')}/${padGlyph('r1')}` : 'PgUp/Dn';

  const rows: Row[] =
    context === 'system'
      ? [
          [ok, 'Select', 'confirm'],
          [pad ? '←→' : '←/→', 'System'],
          [find, 'Search'],
          [menu, 'Menu'],
        ]
      : context === 'gamelist'
        ? [
            [ok, 'Launch', 'confirm'],
            [no, 'Back', 'cancel'],
            [pad ? '↑↓' : '↑/↓', 'Game'],
            [jump, 'Jump 10'],
            [find, 'Search'],
            [menu, 'Menu'],
          ]
        : context === 'menu'
          ? [
              [ok, 'Select', 'confirm'],
              [no, 'Close', 'cancel'],
            ]
          : [
              [no, 'Back', 'cancel'],
              [menu, 'Menu'],
            ];

  return (
    <footer className="esde-help">
      {rows.map(([glyph, label, role]) => (
        <span key={label} className="esde-help-item">
          <kbd data-role={role ?? 'plain'}>{glyph}</kbd>
          {label}
        </span>
      ))}
    </footer>
  );
}
