// One-shot script that fetches all channel history back to the CUTOFF date and inserts any valid
// catfishing.net results into SQLite. Run this to seed the database before starting the bot.
import 'dotenv/config';
import commandLineArgs from 'command-line-args';
import commandLineUsage, { type OptionDefinition } from 'command-line-usage';
import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import { initDb, closeDb } from './lib/db';
import { syncChannel, CUTOFF } from './lib/sync';

const optionDefs: OptionDefinition[] = [
  { name: 'channel', type: String, defaultOption: true, description: 'Discord channel ID to backfill (overrides DISCORD_CHANNEL_ID env var).' },
  { name: 'help',    type: Boolean, defaultValue: false, description: 'Show this help message.', alias: 'h' },
];
const opts = commandLineArgs(optionDefs);

if (opts['help']) {
  console.log(commandLineUsage([
    { header: 'npm run backfill', content: 'Fetches all channel history back to the cutoff date and inserts any valid catfishing.net results into SQLite.' },
    { header: 'Options', optionList: optionDefs },
  ]));
  process.exit(0);
}

const CHANNEL_ID = opts['channel'] ?? process.env.DISCORD_CHANNEL_ID;
if (!CHANNEL_ID) {
  console.error('Error: no channel ID provided. Pass it as an argument or set DISCORD_CHANNEL_ID.');
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
