// One-shot script to tag each answer with applicable labels via Ollama.
// Each (answer, label) pair is stored explicitly as 0/1 in the answer_labels table.
import cliProgress from 'cli-progress';
import { LABELS } from './lib/categories';
import { queryOllama } from './lib/ollama';
import { initDb, getDb } from './lib/db';

function buildLabelPrompt(label: { name: string; definition: string }, article: string, summary: string): string {
  return `Does the following Wikipedia article match this tag?

Tag: ${label.name}
Definition: ${label.definition}

Article title: ${article}
Summary: ${summary}

Reply with only "yes" or "no". No explanation, no punctuation, nothing else.`;
}

export async function runLabel(): Promise<void> {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS answer_labels (
      day_id       INTEGER NOT NULL,
      answer_index INTEGER NOT NULL,
      label        TEXT NOT NULL,
      value        INTEGER NOT NULL CHECK(value IN (0, 1)),
      PRIMARY KEY (day_id, answer_index, label)
    )
  `);

  const answers = db.prepare(
    `SELECT day_id, answer_index, article_name, wikipedia_summary FROM answers ORDER BY day_id, answer_index`
  ).all() as { day_id: number; answer_index: number; article_name: string; wikipedia_summary: string }[];

  const hasRow = db.prepare(
    `SELECT 1 FROM answer_labels WHERE day_id = ? AND answer_index = ? AND label = ?`
  );

  type TodoItem = { day_id: number; answer_index: number; article_name: string; wikipedia_summary: string; label: (typeof LABELS)[number] };
  const todo: TodoItem[] = [];
  for (const answer of answers) {
    for (const label of LABELS) {
      if (!hasRow.get(answer.day_id, answer.answer_index, label.name)) {
        todo.push({ ...answer, label });
      }
    }
  }

  if (todo.length === 0) {
    console.log('Labels: all answers annotated.');
    return;
  }

  console.log(`\nClassifying ${todo.length} (answer, label) pairs...`);
  const bar = new cliProgress.SingleBar({
    format: 'labels  {bar} {percentage}% | {value}/{total} | {label}: {article}',
    barCompleteChar: '█', barIncompleteChar: '░', hideCursor: true,
  });
  bar.start(todo.length, 0, { label: '', article: '' });

  const insert = db.prepare(
    `INSERT OR REPLACE INTO answer_labels (day_id, answer_index, label, value) VALUES (?, ?, ?, ?)`
  );

  let i = 0;
  for (const item of todo) {
    bar.update({ label: item.label.name.slice(0, 30), article: item.article_name.slice(0, 30) });
    try {
      const raw   = await queryOllama(buildLabelPrompt(item.label, item.article_name, item.wikipedia_summary));
      const value = /\byes\b/i.test(raw) ? 1 : 0;
      insert.run(item.day_id, item.answer_index, item.label.name, value);
    } catch (err) {
      bar.stop();
      console.error(`  ERROR [${item.day_id}/${item.answer_index}] ${item.article_name} × ${item.label.name}: ${err}`);
      bar.start(todo.length, i + 1, { label: '', article: '' });
    }
    bar.increment();
    i++;
  }
  bar.stop();
  console.log('\nDone.');
}

if (require.main === module) {
  initDb();
  runLabel().then(() => getDb().close()).catch(console.error);
}
