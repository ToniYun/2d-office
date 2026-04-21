# 2D Office

A real-time 2D office simulator where AI agents animate at their desks whenever they're actually running. Watch packets fly between agents when work is delegated, NPCs walk to the water cooler, and chat bubbles appear during office conversations.

Built with React + TypeScript + Canvas 2D + Socket.io.

![2D Office screenshot]

## Features

- **Live agent animations** — desks light up, characters type, thinking dots appear when your AI is working
- **Packet animations** — data packets fly between agents on delegation/handoff
- **NPC behaviours** — agents walk to the water cooler, take bathroom breaks, hold conversations
- **Multiplayer** — multiple browser tabs/devices share the same live view via Socket.io
- **Scripted scenes** — office drama plays out in chat bubbles
- **Career Coach panel** — job search task tracker (optional, localStorage-based)

## Quick Start

```bash
npm install
npm run build
node server/index.js
```

Visit `http://localhost:3002`.

For development with hot reload:
```bash
node server/index.js &   # start the Socket.io server
npm run dev              # start Vite dev server on port 5173
```

## Configuring Your Agents

Edit **`agents.config.json`** in the project root. This is the only file you need to change.

```json
{
  "company": "My AI Co.",
  "agents": [
    {
      "id": "ceo",
      "name": "ceo",
      "role": "CEO / Router",
      "model": "gpt-4o",
      "color": "#fbbf24",
      "floor": 2,
      "tier": "exec"
    },
    {
      "id": "engineer",
      "name": "engineer",
      "role": "Senior Engineer",
      "model": "claude-sonnet-4",
      "color": "#60a5fa",
      "floor": 1,
      "tier": "senior"
    }
  ],
  "handoffRouting": {
    "engineer": "ceo"
  }
}
```

### Desk slots (fixed layout)

| Floor | Slots | Agent IDs (default) |
|-------|-------|---------------------|
| F3 (Exec) | 2 desks | `ceo`, `cto` |
| F2 (Senior) | 4 desks | `researcher`, `engineer`, `qa`, `backend` |
| F1 (Junior) | 3 desks | `analyst`, `ops`, `intern` |

The desk positions are fixed in the building layout. Keep the same number of agents per floor, or edit `src/components/OfficeCanvas.tsx` to adjust desk positions (`deskX`).

Also update the matching entries in:
- `src/components/UI/ModelPanel.tsx` — the right-side panel agent list
- `src/data/cast.ts` — character personalities for the Scenes panel

## Triggering Agent Animations

When your AI model starts working, call the HTTP API. The NPC at their desk will animate immediately.

### HTTP API

```bash
# Mark an agent as active (starts typing animation, glow effect)
curl -X POST http://localhost:3002/api/agent/active \
  -H "Content-Type: application/json" \
  -d '{"agentId": "engineer"}'

# Mark an agent as idle (stops animation)
curl -X POST http://localhost:3002/api/agent/idle \
  -H "Content-Type: application/json" \
  -d '{"agentId": "engineer"}'

# Trigger a handoff packet animation (packet flies from → to)
curl -X POST http://localhost:3002/api/agent/handoff \
  -H "Content-Type: application/json" \
  -d '{"from": "ceo", "to": "engineer"}'
```

### Python example

```python
import requests

BASE = "http://localhost:3002"

def agent_active(agent_id: str):
    requests.post(f"{BASE}/api/agent/active", json={"agentId": agent_id})

def agent_idle(agent_id: str):
    requests.post(f"{BASE}/api/agent/idle", json={"agentId": agent_id})

# Wrap your agent call:
agent_active("engineer")
result = my_model.run(prompt)
agent_idle("engineer")
```

### Optional: API key auth

Set `API_KEY` in the environment to require `Authorization: Bearer <key>` on all `/api/*` requests:

```bash
API_KEY=my-secret node server/index.js
```

### Optional: process-name watchers

Add `processWatchers` to `agents.config.json` to automatically detect when a CLI process is running:

```json
"processWatchers": [
  {
    "agentId": "engineer",
    "processNames": ["claude"],
    "patterns": ["@anthropic-ai/claude-code"]
  }
]
```

The server polls every 10 seconds and fires `agentActive`/`agentIdle` when the process starts/stops.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3002`  | Server port |
| `API_KEY`| *(none)*| If set, all `/api/*` requests require `Authorization: Bearer <key>` |

## Project Structure

```
2d-office/
├── agents.config.json      ← Edit this — your agents, colors, floors
├── server/
│   └── index.js            ← Socket.io + HTTP API server
├── src/
│   ├── components/
│   │   ├── OfficeCanvas.tsx ← Main canvas renderer (agent IDs, desk layout)
│   │   └── UI/
│   │       ├── ModelPanel.tsx   ← Agent status panel
│   │       ├── HUD.tsx
│   │       ├── LandingScreen.tsx
│   │       ├── RoleplayPanel.tsx
│   │       └── HandoffToast.tsx
│   ├── data/
│   │   ├── cast.ts         ← Character personalities
│   │   └── scenes.ts       ← Scripted office dialogues
│   └── store/gameStore.ts  ← Zustand state
├── dist/                   ← Built frontend (served by server)
└── package.json
```

## Customising Characters & Scenes

Edit **`src/data/cast.ts`** to change character names, personalities, and example lines.

Edit **`src/data/scenes.ts`** to write your own office drama. Speaker IDs must match cast IDs.

## Tech Stack

- **React 18 + TypeScript** — UI
- **HTML5 Canvas 2D** — rendering (960×580 virtual, scales to screen)
- **Socket.io** — real-time multiplayer sync
- **Zustand** — client state
- **Vite** — build tool
- **Tailwind CSS** — UI panels
