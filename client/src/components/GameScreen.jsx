import React, { useEffect, useMemo, useRef, useState } from 'react';
import Board from './Board.jsx';
import { getLegalMoves, countPieces, samePos } from '../game/engine.js';
import { useTurnClock } from '../hooks/useTurnClock.js';
import { beep, vibrate } from '../game/feedback.js';
import { playSfx, startMusic, stopMusic } from '../game/audio.js';
import MuteButton from './MuteButton.jsx';
import ReactionBar from './ReactionBar.jsx';
import ReactionLayer from './ReactionLayer.jsx';

const WARNING_SI = (secs) => `තව තත්පර ${secs}කින් ඔබ පරාජය වේ!`; // "You will lose in N seconds!"

const NAME = { w: 'White', b: 'Black' };
const REASON = {
  'no-pieces': 'all pieces captured',
  'no-moves': 'no legal moves left',
  timeout: 'turn timer ran out',
  resign: 'resignation',
  'draw-agreed': 'draw agreed',
  disconnect: 'opponent disconnected',
};

export default function GameScreen({ ctrl, onLeave, toast }) {
  const { game, myColor, players, mode } = ctrl;
  const controlColor = myColor ?? game.turn;           // local: whoever is to move
  const viewAs = myColor ?? 'w';
  const isMyTurn = !game.winner && game.turn === controlColor;
  const oppColor = viewAs === 'w' ? 'b' : 'w';

  const [selected, setSelected] = useState(null);
  const [nudgeSent, setNudgeSent] = useState(false);
  const [showBlowHints, setShowBlowHints] = useState(() => localStorage.getItem('dam.blowHints') !== 'off');
  useEffect(() => localStorage.setItem('dam.blowHints', showBlowHints ? 'on' : 'off'), [showBlowHints]);

  // Multi-jump in progress → the jumping piece stays selected.
  useEffect(() => {
    setSelected(isMyTurn && game.chainFrom ? game.chainFrom : null);
  }, [game.chainFrom, game.turn, isMyTurn]);
  useEffect(() => setNudgeSent(false), [ctrl.turnStartedAt]);
  useEffect(() => { if (isMyTurn && mode === 'online') beep(740, 80); }, [isMyTurn, mode]);

  // 🎵 Background music: loops while the game is in progress.
  const gameOver = !!game.winner;
  useEffect(() => { if (gameOver) stopMusic(); else startMusic(); }, [gameOver]);
  useEffect(() => () => stopMusic(), []);

  const elapsed = useTurnClock(ctrl.turnStartedAt, ctrl.clockOffset, !game.winner);
  const remaining = Math.max(0, Math.ceil((ctrl.turnLimitMs - elapsed) / 1000));
  const pct = Math.max(0, 100 - (elapsed / ctrl.turnLimitMs) * 100);
  const inWarning = !game.winner && elapsed >= ctrl.warningAfterMs;
  const showMyWarning = inWarning && isMyTurn;

  // 60s into the turn: warn the player who is to move — once per turn.
  const warnedTurn = useRef(null);
  useEffect(() => {
    if (!showMyWarning || warnedTurn.current === ctrl.turnStartedAt) return;
    warnedTurn.current = ctrl.turnStartedAt;
    const who = mode === 'local' ? `${NAME[game.turn]}: ` : '';
    toast(`⚠️ ${who}${WARNING_SI(30)}`, 'warning');
    vibrate([300, 100, 300]);
    beep(440, 300);
  }, [showMyWarning, ctrl.turnStartedAt, mode, game.turn, toast]);

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
      if (res.ok) {
        setSelected(res.state.chainFrom && !res.turnEnded ? res.state.chainFrom : null);
      }
      return;
    }

    // 3) Select one of our pieces (locked to the jumping piece mid-chain).
    if (game.chainFrom) { toast('You must continue jumping with the same piece!', 'error'); return; }
    const piece = game.board[r][c];
    if (piece?.color === controlColor) {
      setSelected(getLegalMoves(game, pos).length ? pos : null);
      if (!getLegalMoves(game, pos).length) toast('That piece has no legal moves.');
    } else {
      setSelected(null);
    }
  }

  const renderPlayerBar = (color, bottom = false) => {
    const active = !game.winner && game.turn === color;
    const p = players[color];
    return (
      <div className={`player-bar ${active ? 'active' : ''} ${bottom ? 'bottom' : ''}`}>
        <div className={`mini-piece ${color === 'w' ? 'white' : 'black'}`} />
        <div className="pname">
          {p?.name ?? NAME[color]}
          {mode === 'online' && color === myColor && <span className="you"> (you)</span>}
          {p && !p.connected && <span className="offline"> · offline</span>}
        </div>
        <div className="pcount">{counts[color]} <small>({counts[color + 'k']}♛)</small></div>
        {active && (
          <div className={`clock ${inWarning ? 'danger' : ''}`}>
            {remaining}s
            <div className="clock-bar"><div style={{ width: `${pct}%` }} /></div>
          </div>
        )}
      </div>
    );
  };

  const canNudge = mode === 'online' && !game.winner && !isMyTurn && elapsed >= ctrl.nudgeAfterMs && !nudgeSent;
  const incomingDraw = ctrl.drawOfferBy && (mode === 'local' || ctrl.drawOfferBy !== myColor);
  const iVotedRematch = myColor && ctrl.rematchVotes.includes(myColor);

  let resultTitle = '';
  if (game.winner === 'draw') resultTitle = '🤝 Draw';
  else if (game.winner && mode === 'local') resultTitle = `🏆 ${NAME[game.winner]} wins!`;
  else if (game.winner) resultTitle = game.winner === myColor ? '🏆 You win!' : '😞 You lose';

  return (
    <div className="game">
      <header className="topbar">
        <button className="link" onClick={onLeave}>← Leave</button>
        <span className="title">DAM · {game.board.length}×{game.board.length}{mode === 'local' && ' · Local'}</span>
        <div className="topbar-right">
          <label className="toggle" title="Highlight pieces you can Blow">
            <input type="checkbox" checked={showBlowHints} onChange={(e) => setShowBlowHints(e.target.checked)} />
            Blow hints
          </label>
          <MuteButton />
        </div>
      </header>

      {renderPlayerBar(oppColor)}

      <div className={`status ${showMyWarning ? 'warning' : ''}`}>
        {game.winner ? 'Game over' :
          showMyWarning ? `⚠️ ${WARNING_SI(remaining)}` :
          game.chainFrom && isMyTurn ? '⚡ Keep jumping — multi-capture in progress!' :
          isMyTurn ? (blowTargets.length && showBlowHints ? '💨 Opponent missed a capture — tap the red piece to BLOW it, or just move.' : `${mode === 'local' ? NAME[game.turn] + "'s" : 'Your'} turn`) :
          `Waiting for ${players[game.turn]?.name ?? NAME[game.turn]}…`}
      </div>

      <Board
        game={game}
        viewAs={viewAs}
        selected={selected}
        moveTargets={moveTargets}
        blowTargets={blowTargets}
        showBlowHints={showBlowHints}
        onSquareClick={onSquareClick}
      />

      {renderPlayerBar(viewAs, true)}

      <ReactionBar onReact={ctrl.react} />

      {incomingDraw && !game.winner && (
        <div className="banner">
          {mode === 'local' ? `${NAME[ctrl.drawOfferBy]} offers a draw.` : 'Opponent offers a draw.'}
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
            disabled={!!ctrl.drawOfferBy}
            onClick={() => { ctrl.offerDraw(); toast('Draw offered.'); }}
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
            <p>by {REASON[game.endReason] ?? game.endReason}</p>
            <button onClick={ctrl.rematch} disabled={iVotedRematch}>
              {iVotedRematch ? 'Waiting for opponent…' : '🔁 Play Again'}
            </button>
            {mode === 'online' && !iVotedRematch && ctrl.rematchVotes.length > 0 && (
              <p className="hint">Opponent wants a rematch!</p>
            )}
            <button className="secondary" onClick={onLeave}>Back to lobby</button>
            <ReactionBar onReact={ctrl.react} compact />
          </div>
        </div>
      )}

      <ReactionLayer items={ctrl.reactions} viewAs={viewAs} mode={mode} myColor={myColor} />
    </div>
  );
}
