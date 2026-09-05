'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  tOrgConversations, tCompTeams,
  type TCompetition, type TConversation, type TCompTeam,
} from '@/lib/tla3bnyApi';
import { useTla3bnyAuth } from '@/context/Tla3bnyAuthContext';
import ChatThread from './ChatThread';
import { Card, Field, inputCls, EmptyState, useTT, useName } from './kit';

/** Organizer inbox: team conversations for this competition, plus a picker to
 *  message any team first. Only chat-enabled organizers may use it. */
export default function MessagesManager({ token, comp }: { token: string; comp: TCompetition }) {
  const tt = useTT();
  const nm = useName();
  const { user, isSuperAdmin } = useTla3bnyAuth();
  const myAdmin = (comp.admins ?? []).find(a => a.user_id === user?.id);
  const canChat = isSuperAdmin || !!(myAdmin && (myAdmin.is_owner || myAdmin.can_chat));

  const [convs, setConvs] = useState<TConversation[]>([]);
  const [teams, setTeams] = useState<TCompTeam[]>([]);
  const [openTeam, setOpenTeam] = useState<number | ''>('');

  const load = useCallback(() => {
    tOrgConversations(token, comp.id).then(setConvs).catch(() => setConvs([]));
  }, [token, comp.id]);
  useEffect(() => {
    if (!canChat) return;
    load();
    tCompTeams(comp.id, undefined, false, token).then(setTeams).catch(() => setTeams([]));
  }, [canChat, load, comp.id, token]);

  if (!canChat) {
    return <EmptyState icon="🔒" text={tt('ليس لديك صلاحية المحادثة — تُمنح من تبويب المنظمين.', 'You don\'t have chat permission — it\'s granted in the Organizers tab.')} />;
  }

  return (
    <div className="space-y-4">
      <Field label={tt('مراسلة فريق', 'Message a team')}>
        <select value={openTeam} onChange={e => setOpenTeam(Number(e.target.value))} className={inputCls}>
          <option value="">{tt('اختر فريقًا لبدء/فتح محادثة…', 'Pick a team to open a chat…')}</option>
          {teams.map(t => <option key={t.team_id} value={t.team_id}>{nm(t.team_name, t.team_name_en)}</option>)}
        </select>
      </Field>

      {openTeam ? (
        <ChatThread token={token} compId={comp.id} teamId={Number(openTeam)} mySide="organizer" onRead={load} />
      ) : convs.length === 0 ? (
        <EmptyState icon="💬" text={tt('لا محادثات بعد', 'No conversations yet')} />
      ) : (
        <div className="space-y-2">
          {convs.map(c => (
            <button key={c.id} onClick={() => setOpenTeam(c.team_id)}
              className="w-full text-start flex items-center gap-3 bg-cardBg border border-bdr rounded-xl px-3 py-2.5 hover:border-aqua/40 transition-colors">
              <span className="text-lg shrink-0">💬</span>
              <span className="flex-1 min-w-0">
                <span className="block font-bold text-text text-sm truncate">{c.team_name}</span>
                {c.last_message && <span className="block text-[11px] text-hint truncate">{c.last_message}</span>}
              </span>
              {c.unread > 0 && (
                <span className="text-[10px] font-black text-on-accent bg-loss rounded-full px-2 py-0.5 shrink-0">{c.unread}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
