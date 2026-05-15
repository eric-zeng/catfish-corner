import type { Message } from 'discord.js';

export async function reactToScore(message: Message, score: number): Promise<void> {
  if (score >= 10) {
    await message.react('🤯');
  } else if (score >= 8) {
    await message.react('🥳');
  } else if (score >= 6) {
    await message.react('🙌');
  } else if (score >= 4) {
    await message.react('👌');
  } else if (score >= 2) {
    await message.react('🤷‍♂️');
  } else {
    await message.react('🫵');
    await message.react('💩');
  }
}
