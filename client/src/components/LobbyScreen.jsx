import React, { useState } from 'react';
import MuteButton from './MuteButton.jsx';

export const inviteLink = (code) => `${window.location.origin}/?room=${encodeURIComponent(code)}`;

export function inviteMessage(code, size, name) {
  return [
    `🎲 ${name ? `${name} invites you to` : 'Join me for'} a game of Dam (දාම්)! ${size}×${size} board.`,
    `දාම් ගහමු! 😎`,
    `👉 ${inviteLink(code)}`,
    `Room code: ${code}`,
  ].join('\n');
}

/** Private room: show the code and share it (WhatsApp / native share / copy). */
export default function LobbyScreen({ lobby, name, connected, onCancel, toast }) {
  const [copied, setCopied] = useState(false);
  if (!lobby) {
    return (
      <div className="landing waiting">
        <div className="spinner" />
        <h2>Creating your room…</h2>
        {!connected && <p className="subtitle">Connecting to the game server… (can take up to a minute)</p>}
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    );
  }
  const text = inviteMessage(lobby.code, lobby.size, name);
  const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(lobby.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast?.(`Copy this link: ${inviteLink(lobby.code)}`);
    }
  };
  const nativeShare = async () => {
    try { await navigator.share({ title: 'Dam — Sri Lankan Draughts', text, url: inviteLink(lobby.code) }); } catch { /* cancelled */ }
  };

  return (
    <div className="landing waiting lobby">
      <MuteButton className="corner" />
      <h2>Your room is ready</h2>
      <p className="subtitle">Send this to a friend. The game starts as soon as they join.</p>
      <div className="room-code" aria-label="Room code">{lobby.code}</div>
      <p className="size-badge">{lobby.size}×{lobby.size} board · you play White</p>

      <a className="btn whatsapp" href={waUrl} target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3c-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.6-.3Z" /></svg>
        Share via WhatsApp
      </a>
      <div className="share-row">
        {typeof navigator !== 'undefined' && navigator.share && (
          <button className="secondary" onClick={nativeShare}>📤 Share…</button>
        )}
        <button className="secondary" onClick={copy}>{copied ? '✅ Link copied' : '🔗 Copy link'}</button>
      </div>

      <div className="lobby-wait"><div className="spinner small" /> Waiting for your friend to join…</div>
      {!connected && <p className="subtitle">Reconnecting… your room code stays valid.</p>}
      <button className="link" onClick={onCancel}>Cancel room</button>
    </div>
  );
}
