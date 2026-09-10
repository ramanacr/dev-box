export interface CodeImageOptions {
  code: string;
  language?: string;
  theme?: 'dark' | 'dracula' | 'nord' | 'monokai';
  background?: 'gradient-purple' | 'gradient-blue' | 'solid-dark' | 'transparent';
  lineNumbers?: boolean;
  padding?: number;
  format: 'png' | 'svg';
}

const MAX_CODE_BYTES = 200 * 1024; // 200 KB limit

const THEMES = {
  dark: {
    bg: '#1e1e2e',
    text: '#cdd6f4',
    chrome: '#181825',
    border: '#313244',
    lineNum: '#6c7086',
    comment: '#6c7086',
    keyword: '#cba6f7',
    string: '#a6e3a1',
    number: '#fab387',
  },
  dracula: {
    bg: '#282a36',
    text: '#f8f8f2',
    chrome: '#21222c',
    border: '#44475a',
    lineNum: '#6272a4',
    comment: '#6272a4',
    keyword: '#ff79c6',
    string: '#f1fa8c',
    number: '#bd93f9',
  },
  nord: {
    bg: '#2e3440',
    text: '#eceff4',
    chrome: '#242933',
    border: '#4c566a',
    lineNum: '#4c566a',
    comment: '#616e88',
    keyword: '#81a1c1',
    string: '#a3be8c',
    number: '#b48ead',
  },
  monokai: {
    bg: '#272822',
    text: '#f8f8f2',
    chrome: '#1e1f1c',
    border: '#3e3d32',
    lineNum: '#75715e',
    comment: '#75715e',
    keyword: '#f92672',
    string: '#e6db74',
    number: '#ae81ff',
  },
};

const BACKGROUNDS = {
  'gradient-purple': 'linear-gradient(135deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
  'gradient-blue': 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 50%, #6366f1 100%)',
  'solid-dark': '#0f172a',
  'transparent': 'none',
};

export async function renderCodeImage(options: CodeImageOptions): Promise<Blob> {
  const byteSize = new TextEncoder().encode(options.code).length;
  if (byteSize > MAX_CODE_BYTES) {
    throw new Error(`Code size (${(byteSize / 1024).toFixed(1)} KB) exceeds the 200 KB limit.`);
  }

  const themeKey = options.theme || 'dark';
  const theme = THEMES[themeKey] || THEMES.dark;
  const padding = options.padding ?? 32;
  const showLineNumbers = options.lineNumbers ?? true;
  const bgType = options.background || 'gradient-purple';

  // Normalize line endings and expand tabs to 2 spaces to preserve code formatting
  const rawLines = options.code.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines = rawLines.map((l) => l.replace(/\t/g, '  '));
  const longestLineLength = Math.max(...lines.map((l) => l.length), 30);

  const charWidth = 8.5;
  const lineHeight = 22;
  const lineNumWidth = showLineNumbers ? 40 : 0;
  const cardPadding = 20;

  const cardWidth = Math.max(480, longestLineLength * charWidth + lineNumWidth + cardPadding * 2 + 30);
  const cardHeight = Math.max(120, lines.length * lineHeight + 40 + cardPadding * 2);

  const svgWidth = cardWidth + padding * 2;
  const svgHeight = cardHeight + padding * 2;

  // Escape XML characters safely
  function escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // Build SVG XML with xml:space="preserve" to retain all indentation and spaces
  let textSpans = '';
  lines.forEach((line, index) => {
    const y = index * lineHeight + 20;
    const escaped = escapeXml(line);

    let lineContent = '';
    if (showLineNumbers) {
      lineContent += `<tspan fill="${theme.lineNum}" x="24" text-anchor="end">${index + 1}</tspan>`;
      lineContent += `<tspan fill="${theme.text}" x="42">${escaped}</tspan>`;
    } else {
      lineContent += `<tspan fill="${theme.text}" x="24">${escaped}</tspan>`;
    }

    textSpans += `<text y="${y}" xml:space="preserve" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="13">${lineContent}</text>\n`;
  });

  const bgGradientDef = bgType === 'gradient-purple'
    ? `<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
         <stop offset="0%" stop-color="#6366f1" />
         <stop offset="50%" stop-color="#a855f7" />
         <stop offset="100%" stop-color="#ec4899" />
       </linearGradient>`
    : bgType === 'gradient-blue'
    ? `<linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
         <stop offset="0%" stop-color="#0ea5e9" />
         <stop offset="50%" stop-color="#3b82f6" />
         <stop offset="100%" stop-color="#6366f1" />
       </linearGradient>`
    : '';

  const bgRectFill = bgType.startsWith('gradient')
    ? 'url(#bg)'
    : bgType === 'transparent'
    ? 'none'
    : BACKGROUNDS['solid-dark'];

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <defs>
    ${bgGradientDef}
    <filter id="shadow" x="-5%" y="-5%" width="115%" height="115%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#000000" flood-opacity="0.45" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="${bgRectFill}" />

  <!-- Code Card -->
  <g transform="translate(${padding}, ${padding})" filter="url(#shadow)">
    <!-- Card Background -->
    <rect width="${cardWidth}" height="${cardHeight}" rx="10" fill="${theme.bg}" stroke="${theme.border}" stroke-width="1" />

    <!-- Window Chrome Header -->
    <rect width="${cardWidth}" height="32" rx="10" fill="${theme.chrome}" />
    <rect y="22" width="${cardWidth}" height="10" fill="${theme.chrome}" />

    <!-- macOS Traffic Light Dots -->
    <circle cx="16" cy="16" r="5" fill="#ff5f56" />
    <circle cx="32" cy="16" r="5" fill="#ffbd2e" />
    <circle cx="48" cy="16" r="5" fill="#27c93f" />

    <!-- Code Content -->
    <g transform="translate(${cardPadding}, 44)">
      ${textSpans}
    </g>
  </g>
</svg>`;

  if (options.format === 'svg') {
    return new Blob([svg], { type: 'image/svg+xml' });
  }

  // Rasterize to PNG
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = svgWidth;
    canvas.height = svgHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas 2D context unavailable'));
      return;
    }

    const img = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) {
          reject(new Error('Failed to generate PNG blob from canvas'));
          return;
        }
        resolve(pngBlob);
      }, 'image/png');
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG for rasterization'));
    };

    img.src = url;
  });
}
