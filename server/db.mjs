import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { schema } from '../db/schema.mjs';

export function productionEnvironment(env = process.env) {
  return env.NETLIFY === 'true' || env.NODE_ENV === 'production';
}

export async function resolveDatabaseConfig(options = {}) {
  const env = options.env || process.env;
  let url = options.url ?? env.DATABASE_URL;
  const nativeNetlify = env.CROPS_DATABASE_PROVIDER === 'netlify' || Boolean(env.NETLIFY_DB_URL) || (!url && env.NETLIFY === 'true');
  if (nativeNetlify && !options.url) {
    if (env.NETLIFY_DB_URL) url = env.NETLIFY_DB_URL;
    else if (!url) {
      try {
        const { getConnectionString } = await import('@netlify/database');
        url = getConnectionString();
      } catch {
        const error = new Error('Netlify Database is not configured. Provision the site database and deploy the Crops migration first.');
        error.code = 'database_unconfigured';
        throw error;
      }
    }
  }
  return { url, nativeNetlify };
}

export async function createDatabase(options = {}) {
  const env = options.env || process.env;
  const { url, nativeNetlify } = options.resolvedConfig || await resolveDatabaseConfig(options);
  if (url) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: url, max: 3, idleTimeoutMillis: 20000, connectionTimeoutMillis: 10000,
      statement_timeout: 10000, idle_in_transaction_session_timeout: 15000,
      application_name: 'crops',
      // A SQL DATE is a calendar date, not midnight in the Node process timezone.
      types: { getTypeParser: (oid, format) => oid === 1082 ? (value) => value : pg.types.getTypeParser(oid, format) },
    });
    pool.on('error', (error) => console.error('Crops idle database connection failed:', error.code || error.name));
    const transaction = async (fn) => {
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        const result = await fn(connection);
        await connection.query('COMMIT');
        return result;
      } catch (error) {
        try { await connection.query('ROLLBACK'); } catch { /* Keep the original failure when a socket has closed. */ }
        throw error;
      } finally { connection.release(); }
    };
    try {
      if (nativeNetlify || env.CROPS_AUTO_MIGRATE === 'false' || options.migrate === false) {
        try {
          const ready = await pool.query('SELECT id FROM app_locks WHERE id=1');
          if (!ready.rows.length) throw new Error('Schema is missing or the database account cannot access it.');
        } catch (cause) {
          const error = new Error('The Crops database schema is not ready. Deploy the Netlify migration and use the database owner connection for setup.');
          error.code = 'schema_uninitialized';
          error.cause = cause;
          throw error;
        }
      } else {
        await transaction(async (tx) => {
          await tx.query('SELECT pg_advisory_xact_lock(733244271)');
          await tx.query(schema);
        });
      }
    } catch (error) { await pool.end(); throw error; }
    return { query: pool.query.bind(pool), transaction, close: () => pool.end(), kind: nativeNetlify ? 'netlify-postgres' : 'postgres' };
  }
  if (productionEnvironment(env)) {
    const error = new Error('Set DATABASE_URL to a PostgreSQL database before using Crops in production.');
    error.code = 'database_unconfigured';
    throw error;
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const dataDir = options.dataDir ?? env.CROPS_DATA_DIR ?? resolve('.data/crops');
  if (dataDir !== 'memory://') await mkdir(dataDir, { recursive: true });
  const db = new PGlite(dataDir);
  await db.waitReady;
  await db.exec(schema);
  return {
    query: db.query.bind(db), transaction: (fn) => db.transaction(fn),
    close: () => db.close(), kind: dataDir === 'memory://' ? 'memory' : 'pglite',
  };
}
