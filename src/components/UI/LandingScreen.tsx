import { useState } from 'react';

interface LandingScreenProps {
  onJoin: (name: string, color: string) => void;
}

const PRESET_COLORS = [
  '#fbbf24', '#60a5fa', '#a78bfa', '#4ade80',
  '#f97316', '#38bdf8', '#e879f9', '#34d399',
];

export const LandingScreen = ({ onJoin }: LandingScreenProps) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#fbbf24');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onJoin(trimmed, color);
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'linear-gradient(160deg, #03060E 0%, #0B1428 60%, #060D1E 100%)' }}
    >
      {/* Star field */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 40 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: i % 5 === 0 ? 2 : 1,
              height: i % 5 === 0 ? 2 : 1,
              left: `${(i * 37 + 13) % 100}%`,
              top: `${(i * 53 + 7) % 60}%`,
              background: 'white',
              opacity: 0.3 + (i % 4) * 0.15,
              animation: `twinkle ${2 + (i % 3)}s ease-in-out infinite`,
              animationDelay: `${(i * 0.3) % 3}s`,
            }}
          />
        ))}
      </div>

      {/* City silhouette */}
      <div className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none" style={{ opacity: 0.4 }}>
        <svg viewBox="0 0 800 128" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <rect x="0" y="60" width="800" height="68" fill="#060D1E"/>
          <rect x="30" y="30" width="40" height="98" fill="#0A1525"/><rect x="32" y="34" width="5" height="5" fill="#60a5fa" opacity="0.5"/>
          <rect x="100" y="10" width="60" height="118" fill="#0A1525"/><rect x="104" y="18" width="7" height="7" fill="#fbbf24" opacity="0.4"/>
          <rect x="200" y="40" width="30" height="88" fill="#0A1525"/>
          <rect x="260" y="20" width="50" height="108" fill="#0A1525"/><rect x="264" y="28" width="6" height="6" fill="#a78bfa" opacity="0.5"/>
          <rect x="350" y="5" width="70" height="123" fill="#0D1828"/><rect x="354" y="12" width="8" height="8" fill="#38bdf8" opacity="0.3"/>
          <rect x="450" y="35" width="40" height="93" fill="#0A1525"/>
          <rect x="520" y="15" width="55" height="113" fill="#0A1525"/><rect x="524" y="22" width="7" height="7" fill="#4ade80" opacity="0.4"/>
          <rect x="610" y="45" width="35" height="83" fill="#0A1525"/>
          <rect x="680" y="25" width="45" height="103" fill="#0A1525"/><rect x="684" y="32" width="6" height="6" fill="#e879f9" opacity="0.5"/>
          <rect x="750" y="55" width="50" height="73" fill="#0A1525"/>
        </svg>
      </div>

      <style>{`
        @keyframes twinkle { 0%,100% { opacity: 0.2 } 50% { opacity: 0.9 } }
        @keyframes glow-pulse { 0%,100% { box-shadow: 0 0 20px rgba(96,165,250,0.3) } 50% { box-shadow: 0 0 40px rgba(96,165,250,0.6) } }
      `}</style>

      <div
        className="relative w-96 overflow-hidden"
        style={{
          background: 'rgba(13,24,40,0.85)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(96,165,250,0.2)',
          borderRadius: 20,
          boxShadow: '0 0 60px rgba(10,20,40,0.8), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {/* Header */}
        <div
          className="px-8 py-7 text-center"
          style={{ borderBottom: '1px solid rgba(96,165,250,0.12)' }}
        >
          <div
            className="inline-flex items-center justify-center w-14 h-14 mb-4"
            style={{
              background: 'rgba(96,165,250,0.1)',
              border: '1px solid rgba(96,165,250,0.3)',
              borderRadius: 14,
              boxShadow: '0 0 20px rgba(96,165,250,0.15)',
            }}
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="#60a5fa" strokeWidth="1.5">
              <path d="M4 2h16a1 1 0 011 1v18a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/>
              <path d="M8 6h3v3H8zm5 0h3v3h-3zM8 11h3v3H8zm5 0h3v3h-3zM8 16h3v5H8zm5 0h3v5h-3z"/>
            </svg>
          </div>
          <h1
            className="text-2xl font-black tracking-widest uppercase mb-1"
            style={{ color: '#C8D8F0', textShadow: '0 0 20px rgba(96,165,250,0.4)' }}
          >
            OpenClaw Corp.
          </h1>
          <p style={{ color: '#4A6080', fontSize: 12, letterSpacing: '0.1em' }}>
            AI MANAGEMENT SIMULATOR — 2D
          </p>
        </div>

        {/* Body */}
        <div className="px-8 py-6">
          <div
            className="rounded-xl p-3 mb-6 text-center"
            style={{ background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.12)' }}
          >
            <p style={{ color: '#5A80A8', fontSize: 11, lineHeight: 1.6 }}>
              Night shift · Watch agents collaborate in real time · Track delegations live
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                className="block mb-2 font-bold uppercase tracking-widest"
                style={{ color: '#3A6090', fontSize: 10 }}
              >
                Manager Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name..."
                maxLength={20}
                autoFocus
                className="w-full px-4 py-3 rounded-xl outline-none transition-all"
                style={{
                  background: 'rgba(8,14,26,0.8)',
                  border: '1px solid rgba(96,165,250,0.2)',
                  color: '#C8D8F0',
                  fontSize: 14,
                  caretColor: '#60a5fa',
                }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(96,165,250,0.5)'; e.target.style.boxShadow = '0 0 0 3px rgba(96,165,250,0.08)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(96,165,250,0.2)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <div>
              <label
                className="block mb-2 font-bold uppercase tracking-widest"
                style={{ color: '#3A6090', fontSize: 10 }}
              >
                Avatar Color
              </label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="w-8 h-8 rounded-lg transition-all duration-150 focus:outline-none"
                    style={{
                      backgroundColor: c,
                      transform: color === c ? 'scale(1.15)' : 'scale(1)',
                      boxShadow: color === c ? `0 0 12px ${c}88, 0 0 0 2px rgba(255,255,255,0.15)` : `0 0 0 1px rgba(255,255,255,0.06)`,
                    }}
                  />
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full py-3 font-black uppercase tracking-widest rounded-xl transition-all duration-200 focus:outline-none"
              style={{
                background: name.trim()
                  ? `linear-gradient(135deg, ${color}CC, ${color}88)`
                  : 'rgba(255,255,255,0.04)',
                color: name.trim() ? '#fff' : '#2A3A50',
                border: `1px solid ${name.trim() ? color + '66' : 'rgba(255,255,255,0.06)'}`,
                boxShadow: name.trim() ? `0 4px 20px ${color}44` : 'none',
                fontSize: 12,
                cursor: name.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              Enter the Office
            </button>
          </form>

          <p className="text-center mt-5" style={{ color: '#243040', fontSize: 10 }}>
            2D Canvas · No WebGL required
          </p>
        </div>
      </div>
    </div>
  );
};
