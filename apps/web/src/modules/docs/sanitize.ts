// Restrictive HTML sanitizer for documentation snippets and bodies
const ALLOWED_BODY_TAGS = new Set([
  'p', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'strong', 'em', 'b', 'i', 'span', 'blockquote', 'hr', 'br', 'a'
]);

export function sanitizeHtml(dirtyHtml: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(dirtyHtml, 'text/html');

  function cleanNode(node: Node) {
    const toRemove: Node[] = [];
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (!child) continue;

      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tagName = el.tagName.toLowerCase();

        if (!ALLOWED_BODY_TAGS.has(tagName)) {
          toRemove.push(child);
          continue;
        }

        // Strip all attributes except href for <a>
        const attrs = Array.from(el.attributes);
        for (const attr of attrs) {
          if (tagName === 'a' && attr.name === 'href') {
            const href = attr.value.trim();
            // Disallow javascript: URLs
            if (href.toLowerCase().startsWith('javascript:')) {
              el.removeAttribute('href');
            } else {
              el.setAttribute('target', '_blank');
              el.setAttribute('rel', 'noopener noreferrer');
            }
          } else {
            el.removeAttribute(attr.name);
          }
        }

        cleanNode(child);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        toRemove.push(child);
      }
    }

    for (const rem of toRemove) {
      node.removeChild(rem);
    }
  }

  cleanNode(doc.body);
  return doc.body.innerHTML;
}

export function sanitizeSnippet(snippet: string): string {
  // Only allow <mark> and </mark>
  const escaped = snippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/&lt;mark&gt;/g, '<mark>')
    .replace(/&lt;\/mark&gt;/g, '</mark>');
}
