import React, { memo } from 'react';
import { isDark, samePos } from '../game/engine.js';

const has = (list, r, c) => list.some((p) => samePos(p, [r, c]));

/**
 * Wooden board (12x12 or 10x10 — size comes from game.board). Rendered from `viewAs`'s perspective (own pieces at the bottom).
 * Purely presentational — all interaction is delegated to onSquareClick(r, c).
 */
function Board({ game, viewAs = 'w', selected, moveTargets, blowTargets, showBlowHints, onSquareClick }) {
  const flip = viewAs === 'b';
  const size = game.board.length;
  const rows = [...Array(size).keys()];
  const order = flip ? [...rows].reverse() : rows;
  const captureTargets = moveTargets.filter((m) => m.captured).map((m) => m.to);
  const quietTargets = moveTargets.filter((m) => !m.captured).map((m) => m.to);
  const last = game.lastMove;

  return (
    <div className="board" role="grid" aria-label={`Dam board ${size}x${size}`} style={{ '--n': size }}>
      {order.map((r) =>
        order.map((c) => {
          const dark = isDark(r, c);
          const piece = game.board[r][c];
          const cls = ['sq', dark ? 'dark' : 'light'];
          if (last && (samePos(last.from, [r, c]) || samePos(last.to, [r, c]))) cls.push('last');
          if (selected && samePos(selected, [r, c])) cls.push('selected');
          if (has(quietTargets, r, c)) cls.push('target');
          if (has(captureTargets, r, c)) cls.push('target capture');
          const blowable = has(blowTargets, r, c);
          if (blowable) cls.push(showBlowHints ? 'blowable hint' : 'blowable');
          if (game.chainFrom && samePos(game.chainFrom, [r, c])) cls.push('chain');
          return (
            <div
              key={`${r}-${c}`}
              className={cls.join(' ')}
              onClick={dark ? () => onSquareClick(r, c) : undefined}
              role="gridcell"
            >
              {piece && (
                <div className={`piece ${piece.color === 'w' ? 'white' : 'black'} ${piece.king ? 'king' : ''}`}>
                  {piece.king && <span className="crown">♛</span>}
                </div>
              )}
              {blowable && showBlowHints && <span className="blow-tag">BLOW</span>}
            </div>
          );
        })
      )}
    </div>
  );
}

export default memo(Board);
