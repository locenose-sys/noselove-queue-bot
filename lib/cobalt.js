/**
 * Cobalt API helper — fetches media download info.
 *
 * Cobalt is an open-source media downloader.
 * Self-host it or use a public instance.
 * Docs: https://github.com/imputnet/cobalt
 *
 * POST /api/json
 * { "url": "...", "vQuality": "720" }
 *
 * Response (success):
 * { "status": "redirect", "url": "https://direct-download-url.com/file.mp4" }
 * or
 * { "status": "tunnel", "url": "https://cobalt-instance/proxy/file" }
 *
 * Response (picker — multiple media options, e.g. images):
 * { "status": "picker", "picker": [{ "type": "photo", "url": "..." }, ...] }
 *
 * Response (error):
 * { "status": "error", "error": { "code": "...", "text": "..." } }
 */

const VALID_PLATFORMS = [
  'youtube',
  'instagram',
  'reddit',
  'twitter',
  'facebook',
  'tumblr',
];

/**
 * Detect the platform from a URL.
 * @param {string} url
 * @returns {string|null}
 */
function detectPlatform(url) {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('reddit.com')) return 'reddit';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter';
  if (lower.includes('facebook.com') || lower.includes('fb.watch')) return 'facebook';
  if (lower.includes('tumblr.com')) return 'tumblr';
  return null;
}

/**
 * Validate that a URL is from a supported platform.
 * @param {string} url
 * @returns {boolean}
 */
function isSupportedUrl(url) {
  return detectPlatform(url) !== null;
}

/**
 * Extract a URL from a text message.
 * @param {string} text
 * @returns {string|null}
 */
function extractUrl(text) {
  const match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : null;
}

/**
 * Get quality options for a link.
 * For simplicity, we return standard quality buttons.
 * Cobalt's vQuality parameter accepts: 144, 240, 360, 480, 720, 1080, 1440, 2160.
 *
 * @param {string} url
 * @returns {Promise<Array<{label: string, value: string}>>}
 */
async function getQualityOptions(url) {
  const platform = detectPlatform(url);
  if (!platform) return [];

  // All platforms support these standard qualities via Cobalt
  return [
    { label: '🎬 1080p HD', value: '1080' },
    { label: '🎬 720p', value: '720' },
    { label: '🎬 480p', value: '480' },
    { label: '🎬 360p', value: '360' },
    { label: '🔗 Just send link', value: 'link' },
  ];
}

/**
 * Request media download from Cobalt.
 *
 * @param {string} url — the social media link
 * @param {string} quality — e.g. "720", "1080", or "link" to skip download
 * @returns {Promise<{success: boolean, type: string, downloadUrl: string, picker?: array, error?: string}>}
 */
async function fetchMedia(url, quality) {
  // If user chose "just link", return the original URL
  if (quality === 'link') {
    return { success: true, type: 'link', downloadUrl: url };
  }

  const apiUrl = (process.env.COABLT_API_URL || process.env.COABLT_URL || process.env.COBALT_API_URL || '').replace(/\/$/, '');

  if (!apiUrl) {
    return { success: false, type: 'error', error: 'Cobalt API URL not configured' };
  }

  try {
    const res = await fetch(`${apiUrl}/api/json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        url,
        vQuality: quality,
      }),
    });

    const data = await res.json();

    if (data.status === 'redirect' || data.status === 'tunnel') {
      // Cobalt returns a direct URL to the media
      return {
        success: true,
        type: data.filename?.endsWith('.mp3') || data.filename?.endsWith('.m4a') ? 'audio' : 'video',
        downloadUrl: data.url,
        filename: data.filename,
        thumbnail: data.thumbnail,
      };
    }

    if (data.status === 'picker') {
      // Multiple media items (e.g. Instagram carousel, Reddit gallery)
      return {
        success: true,
        type: 'picker',
        downloadUrl: null,
        picker: data.picker,
      };
    }

    if (data.status === 'error') {
      return {
        success: false,
        type: 'error',
        error: data.error?.text || data.error?.code || 'Unknown Cobalt error',
      };
    }

    return { success: false, type: 'error', error: 'Unexpected Cobalt response' };
  } catch (err) {
    return { success: false, type: 'error', error: err.message };
  }
}

module.exports = {
  VALID_PLATFORMS,
  detectPlatform,
  isSupportedUrl,
  extractUrl,
  getQualityOptions,
  fetchMedia,
};
