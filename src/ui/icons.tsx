import * as React from 'react';

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };

// Base helper
function Svg(props: IconProps & { children: React.ReactNode }) {
  const { size = 18, children, ...rest } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </Svg>
  );
}

export function PowerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2v10" />
      <path d="M5.5 5.5a7.5 7.5 0 1 0 13 0" />
    </Svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </Svg>
  );
}

// (Opcional) Alguns extras que já usamos em outras telas
export function RefreshCwIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 2v6h-6" />
      <path d="M3 22v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.13-3.36L21 8" />
      <path d="M20.49 15a9 9 0 0 1-14.13 3.36L3 16" />
    </Svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}
