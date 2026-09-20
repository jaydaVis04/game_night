import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/bricolage-grotesque/latin-600.css';
import '@fontsource/bricolage-grotesque/latin-700.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import './styles.css';
import './themes.css';
import './sound.css';

const App = lazy(() => import('./App.jsx'));
const JoinPage = lazy(() => import('./components/JoinPage.jsx'));
const joinMatch = location.pathname.match(/^\/join\/([^/]+)\/?$/);

createRoot(document.getElementById('root')).render(
  <React.StrictMode><Suspense fallback={<div className="loading-page"><span className="loading-die">⚄</span><p>Setting the table…</p></div>}>
    {joinMatch ? <JoinPage code={decodeURIComponent(joinMatch[1])} /> : <App />}
  </Suspense></React.StrictMode>,
);
