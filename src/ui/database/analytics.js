/**
 * Reading Analytics dashboard (plan #8 strangler-fig migration).
 *
 * Reads stats from the SQLite DB via the legacy `SCQ.query` global and
 * renders a summary + bar charts into `#analytics-body`. Triggered by the
 * "Reading analytics" entry in the More menu (inline onclick) and dismissed
 * by the overlay close button / outside click.
 *
 * `showAnalytics` and `closeAnalytics` are shimmed onto `window` from
 * main.js for the inline onclick callers; `renderAnalyticsDashboard` is
 * module-internal.
 */

const PRIORITY_LABELS = { 0: 'Not Starred', 1: '1 Star', 2: '2 Stars', 3: '3 Stars' };

export function showAnalytics() {
  const overlay = document.getElementById('analytics-overlay');
  overlay.style.display = 'flex';
  renderAnalyticsDashboard();
}

export function closeAnalytics() {
  document.getElementById('analytics-overlay').style.display = 'none';
}

function renderAnalyticsDashboard() {
  const body = document.getElementById('analytics-body');
  try {
    const SCQ = globalThis.SCQ;
    const totalPapers = SCQ.query('SELECT COUNT(*) as c FROM papers')?.[0]?.c || 0;
    const readPapers = SCQ.query('SELECT COUNT(*) as c FROM read_status WHERE is_read = 1')?.[0]?.c || 0;
    const starredPapers = SCQ.query('SELECT COUNT(*) as c FROM read_status WHERE priority >= 1')?.[0]?.c || 0;
    const notedPapers = SCQ.query("SELECT COUNT(DISTINCT paper_id) as c FROM notes WHERE content != '' AND content IS NOT NULL")?.[0]?.c || 0;

    const addedByMonth = SCQ.query("SELECT substr(date_added, 1, 7) as month, COUNT(*) as c FROM papers WHERE date_added IS NOT NULL AND date_added != '' GROUP BY month ORDER BY month") || [];
    const allPapers = SCQ.query("SELECT tags FROM papers WHERE tags IS NOT NULL AND tags != ''") || [];
    const byGroup = SCQ.query("SELECT group_name, COUNT(*) as c FROM papers WHERE group_name IS NOT NULL AND group_name != '' GROUP BY group_name ORDER BY c DESC LIMIT 10") || [];
    const byYear = SCQ.query('SELECT year, COUNT(*) as c FROM papers WHERE year IS NOT NULL GROUP BY year ORDER BY year DESC LIMIT 15') || [];
    const byPriority = SCQ.query('SELECT priority, is_read, COUNT(*) as c FROM read_status GROUP BY priority, is_read ORDER BY priority') || [];

    const tagMap = {};
    allPapers.forEach(p => {
      try {
        const tags = JSON.parse(p.tags);
        if (Array.isArray(tags)) {
          tags.forEach(tag => { if (tag) tagMap[tag] = (tagMap[tag] || 0) + 1; });
        }
      } catch (e) { /* ignore malformed tag JSON */ }
    });
    const topTags = Object.entries(tagMap).sort((a, b) => b[1] - a[1]).slice(0, 15);

    if (totalPapers === 0) {
      body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3)"><p>No papers yet. Add papers to see analytics.</p></div>';
      return;
    }

    const readPercent = totalPapers > 0 ? Math.round((readPapers / totalPapers) * 100) : 0;
    let html = `
      <div class="analytics-summary">
        <div class="analytics-card">
          <div class="big-number">${totalPapers}</div>
          <div class="card-label">Total Papers</div>
        </div>
        <div class="analytics-card">
          <div class="big-number">${readPapers}</div>
          <div class="card-label">Read</div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${readPercent}%"></div>
          </div>
        </div>
        <div class="analytics-card">
          <div class="big-number">${starredPapers}</div>
          <div class="card-label">Starred</div>
        </div>
        <div class="analytics-card">
          <div class="big-number">${notedPapers}</div>
          <div class="card-label">With Notes</div>
        </div>
      </div>
      <div class="analytics-charts">
    `;

    html += renderBarChart('Papers Added Over Time', addedByMonth, d => d.month, d => d.c, 'var(--accent)');
    html += renderBarChart('Top Tags', topTags, t => t[0], t => t[1], 'var(--green)', { truncate: 20 });
    html += renderBarChart('Papers by Research Group', byGroup, g => g.group_name || 'Unknown', g => g.c, 'var(--orange)', { truncate: 20 });
    html += renderBarChart('Papers by Year', byYear, y => y.year || 'N/A', y => y.c, 'var(--blue)');
    html += renderPriorityChart(byPriority);

    html += '</div>';
    body.innerHTML = html;
  } catch (err) {
    console.error('Analytics error:', err);
    body.innerHTML = '<p style="color:red">Error rendering analytics: ' + err.message + '</p>';
  }
}

function renderBarChart(title, data, labelFn, valueFn, color, opts = {}) {
  if (!data || data.length === 0) return '';
  const max = Math.max(...data.map(valueFn));
  let html = `<div class="analytics-chart"><h4>${title}</h4><div class="chart-bars">`;
  data.forEach(d => {
    const value = valueFn(d);
    const width = max > 0 ? (value / max) * 100 : 0;
    const label = String(labelFn(d));
    const display = opts.truncate && label.length > opts.truncate
      ? label.substring(0, opts.truncate - 3) + '...'
      : label;
    html += `
      <div class="chart-bar-row">
        <span class="chart-label" title="${label}">${display}</span>
        <div class="chart-bar" style="width:${width}%;background:${color}"></div>
        <span class="chart-value">${value}</span>
      </div>
    `;
  });
  html += '</div></div>';
  return html;
}

function renderPriorityChart(byPriority) {
  if (!byPriority || byPriority.length === 0) return '';
  let html = '<div class="analytics-chart"><h4>Reading Progress by Priority</h4><div class="chart-bars">';
  for (let p = 0; p <= 3; p++) {
    const read = byPriority.find(d => d.priority === p && d.is_read === 1)?.c || 0;
    const unread = byPriority.find(d => d.priority === p && d.is_read === 0)?.c || 0;
    const total = read + unread;
    if (total > 0) {
      const pct = Math.round((read / total) * 100);
      html += `
        <div class="chart-bar-row">
          <span class="chart-label">${PRIORITY_LABELS[p]}</span>
          <div class="chart-bar" style="width:${pct}%;background:var(--green)"></div>
          <span class="chart-value">${read}/${total}</span>
        </div>
      `;
    }
  }
  html += '</div></div>';
  return html;
}
