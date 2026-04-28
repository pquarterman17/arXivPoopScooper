/**
 * Auto-tag service. Pure function over (text, rules) → suggested tags.
 *
 * Given a block of text (e.g. paper title + abstract) and the auto-tag-rules
 * config, return the set of tags whose patterns match the text. Optional
 * `existing` parameter prevents suggesting tags the paper already has.
 *
 * Pattern matching is plain substring by default (case-insensitive). If a
 * rule sets `caseSensitive: true`, the patterns are matched as-is. Note
 * the legacy scraper relied on trailing spaces in patterns ("Al ") to avoid
 * "algorithm" false positives; this is preserved verbatim.
 *
 * No DOM. Safe to import in node.
 */

/**
 * @param {string} text — typically paper title + " " + abstract
 * @param {object} rulesConfig — the resolved auto-tag-rules config object
 * @param {string[]} [existing] — tags already on the paper, to skip
 * @returns {string[]} suggested tags, in the order they appear in the rules list
 */
export function autoTag(text, rulesConfig, existing = []) {
  if (typeof text !== 'string' || !text) return [];
  if (!rulesConfig || !Array.isArray(rulesConfig.rules)) return [];
  const skip = new Set(existing);
  const haystackLower = text.toLowerCase();
  const out = [];
  for (const rule of rulesConfig.rules) {
    if (!rule || !Array.isArray(rule.patterns)) continue;
    if (skip.has(rule.tag)) continue;
    const found = rule.patterns.some((p) => {
      if (typeof p !== 'string' || !p) return false;
      if (rule.caseSensitive) return text.includes(p);
      return haystackLower.includes(p.toLowerCase());
    });
    if (found) {
      out.push(rule.tag);
      skip.add(rule.tag);
    }
  }
  return out;
}

/**
 * Apply auto-tag to a paper object, returning a new object with tags merged
 * (existing tags preserved, new suggestions appended). Convenience wrapper
 * for ingest pipelines.
 */
export function applyAutoTags(paper, rulesConfig) {
  if (!paper) return paper;
  const text = `${paper.title || ''} ${paper.summary || paper.abstract || ''}`;
  const existing = Array.isArray(paper.tags) ? paper.tags : [];
  const suggested = autoTag(text, rulesConfig, existing);
  if (suggested.length === 0) return paper;
  return { ...paper, tags: [...existing, ...suggested] };
}
