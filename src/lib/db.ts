import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { ParsedResult } from './parser';

let db: Database.Database;

export function initDb(): void {
  const dataDir = path.join(__dirname, '..', '..', 'data');
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
    );
    CREATE TABLE IF NOT EXISTS answers (
      day_id          INTEGER NOT NULL,
      answer_index    INTEGER NOT NULL,
      article_name    TEXT NOT NULL,
      categories_list TEXT NOT NULL,
      wikipedia_url   TEXT NOT NULL,
      PRIMARY KEY (day_id, answer_index)
    );
  `);
}

export function insertResult({ username, user_id, date, day_number, score, total, guesses }: ParsedResult): boolean {
  const { changes } = db.prepare('INSERT OR IGNORE INTO results VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(username, user_id, date.toISOString(), day_number, score, total, guesses);
  return changes > 0;
}

export function getLatestEntryDate(): Date | null {
  const row = db.prepare('SELECT MAX(date) as latest FROM results').get() as { latest: string | null };
  return row.latest ? new Date(row.latest) : null;
}

export function getLatestDayNumber(): number | null {
  const row = db.prepare('SELECT MAX(day_number) as latest FROM results').get() as { latest: number | null };
  return row.latest;
}

export function getLatestDayDate(): string | null {
  const row = db.prepare(
    'SELECT MAX(date) as latest FROM results WHERE day_number = (SELECT MAX(day_number) FROM results)'
  ).get() as { latest: string | null };
  return row.latest;
}

export interface DayResult {
  username: string;
  user_id: string;
  score: number;
}

export function getDayResults(dayNumber: number): DayResult[] {
  return db.prepare('SELECT username, user_id, score FROM results WHERE day_number = ?').all(dayNumber) as DayResult[];
}

export function getDayGuesses(dayNumber: number): { username: string; guesses: number[] }[] {
  const rows = db.prepare('SELECT username, guesses FROM results WHERE day_number = ?').all(dayNumber) as { username: string; guesses: string }[];
  return rows.map(r => ({ username: r.username, guesses: JSON.parse(r.guesses) as number[] }));
}

export interface AnswerRow {
  answer_index: number;
  article_name: string;
  wikipedia_url: string;
}

export function getDayAnswers(dayNumber: number): AnswerRow[] {
  return db.prepare(
    'SELECT answer_index, article_name, wikipedia_url FROM answers WHERE day_id = ? ORDER BY answer_index'
  ).all(dayNumber) as AnswerRow[];
}

export function getUserBestScoreExcluding(userId: string, dayNumber: number): number | null {
  const row = db.prepare(
    'SELECT MAX(score) as best FROM results WHERE user_id = ? AND day_number != ?'
  ).get(userId, dayNumber) as { best: number | null };
  return row.best;
}

export function closeDb(): void {
  db.close();
}
