import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { AppProvider } from './contexts/AppContext';
import { ToastProvider } from './components/ui/Toast';
import CookieBanner from './components/CookieBanner';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppProvider>
          <ToastProvider>
            <App />
            {/* Global consent banner — renders once, tracks its own state,
                loads Microsoft Clarity only after the user opts in. */}
            <CookieBanner />
          </ToastProvider>
        </AppProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
