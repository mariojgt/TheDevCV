import { useEffect, useState } from 'react';
import { Bot, Check, Copy, Database, Download, Server, Sparkles, TerminalSquare } from 'lucide-react';
import { useToast } from '../components/ui/Toast';

interface Health {
  ok: boolean;
  ai: boolean;
  model: string | null;
  dataDir: string;
  version: string;
}

const MCP_TOOLS = [
  ['list_cvs', 'List every CV with ids and metadata'],
  ['get_cv', 'Fetch one CV with all sections'],
  ['create_cv', 'Create a new CV profile'],
  ['update_cv', 'Update summary, title, keywords, contact info…'],
  ['duplicate_cv', 'Copy a CV, optionally retargeted at a new role'],
  ['delete_cv', 'Delete a CV and its sections'],
  ['add_cv_item', 'Add experience / education / skills / projects…'],
  ['update_cv_item', 'Edit an existing section item'],
  ['delete_cv_item', 'Remove a section item'],
] as const;

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted hover:text-brand-light transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 rounded-md border-2 border-neo-border bg-black/40 text-[11px] font-mono text-emerald-200/90 overflow-x-auto whitespace-pre-wrap break-all">
        {text}
      </pre>
    </div>
  );
}

export default function Settings() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealthError(true));
  }, []);

  const mcpUrl = `${window.location.origin}/mcp`;
  const claudeCodeCmd = `claude mcp add --transport http thedevcv ${mcpUrl}`;
  const desktopConfig = JSON.stringify(
    { mcpServers: { thedevcv: { type: 'http', url: mcpUrl } } },
    null,
    2,
  );

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tight text-white">Settings</h1>
        <p className="text-sm text-muted mt-1">Your self-hosted instance — server status, AI, MCP and backups.</p>
      </div>

      {/* Server status */}
      <section className="p-5 rounded-md border-[3px] border-neo-border bg-surface space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
          <Server className="w-4 h-4 text-brand-light" /> Server
        </h2>
        {healthError && (
          <p className="text-sm text-red-400">
            Can't reach the local server. If you're running the Vite dev server, make sure `node server/index.mjs` is running too.
          </p>
        )}
        {health && (
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">Status</dt>
              <dd className="text-emerald-400 font-mono">running · v{health.version}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">AI features</dt>
              <dd className={`font-mono ${health.ai ? 'text-emerald-400' : 'text-amber-400'}`}>
                {health.ai ? `enabled · ${health.model}` : 'disabled'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">Data directory</dt>
              <dd className="font-mono text-muted break-all">{health.dataDir}</dd>
            </div>
          </dl>
        )}
        {health && !health.ai && (
          <p className="text-xs text-muted flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
            <span>
              AI rewrites, ATS tailoring and cover letters need an Anthropic key. Set{' '}
              <code className="text-amber-300">ANTHROPIC_API_KEY</code> in the server environment (or your{' '}
              <code className="text-amber-300">.env</code> / docker-compose) and restart. Everything else works without it.
            </span>
          </p>
        )}
      </section>

      {/* MCP */}
      <section className="p-5 rounded-md border-[3px] border-neo-border bg-surface space-y-4">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
          <Bot className="w-4 h-4 text-brand-light" /> MCP — let AI improve your CVs
        </h2>
        <p className="text-sm text-muted">
          This instance exposes an <strong className="text-white">MCP server</strong> so you can connect Claude (or any MCP
          client) and ask it to review, rewrite and iterate on your CVs — "punch up my experience bullets", "tailor a copy
          of my CV for a staff engineer role", "fix the keywords for this job ad". Changes show up here live.
        </p>

        <CopyBlock label="MCP endpoint" text={mcpUrl} />
        <CopyBlock label="Claude Code — one command" text={claudeCodeCmd} />
        <CopyBlock label="Claude Desktop — add to claude_desktop_config.json" text={desktopConfig} />

        <div>
          <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-subtle mb-2">
            <TerminalSquare className="w-3.5 h-3.5" /> Available tools
          </h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {MCP_TOOLS.map(([name, desc]) => (
              <li key={name} className="text-xs text-muted">
                <code className="text-brand-light">{name}</code> — {desc}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-subtle">
          Heads up: the MCP endpoint has no authentication — anyone who can reach this server can edit your CVs. Keep it on
          localhost or behind your own reverse-proxy auth if you expose it.
        </p>
      </section>

      {/* Data */}
      <section className="p-5 rounded-md border-[3px] border-neo-border bg-surface space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
          <Database className="w-4 h-4 text-brand-light" /> Your data
        </h2>
        <p className="text-sm text-muted">
          Everything lives in plain JSON files in the data directory — no database. Back it up by copying the folder, or
          download a snapshot:
        </p>
        <a
          href="/api/export"
          download
          onClick={() => toast('Backup download started', 'success')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border-[3px] border-brand bg-brand/10 text-brand-light text-xs font-bold uppercase tracking-wider shadow-[3px_3px_0_#000] hover:bg-brand/20 transition-colors"
        >
          <Download className="w-4 h-4" /> Download backup (.json)
        </a>
      </section>
    </div>
  );
}
