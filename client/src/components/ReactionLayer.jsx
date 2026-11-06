import React from 'react';
import { getReaction } from '../game/reactions.js';

/**
 * Floating reaction bubbles. The sender's bubble rises from their own side of the
 * board: mine from the bottom, the opponent's from the top.
 */
export default function ReactionLayer({ items, viewAs, mode, myColor }) {
  if (!items?.length) return null;
  return (
    <div className="reaction-layer" aria-live="polite">
      {items.map((item) => {
        const r = getReaction(item.id);
        if (!r) return null;
        const mine = item.by === viewAs;
        const who = mode !== 'local' && item.by === myColor ? 'You' : item.name;
        return (
          <div key={item.key} className={`reaction-float ${mine ? 'from-bottom' : 'from-top'}`}>
            <span className="rf-emoji">{r.emoji}</span>
            <span className="rf-body">
              <span className="rf-name">{who}</span>
              <span className="rf-text">{r.text}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
