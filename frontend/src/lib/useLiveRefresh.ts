import { useEffect, useRef } from 'react';

/**
 * Subscribe to the server's SSE change feed and invoke `onChange` whenever one
 * of the watched tables is modified — by this browser tab, another tab, or an
 * MCP client (e.g. Claude editing a CV). Debounced so a burst of writes (a CV
 * duplicate copies six tables) triggers a single refresh.
 */
export function useLiveRefresh(tables: string[], onChange: () => void, debounceMs = 400) {
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;
  const tablesKey = tables.join(',');

  useEffect(() => {
    const watched = new Set(tablesKey.split(','));
    let timer: ReturnType<typeof setTimeout> | undefined;

    const source = new EventSource('/api/events');
    source.addEventListener('change', (event) => {
      try {
        const { table } = JSON.parse((event as MessageEvent).data);
        if (!watched.has(table)) return;
        clearTimeout(timer);
        timer = setTimeout(() => callbackRef.current(), debounceMs);
      } catch { /* malformed frame — ignore */ }
    });

    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [tablesKey, debounceMs]);
}
