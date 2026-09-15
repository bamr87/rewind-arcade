import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../engine/router';
import { storage } from '../../engine/storage';
import { useEsdeInput } from '../../esde/input';
import type { EsSystem } from '../../esde/library';
import { SystemArt } from './SystemArt';

export function SystemView({
  systems,
  menuOpen,
  onMenu,
}: {
  systems: EsSystem[];
  menuOpen: boolean;
  onMenu: () => void;
}) {
  // Selection is held by id, not position: the list grows when a catalog export finishes
  // loading, and a remembered index would then point at a different console.
  const [selectedId, setSelectedId] = useState(() => storage.getJson<string>('esde:system', systems[0]?.id ?? ''));
  const found = systems.findIndex((s) => s.id === selectedId);
  const index = found >= 0 ? found : 0;
  const indexRef = useRef(index);
  indexRef.current = index;
  const systemsRef = useRef(systems);
  systemsRef.current = systems;

  useEffect(() => {
    // Only persist a system that is actually in the list; one that has not loaded yet stays saved.
    if (found >= 0) storage.setJson('esde:system', selectedId);
  }, [found, selectedId]);

  const move = (dir: number) => {
    setSelectedId((id) => {
      const list = systemsRef.current;
      if (!list.length) return id;
      const at = Math.max(0, list.findIndex((s) => s.id === id));
      return list[(at + dir + list.length) % list.length].id;
    });
  };

  const enter = () => {
    const s = systems[indexRef.current];
    if (s) navigate({ name: 'gamelist', systemId: s.id });
  };

  useEsdeInput((action) => {
    if (action === 'left') move(-1);
    if (action === 'right') move(1);
    if (action === 'accept' || action === 'down') enter();
    if (action === 'menu') onMenu();
  }, !menuOpen);

  const current = systems[index];

  return (
    <div
      className="esde-systems"
      onWheel={(e) => { if (Math.abs(e.deltaX) + Math.abs(e.deltaY) > 8) move(e.deltaY > 0 || e.deltaX > 0 ? 1 : -1); }}
    >
      <div className="esde-wheel" aria-label="Systems">
        {systems.map((s, i) => {
          const offset = i - index;
          const wrapped = offset > systems.length / 2 ? offset - systems.length
            : offset < -systems.length / 2 ? offset + systems.length
            : offset;
          if (Math.abs(wrapped) > 4) return null;
          const dist = Math.abs(wrapped);
          return (
            <button
              key={s.id}
              className={`esde-sys${wrapped === 0 ? ' is-on' : ''}`}
              style={{
                ['--hue' as string]: s.hue,
                zIndex: 10 - dist,
                opacity: 1 - dist * 0.28,
                transform: `translate(-50%, -50%) translateX(${wrapped * 210}px) translateZ(${-dist * 90}px) rotateY(${wrapped * -16}deg) scale(${1 - dist * 0.16})`,
              }}
              onClick={() => { if (wrapped === 0) enter(); else setSelectedId(s.id); }}
            >
              <SystemArt
                id={s.id}
                short={s.short}
                hue={s.hue}
                media={s.media}
                icon={s.icon}
                // Only cards near the front fan out covers; the rest would load art nobody can see.
                covers={dist <= 2 ? s.covers : undefined}
              />
            </button>
          );
        })}
      </div>
      {current && (
        <div className="esde-sys-meta">
          <h1>{current.name}</h1>
          <p>
            {current.count.toLocaleString()} {current.count === 1 ? 'GAME' : 'GAMES'} AVAILABLE
            {current.year ? ` · ${current.year}` : ''}
            {current.media ? ` · ${current.media}` : ''}
          </p>
          {current.facts?.ov && (
            <p className="mx-auto mt-3 line-clamp-2 max-w-2xl text-[13px] normal-case leading-relaxed tracking-normal text-dim">
              {current.facts.ov}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
