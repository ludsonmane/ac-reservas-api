// src/ui/LogsPage.tsx
import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import Skeleton from './Skeleton';

type AuditLog = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  oldData: any;
  newData: any;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

type LogsResponse = {
  items: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Criação',
  UPDATE: 'Atualização',
  DELETE: 'Exclusão',
  CHECKIN: 'Check-in',
  NO_SHOW: 'No Show',
  QR_RENEW: 'Renovação QR',
  LOGIN: 'Login',
  LOGOUT: 'Logout',
};

const ENTITY_LABELS: Record<string, string> = {
  Reservation: 'Reserva',
  Unit: 'Unidade',
  Area: 'Área',
  User: 'Usuário',
  Block: 'Bloqueio',
  Guest: 'Convidado',
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

function ActionBadge({ action }: { action: string }) {
  const colors: Record<string, string> = {
    CREATE: 'bg-green-100 text-green-800 border-green-300',
    UPDATE: 'bg-blue-100 text-blue-800 border-blue-300',
    DELETE: 'bg-red-100 text-red-800 border-red-300',
    CHECKIN: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    NO_SHOW: 'bg-orange-100 text-orange-800 border-orange-300',
    QR_RENEW: 'bg-purple-100 text-purple-800 border-purple-300',
    LOGIN: 'bg-gray-100 text-gray-800 border-gray-300',
    LOGOUT: 'bg-gray-100 text-gray-800 border-gray-300',
  };

  return (
    <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${colors[action] || 'bg-gray-100 text-gray-800 border-gray-300'}`}>
      {ACTION_LABELS[action] || action}
    </span>
  );
}

function JsonViewer({ data, label }: { data: any; label: string }) {
  const [expanded, setExpanded] = useState(false);

  if (!data) return <span className="text-muted">-</span>;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-blue-600 hover:underline"
      >
        {expanded ? 'Ocultar' : 'Ver'} {label}
      </button>
      {expanded && (
        <pre className="mt-1 p-2 bg-gray-50 rounded text-xs overflow-x-auto max-w-xs">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 25,
    action: '',
    entity: '',
    search: '',
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchLogs() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('page', String(filters.page));
        params.set('pageSize', String(filters.pageSize));
        if (filters.action) params.set('action', filters.action);
        if (filters.entity) params.set('entity', filters.entity);
        if (filters.search) params.set('search', filters.search);

        const data = await api(`/v1/audit?${params.toString()}`, { auth: true });
        if (!cancelled) setLogs(data);
      } catch (err) {
        console.error('Erro ao carregar logs:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchLogs();
    return () => { cancelled = true; };
  }, [filters]);

  const set = (k: string, v: any) => setFilters((s) => ({ ...s, [k]: v, page: 1 }));

  return (
    <section className="container py-6">
      <h2 className="title text-2xl mb-4">Logs de Auditoria</h2>

      {/* Filtros */}
      <div className="card mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label>
            <span className="block text-sm text-muted mb-1">Buscar</span>
            <input
              className="input py-2"
              placeholder="Nome, email, ID..."
              value={filters.search}
              onChange={(e) => set('search', e.target.value)}
            />
          </label>

          <label>
            <span className="block text-sm text-muted mb-1">Ação</span>
            <select
              className="input py-2"
              value={filters.action}
              onChange={(e) => set('action', e.target.value)}
            >
              <option value="">Todas</option>
              <option value="CREATE">Criação</option>
              <option value="UPDATE">Atualização</option>
              <option value="DELETE">Exclusão</option>
              <option value="CHECKIN">Check-in</option>
              <option value="NO_SHOW">No Show</option>
              <option value="QR_RENEW">Renovação QR</option>
            </select>
          </label>

          <label>
            <span className="block text-sm text-muted mb-1">Entidade</span>
            <select
              className="input py-2"
              value={filters.entity}
              onChange={(e) => set('entity', e.target.value)}
            >
              <option value="">Todas</option>
              <option value="Reservation">Reserva</option>
              <option value="Unit">Unidade</option>
              <option value="Area">Área</option>
              <option value="User">Usuário</option>
              <option value="Block">Bloqueio</option>
            </select>
          </label>

          <label>
            <span className="block text-sm text-muted mb-1">Por página</span>
            <select
              className="input py-2"
              value={filters.pageSize}
              onChange={(e) => set('pageSize', Number(e.target.value))}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>
        </div>
      </div>

      {/* Tabela */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="px-3 py-2">Data/Hora</th>
                <th className="px-3 py-2">Usuário</th>
                <th className="px-3 py-2">Ação</th>
                <th className="px-3 py-2">Entidade</th>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Antes</th>
                <th className="px-3 py-2">Depois</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-12" /></td>
                    <td className="px-3 py-2"><Skeleton className="h-4 w-20" /></td>
                  </tr>
                ))
              ) : logs?.items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted">
                    Nenhum log encontrado
                  </td>
                </tr>
              ) : (
                logs?.items.map((log) => (
                  <tr key={log.id}>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium">{log.userName || '-'}</div>
                      <div className="text-xs text-muted">{log.userEmail || ''}</div>
                    </td>
                    <td className="px-3 py-2">
                      <ActionBadge action={log.action} />
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {ENTITY_LABELS[log.entity] || log.entity}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-muted">
                      {log.entityId ? log.entityId.substring(0, 8) + '...' : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <JsonViewer data={log.oldData} label="anterior" />
                    </td>
                    <td className="px-3 py-2">
                      <JsonViewer data={log.newData} label="novo" />
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {log.ip || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginação */}
      {logs && (
        <div className="flex items-center justify-center gap-3 text-muted mt-4">
          <button
            className="btn btn-sm"
            disabled={filters.page <= 1}
            onClick={() => setFilters((s) => ({ ...s, page: s.page - 1 }))}
          >
            ◀
          </button>
          <span>
            Página {logs.page} de {logs.totalPages} — {logs.total} registros
          </span>
          <button
            className="btn btn-sm"
            disabled={filters.page >= logs.totalPages}
            onClick={() => setFilters((s) => ({ ...s, page: s.page + 1 }))}
          >
            ▶
          </button>
        </div>
      )}
    </section>
  );
}
