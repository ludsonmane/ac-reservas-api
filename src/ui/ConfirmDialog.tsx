import * as React from 'react';

export default function ConfirmDialog({
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
    try {
      setLoading(true);
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }

  const confirmBtnClass =
    variant === 'danger' ? 'btn btn-danger' :
    variant === 'primary' ? 'btn btn-primary' :
    'btn';

  return (
    <div className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
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
