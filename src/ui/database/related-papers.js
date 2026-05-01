/**
 * Related-papers detection (plan #8 strangler-fig migration).
 *
 * Finds papers in the legacy `PAPERS` global that share manual links,
 * authors, tags, or research group with a given paper. Each result is
 * annotated with the reasons it was matched, and manual links sort
 * first.
 *
 * Pure logic over the legacy state — `PAPERS` is read from globalThis
 * because it's still a `let` in the legacy boot block (mirrored onto
 * window from the same block). `SCQ.getLinkedPapers` is the persisted
 * manual-link source of truth.
 */

export function getRelatedPapers(paper) {
  const SCQ = globalThis.SCQ;
  const PAPERS = globalThis.PAPERS || [];
  const myLinks = SCQ.getLinkedPapers(paper.id).map(l => l.id);
  const myAuthors = paper.authors.split(',').map(a => a.trim().split(' ').pop().toLowerCase());
  const myTags = new Set(paper.tags.map(t => t.toLowerCase()));

  const related = [];
  PAPERS.forEach(p => {
    if (p.id === paper.id) return;
    const reasons = [];
    if (myLinks.includes(p.id)) reasons.push('linked manually');
    const theirAuthors = p.authors.split(',').map(a => a.trim().split(' ').pop().toLowerCase());
    const shared = myAuthors.filter(a => theirAuthors.includes(a));
    if (shared.length >= 2) reasons.push('shared authors: ' + shared.slice(0, 3).join(', '));
    const theirTags = new Set(p.tags.map(t => t.toLowerCase()));
    const sharedTags = [...myTags].filter(t => theirTags.has(t));
    if (sharedTags.length >= 2) reasons.push('tags: ' + sharedTags.slice(0, 3).join(', '));
    if (p.group === paper.group) reasons.push('same group');
    if (reasons.length > 0) related.push({ paper: p, reasons });
  });

  related.sort((a, b) => {
    const aManual = a.reasons[0] === 'linked manually' ? 1 : 0;
    const bManual = b.reasons[0] === 'linked manually' ? 1 : 0;
    return bManual - aManual;
  });
  return related;
}
