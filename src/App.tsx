import { LandingScreen } from './components/UI/LandingScreen';
import { HUD } from './components/UI/HUD';
import { OfficeCanvas } from './components/OfficeCanvas';
import { RoleplayPanel } from './components/UI/RoleplayPanel';
import { useGameStore } from './store/gameStore';
import { useSocket } from './hooks/useSocket';

export const App = () => {
  const phase = useGameStore((s) => s.phase);
  const setPhase = useGameStore((s) => s.setPhase);
  const setLocalPlayer = useGameStore((s) => s.setLocalPlayer);
  const { joinGame } = useSocket();

  const handleJoin = (name: string, color: string) => {
    setLocalPlayer({ name, color });
    joinGame(name, color);
    setPhase('playing');
  };

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#03060E' }}>
      {phase === 'landing' && <LandingScreen onJoin={handleJoin} />}
      {phase === 'playing' && (
        <>
          <OfficeCanvas />
          <HUD />
          <RoleplayPanel />
        </>
      )}
    </div>
  );
};
