import { TextChannel } from 'discord.js';
import { insertResult, getLatestEntryDate } from './db';
import { parseMessage } from './parser';

// Fallback cutoff if the database is empty
export const CUTOFF = new Date('2026-04-23T16:00:00Z');

export async function syncChannel(channel: TextChannel, since?: Date): Promise<number> {
  since ??= getLatestEntryDate() ?? CUTOFF;
  let inserted = 0;
  let lastId: string | undefined;

  outer: while (true) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(lastId ? { before: lastId } : {}),
    });

    if (batch.size === 0) break;

    for (const message of batch.values()) {
      if (message.createdAt <= since) break outer;

      const result = parseMessage(message.content, message.author);
      if (!result) { continue; }

      result.date = message.createdAt;
      if (insertResult(result)) inserted++;
    }

    lastId = batch.last()?.id;
  }

  return inserted;
}
