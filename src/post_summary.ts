// One-shot script that posts a daily summary message to the configured Discord channel.
// Accepts an optional day number argument; defaults to the most recent day in the database.
import 'dotenv/config';
import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import { initDb } from './lib/db';
import { postDailySummary } from './lib/summary';

const CHANNEL_ID = process.env.DISCORD_CHANNEL_ID ?? '';
const dayArg = process.argv[2] ? parseInt(process.argv[2]) : undefined;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('clientReady', async () => {
  initDb();

  const ch = await client.channels.fetch(CHANNEL_ID).catch(() => null);
  if (!(ch instanceof TextChannel)) {
    console.error(`Could not fetch channel ${CHANNEL_ID}`);
    await client.destroy();
    return;
  }

  await postDailySummary(ch, dayArg);
  await client.destroy();
});

client.login(process.env.DISCORD_BOT_TOKEN);
