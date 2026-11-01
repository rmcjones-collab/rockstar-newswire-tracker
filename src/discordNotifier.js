// Delivers article notifications to a Discord webhook, with bounded retries.
const {
    request
} = require('https');
const { formatDate, DEFAULT_DISCORD_AVATAR_URL } = require('./utils');
const log = require('./logger');

const REQUEST_TIMEOUT_MS = 30000;
const SEND_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const DEFAULT_EMBED_COLOR = 16756992;

const requestOptions = {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: REQUEST_TIMEOUT_MS,
};

class DiscordNotifier {
    // color / authorName / mentionRoleId are optional per-channel styling
    // (see src/channels.js); defaults reproduce the original single-channel look.
    constructor({ webhookUrl, profileName, avatarUrl, dateFormat, color, authorName, mentionRoleId }) {
        this.webhookUrl = webhookUrl;
        this.profileName = profileName;
        this.avatarUrl = avatarUrl;
        this.dateFormat = dateFormat;
        this.color = Number.isFinite(color) ? color : DEFAULT_EMBED_COLOR;
        this.authorName = authorName || 'Rockstar Newswire';
        this.mentionRoleId = mentionRoleId || null;
    }

    // Resolves true when the webhook accepted the payload (2xx), false after
    // all retries failed. The caller decides what a false means (the poller
    // leaves the article unseen so delivery is retried next refresh).
    async send(article) {
        if (!this.webhookUrl) return true;
        log.info(`[NEW] ${article.title} (${article.link})`);

        const payload = this.buildPayload(article);
        for (let attempt = 1; attempt <= SEND_RETRIES; attempt++) {
            const delivered = await this.deliverWebhook(payload);
            if (delivered) return true;
            if (attempt < SEND_RETRIES) {
                log.error(`[ERROR] Discord delivery failed (attempt ${attempt}/${SEND_RETRIES}) for "${article.title}", retrying in ${RETRY_DELAY_MS}ms`);
                await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
            }
        }
        return false;
    }

    buildPayload(article) {
        const dateStr = formatDate(article.date, this.dateFormat);
        const tagsJoined = Array.isArray(article.tags) ? article.tags.join(', ') : '';

        const payload = {
            username: this.profileName,
            avatar_url: this.avatarUrl,
            embeds: [{
                'author': {
                    'name': this.authorName,
                    'url': 'https://www.rockstargames.com/newswire',
                    'icon_url': DEFAULT_DISCORD_AVATAR_URL
                },
                'title': article.title,
                'url': article.link,
                'description': article.subtitle || "",
                'color': this.color,
                'fields': [],
                'image': {
                    'url': article.img
                },
                'footer': {
                    "text": tagsJoined + ' • ' + dateStr
                }
            }]
        };
        // Optional role ping for a dedicated channel (e.g. @GTA VI news).
        // allowed_mentions restricts the ping to exactly that role.
        if (this.mentionRoleId) {
            payload.content = `<@&${this.mentionRoleId}>`;
            payload.allowed_mentions = { roles: [String(this.mentionRoleId)] };
        }
        return payload;
    }

    deliverWebhook(payload) {
        return new Promise((resolve) => {
            const req = request(this.webhookUrl, requestOptions, (res) => {
                const ok = res.statusCode >= 200 && res.statusCode <= 299;
                if (!ok) {
                    log.error('[ERROR] Unable to process request: ' + res.statusCode + '\nReason: ' + res.statusMessage);
                } else {
                    log.info('[DISCORD] Notification sent successfully.');
                }
                // Vital: Consume response data to free up memory and prevent timeout
                res.resume();
                resolve(ok);
            });
            req.on('timeout', () => {
                // Destroying the socket emits 'error' below, which resolves(false)
                req.destroy(new Error('Request timedout'));
            });
            req.on('error', (err) => {
                log.error('[ERROR] Discord webhook request failed:', err.message);
                resolve(false);
            });

            req.write(JSON.stringify(payload));
            req.end();
        });
    }
}

module.exports = { DiscordNotifier };
