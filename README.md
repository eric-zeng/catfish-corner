# bront and friends' catfish corner

Leaderboard for catfishing.net for me and my friends

## Architecture

Here are the main components of the project:

**Discord bot** (`src/bot.ts`) — A persistent [discord.js](https://discord.js.org) process that listens for catfishing.net results in configured channels and writes them to a local SQLite database. On startup and every hour it backfills any messages missed while offline.

**Database** (`data/catfish.db`) — SQLite database -- where all of the raw results are stored. The bot writes to this, it can also be populated by the backfill script.

**Python analysis pipeline** (`pipeline/`) — Scripts here compute aggregate stats and
generate HTML or other outputs for the frontend. The entry point is `pipeline/generate.py`.

**Templates** (`templates/`) — Jinja2 templates for rendering the site.

**Static site** (`site/`) — This directory contains the generated static site, and is pushed to the `gh-pages` branch on every update. The pipeline and deploy are triggered automatically by the bot whenever new results are written.

### Pipeline

Here's how it all fits together:

1. Bot listens for new catfishing.net posts
2. New post is parsed and inserted into the SQLite database
3. Bot triggers the Python pipeline to regenerate the site
4. Pipeline reads from the database, aggregates and computes stats, and renders HTML templates
5. Updated static site is deployed to GitHub Pages


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
# fill in DISCORD_BOT_TOKEN and DISCORD_CHANNEL_IDS in .env
```

### Populate the database

Before starting the bot for the first time, run the backfill script to pull in existing channel history:

```bash
npm run backfill
```

This fetches all messages from the configured channels back to the initial cutoff date and inserts any valid results into the database.

### Preview the site locally

```bash
npm run generate   # build site/index.html from the current database
npm run serve      # serve at http://localhost:8080
```

### Deployment

To deploy manually at any time:

```bash
npm run deploy
```

Configure GitHub Pages in your repo settings to serve from the `gh-pages` branch.

### Running the bot

The discord bot listens for new messages, updates the database, and triggers a site regeneration and deployment whenever new results are added. It also performs an hourly sync to catch any missed messages.

#### Locally

```bash
npm run start
```

#### As a daemon with pm2
I use this to keep the bot running on my laptop 24/7. It's a hobby project so it's okay
if I close the lid.

```bash
pm2 start ecosystem.config.cjs
pm2 save     # persist across reboots
pm2 startup  # enable autostart on login
```
