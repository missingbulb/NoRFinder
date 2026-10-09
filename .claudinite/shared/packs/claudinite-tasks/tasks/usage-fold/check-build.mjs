// What the engine's checks build cost each session, and whether it blocked one.
//
// The marks are the engine's own breadcrumbs, which reach the transcript in the hooks'
// output:
//
//   [cn] build cached|started|compiled <outcome> <ms>ms
//   [cn] buildwait <event> <outcome> <ms>ms
//
// SessionStart leaves `cached` or `started`; the first Stop that finds a started build
// done leaves `compiled`, once; whatever had to wait for the binary leaves `buildwait`,
// named by the hook or command that waited. A session with build lines and no
// `buildwait` was not blocked; a session with no build line at all ran an engine that
// leaves none, which is not a session that built nothing.
//
// Spelled here rather than read from the engine: the breadcrumb grammar is the
// engine's fixed health-line shape, and this pack reads it the way it reads every
// other hook mark. Every count is a floor, as the other hook marks are.
import { entryText } from './capture-entries.mjs';

const RE_BUILD = /\[cn\] build (cached|started|compiled) (ok|error|timeout) (\d+)ms/g;
const RE_WAIT = /\[cn\] buildwait ([a-z-]+) (ok|error|timeout) (\d+)ms/g;

// One capture's build record, or null where it carries no build line. A line recorded
// twice (one emission the harness kept under two entry shapes) counts once.
export function readCheckBuild(entries) {
  const seen = new Set();
  const out = { cached: 0, started: 0, waits: {} };
  let lines = 0;
  for (const entry of entries ?? []) {
    for (const text of entryText(entry)) {
      for (const m of String(text).matchAll(RE_BUILD)) {
        if (seen.has(m[0])) continue;
        seen.add(m[0]);
        lines += 1;
        if (m[1] === 'cached') out.cached += 1;
        else if (m[1] === 'started') out.started += 1;
        else {
          out.compiledMs = Math.max(out.compiledMs ?? 0, Number(m[3]));
          out.compiledOk = Math.min(out.compiledOk ?? 1, m[2] === 'ok' ? 1 : 0);
        }
      }
      for (const m of String(text).matchAll(RE_WAIT)) {
        if (seen.has(m[0])) continue;
        seen.add(m[0]);
        lines += 1;
        const ms = Number(m[3]);
        const row = (out.waits[m[1]] ??= { waits: 0, totalMs: 0, maxMs: 0, timeouts: 0 });
        row.waits += 1;
        row.totalMs += ms;
        row.maxMs = Math.max(row.maxMs, ms);
        if (m[2] === 'timeout') row.timeouts += 1;
      }
    }
  }
  if (!lines) return null;
  // The line count rides along so the fold can pick a session's most complete capture.
  Object.defineProperty(out, 'lines', { value: lines, enumerable: false });
  return out;
}

// A session's row in the day tier: its build, and its waits summed over events.
export function buildSessionRow(record) {
  const row = { cached: record.cached, started: record.started };
  if (record.compiledMs !== undefined) {
    row.compiledMs = record.compiledMs;
    row.compiledOk = record.compiledOk;
  }
  const waits = Object.values(record.waits);
  row.waits = waits.reduce((n, w) => n + w.waits, 0);
  row.waitMs = waits.reduce((n, w) => n + w.totalMs, 0);
  row.waitMaxMs = waits.reduce((n, w) => Math.max(n, w.maxMs), 0);
  return row;
}

// Fold each (day, session)'s most complete build record into the day rows. A session
// that captured twice wrote the same lines into both files, so its captures are not
// summed: the one carrying the most lines wins.
export function foldCheckBuild(days, files) {
  const best = {};
  for (const file of files) {
    const record = file.counts?.checkBuild;
    if (!record) continue;
    const bySession = (best[file.date] ??= new Map());
    const held = bySession.get(file.sessionId);
    if (!held || (record.lines ?? 0) > (held.lines ?? 0)) bySession.set(file.sessionId, record);
  }
  for (const [date, bySession] of Object.entries(best)) {
    const day = days[date];
    for (const [session, record] of bySession) {
      day.buildSessions[session] = buildSessionRow(record);
      for (const [event, w] of Object.entries(record.waits)) {
        const row = (day.buildWaits[event] ??= { waits: 0, sessions: 0, totalMs: 0, maxMs: 0, timeouts: 0 });
        row.waits += w.waits;
        row.sessions += 1;
        row.totalMs += w.totalMs;
        row.maxMs = Math.max(row.maxMs, w.maxMs);
        row.timeouts += w.timeouts;
      }
    }
  }
  return days;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

// One week's figures, or null where no session reported a build in it. A figure with
// no sample - no compile that week - is absent, never a zero-second build.
export function summarizeWeek(week) {
  const sessions = Object.values(week?.buildSessions ?? {});
  if (!sessions.length) return null;
  const compiled = sessions.filter((s) => typeof s.compiledMs === 'number');
  const waited = sessions.filter((s) => s.waits > 0);
  const out = {
    sessions: sessions.length,
    builds: {
      cached: sessions.filter((s) => s.cached > 0).length,
      compiledOk: compiled.filter((s) => s.compiledOk === 1).length,
      compiledError: compiled.filter((s) => s.compiledOk !== 1).length,
      // Started, and the session ended before a Stop reported the result.
      unreported: sessions.filter((s) => s.started > 0 && typeof s.compiledMs !== 'number').length,
    },
  };
  if (compiled.length) {
    const ms = compiled.map((s) => s.compiledMs);
    out.compiled = { count: ms.length, medianMs: median(ms), maxMs: Math.max(...ms) };
  }
  out.waited = {
    sessions: waited.length,
    totalMs: waited.reduce((n, s) => n + (s.waitMs ?? 0), 0),
    maxMs: waited.reduce((n, s) => Math.max(n, s.waitMaxMs ?? 0), 0),
  };
  out.waitsByEvent = structuredClone(week.buildWaits ?? {});
  return out;
}

// The report card: the last closed week against the one before it. `currentWeek` is
// the ISO week still open, which is never a window.
export function checkBuildReport(weeks, currentWeek) {
  const closed = Object.keys(weeks ?? {}).filter((k) => k < currentWeek).sort();
  const window = closed.at(-1) ?? null;
  const previous = closed.at(-2) ?? null;
  return {
    window,
    previous,
    current: window ? summarizeWeek(weeks[window]) : null,
    prior: previous ? summarizeWeek(weeks[previous]) : null,
  };
}

const NOT_RECORDED = 'not recorded';
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;

// The report as pull-request body lines; none when neither week has a figure.
export function renderCheckBuildReport(report) {
  if (!report?.current && !report?.prior) return [];
  const cell = (summary, read) => (summary ? read(summary) ?? NOT_RECORDED : NOT_RECORDED);
  const rows = [
    ['Sessions reporting a build', (s) => String(s.sessions)],
    ['Binary cached at start', (s) => String(s.builds.cached)],
    ['Compiled ok / failed / unreported', (s) => `${s.builds.compiledOk} / ${s.builds.compiledError} / ${s.builds.unreported}`],
    ['Compile time (n, median, max)', (s) => (s.compiled ? `${s.compiled.count}, ${secs(s.compiled.medianMs)}, ${secs(s.compiled.maxMs)}` : null)],
    ['Sessions that waited (total, max)', (s) => `${s.waited.sessions} (${secs(s.waited.totalMs)}, ${secs(s.waited.maxMs)})`],
  ];
  const events = [...new Set([
    ...Object.keys(report.current?.waitsByEvent ?? {}), ...Object.keys(report.prior?.waitsByEvent ?? {}),
  ])].sort();
  for (const event of events) {
    rows.push([`Waits at ${event} (n, total, max)`, (s) => {
      const w = s.waitsByEvent[event];
      return w ? `${w.waits}, ${secs(w.totalMs)}, ${secs(w.maxMs)}` : '0';
    }]);
  }
  return [
    '### Check build',
    '',
    `| | ${report.window ?? NOT_RECORDED} | ${report.previous ?? NOT_RECORDED} |`,
    '|---|---|---|',
    ...rows.map(([label, read]) => `| ${label} | ${cell(report.current, read)} | ${cell(report.prior, read)} |`),
  ];
}
