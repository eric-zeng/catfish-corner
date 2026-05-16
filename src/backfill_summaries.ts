// One-shot script to backfill wikipedia_summary for any answers rows that are missing it.
import Database from 'better-sqlite3';
import wiki from 'wikipedia';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'data', 'catfish.db');

async function main() {
  const db = new Database(DB_PATH);

  try {
    db.exec(`ALTER TABLE answers ADD COLUMN wikipedia_summary TEXT NOT NULL DEFAULT ''`);
  } catch { /* column already exists */ }

  const rows = db.prepare(
    `SELECT day_id, answer_index, article_name, wikipedia_url FROM answers WHERE wikipedia_summary = '' ORDER BY day_id, answer_index`
  ).all() as { day_id: number; answer_index: number; article_name: string; wikipedia_url: string }[];

  if (rows.length === 0) {
    console.log('All summaries already populated.');
    db.close();
    return;
  }

  console.log(`Backfilling summaries for ${rows.length} answers...`);

  const update = db.prepare(`UPDATE answers SET wikipedia_summary = ? WHERE day_id = ? AND answer_index = ?`);

  for (const row of rows) {
    try {
      const title = decodeURIComponent(row.wikipedia_url.split('/wiki/')[1] ?? '');
      const summary = await wiki.summary(title);
      const sentences = summary.extract.match(/[^.!?]+[.!?]+/g) ?? [];
      const text = sentences.slice(0, 3).join(' ').trim();
      update.run(text, row.day_id, row.answer_index);
      console.log(`  [${row.day_id}/${row.answer_index}] ${row.article_name}`);
    } catch (err) {
      console.warn(`  [${row.day_id}/${row.answer_index}] ${row.article_name}: failed — ${err}`);
    }
  }

  console.log('Done.');
  db.close();
}

main().catch(console.error);
