// src/ui/UsersPage.tsx
import React from 'react';
import { api } from '../lib/api';
import { invalidate } from '../lib/query';
import { toast } from './toast';
import Skeleton from './Skeleton';
import { useUsers } from './hooks/useUsers';
import { PencilIcon, TrashIcon } from './icons';

/* ---------- Tipos locais ---------- */
type UsersFilters = {
  page: number;
  pageSize: number;
  search: string;
  active: 'all' | 'true' | 'false';
  /** chave só para forçar re-busca; o hook original pode não conhecer essa prop */
  refreshKey?: number;
};

/* ---------- Loading central (overlay) ---------- */
function CenterLoading({
  open,
  label = 'Carregando…',
}: { open: boolean; label?: string }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="card w-full max-w-xs text-center">
        <div className="mx-auto mb-3 h-10 w-10 rounded-full border-2 border-border border-t-primary animate-spin" />
        <div className="text-sm text-muted">{label}</div>
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */
function cleanStr(v: any) {
  if (v === null || v === undefined) return v;
  if (typeof v !== 'string') return v;
  const t = v.trim();
  return t === '' ? '' : t;
}
function buildDeltaPayload(editing: any, form: any) {
  const delta: any = {};
  const fields = ['name', 'email', 'role', 'isActive'];
  for (const f of fields) {
    const curr = form[f];
    const prev = editing ? editing[f] : undefined;
    const val = typeof curr === 'string' ? curr.trim() : curr;
    if (!editing || val !== prev) {
      if (!(typeof val === 'string' && val === '')) delta[f] = val;
    }
  }
  if (form.password && String(form.password).trim().length >= 6) {
    delta.password = String(form.password).trim();
  }
  return delta;
}

/* ---------- ConfirmDialog (padrão) ---------- */
function ConfirmDialog({
  open,
  title = 'Confirmar ação',
  description,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'primary',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger' | 'default';
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = React.useState(false);
  if (!open) return null;

  async function handleConfirm() {
    try { setLoading(true); await onConfirm(); } finally { setLoading(false); }
  }

  const confirmBtnClass =
    variant === 'danger' ? 'btn btn-danger'
      : variant === 'primary' ? 'btn btn-primary'
        : 'btn';

  return (
    <div className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="card w-full max-w-md p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-card">
          <h3 className="text-lg font-normal m-0">{title}</h3>
        </div>
        <div className="px-5 py-4">
          {typeof description === 'string' ? <p className="text-sm">{description}</p> : description}
        </div>
        <div className="px-5 py-3 border-t border-border bg-card flex justify-end gap-2">
          <button className="btn" onClick={onCancel} disabled={loading}>{cancelText}</button>
          <button className={confirmBtnClass} onClick={handleConfirm} disabled={loading}>
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-border border-t-white animate-spin" />
                {confirmText}
              </span>
            ) : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Modal ---------- */
function UserModal({
  open, onClose, editing, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: any | null;
  onSaved: (updated?: any) => void; // permite otimização local
}) {
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState<any>({ role: 'CONCIERGE', isActive: true });

  React.useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? { ...editing, password: '' }
        : { name: '', email: '', role: 'CONCIERGE', isActive: true, password: '' }
    );
  }, [open, editing]);

  if (!open) return null;
  const set = (k: string, v: any) => setForm((s: any) => ({ ...s, [k]: v }));

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const name = cleanStr(form.name);
      const email = cleanStr(form.email);

      if (!editing) {
        if (!name) return toast.error('Nome é obrigatório.');
        if (!email) return toast.error('E-mail é obrigatório.');
        if (!form.password || String(form.password).trim().length < 6) {
          return toast.error('Senha deve ter pelo menos 6 caracteres.');
        }
        const payload: any = {
          name,
          email,
          role: form.role || 'CONCIERGE',
          isActive: !!form.isActive,
          password: String(form.password).trim(),
        };
        const created = await api('/v1/users', { method: 'POST', body: payload, auth: true });
        toast.success('Usuário criado.');
        onSaved(created); // devolve criado p/ UI otimista
      } else {
        const delta = buildDeltaPayload(editing, {
          name,
          email,
          role: form.role,
          isActive: !!form.isActive,
          password: form.password,
        });

        if (Object.keys(delta).length === 0) {
          toast.success('Nada para atualizar.');
          onSaved(editing);
          onClose();
          return;
        }

        const updated = await api(`/v1/users/${editing.id}`, { method: 'PUT', body: delta, auth: true });
        toast.success('Usuário atualizado.');
        onSaved(updated);
      }

      onClose();
    } catch (e: any) {
      const msg = e?.error?.message || e?.error || e?.message || 'Falha ao salvar.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="card w-full max-w-lg p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-card flex items-center justify-between">
          <h3 className="title text-xl m-0">{editing ? 'Editar' : 'Novo'} Usuário</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Fechar</button>
        </div>

        <div className="px-5 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="md:col-span-2">
              <span>Nome*</span>
              <input className="input" value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="Nome completo" />
            </label>
            <label className="md:col-span-2">
              <span>E-mail*</span>
              <input className="input" type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} placeholder="email@exemplo.com" />
            </label>
            <label>
              <span>Role*</span>
              <select className="input" value={form.role || 'CONCIERGE'} onChange={e => set('role', e.target.value)}>
                <option value="ADMIN">ADMIN</option>
                <option value="CONCIERGE">CONCIERGE</option>
              </select>
            </label>
            <label>
              <span>Ativo</span>
              <select className="input" value={String(!!form.isActive)} onChange={e => set('isActive', e.target.value === 'true')}>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </label>
            <label className="md:col-span-2">
              <span>{editing ? 'Nova senha (opcional)' : 'Senha*'}</span>
              <input className="input" type="password" value={form.password || ''} onChange={e => set('password', e.target.value)} placeholder={editing ? 'Deixe em branco para não alterar' : 'Mínimo 6 caracteres'} />
            </label>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border bg-card flex justify-end gap-2">
          <button className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Página ---------- */
export default function UsersPage() {
  const [filters, setFilters] = React.useState<UsersFilters>({
    page: 1,
    pageSize: 20,
    search: '',
    active: 'all',
  });
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Passa refreshKey apenas para forçar nova key/sinal pro hook (cast para não brigar com o tipo dele)
  const { data, loading } = useUsers({ ...filters, refreshKey } as any);
  const pageData = data || { page: 1, totalPages: 1, total: 0, items: [] as any[] };

  // 🔄 lista local + assinatura p/ sincronizar só quando muda de verdade
  const [rows, setRows] = React.useState<any[]>([]);
  const lastSigRef = React.useRef<string>('');
  React.useEffect(() => {
    const sig = JSON.stringify((pageData.items || []).map(u => [u.id, u.name, u.email, u.role, u.isActive]));
    if (sig !== lastSigRef.current) {
      lastSigRef.current = sig;
      setRows(pageData.items || []);
    }
  }, [pageData.items]);

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<any | null>(null);

  // diálogo de exclusão
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<any | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // loading central para "Meu perfil"
  const [profileLoading, setProfileLoading] = React.useState(false);

  function forceRefresh() {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      invalidate('users');          // invalida cache do hook
      setRefreshKey(k => k + 1);    // força re-busca
    } finally {
      // mostra skeleton até a nova resposta chegar; o useEffect acima sincroniza rows
      setTimeout(() => setIsRefreshing(false), 150);
    }
  }

  // ⚡ otimista: excluir
  const askDelete = (user: any) => { setDeleteTarget(user); setDeleteOpen(true); };
  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    const prev = rows;
    setDeleting(true);
    // otimista: remove já na UI
    setRows(r => r.filter(it => it.id !== deleteTarget.id));
    try {
      await api(`/v1/users/${deleteTarget.id}`, { method: 'DELETE', auth: true });
      toast.success('Usuário excluído.');
      forceRefresh();
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (e: any) {
      setRows(prev); // rollback
      const msg = e?.error?.message || e?.error || e?.message || 'Falha ao excluir.';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  // ✅ salvar/editar: aplica otimista na lista e depois busca o servidor
  function handleSaved(updated?: any) {
    if (updated?.id) {
      setRows(curr => {
        const idx = curr.findIndex((u) => u.id === updated.id);
        if (idx >= 0) {
          const clone = curr.slice();
          clone[idx] = { ...clone[idx], ...updated };
          return clone;
        }
        return [updated, ...curr];
      });
    }
    forceRefresh();
  }

  const showSkeleton = loading || isRefreshing;

  // 🔔 OUVE "users:edit" (Topbar -> Meu perfil). Mostra overlay e busca o usuário (sem toast).
  React.useEffect(() => {
    function onUsersEdit(e: any) {
      const id = e?.detail?.id;

      (async () => {
        setProfileLoading(true);
        try {
          const payload = id
            ? await api(`/v1/users/${id}`, { auth: true })
            : await api('/auth/me', { auth: true });

          const userObj = payload?.user ?? payload;
          if (!userObj?.id) throw new Error('Não foi possível carregar o perfil.');
          setEditing(userObj);
          setModalOpen(true);
        } catch (err: any) {
          // silencioso; se quiser feedback, pode usar toast.error aqui
          console.error(err?.message || err);
        } finally {
          setProfileLoading(false);
        }
      })();
    }

    window.addEventListener('users:edit', onUsersEdit);
    return () => window.removeEventListener('users:edit', onUsersEdit);
  }, []);

  return (
    <section className="container mt-4">
      <div className="card">
        {/* Filtros / ações */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
            <label>
              <span>Buscar</span>
              <input
                className="input"
                value={filters.search}
                onChange={e => setFilters({ ...filters, search: e.target.value, page: 1 })}
                placeholder="nome ou e-mail"
              />
            </label>
            <label>
              <span>Ativo</span>
              <select
                className="input"
                value={filters.active}
                onChange={e => setFilters({ ...filters, active: e.target.value as UsersFilters['active'], page: 1 })}
              >
                <option value="all">Todos</option>
                <option value="true">Somente ativos</option>
                <option value="false">Somente inativos</option>
              </select>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              className="btn"
              onClick={forceRefresh}
              disabled={showSkeleton}
              aria-busy={showSkeleton}
            >
              {isRefreshing ? 'Atualizando…' : 'Atualizar'}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => { setEditing(null); setModalOpen(true); }}
            >
              Novo Usuário
            </button>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th><th>E-mail</th><th>Role</th><th>Ativo</th><th></th>
              </tr>
            </thead>

            {/* Skeleton rows durante loading/refresh */}
            {showSkeleton ? (
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td><Skeleton className="h-4 w-40" /></td>
                    <td><Skeleton className="h-4 w-56" /></td>
                    <td><Skeleton className="h-4 w-20" /></td>
                    <td><Skeleton className="h-4 w-16" /></td>
                    <td className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Skeleton className="h-7 w-7" />
                        <Skeleton className="h-7 w-7" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            ) : (
              <tbody>
                {rows.map((u: any) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.role}</td>
                    <td>
                      <span className={`badge ${u.isActive ? 'badge-ok' : 'badge-muted'}`}>
                        {u.isActive ? 'Sim' : 'Não'}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex gap-1 justify-end">
                        <button
                          className="icon-btn"
                          title="Editar usuário"
                          onClick={() => { setEditing(u); setModalOpen(true); }}
                        >
                          <PencilIcon size={16} />
                        </button>
                        <button
                          className="icon-btn icon-danger"
                          title="Excluir usuário"
                          onClick={() => {
                            setDeleteTarget(u);
                            setDeleteOpen(true);
                          }}
                        >
                          <TrashIcon size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={5}>Sem resultados</td></tr>}
              </tbody>
            )}
          </table>
        </div>

        {/* Paginação */}
        <div className="flex items-center justify-center gap-3 text-muted mt-3">
          <button
            className="btn btn-sm"
            onClick={() => setFilters(f => ({ ...f, page: Math.max(1, f.page - 1) }))}
            disabled={pageData.page <= 1 || showSkeleton}
          >
            ◀
          </button>
          <span>Página {pageData.page} de {pageData.totalPages} — {pageData.total} itens</span>
          <button
            className="btn btn-sm"
            onClick={() => setFilters(f => ({ ...f, page: Math.min(pageData.totalPages, f.page + 1) }))}
            disabled={pageData.page >= pageData.totalPages || showSkeleton}
          >
            ▶
          </button>
        </div>
      </div>

      {/* Modal criar/editar (passa handleSaved p/ otimista + refresh) */}
      <UserModal
        open={modalOpen}
        editing={editing}
        onClose={() => setModalOpen(false)}
        onSaved={handleSaved}
      />

      {/* Diálogo de exclusão */}
      <ConfirmDialog
        open={deleteOpen}
        title="Excluir usuário"
        description={
          <div>
            Tem certeza que deseja excluir o usuário
            {deleteTarget?.name ? <> <b>{deleteTarget.name}</b></> : null}
            ?<br />
            <span className="text-muted">Esta ação não pode ser desfeita.</span>
          </div>
        }
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
        onCancel={() => { if (!deleting) { setDeleteOpen(false); setDeleteTarget(null); } }}
        onConfirm={confirmDelete}
      />

      {/* Overlay de loading ao abrir "Meu perfil" */}
      <CenterLoading open={profileLoading} label="Carregando seu perfil…" />
    </section>
  );
}
