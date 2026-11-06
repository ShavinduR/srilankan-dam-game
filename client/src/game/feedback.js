// Audio/haptic helpers. Sounds go through the global audio manager (respects Mute).
export { beep } from './audio.js';
export const vibrate = (pattern) => navigator.vibrate?.(pattern);
