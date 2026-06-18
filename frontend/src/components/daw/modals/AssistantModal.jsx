import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '../Modal';
import { MagentaSpinner } from '../MagentaSpinner';
import { TID } from '@/constants/testIds';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * AssistantModal — chat panel that sends user requests to /api/ai/assistant
 * and receives a structured action list. The parent `onActions(actions)`
 * callback is invoked to apply them on the DAW state.
 */
export function AssistantModal({ context, onActions, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'system', text: 'Hi! I\u2019m RIBA AI. Tell me what to build \u2014 "add an audio track and reverb on vocals" \u2014 and I\u2019ll do it.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    setMessages((prev) => [...prev, { role: 'user', text: message }]);
    setInput('');
    setLoading(true);
    try {
      const resp = await fetch(`${API}/ai/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, session_id: sessionId, context }),
      });
      const data = await resp.json();
      if (data.session_id) setSessionId(data.session_id);
      const acts = Array.isArray(data.actions) ? data.actions : [];
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.speech || (acts.length ? `\u2705 ${acts.length} action(s) ready.` : '\u26A0\uFE0F No actions parsed.'),
          actions: acts,
          fallback: !!data.fallback,
        },
      ]);
      if (acts.length && typeof onActions === 'function') {
        onActions(acts);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="RIBA AI Assistant" onClose={onClose} width={620}>
      <div
        ref={scrollRef}
        style={{
          height: 360, overflowY: 'auto',
          background: '#09090B', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            data-testid={`chat-msg-${m.role}`}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background: m.role === 'user'
                ? 'linear-gradient(135deg, rgba(217,70,239,0.25), rgba(99,102,241,0.25))'
                : m.role === 'system' ? '#1F1F23'
                : 'rgba(217,70,239,0.08)',
              border: m.role === 'user' ? '1px solid rgba(217,70,239,0.4)' : '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10, padding: '8px 12px', fontSize: 12.5, color: '#E4E4E7',
            }}
          >
            <div>{m.text}</div>
            {m.actions && m.actions.length > 0 && (
              <details style={{ marginTop: 6 }}>
                <summary style={{
                  cursor: 'pointer', fontSize: 10, color: '#D946EF',
                  fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.05em',
                }} className="font-mono-r">
                  {m.actions.length} action{m.actions.length > 1 ? 's' : ''} {m.fallback ? '(fallback)' : '(via Claude)'}
                </summary>
                <pre style={{
                  fontSize: 10, color: '#71717A', background: '#0B0B0E',
                  padding: 6, borderRadius: 4, marginTop: 4, maxHeight: 120, overflow: 'auto',
                }}>{JSON.stringify(m.actions, null, 2)}</pre>
              </details>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', padding: '6px 12px' }}>
            <MagentaSpinner size={22} label="thinking…" testId="assistant-spinner" />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input
          data-testid="assistant-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="e.g. add an audio track, reverb on vocals, 130 bpm"
          disabled={loading}
          style={{
            flex: 1, background: '#09090B', color: '#FAFAFA',
            border: '1px solid rgba(217,70,239,0.25)', borderRadius: 8,
            padding: '10px 12px', fontSize: 13, fontFamily: 'Manrope, sans-serif',
            outline: 'none',
          }}
        />
        <button
          className="riba-btn"
          data-testid="assistant-send"
          onClick={() => send()}
          disabled={loading || !input.trim()}
          style={{
            background: 'linear-gradient(135deg, #D946EF, #6366F1)',
            color: '#fff', border: 'none', minWidth: 70, fontWeight: 700,
            opacity: (loading || !input.trim()) ? 0.5 : 1,
          }}
        >Send</button>
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          'Add a MIDI track and play',
          'Set tempo to 95 bpm',
          'Toggle metronome and start recording',
          'Quantize to Bikutsi 4/4',
          'Open the mixer',
        ].map((p) => (
          <button
            key={p}
            className="riba-btn"
            data-testid={`assistant-suggest-${p.slice(0, 8).replace(/\s/g, '-')}`}
            onClick={() => send(p)}
            disabled={loading}
            style={{
              fontSize: 10, padding: '3px 8px',
              background: 'rgba(217,70,239,0.08)',
              border: '1px solid rgba(217,70,239,0.25)',
              color: '#D946EF',
            }}
          >{p}</button>
        ))}
      </div>
    </Modal>
  );
}
