import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { CustodyDB } from './db';
import { ErrorBoundary } from './components/ErrorBoundary';

// Initialize remote Firebase database synchronization safely
try {
  CustodyDB.initializeFirebase();
} catch (err) {
  console.error('Failed to initialize Firebase sync:', err);
}

try {
  CustodyDB.initializeCacheListener();
} catch (err) {
  console.error('Failed to initialize Cache Listener:', err);
}

// Register Progressive Web App Service Worker
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const registerSW = () => {
    navigator.serviceWorker.register('/sw.js')
      .then(async (reg) => {
        console.log('PWA Service Worker registered successfully:', reg.scope);
        
        // Request Background Sync registration
        if ('sync' in reg) {
          try {
            await (reg as any).sync.register('sync-custody-data');
            console.log('Background Sync registered successfully: sync-custody-data');
          } catch (err) {
            console.warn('Background Sync registration failed:', err);
          }
        }

        // Request Periodic Background Sync registration
        if ('periodicSync' in reg) {
          try {
            const status = await (navigator as any).permissions.query({
              name: 'periodic-background-sync'
            });
            if (status.state === 'granted') {
              await (reg as any).periodicSync.register('periodic-custody-check', {
                minInterval: 24 * 60 * 60 * 1000, // Once a day
              });
              console.log('Periodic Background Sync registered successfully: periodic-custody-check');
            }
          } catch (err) {
            console.warn('Periodic Background Sync registration failed:', err);
          }
        }

        // Check and ask for Push Notification permission if needed
        if ('Notification' in window && Notification.permission === 'default') {
          setTimeout(() => {
            Notification.requestPermission().then((permission) => {
              console.log('Notification permission status:', permission);
            }).catch((err) => {
              console.warn('Notification permission request failed:', err);
            });
          }, 3000);
        }
      })
      .catch((err) => {
        console.error('PWA Service Worker registration failed:', err);
      });
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    registerSW();
  } else {
    window.addEventListener('load', registerSW);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
