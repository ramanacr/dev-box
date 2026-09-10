import { useState, useEffect } from 'preact/hooks';
import { AppLayout } from './layout/AppLayout';
import { RouterView } from './routes';

export function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AppLayout currentPath={currentPath} onNavigate={handleNavigate}>
      <RouterView currentPath={currentPath} onNavigate={handleNavigate} />
    </AppLayout>
  );
}
