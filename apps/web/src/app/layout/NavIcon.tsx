/**
 * Navigation icons.
 *
 * Drawn inline rather than pulled from an icon package: the application ships
 * offline and the Content Security Policy in ADR 0006 refuses remote fetches, so
 * an icon font or a CDN sprite is not an option, and bundling a full icon library
 * to use twenty glyphs would cost more than it returns against the 250 KB initial
 * JS budget.
 *
 * Every glyph shares one geometry - a 24x24 viewBox, no fill, 1.75 stroke on
 * currentColor with round caps - so they read as one set. Each is visually
 * distinct: an icon that has to be told apart from its neighbour by colour alone
 * is no faster to scan than the label it sits beside.
 *
 * The icon is decorative. Every navigation entry carries its text label, and the
 * label remains the accessible name even when the sidebar is collapsed to icons,
 * so these are hidden from assistive technology.
 */

export type NavIconName =
  | 'overview'
  | 'docs'
  | 'data'
  | 'command'
  | 'regex'
  | 'text'
  | 'query'
  | 'types'
  | 'jwt'
  | 'diff'
  | 'sql'
  | 'cron'
  | 'encode'
  | 'codeImage'
  | 'api'
  | 'diagrams'
  | 'git'
  | 'algorithms'
  | 'team'
  | 'admin';

/** Path geometry per icon, in a 24x24 viewBox. */
const GLYPHS: Record<NavIconName, string> = {
  // Four panes: the dashboard of every tool.
  overview:
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  // Open book.
  docs: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>',
  // Database cylinder.
  data: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.66 3.58 3 8 3s8-1.34 8-3v-13"/><path d="M20 12c0 1.66-3.58 3-8 3s-8-1.34-8-3"/>',
  // Shell prompt.
  command: '<polyline points="5 8 9 12 5 16"/><line x1="12" y1="16" x2="19" y2="16"/>',
  // Asterisk, the quantifier everyone recognises.
  regex:
    '<line x1="12" y1="4" x2="12" y2="20"/><line x1="5.1" y1="8" x2="18.9" y2="16"/><line x1="18.9" y1="8" x2="5.1" y2="16"/>',
  // Hash.
  text: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  // Funnel: a query narrows a document.
  query: '<path d="M3 4h18l-7 8.2V19l-4 2v-8.8L3 4Z"/>',
  // Serif T.
  types:
    '<polyline points="4 7 4 4 20 4 20 7"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="9" y1="20" x2="15" y2="20"/>',
  // Key.
  jwt: '<circle cx="8" cy="16" r="4"/><line x1="10.9" y1="13.1" x2="20" y2="4"/><line x1="16.5" y1="7.5" x2="19.5" y2="10.5"/>',
  // Split pane: two documents side by side.
  diff: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/>',
  // Result grid.
  sql: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="9" x2="9" y2="21"/>',
  // Clock.
  cron: '<circle cx="12" cy="12" r="9"/><polyline points="12 6.5 12 12 15.5 14"/>',
  // Two-way exchange: encode one way, decode the other.
  encode:
    '<polyline points="15 3 20 8 15 13"/><line x1="20" y1="8" x2="5" y2="8"/><polyline points="9 11 4 16 9 21"/><line x1="4" y1="16" x2="19" y2="16"/>',
  // Picture frame.
  codeImage:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  // Paper plane: sending a request.
  api: '<line x1="21" y1="3" x2="10.5" y2="13.5"/><polygon points="21 3 14.5 21 10.5 13.5 3 9.5 21 3"/>',
  // Connected nodes.
  diagrams:
    '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><line x1="8.3" y1="13.3" x2="15.7" y2="17.7"/><line x1="15.7" y1="6.3" x2="8.3" y2="10.7"/>',
  // Branch.
  git: '<line x1="6" y1="4" x2="6" y2="15"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M18 8.5a9 9 0 0 1-9 9"/>',
  // Binary tree.
  algorithms:
    '<circle cx="12" cy="5" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/><line x1="10.8" y1="6.9" x2="7.2" y2="16.1"/><line x1="13.2" y1="6.9" x2="16.8" y2="16.1"/>',
  // Two people.
  team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3.5"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.5a4 4 0 0 1 0 7.5"/>',
  // Shield.
  admin: '<path d="M12 22s8-4 8-10V5.5L12 2.5 4 5.5V12c0 6 8 10 8 10Z"/>',
};

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      className="nav-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      // The glyphs are a fixed internal table, never user or network input.
      dangerouslySetInnerHTML={{ __html: GLYPHS[name] }}
    />
  );
}
