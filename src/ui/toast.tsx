// src/ui/toast.tsx
export type ToastKind = 'success' | 'error' | 'info';

export type ToastItem = {
  id: number;
  type: ToastKind;
  message: string;
  /** auto-close em ms (padrão 3000). Use 0 ou negativo para não fechar automaticamente. */
  duration?: number;
};

let counter = 1;
let items: ToastItem[] = [];

const listListeners = new Set<(list: ToastItem[]) => void>();
const addListeners = new Set<(t: ToastItem) => void>();

function emitList() {
  const snapshot = [...items];
  for (const fn of listListeners) fn(snapshot);
}

/**
 * Inscreve callbacks:
 * - onShow: chamado quando um novo toast é adicionado
 * - onList: chamado sempre que a lista inteira muda (add/remove)
 * Retorna função de unsubscribe.
 */
export function subscribeToast(
  onShow: (t: ToastItem) => void,
  onList?: (list: ToastItem[]) => void
) {
  addListeners.add(onShow);
  if (onList) {
    listListeners.add(onList);
    // entrega estado inicial
    onList([...items]);
  }
  return () => {
    addListeners.delete(onShow);
    if (onList) listListeners.delete(onList);
  };
}

export function removeToast(id: number) {
  const next = items.filter((t) => t.id !== id);
  if (next.length === items.length) return; // nada a remover
  items = next;
  emitList();
}

function push(type: ToastKind, message: string, duration = 3000) {
  const t: ToastItem = { id: counter++, type, message, duration };
  items = [...items, t];
  // notifica quem quer saber do item novo (Toaster agenda auto-close a partir daqui)
  for (const fn of addListeners) fn(t);
  // notifica snapshot da lista
  emitList();
  return t.id;
}

export const toast = {
  success: (message: string, duration?: number) => push('success', message, duration),
  error:   (message: string, duration?: number) => push('error',   message, duration),
  info:    (message: string, duration?: number) => push('info',    message, duration),
};
