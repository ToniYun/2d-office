import { useEffect, useState } from 'react';
import { useGameStore } from '../../store/gameStore';

const AGENT_COLOR: Record<string, string> = {
  'main':           '#fbbf24',
  'research':       '#38bdf8',
  'claude-code':    '#60a5fa',
  'claude-opus':    '#a78bfa',
  'codex':          '#4ade80',
  'deepseek-coder': '#f97316',
  'mistral':        '#94a3b8',
  'llama3':         '#fb923c',
  'qwen-mini':      '#e879f9',
};

function relativeTime(at: number): string {
  const s = Math.floor((Date.now() - at) / 1000);
  if (s < 5)  return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

export const HandoffToast = () => {
  const log = useGameStore((s) => s.handoffLog);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (log.length === 0) return null;

  return (
    <div className="absolute bottom-12 left-[17rem] flex flex-col gap-1.5">
      {log.map((entry, i) => {
        if (entry.from === entry.to) return null;
        const fromColor = AGENT_COLOR[entry.from] ?? '#64748b';
        const toColor   = AGENT_COLOR[entry.to]   ?? '#64748b';
        const age = (Date.now() - entry.at) / 1000;
        const opacity = age > 20 ? Math.max(0, 1 - (age - 20) / 10) : 1;
        if (opacity <= 0) return null;

        return (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-1.5"
            style={{
              opacity,
              background: 'rgba(8,14,26,0.82)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(96,165,250,0.1)',
              borderRadius: 12,
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            {/* Icon */}
            <span style={{ fontSize: 12, opacity: 0.6 }}>🔀</span>

            {/* From badge */}
            <span
              className="font-bold px-1.5 py-0.5 rounded"
              style={{
                color: fromColor,
                background: fromColor + '18',
                border: `1px solid ${fromColor}28`,
                fontSize: 10,
              }}
            >
              {entry.from}
            </span>

            {/* Gradient arrow */}
            <svg width="20" height="8" viewBox="0 0 20 8">
              <defs>
                <linearGradient id={`hg${i}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={fromColor} />
                  <stop offset="100%" stopColor={toColor} />
                </linearGradient>
              </defs>
              <line x1="0" y1="4" x2="13" y2="4" stroke={`url(#hg${i})`} strokeWidth="1.5" />
              <path d="M13 1.5 L20 4 L13 6.5" fill="none" stroke={toColor} strokeWidth="1.5" />
            </svg>

            {/* To badge */}
            <span
              className="font-bold px-1.5 py-0.5 rounded"
              style={{
                color: toColor,
                background: toColor + '18',
                border: `1px solid ${toColor}28`,
                fontSize: 10,
              }}
            >
              {entry.to}
            </span>

            {/* Time */}
            <span style={{ color: '#1E3050', fontSize: 10, marginLeft: 2 }}>{relativeTime(entry.at)}</span>
          </div>
        );
      })}
    </div>
  );
};
