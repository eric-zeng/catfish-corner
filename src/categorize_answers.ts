// One-shot script to categorize each answer into an area-of-knowledge category via Ollama.
import cliProgress from 'cli-progress';
import { KNOWLEDGE_AREAS } from './lib/categories';
import { queryOllama } from './lib/ollama';
import { initDb, getDb } from './lib/db';

// ── Knowledge areas ───────────────────────────────────────────────────────────

const CATEGORY_LIST = KNOWLEDGE_AREAS.map(c => `- ${c.name}: ${c.definition}`).join('\n');

function buildCategoryPrompt(article: string, summary: string): string {
  return `Classify the following Wikipedia article into exactly one of these categories:

${CATEGORY_LIST}

Article title: ${article}
Summary: ${summary}

Reply with only the category name exactly as written above. No explanation, no punctuation, nothing else.`;
}

function matchCategory(raw: string): string | null {
  const normalised = raw.toLowerCase().replace(/[^a-z &]/g, '');
  const exact = KNOWLEDGE_AREAS.find(c => c.name.toLowerCase() === normalised);
  if (exact) return exact.name;
  const partial = KNOWLEDGE_AREAS.find(c => raw.toLowerCase().includes(c.name.toLowerCase()));
  return partial?.name ?? null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function runKnowledgeAreaPass(db: ReturnType<typeof getDb>): Promise<void> {
  const rows = db.prepare(
    `SELECT day_id, answer_index, article_name, wikipedia_summary
     FROM answers WHERE knowledge_area = '' ORDER BY day_id, answer_index`
  ).all() as { day_id: number; answer_index: number; article_name: string; wikipedia_summary: string }[];

  if (rows.length === 0) { console.log('Knowledge areas: all classified.'); return; }

  console.log(`\nClassifying ${rows.length} knowledge areas...`);
  const bar = new cliProgress.SingleBar({
    format: 'knowledge area  {bar} {percentage}% | {value}/{total} | {article}',
    barCompleteChar: '█', barIncompleteChar: '░', hideCursor: true,
  });
  bar.start(rows.length, 0, { article: '' });

  const update = db.prepare(`UPDATE answers SET knowledge_area = ? WHERE day_id = ? AND answer_index = ?`);

  let i = 0;
  for (const row of rows) {
    bar.update({ article: row.article_name.slice(0, 40) });
    try {
      const raw      = await queryOllama(buildCategoryPrompt(row.article_name, row.wikipedia_summary));
      const category = matchCategory(raw);
      if (category) {
        update.run(category, row.day_id, row.answer_index);
      } else {
        bar.stop();
        console.warn(`  UNMATCHED [${row.day_id}/${row.answer_index}] ${row.article_name}: "${raw}"`);
        bar.start(rows.length, i + 1, { article: '' });
      }
    } catch (err) {
      bar.stop();
      console.error(`  ERROR [${row.day_id}/${row.answer_index}] ${row.article_name}: ${err}`);
      bar.start(rows.length, i + 1, { article: '' });
    }
    bar.increment();
    i++;
  }
  bar.stop();
}

export async function runCategorize(): Promise<void> {
  initDb();
  const db = getDb();
  await runKnowledgeAreaPass(db);
  console.log('\nDone.');
  db.close();
}

if (require.main === module) {
  runCategorize().catch(console.log);
}
