import { redactSensitiveText, type RedactionResult } from '@/platform/security/redaction';

export interface SafeDownloadPrompt {
  redaction: RedactionResult;
  onConfirmRedacted: () => void;
  onConfirmOriginal: () => void;
  onCancel: () => void;
}

export function triggerDownload(filename: string, content: string, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function safeDownloadText(
  filename: string,
  content: string,
  onPromptUser: (prompt: SafeDownloadPrompt) => void
) {
  const redaction = redactSensitiveText(content);

  // If no secrets detected, download immediately
  if (!redaction.hasSecrets) {
    triggerDownload(filename, content);
    return;
  }

  // Secrets detected: request user confirmation
  onPromptUser({
    redaction,
    onConfirmRedacted: () => {
      triggerDownload(`redacted-${filename}`, redaction.redactedText);
    },
    onConfirmOriginal: () => {
      triggerDownload(filename, content);
    },
    onCancel: () => {
      // User aborted
    },
  });
}
