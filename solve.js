// Fast drop-in for makefun-diff 1.0.0: run(input) returns byte-identical patches.
//
// Strategy: intern every distinct line to a small integer id (one Map for
// both texts), then run Myers's greedy search on Int32Array ids exactly as
// the reference does -- same trim, same diagonal walk, same tie-break
// (deletion wins when a deletion and an insertion reach the same point
// into the old text). Full V snapshots per d make backtracking exact
// without ever rebuilding a path object; the patch builder then mirrors
// the reference's hunk rules line for line.

const FORMAT = 'makefun-diff/1';
const CONTEXT = 3;
const KEEP = 0;
const DELETE = 1;
const INSERT = 2;

/**
 * Split a text into its lines (cut after every '\n'; a trailing line with
 * no '\n' is a line too; the empty text has none) and intern each line to
 * an integer id shared by both texts. `ids` receives the ids in order and
 * `uniq` maps each id back to its line string.
 */
function internLines(text, ids, uniq, table) {
  const parts = text.split('\n');
  const last = parts.length - 1;
  for (let i = 0; i < last; i++) {
    const line = parts[i] + '\n';
    let id = table.get(line);
    if (id === undefined) {
      id = uniq.length;
      table.set(line, id);
      uniq.push(line);
    }
    ids.push(id);
  }
  if (parts[last] !== '') {
    const line = parts[last];
    let id = table.get(line);
    if (id === undefined) {
      id = uniq.length;
      table.set(line, id);
      uniq.push(line);
    }
    ids.push(id);
  }
}

/**
 * Myers's search over the interned middle slices a[a0 .. a0+n) and
 * b[b0 .. b0+m). Returns the edit runs of the middle as [kind, count]
 * pairs, kinds KEEP/DELETE/INSERT, in order. D is the edit distance of
 * the middle; V snapshots (one Int32Array per d, indexed by k+d) are
 * kept so backtracking follows the exact forward choices.
 */
function myersRuns(a, a0, n, b, b0, m) {
  if (n === 0 && m === 0) return [];
  const snaps = [];
  // d = 0: the snake from (0, 0).
  let vPrev = new Int32Array(1);
  let x = 0;
  while (x < n && x < m && a[a0 + x] === b[b0 + x]) x++;
  vPrev[0] = x;
  snaps.push(vPrev);
  let D = 0;
  if (x === n && x === m) {
    // Identical middle: a single keep run.
    return [[KEEP, x]];
  }
  let done = false;
  for (let d = 1; d <= n + m && !done; d++) {
    const vCur = new Int32Array(2 * d + 1);
    vCur.fill(-1);
    for (let k = -d; k <= d; k += 2) {
      const idx = k + d;
      // Deletion candidate: from diagonal k-1 at d-1, one old line further.
      const delSlot = idx - 2; // (k-1) + (d-1)
      const xPrevDel = delSlot >= 0 && delSlot < vPrev.length ? vPrev[delSlot] : -1;
      const delOk = xPrevDel >= 0 && xPrevDel < n;
      const xDel = delOk ? xPrevDel + 1 : -1;
      // Insertion candidate: from diagonal k+1 at d-1, same old position.
      const insSlot = idx; // (k+1) + (d-1)
      const xPrevIns = insSlot >= 0 && insSlot < vPrev.length ? vPrev[insSlot] : -1;
      // Vendor rule: the insertion's new line must exist, i.e.
      // (xPrevIns - 1) - k < m.
      const insOk = xPrevIns >= 0 && xPrevIns - 1 - k < m;
      if (!delOk && !insOk) continue;
      // Tie-break: insertion only when strictly further into the old text.
      const takeIns = insOk && (!delOk || xPrevIns > xDel);
      let xx = takeIns ? xPrevIns : xDel;
      let y = xx - k;
      while (xx < n && y < m && a[a0 + xx] === b[b0 + y]) {
        xx++;
        y++;
      }
      vCur[idx] = xx;
      // Only diagonal k = n - m can reach both ends (y = x - k).
      if (k === n - m && xx === n && y === m) {
        D = d;
        done = true;
        break;
      }
    }
    snaps.push(vCur);
    vPrev = vCur;
  }
  if (!done) throw new Error('makefun-diff: the search ended without reaching both ends');

  // Backtrack from (D, k = n - m) using the snapshots.
  const segs = []; // [kind, count] in reverse order
  let xx = n;
  let k = n - m;
  for (let d = D; d > 0; d--) {
    const vPrevD = snaps[d - 1];
    const idx = k + d;
    const delSlot = idx - 2;
    const xPrevDel = delSlot >= 0 && delSlot < vPrevD.length ? vPrevD[delSlot] : -1;
    const delOk = xPrevDel >= 0 && xPrevDel < n;
    const xDel = delOk ? xPrevDel + 1 : -1;
    const insSlot = idx;
    const xPrevIns = insSlot >= 0 && insSlot < vPrevD.length ? vPrevD[insSlot] : -1;
    const insOk = xPrevIns >= 0 && xPrevIns - 1 - k < m;
    const takeIns = insOk && (!delOk || xPrevIns > xDel);
    const xEdit = takeIns ? xPrevIns : xDel;
    const snake = xx - xEdit;
    if (snake > 0) segs.push([KEEP, snake]);
    segs.push([takeIns ? INSERT : DELETE, 1]);
    const kPrev = takeIns ? k + 1 : k - 1;
    xx = takeIns ? xPrevIns : xPrevDel;
    k = kPrev;
  }
  if (xx > 0) segs.push([KEEP, xx]);
  segs.reverse();
  // Merge adjacent runs of the same kind.
  const runs = [];
  for (const [kind, count] of segs) {
    const last = runs[runs.length - 1];
    if (last !== undefined && last[0] === kind) last[1] += count;
    else runs.push([kind, count]);
  }
  return runs;
}

/** A line as the patch writes it: op + line, a newline, and '%' when it had none. */
function written(op, line, out) {
  if (line.endsWith('\n')) out.push(op + line);
  else out.push(op + line + '\n%\n');
}

/** make.fun's own patch of input.old into input.new. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const table = new Map();
  const uniq = [];
  const aIds = [];
  const bIds = [];
  internLines(input.old, aIds, uniq, table);
  internLines(input.new, bIds, uniq, table);
  const a = Int32Array.from(aIds);
  const b = Int32Array.from(bIds);
  const n = a.length;
  const m = b.length;

  // Common prefix, then common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && a[n - 1 - suffix] === b[m - 1 - suffix]) suffix++;

  const runs = [];
  if (prefix > 0) runs.push([KEEP, prefix]);
  const mid = myersRuns(a, prefix, n - prefix - suffix, b, prefix, m - prefix - suffix);
  for (const [kind, count] of mid) {
    const last = runs[runs.length - 1];
    if (last !== undefined && last[0] === kind) last[1] += count;
    else runs.push([kind, count]);
  }
  if (suffix > 0) {
    const last = runs[runs.length - 1];
    if (last !== undefined && last[0] === KEEP) last[1] += suffix;
    else runs.push([KEEP, suffix]);
  }

  // Change runs: stretches of deletions/insertions between kept lines.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const [kind, count] of runs) {
    if (kind === KEEP) {
      o += count;
      p += count;
      continue;
    }
    let c = changes[changes.length - 1];
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (kind === DELETE) {
      c.dels += count;
      o += count;
      deleted += count;
    } else {
      c.ins += count;
      p += count;
      inserted += count;
    }
  }

  // Hunks: change runs at most 2 * CONTEXT kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks[hunks.length - 1];
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }

  const out = [`${FORMAT} old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) written('=', uniq[a[at]], out);
      for (let i = 0; i < c.dels; i++) written('-', uniq[a[c.o + i]], out);
      for (let i = 0; i < c.ins; i++) written('+', uniq[b[c.p + i]], out);
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) written('=', uniq[a[at]], out);
  }
  return out.join('');
}
