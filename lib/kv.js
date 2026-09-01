/**
 * Vercel KV queue helpers.
 *
 * Queue item shape:
 * {
 *   id:        string,   // unique id (used as callback_data)
 *   url:       string,   // original social media link
 *   platform:  string,   // detected platform
 *   quality:   string|null,  // chosen quality (null until user picks)
 *   status:    "awaiting_quality" | "queued" | "processing" | "done" | "failed",
 *   added_at:  number,  // Date.now()
 * }
 *
 * We also track `last_posted_at` in a separate key.
 */

const QUEUE_KEY = 'bot:queue';
const LAST_POSTED_KEY = 'bot:last_posted';

/** @returns {Promise<any[]>} */
async function getQueue() {
  const raw = await kvGet(QUEUE_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveQueue(queue) {
  await kvSet(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Add a new item to the queue.
 * @returns {Promise<object>} the created item
 */
async function addItem(url, platform) {
  const queue = await getQueue();
  const item = {
    id: 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    url,
    platform,
    quality: null,
    status: 'awaiting_quality',
    added_at: Date.now(),
  };
  queue.push(item);
  await saveQueue(queue);
  return item;
}

/**
 * Update a specific item by id.
 * Returns the updated item, or null if not found.
 */
async function updateItem(id, updates) {
  const queue = await getQueue();
  const idx = queue.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  queue[idx] = { ...queue[idx], ...updates };
  await saveQueue(queue);
  return queue[idx];
}

/**
 * Remove an item by id.
 */
async function removeItem(id) {
  const queue = await getQueue();
  const filtered = queue.filter((i) => i.id !== id);
  await saveQueue(filtered);
}

/**
 * Get the next item that is ready to send (status "queued", quality picked).
 * Returns null if queue is empty or nothing is ready.
 */
async function getNextReady() {
  const queue = await getQueue();
  return queue.find((i) => i.status === 'queued') || null;
}

/**
 * Get the count of items ahead of a given item in the queue
 * (items with status "queued" or "processing" that were added before it).
 */
async function getPosition(id) {
  const queue = await getQueue();
  const item = queue.find((i) => i.id === id);
  if (!item) return 0;
  return queue.filter(
    (i) =>
      (i.status === 'queued' || i.status === 'processing') &&
      i.added_at <= item.added_at
  ).length;
}

/**
 * Count items by status.
 */
async function getQueueStats() {
  const queue = await getQueue();
  return {
    awaiting_quality: queue.filter((i) => i.status === 'awaiting_quality').length,
    queued: queue.filter((i) => i.status === 'queued').length,
    processing: queue.filter((i) => i.status === 'processing').length,
    total: queue.length,
  };
}

// ---- last posted timestamp ----

async function getLastPostedAt() {
  const raw = await kvGet(LAST_POSTED_KEY);
  return raw ? parseInt(raw, 10) : 0;
}

async function setLastPostedAt(ts) {
  await kvSet(LAST_POSTED_KEY, String(ts));
}

/**
 * Check if enough time has passed since the last post.
 * @param {number} gapMinutes
 * @returns {Promise<{ready: boolean, msRemaining: number}>}
 */
async function canPostNow(gapMinutes) {
  const last = await getLastPostedAt();
  const gapMs = gapMinutes * 60 * 1000;
  const elapsed = Date.now() - last;
  if (elapsed >= gapMs) return { ready: true, msRemaining: 0 };
  return { ready: false, msRemaining: gapMs - elapsed };
}

// ---- KV wrapper (works with @vercel/kv or falls back to in-memory for local dev) ----

let _kv = null;

async function kvGet(key) {
  try {
    const { kv } = await import('@vercel/kv');
    _kv = kv;
    return await kv.get(key);
  } catch {
    // fallback for local dev without KV
    if (!_kv) _kv = {};
    return _kv[key] ?? null;
  }
}

async function kvSet(key, value) {
  try {
    const { kv } = await import('@vercel/kv');
    _kv = kv;
    await kv.set(key, value);
  } catch {
    if (!_kv) _kv = {};
    _kv[key] = value;
  }
}

module.exports = {
  getQueue,
  addItem,
  updateItem,
  removeItem,
  getNextReady,
  getPosition,
  getQueueStats,
  getLastPostedAt,
  setLastPostedAt,
  canPostNow,
};
