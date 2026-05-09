const CAT  = '🐈';
const FISH = '🐟';
const EGG  = '🥚';

export interface ParsedResult {
  username: string;
  user_id: string;
  date: Date;
  day_number: number;
  score: number;
  total: number;
  guesses: string;
}

interface MessageAuthor {
  username: string;
  id: string;
}

export function parseMessage(content: string, author: MessageAuthor): ParsedResult | null {
  const headerMatch = content.match(/#(\d+)\s*-\s*(\d+(?:\.\d+)?)\/(\d+)/);
  if (!headerMatch) return null;

  const day_number = parseInt(headerMatch[1]);
  const score      = parseFloat(headerMatch[2]);
  const total      = parseInt(headerMatch[3]);

  const guesses: number[] = [];
  for (const char of content.slice(headerMatch.index! + headerMatch[0].length)) {
    if (char === CAT)       guesses.push(1);
    else if (char === FISH) guesses.push(0);
    else if (char === EGG)  guesses.push(0.5);
  }

  if (guesses.length === 0) return null;

  return {
    username: author.username,
    user_id: author.id,
    date: new Date(),
    day_number,
    score,
    total,
    guesses: JSON.stringify(guesses),
  };
}
