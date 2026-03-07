import * as React from 'react';

export default function IconBtn({
  title,
  onClick,
  variant = '',
  danger = false,
  disabled,
  children,
}: {
  title: string;
  onClick?: () => void;
  variant?: string;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center btn btn-sm ${
        danger ? 'btn-danger' : variant
      } h-9 w-9 p-0 rounded-full`}
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
    >
      <span className="text-[20px] leading-none pointer-events-none">
        {children}
      </span>
      <span className="sr-only">{title}</span>
    </button>
  );
}
