# Telegram Queue Bot

A Telegram bot that receives social media links (YouTube, Instagram, Reddit, Twitter/X, Facebook, Tumblr), lets you pick video quality, queues them with a 10-minute gap, and posts them to a target group.

**No server needed. No database needed. Laptop can stay off.**

Runs entirely on free tiers: Vercel + Vercel KV + Cobalt.

---

## Architecture

```
You send link in Telegram
    ↓
Telegram webhook → Vercel API route (instant)
    ↓
Bot replies with quality buttons: [1080p] [720p] [480p] [360p] [Link]
    ↓
You tap a button → callback webhook → Vercel
    ↓
Vercel stores in KV queue: {url, quality, timestamp}
    ↓
Vercel Cron (every 1 min) checks: "10 min passed since last post?"
    ↓
Yes → Cobalt downloads media → Vercel uploads to Telegram group
    ↓
No → wait
```

## What you need

1. **Telegram Bot Token** — from [@BotFather](https://t.me/BotFather)
2. **Telegram Group Chat ID** — the group where bot will post
3. **Vercel account** — free at [vercel.com](https://vercel.com)
4. **Vercel KV** — free Redis storage (created inside Vercel dashboard)
5. **Cobalt instance** — media downloader (self-hosted or use public instance for testing)

---

## Step-by-step setup

### Step 1: Create the Telegram Bot

1. Open Telegram, search for **@BotFather**
2. Send `/newbot`
3. Give it a name (e.g. "My Queue Bot")
4. Give it a username (must end in `bot`, e.g. `my_queue_bot`)
5. Copy the **bot token** (looks like `123456:ABC-DEF1234...`)
6. Save it — you'll need it for the `TELEGRAM_BOT_TOKEN` env var

### Step 2: Get your target group chat ID

1. Create a Telegram group (or use an existing one)
2. Add your bot to the group
3. Send a message in the group
4. Visit this URL in your browser:
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
5. Look for `"chat":{"id":-1001234567890}` in the response
6. Copy the chat ID (including the `-100` prefix) — this is your `TELEGRAM_TARGET_CHAT_ID`

### Step 3: Deploy to Vercel

1. Create a new GitHub repo and upload all these files
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub
3. Click **New Project** → import your repo
4. Vercel will auto-detect the project (Node.js)
5. **Don't deploy yet** — first add environment variables (next step)

### Step 4: Set environment variables in Vercel

In your Vercel project settings → **Environment Variables**, add:

| Name | Value |
|------|-------|
| `TELEGRAM_BOT_TOKEN` | Your bot token from BotFather |
| `TELEGRAM_TARGET_CHAT_ID` | Your group chat ID (e.g. `-1001234567890`) |
| `COBALT_API_URL` | URL of your Cobalt instance (e.g. `https://co.yourname.koyeb.app`) |
| `QUEUE_GAP_MINUTES` | `10` (or whatever gap you want) |
| `KV_REST_API_URL` | (Auto-filled when you create Vercel KV) |
| `KV_REST_API_TOKEN` | (Auto-filled when you create Vercel KV) |
| `CRON_SECRET` | Any random string (e.g. `my-secret-123`) |

**Deploy the project now.**

### Step 5: Set up Vercel KV (Queue storage)

1. In Vercel dashboard → your project → **Storage** tab
2. Click **Create Database** → select **KV**
3. Vercel will auto-inject `KV_REST_API_URL` and `KV_REST_API_TOKEN` into your env vars
4. Re-deploy your project to pick up the new env vars

### Step 6: Set up Cobalt (media downloader)

**Option A: Use a public Cobalt instance (for testing)**
- Set `COBALT_API_URL` to a public instance like `https://co.wukko.me`
- Note: public instances may have rate limits

**Option B: Self-host Cobalt on Koyeb (recommended, free)**

1. Go to [koyeb.com](https://koyeb.com) and sign up
2. Click **Create Service** → **Docker**
3. Image: `ghcr.io/imputnet/cobalt:latest`
4. Port: `9000`
5. Set environment variable: `API_URL` = `https://your-service-name.koyeb.app`
6. Deploy
7. Set `COBALT_API_URL` in your Vercel project to the Koyeb URL
8. Re-deploy Vercel

**Option C: Self-host on Render (alternative, free)**

1. Go to [render.com](https://render.com) and sign up
2. New → **Web Service** → connect your GitHub
3. Use the Cobalt repo: `https://github.com/imputnet/cobalt`
4. Docker image, port `9000`
5. Free tier works for testing
6. Set `COBALT_API_URL` to your Render URL

### Step 7: Set the Telegram webhook

After your Vercel project is deployed:

1. Visit your deployment URL + `/api/setup` in your browser:
   ```
   https://your-project.vercel.app/api/setup
   ```
2. You should see a JSON response confirming the webhook is set
3. Your bot is now live!

### Step 8: Test it

1. Open Telegram, find your bot
2. Send `/start`
3. Send a YouTube/Instagram/Twitter link
4. Tap a quality button
5. Wait for the cron to process it (within 1 minute)
6. Check your target group — the content should appear there

---

## How it works

### Files

```
├── api/
│   ├── webhook.js     ← Telegram sends updates here (POST)
│   ├── cron.js        ← Vercel Cron calls this every minute (GET)
│   └── setup.js      ← One-time setup: sets Telegram webhook (GET)
├── lib/
│   ├── kv.js         ← Queue storage (Vercel KV / Redis)
│   ├── telegram.js   ← Telegram Bot API wrapper
│   ├── cobalt.js     ← Cobalt media downloader API wrapper
│   └── handlers.js   ← Main bot logic (messages, buttons, queue)
├── package.json
├── vercel.json        ← Cron config (runs every minute)
├── .env.example
└── .gitignore
```

### Queue logic

- Each link you send creates a queue item with status `awaiting_quality`
- When you tap a quality button, the item becomes `queued`
- The cron job runs every minute and checks:
  - Is there a `queued` item?
  - Has `QUEUE_GAP_MINUTES` (default 10) passed since the last post?
  - If yes → download via Cobalt → send to target group → mark `done`
- If download fails, the bot sends the raw link as fallback

### Quality options

The bot shows these buttons for every link:

- 1080p HD
- 720p
- 480p
- 360p
- Just send link (no download, Telegram shows a preview card)

### Commands

- `/start` — Welcome message
- `/queue` — Show queue status and countdown to next post
- `/stats` — Show item counts by status

---

## Troubleshooting

**Bot doesn't respond to messages**
- Check that the webhook is set: visit `/api/setup`
- Check Vercel logs for errors
- Make sure `TELEGRAM_BOT_TOKEN` is correct

**Bot responds but nothing appears in the group**
- Make sure the bot is added to the target group
- Make sure `TELEGRAM_TARGET_CHAT_ID` is correct (include `-100` prefix for supergroups)
- Make sure the bot has permission to post in the group

**Media download fails**
- Check that `COBALT_API_URL` is set correctly (no trailing slash)
- Check that your Cobalt instance is running
- The bot will fall back to sending the raw link if download fails

**Cron not running**
- Check `vercel.json` — it should have the cron config
- Vercel free tier supports up to 2 cron jobs
- Cron jobs run in the deployment region (usually US East)

**Vercel KV errors**
- Make sure KV is created in your Vercel project
- Check that `KV_REST_API_URL` and `KV_REST_API_TOKEN` are in env vars
- Re-deploy after adding KV

---

## Costs

All on free tiers:

| Service | Free tier | Your usage |
|---------|-----------|------------|
| Vercel | 100K function invocations/month | ~3,000-5,000/month for personal use |
| Vercel KV | 30K commands/month, 256MB | ~2,000/month for personal use |
| Cobalt on Koyeb | 1 always-on service | 1 service |
| Telegram | Free forever | 1 bot |

You'd only hit limits if you process 100+ links/day.

---

## Customization

### Change the gap between posts

Set `QUEUE_GAP_MINUTES` env var. Default is 10 minutes. Set to 5 for faster posting, 30 for slower.

### Add more platforms

Edit `lib/cobalt.js` → `detectPlatform()` and `VALID_PLATFORMS`. Cobalt supports many more platforms (TikTok, Twitch, Vimeo, SoundCloud, etc.) — just add the domain detection.

### Add more quality options

Edit `lib/cobalt.js` → `getQualityOptions()`. Cobalt supports: 144, 240, 360, 480, 720, 1080, 1440, 2160.

---

## License

MIT — do whatever you want.
