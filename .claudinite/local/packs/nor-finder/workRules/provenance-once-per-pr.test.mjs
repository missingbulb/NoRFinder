import { test } from 'node:test';
import assert from 'node:assert/strict';
import rule from './provenance-once-per-pr.mjs';

const FILE = '.claudinite/local/packs/nor-finder/provenance/some-element.md';

function work({ onDefault = false, commits = ['Add a rule'], changedFiles = [FILE], entries = [] }) {
  return {
    onDefaultBranch: () => onDefault,
    commits,
    changedFiles,
    addedLines: (files) => files.flatMap((file) => entries
      .filter((e) => e.file === file)
      .map((e, i) => ({ file, line: i + 1, text: e.text }))),
  };
}

const headerLine = (n) => `## 2026-09-2${n} · born · entry ${n}`;

test('flags a still-open PR that adds two entries to the same provenance file, anchored on the last one', () => {
  const w = work({ entries: [{ file: FILE, text: headerLine(1) }, { file: FILE, text: headerLine(2) }] });
  const found = rule.run(w);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 2);
});

test('says nothing about a single entry added to a provenance file', () => {
  const w = work({ entries: [{ file: FILE, text: headerLine(1) }] });
  assert.equal(rule.run(w).length, 0);
});

test('says nothing on the default branch, whatever the diff', () => {
  const w = work({ onDefault: true, entries: [{ file: FILE, text: headerLine(1) }, { file: FILE, text: headerLine(2) }] });
  assert.equal(rule.run(w).length, 0);
});

test('exempts a branch carrying the backfilling-provenance flow\'s own PR title', () => {
  const w = work({
    commits: ['Provenance: backfill nor-finder'],
    entries: [{ file: FILE, text: headerLine(1) }, { file: FILE, text: headerLine(2) }],
  });
  assert.equal(rule.run(w).length, 0);
});

test('exempts _declined.md, where several distinct candidates land in one pass', () => {
  const declined = '.claudinite/local/packs/nor-finder/provenance/_declined.md';
  const w = work({
    changedFiles: [declined],
    entries: [{ file: declined, text: headerLine(1) }, { file: declined, text: headerLine(2) }],
  });
  assert.equal(rule.run(w).length, 0);
});

test('says nothing about a file with no changed provenance entries', () => {
  const w = work({ changedFiles: ['README.md'], entries: [] });
  assert.equal(rule.run(w).length, 0);
});
