#!/usr/bin/env node
/**
 * update-funding.mjs - refresh data/funding.json from TSN's own posts.
 *
 * No secrets, no API keys. Needs Node 18+ (built-in fetch). Reads the PUBLIC WordPress REST API
 * at https://tsnmedia.org/wp-json/wp/v2/posts and the public source links inside each post.
 *
 * Usage (run from the ai-funding-tracker/ folder):
 *   node scripts/update-funding.mjs              # scan TSN posts, write data/funding.candidates.json (review file)
 *   node scripts/update-funding.mjs --verify     # also re-fetch every source_url in funding.json and re-stamp verification
 *   node scripts/update-funding.mjs --merge      # append NEW candidates to funding.json flagged needs_review:true
 *                                                # (the page hides needs_review rows until a human clears the flag)
 *   node scripts/update-funding.mjs --since 2026-10-01   # only posts on/after this date
 *
 * Data rules (same as the page): only rounds stated in a TSN post and its cited sources; amounts/stages that
 * are not stated stay null and are shown as "undisclosed"; nothing is estimated or converted between currencies.
 * Existing hand-checked rows are never overwritten. The heuristic extractor only PROPOSES rows.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', 'data', 'funding.json');
const CANDIDATES = path.join(HERE, '..', 'data', 'funding.candidates.json');
const API = 'https://tsnmedia.org/wp-json/wp/v2/posts';
const TERMS = ['funding', 'raises', 'raised', 'Series A', 'Series B', 'Series C', 'seed round', 'pre-seed', 'valuation', 'AI Agent Money'];
const UA = 'tsn-tools-funding-updater/1.0 (+https://tsnmedia.org)';
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : null;

const decode = (s) => s.replace(/&#8217;|&rsquo;/g, '’').replace(/&#8216;/g, '‘').replace(/&#8220;|&#8221;/g, '"').replace(/&#038;|&amp;/g, '&')
  .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (html) => decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<\/(p|li|h\d|div|tr)>/gi, '\n').replace(/<[^>]+>/g, ''));
const links = (html) => [...html.matchAll(/<a [^>]*href="([^"]+)"/gi)].map((m) => m[1]).filter((u) => /^https?:/.test(u));

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function fetchPosts() {
  const seen = new Map();
  for (const term of TERMS) {
    for (let page = 1; page <= 3; page++) {
      const q = new URLSearchParams({ search: term, per_page: '100', page: String(page), _fields: 'id,link,date,title,content' });
      if (since) q.set('after', `${since}T00:00:00`);
      let batch;
      try { batch = await getJson(`${API}?${q}`); } catch (e) { if (page === 1) console.warn('! ' + e.message); break; }
      for (const p of batch) seen.set(p.id, p);
      if (batch.length < 100) break;
    }
  }
  return [...seen.values()].sort((a, b) => b.date.localeCompare(a.date));
}

const AMOUNT = /\$\s?(\d[\d,.]*)\s?(billion|bn|million|m|b)\b/i;
const STAGE = /\b(pre-seed|seed|series [a-h])\b/i;
const VERB = /\b(raises?|raised|closes?|closed|secures?|secured|lands?)\b/i;
const toUsd = (n, unit) => Math.round(parseFloat(n.replace(/,/g, '')) * (/^b/i.test(unit) ? 1e9 : 1e6));

/** Heuristic only: one candidate per sentence that has a raise verb AND a $ amount. A human must review. */
function extract(post) {
  const html = post.content.rendered;
  const text = strip(html);
  const sourcesAt = text.search(/\nSources/);
  const body = sourcesAt > 0 ? text.slice(0, sourcesAt) : text;
  const external = links(html).filter((u) => !/tsnmedia\.org|x\.com|twitter\.com/.test(u));
  const out = [];
  for (const sentence of body.split(/(?<=[.!?])\s+|\n+/)) {
    if (!VERB.test(sentence)) continue;
    const a = sentence.match(AMOUNT);
    if (!a) continue;
    const verbAt = sentence.search(VERB);
    const before = sentence.slice(0, verbAt).trim();
    const m = before.match(/([A-Z][\w.&’'-]*(?:\s+[A-Z][\w.&’'-]*){0,3})$/);
    if (!m) continue;
    const stage = (sentence.match(STAGE) || [])[1];
    out.push({
      company: m[1].replace(/^(The|On|In|And|But|Also)\s+/, ''),
      stage: stage ? stage.replace(/\b\w/g, (c) => c.toUpperCase()).replace('Pre-Seed', 'Pre-seed') : null,
      amount_usd: toUsd(a[1], a[2]),
      amount_text: a[0],
      amount_qualifier: /\b(about|around|approximately|roughly|~)\b/i.test(sentence) ? 'approx' : /\bmore than|over\b/i.test(sentence) ? 'more_than' : 'exact',
      currency: 'USD',
      date: post.date.slice(0, 10), // placeholder = TSN post date; reviewer must replace with the announcement date
      date_precision: 'day',
      investors: [],
      description: null,
      sector: null,
      status: 'unreviewed',
      source_url: external[0] || null, // placeholder: first external link in the post; reviewer must pick the real primary source
      source_name: null,
      tsn_url: post.link,
      tsn_title: decode(post.title.rendered),
      tsn_post_date: post.date.slice(0, 10),
      note: 'AUTO-EXTRACTED: ' + sentence.trim().slice(0, 240),
      needs_review: true,
    });
  }
  return out;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function verifyRow(row) {
  if (!row.source_url) return { status: 'no_source_url' };
  try {
    const r = await fetch(row.source_url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; tsn-tools-funding-updater/1.0)' }, redirect: 'follow' });
    if (!r.ok) return { status: 'unreachable', http: r.status, checked: new Date().toISOString().slice(0, 10) };
    const t = strip(await r.text()).toLowerCase();
    const needles = [];
    if (row.amount_text) needles.push(row.amount_text.replace(/^(about|more than|over|up to)\s+/i, '').toLowerCase());
    if (row.stage) needles.push(row.stage.toLowerCase());
    const matched = needles.filter((n) => t.includes(n) || norm(t).includes(norm(n)));
    return { status: matched.length === needles.length && needles.length ? 'verified' : 'partial', method: 'fetch', terms_matched: matched, checked: new Date().toISOString().slice(0, 10) };
  } catch (e) {
    return { status: 'error', error: String(e.message || e), checked: new Date().toISOString().slice(0, 10) };
  }
}

async function main() {
  const doc = JSON.parse(await readFile(DATA, 'utf8'));
  const known = new Set(doc.rows.map((r) => `${norm(r.tsn_url)}|${norm(r.company)}`));
  const knownCompanyAmount = new Set(doc.rows.map((r) => `${norm(r.company)}|${r.amount_usd}`));
  const posts = await fetchPosts();
  console.log(`Fetched ${posts.length} candidate TSN posts.`);

  const candidates = [];
  for (const p of posts) {
    for (const c of extract(p)) {
      if (c.company.length < 3 || /^(we|we’ve|ai|ipo|it|this|that|the|company)$/i.test(c.company.replace(/’s$/, ''))) continue; // noise
      const sameUrl = doc.rows.filter((r) => norm(r.tsn_url) === norm(c.tsn_url));
      if (sameUrl.some((r) => norm(r.company).includes(norm(c.company)) || norm(c.company).includes(norm(r.company)))) continue;
      if (known.has(`${norm(c.tsn_url)}|${norm(c.company)}`)) continue;
      if (knownCompanyAmount.has(`${norm(c.company)}|${c.amount_usd}`)) continue;
      c.id = `auto-${norm(c.company)}-${p.id}`;
      candidates.push(c);
    }
  }
  await writeFile(CANDIDATES, JSON.stringify({ generated: new Date().toISOString(), note: 'Heuristic proposals only. Review each: confirm it is a real funding round, set the announcement date, primary source_url, stage, investors, then move into funding.json (clear needs_review).', candidates }, null, 1));
  console.log(`Wrote ${candidates.length} unreviewed candidates -> data/funding.candidates.json`);

  if (flag('--verify')) {
    for (const row of doc.rows) {
      row.verification = { ...(row.verification || {}), ...(await verifyRow(row)) };
      console.log(`${row.verification.status.padEnd(12)} ${row.company} (${row.stage || 'undisclosed'})`);
    }
  }
  if (flag('--merge') && candidates.length) {
    doc.rows.push(...candidates);
    console.log(`Merged ${candidates.length} candidates into funding.json flagged needs_review:true (hidden on the page until reviewed).`);
  }
  doc.as_of = new Date().toISOString().slice(0, 10);
  doc.generated = new Date().toISOString();
  doc.count = doc.rows.filter((r) => !r.needs_review).length;
  await writeFile(DATA, JSON.stringify(doc, null, 1));
  console.log(`funding.json: ${doc.count} published rows, as_of ${doc.as_of}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
