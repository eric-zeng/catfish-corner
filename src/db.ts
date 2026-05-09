import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { ParsedResult } from './parser';

let db: Database.Database;

export function initDb(): void {
  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  db = new Database(path.join(dataDir, 'catfish.db'));
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS results (
      username   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      date       TEXT NOT NULL,
      day_number INTEGER NOT NULL,
      score      REAL NOT NULL,
      total      INTEGER NOT NULL,
      guesses    TEXT NOT NULL,
      PRIMARY KEY (user_id, day_number)
    )
  `);
}

export function insertResult({ username, user_id, date, day_number, score, total, guesses }: ParsedResult): boolean {
  const { changes } = db.prepare('INSERT OR IGNORE INTO results VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(username, user_id, date.toISOString(), day_number, score, total, guesses);
  return changes > 0;
}

export function closeDb(): void {
  db.close();
}
