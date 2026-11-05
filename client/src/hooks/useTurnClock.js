import { useEffect, useState } from 'react';

/** Re-renders ~4x/sec and returns ms elapsed in the current turn. */
export function useTurnClock(turnStartedAt, clockOffset = 0, running = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);
  return Math.max(0, now + clockOffset - turnStartedAt);
}
