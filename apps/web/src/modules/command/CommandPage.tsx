import { useMemo, useState } from 'preact/hooks';
import { explainCommand, MAX_INPUT_LENGTH, type ExplainedPart, type PartRole } from './explain';
import { KNOWN_COMMAND_NAMES } from './commandIndex';

const EXAMPLES = [
  'ls -lah /var/log',
  'grep -rn --include="*.ts" "TODO" src',
  'git commit -am "fix: handle empty input"',
  'git push --force-with-lease origin main',
  'docker run -d --rm -p 127.0.0.1:8080:8080 --name toolbox developer-toolbox:dev',
  'find . -name "*.tmp" -mtime +7 -delete',
  'curl -sS -H "Accept: application/json" http://127.0.0.1:8080/healthz | jq .',
  'tar -czvf backup.tar.gz -C /srv data',
  'NODE_ENV=production node server.js > app.log 2>&1',
];

const ROLE_LABELS: Record<PartRole, string> = {
  command: 'command',
  subcommand: 'subcommand',
  option: 'option',
  'option-value': 'value',
  operand: 'argument',
  operator: 'operator',
  redirection: 'redirection',
  assignment: 'variable',
  comment: 'comment',
  unknown: 'unrecognised',
};

export function CommandPage() {
  const [input, setInput] = useState('git push --force-with-lease origin main');
  const [showIndex, setShowIndex] = useState(false);

  const explanation = useMemo(() => explainCommand(input), [input]);

  const hasParts = explanation.segments.some((s) => s.parts.length > 0);

  return (
    <div className="stack-lg">
      <div>
        <h2>Command Reference</h2>
        <p className="muted">
          Paste a shell command to see what each part does, with warnings for
          destructive or protection-disabling flags. Nothing is executed and no shell
          is invoked — this is static analysis of the text you paste, entirely in your
          browser.
        </p>
      </div>

      <div className="card">
        <label className="field">
          <span className="field-label">Command</span>
          <textarea
            className="input code-input"
            rows={3}
            spellcheck={false}
            aria-label="Shell command to explain"
            value={input}
            maxLength={MAX_INPUT_LENGTH}
            onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
          />
        </label>

        <div className="example-row">
          <span className="field-label">Try:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="chip"
              onClick={() => setInput(example)}
              title={example}
            >
              {example.split(' ').slice(0, 2).join(' ')}
            </button>
          ))}
        </div>
      </div>

      {explanation.warnings.length > 0 && (
        <div className="stack" role="alert">
          {explanation.warnings.map((warning) => (
            <div
              key={warning.title}
              className={warning.severity === 'danger' ? 'alert alert-danger' : 'alert alert-warning'}
            >
              <strong>{warning.severity === 'danger' ? '⚠ ' : '• '}{warning.title}</strong>
              <div className="small">{warning.detail}</div>
            </div>
          ))}
        </div>
      )}

      {!hasParts ? (
        <div className="card">
          <p className="muted small">Enter a command above to see an explanation.</p>
        </div>
      ) : (
        <div className="stack">
          {explanation.segments.map((seg, segIndex) => (
            <div key={segIndex} className="card">
              {seg.connector && (
                <div className="connector-note">
                  <code>{seg.connector === '\n' ? '↵' : seg.connector}</code>
                  <span className="small muted">{seg.connectorDescription}</span>
                </div>
              )}

              {seg.commandName && (
                <h3 className="card-title">
                  {seg.commandName}
                  {seg.recognised ? (
                    <span className="badge badge-ok">in reference</span>
                  ) : (
                    <span className="badge badge-warn">not in reference</span>
                  )}
                </h3>
              )}
              {seg.summary && <p className="muted small">{seg.summary}</p>}

              <dl className="explain-list">
                {seg.parts.map((part, partIndex) => (
                  <PartRow key={`${partIndex}-${part.text}`} part={part} />
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <button
          type="button"
          className="btn"
          aria-expanded={showIndex}
          onClick={() => setShowIndex(!showIndex)}
        >
          {showIndex ? 'Hide' : 'Show'} covered commands ({KNOWN_COMMAND_NAMES.length})
        </button>
        {showIndex && (
          <>
            <p className="muted small index-note">
              Coverage is a curated set of high-frequency developer commands. Every
              description is written for this product — no manual pages are
              redistributed, because their licences differ from this software&rsquo;s.
              An unknown command is reported as unknown rather than guessed at.
            </p>
            <ul className="command-index">
              {KNOWN_COMMAND_NAMES.map((name) => (
                <li key={name}>
                  <button type="button" className="chip" onClick={() => setInput(`${name} `)}>
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function PartRow({ part }: { part: ExplainedPart }) {
  return (
    <div className={`explain-row explain-${part.role}`}>
      <dt>
        <code>{part.text}</code>
        <span className="role-tag">{ROLE_LABELS[part.role]}</span>
      </dt>
      <dd>
        {part.label !== part.text && <strong className="part-label">{part.label}</strong>}
        <span>{part.description}</span>
      </dd>
    </div>
  );
}
