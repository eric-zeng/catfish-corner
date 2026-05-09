import 'dotenv/config';
import { Client, GatewayIntentBits, type Message } from 'discord.js';
import { initDb, insertResult } from './db';
import { parseMessage } from './parser';

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
  console.log(`[debug] message from ${message.author.username}: ${message.content.slice(0, 50)}`);

  const result = parseMessage(message.content, message.author);
  if (!result) return;

  insertResult(result);
  // print the inserted row in catfish format
  console.log(`Inserted result for ${result.username}: ${result.score}/${result.total}`);

  await message.react('✅');
});

client.login(process.env.DISCORD_BOT_TOKEN);
