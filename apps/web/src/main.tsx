import { render } from 'preact';
import { App } from './app/App';
import './app/styles/global.css';

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
