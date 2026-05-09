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
  const lines = content.trim().split('\n');

  if (lines[0].trim() !== 'catfishing.net') return null;
  if (lines.length < 3) return null;

  const dayMatch   = lines[1].match(/#(\d+)/);
  const scoreMatch = lines[1].match(/(\d+(?:\.\d+)?)\/(\d+)/);
  if (!dayMatch || !scoreMatch) return null;

  const day_number = parseInt(dayMatch[1]);
  const score      = parseFloat(scoreMatch[1]);
  const total      = parseInt(scoreMatch[2]);

  const guesses: number[] = [];
  for (let i = 2; i < lines.length; i++) {
    for (const char of lines[i].trim()) {
      if (char === CAT)  guesses.push(1);
      else if (char === FISH) guesses.push(0);
      else if (char === EGG)  guesses.push(0.5);
    }
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
