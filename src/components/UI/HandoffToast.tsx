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
        const fromColor = AGENT_COLOR[entry.from] ?? '#64748b';
        const toColor   = AGENT_COLOR[entry.to]   ?? '#64748b';
        const age = (Date.now() - entry.at) / 1000;
        const opacity = age > 20 ? Math.max(0, 1 - (age - 20) / 10) : 1;
        if (opacity <= 0) return null;

        return (
          <div
            key={i}
            className="flex items-center gap-2 bg-white rounded-xl px-3 py-1.5 shadow-md border border-blue-100"
            style={{ opacity }}
          >
            {/* Delegation icon */}
            <span className="text-blue-400 text-xs">🔀</span>

            {/* From */}
            <span
              className="text-xs font-bold px-1.5 py-0.5 rounded-md"
              style={{ color: fromColor, backgroundColor: fromColor + '18' }}
            >
              {entry.from}
            </span>

            {/* Arrow */}
            <svg width="20" height="8" viewBox="0 0 20 8">
              <defs>
                <linearGradient id={`hg${i}`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={fromColor} />
                  <stop offset="100%" stopColor={toColor} />
                </linearGradient>
              </defs>
              <line x1="0" y1="4" x2="13" y2="4" stroke={`url(#hg${i})`} strokeWidth="2" />
              <path d="M13 1.5 L20 4 L13 6.5" fill="none" stroke={toColor} strokeWidth="1.5" />
            </svg>

            {/* To */}
            <span
              className="text-xs font-bold px-1.5 py-0.5 rounded-md"
              style={{ color: toColor, backgroundColor: toColor + '18' }}
            >
              {entry.to}
            </span>

            {/* Time */}
            <span className="text-gray-400 text-xs ml-0.5">{relativeTime(entry.at)}</span>
          </div>
        );
      })}
    </div>
  );
};
