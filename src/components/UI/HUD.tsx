import { useGameStore } from '../../store/gameStore';
import { ModelPanel } from './ModelPanel';
import { HandoffToast } from './HandoffToast';

const glass = {
  background: 'rgba(8,14,26,0.75)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(96,165,250,0.12)',
  borderRadius: 14,
};

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

      {/* Top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-10 flex items-center px-4 justify-between"
        style={{ background: 'linear-gradient(to bottom, rgba(3,6,14,0.9), transparent)', backdropFilter: 'blur(6px)' }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-black tracking-widest uppercase"
            style={{ color: '#C8D8F0', textShadow: '0 0 12px rgba(96,165,250,0.4)' }}
          >
            OpenClaw Corp.
          </span>
          <span style={{ color: '#2A4060', fontSize: 11 }}>— 2D Floor View</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
            <span className="font-bold tracking-widest uppercase" style={{ color: '#4ade80', fontSize: 10 }}>Live</span>
          </div>
          <button
            onClick={toggleRoleplay}
            className="font-bold px-3 py-1 rounded-full transition-all"
            style={{
              pointerEvents: 'all',
              background: roleplayOpen ? 'rgba(167,139,250,0.2)' : 'rgba(255,255,255,0.05)',
              color: roleplayOpen ? '#a78bfa' : '#4A6080',
              border: `1px solid ${roleplayOpen ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.07)'}`,
              boxShadow: roleplayOpen ? '0 0 12px rgba(167,139,250,0.2)' : 'none',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            🎭 Scenes
          </button>
          <button
            onClick={toggleRecruiterCoach}
            className="font-bold px-3 py-1 rounded-full transition-all"
            style={{
              pointerEvents: 'all',
              background: recruiterCoachOpen ? 'rgba(96,165,250,0.2)' : 'rgba(255,255,255,0.05)',
              color: recruiterCoachOpen ? '#60a5fa' : '#4A6080',
              border: `1px solid ${recruiterCoachOpen ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.07)'}`,
              boxShadow: recruiterCoachOpen ? '0 0 12px rgba(96,165,250,0.2)' : 'none',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            🎯 Career
          </button>
        </div>
      </div>

      {/* Player list */}
      <div className="absolute top-12 right-4 p-3 min-w-40" style={{ ...glass, boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
        <div className="flex items-center gap-2 mb-2 pb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#4ade80', boxShadow: '0 0 6px #4ade80' }} />
          <h3 className="font-black uppercase tracking-widest" style={{ color: '#3A5070', fontSize: 9 }}>Online</h3>
        </div>
        {playerList.length === 0 ? (
          <p className="italic" style={{ color: '#243040', fontSize: 11 }}>Connecting...</p>
        ) : (
          <ul className="space-y-1.5">
            {playerList.map((player) => (
              <li key={player.id} className="flex items-center gap-2">
                <div
                  className="w-5 h-5 rounded-md flex-shrink-0 flex items-center justify-center font-black"
                  style={{
                    backgroundColor: player.color + '22',
                    border: `1px solid ${player.color}44`,
                    color: player.color,
                    fontSize: 9,
                    boxShadow: `0 0 6px ${player.color}33`,
                  }}
                >
                  {player.name.charAt(0).toUpperCase()}
                </div>
                <span className="font-medium truncate max-w-24" style={{ color: '#8AA8C8', fontSize: 11 }}>
                  {player.name}
                  {player.id === localPlayerId && <span style={{ color: '#60a5fa', marginLeft: 4, fontSize: 9 }}>(you)</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Local player badge */}
      {localPlayer.name && (
        <div
          className="absolute bottom-12 right-4 px-3 py-2 flex items-center gap-2"
          style={{ ...glass, boxShadow: `0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px ${localPlayer.color}22` }}
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center font-black"
            style={{
              background: localPlayer.color + '22',
              border: `1px solid ${localPlayer.color}55`,
              color: localPlayer.color,
              fontSize: 12,
              boxShadow: `0 0 10px ${localPlayer.color}44`,
            }}
          >
            {localPlayer.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-bold leading-none" style={{ color: '#C8D8F0', fontSize: 12 }}>{localPlayer.name}</p>
            <p className="leading-none mt-0.5 uppercase tracking-widest" style={{ color: '#3A5070', fontSize: 8 }}>Manager</p>
          </div>
        </div>
      )}

      <ModelPanel />
      <HandoffToast />

      {/* Bottom hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <div
          className="px-5 py-1.5"
          style={{
            background: 'rgba(3,6,14,0.6)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 20,
          }}
        >
          <p className="tracking-wide" style={{ color: '#243040', fontSize: 10 }}>
            2D Canvas view · Agents animate when active · Packets fly between delegations
          </p>
        </div>
      </div>
    </div>
  );
};
