import { useState } from 'react';
import { CAST, CAST_BY_ID, type CastMember } from '../../data/cast';
import { SCENES, type Scene } from '../../data/scenes';
import { useGameStore } from '../../store/gameStore';

type Tab = 'scenes' | 'cast';

const TIER_LABEL: Record<CastMember['tier'], string> = {
  human: 'Human',
  lightweight: 'Lightweight',
  senior: 'Senior',
};

const TIER_BG: Record<CastMember['tier'], string> = {
  human: '#ffeaa7',
  lightweight: '#dfe6e9',
  senior: '#d4efdf',
};

export const RoleplayPanel = () => {
  const roleplayOpen = useGameStore((s) => s.roleplayOpen);
  const toggleRoleplay = useGameStore((s) => s.toggleRoleplay);
  const [tab, setTab] = useState<Tab>('scenes');
  const [activeScene, setActiveScene] = useState<Scene | null>(null);
  const [activeCast, setActiveCast] = useState<CastMember | null>(null);

  if (!roleplayOpen) return null;

  return (
    <div
      className="fixed top-0 right-0 h-full z-50 flex flex-col shadow-2xl"
      style={{ width: '380px', background: '#f8f9ff', borderLeft: '2px solid #e0e7ff' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: 'linear-gradient(to right, #4f46e5, #7c3aed)', borderBottom: '1px solid #6366f1' }}
      >
        <div>
          <h2 className="text-white font-black text-sm tracking-wider uppercase">Office Scenes</h2>
          <p className="text-indigo-200 text-xs mt-0.5">AI Corp. Drama™</p>
        </div>
        <button
          onClick={toggleRoleplay}
          className="text-indigo-200 hover:text-white transition-colors text-lg font-bold leading-none"
          style={{ pointerEvents: 'all' }}
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid #e0e7ff' }}>
        {(['scenes', 'cast'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setActiveScene(null); setActiveCast(null); }}
            className="flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
            style={{
              pointerEvents: 'all',
              background: tab === t ? '#4f46e5' : 'transparent',
              color: tab === t ? '#fff' : '#6366f1',
              borderBottom: tab === t ? '2px solid #4f46e5' : '2px solid transparent',
            }}
          >
            {t === 'scenes' ? '🎭 Scenes' : '👥 Cast'}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto" style={{ pointerEvents: 'all' }}>
        {tab === 'scenes' && !activeScene && (
          <SceneList onSelect={setActiveScene} />
        )}
        {tab === 'scenes' && activeScene && (
          <SceneView scene={activeScene} onBack={() => setActiveScene(null)} />
        )}
        {tab === 'cast' && !activeCast && (
          <CastList onSelect={setActiveCast} />
        )}
        {tab === 'cast' && activeCast && (
          <CastDetail member={activeCast} onBack={() => setActiveCast(null)} />
        )}
      </div>
    </div>
  );
};

const SceneList = ({ onSelect }: { onSelect: (s: Scene) => void }) => (
  <div className="p-3 space-y-2">
    {SCENES.map((scene) => (
      <button
        key={scene.id}
        onClick={() => onSelect(scene)}
        className="w-full text-left rounded-lg p-3 transition-all hover:shadow-md"
        style={{ background: '#fff', border: '1px solid #e0e7ff' }}
      >
        <div className="flex items-start gap-2">
          <span className="text-lg flex-shrink-0">🎭</span>
          <div>
            <p className="text-gray-800 font-bold text-xs">{scene.title}</p>
            <p className="text-gray-500 text-xs mt-0.5 leading-snug">{scene.description}</p>
            <p className="text-indigo-400 text-xs mt-1 font-medium">{scene.dialogue.length} lines →</p>
          </div>
        </div>
      </button>
    ))}
  </div>
);

const SceneView = ({ scene, onBack }: { scene: Scene; onBack: () => void }) => (
  <div>
    <div className="p-3" style={{ borderBottom: '1px solid #e0e7ff' }}>
      <button onClick={onBack} className="text-indigo-500 text-xs font-semibold hover:text-indigo-700 mb-2 block">
        ← Back to scenes
      </button>
      <h3 className="text-gray-900 font-black text-sm">{scene.title}</h3>
      <p className="text-gray-500 text-xs mt-1 leading-snug">{scene.description}</p>
    </div>
    <div className="p-3 space-y-2">
      {scene.dialogue.map((line, i) => {
        const member = CAST_BY_ID[line.speaker];
        const name = member?.name ?? line.speaker;
        const color = member?.color ?? '#888';
        const role = member?.role ?? '';
        return (
          <div key={i} className="flex gap-2 items-start">
            <div
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white font-black"
              style={{ backgroundColor: color, fontSize: '9px', marginTop: '2px' }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
            <div>
              <span className="font-bold text-xs" style={{ color }}>{name}</span>
              {role && <span className="text-gray-400 text-xs ml-1">({role.split(' / ')[0]})</span>}
              <p className="text-gray-700 text-xs mt-0.5 leading-snug">"{line.text}"</p>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const CastList = ({ onSelect }: { onSelect: (m: CastMember) => void }) => {
  const tiers: CastMember['tier'][] = ['human', 'senior', 'lightweight'];
  return (
    <div className="p-3 space-y-4">
      {tiers.map((tier) => {
        const members = CAST.filter((c) => c.tier === tier);
        if (!members.length) return null;
        return (
          <div key={tier}>
            <p
              className="text-xs font-black uppercase tracking-widest mb-2 px-2 py-0.5 rounded-full inline-block"
              style={{ background: TIER_BG[tier], color: '#333' }}
            >
              {TIER_LABEL[tier]}
            </p>
            <div className="space-y-1.5">
              {members.map((member) => (
                <button
                  key={member.id}
                  onClick={() => onSelect(member)}
                  className="w-full text-left rounded-lg p-2.5 flex items-center gap-2.5 transition-all hover:shadow-md"
                  style={{ background: '#fff', border: '1px solid #e0e7ff' }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-white font-black text-sm"
                    style={{ backgroundColor: member.color }}
                  >
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-gray-800 font-bold text-xs">{member.name}</p>
                    <p className="text-gray-400 text-xs truncate">{member.role}</p>
                  </div>
                  <span className="ml-auto text-gray-300 text-sm">›</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CastDetail = ({ member, onBack }: { member: CastMember; onBack: () => void }) => (
  <div className="p-4">
    <button onClick={onBack} className="text-indigo-500 text-xs font-semibold hover:text-indigo-700 mb-3 block">
      ← Back to cast
    </button>
    <div className="flex items-center gap-3 mb-4">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg"
        style={{ backgroundColor: member.color }}
      >
        {member.name.charAt(0).toUpperCase()}
      </div>
      <div>
        <h3 className="text-gray-900 font-black text-base">{member.name}</h3>
        <p className="text-gray-500 text-xs">{member.role}</p>
        <span
          className="text-xs font-bold px-2 py-0.5 rounded-full mt-1 inline-block"
          style={{ background: TIER_BG[member.tier], color: '#555' }}
        >
          {TIER_LABEL[member.tier]}
        </span>
      </div>
    </div>

    <div className="space-y-3">
      {member.model && (
        <Row label="Model" value={member.model} />
      )}
      <Row label="Desk" value={member.desk} />
      <Row label="Personality" value={member.personality} />
      <Row label="Speaking style" value={member.speakingStyle} />

      <div className="rounded-lg p-3" style={{ background: '#f0f0ff', border: '1px solid #c7d2fe' }}>
        <p className="text-indigo-500 text-xs font-bold uppercase tracking-wider mb-1">Example line</p>
        <p className="text-gray-700 text-xs italic leading-snug">"{member.exampleLine}"</p>
      </div>
    </div>
  </div>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">{label}</p>
    <p className="text-gray-700 text-xs mt-0.5 leading-snug">{value}</p>
  </div>
);
