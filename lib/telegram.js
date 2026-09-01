/**
 * Telegram Bot API helpers — zero dependencies, uses global fetch.
 */

const API_BASE = 'https://api.telegram.org/bot';

function token() {
  return process.env.TELEGRAM_BOT_TOKEN;
}

function targetChat() {
  return process.env.TELEGRAM_TARGET_CHAT_ID;
}

/**
 * Call any Telegram Bot API method.
 */
async function callApi(method, body) {
  const res = await fetch(`${API_BASE}${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error (${method}):`, data.description);
  }
  return data;
}

/**
 * Send a text message.
 */
async function sendMessage(chatId, text, extra = {}) {
  return callApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...extra,
  });
}

/**
 * Send a document (file upload from a URL or buffer).
 */
async function sendDocument(chatId, fileUrl, caption = '') {
  return callApi('sendDocument', {
    chat_id: chatId,
    document: fileUrl,
    caption,
    parse_mode: 'HTML',
  });
}

/**
 * Send a video by URL.
 */
async function sendVideo(chatId, videoUrl, caption = '') {
  return callApi('sendVideo', {
    chat_id: chatId,
    video: videoUrl,
    caption,
    parse_mode: 'HTML',
  });
}

/**
 * Send a photo by URL.
 */
async function sendPhoto(chatId, photoUrl, caption = '') {
  return callApi('sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: 'HTML',
  });
}

/**
 * Send an animation (GIF) by URL.
 */
async function sendAnimation(chatId, animationUrl, caption = '') {
  return callApi('sendAnimation', {
    chat_id: chatId,
    animation: animationUrl,
    caption,
    parse_mode: 'HTML',
  });
}

/**
 * Send a message with inline keyboard buttons.
 */
async function sendMessageWithButtons(chatId, text, inlineKeyboard) {
  return callApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: inlineKeyboard },
  });
}

/**
 * Edit an existing message's text (used when updating button states).
 */
async function editMessageText(chatId, messageId, text, inlineKeyboard) {
  return callApi('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
  });
}

/**
 * Answer a callback query (removes the loading spinner on the button).
 */
async function answerCallback(callbackQueryId, text) {
  return callApi('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
  });
}

/**
 * Set the webhook URL.
 */
async function setWebhook(webhookUrl) {
  return callApi('setWebhook', { url: webhookUrl });
}

/**
 * Delete the webhook (switch to polling mode).
 */
async function deleteWebhook() {
  return callApi('deleteWebhook', {});
}

/**
 * Get bot info.
 */
async function getMe() {
  return callApi('getMe', {});
}

module.exports = {
  token,
  targetChat,
  callApi,
  sendMessage,
  sendDocument,
  sendVideo,
  sendPhoto,
  sendAnimation,
  sendMessageWithButtons,
  editMessageText,
  answerCallback,
  setWebhook,
  deleteWebhook,
  getMe,
};
