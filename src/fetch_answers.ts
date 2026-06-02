// API-based answer fetcher — replaces the Puppeteer scraper for the bot's normal run path.
// Calls https://catfishing.net/api/game?day=<N> to get article titles and categories, then
// uses the wikipedia npm module to resolve each title to a URL and summary.
import wiki from 'wikipedia';
import type Database from 'better-sqlite3';
import { initDb, getDb } from './lib/db';

interface Answer {
  answer_index: number;
  article_name: string;
  wikipedia_url: string;
  categories: string[];
  wikipedia_summary: string;
}

interface ApiArticle {
  title: string;
  categories: string[];
}

interface ApiResponse {
  articles: ApiArticle[];
}

function getMissingDays(db: Database.Database): number[] {
  return (db.prepare(`
    SELECT DISTINCT day_number FROM results
    WHERE day_number NOT IN (SELECT DISTINCT day_id FROM answers)
    ORDER BY day_number
  `).all() as { day_number: number }[]).map(r => r.day_number);
}

function makeInserter(db: Database.Database) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO answers (day_id, answer_index, article_name, categories_list, wikipedia_url, wikipedia_summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  return (dayNumber: number, answers: Answer[]) =>
    db.transaction(() => {
      for (const { answer_index, article_name, wikipedia_url, categories, wikipedia_summary } of answers) {
        stmt.run(dayNumber, answer_index, article_name, JSON.stringify(categories), wikipedia_url, wikipedia_summary);
      }
    })();
}

async function fetchDayFromApi(dayNumber: number): Promise<ApiResponse> {
  const res = await fetch(`https://catfishing.net/api/game?day=${dayNumber}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<ApiResponse>;
}

async function fetchWikiData(title: string): Promise<{ url: string; summary: string }> {
  try {
    const result = await wiki.summary(title);
    const sentences = result.extract.match(/[^.!?]+[.!?]+/g) ?? [];
    const summary = sentences.slice(0, 3).join(' ').trim();
    return { url: result.content_urls.desktop.page, summary };
  } catch (err) {
    console.warn(`  Wikipedia fetch failed for "${title}": ${err}`);
    return { url: '', summary: '' };
  }
}

export async function runFetch(): Promise<void> {
  const db   = getDb();
  const days = getMissingDays(db);

  if (days.length === 0) {
    console.log('Fetch answers: no missing days.');
    return;
  }

  console.log(`Fetching answers for ${days.length} missing day(s)...`);
  const insert = makeInserter(db);

  for (const day of days) {
    try {
      const data = await fetchDayFromApi(day);
      const answers: Answer[] = [];

      for (let i = 0; i < data.articles.length; i++) {
        const { title, categories } = data.articles[i];
        const { url, summary } = await fetchWikiData(title);
        answers.push({ answer_index: i, article_name: title, wikipedia_url: url, categories, wikipedia_summary: summary });
        console.log(`  Day ${day} [${i + 1}/${data.articles.length}]: ${title}`);
      }

      insert(day, answers);
      console.log(`Day ${day}: inserted ${answers.length} answers.`);
    } catch (err) {
      console.error(`Day ${day}: error — ${err}`);
    }
  }
}

if (require.main === module) {
  initDb();
  runFetch().then(() => getDb().close()).catch(console.error);
}
