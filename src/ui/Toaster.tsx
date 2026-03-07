import React, { useEffect, useRef, useState } from 'react';
import { subscribeToast, type ToastItem, removeToast } from './toast';

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const unsub = subscribeToast(
      (t) => {
        setItems((prev) => [...prev, t]);

        const ms = typeof t.duration === 'number' ? t.duration : 3000;
        if (ms && ms > 0) {
          const timer = setTimeout(() => {
            timersRef.current.delete(t.id);
            removeToast(t.id);
          }, ms);
          timersRef.current.set(t.id, timer);
        }
      },
      (nextList) => {
        setItems(nextList);

        // Cancela timers de toasts que não existem mais
        const keepIds = new Set(nextList.map((it) => it.id));
        for (const [id, timer] of timersRef.current.entries()) {
          if (!keepIds.has(id)) {
            clearTimeout(timer);
            timersRef.current.delete(id);
          }
        }
      }
    );

    return () => {
      unsub?.();
      for (const t of timersRef.current.values()) clearTimeout(t);
      timersRef.current.clear();
    };
  }, []);

  function handleClose(id: number) {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    removeToast(id);
  }

  return (
    <div
      className="pointer-events-none fixed z-[70] top-4 right-4 flex flex-col gap-2"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className={[
            'pointer-events-auto card px-4 py-3 shadow-soft min-w-[260px] max-w-[340px] border transition-all',
            t.type === 'success'
              ? 'border-[#10b981] bg-[#ecfdf5]'
              : t.type === 'error'
              ? 'border-[#ef4444] bg-[#fef2f2]'
              : 'border-[#3b82f6] bg-[#eef2ff]',
          ].join(' ')}
          role="status"
        >
          <div className="flex items-start gap-3">
            <div className="mt-[2px] select-none">
              {t.type === 'success' ? '✅' : t.type === 'error' ? '⚠️' : 'ℹ️'}
            </div>
            <div className="text-sm text-text/90 break-words">{t.message}</div>
            <button
              className="ml-auto btn btn-ghost btn-sm"
              onClick={() => handleClose(t.id)}
              aria-label="Fechar"
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
