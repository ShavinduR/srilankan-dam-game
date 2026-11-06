import React, { useEffect, useMemo, useRef, useState } from 'react';
import Board from './Board.jsx';
import { getLegalMoves, countPieces, samePos, turnsUntilDraw } from '../game/engine.js';
import { useTurnClock } from '../hooks/useTurnClock.js';
import { beep, vibrate } from '../game/feedback.js';
import { playSfx, startMusic, stopMusic } from '../game/audio.js';
import { recordResult } from '../game/stats.js';
import MuteButton from './MuteButton.jsx';
import ReactionBar from './ReactionBar.jsx';
import ReactionLayer from './ReactionLayer.jsx';

const WARNING_SI = (secs) => `තව තත්පර ${secs}කින් ඔබ පරාජය වේ!`; // "You will lose in N seconds!"
const DRAW_COUNTDOWN_FROM = 10; // show "draw in N turns" for the last 10 quiet turns

const NAME = { w: 'White', b: 'Black' };
const REASON = {
  'no-pieces': 'all pieces captured',
  'no-moves': 'no legal moves left',
  timeout: 'turn timer ran out',
  resign: 'resignation',
  'draw-agreed': 'draw agreed',
  'no-captures': '25 moves each without a capture',
  disconnect: "opponent didn't reconnect in time",
  left: 'opponent left the game',
};

const fmtSecs = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export default function GameScreen({ ctrl, onLeave, toast }) {
  const { game, myColor, players, mode } = ctrl;
  const isLocal = mode === 'local';
  const controlColor = myColor ?? game.turn;           // Pass & Play: whoever is to move
  const viewAs = myColor ?? 'w';
  const oppColor = viewAs === 'w' ? 'b' : 'w';
  const paused = !!ctrl.pausedAt;                       // an online player is reconnecting
  const offline = mode === 'online' && !ctrl.connected; // MY connection dropped
  const frozen = paused || offline;
  const isMyTurn = !game.winner && !frozen && game.turn === controlColor;
  const aiThinking = mode === 'ai' && !game.winner && game.turn !== myColor;

  const [selected, setSelected] = useState(null);
  const [nudgeSent, setNudgeSent] = useState(false);
  const [showBlowHints, setShowBlowHints] = useState(() => localStorage.getItem('dam.blowHints') !== 'off');
  useEffect(() => localStorage.setItem('dam.blowHints', showBlowHints ? 'on' : 'off'), [showBlowHints]);

  // Multi-jump in progress → the jumping piece stays selected.
  useEffect(() => {
    setSelected(isMyTurn && game.chainFrom ? game.chainFrom : null);
  }, [game.chainFrom, game.turn, isMyTurn]);
  useEffect(() => setNudgeSent(false), [ctrl.turnStartedAt]);
  useEffect(() => { if (isMyTurn && mode !== 'local') beep(740, 80); }, [isMyTurn, mode]);

  // 🎵 Background music: loops while the game is in progress.
  const gameOver = !!game.winner;
  useEffect(() => { if (gameOver) stopMusic(); else startMusic(); }, [gameOver]);
  useEffect(() => () => stopMusic(), []);

  // 📊 Lifetime stats (this device). Each game counted once, via its gameKey.
  useEffect(() => {
    if (!game.winner || isLocal || !myColor) return;
    const result = game.winner === 'draw' ? 'draw' : game.winner === myColor ? 'win' : 'loss';
    recordResult(result, mode, ctrl.gameKey);
  }, [game.winner, isLocal, myColor, mode, ctrl.gameKey]);

  // ⏱ Turn clock — frozen while paused (the server also pauses its own timer).
  // keeps ticking while paused too, so the reconnect countdown updates
  const liveElapsed = useTurnClock(ctrl.turnStartedAt, ctrl.clockOffset, !game.winner);
  const elapsed = paused ? ctrl.pausedAt - ctrl.turnStartedAt : liveElapsed;
  const remaining = Math.max(0, Math.ceil((ctrl.turnLimitMs - elapsed) / 1000));
  const pct = Math.max(0, 100 - (elapsed / ctrl.turnLimitMs) * 100);
  const inWarning = !game.winner && !paused && elapsed >= ctrl.warningAfterMs;
  const showMyWarning = inWarning && isMyTurn;

  // Reconnect countdown (server time → local time).
  const reconnectingColor = paused ? ['w', 'b'].find((c) => players[c] && !players[c].connected) : null;
  const graceLeft = reconnectingColor && players[reconnectingColor].graceEndsAt
    ? players[reconnectingColor].graceEndsAt - (Date.now() + ctrl.clockOffset) : 0;

  // 60s into the turn: warn the player who is to move — once per turn.
  const warnedTurn = useRef(null);
  useEffect(() => {
    if (!showMyWarning || warnedTurn.current === ctrl.turnStartedAt) return;
    warnedTurn.current = ctrl.turnStartedAt;
    const who = isLocal ? `${NAME[game.turn]}: ` : '';
    toast(`⚠️ ${who}${WARNING_SI(30)}`, 'warning');
    vibrate([300, 100, 300]);
    beep(440, 300);
  }, [showMyWarning, ctrl.turnStartedAt, isLocal, game.turn, toast]);

  const moveTargets = useMemo(() => (selected && isMyTurn ? getLegalMoves(game, selected) : []), [game, selected, isMyTurn]);
  const blowTargets = isMyTurn && !game.hasMovedThisTurn && !game.blowUsed ? game.blowCandidates : [];
  const counts = countPieces(game.board);

  // 🔊 Move / capture sounds for EVERY move on the board (mine and the opponent's).
  // Keyed on moveCount + piece total so the server echo of an optimistic move doesn't play twice.
  const totalPieces = counts.w + counts.b;
  const soundRef = useRef({ moveCount: game.moveCount, pieces: totalPieces });
  useEffect(() => {
    const prev = soundRef.current;
    if (game.moveCount > prev.moveCount) playSfx(totalPieces < prev.pieces ? 'capture' : 'move');
    else if (game.moveCount === prev.moveCount && totalPieces < prev.pieces) playSfx('capture'); // a Blow
    soundRef.current = { moveCount: game.moveCount, pieces: totalPieces };
  }, [game.moveCount, totalPieces]);

  function onSquareClick(r, c) {
    if (!isMyTurn) return;
    const pos = [r, c];

    // 1) BLOW: remove an opponent piece that skipped a capture (only before our first move).
    if (blowTargets.some((p) => samePos(p, pos))) {
      const res = ctrl.blow(pos);
      if (res.ok) toast('💨 Blown! Opponent piece removed for missing a capture. Now make your move.');
      return;
    }

    // 2) Touch-move: clicking a highlighted target commits the move instantly. No undo.
    const target = moveTargets.find((m) => samePos(m.to, pos));
    if (target && selected) {
      const res = ctrl.move(selected, pos);
      if (res.ok) setSelected(res.state.chainFrom && !res.turnEnded ? res.state.chainFrom : null);
      return;
    }

    // 3) Select one of our pieces (locked to the jumping piece mid-chain).
    if (game.chainFrom) { toast('You must continue jumping with the same piece!', 'error'); return; }
    const piece = game.board[r][c];
    if (piece?.color === controlColor) {
      const legal = getLegalMoves(game, pos);
      setSelected(legal.length ? pos : null);
      if (!legal.length) toast('That piece has no legal moves.');
    } else {
      setSelected(null);
    }
  }

  function handleLeave() {
    // Leaving a live online / vs-computer game counts as a loss (and resigns online).
    if (!game.winner && !isLocal) {
      if (!window.confirm('Leave the game? It will count as a loss.')) return;
      recordResult('loss', mode, ctrl.gameKey);
    }
    onLeave();
  }

  const renderPlayerBar = (color, bottom = false) => {
    const active = !game.winner && game.turn === color;
    const p = players[color];
    const isMe = !isLocal && color === myColor;
    return (
      <div className={`player-bar ${active ? 'active' : ''} ${bottom ? 'bottom' : ''}`}>
        <div className={`mini-piece ${color === 'w' ? 'white' : 'black'}`} />
        <div className="pname">
          {p?.name ?? NAME[color]}
          {isMe && p?.name !== 'You' && <span className="you"> (you)</span>}
          {p && !p.connected && <span className="offline"> · reconnecting…</span>}
          {active && mode === 'ai' && color !== myColor && <span className="thinking"> · thinking<span className="dots" /></span>}
        </div>
        <div className="pcount">{counts[color]} <small>({counts[color + 'k']}♛)</small></div>
        {active && (
          <div className={`clock ${inWarning ? 'danger' : ''} ${paused ? 'paused' : ''}`}>
            {paused ? '⏸' : `${remaining}s`}
            <div className="clock-bar"><div style={{ width: `${pct}%` }} /></div>
          </div>
        )}
      </div>
    );
  };

  const canNudge = mode === 'online' && !game.winner && !frozen && !isMyTurn && elapsed >= ctrl.nudgeAfterMs && !nudgeSent;
  const incomingDraw = ctrl.drawOfferBy && (isLocal || ctrl.drawOfferBy !== myColor);
  const iVotedRematch = mode === 'online' && myColor && ctrl.rematchVotes.includes(myColor);
  const drawIn = turnsUntilDraw(game);

  let resultTitle = '';
  if (game.winner === 'draw') resultTitle = '🤝 Draw';
  else if (game.winner && isLocal) resultTitle = `🏆 ${NAME[game.winner]} wins!`;
  else if (game.winner) resultTitle = game.winner === myColor ? '🏆 You win!' : '😞 You lose';
  let reasonText = REASON[game.endReason] ?? game.endReason;
  if (game.endReason === 'disconnect' && game.winner !== myColor) reasonText = 'connection lost for too long';

  let status;
  if (game.winner) status = 'Game over';
  else if (offline) status = '📶 Connection lost — reconnecting…';
  else if (paused) status = `📶 Opponent reconnecting… ${fmtSecs(graceLeft)}`;
  else if (showMyWarning) status = `⚠️ ${WARNING_SI(remaining)}`;
  else if (game.chainFrom && isMyTurn) status = '⚡ Keep jumping — multi-capture in progress!';
  else if (isMyTurn && blowTargets.length && showBlowHints) status = '💨 Opponent missed a capture — tap the red piece to BLOW it, or just move.';
  else if (aiThinking) status = '🤖 Computer is thinking…';
  else if (isMyTurn) status = `${isLocal ? NAME[game.turn] + "'s" : 'Your'} turn`;
  else status = `Waiting for ${players[game.turn]?.name ?? NAME[game.turn]}…`;

  return (
    <div className="game">
      <header className="topbar">
        <button className="link" onClick={handleLeave}>← Leave</button>
        <span className="title">
          DAM · {game.board.length}×{game.board.length}
          {isLocal && ' · Local'}
        </span>
        <div className="topbar-right">
          <label className="toggle" title="Highlight pieces you can Blow">
            <input type="checkbox" checked={showBlowHints} onChange={(e) => setShowBlowHints(e.target.checked)} />
            Blow hints
          </label>
          <MuteButton />
        </div>
      </header>

      {renderPlayerBar(oppColor)}

      <div className={`status ${showMyWarning ? 'warning' : ''} ${frozen && !game.winner ? 'reconnecting' : ''}`}>
        {status}
      </div>

      <div className="board-wrap">
        <Board
          game={game}
          viewAs={viewAs}
          selected={selected}
          moveTargets={moveTargets}
          blowTargets={blowTargets}
          showBlowHints={showBlowHints}
          onSquareClick={onSquareClick}
          disabled={frozen}
        />
        {frozen && !game.winner && (
          <div className="board-overlay">
            <div className="spinner small" />
            <div>{offline ? 'Reconnecting to the server…' : 'Opponent reconnecting…'}</div>
            {!offline && <div className="countdown">{fmtSecs(graceLeft)}</div>}
            <small>{offline ? 'Your game is safe — the clock is paused.' : 'The clock is paused. If they don’t return, you win.'}</small>
          </div>
        )}
      </div>

      {renderPlayerBar(viewAs, true)}

      {!game.winner && drawIn <= DRAW_COUNTDOWN_FROM && (
        <div className="draw-meter" title="Draw rule: 25 moves each without a capture">
          ⚖️ No captures — draw in <b>{drawIn}</b> turn{drawIn === 1 ? '' : 's'}
        </div>
      )}

      <ReactionBar onReact={ctrl.react} />

      {incomingDraw && !game.winner && (
        <div className="banner">
          {isLocal ? `${NAME[ctrl.drawOfferBy]} offers a draw.` : 'Opponent offers a draw.'}
          <button onClick={() => ctrl.respondDraw(true)}>Accept</button>
          <button className="secondary" onClick={() => ctrl.respondDraw(false)}>Decline</button>
        </div>
      )}

      {!game.winner && (
        <div className="actions">
          {canNudge && (
            <button className="nudge" onClick={() => { ctrl.nudge(); setNudgeSent(true); }}>
              👉 අදින්න
            </button>
          )}
          <button
            className="secondary"
            disabled={!!ctrl.drawOfferBy || frozen}
            onClick={() => { ctrl.offerDraw(); toast(mode === 'ai' ? 'Draw offered… 🤖' : 'Draw offered.'); }}
          >
            {ctrl.drawOfferBy && !incomingDraw ? 'Draw offered…' : '½ Offer Draw'}
          </button>
          <button
            className="danger"
            onClick={() => window.confirm('Resign this game?') && ctrl.resign()}
          >
            🏳 Resign
          </button>
        </div>
      )}

      {game.winner && (
        <div className="overlay">
          <div className="modal">
            <h2>{resultTitle}</h2>
            <p>by {reasonText}</p>
            <button onClick={ctrl.rematch} disabled={iVotedRematch}>
              {iVotedRematch ? 'Waiting for opponent…' : '🔁 Play Again'}
            </button>
            {mode === 'online' && !iVotedRematch && ctrl.rematchVotes.length > 0 && (
              <p className="hint">Opponent wants a rematch!</p>
            )}
            <button className="secondary" onClick={onLeave}>Back to menu</button>
            <ReactionBar onReact={ctrl.react} compact />
          </div>
        </div>
      )}

      <ReactionLayer items={ctrl.reactions} viewAs={viewAs} mode={mode} myColor={myColor} />
    </div>
  );
}
