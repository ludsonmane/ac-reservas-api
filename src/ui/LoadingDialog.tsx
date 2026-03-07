import React from 'react';

export default function LoadingDialog({
  open = false,
  title = 'Entrando...',
  message = 'Validando suas credenciais. Aguarde um instante.',
}: { open?: boolean; title?: string; message?: string }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="card w-full max-w-sm text-center">
        <div className="mx-auto mb-3 h-10 w-10 rounded-full border-2 border-border border-t-primary animate-spin" />
        <h3 className="title text-lg mb-1">{title}</h3>
        <p className="text-sm text-muted">{message}</p>
      </div>
    </div>
  );
}
