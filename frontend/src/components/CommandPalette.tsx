import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, FileUser, Plus, Upload, Target, Briefcase, Compass,
  Settings, CornerDownLeft, Command, ArrowUpDown, Image,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { CVProfile } from '../modules/cv/types';

type PaletteAction = {
  id: string;
  label: string;
  group: 'Navigate' | 'Create' | 'My CVs' | 'Account';
  hint?: string;
  icon: typeof Search;
  perform: () => void | Promise<void>;
  keywords?: string;
};

function score(q: string, text: string): number {
  if (!q) return 1;
  const query = q.toLowerCase();
  const target = text.toLowerCase();
  if (target === query) return 1000;
  if (target.startsWith(query)) return 500;
  if (target.includes(query)) return 250;
  let ti = 0;
  let hits = 0;
  for (let qi = 0; qi < query.length; qi++) {
    const ch = query[qi];
    while (ti < target.length && target[ti] !== ch) ti++;
    if (ti >= target.length) return 0;
    hits++; ti++;
  }
  return hits;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [cvs, setCvs] = useState<CVProfile[]>([]);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global ⌘K / Ctrl+K toggle + Esc close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Lazy-fetch CV list when opening.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 10);
    supabase
      .from('cv_profiles')
      .select('*')
      .order('is_default', { ascending: false })
      .then(({ data }) => setCvs((data as CVProfile[]) ?? []));
  }, [open]);

  const close = () => setOpen(false);
  const go = (path: string) => { close(); navigate(path); };

  const actions = useMemo<PaletteAction[]>(() => {
    const base: PaletteAction[] = [
      { id: 'nav-dashboard',    group: 'Navigate', label: 'Dashboard',          icon: FileUser,  perform: () => go('/cv'),          keywords: 'home cvs list' },
      { id: 'nav-discover',     group: 'Navigate', label: 'Discover jobs',      icon: Compass,   perform: () => go('/cv/discover'), keywords: 'find search postings' },
      { id: 'nav-applications', group: 'Navigate', label: 'Applications',       icon: Briefcase, perform: () => go('/cv/jobs'),     keywords: 'tracker pipeline' },
      { id: 'nav-tailor',       group: 'Navigate', label: 'Tailor CV to job',   icon: Target,    perform: () => go('/cv/match'),    keywords: 'match jd ats' },
      { id: 'nav-banner',       group: 'Navigate', label: 'LinkedIn banner',     icon: Image,     perform: () => go('/cv/banner'),   keywords: 'cover linkedin png export' },
      { id: 'create-cv',        group: 'Create',   label: 'New CV',             hint: 'Start from blank', icon: Plus,    perform: () => go('/cv/new'),    keywords: 'blank fresh add' },
      { id: 'import-cv',        group: 'Create',   label: 'Import existing CV', hint: 'PDF or image',     icon: Upload,  perform: () => go('/cv/import'), keywords: 'upload ocr pdf' },
      { id: 'acc-settings',     group: 'Account',  label: 'Settings',           hint: 'MCP, AI, backups', icon: Settings, perform: () => go('/settings'), keywords: 'mcp ai backup export server' },
    ];
    const cvActions: PaletteAction[] = cvs.map(cv => ({
      id: `cv-${cv.id}`,
      group: 'My CVs',
      label: cv.version_name || cv.full_name || 'Untitled CV',
      hint: cv.target_role || cv.job_title || undefined,
      icon: FileUser,
      perform: () => go(`/cv/${cv.id}`),
      keywords: `${cv.full_name ?? ''} ${cv.job_title ?? ''} ${cv.target_role ?? ''}`,
    }));
    return [...cvActions, ...base];
  }, [cvs]);

  const results = useMemo(() => {
    if (!query.trim()) return actions;
    return actions
      .map(a => ({ a, s: score(query, `${a.label} ${a.hint ?? ''} ${a.keywords ?? ''}`) }))
      .filter(r => r.s > 0)
      .sort((x, y) => y.s - x.s)
      .map(r => r.a);
  }, [actions, query]);

  // Keep active index in bounds when results change.
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (active >= results.length) setActive(Math.max(0, results.length - 1));
  }, [results, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(i => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = results[active];
      if (pick) pick.perform();
    }
  };

  // Scroll active row into view.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  if (!open) return null;

  const grouped = results.reduce<Record<string, PaletteAction[]>>((acc, a) => {
    (acc[a.group] ||= []).push(a);
    return acc;
  }, {});
  const order: PaletteAction['group'][] = ['My CVs', 'Create', 'Navigate', 'Account'];

  let flatIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-xl rounded-md bg-surface border-[3px] border-neo-border shadow-[6px_6px_0_#000] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b-[3px] border-neo-border bg-surface-light">
          <Search className="w-4 h-4 text-brand-light shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a CV, action, or page…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold uppercase text-muted bg-surface border-2 border-neo-border">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs font-bold uppercase tracking-wider text-subtle">
              No matches for "{query}"
            </div>
          ) : order.filter(g => grouped[g]?.length).map(group => (
            <div key={group}>
              <div className="px-4 pt-3 pb-1 text-[10px] font-extrabold uppercase tracking-widest text-subtle">
                {group}
              </div>
              {grouped[group].map(a => {
                flatIdx++;
                const isActive = flatIdx === active;
                const myIdx = flatIdx;
                const Icon = a.icon;
                return (
                  <button
                    key={a.id}
                    type="button"
                    data-idx={myIdx}
                    onMouseEnter={() => setActive(myIdx)}
                    onClick={() => a.perform()}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-l-[3px] ${
                      isActive
                        ? 'bg-brand/10 text-white border-brand'
                        : 'text-muted border-transparent hover:bg-surface-light hover:text-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-brand-light' : ''}`} />
                    <span className="flex-1 min-w-0 truncate text-sm">{a.label}</span>
                    {a.hint && (
                      <span className="shrink-0 text-[11px] text-subtle truncate max-w-[40%]">
                        {a.hint}
                      </span>
                    )}
                    {isActive && (
                      <CornerDownLeft className="w-3 h-3 text-brand-light shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-2 border-t-[3px] border-neo-border bg-surface-light text-[10px] font-bold uppercase tracking-wider text-subtle">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3" /> navigate
            </span>
            <span className="inline-flex items-center gap-1">
              <CornerDownLeft className="w-3 h-3" /> select
            </span>
          </div>
          <span className="inline-flex items-center gap-1">
            <Command className="w-3 h-3" /> K to toggle
          </span>
        </div>
      </div>
    </div>
  );
}
