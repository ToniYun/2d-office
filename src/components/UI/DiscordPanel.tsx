import { useState, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import { getSocket } from '../../network/socket';

interface DiscordChannel {
  id: string;
  name: string;
  guildId: string;
}

export const DiscordPanel = () => {
  const activeAgents = useGameStore((s) => s.activeAgents);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [visible, setVisible] = useState(true);
  const mainActive = activeAgents.has('main');

  useEffect(() => {
    const socket = getSocket();
    const handler = (data: DiscordChannel[]) => setChannels(data);
    socket.on('discordChannels', handler);
    return () => { socket.off('discordChannels', handler); };
  }, []);

  if (channels.length === 0) return null;

  if (!visible) {
    return (
      <button
        className="absolute top-12 left-4 bg-white rounded-xl shadow-xl border-2 border-indigo-100 px-3 py-2 pointer-events-auto flex items-center gap-2"
        onClick={() => setVisible(true)}
      >
        <span className="text-lg leading-none">💬</span>
        <span className="text-indigo-600 text-xs font-bold">Discord</span>
        {mainActive && <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
      </button>
    );
  }

  return (
    <div className="absolute top-12 left-4 bg-white rounded-xl shadow-xl border-2 border-indigo-100 w-52 overflow-hidden pointer-events-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white text-lg leading-none">💬</span>
          <span className="text-white text-xs font-black tracking-widest uppercase">Discord</span>
        </div>
        <div className="flex items-center gap-2">
          {mainActive && (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-200 text-xs font-semibold">LIVE</span>
            </div>
          )}
          <button
            className="text-indigo-200 hover:text-white text-xs opacity-70 hover:opacity-100"
            onClick={() => setVisible(false)}
            title="Hide"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Channel list */}
      <div className="p-2 space-y-1">
        {/* Agent row */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-yellow-50 border border-yellow-100 mb-2">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: mainActive ? '#fbbf24' : '#CBD5E1' }}
          />
          {mainActive && (
            <div className="absolute w-2 h-2 rounded-full bg-yellow-400 animate-ping opacity-60" />
          )}
          <span className="text-xs font-bold" style={{ color: mainActive ? '#fbbf24' : '#374151' }}>
            main
          </span>
          <span className="text-gray-400 text-xs">handles all channels</span>
          {mainActive && (
            <span
              className="ml-auto text-xs px-1 rounded-full font-bold"
              style={{ color: 'white', backgroundColor: '#fbbf24', fontSize: '8px' }}
            >
              ACTIVE
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-1.5 px-1 mb-1">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-gray-400 font-bold tracking-widest" style={{ fontSize: '9px' }}>CHANNELS</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {channels.map((ch) => (
          <div
            key={ch.id}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5"
            style={{
              backgroundColor: mainActive ? '#EEF2FF' : '#F8FAFC',
              border: mainActive ? '1px solid #C7D2FE' : '1px solid #EEF0F5',
              borderLeft: `3px solid ${mainActive ? '#6366F1' : '#D1D9E6'}`,
            }}
          >
            <span className="text-gray-400 text-xs font-bold">#</span>
            <span className="text-xs font-medium text-gray-700 flex-1">{ch.name}</span>
            {mainActive && (
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="bg-gray-50 border-t border-gray-100 px-3 py-1.5 flex items-center justify-between">
        <span className="text-gray-400 text-xs">{channels.length} channels · main agent</span>
      </div>
    </div>
  );
};
