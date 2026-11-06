import React, { useEffect, useState } from 'react';
import MuteButton from './MuteButton.jsx';

export const NOBODY_ONLINE_AFTER_MS = 20_000;

/** Public matchmaking wait. After 20s, offer a game vs the computer. */
export default function SearchingScreen({ size, startedAt, connected, onPlayAi, onInvite, onCancel }) {
  const [now, setNow] = useState(Date.now());
  const [dismissedAt, setDismissedAt] = useState(null);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);
  const waited = now - (startedAt || now);
  const sinceDismiss = dismissedAt ? now - dismissedAt : Infinity;
  const showPrompt = waited >= NOBODY_ONLINE_AFTER_MS && sinceDismiss >= NOBODY_ONLINE_AFTER_MS;

  return (
    <div className="landing waiting">
      <MuteButton className="corner" />
      <div className="spinner" />
      <h2>Finding an opponent…</h2>
      <p className="size-badge">{size}×{size} board</p>
      <p className="subtitle">
        {connected ? `Waiting ${Math.floor(waited / 1000)}s` : 'Connecting to the game server… (can take up to a minute)'}
      </p>

      {showPrompt && (
        <div className="card prompt" role="dialog" aria-live="polite">
          <div className="prompt-emoji">🤖</div>
          <div className="prompt-title">Nobody is online right now.</div>
          <div className="prompt-sub">Play vs computer?</div>
          <button onClick={onPlayAi}>🤖 Play vs Computer</button>
          <button className="whatsapp" onClick={onInvite}>Invite a friend on WhatsApp</button>
          <button className="link small" onClick={() => setDismissedAt(Date.now())}>Keep waiting</button>
        </div>
      )}

      <button className="secondary" onClick={onCancel}>Cancel</button>
    </div>
  );
}
