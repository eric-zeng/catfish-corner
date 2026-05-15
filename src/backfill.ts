// One-shot script that fetches all channel history back to the CUTOFF date and inserts any valid
// catfishing.net results into SQLite. Run this to seed the database before starting the bot.
import 'dotenv/config';
import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import { initDb, closeDb } from './lib/db';
import { syncChannel, CUTOFF } from './lib/sync';

const CHANNEL_ID = process.argv[2] ?? process.env.DISCORD_CHANNEL_ID;
if (!CHANNEL_ID) {
  console.error('Usage: npx tsx src/backfill.ts <channel-id>');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('clientReady', async () => {
  console.log(`Logged in as ${client.user!.tag}`);
  initDb();

  const channel = await client.channels.fetch(CHANNEL_ID!);
  if (!(channel instanceof TextChannel)) {
    console.error('Not a text channel or channel not found');
    process.exit(1);
  }

  console.log(`Syncing #${channel.name}...`);
  const inserted = await syncChannel(channel, CUTOFF);
  console.log(`Done. ${inserted} new results inserted.`);

  closeDb();
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
