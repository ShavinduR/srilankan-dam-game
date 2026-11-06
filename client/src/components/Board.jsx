import React, { memo, useLayoutEffect, useRef, useState } from 'react';
import { isDark, samePos } from '../game/engine.js';

const has = (list, r, c) => list.some((p) => samePos(p, [r, c]));
const GHOST_MS = 380;      // captured piece fade-out
const PROMO_MS = 1200;     // golden flash when a piece becomes a Dam
let ghostSeq = 0;

/**
 * Tracks pieces by their stable id between renders to produce:
 *   - ghosts: pieces that just disappeared (captured / blown) → fade out where they stood
 *   - promoted: ids that just became kings → golden flash
 */
function usePieceEffects(board) {
  const prev = useRef(null);
  const [ghosts, setGhosts] = useState([]);
  const [promoted, setPromoted] = useState(() => new Set());
  const timers = useRef([]);

  useLayoutEffect(() => () => timers.current.forEach(clearTimeout), []);

  useLayoutEffect(() => {
    const cur = new Map();
    board.forEach((row, r) => row.forEach((p, c) => { if (p?.id != null) cur.set(p.id, { p, r, c }); }));
    const before = prev.current;
    prev.current = cur;
    if (!before) return;

    const gone = [...before.values()].filter((x) => !cur.has(x.p.id));
    // More than a handful vanishing at once = a brand-new game, not captures.
    if (gone.length && gone.length <= 6) {
      const items = gone.map((x) => ({ ...x, key: ++ghostSeq }));
      setGhosts((g) => [...g, ...items]);
      timers.current.push(setTimeout(() => {
        setGhosts((g) => g.filter((x) => !items.includes(x)));
      }, GHOST_MS));
    }
    const promos = [...cur.values()].filter((x) => x.p.king && before.get(x.p.id) && !before.get(x.p.id).p.king);
    if (promos.length) {
      setPromoted((s) => new Set([...s, ...promos.map((x) => x.p.id)]));
      timers.current.push(setTimeout(() => {
        setPromoted((s) => { const n = new Set(s); promos.forEach((x) => n.delete(x.p.id)); return n; });
      }, PROMO_MS));
    }
  }, [board]);

  return { ghosts, promoted };
}

/**
 * Wooden board (12x12 or 10x10 — size comes from game.board), drawn from `viewAs`'s
 * perspective (own pieces at the bottom).
 *
 * Two layers:
 *   1. squares (grid) — colours, highlights, move dots, click targets
 *   2. pieces (absolute) — keyed by piece id and positioned with transform, so a move
 *      makes the piece GLIDE (CSS transition) instead of teleporting
 */
function Board({ game, viewAs = 'w', selected, moveTargets, blowTargets, showBlowHints, onSquareClick, disabled }) {
  const n = game.board.length;
  const flip = viewAs === 'b';
  const view = (r, c) => (flip ? [n - 1 - r, n - 1 - c] : [r, c]);
  const captureTargets = moveTargets.filter((m) => m.captured).map((m) => m.to);
  const quietTargets = moveTargets.filter((m) => !m.captured).map((m) => m.to);
  const last = game.lastMove;
  const { ghosts, promoted } = usePieceEffects(game.board);

  const squares = [];
  for (let vr = 0; vr < n; vr++) {
    for (let vc = 0; vc < n; vc++) {
      const [r, c] = view(vr, vc);
      const dark = isDark(r, c);
      const cls = ['sq', dark ? 'dark' : 'light'];
      if (last && (samePos(last.from, [r, c]) || samePos(last.to, [r, c]))) cls.push('last');
      if (selected && samePos(selected, [r, c])) cls.push('selected');
      if (has(quietTargets, r, c)) cls.push('target');
      if (has(captureTargets, r, c)) cls.push('target capture');
      squares.push(
        <div
          key={`${r}-${c}`}
          className={cls.join(' ')}
          onClick={dark && !disabled ? () => onSquareClick(r, c) : undefined}
          role="gridcell"
        />,
      );
    }
  }

  const pieces = [];
  game.board.forEach((row, r) => row.forEach((p, c) => {
    if (!p) return;
    const [vr, vc] = view(r, c);
    const blowable = has(blowTargets, r, c);
    const cls = ['piece', p.color === 'w' ? 'white' : 'black'];
    if (p.king) cls.push('king');
    if (promoted.has(p.id)) cls.push('promoted');
    if (selected && samePos(selected, [r, c])) cls.push('lifted');
    if (game.chainFrom && samePos(game.chainFrom, [r, c])) cls.push('chain');
    if (blowable && showBlowHints) cls.push('blow-hint');
    pieces.push({ id: p.id ?? r * n + c, el: (
      <div key={p.id ?? `${r}-${c}`} className="slot" style={{ transform: `translate(${vc * 100}%, ${vr * 100}%)` }}>
        <div className={cls.join(' ')}>{p.king && <span className="crown">♛</span>}</div>
        {blowable && showBlowHints && <span className="blow-tag">BLOW</span>}
      </div>
    ) });
  }));
  // Stable DOM order (by id): moving a DOM node would cancel its CSS transition.
  pieces.sort((a, b) => a.id - b.id);

  return (
    <div className={`board ${disabled ? 'is-disabled' : ''}`} role="grid" aria-label={`Dam board ${n}x${n}`} style={{ '--n': n }}>
      {squares}
      <div className="piece-layer" aria-hidden="true">
        {ghosts.map((g) => {
          const [vr, vc] = view(g.r, g.c);
          return (
            <div key={`ghost-${g.key}`} className="slot ghost" style={{ transform: `translate(${vc * 100}%, ${vr * 100}%)` }}>
              <div className={`piece ${g.p.color === 'w' ? 'white' : 'black'} ${g.p.king ? 'king' : ''}`}>
                {g.p.king && <span className="crown">♛</span>}
              </div>
            </div>
          );
        })}
        {pieces.map((x) => x.el)}
      </div>
    </div>
  );
}

export default memo(Board);
