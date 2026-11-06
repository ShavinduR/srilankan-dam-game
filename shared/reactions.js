/** Quick-chat reactions. The server only relays ids from this list. */
export const REACTIONS = [
  { id: 'hoo', emoji: '😂', text: 'හූ.. හූ..' },
  { id: 'baya', emoji: '🤔', text: 'ඇයි බයද?' },
  { id: 'ayyo', emoji: '🤦‍♂️', text: 'අයියෝ' },
  { id: 'elakiri', emoji: '😎', text: 'එළකිරි' },
];
export const REACTION_COOLDOWN_MS = 1500;
export const getReaction = (id) => REACTIONS.find((r) => r.id === id) || null;
