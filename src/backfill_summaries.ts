// One-shot script to backfill wikipedia_summary for any answers rows that are missing it.
import { initDb, getDb } from './lib/db';
import { fetchWikiSummary } from './lib/wikipedia';

async function main() {
  initDb();
  const db = getDb();

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
    const text = await fetchWikiSummary(row.wikipedia_url);
    if (text) {
      update.run(text, row.day_id, row.answer_index);
      console.log(`  [${row.day_id}/${row.answer_index}] ${row.article_name}`);
    }
  }

  console.log('Done.');
  db.close();
}

main().catch(console.error);
