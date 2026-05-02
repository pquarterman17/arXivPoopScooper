/**
 * Test-button extras for the Settings v2 schema tabs.
 *
 * Three button mounters; each appends a single button + result line to
 * the body of its tab. They POST to small server endpoints in serve.py
 * that perform a minimal real check:
 *
 *   - Verify DB Path  (Storage)  → POST /api/test/db-path
 *   - Send Test Digest (Digest)  → POST /api/test/digest
 *   - Test SMTP        (Email)   → POST /api/test/smtp
 *
 * Each endpoint returns `{ok: true, …}` on success or
 * `{ok: false, error: "..."}` on failure. The button writes the result
 * to a small status line below itself; if the action took unsaved
 * changes from the form into account, it'd need to POST those first —
 * for now the tests run against the *currently-saved* config to keep
 * the behaviour predictable.
 */

export function mountStorageExtras(body, ctx) {
  appendTestSection(body, {
    title: 'Verify DB path',
    desc: 'Check that the configured database path exists and is a valid SQLite file.',
    btnText: 'Run check',
    endpoint: '/api/test/db-path',
    successFmt: (data) =>
      `OK — ${data.path} (${formatBytes(data.size)}, ${data.papers ?? '?'} paper${data.papers === 1 ? '' : 's'})`,
  }, ctx);
}

export function mountDigestExtras(body, ctx) {
  appendTestSection(body, {
    title: 'Send test digest',
    desc: 'Generate a small digest using your saved config and email it (recipients-only, no GH Action). Useful for confirming SMTP credentials end-to-end.',
    btnText: 'Send test',
    endpoint: '/api/test/digest',
    successFmt: (data) => `OK — sent to ${data.recipients.join(', ')} (${data.papers} paper${data.papers === 1 ? '' : 's'})`,
  }, ctx);
}

export function mountEmailExtras(body, ctx) {
  appendTestSection(body, {
    title: 'Test SMTP connection',
    desc: 'Authenticate against your SMTP server using the saved credentials. Does not send any email.',
    btnText: 'Run test',
    endpoint: '/api/test/smtp',
    successFmt: (data) => `OK — connected to ${data.host}:${data.port} as ${data.from}`,
  }, ctx);
}

// ─── shared layout ───

function appendTestSection(body, opts, ctx) {
  const wrap = document.createElement('div');
  wrap.className = 'settings-v2-test-section';

  const title = document.createElement('h4');
  title.textContent = opts.title;
  title.className = 'settings-v2-test-title';
  wrap.appendChild(title);

  const desc = document.createElement('p');
  desc.className = 'settings-v2-test-desc';
  desc.textContent = opts.desc;
  wrap.appendChild(desc);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'settings-v2-test-btn';
  btn.textContent = opts.btnText;
  wrap.appendChild(btn);

  const result = document.createElement('div');
  result.className = 'settings-v2-test-result';
  wrap.appendChild(result);

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    result.textContent = 'Running…';
    result.dataset.kind = 'pending';
    try {
      const r = await fetch(opts.endpoint, { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data.ok) {
        result.textContent = opts.successFmt(data);
        result.dataset.kind = 'ok';
      } else {
        result.textContent = `Failed — ${data.error || `HTTP ${r.status}`}`;
        result.dataset.kind = 'error';
      }
    } catch (e) {
      result.textContent = `Failed — ${e.message}`;
      result.dataset.kind = 'error';
    } finally {
      btn.disabled = false;
    }
  });

  body.appendChild(wrap);
}

function formatBytes(n) {
  if (n == null) return '?';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
