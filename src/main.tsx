import ReactDOM from 'react-dom/client';
import './styles.css';

// Use ?legacy in URL to switch to old particle field
const useLegacy = window.location.search.includes('legacy');

const loadApp = async () => {
  if (useLegacy) {
    const { default: App } = await import('./App');
    return <App />;
  } else {
    const { default: FingertipStreamApp } = await import('./FingertipStreamApp');
    return <FingertipStreamApp />;
  }
};

loadApp().then((app) => {
  ReactDOM.createRoot(document.getElementById('root')!).render(app);
});
