/** Ask the computer for its turn. Uses a Web Worker; falls back to the main thread. */
import { chooseAiTurn, aiAcceptsDraw } from '../../../shared/ai.js';

export { aiAcceptsDraw };
export const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

let worker;      // undefined = not tried yet, null = unavailable
let seq = 0;
const pending = new Map();

function getWorker() {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./aiWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error)); else p.resolve(data.result);
    };
    worker.onerror = () => {
      worker = null;
      pending.forEach((p) => p.reject(new Error('AI worker crashed')));
      pending.clear();
    };
  } catch {
    worker = null;
  }
  return worker;
}

export async function requestAiTurn(state, difficulty) {
  const w = getWorker();
  if (w) {
    try {
      return await new Promise((resolve, reject) => {
        const id = ++seq;
        pending.set(id, { resolve, reject });
        w.postMessage({ id, state, difficulty });
      });
    } catch { /* fall through to main thread */ }
  }
  return chooseAiTurn(state, difficulty);
}
