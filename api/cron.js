/**
 * Cron job endpoint.
 * GET /api/cron — called by Vercel Cron every minute.
 *
 * Checks if 10 minutes have passed since the last post,
 * and if so, sends the next queued item to the target group.
 */

const { processQueue } = require('../lib/handlers');

module.exports = async (req, res) => {
  // Verify authorization (Vercel Cron sends ?secret=... or CRON_SECRET header)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const providedSecret = req.query.secret || req.headers['authorization'];
    if (providedSecret !== cronSecret && providedSecret !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  try {
    const result = await processQueue();
    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    console.error('Cron error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
