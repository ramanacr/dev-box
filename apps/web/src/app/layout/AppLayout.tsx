import { type ComponentChildren } from 'preact';
import { Navigation } from './Navigation';

interface AppLayoutProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  children: ComponentChildren;
}

export function AppLayout({ currentPath, onNavigate, children }: AppLayoutProps) {
  return (
    <div className="app-container">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Navigation currentPath={currentPath} onNavigate={onNavigate} />
      <main id="main-content" className="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
