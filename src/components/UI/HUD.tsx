import { useGameStore } from '../../store/gameStore';
import { ModelPanel } from './ModelPanel';
import { HandoffToast } from './HandoffToast';
import { DiscordPanel } from './DiscordPanel';

export const HUD = () => {
  const players = useGameStore((s) => s.players);
  const localPlayerId = useGameStore((s) => s.localPlayerId);
  const localPlayer = useGameStore((s) => s.localPlayer);
  const roleplayOpen = useGameStore((s) => s.roleplayOpen);
  const toggleRoleplay = useGameStore((s) => s.toggleRoleplay);
  const recruiterCoachOpen = useGameStore((s) => s.recruiterCoachOpen);
  const toggleRecruiterCoach = useGameStore((s) => s.toggleRecruiterCoach);

  const playerList = Object.values(players);

  return (
    <div className="fixed inset-0 pointer-events-none select-none z-10">

      {/* Corp Inc. top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-9 flex items-center px-4 justify-between"
        style={{ background: 'linear-gradient(to bottom, rgba(37,99,235,0.85), transparent)', backdropFilter: 'blur(4px)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-white text-xs font-black tracking-widest uppercase opacity-90">OpenClaw Corp.</span>
          <span className="text-blue-300 text-xs opacity-70">— 2D Floor View</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-green-200 text-xs font-semibold tracking-wider uppercase">Live</span>
          </div>
          <button
            onClick={toggleRoleplay}
            className="text-xs font-bold px-2.5 py-1 rounded-full transition-all"
            style={{
              pointerEvents: 'all',
              background: roleplayOpen ? '#7c3aed' : 'rgba(255,255,255,0.15)',
              color: roleplayOpen ? '#fff' : '#c7d2fe',
              border: '1px solid rgba(255,255,255,0.25)',
            }}
          >
            🎭 Scenes
          </button>
          <button
            onClick={toggleRecruiterCoach}
            className="text-xs font-bold px-2.5 py-1 rounded-full transition-all"
            style={{
              pointerEvents: 'all',
              background: recruiterCoachOpen ? '#1e3a5f' : 'rgba(255,255,255,0.15)',
              color: recruiterCoachOpen ? '#60a5fa' : '#c7d2fe',
              border: '1px solid rgba(255,255,255,0.25)',
            }}
          >
            🎯 Career
          </button>
        </div>
      </div>

      {/* Player list */}
      <div className="absolute top-12 right-4 bg-white rounded-xl shadow-lg border-2 border-blue-100 p-3 min-w-40">
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <h3 className="text-gray-700 text-xs font-black uppercase tracking-wider">Online</h3>
        </div>
        {playerList.length === 0 ? (
          <p className="text-gray-400 text-xs italic">Connecting...</p>
        ) : (
          <ul className="space-y-1.5">
            {playerList.map((player) => (
              <li key={player.id} className="flex items-center gap-2">
                <div
                  className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center text-white font-black"
                  style={{ backgroundColor: player.color, fontSize: '9px' }}
                >
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-gray-700 text-xs font-medium truncate max-w-24">
                  {player.name}
                  {player.id === localPlayerId && <span className="text-blue-400 ml-1">(you)</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Local player badge */}
      {localPlayer.name && (
        <div className="absolute bottom-12 right-4 bg-white rounded-xl shadow-md border-2 border-blue-100 px-3 py-1.5 flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center text-white font-black text-xs"
            style={{ backgroundColor: localPlayer.color }}
          >
            {localPlayer.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-gray-800 text-xs font-bold leading-none">{localPlayer.name}</p>
            <p className="text-gray-400 leading-none mt-0.5" style={{ fontSize: '9px' }}>Manager</p>
          </div>
        </div>
      )}

      <ModelPanel />
      <DiscordPanel />
      <HandoffToast />

      {/* Controls hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <div className="bg-white bg-opacity-80 backdrop-blur-sm rounded-full px-5 py-1.5 shadow border border-blue-100">
          <p className="text-gray-500 tracking-wide" style={{ fontSize: '10px' }}>
            2D Canvas view · Agents animate when active · Packets fly between delegations
          </p>
        </div>
      </div>
    </div>
  );
};
