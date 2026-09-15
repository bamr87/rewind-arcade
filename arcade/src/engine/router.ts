import { useEffect, useState } from 'react';
import type { CatalogTab } from '../catalog/types';

export interface Route {
  name: 'arcade' | 'play' | 'emulate' | 'catalog' | 'systems' | 'gamelist' | 'profile' | 'settings';
  gameId?: string;
  systemId?: string;
  tab?: CatalogTab;
}

function parse(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/^\/+/, '');
  const parts = path.split('/').filter(Boolean);
  const head = parts[0];
  if (head === 'play') return { name: 'play', gameId: parts[1] ? decodeURIComponent(parts[1]) : undefined };
  if (head === 'emulate') {
    return parts[1]
      ? { name: 'emulate', systemId: decodeURIComponent(parts[1]) }
      : { name: 'emulate' };
  }
  if (head === 'system' && parts[1]) {
    return { name: 'gamelist', systemId: decodeURIComponent(parts[1]) };
  }
  if (head === 'catalog') {
    const second = parts[1];
    if (second === 'system' && parts[2]) {
      return { name: 'catalog', tab: 'library', systemId: decodeURIComponent(parts[2]) };
    }
    if (second === 'physical' || second === 'analyze' || second === 'guide') {
      return { name: 'catalog', tab: second };
    }
    return { name: 'catalog', tab: 'library' };
  }
  if (head === 'systems') {
    return parts[1]
      ? { name: 'systems', systemId: decodeURIComponent(parts[1]) }
      : { name: 'systems' };
  }
  if (head === 'profile' || head === 'settings') return { name: head };
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

export function hrefFor(route: Route): string {
  if (route.name === 'play') return route.gameId ? `#/play/${route.gameId}` : '#/play';
  if (route.name === 'emulate') return route.systemId ? `#/emulate/${route.systemId}` : '#/emulate';
  if (route.name === 'gamelist' && route.systemId) return `#/system/${route.systemId}`;
  if (route.name === 'catalog') {
    if (route.systemId) return `#/catalog/system/${route.systemId}`;
    if (route.tab && route.tab !== 'library') return `#/catalog/${route.tab}`;
    return '#/catalog';
  }
  if (route.name === 'systems') return route.systemId ? `#/systems/${route.systemId}` : '#/systems';
  if (route.name === 'profile' || route.name === 'settings') return `#/${route.name}`;
  return '#/';
}

export function navigate(route: Route) {
  const hash = hrefFor(route);
  if (window.location.hash !== hash) window.location.hash = hash;
  else window.scrollTo(0, 0);
}
