import { useCallback, useEffect, useRef, useState } from 'react';

const SHOW_MS = 2800;
let uid = 0;

/** Keeps the list of floating reactions on screen; each one disappears after ~3s. */
export function useReactionFeed() {
  const [items, setItems] = useState([]);
  const timers = useRef(new Set());
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const push = useCallback((reaction) => {
    const item = { ...reaction, key: ++uid };
    setItems((list) => [...list.slice(-4), item]); // keep at most 5 on screen
    const t = setTimeout(() => {
      timers.current.delete(t);
      setItems((list) => list.filter((i) => i.key !== item.key));
    }, SHOW_MS);
    timers.current.add(t);
  }, []);

  return [items, push];
}
