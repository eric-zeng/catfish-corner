import 'dotenv/config';
import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import { initDb, insertResult, closeDb } from './db';
import { parseMessage } from './parser';

const CHANNEL_ID = process.argv[2];
if (!CHANNEL_ID) {
  console.error('Usage: npx tsx backfill.ts <channel-id>');
  process.exit(1);
}

// April 23, 2026 12:00 PM EDT = 16:00 UTC
const CUTOFF = new Date('2026-04-23T16:00:00Z');

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

  const channel = await client.channels.fetch(CHANNEL_ID);
  if (!(channel instanceof TextChannel)) {
    console.error('Not a text channel or channel not found');
    process.exit(1);
  }

  console.log(`Scraping #${channel.name} back to ${CUTOFF.toLocaleString()}...\n`);

  let inserted = 0;
  let lastId: string | undefined;

  outer: while (true) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(lastId ? { before: lastId } : {}),
    });

    if (batch.size === 0) break;

    for (const message of batch.values()) {
      if (message.createdAt < CUTOFF) break outer;

      const result = parseMessage(message.content, message.author);
      if (!result) continue;

      result.date = message.createdAt;
      insertResult(result);
      console.log(`  ✓ Day #${result.day_number} — ${result.username} ${result.score}/${result.total} (${message.createdAt.toLocaleDateString()})`);
      inserted++;
    }

    lastId = batch.last()?.id;
  }

  console.log(`\nDone. ${inserted} results inserted.`);
  closeDb();
  process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
