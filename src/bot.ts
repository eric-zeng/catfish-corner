import 'dotenv/config';
import { exec } from 'child_process';
import path from 'path';
import { Client, GatewayIntentBits, type Message } from 'discord.js';
import { initDb, insertResult } from './db';
import { parseMessage } from './parser';

const ROOT = path.join(__dirname, '..');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('clientReady', (c) => {
  initDb();
  console.log(`Logged in as ${c.user.tag}`);
});

client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;
  // console.log(`[debug] message from ${message.author.username}: ${message.content.slice(0, 50)}`);

  const result = parseMessage(message.content, message.author);
  if (!result) return;

  console.log(`${result.username} ${result.day_number}`);

  const inserted = insertResult(result);
  if (!inserted) return;

  // console.log(`Inserted result for ${result.username}: ${result.score}/${result.total} — deploying...`);
  await message.react('🐈');

  exec('npm run deploy', { cwd: ROOT }, (err, stdout, stderr) => {
    if (err) {
      console.error(`Deploy failed: ${stderr}`);
    } else {
      console.log(`Deploy complete: ${stdout.trim()}`);
    }
  });
});

client.login(process.env.DISCORD_BOT_TOKEN);
