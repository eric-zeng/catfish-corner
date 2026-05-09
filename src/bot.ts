import 'dotenv/config';
import { exec } from 'child_process';
import path from 'path';
import { Client, GatewayIntentBits, TextChannel, type Message } from 'discord.js';
import { initDb, insertResult } from './db';
import { parseMessage } from './parser';
import { syncChannel } from './sync';

const ROOT = path.join(__dirname, '..');
const CHANNEL_IDS = (process.env.DISCORD_CHANNEL_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);

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

async function runSync(): Promise<void> {
  let total = 0;
  for (const id of CHANNEL_IDS) {
    try {
      const channel = await client.channels.fetch(id);
      if (!(channel instanceof TextChannel)) continue;
      const inserted = await syncChannel(channel);
      total += inserted;
    } catch (err) {
      console.error(`Sync failed for channel ${id}:`, err);
    }
  }
  if (total > 0) {
    console.log(`Sync: ${total} new results — deploying...`);
    deploy();
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

  if (CHANNEL_IDS.length === 0) {
    console.warn('DISCORD_CHANNEL_IDS not set — skipping sync');
  } else {
    await runSync();
    scheduleHourlySync();
  }
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  const result = parseMessage(message.content, message.author);
  if (!result) return;

  console.log(`${result.username} ${result.day_number}`);

  const inserted = insertResult(result);
  if (!inserted) return;

  await message.react('🐈');
  deploy();
});

client.login(process.env.DISCORD_BOT_TOKEN);
