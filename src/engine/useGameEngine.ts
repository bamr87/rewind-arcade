import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  GameConfig,
  GameInstance,
  GameManifest,
  HudModel,
  OverlayModel,
  PointerInfo,
} from './types';
import { audio } from './audio';
import { storage } from './storage';

export type EngineStatus = 'running' | 'paused';

export interface EngineApi {
  canvasRef: (el: HTMLCanvasElement | null) => void;
  hud: HudModel;
  overlay: OverlayModel | null;
  status: EngineStatus;
  best: number;
  /** Route an overlay button press into the game. */
  dispatch: (action: string) => void;
  togglePause: () => void;
  /** Rebuild the game session from scratch (used when config changes). */
  restart: () => void;
}

/**
 * Bridges a `GameManifest` to React and the DOM. Owns exactly one canvas, one
 * requestAnimationFrame loop, and all input plumbing. Games see none of this —
 * they only receive the `GameContext` and get their methods called.
 */
export function useGameEngine(manifest: GameManifest, config: GameConfig): EngineApi {
  const [hud, setHud] = useState<HudModel>({});
  const [overlay, setOverlay] = useState<OverlayModel | null>(null);
  const [status, setStatus] = useState<EngineStatus>('running');
  const [best, setBest] = useState<number>(() => storage.bestScore(manifest.id));

  const canvasEl = useRef<HTMLCanvasElement | null>(null);
  const game = useRef<GameInstance | null>(null);
  const raf = useRef<number>(0);
  const lastT = useRef<number>(0);
  const pausedRef = useRef<boolean>(false);
  // Incremented to force a fresh game session (config change / manual restart).
  const [sessionKey, setSessionKey] = useState(0);

  // Live mirrors of state so the (long-lived) input handlers read current values.
  const overlayRef = useRef<OverlayModel | null>(overlay);
  overlayRef.current = overlay;
  const statusRef = useRef<EngineStatus>(status);
  statusRef.current = status;

  const canvasRef = useCallback((el: HTMLCanvasElement | null) => {
    canvasEl.current = el;
  }, []);

  const setPaused = useCallback((paused: boolean) => {
    if (pausedRef.current === paused) return;
    pausedRef.current = paused;
    setStatus(paused ? 'paused' : 'running');
    const g = game.current;
    if (!g) return;
    if (paused) g.onPause?.();
    else {
      lastT.current = performance.now();
      g.onResume?.();
    }
  }, []);

  const togglePause = useCallback(() => {
    // Never overlay pause on top of a game's own flow panel (menu/game over).
    if (!pausedRef.current && overlayRef.current) return;
    setPaused(!pausedRef.current);
  }, [setPaused]);
  const restart = useCallback(() => setSessionKey((k) => k + 1), []);
  const dispatch = useCallback((action: string) => {
    audio.ensure();
    game.current?.onAction?.(action);
  }, []);

  // Full session lifecycle: (re)build the game whenever the manifest, config, or
  // sessionKey changes. This is the single place a GameInstance is born and dies.
  useEffect(() => {
    const canvas = canvasEl.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    pausedRef.current = false;
    setStatus('running');

    const instance = manifest.create({
      ctx,
      config,
      audio,
      now: () => performance.now(),
      setHud,
      setOverlay,
      submitScore: (score: number) => {
        const record = storage.recordScore(manifest.id, score);
        if (record) setBest(score);
        return record;
      },
      getBest: () => storage.bestScore(manifest.id),
    });
    game.current = instance;

    // Opt-in debug bridge (`?debug` in the URL) — handy for tinkering in the
    // console and for automated playtests. Absent unless explicitly requested.
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as { __arcade?: unknown }).__arcade = { manifest, instance };
    }

    // A game declares its own logical resolution (usually derived from config);
    // the host scales that design box to fit the available space.
    const design = instance.design;

    /* ------------------------------ Sizing ------------------------------ */
    let scale = 1;
    const resize = () => {
      const host = canvas.parentElement;
      if (!host) return;
      const availW = host.clientWidth;
      const availH = host.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      scale = Math.max(0.1, Math.min(availW / design.width, availH / design.height));
      canvas.style.width = `${design.width * scale}px`;
      canvas.style.height = `${design.height * scale}px`;
      canvas.width = Math.round(design.width * scale * dpr);
      canvas.height = Math.round(design.height * scale * dpr);
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener('resize', resize);

    /* ------------------------------ Input ------------------------------- */
    const toLogical = (e: PointerEvent): PointerInfo => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - r.left) * (design.width / r.width),
        y: (e.clientY - r.top) * (design.height / r.height),
        button: e.button,
        pointerType: e.pointerType,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      audio.ensure();
      instance.onPointerDown?.(toLogical(e));
    };
    const onPointerMove = (e: PointerEvent) => instance.onPointerMove?.(toLogical(e));
    const onPointerUp = (e: PointerEvent) => instance.onPointerUp?.(toLogical(e));
    const onPointerLeave = () => instance.onPointerLeave?.();
    const onContext = (e: Event) => e.preventDefault();
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      instance.onWheel?.(e.deltaY);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('contextmenu', onContext);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Two classes of keys. SYSTEM keys (Space/Enter/Escape/P) are handled by the
    // host so every game inherits pause + overlay-confirm; they are not forwarded
    // to the game. Everything else is gameplay and goes straight to the instance.
    const onKeyDown = (e: KeyboardEvent) => {
      audio.ensure();
      const code = e.code;

      if (code === 'Space' || code === 'Enter') {
        e.preventDefault();
        if (statusRef.current === 'paused') {
          setPaused(false);
          return;
        }
        const ov = overlayRef.current;
        if (ov) {
          const primary = ov.buttons.find((b) => b.primary) ?? ov.buttons[0];
          if (primary) instance.onAction?.(primary.action);
          return;
        }
        setPaused(true);
        return;
      }
      if (code === 'Escape' || code === 'KeyP') {
        e.preventDefault();
        if (overlayRef.current) return; // don't pause over a flow panel
        setPaused(!pausedRef.current);
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) {
        e.preventDefault();
      }
      instance.onKey?.(code, true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (['Space', 'Enter', 'Escape', 'KeyP'].includes(e.code)) return;
      instance.onKey?.(e.code, false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    /* --------------------------- Auto-pause ----------------------------- */
    const autoPause = () => {
      if (!overlayRef.current) setPaused(true);
    };
    const onBlur = () => autoPause();
    const onVisibility = () => {
      if (document.hidden) autoPause();
    };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);

    /* ------------------------------ Loop -------------------------------- */
    lastT.current = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(0.05, Math.max(0, (t - lastT.current) / 1000));
      lastT.current = t;
      if (!pausedRef.current) instance.update(dt);
      instance.render();
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf.current);
      ro.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('contextmenu', onContext);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      instance.destroy?.();
      game.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, config, sessionKey, setPaused]);

  return { canvasRef, hud, overlay, status, best, dispatch, togglePause, restart };
}
