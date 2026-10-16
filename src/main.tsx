import { initializeAnalytics } from './analytics/analytics.ts';
import './components/home/home.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/lab-dark.generated.css';

initializeAnalytics({ production: import.meta.env.PROD, websiteId: import.meta.env.VITE_UMAMI_WEBSITE_ID, scriptUrl: import.meta.env.VITE_UMAMI_SCRIPT_URL, domains: import.meta.env.VITE_UMAMI_DOMAINS });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
