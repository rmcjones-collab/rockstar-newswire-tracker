// Per-genre Discord channel routing. The upstream tracker posts every genre
// to one webhook; a "channel" lets a genre (GTA VI, title updates, ...) go to
// its own Discord channel with its own bot name, embed colour and optional
// role mention. Pure: no network or file access, so it is unit-tested directly.
const { isValidDiscordWebhookUrl } = require('./utils');

// Opinionated preset for the Grand Theft Auto VI channel. Everything here can
// be overridden from config.yaml `channels.grand_theft_auto_vi`.
const GTA_VI_PRESET = Object.freeze({
    profileName: 'Leonida Wire',
    color: 0xF26B8A, // sunset pink; distinct from the orange used for general news
    authorName: 'Rockstar Newswire · Grand Theft Auto VI',
    mentionRoleId: null
});

const PRESETS = Object.freeze({
    grand_theft_auto_vi: GTA_VI_PRESET
});

// Environment variable name for a genre-specific webhook override, e.g.
// DISCORD_WEBHOOK_URL_GRAND_THEFT_AUTO_VI. Docker users can keep secrets out
// of config.yaml this way, matching the existing DISCORD_WEBHOOK_URL override.
function envVarForGenre(genre) {
    return 'DISCORD_WEBHOOK_URL_' + String(genre).toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

// Resolves the effective Discord settings for one genre.
//   - config: the loaded config.yaml object (uses webhookUrl, discordProfileName,
//     discordAvatarUrl, channels)
//   - env: process.env (injected for tests)
// Returns { webhookUrl, profileName, avatarUrl, color, authorName,
//           mentionRoleId, dedicated } where `dedicated` is true when the genre
// has its own webhook rather than the shared one.
function resolveChannel(genre, config = {}, env = process.env) {
    const preset = PRESETS[genre] || {};
    const channel = (config.channels && config.channels[genre]) || {};

    const envWebhook = env[envVarForGenre(genre)];
    const webhookUrl = envWebhook || channel.webhookUrl || null;
    const dedicated = Boolean(webhookUrl && webhookUrl !== 'YOUR_WEBHOOK_URL_HERE');

    return {
        webhookUrl: dedicated ? webhookUrl : (config.webhookUrl || null),
        profileName: channel.profileName || preset.profileName || config.discordProfileName || 'Rockstar Newswire Tracker',
        avatarUrl: channel.avatarUrl || config.discordAvatarUrl || null,
        color: normalizeColor(channel.color ?? preset.color),
        authorName: channel.authorName || preset.authorName || 'Rockstar Newswire',
        mentionRoleId: channel.mentionRoleId || preset.mentionRoleId || null,
        dedicated
    };
}

// Accepts 0xF26B8A, 15887242 or "#F26B8A" / "F26B8A"; returns an integer or
// undefined so the notifier can fall back to its default colour.
function normalizeColor(value) {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const hex = String(value).trim().replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(hex)) return parseInt(hex, 16);
    return undefined;
}

// Validates every configured channel webhook up front so a typo cannot leak
// article data to an arbitrary host (same guard index.js applies globally).
function validateChannels(config = {}, env = process.env) {
    const problems = [];
    const channels = config.channels || {};
    for (const genre of Object.keys(channels)) {
        const resolved = resolveChannel(genre, config, env);
        if (resolved.dedicated && !isValidDiscordWebhookUrl(resolved.webhookUrl)) {
            problems.push(`channels.${genre}.webhookUrl does not look like a Discord webhook URL`);
        }
    }
    return problems;
}

module.exports = {
    GTA_VI_PRESET,
    PRESETS,
    envVarForGenre,
    resolveChannel,
    normalizeColor,
    validateChannels
};
