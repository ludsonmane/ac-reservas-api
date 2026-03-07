import * as React from 'react';

type IconPickerProps = {
  value?: string | null;
  onChange: (emoji: string | null) => void;
  placeholder?: string;
  label?: string;
};

const CATEGORIES: { name: string; emojis: string[] }[] = [
  { name: 'Básicos', emojis: ['🏷️','⭐','✅','📍','ℹ️','⚡','🎯','🅿️','🚻','♿','🛎️'] },
  { name: 'Ambiente', emojis: ['🍺','🍷','🍹','🍔','🍟','🍕','🌮','🥩','🎸','🎤','🎶','🎧','🎼'] },
  { name: 'Espaços', emojis: ['🪑','🛋️','🪟','🪵','🏕️','🌆','🌃','🌉','🌤️','🌧️','🔥','💡'] },
  { name: 'Família', emojis: ['👶','🧒','👦','👧','👨‍🦽','👩‍🦽','🐶','🐱','👨‍👩‍👧','👪'] },
  { name: 'Status', emojis: ['🟢','🟡','🔴','🟣','🔵','⚪','⚫'] },
];

const LS_KEY = 'icon_picker_recent_v1';

function useOutsideClick<T extends HTMLElement>(ref: React.RefObject<T>, onClickOutside: () => void) {
  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClickOutside();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ref, onClickOutside]);
}

function normalizeEmoji(s: string) {
  // remove variation selectors para padronizar (opcional)
  return s.replace(/\uFE0F/g, '');
}

export default function IconPicker({ value, onChange, placeholder = 'Escolha um ícone', label }: IconPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [recent, setRecent] = React.useState<string[]>([]);
  const ref = React.useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => setOpen(false));

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch {}
  }, []);

  function pushRecent(emoji: string) {
    const e = normalizeEmoji(emoji);
    const next = [e, ...recent.filter((x) => x !== e)].slice(0, 12);
    setRecent(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  }

  function pick(emoji: string) {
    const e = normalizeEmoji(emoji);
    onChange(e);
    pushRecent(e);
    setOpen(false);
  }

  function clear() {
    onChange(null);
  }

  const filtered = React.useMemo(() => {
    if (!q.trim()) return CATEGORIES;
    const term = q.trim().toLowerCase();
    return CATEGORIES.map(cat => ({
      ...cat,
      emojis: cat.emojis.filter(e => e.toLowerCase().includes(term)),
    })).filter(cat => cat.emojis.length > 0);
  }, [q]);

  return (
    <div className="relative" ref={ref}>
      {label && <label className="label mb-1">{label}</label>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-neutral-50"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <span className="text-xl leading-none">{value || '🏷️'}</span>
          <span className="text-sm text-neutral-600">{value ? 'Trocar ícone' : placeholder}</span>
        </button>
        {value && (
          <button
            type="button"
            className="text-xs text-red-600 underline"
            onClick={clear}
            title="Limpar ícone"
          >
            Remover
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          className="absolute z-50 mt-2 w-[360px] max-w-[90vw] rounded-lg border bg-white shadow-lg p-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <input
              className="input w-full"
              placeholder="Buscar… (ex.: 🍺, 🎸)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {recent.length > 0 && !q.trim() && (
            <section className="mb-2">
              <div className="text-xs font-medium text-neutral-600 mb-1">Recentes</div>
              <div className="grid grid-cols-10 gap-1">
                {recent.map((e) => (
                  <button
                    key={`recent-${e}`}
                    type="button"
                    className="h-9 w-9 rounded-md hover:bg-neutral-100 text-xl"
                    onClick={() => pick(e)}
                    title={e}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </section>
          )}

          {filtered.map((cat) => (
            <section key={cat.name} className="mb-2">
              <div className="text-xs font-medium text-neutral-600 mb-1">{cat.name}</div>
              <div className="grid grid-cols-10 gap-1">
                {cat.emojis.map((e) => (
                  <button
                    key={`${cat.name}-${e}`}
                    type="button"
                    className="h-9 w-9 rounded-md hover:bg-neutral-100 text-xl"
                    onClick={() => pick(e)}
                    title={e}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </section>
          ))}

          {filtered.length === 0 && (
            <div className="text-sm text-neutral-500 py-6 text-center">Nenhum resultado</div>
          )}
        </div>
      )}
    </div>
  );
}
