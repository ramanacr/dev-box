import { render } from 'preact';
import { App } from './app/App';
import './app/styles/global.css';
import { initTheme } from './platform/theme/theme';

initTheme();

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
