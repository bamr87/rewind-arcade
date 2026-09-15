import { useEffect, useState } from 'react';

/**
 * A dependency-free hash router. Hash routing keeps the portal working from any
 * static host — or a bare file path — with no server rewrite rules.
 *
 * Routes:
 *   #/                 -> arcade home
 *   #/play/<id>        -> a recreated game
 *   #/emulate          -> console picker
 *   #/emulate/<id>     -> load a dump for that system
 */
export interface Route {
  name: 'arcade' | 'play' | 'emulate';
  gameId?: string;
  systemId?: string;
}

function parse(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'play' && parts[1]) return { name: 'play', gameId: decodeURIComponent(parts[1]) };
  if (parts[0] === 'emulate') {
    return parts[1]
      ? { name: 'emulate', systemId: decodeURIComponent(parts[1]) }
      : { name: 'emulate' };
  }
  return { name: 'arcade' };
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function navigate(route: Route) {
  const hash =
    route.name === 'play' && route.gameId ? `#/play/${route.gameId}`
    : route.name === 'emulate' ? (route.systemId ? `#/emulate/${route.systemId}` : '#/emulate')
    : '#/';
  if (window.location.hash !== hash) window.location.hash = hash;
  else window.scrollTo(0, 0);
}
