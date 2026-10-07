import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import { loadMythosData } from './services/mythosData.ts';

async function bootstrap() {
  // Always dismiss loader within 1500ms at most
  const dismissLoader = () => {
    const loader = document.getElementById('init-loader');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.remove(), 400);
    }
  };

  try {
    // 1. Non-blocking load of narrative data with 1.2s timeout
    await Promise.race([
      loadMythosData(),
      new Promise(resolve => setTimeout(resolve, 1200))
    ]).catch(err => {
      console.warn("Non-fatal narrative data preload timeout/failure:", err);
    });

    // 2. Locate mount point
    const rootElement = document.getElementById('root');
    if (!rootElement) {
      throw new Error("Could not find root element to mount to");
    }

    // 3. Initialize React
    const root = createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );

    // 4. Remove boot-time loader
    dismissLoader();

  } catch (error) {
    console.error("Bootstrap Failure:", error);
    dismissLoader();
  }
}

// Start sequence
bootstrap();