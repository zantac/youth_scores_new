'use client';
import { useState, useEffect, useCallback } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { apiListUsers, apiCreateUser, apiUpdateUser, apiDeleteUser, ROLE_LABEL, type AdminUser } from '@/lib/adminApi';

export default function UsersPage() {
  return (
    <AdminShell title="المستخدمون" requireSuperadmin>
      <UsersManager />
    </AdminShell>
  );
}

const ROLES = ['clerk', 'editor', 'superadmin'] as const;
const inputCls = 'w-full bg-darkBg border border-bdr rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-aqua';

function UsersManager() {
  const { token, user: me } = useAdminAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    apiListUsers(token)
      .then(setUsers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const patch = async (id: number, body: Record<string, unknown>) => {
    if (!token) return;
    try { await apiUpdateUser(token, id, body); load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'خطأ'); }
  };

  const remove = async (id: number) => {
    if (!token) return;
    try { await apiDeleteUser(token, id); setConfirmDel(null); load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'خطأ'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-hint text-xs">{users.length} مستخدم</p>
        <button onClick={() => setShowForm(s => !s)}
          className="bg-aqua text-on-accent font-bold text-xs px-4 py-2 rounded-xl">
          {showForm ? '✕ إلغاء' : '+ مستخدم جديد'}
        </button>
      </div>

      {showForm && <CreateForm token={token!} onDone={() => { setShowForm(false); load(); }} />}

      {error && <p className="text-loss text-xs bg-loss/10 border border-loss/30 rounded-lg px-3 py-2">{error}</p>}
      {loading && <p className="text-hint text-sm text-center py-6">جارٍ التحميل…</p>}

      <div className="space-y-2">
        {users.map(u => (
          <div key={u.id} className="bg-gradient-to-b from-cardBg to-cardBg2 border border-bdr rounded-xl p-3.5">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl grid place-items-center font-black text-sm ${u.is_active ? 'bg-aqua/15 text-aqua' : 'bg-bdr/40 text-hint'}`}>
                {(u.full_name || u.username).slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-text font-bold text-sm truncate">{u.full_name || u.username}</p>
                <p className="text-hint text-[11px]">@{u.username}{!u.is_active && ' · معطّل'}</p>
              </div>
              <span className="text-gold text-[11px] font-bold bg-gold/10 border border-gold/30 rounded-lg px-2.5 py-1">
                {ROLE_LABEL[u.role]?.ar ?? u.role}
              </span>
            </div>

            {me?.id !== u.id && (
              <div className="mt-3 pt-3 border-t border-bdr/50">
                {editId === u.id ? (
                  <EditUserForm token={token!} user={u}
                    onDone={() => { setEditId(null); load(); }}
                    onCancel={() => setEditId(null)} />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <select value={u.role} onChange={e => patch(u.id, { role: e.target.value })}
                      className="bg-darkBg border border-bdr rounded-lg text-xs text-text px-2 py-1.5 outline-none focus:border-aqua">
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r].ar}</option>)}
                    </select>
                    <button onClick={() => patch(u.id, { is_active: !u.is_active })}
                      className={`text-xs font-bold rounded-lg px-3 py-1.5 border ${u.is_active ? 'text-loss border-loss/40 bg-loss/10' : 'text-win border-win/40 bg-win/10'}`}>
                      {u.is_active ? 'تعطيل' : 'تفعيل'}
                    </button>
                    <button onClick={() => { const p = prompt('كلمة مرور جديدة (8 أحرف على الأقل):'); if (p) patch(u.id, { password: p }); }}
                      className="text-xs font-bold text-teal border border-bdr rounded-lg px-3 py-1.5 hover:border-aqua/40">
                      إعادة تعيين كلمة المرور
                    </button>
                    <button onClick={() => { setEditId(u.id); setConfirmDel(null); }}
                      className="text-xs font-bold text-aqua border border-aqua/40 bg-aqua/10 rounded-lg px-3 py-1.5 hover:bg-aqua/20">
                      ✎ تعديل البيانات
                    </button>
                    {confirmDel === u.id ? (
                      <span className="flex items-center gap-2">
                        <span className="text-loss text-xs font-bold">تأكيد الحذف؟</span>
                        <button onClick={() => setConfirmDel(null)} className="text-hint text-xs font-bold px-2 py-1.5">إلغاء</button>
                        <button onClick={() => remove(u.id)}
                          className="text-xs font-bold text-white bg-loss rounded-lg px-3 py-1.5">
                          حذف نهائي
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => { setConfirmDel(u.id); setEditId(null); }}
                        className="text-xs font-bold text-loss border border-loss/40 bg-loss/10 rounded-lg px-3 py-1.5 hover:bg-loss/20">
                        🗑️ حذف
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {me?.id === u.id && <p className="text-hint text-[10px] mt-2">(حسابك الحالي)</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function EditUserForm({ token, user, onDone, onCancel }: {
  token: string; user: AdminUser; onDone: () => void; onCancel: () => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [fullName, setFullName] = useState(user.full_name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = username.trim() !== user.username || fullName.trim() !== (user.full_name ?? '');

  const save = async () => {
    setError(null); setBusy(true);
    try {
      await apiUpdateUser(token, user.id, { username: username.trim(), full_name: fullName.trim() });
      onDone();
    } catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-2">
      <p className="text-aqua text-[11px] font-bold">✎ تعديل بيانات المستخدم</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="block text-teal text-[11px] font-bold mb-1">اسم المستخدم</label>
          <input value={username} onChange={e => setUsername(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-teal text-[11px] font-bold mb-1">الاسم الكامل</label>
          <input value={fullName} onChange={e => setFullName(e.target.value)}
            placeholder="اختياري" className={inputCls} />
        </div>
      </div>
      {error && <p className="text-loss text-xs">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy || !dirty || username.trim().length < 3}
          className="bg-aqua text-on-accent font-bold text-xs px-4 py-1.5 rounded-lg disabled:opacity-50">
          {busy ? '…' : 'حفظ'}
        </button>
        <button onClick={onCancel} className="text-hint text-xs font-bold px-3 py-1.5">إلغاء</button>
      </div>
    </div>
  );
}

function CreateForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [f, setF] = useState({ username: '', full_name: '', password: '', role: 'clerk' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await apiCreateUser(token, {
        username: f.username.trim(), password: f.password,
        role: f.role, full_name: f.full_name.trim() || undefined,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ');
    } finally { setBusy(false); }
  };

  const field = (k: keyof typeof f, label: string, type = 'text') => (
    <div>
      <label className="block text-teal text-xs font-bold mb-1.5">{label}</label>
      <input type={type} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })}
        className="w-full bg-darkBg border border-bdr rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-aqua" />
    </div>
  );

  return (
    <form onSubmit={submit} className="bg-cardBg2 border border-aqua/30 rounded-2xl p-4 space-y-3">
      {field('username', 'اسم المستخدم')}
      {field('full_name', 'الاسم الكامل (اختياري)')}
      {field('password', 'كلمة المرور', 'password')}
      <div>
        <label className="block text-teal text-xs font-bold mb-1.5">الصلاحية</label>
        <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}
          className="w-full bg-darkBg border border-bdr rounded-lg px-3 py-2 text-text text-sm outline-none focus:border-aqua">
          {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r].ar}</option>)}
        </select>
      </div>
      {error && <p className="text-loss text-xs bg-loss/10 border border-loss/30 rounded-lg px-3 py-2">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full bg-aqua text-on-accent font-extrabold py-2.5 rounded-xl disabled:opacity-50">
        {busy ? 'جارٍ الحفظ…' : 'إنشاء المستخدم'}
      </button>
    </form>
  );
}
