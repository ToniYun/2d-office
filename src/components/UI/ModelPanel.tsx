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

const agents: Agent[] = [
  { id: 'main',           name: 'main',         model: 'gpt-5',               provider: 'openai',       role: 'CEO / Router',        color: '#fbbf24', tier: 'exec'   },
  { id: 'research',       name: 'research',      model: 'kimi-k2.5',           provider: 'nvidia',       role: 'Research Lead',       color: '#38bdf8', tier: 'senior' },
  { id: 'claude-code',    name: 'claude-code',   model: 'claude-sonnet-4-6',   provider: 'anthropic',    role: 'Sr. Developer',       color: '#60a5fa', tier: 'senior' },
  { id: 'claude-opus',    name: 'claude-opus',   model: 'claude-opus-4-6',     provider: 'anthropic',    role: 'CTO / Architect',     color: '#a78bfa', tier: 'exec'   },
  { id: 'codex',          name: 'codex',         model: 'gpt-5.1-codex',       provider: 'openai',       role: 'QA Engineer',         color: '#4ade80', tier: 'senior' },
  { id: 'deepseek-coder', name: 'deepseek',      model: 'deepseek-coder-v2:16b', provider: 'ollama-local', role: 'Sr. Coder (local)', color: '#f97316', tier: 'senior' },
  { id: 'mistral',        name: 'mistral',       model: 'mistral:latest',      provider: 'ollama-local', role: 'Jr. Assistant',       color: '#94a3b8', tier: 'junior' },
  { id: 'llama3',         name: 'llama3',        model: 'llama3:latest',       provider: 'ollama-local', role: 'Jr. Assistant',       color: '#fb923c', tier: 'junior' },
  { id: 'qwen-mini',      name: 'qwen-mini',     model: 'qwen2.5:1.5b',        provider: 'ollama',       role: 'Heartbeat / Tasks',   color: '#e879f9', tier: 'junior' },
];

const tierLabel: Record<string, string> = {
  exec: 'EXECUTIVE',
  senior: 'SENIOR STAFF',
  junior: 'JUNIOR STAFF',
};

const agentFloor: Record<string, string> = {
  main: 'F3', 'claude-opus': 'F3',
  research: 'F2', 'claude-code': 'F2', codex: 'F2', 'deepseek-coder': 'F2',
  mistral: 'F1', llama3: 'F1', 'qwen-mini': 'F1',
};

export const ModelPanel = () => {
  const activeAgents = useGameStore((s) => s.activeAgents);
  const [visible, setVisible] = useState(true);

  const tiers = ['exec', 'senior', 'junior'] as const;

  if (!visible) {
    return (
      <button
        className="absolute bottom-12 left-4 bg-white rounded-xl shadow-xl border-2 border-blue-100 px-3 py-2 pointer-events-auto flex items-center gap-2"
        onClick={() => setVisible(true)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="#3B82F6" opacity="0.9">
          <rect x="1" y="1" width="12" height="12" rx="1" fill="none" stroke="#3B82F6" strokeWidth="1.5"/>
          <rect x="3" y="3" width="3" height="3" rx="0.5"/>
          <rect x="8" y="3" width="3" height="3" rx="0.5"/>
          <rect x="3" y="8" width="3" height="3" rx="0.5"/>
          <rect x="8" y="8" width="3" height="3" rx="0.5"/>
        </svg>
        <span className="text-blue-600 text-xs font-bold">Agents</span>
        {activeAgents.size > 0 && (
          <span className="bg-green-400 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center" style={{ fontSize: '9px' }}>
            {activeAgents.size}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="absolute bottom-12 left-4 bg-white rounded-xl shadow-xl border-2 border-blue-100 w-64 overflow-hidden pointer-events-auto">
      {/* Corp Inc. style header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="white" opacity="0.9">
            <rect x="1" y="1" width="12" height="12" rx="1" fill="none" stroke="white" strokeWidth="1.5"/>
            <rect x="3" y="3" width="3" height="3" rx="0.5"/>
            <rect x="8" y="3" width="3" height="3" rx="0.5"/>
            <rect x="3" y="8" width="3" height="3" rx="0.5"/>
            <rect x="8" y="8" width="3" height="3" rx="0.5"/>
          </svg>
          <span className="text-white text-xs font-black tracking-widest uppercase">OpenClaw Corp</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-blue-200 text-xs font-medium">All Floors</span>
          <button
            className="text-blue-200 hover:text-white text-xs opacity-70 hover:opacity-100 transition-opacity"
            onClick={() => setVisible(false)}
            title="Hide panel"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="p-2 space-y-2 max-h-96 overflow-y-auto">
        {tiers.map((tier) => {
          const tierAgents = agents.filter((a) => a.tier === tier);
          return (
            <div key={tier}>
              {/* Tier label */}
              <div className="flex items-center gap-1.5 px-1 mb-1">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-gray-400 text-xs font-bold tracking-widest" style={{ fontSize: '9px' }}>
                  {tierLabel[tier]}
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* Agent cards */}
              {tierAgents.map((agent) => {
                const isActive = activeAgents.has(agent.id);
                return (
                  <div
                    key={agent.id}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 mb-1"
                    style={{
                      backgroundColor: isActive ? agent.color + '15' : '#F8FAFC',
                      border: isActive ? `1px solid ${agent.color}30` : '1px solid #EEF0F5',
                      borderLeft: `3px solid ${isActive ? agent.color : '#D1D9E6'}`,
                    }}
                  >
                    {/* Status indicator — Corp Inc. style colored dot */}
                    <div className="relative flex-shrink-0">
                      <div
                        className={`w-2 h-2 rounded-full ${isActive ? 'animate-pulse' : ''}`}
                        style={{ backgroundColor: isActive ? agent.color : '#CBD5E1' }}
                      />
                      {isActive && (
                        <div
                          className="absolute inset-0 w-2 h-2 rounded-full animate-ping opacity-60"
                          style={{ backgroundColor: agent.color }}
                        />
                      )}
                    </div>

                    {/* Name + role */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span
                          className="text-xs font-bold truncate"
                          style={{ color: isActive ? agent.color : '#374151' }}
                        >
                          {agent.name}
                        </span>
                        {isActive && (
                          <span
                            className="text-xs px-1 rounded-full font-bold"
                            style={{ color: 'white', backgroundColor: agent.color, fontSize: '8px' }}
                          >
                            WORKING
                          </span>
                        )}
                      </div>
                      <p className="text-gray-400 truncate" style={{ fontSize: '9px' }}>
                        {agent.role} · <span className="text-blue-300">{agentFloor[agent.id] ?? 'F?'}</span>
                      </p>
                    </div>

                    {/* Productivity bar — Corp Inc. has these */}
                    <div className="flex-shrink-0 w-10">
                      <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: isActive ? '85%' : '5%',
                            backgroundColor: agent.color,
                          }}
                        />
                      </div>
                      <p className="text-right mt-0.5" style={{ color: '#94A3B8', fontSize: '8px' }}>
                        {isActive ? 'active' : agent.provider.replace('ollama-local', 'local')}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Footer — Corp Inc. style stats bar */}
      <div className="bg-gray-50 border-t border-gray-100 px-3 py-1.5 flex items-center justify-between">
        <span className="text-gray-400 text-xs">
          {activeAgents.size} / {agents.length} working
        </span>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-green-600 text-xs font-medium">LIVE</span>
        </div>
      </div>
    </div>
  );
};
