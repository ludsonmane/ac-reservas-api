import * as React from 'react';

export default function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label || 'Ativar/Desativar'}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      className={[
        'inline-flex items-center select-none',
        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary/60',
      ].join(' ')}
    >
      {/* trilho */}
      <span
        className={[
          'relative inline-block h-6 w-11 rounded-full transition-colors duration-200',
          checked ? 'bg-primary/80' : 'bg-[#e5e7eb]',
          'ring-1 ring-inset ring-border',
        ].join(' ')}
      >
        {/* knob */}
        <span
          className={[
            'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white border border-border',
            'transition-transform duration-200',
            checked ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </span>
      {label && <span className="ml-2 text-sm text-muted">{label}</span>}
    </button>
  );
}
