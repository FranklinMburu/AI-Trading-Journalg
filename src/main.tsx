import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import { AccountProvider } from './contexts/AccountContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AccountProvider>
        <App />
      </AccountProvider>
    </ErrorBoundary>
  </StrictMode>,
);
