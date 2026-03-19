import { useState } from 'react';

interface LandingScreenProps {
  onJoin: (name: string, color: string) => void;
}

const PRESET_COLORS = [
  '#4A90D9', '#E74C3C', '#2ECC71', '#F39C12',
  '#9B59B6', '#1ABC9C', '#E67E22', '#34495E',
];

export const LandingScreen = ({ onJoin }: LandingScreenProps) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#4A90D9');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onJoin(trimmed, color);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'linear-gradient(135deg, #D8E8F5 0%, #EBF0F8 50%, #D0DCF0 100%)' }}
    >
      <div className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'linear-gradient(#7AAAD4 1px, transparent 1px), linear-gradient(90deg, #7AAAD4 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl border-2 border-blue-200 w-96 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-8 py-6 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white bg-opacity-20 rounded-xl mb-3">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 2h16a1 1 0 011 1v18a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1zm2 2v16h12V4H6zm2 2h3v3H8V6zm5 0h3v3h-3V6zM8 11h3v3H8v-3zm5 0h3v3h-3v-3zM8 16h3v4H8v-4zm5 0h3v4h-3v-4z"/>
            </svg>
          </div>
          <h1 className="text-2xl font-black text-white tracking-wide">OpenClaw Corp.</h1>
          <p className="text-blue-100 text-sm mt-1 font-medium">AI Management Simulator — 2D</p>
        </div>

        <div className="px-8 py-6">
          <div className="bg-blue-50 rounded-xl p-3 mb-5 border border-blue-100">
            <p className="text-blue-700 text-xs text-center leading-relaxed font-medium">
              👔 Lightweight 2D view · Watch agents collaborate · Track delegations live
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                Manager Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name..."
                maxLength={20}
                autoFocus
                className="w-full px-4 py-2.5 bg-gray-50 text-gray-800 rounded-lg border-2 border-gray-200
                           focus:outline-none focus:border-blue-400 focus:bg-white
                           placeholder-gray-400 transition-colors font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wide">
                Avatar Color
              </label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="w-8 h-8 rounded-lg transition-all duration-150 hover:scale-110 focus:outline-none"
                    style={{
                      backgroundColor: c,
                      transform: color === c ? 'scale(1.2)' : undefined,
                      boxShadow: color === c ? `0 0 0 2px white, 0 0 0 4px ${c}` : '0 1px 3px rgba(0,0,0,0.2)',
                    }}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full py-3 font-black text-white rounded-xl transition-all duration-150 text-sm uppercase tracking-widest
                         disabled:bg-gray-200 disabled:cursor-not-allowed disabled:text-gray-400 focus:outline-none"
              style={{
                background: name.trim() ? 'linear-gradient(135deg, #2ECC71, #27AE60)' : undefined,
                boxShadow: name.trim() ? '0 4px 14px rgba(46,204,113,0.4)' : undefined,
              }}
            >
              Start Simulation
            </button>
          </form>

          <p className="text-gray-400 text-xs text-center mt-4">
            Lightweight 2D canvas · No WebGL required
          </p>
        </div>
      </div>
    </div>
  );
};
