# Dam — Sri Lankan Draughts (Real-time MVP)

12×12 or 10×10 Dam with flying kings, the street **"Blow"** rule, 90s turn timer (warning at 60s), nudge (අදින්න),
draw/resign, and rematch. React (Vite, PWA) + Node.js/Socket.IO. No database — all rooms live in server memory.

## Project structure
```
dam-game/
├── shared/
│   ├── damEngine.js        # Pure rules engine (used by client AND server)
│   └── damEngine.test.js   # node --test unit tests
├── server/
│   ├── index.js            # Express + Socket.IO bootstrap, serves client/dist in prod
│   └── rooms.js            # Matchmaking queue, rooms, timers, all socket events
└── client/
    ├── index.html          # PWA meta tags
    ├── vite.config.js      # dev proxy /socket.io -> :3001
    ├── public/             # manifest.webmanifest, sw.js, icons
    └── src/
        ├── App.jsx                 # landing / waiting / game routing + toasts
        ├── socket.js
        ├── game/engine.js          # re-exports ../../shared/damEngine.js
        ├── game/feedback.js        # beep + vibrate
        ├── hooks/useLocalGame.js   # pass & play (local state)
        ├── hooks/useOnlineGame.js  # socket controller (optimistic + server-authoritative)
        ├── hooks/useTurnClock.js
        └── components/{Landing,GameScreen,Board}.jsx
```

## Run
```bash
npm run install:all
npm test                 # engine rules tests
npm run dev:server       # terminal 1 → http://localhost:3001
npm run dev:client       # terminal 2 → http://localhost:5173 (also on your LAN IP for phones)
```
Production / phone testing (single port):
```bash
npm run build && npm start   # http://<your-ip>:3001
```
Service workers need HTTPS on non-localhost origins — for installing on a phone use a tunnel
(e.g. `cloudflared tunnel --url http://localhost:3001` or ngrok). Gameplay works over plain HTTP regardless.

## Deployment (frontend on Vercel, backend on Render)
Both apps import `shared/damEngine.js`, so **neither service uses a sub-folder Root Directory** —
the root-level `vercel.json` and `render.yaml` build only their half.

### Backend → Render (Web Service)
| Setting | Value |
|---|---|
| Root Directory | *(leave empty)* |
| Runtime | Node |
| Build Command | `npm --prefix server ci` |
| Start Command | `node server/index.js` |
| Health Check Path | `/health` |
| Env `NODE_VERSION` | `22` |
| Env `CLIENT_ORIGIN` | `https://<your-app>.vercel.app` (comma-separate more; `*` wildcard OK, e.g. `https://<your-app>-*.vercel.app` for previews) |

`PORT` is injected by Render — don't set it. Or use **New → Blueprint** and pick this repo (`render.yaml`).

### Frontend → Vercel
| Setting | Value |
|---|---|
| Root Directory | *(leave empty — repo root)* |
| Framework Preset | Other (commands come from `vercel.json`) |
| Install Command | `npm --prefix client ci` |
| Build Command | `npm --prefix client run build` |
| Output Directory | `client/dist` |
| Env `VITE_SERVER_URL` | `https://<your-render-service>.onrender.com` (no trailing slash) |

`VITE_SERVER_URL` is baked in at build time → **redeploy** Vercel after changing it.
Render's free plan sleeps after ~15 min idle; the first match after that can take ~50s while it wakes.

## Rules as implemented
| Rule | Behaviour |
|---|---|
| Board size | Chosen on the home screen: **12×12** or **10×10**. Online players are only matched with someone who picked the same size; rematches keep the size. |
| Layout | Always exactly **2 empty rows** in the middle. 12×12: 5 rows / **30 pieces** each. 10×10: 4 rows / **20 pieces** each. Black on top, White at the bottom; White moves first. |
| Man | 1 diagonal step forward; captures forward **and** backward. |
| Multi-jump | After a capture, if the same piece can capture again it **must** continue (other moves locked). |
| Promotion | Reaching the far row (row 1 for White; row 12 or 10 for Black) → Dam (king); turn ends immediately, even mid-chain. |
| Flying king | Moves any distance; captures one piece at any distance, landing on any empty square beyond. |
| Mandatory capture | **Not** enforced. If a player had any capture available and made a non-capturing move, every piece that could have captured becomes a Blow candidate. |
| Blow | Opponent may tap one candidate *before their first move* to remove it, then moves normally. Moving first forfeits the chance. "Blow hints" toggle can hide the highlight for a purist game. |
| Timer | **90s** per turn (multi-jumps share one turn). At **60s** the player to move sees "You will lose in 30 seconds!" (toast + red countdown, vibrate/beep). At 90s they lose. The server enforces the timeout. |
| Nudge | Waiting player gets "අදින්න" (nudge) at 30s; once per turn; vibrates + beeps the active player. |
| Win | Opponent has no pieces / no legal moves, resign, timeout, or disconnect. |
| Rematch | Both press Play Again → new game in the same room with colours swapped. |

## Socket events
Client → server: `findMatch {name, size}` (size: 12 or 10), `cancelMatch`, `move {from,to}`, `blow {pos}`, `nudge`, `resign`,
`offerDraw`, `respondDraw {accept}`, `rematch`, `leaveRoom`.
Server → client: `waiting`, `matchFound {roomId,color,size,opponent}`, `state {size,game,players,turnStartedAt,serverNow,turnLimitMs,warningAfterMs,…}`,
`nudged`, `blown`, `drawDeclined`, `opponentLeft`, `errorMsg`.

Each `move` is one step (a simple move or a single jump). The server validates with the same engine and
rebroadcasts the full state, so a tampered client can never make an illegal move.
