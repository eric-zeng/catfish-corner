// Puppeteer script that scrapes article names, Wikipedia URLs, and categories from catfishing.net
// for any days in the results table that are missing answer metadata. Run with --results to use a
// stats export file, or without flags to auto-play (skip through questions) on unplayed days.
import puppeteer, { type Page } from 'puppeteer';
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH   = path.join(__dirname, '..', 'data', 'catfish.db');
const STATS_FILE = path.join(__dirname, '..', 'samples', 'catfishing_export_1778736854.gz');
const DELAY_MS  = 300;

interface Answer {
  answer_index: number;
  article_name: string;
  wikipedia_url: string;
  categories: string[];
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function initDb() {
  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS answers (
      day_id          INTEGER NOT NULL,
      answer_index    INTEGER NOT NULL,
      article_name    TEXT NOT NULL,
      categories_list TEXT NOT NULL,
      wikipedia_url   TEXT NOT NULL,
      PRIMARY KEY (day_id, answer_index)
    )
  `);
  return db;
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
    INSERT OR IGNORE INTO answers (day_id, answer_index, article_name, categories_list, wikipedia_url)
    VALUES (?, ?, ?, ?, ?)
  `);
  return (dayNumber: number, answers: Answer[]) =>
    db.transaction(() => {
      for (const { answer_index, article_name, wikipedia_url, categories } of answers) {
        stmt.run(dayNumber, answer_index, article_name, JSON.stringify(categories), wikipedia_url);
      }
    })();
}

// ── Auto-play mode ────────────────────────────────────────────────────────────

async function scrapeAnswerScreen(page: Page, index: number): Promise<Answer> {
  return page.evaluate((i) => {
    const wikiLink = document.querySelector(
      'a[href*="en.wikipedia.org/wiki/"]:not([href*="/Category:"])'
    ) as HTMLAnchorElement | null;
    const wikipedia_url = wikiLink?.href ?? '';

    // Title lives in the section immediately before the description (bg-gradient) section
    const descSection = document.querySelector('section[class*="bg-gradient"]');
    const article_name = descSection?.previousElementSibling?.textContent?.trim()
      ?? decodeURIComponent(wikipedia_url.split('/wiki/')[1] ?? '').replace(/_/g, ' ');

    const categories = Array.from(document.querySelectorAll('a[href*="/wiki/Category:"]'))
      .map(a => a.textContent?.trim() ?? '')
      .filter(Boolean);

    return { answer_index: i, article_name, wikipedia_url, categories };
  }, index);
}

async function autoPlayDay(page: Page): Promise<Answer[]> {
  const playBtn = await page.$('button[title*="Play today"]');
  if (playBtn) {
    await playBtn.click();
    await page.waitForSelector('input#guess', { timeout: 10000 });
  }

  const answers: Answer[] = [];
  for (let i = 0; i < 10; i++) {
    await page.waitForSelector('button[title*="Skip"]', { timeout: 10000 });
    await page.click('button[title*="Skip"]');

    await page.waitForSelector('button[title*="Next"], button[title*="Results"]', { timeout: 10000 });
    answers.push(await scrapeAnswerScreen(page, i));

    if (i === 9) break;

    await page.click('button[title*="Next"]');
    await page.waitForSelector('input#guess', { timeout: 10000 });
  }

  return answers;
}

async function runAutoPlay(days: number[], page: Page, insert: ReturnType<typeof makeInserter>) {
  for (const day of days) {
    try {
      await page.goto(`https://catfishing.net/game/${day}`, { waitUntil: 'networkidle2' });

      const isStart    = (await page.$('button[title*="Play today"]')) !== null;
      const isQuestion = (await page.$('input#guess')) !== null;

      if (!isStart && !isQuestion) {
        console.log(`Day ${day}: not an active game page, skipping.`);
        continue;
      }

      const answers = await autoPlayDay(page);
      insert(day, answers);
      console.log(`Day ${day}: auto-played, scraped ${answers.length} answers.`);

      await new Promise(r => setTimeout(r, DELAY_MS));
    } catch (err) {
      console.error(`Day ${day}: error — ${err}`);
    }
  }
}

// ── Results-page mode ─────────────────────────────────────────────────────────

async function uploadStatsFile(page: Page) {
  console.log('Uploading stats file to settings...');
  await page.goto('https://catfishing.net/settings', { waitUntil: 'networkidle2' });

  let fileInput = await page.$('input[type="file"]');
  if (!fileInput) {
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('button, label, a'))
        .find(e => /import/i.test(e.textContent ?? ''));
      if (el) (el as HTMLElement).click();
    });
    await new Promise(r => setTimeout(r, 600));
    fileInput = await page.$('input[type="file"]');
  }

  if (!fileInput) throw new Error('Could not find file input on settings page');
  await fileInput.uploadFile(STATS_FILE);

  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Confirm import')),
    { timeout: 10000 }
  );
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Confirm import'));
    if (btn) btn.click();
  });
  await page.waitForNetworkIdle({ timeout: 15000 });
  console.log('Stats uploaded.');
}

async function runResults(days: number[], page: Page, insert: ReturnType<typeof makeInserter>) {
  await uploadStatsFile(page);

  for (const day of days) {
    try {
      await page.goto(`https://catfishing.net/game/${day}`, { waitUntil: 'networkidle2' });

      const resultsContainer = await page.$('div.divide-y.divide-dotted.divide-emerald-900');
      if (!resultsContainer) {
        console.log(`Day ${day}: results page not available (not played?), skipping.`);
        continue;
      }

      await page.click('input[name="alwaysExpand"]');
      await page.waitForSelector('a[href*="/wiki/Category:"]', { timeout: 5000 });

      const answers = await page.evaluate(() => {
        const container = document.querySelector('div.divide-y.divide-dotted.divide-emerald-900');
        if (!container) return [];
        return Array.from(container.children)
          .map((row, index) => {
            const article_name = row.querySelector('div[class*="text-3xl"]')?.textContent?.trim() ?? '';
            const wikipedia_url = row.querySelector(
              'a[href*="en.wikipedia.org/wiki/"]:not([href*="/Category:"])'
            )?.getAttribute('href') ?? '';
            const categories = Array.from(row.querySelectorAll('a[href*="/wiki/Category:"]'))
              .map(a => a.textContent?.trim() ?? '')
              .filter(Boolean);
            return { answer_index: index, article_name, wikipedia_url, categories };
          })
          .filter(a => a.article_name !== '');
      });

      insert(day, answers);
      console.log(`Day ${day}: scraped ${answers.length} answers from results page.`);

      await new Promise(r => setTimeout(r, DELAY_MS));
    } catch (err) {
      console.error(`Day ${day}: error — ${err}`);
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(`
Usage: npm run scrape [-- <flag>]

Scrapes catfishing.net answer metadata (article names, Wikipedia URLs, categories)
for any days present in the results table but missing from the answers table.

Flags:
  (none)      Auto-play mode (default): navigates to each unplayed day, clicks Skip
              on every question, and reads the answer screen. No account required.

  --results   Results mode: uploads a stats export file to catfishing.net/settings,
              then scrapes the completed results page for each day. Requires updating
              STATS_FILE in src/scrape_answers.ts to point to your .gz export.

  --headless   Run the browser in headless mode (used when called from the bot daemon).

  --help, -h  Show this help message.
`.trim());
    return;
  }

  const mode     = process.argv.includes('--results') ? 'results' : 'autoplay';
  const headless = process.argv.includes('--headless');

  const db   = initDb();
  const days = getMissingDays(db);

  if (days.length === 0) {
    console.log('No missing days to scrape.');
    db.close();
    return;
  }

  console.log(`Found ${days.length} missing days — mode: ${mode}`);

  const browser = await puppeteer.launch({ headless });
  const page    = await browser.newPage();

  try {
    const insert = makeInserter(db);
    if (mode === 'results') {
      await runResults(days, page, insert);
    } else {
      await runAutoPlay(days, page, insert);
    }
  } finally {
    await browser.close();
    db.close();
  }
}

main().catch(console.error);
