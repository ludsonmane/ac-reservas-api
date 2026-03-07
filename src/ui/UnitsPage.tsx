// src/ui/UnitsPage.tsx
import * as React from 'react';
import { api } from '../lib/api';
import { useQuery, invalidate } from '../lib/query';
import { toast } from './toast';
import Toaster from './Toaster';
import Toggle from './Toggle';
import { PencilIcon, TrashIcon } from './icons';
import ConfirmDialog from './ConfirmDialog';

type Unit = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Page = {
  items: Unit[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/* ---------------- List hook ---------------- */
function useUnitsList(filters: { page: number; pageSize: number; search: string; active?: string }) {
  // chave estável pro cache
  const key = React.useMemo(
    () => `units:list:${JSON.stringify(filters)}`,
    [filters]
  );

  const { data, loading, refetch } = useQuery<Page>(
    key,
    async () => {
      const params = new URLSearchParams();
      params.set('page', String(filters.page));
      params.set('pageSize', String(filters.pageSize));
      if (filters.search) params.set('search', filters.search);
      if (filters.active) params.set('active', filters.active);
      return api(`/v1/units?${params.toString()}`, { auth: true });
    },
    { enabled: true, topics: ['units'] }
  );

  return {
    data: data ?? { items: [], total: 0, page: 1, pageSize: 20, totalPages: 1 },
    loading,
    refetch,
  };
}

/* ---------------- Modal ---------------- */
function UnitModal({
  open,
  onClose,
  onSaved,
  unit,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  unit: Unit | null;
}) {
  const [form, setForm] = React.useState<{ name: string; slug: string; isActive: boolean }>({
    name: '',
    slug: '',
    isActive: true,
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (unit) {
      setForm({ name: unit.name, slug: unit.slug, isActive: unit.isActive });
    } else {
      setForm({ name: '', slug: '', isActive: true });
    }
  }, [open, unit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      if (unit) {
        await api(`/v1/units/${unit.id}`, {
          method: 'PUT',
          auth: true,
          body: { name: form.name, slug: form.slug, isActive: form.isActive },
        });
        toast.success('Unidade atualizada.');
      } else {
        await api('/v1/units', {
          method: 'POST',
          auth: true,
          body: { name: form.name, slug: form.slug || undefined, isActive: form.isActive },
        });
        toast.success('Unidade criada.');
      }
      invalidate('units');
      onSaved();
      onClose();
    } catch (e: any) {
      const msg = e?.error?.message || e?.message || 'Falha ao salvar unidade.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="card shadow-none w-full max-w-xl p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border bg-card flex items-center justify-between">
          <h3 className="title text-xl">{unit ? 'Editar Unidade' : 'Nova Unidade'}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Fechar</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="md:col-span-2">
              <span>Nome</span>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                disabled={saving}
              />
            </label>
            <label>
              <span>Slug</span>
              <input
                className="input"
                placeholder="ex.: aguas-claras"
                value={form.slug}
                onChange={(e) => setForm((s) => ({ ...s, slug: e.target.value }))}
                disabled={saving}
              />
            </label>

            {/* Status (toggle no modal) */}
            <label className="flex items-end md:items-center gap-3 md:col-auto col-span-1">
              <span>Status</span>
              <Toggle
                checked={form.isActive}
                onChange={(v) => setForm((s) => ({ ...s, isActive: v }))}
                disabled={saving}
                label={form.isActive ? 'Ativa' : 'Inativa'}
              />
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border bg-card flex justify-end gap-2">
          <button className="btn" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-border border-t-white animate-spin" />
                Salvando…
              </span>
            ) : (
              'Salvar'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Página ---------------- */
export default function UnitsPage() {
  const [filters, setFilters] = React.useState({ page: 1, pageSize: 20, search: '', active: '' });
  const { data, loading, refetch } = useUnitsList(filters);

  // lista local para UI otimista: sincroniza somente quando o conteúdo realmente muda
  const [rows, setRows] = React.useState<Unit[]>([]);
  const lastSigRef = React.useRef<string>('');

  React.useEffect(() => {
    // cria uma assinatura estável do conteúdo relevante
    const sig = JSON.stringify(
      (data.items || []).map((u) => [u.id, u.name, u.slug, u.isActive])
    );
    if (sig !== lastSigRef.current) {
      lastSigRef.current = sig;
      setRows(data.items);
    }
  }, [data.items]);

  const [modalOpen, setModalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Unit | null>(null);

  // ⬇️ estado e handlers do diálogo de exclusão
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Unit | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  function openCreate() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(u: Unit) {
    setEditing(u);
    setModalOpen(true);
  }

  function askRemove(u: Unit) {
    setDeleteTarget(u);
    setDeleteOpen(true);
  }

  async function confirmRemove() {
    if (!deleteTarget || deleting) return;
    try {
      setDeleting(true);
      await api(`/v1/units/${deleteTarget.id}`, { method: 'DELETE', auth: true });
      toast.success('Unidade removida.');
      // atualiza a lista local imediatamente
      setRows((r) => r.filter((it) => it.id !== deleteTarget.id));
      invalidate('units');
      refetch();
      setDeleteOpen(false);
      setDeleteTarget(null);
    } catch (e: any) {
      const msg = e?.error?.message || e?.message || 'Falha ao remover unidade.';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="container mt-4">
      <Toaster />
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="title text-2xl">Unidades</h2>
          <button className="btn btn-primary" onClick={openCreate}>Nova Unidade</button>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
          <label className="md:col-span-2">
            <span>Buscar</span>
            <input
              className="input"
              placeholder="nome ou slug"
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))}
            />
          </label>
          <label>
            <span>Ativa</span>
            <select
              className="input"
              value={filters.active}
              onChange={(e) => setFilters((f) => ({ ...f, active: e.target.value, page: 1 }))}
            >
              <option value="">Todas</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </label>
          <div className="flex items-end">
            <button className="btn" onClick={() => refetch()}>Atualizar</button>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Slug</th>
                <th>Ativa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4}>Carregando…</td></tr>}

              {!loading && rows.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="text-muted">{u.slug}</td>
                  <td>
                    <span className={`badge ${u.isActive ? 'badge-ok' : 'badge-muted'}`}>
                      {u.isActive ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex gap-1 justify-end">
                      <button className="icon-btn" title="Editar unidade" onClick={() => openEdit(u)}>
                        <PencilIcon size={16} />
                      </button>
                      <button
                        className="icon-btn icon-danger"
                        title="Excluir unidade"
                        onClick={() => askRemove(u)}
                      >
                        <TrashIcon size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && rows.length === 0 && (
                <tr><td colSpan={4}>Sem resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="flex items-center justify-center gap-3 text-muted mt-3">
          <button
            className="btn btn-sm"
            onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, f.page - 1) }))}
          >
            ◀
          </button>
          <span>Página {data.page} de {data.totalPages} — {data.total} itens</span>
          <button
            className="btn btn-sm"
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
          >
            ▶
          </button>
        </div>
      </div>

      {/* Modal de criar/editar */}
      <UnitModal
        open={modalOpen}
        unit={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          // força um refresh imediato, sem loops
          refetch();
        }}
      />

      {/* Modal de exclusão */}
      <ConfirmDialog
        open={deleteOpen}
        title="Excluir unidade"
        description={
          <div>
            Tem certeza que deseja excluir a unidade
            {deleteTarget?.name ? <> <b>{deleteTarget.name}</b></> : null}
            ?<br />
            <span className="text-muted">Esta ação não pode ser desfeita.</span>
          </div>
        }
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="danger"
        onCancel={() => { if (!deleting) { setDeleteOpen(false); setDeleteTarget(null); } }}
        onConfirm={confirmRemove}
      />
    </section>
  );
}
