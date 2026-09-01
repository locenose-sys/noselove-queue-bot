/**
 * Setup endpoint.
 * GET /api/setup — call this once after deploying to Vercel.
 *
 * It sets the Telegram webhook to point to your Vercel deployment URL.
 *
 * Usage:
 *   Visit https://your-project.vercel.app/api/setup
 *   Or: curl https://your-project.vercel.app/api/setup
 */

const telegram = require('../lib/telegram');

module.exports = async (req, res) => {
  try {
    // Get the deployment URL from the request
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${protocol}://${host}`;
    const webhookUrl = `${baseUrl}/api/webhook`;

    // Set webhook
    const result = await telegram.setWebhook(webhookUrl);

    // Get bot info
    const botInfo = await telegram.getMe();

    return res.status(200).json({
      ok: true,
      message: 'Webhook set successfully!',
      webhook_url: webhookUrl,
      bot_info: result.ok ? botInfo.result : null,
      telegram_response: result,
    });
  } catch (err) {
    console.error('Setup error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
