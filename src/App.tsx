import { useHashRoute } from './engine/router';
import { getGame } from './games/registry';
import { Arcade } from './ui/Arcade';
import { GamePage } from './ui/GamePage';

export function App() {
  const route = useHashRoute();

  if (route.name === 'play') {
    const manifest = getGame(route.gameId);
    if (manifest) return <GamePage key={manifest.id} manifest={manifest} />;
  }
  return <Arcade />;
}
