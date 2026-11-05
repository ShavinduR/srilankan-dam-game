import React, { useState } from 'react';
import { BOARD_SIZES, DEFAULT_SIZE, rowsPerSide } from '../game/engine.js';

const piecesPerSide = (n) => rowsPerSide(n) * (n / 2);

export default function Landing({ onFindMatch, onLocal }) {
  const [name, setName] = useState(() => localStorage.getItem('dam.name') || '');
  const [size, setSize] = useState(() => {
    const saved = Number(localStorage.getItem('dam.size'));
    return BOARD_SIZES.includes(saved) ? saved : DEFAULT_SIZE;
  });
  const chooseSize = (n) => { setSize(n); localStorage.setItem('dam.size', String(n)); };
  const submit = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    localStorage.setItem('dam.name', n);
    onFindMatch(n, size);
  };
  return (
    <div className="landing">
      <div className="logo">
        <div className="mini-piece black big" /><div className="mini-piece white big" />
      </div>
      <h1>DAM</h1>
      <p className="subtitle">Sri Lankan Draughts · 12×12 or 10×10</p>
      <form onSubmit={submit} className="card">
        <label htmlFor="name">Display Name</label>
        <input
          id="name"
          value={name}
          maxLength={20}
          autoComplete="nickname"
          placeholder="e.g. Kasun"
          onChange={(e) => setName(e.target.value)}
        />
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
        <button type="submit" disabled={!name.trim()}>Find Match ({size}×{size})</button>
        <button type="button" className="secondary" onClick={() => onLocal(size)}>Pass &amp; Play (same device)</button>
      </form>
      <details className="rules">
        <summary>Rules</summary>
        <ul>
          <li>Men move 1 step diagonally forward; they capture forward <b>and</b> backward.</li>
          <li>Multi-jumps must be completed in the same turn.</li>
          <li>Reach the far row to become a <b>Dam</b> (king) — your turn ends immediately.</li>
          <li>Dams fly any distance and capture from afar.</li>
          <li><b>Blow rule:</b> captures aren't forced. If your opponent skips one, tap that piece <i>before</i> you move to remove it.</li>
          <li>12×12: 30 pieces each (5 rows). 10×10: 20 pieces each (4 rows). Two empty rows in the middle.</li>
          <li>Touch-move: once you tap a target square the move is final. 90s per turn — warning at 60s.</li>
        </ul>
      </details>
    </div>
  );
}
