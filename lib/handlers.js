/**
 * Main bot logic — handles incoming messages, commands, and callback queries.
 */

const queue = require('./kv');
const telegram = require('./telegram');
const cobalt = require('./cobalt');

const PLATFORM_EMOJI = {
  youtube: '▶️',
  instagram: '📸',
  reddit: '👽',
  twitter: '🐦',
  facebook: '👤',
  tumblr: '📝',
};

/**
 * Handle an incoming Telegram update (message, edited_message, callback_query).
 */
async function handleUpdate(update) {
  try {
    if (update.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
  } catch (err) {
    console.error('Error handling update:', err);
  }
}

/**
 * Handle a regular text message.
 */
async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text || '';

  // /start command
  if (text.startsWith('/start')) {
    await telegram.sendMessage(
      chatId,
      '👋 <b>Queue Bot is ready!</b>\n\n' +
        'Send me a link from YouTube, Instagram, Reddit, Twitter/X, Facebook, or Tumblr.\n' +
        'I\'ll show you quality options, and queue it for your target group with a 10-minute gap between posts.\n\n' +
        'Commands:\n' +
        '/queue — Show queue status\n' +
        '/stats — Show statistics'
    );
    return;
  }

  // /queue command
  if (text.startsWith('/queue')) {
    await sendQueueStatus(chatId);
    return;
  }

  // /stats command
  if (text.startsWith('/stats')) {
    const stats = await queue.getQueueStats();
    await telegram.sendMessage(
      chatId,
      `📊 <b>Queue Stats</b>\n\n` +
        `Awaiting quality pick: ${stats.awaiting_quality}\n` +
        `Queued (ready to send): ${stats.queued}\n` +
        `Processing: ${stats.processing}\n` +
        `Total items: ${stats.total}`
    );
    return;
  }

  // Try to extract a URL
  const url = cobalt.extractUrl(text);
  if (!url) {
    await telegram.sendMessage(chatId, '⚠️ Send me a link from YouTube, Instagram, Reddit, Twitter/X, Facebook, or Tumblr.');
    return;
  }

  // Check if it's a supported platform
  const platform = cobalt.detectPlatform(url);
  if (!platform) {
    await telegram.sendMessage(chatId, `⚠️ I don't recognize this platform. Supported: YouTube, Instagram, Reddit, Twitter/X, Facebook, Tumblr.`);
    return;
  }

  // Add to queue
  const item = await queue.addItem(url, platform);

  // Get quality options
  const options = await cobalt.getQualityOptions(url);

  // Build inline keyboard
  const keyboard = [];
  const rowSize = 2;
  for (let i = 0; i < options.length; i += rowSize) {
    const row = options.slice(i, i + rowSize).map((opt) => ({
      text: opt.label,
      callback_data: `${item.id}|${opt.value}`,
    }));
    keyboard.push(row);
  }

  // Add a cancel button
  keyboard.push([{ text: '❌ Cancel', callback_data: `${item.id}|cancel` }]);

  const emoji = PLATFORM_EMOJI[platform] || '🔗';
  await telegram.sendMessageWithButtons(
    chatId,
    `${emoji} <b>${platform.toUpperCase()}</b> link received!\n\n` +
      `<a href="${url}">${url}</a>\n\n` +
      `Pick a quality to queue it:`,
    keyboard
  );
}

/**
 * Handle a callback query (button press).
 */
async function handleCallback(callbackQuery) {
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const data = callbackQuery.data;
  const callbackQueryId = callbackQuery.id;

  // Parse callback data: "itemId|quality" or "itemId|cancel"
  const [itemId, action] = data.split('|');

  if (!itemId || !action) {
    await telegram.answerCallback(callbackQueryId, 'Invalid action');
    return;
  }

  if (action === 'cancel') {
    await queue.removeItem(itemId);
    await telegram.answerCallback(callbackQueryId, '❌ Cancelled');
    await telegram.editMessageText(
      chatId,
      messageId,
      '❌ <i>Cancelled. Link removed from queue.</i>'
    );
    return;
  }

  // Quality selected
  const quality = action;
  await queue.updateItem(itemId, { quality, status: 'queued' });

  // Calculate position and estimated time
  const position = await queue.getPosition(itemId);
  const gapMinutes = parseInt(process.env.QUEUE_GAP_MINUTES || '10', 10);
  const estMinutes = position * gapMinutes;
  const estTime = estMinutes > 0 ? `~${estMinutes} min` : 'now';

  await telegram.answerCallback(callbackQueryId, `✅ Queued at ${quality}p`);

  await telegram.editMessageText(
    chatId,
    messageId,
    `✅ <b>Queued!</b>\n\n` +
      `Quality: <b>${quality === 'link' ? 'Link only' : quality + 'p'}</b>\n` +
      `Queue position: <b>#${position}</b>\n` +
      `Estimated post: <b>${estTime}</b>`,
    null
  );
}

/**
 * Send queue status to a chat.
 */
async function sendQueueStatus(chatId) {
  const stats = await queue.getQueueStats();
  const { ready, msRemaining } = await queue.canPostNow(
    parseInt(process.env.QUEUE_GAP_MINUTES || '10', 10)
  );

  let text = `📋 <b>Queue Status</b>\n\n`;
  text += `Queued items: <b>${stats.queued}</b>\n`;
  text += `Awaiting quality pick: <b>${stats.awaiting_quality}</b>\n`;
  text += `Total items: <b>${stats.total}</b>\n\n`;

  if (ready) {
    text += `🟢 <b>Ready to post!</b> Next cron tick will send the next item.`;
  } else {
    const mins = Math.ceil(msRemaining / 60000);
    text += `🔴 Next post in ~<b>${mins} min</b>`;
  }

  await telegram.sendMessage(chatId, text);
}

/**
 * Process the queue — called by the cron job.
 * Checks if enough time has passed, and if so, sends the next item.
 */
async function processQueue() {
  const gapMinutes = parseInt(process.env.QUEUE_GAP_MINUTES || '10', 10);
  const { ready, msRemaining } = await queue.canPostNow(gapMinutes);

  if (!ready) {
    const mins = Math.ceil(msRemaining / 60000);
    console.log(`Not ready to post yet. ${mins} min remaining.`);
    return { posted: false, reason: `waiting ${mins} min` };
  }

  const item = await queue.getNextReady();
  if (!item) {
    console.log('Queue is empty. Nothing to post.');
    return { posted: false, reason: 'queue empty' };
  }

  console.log(`Processing item ${item.id}: ${item.url} at ${item.quality}`);

  // Mark as processing
  await queue.updateItem(item.id, { status: 'processing' });

  try {
    // Fetch media from Cobalt
    const result = await cobalt.fetchMedia(item.url, item.quality);
    const targetChat = telegram.targetChat();

    if (!targetChat) {
      console.error('TELEGRAM_TARGET_CHAT_ID not set!');
      await queue.updateItem(item.id, { status: 'queued' });
      return { posted: false, reason: 'no target chat' };
    }

    const caption = buildCaption(item);

    if (!result.success) {
      // If download fails, send the link as fallback
      console.error(`Cobalt error for ${item.url}: ${result.error}`);
      await telegram.sendMessage(
        targetChat,
        `${caption}\n\n⚠️ <i>Download failed: ${result.error}. Sending link instead.</i>\n${item.url}`
      );
    } else if (result.type === 'link') {
      // Just send the link with preview
      await telegram.sendMessage(targetChat, `${caption}\n${item.url}`);
    } else if (result.type === 'picker' && result.picker) {
      // Send multiple items (carousel/gallery)
      await telegram.sendMessage(targetChat, caption + '\n(sending gallery...)');
      for (const media of result.picker) {
        if (media.type === 'photo') {
          await telegram.sendPhoto(targetChat, media.url);
        } else if (media.type === 'video') {
          await telegram.sendVideo(targetChat, media.url);
        }
      }
    } else if (result.type === 'video' && result.downloadUrl) {
      // Send video by URL — Telegram will fetch it
      await telegram.sendVideo(targetChat, result.downloadUrl, caption);
    } else if (result.type === 'audio' && result.downloadUrl) {
      await telegram.sendDocument(targetChat, result.downloadUrl, caption);
    } else if (result.downloadUrl) {
      // Fallback: send as document
      await telegram.sendDocument(targetChat, result.downloadUrl, caption);
    } else {
      // Ultimate fallback: send the link
      await telegram.sendMessage(targetChat, `${caption}\n${item.url}`);
    }

    // Mark as done and update last posted time
    await queue.updateItem(item.id, { status: 'done' });
    await queue.setLastPostedAt(Date.now());

    console.log(`Successfully posted item ${item.id}`);
    return { posted: true, item };
  } catch (err) {
    console.error(`Error processing item ${item.id}:`, err);
    // Reset to queued so it can be retried next cycle
    await queue.updateItem(item.id, { status: 'queued' });
    return { posted: false, reason: err.message };
  }
}

/**
 * Build a caption for a posted item.
 */
function buildCaption(item) {
  const emoji = PLATFORM_EMOJI[item.platform] || '🔗';
  const qualityLabel = item.quality === 'link' ? 'Link' : `${item.quality}p`;
  return `${emoji} <b>${item.platform.toUpperCase()}</b> [${qualityLabel}]`;
}

module.exports = {
  handleUpdate,
  processQueue,
  sendQueueStatus,
};
