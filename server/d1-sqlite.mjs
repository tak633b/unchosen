// D1 の使っている所 (prepare / bind / first / all / run) だけを node:sqlite の上に。
// 手元の Node 版サーバ (server.mjs) とテストが、Cloudflare 版の API (cf-api.mjs) をそのまま動かすのに使う
export function d1(db) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => {
      const r = db.prepare(sql).run(...args);
      return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
  });
  return { raw: db, prepare: (sql) => stmt(sql) };
}
