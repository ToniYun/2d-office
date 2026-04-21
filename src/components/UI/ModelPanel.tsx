// Edit agents.config.json to change agent names, models, and roles.
// This panel reads from the same ID list as the canvas.
import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';

type Agent = {
  id: string;
  name: string;
  model: string;
  provider: string;
  role: string;
  color: string;
  tier: 'exec' | 'senior' | 'junior';
};

// Keep these IDs in sync with agents.config.json
const agents: Agent[] = [
  { id: 'ceo',        name: 'ceo',        model: 'gpt-4o',              provider: 'openai',    role: 'CEO / Router',      color: '#fbbf24', tier: 'exec'   },
  { id: 'cto',        name: 'cto',        model: 'claude-opus-4',       provider: 'anthropic', role: 'CTO / Architect',   color: '#a78bfa', tier: 'exec'   },
  { id: 'researcher', name: 'researcher', model: 'your-research-model', provider: 'any',       role: 'Research Lead',     color: '#38bdf8', tier: 'senior' },
  { id: 'engineer',   name: 'engineer',   model: 'claude-sonnet-4',     provider: 'anthropic', role: 'Senior Engineer',   color: '#60a5fa', tier: 'senior' },
  { id: 'qa',         name: 'qa',         model: 'your-qa-model',       provider: 'any',       role: 'QA Engineer',       color: '#4ade80', tier: 'senior' },
  { id: 'backend',    name: 'backend',    model: 'your-coding-model',   provider: 'any',       role: 'Backend Developer', color: '#f97316', tier: 'senior' },
  { id: 'analyst',    name: 'analyst',    model: 'your-light-model',    provider: 'any',       role: 'Analyst / Scribe',  color: '#94a3b8', tier: 'junior' },
  { id: 'ops',        name: 'ops',        model: 'your-ops-model',      provider: 'any',       role: 'Ops Generalist',    color: '#fb923c', tier: 'junior' },
  { id: 'intern',     name: 'intern',     model: 'your-small-model',    provider: 'any',       role: 'Intern / Heartbeat',color: '#e879f9', tier: 'junior' },
];

const tierLabel: Record<string, string> = {
  exec: 'EXECUTIVE',
  senior: 'SENIOR STAFF',
  junior: 'JUNIOR STAFF',
};

const agentFloor: Record<string, string> = {
  ceo: 'F3', cto: 'F3',
  researcher: 'F2', engineer: 'F2', qa: 'F2', backend: 'F2',
  analyst: 'F1', ops: 'F1', intern: 'F1',
};

const glass = {
  background: 'rgba(8,14,26,0.82)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(96,165,250,0.12)',
};

export const ModelPanel = () => {
  const activeAgents = useGameStore((s) => s.activeAgents);
  const [visible, setVisible] = useState(true);

  const tiers = ['exec', 'senior', 'junior'] as const;

  if (!visible) {
    return (
      <button
        className="absolute bottom-12 left-4 px-3 py-2 pointer-events-auto flex items-center gap-2"
        style={{ ...glass, borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.5)', cursor: 'pointer' }}
        onClick={() => setVisible(true)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14">
          <rect x="1" y="1" width="12" height="12" rx="1" fill="none" stroke="#60a5fa" strokeWidth="1.5" opacity="0.7"/>
          <rect x="3" y="3" width="3" height="3" rx="0.5" fill="#60a5fa" opacity="0.7"/>
          <rect x="8" y="3" width="3" height="3" rx="0.5" fill="#60a5fa" opacity="0.7"/>
          <rect x="3" y="8" width="3" height="3" rx="0.5" fill="#60a5fa" opacity="0.7"/>
          <rect x="8" y="8" width="3" height="3" rx="0.5" fill="#60a5fa" opacity="0.7"/>
        </svg>
        <span className="font-bold" style={{ color: '#60a5fa', fontSize: 12 }}>Agents</span>
        {activeAgents.size > 0 && (
          <span
            className="font-black rounded-full w-4 h-4 flex items-center justify-center"
            style={{ background: '#4ade80', color: '#050D1A', fontSize: 9, boxShadow: '0 0 8px #4ade8066' }}
          >
            {activeAgents.size}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      className="absolute bottom-12 left-4 w-64 overflow-hidden pointer-events-auto"
      style={{ ...glass, borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03)' }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(96,165,250,0.1)', background: 'rgba(3,6,14,0.4)' }}
      >
        <div className="flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 14 14">
            <rect x="1" y="1" width="12" height="12" rx="1" fill="none" stroke="#60a5fa" strokeWidth="1.5" opacity="0.6"/>
            <rect x="3" y="3" width="3" height="3" rx="0.5" fill="#60a5fa" opacity="0.6"/>
            <rect x="8" y="3" width="3" height="3" rx="0.5" fill="#60a5fa" opacity="0.6"/>
            <rect x="3" y="8" width="3" height="3" rx="0.5" fill="#60a5fa" opacity="0.6"/>
            <rect x="8" y="8" width="3" height="3" rx="0.5" fill="#60a5fa" opacity="0.6"/>
          </svg>
          <span
            className="font-black tracking-widest uppercase"
            style={{ color: '#8AA8C8', fontSize: 10, textShadow: '0 0 10px rgba(96,165,250,0.3)' }}
          >
            AI Corp.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: '#2A4060', fontSize: 10 }}>All Floors</span>
          <button
            className="transition-opacity hover:opacity-100"
            style={{ color: '#2A4060', fontSize: 12, opacity: 0.6, cursor: 'pointer' }}
            onClick={() => setVisible(false)}
            title="Hide panel"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Agent list */}
      <div className="p-2 space-y-2" style={{ maxHeight: 384, overflowY: 'auto' }}>
        {tiers.map((tier) => {
          const tierAgents = agents.filter((a) => a.tier === tier);
          return (
            <div key={tier}>
              <div className="flex items-center gap-1.5 px-1 mb-1">
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
                <span className="font-bold tracking-widest" style={{ color: '#1E3050', fontSize: 8 }}>
                  {tierLabel[tier]}
                </span>
                <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.04)' }} />
              </div>

              {tierAgents.map((agent) => {
                const isActive = activeAgents.has(agent.id);
                return (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 mb-1 transition-all"
                    style={{
                      background: isActive ? `${agent.color}0D` : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isActive ? agent.color + '28' : 'rgba(255,255,255,0.04)'}`,
                      borderLeft: `3px solid ${isActive ? agent.color : 'rgba(255,255,255,0.06)'}`,
                      boxShadow: isActive ? `0 0 12px ${agent.color}18` : 'none',
                    }}
                  >
                    <div className="relative flex-shrink-0">
                      <div
                        className={`w-2 h-2 rounded-full ${isActive ? 'animate-pulse' : ''}`}
                        style={{
                          background: isActive ? agent.color : 'rgba(255,255,255,0.1)',
                          boxShadow: isActive ? `0 0 6px ${agent.color}` : 'none',
                        }}
                      />
                      {isActive && (
                        <div
                          className="absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-40"
                          style={{ background: agent.color }}
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span
                          className="font-bold truncate"
                          style={{ color: isActive ? agent.color : '#4A6080', fontSize: 11 }}
                        >
                          {agent.name}
                        </span>
                        {isActive && (
                          <span
                            className="px-1 rounded font-black"
                            style={{
                              color: '#050D1A',
                              background: agent.color,
                              fontSize: 7,
                              boxShadow: `0 0 6px ${agent.color}66`,
                            }}
                          >
                            LIVE
                          </span>
                        )}
                      </div>
                      <p className="truncate" style={{ color: '#1E3050', fontSize: 9 }}>
                        {agent.role} · <span style={{ color: '#2A5080' }}>{agentFloor[agent.id] ?? 'F?'}</span>
                      </p>
                    </div>

                    <div className="flex-shrink-0 w-10">
                      <div className="rounded-full overflow-hidden" style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{
                            width: isActive ? '88%' : '5%',
                            background: isActive ? agent.color : 'rgba(255,255,255,0.08)',
                            boxShadow: isActive ? `0 0 4px ${agent.color}` : 'none',
                          }}
                        />
                      </div>
                      <p className="text-right mt-0.5" style={{ color: '#1E3050', fontSize: 8 }}>
                        {isActive ? 'active' : agent.provider}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div
        className="px-3 py-1.5 flex items-center justify-between"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)', background: 'rgba(3,6,14,0.3)' }}
      >
        <span style={{ color: '#1E3050', fontSize: 11 }}>
          {activeAgents.size} / {agents.length} working
        </span>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#4ade80', boxShadow: '0 0 5px #4ade80' }} />
          <span className="font-bold tracking-widest" style={{ color: '#4ade80', fontSize: 9 }}>LIVE</span>
        </div>
      </div>
    </div>
  );
};
