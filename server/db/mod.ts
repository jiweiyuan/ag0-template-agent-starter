import { Database } from "@db/sqlite";
import { dbLogger as logger } from "../lib/logger.ts";

export type { Database };

/** Current schema version - increment when making schema changes */
const SCHEMA_VERSION = 1;

/**
 * Migration functions keyed by target version.
 * Each migration should be idempotent and upgrade from version-1 to version.
 */
const MIGRATIONS: Record<number, (db: Database) => void> = {
  1: (db) => {
    // Initial schema - chats and messages tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chats_session_updated ON chats(session_id, updated_at);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        checkpoint_id TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at);
    `);
  },
  // Future migrations go here:
  // 2: (db) => { db.exec("ALTER TABLE ..."); },
};

let db: Database | null = null;

/**
 * Get the current schema version from the database.
 * Returns 0 if the schema_version table doesn't exist (fresh database).
 */
function getSchemaVersion(database: Database): number {
  try {
    const result = database.prepare(
      "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
    ).get<{ version: number }>();
    return result?.version ?? 0;
  } catch {
    // Table doesn't exist - this is a fresh database
    return 0;
  }
}

/**
 * Run migrations to bring database to current schema version.
 */
function runMigrations(database: Database): void {
  const currentVersion = getSchemaVersion(database);

  if (currentVersion === SCHEMA_VERSION) {
    return; // Already up to date
  }

  if (currentVersion > SCHEMA_VERSION) {
    throw new Error(
      `Database schema version (${currentVersion}) is newer than application ` +
        `schema version (${SCHEMA_VERSION}). Please update the application.`,
    );
  }

  logger
    .info`Migrating database from version ${currentVersion} to ${SCHEMA_VERSION}`;

  // Create schema_version table if it doesn't exist
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  // Run each migration in order
  for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
    const migration = MIGRATIONS[v];
    if (!migration) {
      throw new Error(`Missing migration for version ${v}`);
    }

    logger.info`Running migration to version ${v}...`;

    // Run migration in a transaction
    database.exec("BEGIN TRANSACTION");
    try {
      migration(database);
      database.prepare(
        "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)",
      ).run(v, new Date().toISOString());
      database.exec("COMMIT");
      logger.info`Migration to version ${v} complete`;
    } catch (error) {
      database.exec("ROLLBACK");
      throw new Error(`Migration to version ${v} failed: ${error}`);
    }
  }
}

export function initDb(dbPath: string = "data/chats.db"): Database {
  if (db) {
    return db;
  }

  // Ensure data directory exists
  const dir = dbPath.substring(0, dbPath.lastIndexOf("/"));
  if (dir) {
    Deno.mkdirSync(dir, { recursive: true });
  }

  // Open or create database
  db = new Database(dbPath);

  // Enable foreign keys and WAL mode
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");

  // Run migrations to ensure schema is up to date
  runMigrations(db);

  return db;
}
