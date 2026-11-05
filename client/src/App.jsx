import React, { useCallback, useRef, useState } from 'react';
import Landing from './components/Landing.jsx';
import GameScreen from './components/GameScreen.jsx';
import { useLocalGame } from './hooks/useLocalGame.js';
import { useOnlineGame } from './hooks/useOnlineGame.js';

function LocalGame({ size, onLeave, toast }) {
  const ctrl = useLocalGame(size);
  return <GameScreen ctrl={ctrl} onLeave={onLeave} toast={toast} />;
}

export default function App() {
  const [screen, setScreen] = useState('landing'); // landing | local | online
  const [size, setSize] = useState(12);
  const [toastMsg, setToastMsg] = useState(null);
  const timer = useRef();

  const toast = useCallback((text, kind = 'info') => {
    clearTimeout(timer.current);
    setToastMsg({ text, kind, id: Date.now() });
    timer.current = setTimeout(() => setToastMsg(null), kind === 'nudge' || kind === 'warning' ? 5000 : 2500);
  }, []);

  const online = useOnlineGame(toast);

  const leaveOnline = () => { online.leave(); setScreen('landing'); };

  let body;
  if (screen === 'local') {
    body = <LocalGame key={size} size={size} onLeave={() => setScreen('landing')} toast={toast} />;
  } else if (screen === 'online' && online.phase === 'playing' && online.ctrl) {
    body = <GameScreen ctrl={online.ctrl} onLeave={leaveOnline} toast={toast} />;
  } else if (screen === 'online') {
    body = (
      <div className="landing">
        <div className="spinner" />
        <h2>Finding an opponent…</h2>
        <p className="size-badge">{size}×{size} board</p>
        <p className="subtitle">Open this page on another device (or tab) to test.</p>
        <button className="secondary" onClick={leaveOnline}>Cancel</button>
      </div>
    );
  } else {
    body = (
      <Landing
        onFindMatch={(name, n) => { setSize(n); online.findMatch(name, n); setScreen('online'); }}
        onLocal={(n) => { setSize(n); setScreen('local'); }}
      />
    );
  }

  return (
    <>
      {body}
      {toastMsg && <div key={toastMsg.id} className={`toast ${toastMsg.kind}`}>{toastMsg.text}</div>}
    </>
  );
}
