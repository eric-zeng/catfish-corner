import type { TextChannel } from 'discord.js';
import { getLatestDayNumber, getLatestDayDate, getDayResults, getUserBestScoreExcluding } from './db';

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

  const lines = [
    `🐈 Results for #${dayNumber} 🐟`,
    `🏆 Top score: ${topLine}`,
    `🤝 Average score: ${average.toFixed(1)}/10`,
    ...pbLines,
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

function nextNinePMET(): Date {
  const now = new Date();

  function toTZDate(dateStr: string, hour: number): Date {
    const fakeUTC = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00Z`);
    const tzHour = parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        hour12: false,
      }).format(fakeUTC),
    );
    return new Date(fakeUTC.getTime() + (hour - tzHour) * 3600000);
  }

  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const todayTarget = toTZDate(todayStr, 21);
  if (todayTarget > now) return todayTarget;

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return toTZDate(tomorrowStr, 21);
}

export function scheduleDailySummary(getChannel: () => Promise<TextChannel | null>): void {
  function schedule() {
    const target = nextNinePMET();
    const delay = target.getTime() - Date.now();
    console.log(`Daily summary scheduled for ${target.toISOString()} (${Math.round(delay / 60000)} min)`);
    setTimeout(async () => {
      const latestDate = getLatestDayDate();
      const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const latestDateET = latestDate
        ? new Date(latestDate).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
        : null;
      if (latestDateET !== todayET) {
        console.log('Summary: no results for today — skipping');
        schedule();
        return;
      }
      const channel = await getChannel();
      if (channel) await postDailySummary(channel);
      schedule();
    }, delay);
  }
  schedule();
}
