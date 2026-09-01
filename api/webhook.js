/**
 * Telegram webhook endpoint.
 * POST /api/webhook — receives Telegram updates.
 *
 * Telegram sends updates to this URL when users message the bot.
 */

const { handleUpdate } = require('../lib/handlers');

module.exports = async (req, res) => {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(200).json({ ok: true, message: 'Webhook is running. Send POST requests from Telegram.' });
  }

  const update = req.body;

  // Quick validation
  if (!update || (!update.update_id && !update.callback_query && !update.message)) {
    return res.status(400).json({ ok: false, error: 'Invalid update object' });
  }

  // Respond immediately to Telegram, process asynchronously
  res.status(200).json({ ok: true });

  // Process the update (don't await — fire and forget)
  handleUpdate(update).catch((err) => {
    console.error('Unhandled error in handleUpdate:', err);
  });
};
