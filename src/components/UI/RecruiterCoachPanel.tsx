import { useState, useEffect, useCallback } from 'react';
import { useGameStore } from '../../store/gameStore';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  label: string;
  xp: number;
  section: string;
}

interface CoachState {
  totalXp: number;
  dailyDate: string;
  dailyCompleted: string[];
  weeklyWeek: string;
  weeklyCompleted: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'openclaw-recruiter-coach';

const DAILY_TASKS: Task[] = [
  // Morning block
  { id: 'd-review-postings',   label: 'Review 5 target job postings',                     xp: 10, section: 'Morning' },
  { id: 'd-submit-apps',       label: 'Submit 1–3 quality applications',                   xp: 15, section: 'Morning' },
  { id: 'd-networking-msg',    label: 'Send 1 networking message (alumni / recruiter)',     xp: 10, section: 'Morning' },
  { id: 'd-resume-linkedin',   label: 'Make 1 resume or LinkedIn improvement',              xp: 10, section: 'Morning' },
  // Evening block
  { id: 'd-tech-practice',     label: '30 min technical interview practice (DSA)',          xp: 12, section: 'Evening' },
  { id: 'd-behavioral-star',   label: '20 min behavioral STAR story practice',              xp: 12, section: 'Evening' },
  { id: 'd-pitch-walkthrough', label: '20 min resume walkthrough / elevator pitch',         xp: 12, section: 'Evening' },
  { id: 'd-progress-update',   label: 'Log progress, blockers, and tomorrow\'s first step', xp: 8,  section: 'Evening' },
];

const WEEKLY_TASKS: Task[] = [
  { id: 'w-apps',           label: '10–15 quality applications submitted',     xp: 50, section: 'Applications' },
  { id: 'w-networking',     label: '5 networking messages sent',               xp: 35, section: 'Networking'   },
  { id: 'w-tailored-res',   label: '3 tailored resumes completed',             xp: 40, section: 'Resume'       },
  { id: 'w-tech-sessions',  label: '3 technical interview sessions',           xp: 35, section: 'Interview'    },
  { id: 'w-behavioral',     label: '2 behavioral interview sessions',          xp: 30, section: 'Interview'    },
  { id: 'w-mock',           label: '1 full mock interview',                    xp: 50, section: 'Interview'    },
  { id: 'w-linkedin',       label: '1 LinkedIn or profile improvement',        xp: 25, section: 'Profile'      },
];

const LEVELS = [
  { level: 1, title: 'Applicant',       min: 0    },
  { level: 2, title: 'Candidate',       min: 300  },
  { level: 3, title: 'Contender',       min: 700  },
  { level: 4, title: 'Shortlisted',     min: 1300 },
  { level: 5, title: 'Finalist',        min: 2100 },
  { level: 6, title: 'Elite Candidate', min: 3100 },
  { level: 7, title: 'Offer Ready',     min: 4300 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getLevelInfo(xp: number) {
  let info = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.min) info = l;
  }
  const next = LEVELS.find((l) => l.min > xp);
  const progress = next
    ? ((xp - info.min) / (next.min - info.min)) * 100
    : 100;
  return { ...info, nextMin: next?.min ?? null, progress };
}

function loadState(): CoachState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CoachState;
  } catch {}
  return {
    totalXp: 0,
    dailyDate: '',
    dailyCompleted: [],
    weeklyWeek: '',
    weeklyCompleted: [],
  };
}

function saveState(state: CoachState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ── Main Component ─────────────────────────────────────────────────────────────

type Tab = 'daily' | 'weekly';

export const RecruiterCoachPanel = () => {
  const recruiterCoachOpen = useGameStore((s) => s.recruiterCoachOpen);
  const toggleRecruiterCoach = useGameStore((s) => s.toggleRecruiterCoach);

  const [tab, setTab] = useState<Tab>('daily');
  const [state, setState] = useState<CoachState>(() => loadState());
  const [xpFlash, setXpFlash] = useState<string | null>(null);

  // Reset daily/weekly if date/week changed
  const today = getTodayStr();
  const thisWeek = getISOWeek(new Date());

  const syncedState = useCallback((): CoachState => {
    const s = { ...state };
    if (s.dailyDate !== today) {
      s.dailyDate = today;
      s.dailyCompleted = [];
    }
    if (s.weeklyWeek !== thisWeek) {
      s.weeklyWeek = thisWeek;
      s.weeklyCompleted = [];
    }
    return s;
  }, [state, today, thisWeek]);

  // On open, sync date/week
  useEffect(() => {
    if (recruiterCoachOpen) {
      const s = syncedState();
      if (
        s.dailyDate !== state.dailyDate ||
        s.weeklyWeek !== state.weeklyWeek
      ) {
        setState(s);
        saveState(s);
      }
    }
  }, [recruiterCoachOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTask = (taskId: string, tasks: Task[], completedField: 'dailyCompleted' | 'weeklyCompleted') => {
    const task = tasks.find((t) => t.id === taskId)!;
    setState((prev) => {
      const completed = prev[completedField];
      const wasCompleted = completed.includes(taskId);
      const newCompleted = wasCompleted
        ? completed.filter((id) => id !== taskId)
        : [...completed, taskId];
      const xpDelta = wasCompleted ? -task.xp : task.xp;
      const next: CoachState = {
        ...prev,
        totalXp: Math.max(0, prev.totalXp + xpDelta),
        [completedField]: newCompleted,
      };
      saveState(next);
      if (!wasCompleted) {
        setXpFlash(`+${task.xp} XP`);
        setTimeout(() => setXpFlash(null), 1200);
      }
      return next;
    });
  };

  if (!recruiterCoachOpen) return null;

  const levelInfo = getLevelInfo(state.totalXp);
  const dailyDone = state.dailyCompleted.length;
  const weeklyDone = state.weeklyCompleted.length;

  return (
    <div
      className="fixed top-0 right-0 h-full z-50 flex flex-col shadow-2xl"
      style={{ width: '380px', background: '#f8f9ff', borderLeft: '2px solid #e0e7ff' }}
    >
      {/* Header */}
      <div
        className="flex-shrink-0 px-4 pt-3 pb-2"
        style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #4f46e5 100%)', borderBottom: '1px solid #3730a3' }}
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <h2 className="text-white font-black text-sm tracking-wider uppercase">Career Coach</h2>
            <p className="text-blue-200 text-xs mt-0.5">Antonio Yun · Job Search OS</p>
          </div>
          <button
            onClick={toggleRecruiterCoach}
            className="text-blue-300 hover:text-white transition-colors text-lg font-bold leading-none"
            style={{ pointerEvents: 'all' }}
          >
            ✕
          </button>
        </div>

        {/* Level + XP bar */}
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center font-black text-sm shadow-lg"
            style={{ background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.25)', color: '#fff' }}
          >
            {levelInfo.level}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white font-bold text-xs tracking-wide">{levelInfo.title}</span>
              <span className="text-blue-200 text-xs font-mono">
                {state.totalXp} XP
                {xpFlash && (
                  <span className="ml-1 text-green-300 font-bold animate-pulse">{xpFlash}</span>
                )}
              </span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <div
                className="h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: `${levelInfo.progress}%`,
                  background: 'linear-gradient(to right, #60a5fa, #a78bfa)',
                }}
              />
            </div>
            {levelInfo.nextMin && (
              <p className="text-blue-300 mt-0.5" style={{ fontSize: '10px' }}>
                {levelInfo.nextMin - state.totalXp} XP to next level
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid #e0e7ff' }}>
        <TabButton active={tab === 'daily'} onClick={() => setTab('daily')}>
          Daily  <Badge>{dailyDone}/{DAILY_TASKS.length}</Badge>
        </TabButton>
        <TabButton active={tab === 'weekly'} onClick={() => setTab('weekly')}>
          Weekly  <Badge>{weeklyDone}/{WEEKLY_TASKS.length}</Badge>
        </TabButton>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1" style={{ pointerEvents: 'all' }}>
        {tab === 'daily' && (
          <TaskSection
            tasks={DAILY_TASKS}
            completed={state.dailyCompleted}
            onToggle={(id) => toggleTask(id, DAILY_TASKS, 'dailyCompleted')}
            resetLabel={`Resets tomorrow · ${today}`}
          />
        )}
        {tab === 'weekly' && (
          <TaskSection
            tasks={WEEKLY_TASKS}
            completed={state.weeklyCompleted}
            onToggle={(id) => toggleTask(id, WEEKLY_TASKS, 'weeklyCompleted')}
            resetLabel={`Resets weekly · ${thisWeek}`}
          />
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-4 py-2 text-center" style={{ borderTop: '1px solid #e0e7ff' }}>
        <p className="text-gray-400 text-xs">
          Progress saved locally · Consistent reps beat sprints
        </p>
      </div>
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const TabButton = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className="flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
    style={{
      pointerEvents: 'all',
      background: active ? '#4f46e5' : 'transparent',
      color: active ? '#fff' : '#6366f1',
      borderBottom: active ? '2px solid #4f46e5' : '2px solid transparent',
    }}
  >
    {children}
  </button>
);

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span
    className="text-xs font-mono rounded-full px-1.5 py-0.5 leading-none"
    style={{ background: 'rgba(255,255,255,0.2)', fontSize: '10px' }}
  >
    {children}
  </span>
);

const TaskSection = ({
  tasks,
  completed,
  onToggle,
  resetLabel,
}: {
  tasks: Task[];
  completed: string[];
  onToggle: (id: string) => void;
  resetLabel: string;
}) => {
  const sections = [...new Set(tasks.map((t) => t.section))];

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <div key={section}>
          <p
            className="text-xs font-black uppercase tracking-widest mb-1.5 px-1"
            style={{ color: '#6366f1' }}
          >
            {section}
          </p>
          <div className="space-y-1.5">
            {tasks
              .filter((t) => t.section === section)
              .map((task) => {
                const done = completed.includes(task.id);
                return (
                  <button
                    key={task.id}
                    onClick={() => onToggle(task.id)}
                    className="w-full text-left rounded-lg p-3 flex items-start gap-3 transition-all"
                    style={{
                      background: done ? '#eef2ff' : '#fff',
                      border: `1px solid ${done ? '#a5b4fc' : '#e0e7ff'}`,
                      opacity: done ? 0.85 : 1,
                    }}
                  >
                    {/* Checkbox */}
                    <div
                      className="flex-shrink-0 w-4 h-4 rounded mt-0.5 flex items-center justify-center transition-all"
                      style={{
                        background: done ? '#4f46e5' : 'transparent',
                        border: `2px solid ${done ? '#4f46e5' : '#c7d2fe'}`,
                      }}
                    >
                      {done && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                          <path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    {/* Label */}
                    <span
                      className="flex-1 text-xs leading-snug"
                      style={{
                        color: done ? '#6366f1' : '#374151',
                        fontWeight: done ? 600 : 500,
                        textDecoration: done ? 'line-through' : 'none',
                        textDecorationColor: '#a5b4fc',
                      }}
                    >
                      {task.label}
                    </span>
                    {/* XP badge */}
                    <span
                      className="flex-shrink-0 text-xs font-bold rounded-full px-1.5 py-0.5 leading-none"
                      style={{
                        background: done ? '#e0e7ff' : '#f0f0ff',
                        color: done ? '#6366f1' : '#818cf8',
                        fontSize: '9px',
                      }}
                    >
                      +{task.xp}
                    </span>
                  </button>
                );
              })}
          </div>
        </div>
      ))}

      <p className="text-gray-400 text-center pt-1" style={{ fontSize: '10px' }}>
        {resetLabel}
      </p>
    </div>
  );
};
