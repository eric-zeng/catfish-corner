// One-shot script to classify each answer into an area-of-knowledge category via Ollama,
// and tag applicable fun labels.
import Database from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';
import cliProgress from 'cli-progress';
dotenv.config();

const OLLAMA_URL   = process.env.OLLAMA_URL   ?? 'http://noveria.tailde3693.ts.net:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4:e4b';

// ── Knowledge areas ───────────────────────────────────────────────────────────

const CATEGORIES: { name: string; definition: string }[] = [
  { name: 'Literature & Fiction',             definition: 'literary works, authors, poets' },
  { name: 'Music',                             definition: 'musical works, composers, and musicians' },
  { name: 'Visual Art',                        definition: 'visual artworks, artists, museums' },
  { name: 'History',                           definition: 'major world events and historical figures pre-1917' },
  { name: 'Politics and Contemporary History', definition: 'politics, government, politicians, and major world events that occurred post-1917' },
  { name: 'Sports',                            definition: 'athletes and sports' },
  { name: 'Geography & Places',               definition: 'cities, countries, regions, and notable locations that are not specific buildings' },
  { name: 'Film & TV',                         definition: 'TV shows, movies, documentaries, actors, directors, and the entertainment industry' },
  { name: 'Mythology & Religion',              definition: 'myths, religions, deities, religious figures and texts' },
  { name: 'Food & Drink',                      definition: 'foods, drinks, and food culture and events' },
  { name: 'Pop Culture',                       definition: 'internet culture, comics, video games, board games, and celebrities not notable in other artistic categories' },
  { name: 'Architecture',                      definition: 'famous and significant buildings; excludes infrastructure like bridges and dams' },
  { name: 'Science and Nature',                           definition: 'notable scientists and anything related to mainstream scientific fields (chemistry, math, physics, biology, health sciences, social sciences)' },
  { name: 'Technology and Engineering',        definition: 'technologies, infrastructure, famous engineers, tools and engineered products, computer-related things, and vehicles' },
];

const CATEGORY_LIST = CATEGORIES.map(c => `- ${c.name}: ${c.definition}`).join('\n');

function buildCategoryPrompt(article: string, summary: string): string {
  return `Classify the following Wikipedia article into exactly one of these categories:

${CATEGORY_LIST}

Article title: ${article}
Summary: ${summary}

Reply with only the category name exactly as written above. No explanation, no punctuation, nothing else.`;
}

function matchCategory(raw: string): string | null {
  const normalised = raw.toLowerCase().replace(/[^a-z &]/g, '');
  const exact = CATEGORIES.find(c => c.name.toLowerCase() === normalised);
  if (exact) return exact.name;
  const partial = CATEGORIES.find(c => raw.toLowerCase().includes(c.name.toLowerCase()));
  return partial?.name ?? null;
}

// ── Fun labels ────────────────────────────────────────────────────────────────

const FUN_LABELS: { name: string; definition: string }[] = [
  { name: 'Medieval / Renaissance Bullshit', definition: 'articles that are about famous people, art, music, or literature from the medieval period or renaissance period, in Europe. This excludes architecture, buildings, historical events, kingdoms or empires, etc. Focus on cultural figures and works.' },
  { name: 'Boat Names',                       definition: 'articles that require recall of specific boat or ship names, or naval equipment. This includes stories about ships. No tangentially naval-related topics, just names of boats and ships and naval equipment. If it is a work of art that includes a ship name in the title, that counts.' },
];

const FUN_LABEL_LIST = FUN_LABELS.map(l => `- ${l.name}: ${l.definition}`).join('\n');

function buildFunLabelsPrompt(article: string, summary: string): string {
  return `For the following Wikipedia article, identify which of these optional tags apply. These tags are specific and niche — most articles will match none of them. It is completely fine (and expected) to respond with "none".

Tags:
${FUN_LABEL_LIST}

Article title: ${article}
Summary: ${summary}

Reply with a comma-separated list of applicable tag names exactly as written above, or the single word "none" if none apply. No other text.`;
}

function parseFunLabels(raw: string): string[] {
  if (/\bnone\b/i.test(raw)) return [];
  return FUN_LABELS
    .map(l => l.name)
    .filter(name => raw.toLowerCase().includes(name.toLowerCase()));
}

// ── Ollama ────────────────────────────────────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, '..', 'data', 'catfish.db');

async function runKnowledgeAreaPass(db: InstanceType<typeof Database>): Promise<void> {
  try {
    db.exec(`ALTER TABLE answers ADD COLUMN knowledge_area TEXT NOT NULL DEFAULT ''`);
    console.log('Added knowledge_area column.');
  } catch { /* already exists */ }

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
        bar.start(rows.length, rows.indexOf(row) + 1, { article: '' });
      }
    } catch (err) {
      bar.stop();
      console.error(`  ERROR [${row.day_id}/${row.answer_index}] ${row.article_name}: ${err}`);
      bar.start(rows.length, rows.indexOf(row) + 1, { article: '' });
    }
    bar.increment();
  }
  bar.stop();
}

async function runFunLabelsPass(db: InstanceType<typeof Database>): Promise<void> {
  try {
    db.exec(`ALTER TABLE answers ADD COLUMN fun_labels TEXT NOT NULL DEFAULT '[]'`);
    console.log('Added fun_labels column.');
  } catch { /* already exists */ }

  const rows = db.prepare(
    `SELECT day_id, answer_index, article_name, wikipedia_summary
     FROM answers WHERE fun_labels = '[]' ORDER BY day_id, answer_index`
  ).all() as { day_id: number; answer_index: number; article_name: string; wikipedia_summary: string }[];

  if (rows.length === 0) { console.log('Fun labels: all classified.'); return; }

  console.log(`\nClassifying ${rows.length} fun labels...`);
  const bar = new cliProgress.SingleBar({
    format: 'fun labels      {bar} {percentage}% | {value}/{total} | {article}',
    barCompleteChar: '█', barIncompleteChar: '░', hideCursor: true,
  });
  bar.start(rows.length, 0, { article: '' });

  const update = db.prepare(`UPDATE answers SET fun_labels = ? WHERE day_id = ? AND answer_index = ?`);

  for (const row of rows) {
    bar.update({ article: row.article_name.slice(0, 40) });
    try {
      const raw    = await queryOllama(buildFunLabelsPrompt(row.article_name, row.wikipedia_summary));
      const labels = parseFunLabels(raw);
      update.run(JSON.stringify(labels), row.day_id, row.answer_index);
    } catch (err) {
      bar.stop();
      console.error(`  ERROR [${row.day_id}/${row.answer_index}] ${row.article_name}: ${err}`);
      bar.start(rows.length, rows.indexOf(row) + 1, { article: '' });
    }
    bar.increment();
  }
  bar.stop();
}

async function main() {
  const db = new Database(DB_PATH);
  await runKnowledgeAreaPass(db);
  await runFunLabelsPass(db);
  console.log('\nDone.');
  db.close();
}

main().catch(console.error);
