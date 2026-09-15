import { useCallback, useRef, useState } from 'react';
import { clearCatalog, importCatalogFile, type CatalogState } from '../../catalog/store';

export function ImportPanel({ catalog }: { catalog: CatalogState }) {
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await importCatalogFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file');
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="cat-import">
      <div
        className={`emu-drop cat-drop${drag ? ' is-drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void take(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".js,.json,text/javascript,application/json"
          hidden
          onChange={(e) => void take(e.target.files?.[0])}
        />
        <div className="emu-drop-icon">📚</div>
        <h2>{busy ? 'Reading catalog…' : 'Drop a cartidx export'}</h2>
        <p>workspace/web/data.js from <code>cartidx build</code> — metadata only, never ROMs.</p>
        {error && <p className="emu-warn">{error}</p>}
      </div>
      {catalog.source === 'import' && (
        <button className="btn btn--ghost" onClick={() => void clearCatalog()}>
          Clear imported collection
        </button>
      )}
    </div>
  );
}
