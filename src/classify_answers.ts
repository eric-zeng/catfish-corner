// One-shot script to classify each answer into an area-of-knowledge category via Ollama.
import Database from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';
import cliProgress from 'cli-progress';
dotenv.config();

const OLLAMA_URL   = process.env.OLLAMA_URL   ?? 'http://noveria.tailde3693.ts.net:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4:e4b';

const CATEGORIES = [
  'Literature & Fiction',
  'Music',
  'Visual Art',
  'Science & Mathematics',
  'History',
  'Politics & Government',
  'Sports & Games',
  'Geography & Places',
  'Film & TV',
  'Mythology & Religion',
  'Food & Drink',
  'Pop Culture',
  'Architecture & Infrastructure',
  'Engineering',
  'Nature & Biology',
];

const CATEGORY_LIST = CATEGORIES.join('\n');

function buildPrompt(article: string, summary: string): string {
  return `Classify the following Wikipedia article into exactly one of these categories:

${CATEGORY_LIST}

Article title: ${article}
Summary: ${summary}

Reply with only the category name. No explanation, no punctuation, nothing else.`;
}

async function queryOllama(prompt: string): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { response: string };
  return data.response.trim();
}

function matchCategory(raw: string): string | null {
  const normalised = raw.toLowerCase().replace(/[^a-z &]/g, '');
  const exact = CATEGORIES.find(c => c.toLowerCase() === normalised);
  if (exact) return exact;
  return CATEGORIES.find(c => raw.toLowerCase().includes(c.toLowerCase())) ?? null;
}

const DB_PATH = path.join(__dirname, '..', 'data', 'catfish.db');

async function main() {
  const db = new Database(DB_PATH);

  try {
    db.exec(`ALTER TABLE answers ADD COLUMN knowledge_area TEXT NOT NULL DEFAULT ''`);
    console.log('Added knowledge_area column.');
  } catch { /* column already exists */ }

  const rows = db.prepare(
    `SELECT day_id, answer_index, article_name, wikipedia_summary
     FROM answers
     WHERE knowledge_area = ''
     ORDER BY day_id, answer_index`
  ).all() as { day_id: number; answer_index: number; article_name: string; wikipedia_summary: string }[];

  if (rows.length === 0) {
    console.log('All answers already classified.');
    db.close();
    return;
  }

  console.log(`Classifying ${rows.length} answers with ${OLLAMA_MODEL}...`);

  const bar = new cliProgress.SingleBar({
    format: '{bar} {percentage}% | {value}/{total} | {article}',
    barCompleteChar: '█',
    barIncompleteChar: '░',
    hideCursor: true,
  });
  bar.start(rows.length, 0, { article: '' });

  const update = db.prepare(
    `UPDATE answers SET knowledge_area = ? WHERE day_id = ? AND answer_index = ?`
  );

  for (const row of rows) {
    bar.update({ article: row.article_name.slice(0, 40) });
    try {
      const raw      = await queryOllama(buildPrompt(row.article_name, row.wikipedia_summary));
      const category = matchCategory(raw);
      if (category) {
        update.run(category, row.day_id, row.answer_index);
      } else {
        bar.stop();
        console.warn(`  [${row.day_id}/${row.answer_index}] ${row.article_name} → UNMATCHED: "${raw}"`);
        bar.start(rows.length, rows.indexOf(row) + 1, { article: '' });
      }
    } catch (err) {
      bar.stop();
      console.error(`  [${row.day_id}/${row.answer_index}] ${row.article_name} → ERROR: ${err}`);
      bar.start(rows.length, rows.indexOf(row) + 1, { article: '' });
    }
    bar.increment();
  }

  bar.stop();
  console.log('Done.');
  db.close();
}

main().catch(console.error);
