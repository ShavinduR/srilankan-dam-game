import React, { useRef, useState } from 'react';
import { BOARD_SIZES, DEFAULT_SIZE, rowsPerSide } from '../game/engine.js';
import { DIFFICULTY_LABEL } from '../game/aiClient.js';
import MuteButton from './MuteButton.jsx';
import ProfileCard from './ProfileCard.jsx';

const piecesPerSide = (n) => rowsPerSide(n) * (n / 2);
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const DIFF_HINT = {
  easy: 'Relaxed — sometimes misses captures (practise the Blow!)',
  medium: 'A fair fight',
  hard: 'Thinks ahead. Good luck!',
};

const load = (key, ok, fallback) => {
  try { const v = localStorage.getItem(key); return ok(v) ? v : fallback; } catch { return fallback; }
};
const save = (key, v) => { try { localStorage.setItem(key, String(v)); } catch { /* ignore */ } };

export default function Landing({ inviteCode, onFindMatch, onPlayAi, onCreateRoom, onJoinRoom, onLocal, onDismissInvite }) {
  const [name, setName] = useState(() => load('dam.name', Boolean, ''));
  const [size, setSize] = useState(() => Number(load('dam.size', (v) => BOARD_SIZES.includes(Number(v)), DEFAULT_SIZE)));
  const [difficulty, setDifficulty] = useState(() => load('dam.difficulty', (v) => DIFFICULTIES.includes(v), 'easy'));
  const [joinCode, setJoinCode] = useState('');
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef(null);

  const chooseSize = (n) => { setSize(n); save('dam.size', n); };
  const chooseDifficulty = (d) => { setDifficulty(d); save('dam.difficulty', d); };

  /** Online modes need a name; returns it or focuses the field. */
  const requireName = () => {
    const n = name.trim();
    if (!n) {
      setNameError(true);
      nameRef.current?.focus();
      nameRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return null;
    }
    save('dam.name', n);
    return n;
  };

  const joinWith = (code) => { const n = requireName(); if (n) onJoinRoom(n, code); };

  return (
    <div className="landing">
      <MuteButton className="corner" />
      <header className="brand">
        <div className="logo"><div className="mini-piece black big" /><div className="mini-piece white big" /></div>
        <h1>DAM</h1>
        <p className="subtitle">Sri Lankan Draughts · දාම්</p>
      </header>

      {inviteCode && (
        <section className="card invite">
          <div className="invite-title">🎉 You're invited to a game!</div>
          <div className="invite-code">{inviteCode}</div>
          <label htmlFor="name-invite" className="field-label">Your name</label>
          <input
            id="name-invite"
            value={name}
            maxLength={20}
            placeholder="e.g. Kasun"
            onChange={(e) => { setName(e.target.value); setNameError(false); }}
            className={nameError ? 'invalid' : ''}
          />
          <button onClick={() => joinWith(inviteCode)}>Join {inviteCode}</button>
          <button className="link small" onClick={onDismissInvite}>Not now</button>
        </section>
      )}

      <ProfileCard name={name} />

      <section className="card">
        <label htmlFor="name" className="field-label">Display Name</label>
        <input
          id="name"
          ref={nameRef}
          value={name}
          maxLength={20}
          autoComplete="nickname"
          placeholder="e.g. Kasun"
          className={nameError ? 'invalid' : ''}
          onChange={(e) => { setName(e.target.value); setNameError(false); save('dam.name', e.target.value.trim()); }}
        />
        {nameError && <div className="field-error">Enter a name so your opponent knows who you are.</div>}

        <span className="field-label" id="size-label">Board Size</span>
        <div className="size-picker" role="radiogroup" aria-labelledby="size-label">
          {BOARD_SIZES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={size === n}
              className={`size-option ${size === n ? 'selected' : ''}`}
              onClick={() => chooseSize(n)}
            >
              <span className="size-main">{n}×{n}</span>
              <span className="size-sub">{piecesPerSide(n)} pieces each</span>
            </button>
          ))}
        </div>

        <button className="primary-cta" onClick={() => { const n = requireName(); if (n) onFindMatch(n, size); }}>
          🌐 Find Match <small>({size}×{size})</small>
        </button>
      </section>

      <section className="card">
        <div className="card-title">🤖 Play vs Computer</div>
        <div className="seg" role="radiogroup" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={difficulty === d}
              className={`seg-option ${difficulty === d ? 'selected' : ''}`}
              onClick={() => chooseDifficulty(d)}
            >
              {DIFFICULTY_LABEL[d]}
            </button>
          ))}
        </div>
        <div className="hint-text">{DIFF_HINT[difficulty]}</div>
        <button className="secondary" onClick={() => { save('dam.name', name.trim()); onPlayAi(name.trim(), size, difficulty); }}>
          Play vs Computer ({DIFFICULTY_LABEL[difficulty]})
        </button>
      </section>

      <section className="card">
        <div className="card-title">👥 Play with a Friend</div>
        <button className="whatsapp" onClick={() => { const n = requireName(); if (n) onCreateRoom(n, size); }}>
          Create Room & invite via WhatsApp
        </button>
        <form
          className="join-row"
          onSubmit={(e) => { e.preventDefault(); if (joinCode.trim()) joinWith(joinCode); }}
        >
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="DAM-4821"
            inputMode="text"
            autoCapitalize="characters"
            maxLength={9}
            aria-label="Room code"
          />
          <button type="submit" className="secondary" disabled={!joinCode.replace(/\D/g, '').length}>Join</button>
        </form>
      </section>

      <button type="button" className="secondary ghost-btn" onClick={() => onLocal(size)}>
        📱 Pass &amp; Play (2 players, same device)
      </button>

      <details className="rules">
        <summary>Rules</summary>
        <ul>
          <li>12×12: 30 pieces each (5 rows). 10×10: 20 pieces each (4 rows). Two empty rows in the middle.</li>
          <li>Men move 1 step diagonally forward; they capture forward <b>and</b> backward.</li>
          <li>Multi-jumps must be completed in the same turn.</li>
          <li>Reach the far row to become a <b>Dam</b> (king) — your turn ends immediately.</li>
          <li>Dams fly any distance and capture from afar.</li>
          <li><b>Blow rule:</b> captures aren't forced. If your opponent skips one, tap that piece <i>before</i> you move to remove it.</li>
          <li>Touch-move: once you tap a target square the move is final. 90s per turn — warning at 60s.</li>
          <li><b>Draw:</b> 25 moves each without any capture.</li>
          <li>Lost connection? You have 60 seconds to come back — the clock pauses.</li>
          <li>Tease your opponent with quick reactions: 😂 හූ.. හූ.. · 🤔 ඇයි බයද? · 🤦‍♂️ අයියෝ · 😎 එළකිරි</li>
        </ul>
      </details>
      <a className="privacy-link" href="/privacy.html">Privacy Policy</a>
    </div>
  );
}
