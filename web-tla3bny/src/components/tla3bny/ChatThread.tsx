'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { tChatThread, tSendMessage, type TChatMessage } from '@/lib/tla3bnyApi';
import { Card, PrimaryButton, ErrorNote, useTT } from './kit';

/** One conversation between a team and the competition's organizers. Polls for new
 *  messages; fetching marks it read for the caller's side. `mySide` aligns the
 *  viewer's own messages to the end. */
export default function ChatThread({ token, compId, teamId, mySide, title, onRead }: {
  token: string; compId: number; teamId: number;
  mySide: 'academy' | 'organizer'; title?: string; onRead?: () => void;
}) {
  const tt = useTT();
  const [messages, setMessages] = useState<TChatMessage[]>([]);
  const [header, setHeader] = useState(title ?? '');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const t = await tChatThread(token, compId, teamId);
      setMessages(t.messages);
      if (!title && t.team_name) setHeader(t.team_name);
      onRead?.();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [token, compId, teamId, title, onRead]);

  useEffect(() => { load(); const iv = setInterval(load, 8000); return () => clearInterval(iv); }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true); setErr(null);
    try { await tSendMessage(token, compId, teamId, text); setBody(''); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <Card className="p-0 overflow-hidden flex flex-col h-[60vh]">
      {header && <div className="px-3 py-2 border-b border-bdr/60 bg-cardBg2/40 font-black text-text text-sm shrink-0">{header}</div>}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-hint text-xs text-center py-6">{tt('لا رسائل بعد — ابدأ المحادثة', 'No messages yet — start the conversation')}</p>
        )}
        {messages.map(m => {
          const mine = m.sender_side === mySide;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${mine ? 'bg-aqua/15 border border-aqua/30' : 'bg-cardBg2 border border-bdr'}`}>
                {!mine && m.sender_name && <div className="text-[10px] font-bold text-teal mb-0.5">{m.sender_name}</div>}
                <div className="text-sm text-text whitespace-pre-wrap break-words">{m.body}</div>
                {m.created_at && (
                  <div className="text-[9px] text-hint mt-0.5 text-end">
                    {new Date(m.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="border-t border-bdr/60 p-2 shrink-0 space-y-1">
        <ErrorNote>{err}</ErrorNote>
        <div className="flex items-end gap-2">
          <textarea value={body} onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            rows={1} placeholder={tt('اكتب رسالة…', 'Type a message…')}
            className="flex-1 bg-darkBg border border-bdr rounded-xl px-3 py-2 text-text text-sm outline-none focus:border-aqua resize-none" />
          <PrimaryButton onClick={send} disabled={busy || !body.trim()} className="text-sm shrink-0">{tt('إرسال', 'Send')}</PrimaryButton>
        </div>
      </div>
    </Card>
  );
}
