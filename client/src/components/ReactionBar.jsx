import React, { useEffect, useRef, useState } from 'react';
import { REACTIONS, REACTION_COOLDOWN_MS } from '../game/reactions.js';

/** Quick-chat buttons. Short cooldown (the server enforces it too). */
export default function ReactionBar({ onReact, compact = false }) {
  const [cooling, setCooling] = useState(false);
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);

  const send = (id) => {
    if (cooling || !onReact) return;
    onReact(id);
    setCooling(true);
    timer.current = setTimeout(() => setCooling(false), REACTION_COOLDOWN_MS);
  };

  return (
    <div className={`reaction-bar ${compact ? 'compact' : ''}`} role="group" aria-label="Quick reactions">
      {REACTIONS.map((r) => (
        <button key={r.id} type="button" className="reaction-btn" disabled={cooling} onClick={() => send(r.id)}>
          <span className="r-emoji" aria-hidden="true">{r.emoji}</span>
          <span className="r-text">{r.text}</span>
        </button>
      ))}
    </div>
  );
}
