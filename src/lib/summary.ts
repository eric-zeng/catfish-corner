import type { TextChannel } from 'discord.js';
import { getLatestDayNumber, getDayResults, getDayGuesses, getDayAnswers, getUserBestScoreExcluding } from './db';

// Day 690 = 2026-05-14 (PT). Used to map calendar dates to day IDs.
const ANCHOR_DAY_ID  = 690;
const ANCHOR_DATE_PT = '2026-05-14';

function dayIdForDatePT(datePT: string): number {
  const msPerDay = 86_400_000;
  const diff = Date.UTC(...(datePT.split('-').map(Number) as [number, number, number]))
             - Date.UTC(...(ANCHOR_DATE_PT.split('-').map(Number) as [number, number, number]));
  return ANCHOR_DAY_ID + Math.round(diff / msPerDay);
}

function todayDayIdPT(): number {
  const datePT = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  return dayIdForDatePT(datePT);
}

function bestPullLine(dayNumber: number): string | null {
  const answers = getDayAnswers(dayNumber);
  if (answers.length === 0) return null;
  const allGuesses = getDayGuesses(dayNumber);

  let bestArticle: string | null = null;
  let bestPlayers: string[] = [];
  for (const { answer_index, article_name } of answers) {
    const players = allGuesses.filter(g => g.guesses[answer_index] > 0).map(g => g.username);
    if (players.length === 0 || players.length >= (bestPlayers.length || Infinity)) continue;
    bestPlayers = players;
    bestArticle = article_name;
  }

  return bestArticle
    ? `🤔🎣 Best pull: ${bestArticle} (${bestPlayers.join(', ')})`
    : null;
}

function buildMessage(dayNumber: number): string | null {
  const results = getDayResults(dayNumber);
  if (results.length === 0) return null;

  const maxScore = Math.max(...results.map(r => r.score));
  const topScorers = results.filter(r => r.score === maxScore);
  const average = results.reduce((sum, r) => sum + r.score, 0) / results.length;

  const topLine = topScorers.map(r => r.username).join(', ') + ` ${maxScore}/10`;

  const pbLines: string[] = [];
  for (const r of results) {
    const prevBest = getUserBestScoreExcluding(r.user_id, dayNumber);
    if (prevBest === null) continue;
    if (r.score > prevBest) {
      pbLines.push(`🥳 ${r.username} set a new personal best! (${r.score}/10)`);
    } else if (r.score === prevBest) {
      pbLines.push(`👏 ${r.username} tied their personal best! (${r.score}/10)`);
    }
  }

  const pull = bestPullLine(dayNumber);

  const lines = [
    `🐈 Results for #${dayNumber} 🐟`,
    `🏆 Top score: ${topLine}`,
    `🤝 Average score: ${average.toFixed(1)}/10`,
    ...pbLines,
    ...(pull ? [pull] : []),
    'View leaderboard: https://eric-zeng.github.io/catfish-corner/',
  ];
  return lines.join('\n');
}

export async function postDailySummary(
  channel: TextChannel,
  dayNumber?: number,
): Promise<void> {
  const day = dayNumber ?? getLatestDayNumber();
  if (day === null) {
    console.log('Summary: no results in DB');
    return;
  }

  const message = buildMessage(day);
  if (!message) {
    console.log(`Summary: no results for day ${day}`);
    return;
  }

  await channel.send(message);
  console.log(`Summary posted for day ${day}`);
}

function nextSummaryTime(): Date {
  const now = new Date();

  function elevenFiftyNinePT(dateStr: string): Date {
    // Probe at 23:00 UTC to determine the PT offset on that date (handles DST)
    const probe = new Date(`${dateStr}T23:00:00Z`);
    const localHour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: '2-digit',
        hour12: false,
      }).format(probe),
    );
    return new Date(probe.getTime() + (23 - localHour) * 3_600_000 + 59 * 60_000);
  }

  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  const todayTarget = elevenFiftyNinePT(todayStr);
  if (todayTarget > now) return todayTarget;

  const tomorrow = new Date(now.getTime() + 24 * 3_600_000);
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  return elevenFiftyNinePT(tomorrowStr);
}

export function scheduleDailySummary(getChannel: () => Promise<TextChannel | null>): void {
  function schedule() {
    const target = nextSummaryTime();
    const delay = target.getTime() - Date.now();
    console.log(`Daily summary scheduled for ${target.toISOString()} (${Math.round(delay / 60000)} min)`);
    setTimeout(async () => {
      const dayId = todayDayIdPT();
      const channel = await getChannel();
      if (channel) await postDailySummary(channel, dayId);
      schedule();
    }, delay);
  }
  schedule();
}
