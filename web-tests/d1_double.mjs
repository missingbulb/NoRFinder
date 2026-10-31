// A stand-in for a Cloudflare D1 binding over Node's own SQLite, so the server's tests run its real SQL: prepare,
// bind, first, run, all and batch, the calls accounts/worker.js makes.
import { DatabaseSync } from "node:sqlite";

export function d1() {
  const db = new DatabaseSync(":memory:");
  const statement = (sql, args = []) => ({
    sql, args,
    bind: (...a) => statement(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: r.changes } }; },
  });
  return {
    sqlite: db,
    prepare: (sql) => statement(sql),
    batch: async (list) => {
      db.exec("BEGIN");
      try { const out = list.map((s) => db.prepare(s.sql).all(...s.args)); db.exec("COMMIT"); return out.map((results) => ({ results })); }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}
