import React, { useCallback, useEffect, useRef, useState } from 'react';
import Landing from './components/Landing.jsx';
import GameScreen from './components/GameScreen.jsx';
import SearchingScreen from './components/SearchingScreen.jsx';
import LobbyScreen from './components/LobbyScreen.jsx';
import MuteButton from './components/MuteButton.jsx';
import { useLocalGame } from './hooks/useLocalGame.js';
import { useOnlineGame } from './hooks/useOnlineGame.js';

/** "?room=DAM-4821" (WhatsApp invite link) → "DAM-4821" */
function inviteFromUrl() {
  try {
    const raw = new URLSearchParams(window.location.search).get('room');
    const digits = String(raw || '').replace(/\D/g, '');
    return digits.length === 4 ? `DAM-${digits}` : null;
  } catch { return null; }
}
const clearInviteFromUrl = () => {
  try { window.history.replaceState(null, '', window.location.pathname); } catch { /* ignore */ }
};

/** Pass & Play or vs Computer (both run entirely on this device). */
function LocalGame({ cfg, onLeave, toast }) {
  const ctrl = useLocalGame(cfg.size, {
    ai: cfg.difficulty ? { difficulty: cfg.difficulty } : null,
    playerName: cfg.name,
    notify: toast,
  });
  return <GameScreen ctrl={ctrl} onLeave={onLeave} toast={toast} />;
}

export default function App() {
  const [screen, setScreen] = useState('landing'); // landing | local | online
  const [localCfg, setLocalCfg] = useState(null);  // { size, difficulty?, name, key }
  const [search, setSearch] = useState(null);      // { name, size } of the current public search
  const [inviteCode, setInviteCode] = useState(inviteFromUrl);
  const [toastMsg, setToastMsg] = useState(null);
  const timer = useRef();

  const toast = useCallback((text, kind = 'info') => {
    clearTimeout(timer.current);
    setToastMsg({ text, kind, id: Date.now() });
    const ms = kind === 'tip' ? 6000 : kind === 'nudge' || kind === 'warning' ? 5000 : 2800;
    timer.current = setTimeout(() => setToastMsg(null), ms);
  }, []);

  const online = useOnlineGame(toast);

  // Follow the online flow (also when the server resumes our game after a reload).
  useEffect(() => {
    if (online.phase !== 'idle') setScreen('online');
    else if (screen === 'online') setScreen('landing');
    if (online.phase === 'playing' && inviteCode) { setInviteCode(null); clearInviteFromUrl(); }
  }, [online.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const startLocal = (cfg) => { setLocalCfg({ ...cfg, key: Date.now() }); setScreen('local'); };
  const playAi = (name, size, difficulty) => startLocal({ size, difficulty, name });
  const savedDifficulty = () => {
    try { return localStorage.getItem('dam.difficulty') || 'easy'; } catch { return 'easy'; }
  };

  let body;
  if (screen === 'local' && localCfg) {
    body = <LocalGame key={localCfg.key} cfg={localCfg} onLeave={() => setScreen('landing')} toast={toast} />;
  } else if (screen === 'online' && online.phase === 'playing' && online.ctrl) {
    body = <GameScreen ctrl={online.ctrl} onLeave={() => online.leave()} toast={toast} />;
  } else if (screen === 'online' && online.phase === 'searching') {
    body = (
      <SearchingScreen
        size={search?.size ?? 12}
        startedAt={online.searchStartedAt}
        connected={online.connected}
        onCancel={() => online.leave()}
        onPlayAi={() => { online.leave(); playAi(search?.name ?? '', search?.size ?? 12, savedDifficulty()); }}
        onInvite={() => { online.leave(); online.createRoom(search?.name ?? '', search?.size ?? 12); }}
      />
    );
  } else if (screen === 'online' && online.phase === 'lobby') {
    body = (
      <LobbyScreen
        lobby={online.lobby}
        name={search?.name}
        connected={online.connected}
        onCancel={() => online.leave()}
        toast={toast}
      />
    );
  } else if (screen === 'online') {
    body = (
      <div className="landing waiting">
        <MuteButton className="corner" />
        <div className="spinner" />
        <h2>{online.phase === 'joining' ? 'Joining room…' : 'Connecting…'}</h2>
        {!online.connected && <p className="subtitle">Waking up the game server… (can take up to a minute)</p>}
        <button className="secondary" onClick={() => online.leave()}>Cancel</button>
      </div>
    );
  } else {
    body = (
      <Landing
        inviteCode={inviteCode}
        onDismissInvite={() => { setInviteCode(null); clearInviteFromUrl(); }}
        onFindMatch={(name, size) => { setSearch({ name, size }); online.findMatch(name, size); }}
        onPlayAi={playAi}
        onCreateRoom={(name, size) => { setSearch({ name, size }); online.createRoom(name, size); }}
        onJoinRoom={(name, code) => online.joinRoom(name, code)}
        onLocal={(size) => startLocal({ size })}
      />
    );
  }

  return (
    <>
      {body}
      {toastMsg && <div key={toastMsg.id} className={`toast ${toastMsg.kind}`} role="status">{toastMsg.text}</div>}
    </>
  );
}
