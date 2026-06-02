// Persistent Discord bot that listens for catfishing.net results posted in the configured channel.
// Inserts new results into SQLite, reacts with a score-based emoji, triggers a site deploy, and
// posts a daily summary at 11:59pm PT.
import 'dotenv/config';
import { spawn } from 'child_process';
import path from 'path';
import { Client, GatewayIntentBits, TextChannel, type Message } from 'discord.js';
import { initDb } from './lib/db';
import { parseMessage } from './lib/parser';
import { syncChannel } from './lib/sync';
import { scheduleDailySummary, checkAllPosted, type SummarySchedule } from './lib/summary';
import { runFetch } from './fetch_answers';
import { runCategorize } from './categorize_answers';
import { runLabel } from './label_answers';

const ROOT = path.join(__dirname, '..');
const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID ?? '';

let summarySchedule: SummarySchedule | null = null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

function deploy(): Promise<void> {
  const child = spawn('npm', ['run', 'deploy'], { cwd: ROOT });
  const out: string[] = [];
  const err: string[] = [];
  child.stdout.on('data', (d: Buffer) => out.push(d.toString()));
  child.stderr.on('data', (d: Buffer) => err.push(d.toString()));
  return new Promise((resolve, reject) => {
    child.on('close', (code) => {
      if (code !== 0) {
        console.error(`Deploy failed: ${err.join('').trim()}`);
        reject(new Error('Deploy failed'));
      } else {
        console.log(`Deploy complete: ${out.join('').trim()}`);
        resolve();
      }
    })
  });
}

async function scrapeAndCategorize(): Promise<void> {
  try {
    await runFetch();
  } catch (err) {
    console.error(`Fetch failed: ${err}`);
    return;
  }
  try {
    await runCategorize();
  } catch (err) {
    console.warn(`Classify failed (non-fatal): ${err}`);
  }
  try {
    await runLabel();
  } catch (err) {
    console.warn(`Label failed (non-fatal): ${err}`);
  }
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
  console.log(`Sync: ${inserted} new results recorded`);
  if (inserted > 0) {
    console.log('New results found — running scrape, categorize, and deploy...');
    try {
      await scrapeAndCategorize();
      await deploy();
      if (summarySchedule) {
        await checkAllPosted(summarySchedule);
      }
    } catch (err) {
      console.error(`Error running post-sync pipeline`);
      console.error(err);
    }
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
    summarySchedule = scheduleDailySummary(getChannel);
    await runSync();
    await checkAllPosted(summarySchedule);
    scheduleHourlySync();
  }
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;
  if (!parseMessage(message.content, message.author)) return;
  console.log(`onMessageCreate: New score posted by ${message.author.username}`);
  await runSync();
});

client.login(process.env.DISCORD_BOT_TOKEN);
