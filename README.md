# Dam — Sri Lankan Draughts (Real-time MVP)

12×12 or 10×10 Dam with flying kings, the street **"Blow"** rule, 90s turn timer (warning at 60s), nudge (අදින්න),
draw/resign, and rematch. React (Vite, PWA) + Node.js/Socket.IO. No database — all rooms live in server memory.

📱 **Publishing to Google Play:** see [docs/PLAY_STORE_GUIDE.md](docs/PLAY_STORE_GUIDE.md).

## Project structure
```
├── shared/                     # used by BOTH client and server
│   ├── damEngine.js            # Rules engine (board sizes, Blow rule, draw rule, piece ids)
│   ├── ai.js                   # Computer opponent (easy / medium / hard)
│   ├── reactions.js            # Quick-chat reaction whitelist
│   └── *.test.js               # node --test unit tests (npm test)
├── server/
│   ├── index.js                # Express + Socket.IO bootstrap, CORS, /health
│   └── rooms.js                # Matchmaking, private rooms, reconnection grace, timers, all socket events
├── client/
│   ├── public/                 # manifest, sw.js, icons, sounds/, privacy.html
│   └── src/
│       ├── App.jsx                     # screen routing, ?room= invite links, toasts
│       ├── socket.js                   # Socket.IO client + per-tab playerId
│       ├── game/audio.js               # SFX, music, mute
│       ├── game/stats.js               # localStorage lifetime stats
│       ├── game/aiClient.js, aiWorker.js  # runs the AI in a Web Worker
│       ├── hooks/useOnlineGame.js      # online controller (search, rooms, resume)
│       ├── hooks/useLocalGame.js       # Pass & Play + vs Computer controller
│       └── components/
│           ├── Landing.jsx, ProfileCard.jsx       # home screen + player stats
│           ├── SearchingScreen.jsx, LobbyScreen.jsx  # matchmaking wait (20s AI offer), room code + WhatsApp share
│           ├── GameScreen.jsx, Board.jsx          # game UI; animated piece layer
│           └── ReactionBar.jsx, ReactionLayer.jsx, MuteButton.jsx
├── tools/make_sounds.py        # regenerates the default sound files
└── docs/PLAY_STORE_GUIDE.md
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
| Game modes | **Find Match** (online, random opponent) · **vs Computer** (Easy / Medium / Hard, runs on the device in a Web Worker) · **Play with a Friend** (private room code `DAM-4821` + WhatsApp invite link `/?room=DAM-4821`) · **Pass & Play**. If nobody is found within 20s the player is offered a game vs the computer. |
| Computer AI | `shared/ai.js`. Easy: random-ish and **skips an available capture ~40% of the time** (teaches the Blow rule, with a tip the first 3 times). Medium: 2-ply search + noise. Hard: iterative-deepening alpha-beta (~0.8s budget). All levels Blow when they can (Easy only half the time). |
| Board size | Chosen on the home screen: **12×12** or **10×10**. Online players are only matched with someone who picked the same size; rematches keep the size. |
| Layout | Always exactly **2 empty rows** in the middle. 12×12: 5 rows / **30 pieces** each. 10×10: 4 rows / **20 pieces** each. Black on top, White at the bottom; White moves first. |
| Man | 1 diagonal step forward; captures forward **and** backward. |
| Multi-jump | After a capture, if the same piece can capture again it **must** continue (other moves locked). |
| Promotion | Reaching the far row (row 1 for White; row 12 or 10 for Black) → Dam (king); turn ends immediately, even mid-chain. |
| Flying king | Moves any distance; captures one piece at any distance, landing on any empty square beyond. |
| Mandatory capture | **Not** enforced. If a player had any capture available and made a non-capturing move, every piece that could have captured becomes a Blow candidate. |
| Blow | Opponent may tap one candidate *before their first move* to remove it, then moves normally. Moving first forfeits the chance. "Blow hints" toggle can hide the highlight for a purist game. |
| Timer | **90s** per turn (multi-jumps share one turn). At **60s** the player to move sees "තව තත්පර 30කින් ඔබ පරාජය වේ!" (toast + red countdown, vibrate/beep). At 90s they lose. The server enforces the timeout. |
| Quick reactions | 😂 හූ.. හූ.. · 🤔 ඇයි බයද? · 🤦‍♂️ අයියෝ · 😎 එළකිරි — shown as a floating bubble on both screens (1.5s cooldown, enforced by the server). Also available on the game-over screen. |
| Sound | Wooden move/capture sounds for every move (and Blows), looping background music during a game, global 🔊/🔇 Mute (remembered per device). Replace `client/public/sounds/{move,capture,bgm}.mp3` with your own files of the same name; `python3 tools/make_sounds.py` regenerates the defaults. |
| Nudge | Waiting player gets "අදින්න" (nudge) at 30s; once per turn; vibrates + beeps the active player. |
| Win | Opponent has no pieces / no legal moves, resign, timeout, leaves, or doesn't reconnect within 60s. |
| Draw | Agreed, or automatically after **25 moves each (50 turns) without any capture or Blow** (`DRAW_MOVES_EACH` in `shared/damEngine.js`). A countdown shows for the last 10 turns. |
| Reconnection | A dropped connection is not a loss: the clock pauses, the opponent sees "Opponent reconnecting… 0:59", and the player has **60s** to come back (network blip or page reload) and resume. Pressing Leave is an immediate loss. |
| Stats | Played / wins / losses / draws / win-rate / streaks stored in `localStorage` (no database) and shown on the home screen profile card. Online + vs-computer games count. |
| Animations | Pieces glide (180ms), captured pieces fade out, golden flash on promotion to Dam. Respects `prefers-reduced-motion`. |
| Rematch | Both press Play Again → new game in the same room with colours swapped. |

## Socket events
Handshake: `auth: { playerId }` (random per browser tab, kept in `sessionStorage`; lets a reconnecting player reclaim their seat).
Client → server: `findMatch {name, size}` (size: 12 or 10), `cancelMatch`, `createRoom {name, size}`, `joinRoom {name, code}`, `move {from,to}`, `blow {pos}`, `nudge`, `resign`,
`offerDraw`, `respondDraw {accept}`, `reaction {id}`, `rematch`, `leaveRoom`.
Server → client: `waiting`, `roomCreated {code,size}`, `joinError {message}`, `roomExpired`, `opponentReconnected`, `sessionReplaced`, `matchFound {roomId,color,size,opponent}`, `state {size,code,gameNo,game,players{name,connected,graceEndsAt},turnStartedAt,pausedAt,serverNow,turnLimitMs,warningAfterMs,…}`,
`nudged`, `blown`, `reaction {id,by,name,at}`, `drawDeclined`, `opponentLeft`, `errorMsg`.

Each `move` is one step (a simple move or a single jump). The server validates with the same engine and
rebroadcasts the full state, so a tampered client can never make an illegal move.
