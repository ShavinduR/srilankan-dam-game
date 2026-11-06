import React from 'react';
import { useStats, winRate } from '../game/stats.js';

/** "Player Profile": lifetime stats kept on this device (localStorage). */
export default function ProfileCard({ name }) {
  const s = useStats();
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <section className="card profile" aria-label="Player profile">
      <div className="profile-head">
        <div className="avatar" aria-hidden="true">{initial}</div>
        <div className="profile-name">
          <div className="pn">{name?.trim() || 'Guest player'}</div>
          <div className="ps">
            {s.played === 0 ? 'Play your first game!' : (
              <>🔥 Streak {s.streak} · Best {s.bestStreak}</>
            )}
          </div>
        </div>
        <div className="winrate" title="Win rate">
          <svg viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15.5" className="ring-bg" />
            {winRate(s) > 0 && <circle cx="18" cy="18" r="15.5" className="ring" strokeDasharray={`${winRate(s) * 0.974} 100`} />}
          </svg>
          <span>{winRate(s)}%</span>
        </div>
      </div>
      <div className="stat-row">
        <div className="stat"><b>{s.played}</b><span>Played</span></div>
        <div className="stat win"><b>{s.wins}</b><span>Wins</span></div>
        <div className="stat loss"><b>{s.losses}</b><span>Losses</span></div>
        <div className="stat"><b>{s.draws}</b><span>Draws</span></div>
      </div>
    </section>
  );
}
