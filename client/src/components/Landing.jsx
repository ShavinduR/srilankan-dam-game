import React, { useState } from 'react';

export default function Landing({ onFindMatch, onLocal }) {
  const [name, setName] = useState(() => localStorage.getItem('dam.name') || '');
  const submit = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    localStorage.setItem('dam.name', n);
    onFindMatch(n);
  };
  return (
    <div className="landing">
      <div className="logo">
        <div className="mini-piece black big" /><div className="mini-piece white big" />
      </div>
      <h1>DAM</h1>
      <p className="subtitle">Sri Lankan Draughts · 12×12</p>
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
        <button type="submit" disabled={!name.trim()}>Find Match</button>
        <button type="button" className="secondary" onClick={onLocal}>Pass &amp; Play (same device)</button>
      </form>
      <details className="rules">
        <summary>Rules</summary>
        <ul>
          <li>Men move 1 step diagonally forward; they capture forward <b>and</b> backward.</li>
          <li>Multi-jumps must be completed in the same turn.</li>
          <li>Reach the far row to become a <b>Dam</b> (king) — your turn ends immediately.</li>
          <li>Dams fly any distance and capture from afar.</li>
          <li><b>Blow rule:</b> captures aren't forced. If your opponent skips one, tap that piece <i>before</i> you move to remove it.</li>
          <li>Touch-move: once you tap a target square the move is final. 60s per turn.</li>
        </ul>
      </details>
    </div>
  );
}
