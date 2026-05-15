// Persistent Discord bot that listens for catfishing.net results posted in the configured channel.
// Inserts new results into SQLite, reacts with a score-based emoji, triggers a site deploy, and
// posts a daily summary at 11:59pm PT.
import 'dotenv/config';
import { exec } from 'child_process';
import path from 'path';
import { Client, GatewayIntentBits, TextChannel, type Message } from 'discord.js';
import { initDb, insertResult } from './lib/db';
import { parseMessage } from './lib/parser';
import { syncChannel } from './lib/sync';
import { scheduleDailySummary } from './lib/summary';
import { reactToScore } from './lib/reactions';

const ROOT = path.join(__dirname, '..');
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID ?? '';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function deploy(): void {
  exec('npm run deploy', { cwd: ROOT }, (err, stdout, stderr) => {
    if (err) {
      console.error(`Deploy failed: ${stderr}`);
    } else {
      console.log(`Deploy complete: ${stdout.trim()}`);
    }
  });
}

function runScrape(): void {
  exec('npx tsx src/scrape_answers.ts --headless', { cwd: ROOT }, (err, stdout, stderr) => {
    if (err) {
      console.error(`Scrape failed: ${stderr}`);
    } else {
      console.log(`Scrape complete: ${stdout.trim()}`);
    }
  });
}

async function getChannel(): Promise<TextChannel | null> {
  try {
    const ch = await client.channels.fetch(CHANNEL_ID);
    return ch instanceof TextChannel ? ch : null;
  } catch {
    return null;
  }
}

async function runSync(): Promise<void> {
  const channel = await getChannel();
  if (!channel) {
    console.error(`Sync failed: could not fetch channel ${CHANNEL_ID}`);
    return;
  }
  const inserted = await syncChannel(channel);
  if (inserted > 0) {
    console.log(`Sync: ${inserted} new results — deploying...`);
    deploy();
    runScrape();
  } else {
    console.log('Sync: up to date');
  }
}

function scheduleHourlySync(): void {
  setInterval(runSync, 60 * 60 * 1000);
  console.log('Hourly sync scheduled');
}

client.once('clientReady', async (c) => {
  initDb();
  console.log(`Logged in as ${c.user.tag}`);

  if (!CHANNEL_ID) {
    console.warn('DISCORD_CHANNEL_ID not set — skipping sync');
  } else {
    await runSync();
    scheduleHourlySync();
    scheduleDailySummary(getChannel);
  }
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  const result = parseMessage(message.content, message.author);
  if (!result) return;

  console.log(`${result.username} ${result.day_number}`);

  const inserted = insertResult(result);
  if (!inserted) return;

  await reactToScore(message, result.score);
  deploy();
  runScrape();
});

client.login(process.env.DISCORD_BOT_TOKEN);
