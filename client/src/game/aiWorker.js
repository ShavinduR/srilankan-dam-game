// Runs the computer's thinking off the main thread so animations stay smooth.
import { chooseAiTurn } from '../../../shared/ai.js';

self.onmessage = (e) => {
  const { id, state, difficulty } = e.data;
  try {
    self.postMessage({ id, result: chooseAiTurn(state, difficulty) });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
