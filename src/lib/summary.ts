import type { TextChannel } from 'discord.js';
import { getLatestDayNumber, getDayResults, getDayGuesses, getDayAnswers, getUserBestScoreExcluding, getWeeklyActiveUserIds, hasSummaryBeenPosted, markSummaryPosted } from './db';

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

  let minCount = Infinity;
  const tied: { article_name: string; mentions: string[] }[] = [];

  for (const { answer_index, article_name } of answers) {
    const players = allGuesses.filter(g => g.guesses[answer_index] > 0);
    if (players.length === 0) continue;
    const mentions = players.map(g => `<@${g.user_id}>`);
    if (players.length < minCount) {
      minCount = players.length;
      tied.length = 0;
      tied.push({ article_name, mentions });
    } else if (players.length === minCount) {
      tied.push({ article_name, mentions });
    }
  }

  if (tied.length === 0) return null;
  const parts = tied.map(t => `${t.article_name} (${t.mentions.join(', ')})`).join(', ');
  return `🤔🎣 Rarest ${tied.length > 1 ? 'pulls' : 'pull'}: ${parts}`;
}

function moggingLine(results: { user_id: string; score: number }[]): string | null {
  if (results.length < 2) return null;
  const sorted  = [...results].sort((a, b) => b.score - a.score);
  const top      = sorted[0];
  const restAvg  = sorted.slice(1).reduce((sum, r) => sum + r.score, 0) / (sorted.length - 1);
  const margin   = top.score - restAvg;
  if (margin < 3) return null;
  return `:disco: <@${top.user_id}> mogged the rest of the group (scored ${top.score}, average of the rest was ${restAvg.toFixed(1)})`;
}

function buildMessage(dayNumber: number): string | null {
  const results = getDayResults(dayNumber);
  if (results.length === 0) return null;

  const maxScore = Math.max(...results.map(r => r.score));
  const topScorers = results.filter(r => r.score === maxScore);
  const average = results.reduce((sum, r) => sum + r.score, 0) / results.length;

  const topLine = topScorers.map(r => `<@${r.user_id}>`).join(', ') + ` ${maxScore}/10`;

  const pbLines: string[] = [];
  for (const r of results) {
    const prevBest = getUserBestScoreExcluding(r.user_id, dayNumber);
    if (prevBest === null) continue;
    if (r.score > prevBest) {
      pbLines.push(`🥳 <@${r.user_id}> set a new personal best! (${r.score}/10)`);
    } else if (r.score === prevBest) {
      pbLines.push(`👏 <@${r.user_id}> tied their personal best! (${r.score}/10)`);
    }
  }

  const mog  = moggingLine(results);
  const pull = bestPullLine(dayNumber);

  const lines = [
    `🐈 Results for #${dayNumber} 🐟`,
    `🏆 Top score: ${topLine}`,
    `🤝 Average score: ${average.toFixed(1)}/10`,
    ...pbLines,
    ...(mog  ? [mog]  : []),
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

export interface SummarySchedule {
  timeout: ReturnType<typeof setTimeout> | null;
  getChannel: () => Promise<TextChannel | null>;
}

function scheduleNext(handle: SummarySchedule): void {
  const target = nextSummaryTime();
  const delay = target.getTime() - Date.now();
  console.log(`Daily summary scheduled for ${target.toISOString()} (${Math.round(delay / 60000)} min)`);
  handle.timeout = setTimeout(async () => {
    const dayId = todayDayIdPT();
    const channel = await handle.getChannel();
    if (channel) {
      await postDailySummary(channel, dayId);
      markSummaryPosted(dayId);
    }
    handle.timeout = null;
    scheduleNext(handle);
  }, delay);
}

export function scheduleDailySummary(getChannel: () => Promise<TextChannel | null>): SummarySchedule {
  const handle: SummarySchedule = { timeout: null, getChannel };
  scheduleNext(handle);
  return handle;
}

export async function checkAllPosted(handle: SummarySchedule): Promise<void> {
  const dayId = todayDayIdPT();
  if (hasSummaryBeenPosted(dayId)) {
    console.log(`checkAllPosted: already posted for day ${dayId}`);
    return;
  }

  const weeklyUsers = getWeeklyActiveUserIds(dayId);
  if (weeklyUsers.length === 0) {
    console.log('checkAllPosted: no weekly active users');
    return;
  }

  const todayUserIds = new Set(getDayResults(dayId).map(r => r.user_id));
  const missing = weeklyUsers.filter(uid => !todayUserIds.has(uid));
  if (missing.length > 0) {
    console.log(`checkAllPosted: waiting on ${missing.length} user(s): ${missing.join(', ')}`);
    return;
  }

  console.log('All weekly active users posted — sending early summary');
  if (handle.timeout !== null) {
    clearTimeout(handle.timeout);
    handle.timeout = null;
  }

  const channel = await handle.getChannel();
  if (channel) {
    await postDailySummary(channel, dayId);
    markSummaryPosted(dayId);
  }
  scheduleNext(handle);
}
