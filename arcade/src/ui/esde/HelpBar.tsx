export function HelpBar({
  context,
}: {
  context: 'system' | 'gamelist' | 'menu' | 'other';
}) {
  const rows =
    context === 'system'
      ? [
          ['A', 'Select'],
          ['L/R', 'System'],
          ['Start', 'Menu'],
        ]
      : context === 'gamelist'
        ? [
            ['A', 'Launch'],
            ['B', 'Back'],
            ['U/D', 'Game'],
            ['Start', 'Menu'],
          ]
        : context === 'menu'
          ? [
              ['A', 'Select'],
              ['B', 'Close'],
            ]
          : [
              ['B', 'Back'],
              ['Start', 'Menu'],
            ];
  return (
    <footer className="esde-help">
      {rows.map(([btn, label]) => (
        <span key={btn} className="esde-help-item">
          <kbd data-btn={btn}>{btn}</kbd>
          {label}
        </span>
      ))}
    </footer>
  );
}
