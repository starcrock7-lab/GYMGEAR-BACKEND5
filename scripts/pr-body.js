/* Render the price-check report as a PR body.
 *
 * A separate file on purpose: inlining this in the workflow meant a node
 * template literal nested inside a shell $( ) inside a YAML block scalar, so
 * every backtick was one escaping mistake away from becoming shell command
 * substitution — and it could not be tested without pushing to CI.
 *
 *   node scripts/pr-body.js [report.json]
 */
import fs from 'node:fs';

const file = process.argv[2] || 'price-report.json';
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const changed = report.results.filter((r) => r.edit);
const unreadable = report.results.filter((r) => r.cls === 'UNREADABLE');

const out = [];
out.push('Every price below was **read from the live retailer listing**. None are inferred, estimated, or carried forward.');
out.push('');
out.push(`Run: ${report.generatedAt} · ${report.results.length} products checked · ${changed.length} changed · ${unreadable.length} unreadable`);
out.push('');

if (changed.length) {
  out.push('| product | catalog | read | change | source |');
  out.push('|---|---|---|---|---|');
  for (const r of changed) {
    const was = r.catalog.salePrice ?? r.catalog.price;
    const now = r.read?.current ?? '?';
    out.push(`| \`${r.id}\` | $${was} | $${now} | ${r.cls} | ${r.read?.method ?? ''} |`);
  }
  out.push('');
}

if (unreadable.length) {
  const byReason = {};
  for (const r of unreadable) (byReason[r.reason] ||= []).push(r.host);
  out.push('<details><summary>Unreadable — left untouched, never guessed</summary>');
  out.push('');
  for (const [reason, hosts] of Object.entries(byReason).sort((a, b) => b[1].length - a[1].length)) {
    const tally = {};
    for (const h of hosts) tally[h] = (tally[h] || 0) + 1;
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([h, n]) => `${h}×${n}`).join(', ');
    out.push(`- \`${reason}\` — ${hosts.length} product(s): ${top}`);
  }
  out.push('');
  out.push('</details>');
  out.push('');
}

out.push('---');
out.push('Review before merging. A price that looks wrong almost certainly is — check the listing rather than trusting this diff.');

process.stdout.write(out.join('\n') + '\n');
