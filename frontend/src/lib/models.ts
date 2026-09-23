/** Fallback model list, used until the server settings response arrives.
 *  The authoritative list is served by the server (`ai_models`, editable via AI_MODELS). */
export const DEFAULT_AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-opus-5', label: 'Claude Opus 5' },
  { id: 'claude-fable-5', label: 'Claude Fable 5' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
];