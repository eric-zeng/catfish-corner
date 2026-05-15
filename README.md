# bront and friends' catfish corner

Leaderboard for catfishing.net for me and my friends

## Architecture

Here are the main components of the project:

**Discord bot** (`src/bot.ts`) — A persistent [discord.js](https://discord.js.org) process that listens for catfishing.net results in a configured channel and writes them to a local SQLite database. On startup and every hour it backfills any messages missed while offline. It also reacts to each result with an emoji based on the score, and posts a daily summary at 9pm ET.

**Database** (`data/catfish.db`) — SQLite database where all raw results are stored. The bot writes to this; it can also be populated by the backfill script.

**Python analysis pipeline** (`pipeline/`) — Scripts that compute aggregate stats and generate JSON outputs for the frontend. The entry point is `pipeline/run.py`.

**Static site** (`site/`) — Contains the generated static site, pushed to the `gh-pages` branch on every update. Uses React 18 + Babel Standalone loaded from CDN — no build step. The pipeline and deploy are triggered automatically by the bot whenever new results are written.

### Pipeline

1. Bot listens for new catfishing.net posts
2. New post is parsed, inserted into SQLite, and the bot reacts with a score-based emoji
3. Bot triggers the Python pipeline to regenerate the site
4. Pipeline reads from the database, aggregates stats, and writes JSON to `site/`
5. Updated static site is deployed to GitHub Pages
6. At 9pm ET, the bot posts a daily summary to the channel (skipped if no results were posted that day)

## How to run

### Prerequisites

- Node.js 20+
- Python 3.10+
- A Discord bot token ([discord.com/developers](https://discord.com/developers))
- [pm2](https://pm2.keymetrics.io) for running the bot as a daemon (`npm install -g pm2`)

### Setup

```bash
npm install
pip install -r requirements.txt
cp .env.example .env
# fill in DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID in .env
```

### Populate the database

Before starting the bot for the first time, run the backfill script to pull in existing channel history:

```bash
npm run backfill
```

This fetches all messages from the configured channel back to the initial cutoff date and inserts any valid results into the database.

### Preview the site locally

```bash
npm run generate   # regenerate site/ from the current database
npm run serve      # serve at http://localhost:8080
```

### Deployment

To deploy manually at any time:

```bash
npm run deploy
```

Configure GitHub Pages in your repo settings to serve from the `gh-pages` branch.

### Scrape answer metadata

The per-day breakdown table shows article names and Wikipedia links as column headers. These are scraped from catfishing.net and stored in the `answers` table. Run this whenever new days are missing answer metadata:

```bash
npm run scrape                 # auto-play mode (default): skips through each question to reveal answers
npm run scrape -- --results    # results mode: uploads a stats export file, then scrapes the results page
```

**Auto-play mode** navigates to each unplayed day, clicks "Skip" on every question, and reads the answer screen. No account or stats file required.

**Results mode** uploads a catfishing.net stats export (`.gz` file) to `catfishing.net/settings`, then scrapes the already-played results page for each day. Requires updating `STATS_FILE` in `src/scrape_answers.ts` to point to your export.

### Daily summary

The bot automatically posts a summary to the channel at 9pm ET each day. To post one manually:

```bash
npm run summary          # summarizes the most recent day
npm run summary -- 42    # summarizes a specific day number
```

### Running the bot

The bot listens for new messages, updates the database, reacts to results, and triggers a deploy whenever new results are added. It also performs an hourly sync to catch any missed messages.

#### Locally

```bash
npm start
```

#### As a daemon with pm2

```bash
pm2 start ecosystem.config.cjs
pm2 save     # persist across reboots
pm2 startup  # enable autostart on login
```
