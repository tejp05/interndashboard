/**
 * pglite-adapter.js — a Neon-shaped SQL client backed by in-process Postgres.
 *
 * Lets the dev server and tests exercise the real API handlers, with the real
 * SQL, without provisioning a cloud database. Exposes the same call shapes the
 * handlers use: tagged templates, a plain-string call for DDL, and
 * `.transaction([...])`.
 */

import { PGlite } from '@electric-sql/pglite';

export async function createPgliteClient(dataDir) {
  const db = new PGlite(dataDir); // undefined dataDir → ephemeral in-memory

  /**
   * Build a parameterized query from a tagged template. The handlers write
   *   sql`SELECT ... WHERE id = ${userId}`
   * which arrives here as (["SELECT ... WHERE id = ", ""], userId).
   */
  async function run(strings, values) {
    let text = '';
    strings.forEach((chunk, i) => {
      text += chunk;
      if (i < values.length) text += '$' + (i + 1);
    });
    const res = await db.query(text, values);
    return res.rows;
  }

  const client = (...args) => {
    // Plain string call — used for DDL statements.
    if (typeof args[0] === 'string') {
      return db.exec(args[0]).then(() => []);
    }
    const [strings, ...values] = args;

    // Neon's tagged template is lazy: it builds a query object that only hits
    // the database when awaited, which is what makes `sql.transaction([...])`
    // able to collect queries and run them together. Mirror that here with a
    // thenable, otherwise the statements would fire before BEGIN.
    let started = null;
    const exec = () => (started = started || run(strings, values));
    return {
      then: (onOk, onErr) => exec().then(onOk, onErr),
      catch: (onErr) => exec().catch(onErr),
      finally: (fn) => exec().finally(fn)
    };
  };

  client.transaction = async (queries) => {
    await db.exec('BEGIN');
    try {
      const out = [];
      for (const q of queries) out.push(await q); // sequential: order matters
      await db.exec('COMMIT');
      return out;
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }
  };

  client.close = () => db.close();
  return client;
}
