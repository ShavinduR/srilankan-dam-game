import React from 'react';
import { useMuted } from '../game/audio.js';

/** Global Mute/Unmute for music + sound effects (remembered on this device). */
export default function MuteButton({ className = '' }) {
  const [muted, toggle] = useMuted();
  return (
    <button
      type="button"
      className={`mute-btn ${muted ? 'is-muted' : ''} ${className}`}
      onClick={toggle}
      aria-pressed={muted}
      aria-label={muted ? 'Unmute sound and music' : 'Mute sound and music'}
      title={muted ? 'Unmute' : 'Mute'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
