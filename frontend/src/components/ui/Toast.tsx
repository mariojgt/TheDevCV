import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { CheckCircle, AlertTriangle, Info, X, AlertCircle } from 'lucide-react';

type ToastVariant = 'success' | 'error' | 'warning' | 'info';

interface Toast { id: string; message: string; variant: ToastVariant; }

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });
export function useToast() { return useContext(ToastContext); }

const icons: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle className="w-4 h-4 text-brand-light shrink-0" />,
  error:   <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-accent shrink-0" />,
  info:    <Info className="w-4 h-4 text-muted shrink-0" />,
};

const variantClasses: Record<ToastVariant, string> = {
  success: 'border-[var(--color-brand)] bg-[var(--color-brand)]/5',
  error:   'border-red-500 bg-red-500/5',
  warning: 'border-[var(--color-accent)] bg-[var(--color-accent)]/5',
  info:    'border-[var(--color-neo-border)] bg-[var(--color-surface)]',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-md border-[3px] shadow-md animate-slide-in ${variantClasses[toast.variant]}`}>
      {icons[toast.variant]}
      <span className="text-sm font-medium flex-1 text-white">{toast.message}</span>
      <button onClick={() => onDismiss(toast.id)} className="text-muted hover:text-white transition-colors ml-1">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(p => [...p, { id, message, variant }]);
  }, []);
  const dismiss = useCallback((id: string) => setToasts(p => p.filter(t => t.id !== id)), []);

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-70 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
