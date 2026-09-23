import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Bot,
  Check,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { useApp } from '../contexts/AppContext';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_AI_MODELS } from '../lib/models';
import { AUTH_EXPIRED_EVENT } from '../lib/supabase';

interface Health {
  ok: boolean;
  auth: boolean;
  registration: 'open' | 'first-user' | 'disabled';
  registration_open: boolean;
  setup_required: boolean;
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

const SETTINGS_ERRORS: Record<string, string> = {
  invalid_api_key: 'That key was rejected by Anthropic. Workspace-scoped keys (sk-ant-api03…) also need their workspace ID (wrk_…).',
  anthropic_workspace_id_required: 'Workspace-scoped key detected: add its workspace ID (wrk_…) below, or use a standard API key.',
  invalid_model: 'That model is not on the allowed list.',
  api_key_validation_failed: 'Anthropic could not validate the key. Check the key / workspace and try again.',
  unauthorized: 'Your session expired. Sign in again.',
};

function CopyBlock({ label, text, secret = false }: { label: string; text: string; secret?: boolean }) {
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
      <div className="flex items-center justify-between gap-3">
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
      <pre className={`p-3 rounded-md border-2 border-neo-border bg-black/40 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap break-all ${secret ? 'text-amber-200/90' : 'text-emerald-200/90'}`}>
        {text}
      </pre>
    </div>
  );
}

async function settingsRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  if (!response.ok) {
    const err = new Error(body?.error ?? 'request_failed') as Error & { detail?: string };
    err.detail = body?.detail;
    throw err;
  }
  return body;
}

export default function Settings() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [savingModel, setSavingModel] = useState(false);
  const [removingKey, setRemovingKey] = useState(false);
  const [rotatingToken, setRotatingToken] = useState(false);
  const [downloadingBackup, setDownloadingBackup] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const { settings, settingsLoading, refreshSettings } = useApp();
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetch('/api/health')
      .then((response) => {
        if (!response.ok) throw new Error('health_failed');
        return response.json();
      })
      .then(setHealth)
      .catch(() => setHealthError(true));
  }, []);

  const saveKey = async (event: FormEvent) => {
    event.preventDefault();
    if (!apiKey.trim()) return;
    setSavingKey(true);
    setKeyError(null);
    try {
      await settingsRequest('/api/settings/anthropic-key', {
        method: 'PUT',
        body: JSON.stringify({
          api_key: apiKey.trim(),
          workspace_id: workspaceId.trim() || undefined,
        }),
      });
      setApiKey('');
      setWorkspaceId('');
      setShowKey(false);
      await refreshSettings();
      toast('Anthropic API key saved', 'success');
    } catch (error) {
      const code = error instanceof Error ? error.message : 'request_failed';
      const detail = (error as { detail?: string } | null)?.detail;
      setKeyError(SETTINGS_ERRORS[code] ?? detail ?? 'Could not save the API key.');
    } finally {
      setSavingKey(false);
    }
  };

  const saveModel = async (model: string) => {
    if (model === settings?.ai_model || savingModel) return;
    setSavingModel(true);
    try {
      await settingsRequest('/api/settings/ai-model', {
        method: 'PUT',
        body: JSON.stringify({ ai_model: model }),
      });
      await refreshSettings();
      const label = settings?.ai_models?.find((option) => option.id === model)?.label ?? model;
      toast(`AI model set to ${label}`, 'success');
    } catch (error) {
      const code = error instanceof Error ? error.message : 'request_failed';
      const detail = (error as { detail?: string } | null)?.detail;
      toast(SETTINGS_ERRORS[code] ?? detail ?? 'Could not update the AI model.', 'error');
    } finally {
      setSavingModel(false);
    }
  };

  const removeKey = async () => {
    if (!window.confirm('Remove your saved Anthropic API key? AI features may become unavailable.')) return;
    setRemovingKey(true);
    setKeyError(null);
    try {
      await settingsRequest('/api/settings/anthropic-key', { method: 'DELETE' });
      await refreshSettings();
      toast('Saved API key removed', 'success');
    } catch {
      setKeyError('Could not remove the saved API key.');
    } finally {
      setRemovingKey(false);
    }
  };

  const rotateToken = async () => {
    if (!window.confirm('Rotate the MCP token? Existing MCP connections will stop working until you update them.')) return;
    setRotatingToken(true);
    try {
      await settingsRequest('/api/settings/mcp-token', { method: 'POST' });
      await refreshSettings();
      toast('MCP token rotated', 'success');
    } catch {
      toast('Could not rotate the MCP token', 'error');
    } finally {
      setRotatingToken(false);
    }
  };

  const downloadBackup = async () => {
    setDownloadingBackup(true);
    try {
      const response = await fetch('/api/export', { credentials: 'include' });
      if (response.status === 401) window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      if (!response.ok) throw new Error('backup_failed');
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `thedevcv-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
      toast('Backup downloaded', 'success');
    } catch {
      toast('Could not download your backup', 'error');
    } finally {
      setDownloadingBackup(false);
    }
  };

  const mcpUrl = `${window.location.origin}/mcp`;
  const mcpToken = settings?.mcp_token ?? '<your-token>';
  const claudeCodeCmd = `claude mcp add --transport http thedevcv ${mcpUrl} --header "Authorization: Bearer ${mcpToken}"`;
  const clientConfig = useMemo(() => JSON.stringify(
    {
      mcpServers: {
        thedevcv: {
          type: 'http',
          url: mcpUrl,
          headers: { Authorization: `Bearer ${mcpToken}` },
        },
      },
    },
    null,
    2,
  ), [mcpToken, mcpUrl]);

  const aiStatus = settings?.ai_configured
    ? `enabled · ${settings.ai_model}`
    : 'not configured';
  const keySource = settings?.ai_source === 'user'
    ? `Your saved key · ends ${settings.ai_key_hint}`
    : settings?.ai_source === 'env'
      ? `Server environment key · ends ${settings.ai_key_hint}`
      : 'No key saved';

  let modelPicker: ReactNode = null;
  if (settings?.ai_configured) {
    const models = settings.ai_models?.length ? settings.ai_models : DEFAULT_AI_MODELS;
    const options = settings.ai_model && !models.some((model) => model.id === settings.ai_model)
      ? [{ id: settings.ai_model, label: settings.ai_model }, ...models]
      : models;
    modelPicker = (
      <div className="space-y-2">
        <label htmlFor="ai-model" className="text-[10px] font-bold uppercase tracking-wider text-subtle block">
          AI model
        </label>
        <div className="flex items-center gap-2">
          <select
            id="ai-model"
            value={settings?.ai_model ?? ''}
            onChange={(event) => saveModel(event.target.value)}
            disabled={savingModel}
            className="neo-input w-full px-3 py-2.5 font-mono text-sm disabled:opacity-50"
          >
            {options.map((model) => (
              <option key={model.id} value={model.id}>{model.label}</option>
            ))}
          </select>
          {savingModel && <Loader2 className="w-4 h-4 animate-spin text-muted shrink-0" />}
        </div>
        <p className="text-xs text-muted">
          Applied to AI rewrite, import, ATS tailoring and cover-letter requests for this account.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tight text-white">Settings</h1>
        <p className="text-sm text-muted mt-1">Your account, AI provider, MCP access and local backups.</p>
      </div>

      <section className="p-5 rounded-md border-[3px] border-neo-border bg-surface space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
          <Server className="w-4 h-4 text-brand-light" /> Server & account
        </h2>
        {healthError && <p className="text-sm text-red-400">Can't reach the self-hosted server.</p>}
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">Server</dt>
            <dd className="text-emerald-400 font-mono">{health ? `running · v${health.version}` : 'checking…'}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">Signed in as</dt>
            <dd className="text-white font-mono truncate" title={user?.email}>{user?.email}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">AI features</dt>
            <dd className={`font-mono ${settings?.ai_configured ? 'text-emerald-400' : 'text-amber-400'}`}>
              {settingsLoading ? 'checking…' : aiStatus}
            </dd>
          </div>
        </dl>
      </section>

      <section className="p-5 rounded-md border-[3px] border-neo-border bg-surface space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
            <KeyRound className="w-4 h-4 text-brand-light" /> Anthropic API key
          </h2>
          <p className="text-sm text-muted mt-2">
            Add your own key to enable AI rewrites, CV imports, ATS tailoring and cover letters for this account.
          </p>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-md border-2 border-neo-border bg-black/20">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
          <div className="text-xs text-muted">
            <div className="font-bold text-white">{keySource}</div>
            <p className="mt-1">Your key is validated with Anthropic, encrypted before it is written to disk, and is never returned to the browser after saving.</p>
          </div>
        </div>

        <form onSubmit={saveKey} className="space-y-2">
          <label htmlFor="anthropic-api-key" className="text-[10px] font-bold uppercase tracking-wider text-subtle block">
            {settings?.ai_source === 'user' ? 'Replace saved key' : 'API key'}
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                id="anthropic-api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-ant-…"
                autoComplete="off"
                spellCheck={false}
                className="neo-input w-full px-3 py-2.5 pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-white"
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              type="submit"
              disabled={savingKey || !apiKey.trim()}
              className="neo-btn neo-btn-primary px-4 py-2.5 text-xs inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {savingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Validate & save
            </button>
          </div>
          <div>
            <label htmlFor="anthropic-workspace-id" className="text-[10px] font-bold uppercase tracking-wider text-subtle block">
              Workspace ID <span className="text-subtle/70 font-medium normal-case">(only for workspace-scoped keys)</span>
            </label>
            <input
              id="anthropic-workspace-id"
              type="text"
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
              placeholder="wrk_…"
              autoComplete="off"
              spellCheck={false}
              className="neo-input w-full px-3 py-2.5 font-mono text-sm"
            />
          </div>
          <p className="text-xs text-muted">
            Keys starting with <code className="text-brand-light">sk-ant-api03…</code> belong to a workspace and must be paired with its
            workspace ID (<code className="text-brand-light">wrk_…</code>). Standard <code className="text-brand-light">sk-ant-api02…</code> keys don't need it.
          </p>
          {keyError && <p role="alert" className="text-xs text-red-400">{keyError}</p>}
        </form>

        {modelPicker}

        {settings?.ai_source === 'user' && (
          <button
            type="button"
            onClick={removeKey}
            disabled={removingKey}
            className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-red-300 hover:text-red-200 disabled:opacity-50"
          >
            {removingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Remove saved key
          </button>
        )}
      </section>

      <section className="p-5 rounded-md border-[3px] border-neo-border bg-surface space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
              <Bot className="w-4 h-4 text-brand-light" /> MCP — let AI improve your CVs
            </h2>
            <p className="text-sm text-muted mt-2">
              Connect Claude Code or another Streamable HTTP MCP client. The token limits every tool call to CVs owned by this account.
            </p>
          </div>
          <button
            type="button"
            onClick={rotateToken}
            disabled={rotatingToken || settingsLoading}
            className="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted hover:text-brand-light disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rotatingToken ? 'animate-spin' : ''}`} /> Rotate token
          </button>
        </div>

        {settingsLoading || !settings?.mcp_token ? (
          <div className="text-xs text-muted inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading MCP credentials…</div>
        ) : (
          <>
            <CopyBlock label="Claude Code — one command" text={claudeCodeCmd} secret />
            <CopyBlock label="Remote HTTP MCP client configuration" text={clientConfig} secret />
          </>
        )}

        <div>
          <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-subtle mb-2">
            <TerminalSquare className="w-3.5 h-3.5" /> Available tools
          </h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            {MCP_TOOLS.map(([name, description]) => (
              <li key={name} className="text-xs text-muted">
                <code className="text-brand-light">{name}</code> — {description}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-amber-200/80 flex items-start gap-2">
          <UserRound className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          Treat the MCP token like a password: it grants read/write access to this account's CVs. Rotate it immediately if it is exposed.
        </p>
      </section>

      <section className="p-5 rounded-md border-[3px] border-neo-border bg-surface space-y-3">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
          <Database className="w-4 h-4 text-brand-light" /> Your data
        </h2>
        <p className="text-sm text-muted">
          Your account only sees its own CVs and applications. Download a scoped JSON snapshot here; server administrators can also back up the complete data directory.
        </p>
        <button
          type="button"
          onClick={downloadBackup}
          disabled={downloadingBackup}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border-[3px] border-brand bg-brand/10 text-brand-light text-xs font-bold uppercase tracking-wider shadow-[3px_3px_0_#000] hover:bg-brand/20 transition-colors"
        >
          {downloadingBackup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download my backup (.json)
        </button>
      </section>
    </div>
  );
}
