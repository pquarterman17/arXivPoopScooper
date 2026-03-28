#!/usr/bin/env node
/**
 * search_recent.js — Search arXiv for recent papers in configured categories
 *
 * Usage:  node search_recent.js [--days N] [--max N]
 *
 * Searches arXiv for papers submitted in the last N days (default: 3)
 * across quantum physics and condensed matter categories relevant to SCQ.
 * Skips papers already in the inbox/ or papers/ directories.
 *
 * Outputs a JSON array of {arxiv_id, title, authors, categories} to stdout.
 *
 * Designed to run on the host machine via Desktop Commander.
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE_DIR = path.resolve(__dirname, "..");
const PAPERS_DIR = path.join(BASE_DIR, "papers");
const INBOX_DIR = path.join(BASE_DIR, "inbox");

// ── Categories to search ──────────────────────────────────────────
// quant-ph: quantum physics (primary)
// cond-mat.supr-con: superconductivity
// cond-mat.mtrl-sci: materials science
// cond-mat.mes-hall: mesoscale and nanoscale physics
const CATEGORIES = [
  "quant-ph",
  "cond-mat.supr-con",
  "cond-mat.mtrl-sci",
  "cond-mat.mes-hall",
];

// ── Keywords for relevance filtering ──────────────────────────────
// Papers must match at least one keyword in title or abstract.
// This keeps the results focused on SCQ-relevant work.
const KEYWORDS = [
  "superconducting qubit",
  "transmon",
  "resonator",
  "Josephson junction",
  "tantalum",
  "niobium",
  "aluminum",
  "surface loss",
  "two-level system",
  "TLS",
  "coherence time",
  "T1",
  "T2",
  "quality factor",
  "microwave",
  "coplanar waveguide",
  "kinetic inductance",
  "quasiparticle",
  "decoherence",
  "quantum processor",
  "quantum circuit",
  "superconducting circuit",
  "cryogenic",
  "dilution refrigerator",
  "surface oxide",
  "sapphire substrate",
  "silicon substrate",
  "thin film",
  "sputtering",
  "evaporation",
  "lithography",
  "qubit",
  "quantum computing",
  "quantum error correction",
  "surface code",
  "readout",
  "dispersive readout",
  "parametric amplifier",
  "TWPA",
  "JPA",
  "Purcell",
  "fluxonium",
  "quantum memory",
  "bosonic code",
  "quantum noise",
];

// ── Helpers ───────────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, { timeout: 30000 }, (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          return httpsGet(res.headers.location).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function parseXmlTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  const matches = [];
  let m;
  while ((m = re.exec(xml))) matches.push(m[1].trim());
  return matches;
}

function parseAuthors(entryXml) {
  const authorBlocks = parseXmlTag(entryXml, "author");
  return authorBlocks.map((block) => {
    const names = parseXmlTag(block, "name");
    return names[0] || "Unknown";
  });
}

function parseCategories(entryXml) {
  const cats = [];
  const re = /<category[^>]*term="([^"]+)"/g;
  let m;
  while ((m = re.exec(entryXml))) cats.push(m[1]);
  return cats;
}

function extractArxivId(idUrl) {
  // arXiv API returns full URL like http://arxiv.org/abs/2603.12345v1
  const match = idUrl.match(/(\d{4}\.\d{4,5})(v\d+)?$/);
  return match ? match[1] : idUrl;
}

function matchesKeywords(title, abstract) {
  const text = (title + " " + abstract).toLowerCase();
  return KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
}

function getExistingIds() {
  const ids = new Set();
  // Check inbox for _meta.json files
  if (fs.existsSync(INBOX_DIR)) {
    for (const f of fs.readdirSync(INBOX_DIR)) {
      const m = f.match(/^(.+)_meta\.json$/);
      if (m) ids.add(m[1]);
    }
  }
  // Check papers directory for PDFs
  if (fs.existsSync(PAPERS_DIR)) {
    for (const f of fs.readdirSync(PAPERS_DIR)) {
      const m = f.match(/^(\d{4}\.\d{4,5})/);
      if (m) ids.add(m[1]);
    }
  }
  return ids;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  // Parse args
  let days = 3;
  let maxResults = 50;

  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === "--days" && process.argv[i + 1]) {
      days = parseInt(process.argv[i + 1], 10);
      i++;
    }
    if (process.argv[i] === "--max" && process.argv[i + 1]) {
      maxResults = parseInt(process.argv[i + 1], 10);
      i++;
    }
  }

  const existingIds = getExistingIds();
  console.error(
    `[search_recent] Searching last ${days} days, max ${maxResults} per category`
  );
  console.error(
    `[search_recent] ${existingIds.size} papers already in database`
  );
  console.error(`[search_recent] Categories: ${CATEGORIES.join(", ")}`);

  const allPapers = new Map(); // arxiv_id -> paper info

  for (const cat of CATEGORIES) {
    console.error(`\n[search_recent] Querying category: ${cat}`);

    const query = `cat:${cat}`;
    const url = `https://arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&start=0&max_results=${maxResults}`;

    try {
      const xmlBuf = await httpsGet(url);
      const xml = xmlBuf.toString("utf8");
      const entries = parseXmlTag(xml, "entry");

      console.error(`  Found ${entries.length} entries`);

      let matched = 0;
      for (const entry of entries) {
        const idUrl = parseXmlTag(entry, "id")[0] || "";
        const arxivId = extractArxivId(idUrl);
        if (!arxivId || existingIds.has(arxivId) || allPapers.has(arxivId))
          continue;

        const title = (parseXmlTag(entry, "title")[0] || "").replace(
          /\s+/g,
          " "
        );
        const abstract = (parseXmlTag(entry, "summary")[0] || "").replace(
          /\s+/g,
          " "
        );
        const published = (
          parseXmlTag(entry, "published")[0] || ""
        ).substring(0, 10);
        const authors = parseAuthors(entry);
        const categories = parseCategories(entry);

        // Check date cutoff
        if (published) {
          const pubDate = new Date(published);
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          if (pubDate < cutoff) continue;
        }

        // Check keyword relevance
        if (!matchesKeywords(title, abstract)) continue;

        allPapers.set(arxivId, {
          arxiv_id: arxivId,
          title,
          authors: authors.slice(0, 3).join(", ") + (authors.length > 3 ? " et al." : ""),
          published,
          categories,
          category_searched: cat,
        });
        matched++;
      }

      console.error(`  ${matched} new relevant papers found`);
    } catch (err) {
      console.error(`  ERROR querying ${cat}: ${err.message}`);
    }

    // Rate limiting between queries
    await sleep(1500);
  }

  // Output results as JSON to stdout
  const results = Array.from(allPapers.values());
  console.error(
    `\n[search_recent] Total: ${results.length} new papers to fetch`
  );
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
