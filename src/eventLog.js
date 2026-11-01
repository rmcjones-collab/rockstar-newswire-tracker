// Machine-readable event log: every delivered article is appended as one JSON
// line to feeds/events-<genre>.jsonl. This is the bridge between the Newswire
// (which has no RSS or API of its own) and any downstream tool that needs the
// publisher's "clock" (title updates, trailers, launch posts, weekly events).
//
// Record shape (schemaVersion 1):
//   { schemaVersion, id, genre, kind, title, url, date, dateRaw, tags,
//     subtitle, image, source: { tier: 0, name: 'rockstar-newswire' }, recordedAt }
//
// `date` is ISO-8601 (UTC) when Rockstar's `created` value parses, else null;
// `dateRaw` always keeps the original string (Rockstar currently sends a
// locale string such as "10/15/26, 1:00 PM" with a narrow no-break space).
//
// `kind` is a keyword heuristic over title + tags. It is deliberately coarse;
// downstream consumers should treat it as a hint and keep the raw tags.
const fs = require('fs');
const path = require('path');
const log = require('./logger');

const SCHEMA_VERSION = 1;

// Ordered: first match wins. Keep the most specific patterns on top:
// trailer and store sit above launch so "Launch Trailer" and a merch
// "Pre-Order ... Collection" post are not mistaken for the game going live.
const KIND_RULES = [
    ['title_update', /\b(title update|patch notes?|hotfix|game update|update notes?|v?\d+\.\d+ (update|patch))\b/i],
    ['trailer', /\b(trailer|extended look|gameplay reveal|first look|official video)\b/i],
    ['store', /\b(merch|rockstar store|collection|collector'?s|apparel|vinyl)\b/i],
    ['launch', /\b(now available|out now|launch(es|ed|ing)?|release day|pre-?load|pre-?order)\b/i],
    ['weekly_event', /\b(this week|weekly|bonus(es)?|double|triple|2x|3x|discounts?|podium|prize ride|gun van|event week)\b/i],
    ['community', /\b(community|fan art|fan videos?|creator|crew|showcase|contest|giveaway)\b/i],
    ['music', /\b(radio|soundtrack|score|album|circoloco|music)\b/i],
    ['announcement', /\b(announc|reveal|introduc|coming|date)\w*/i]
];

function classifyArticle(article) {
    const haystack = [article.title, article.subtitle, ...(article.tags || [])].filter(Boolean).join(' | ');
    for (const [kind, pattern] of KIND_RULES) {
        if (pattern.test(haystack)) return kind;
    }
    return 'news';
}

// Rockstar's `created` is a locale string; normalise the narrow no-break
// space it contains and let Date parse it. Returns an ISO string or null.
function toIsoDate(value) {
    if (value instanceof Date) return isNaN(value) ? null : value.toISOString();
    if (typeof value !== 'string' || !value.trim()) return null;
    const parsed = new Date(value.replace(/[\u202f\u00a0]/g, ' '));
    return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toEvent(genre, article, now = new Date()) {
    return {
        schemaVersion: SCHEMA_VERSION,
        id: String(article.id),
        genre,
        kind: classifyArticle(article),
        title: article.title,
        url: article.link,
        date: toIsoDate(article.date),
        dateRaw: article.date instanceof Date ? article.date.toISOString() : (article.date ?? null),
        tags: Array.isArray(article.tags) ? article.tags : [],
        subtitle: article.subtitle || '',
        image: article.img || '',
        source: { tier: 0, name: 'rockstar-newswire' },
        recordedAt: now.toISOString()
    };
}

function eventFilename(genre) {
    return `events-${String(genre).replace(/_/g, '-')}.jsonl`;
}

// Validates "/events-<genre>.jsonl" or "/events-<genre>.json" request paths
// and returns { filename, asJson } or null. Mirrors sanitizeFeedFilename.
function parseEventPath(urlPath) {
    const match = /^\/(events-[a-z0-9-]+)\.(jsonl|json)$/i.exec(urlPath || '');
    if (!match) return null;
    return { filename: match[1] + '.jsonl', asJson: match[2].toLowerCase() === 'json' };
}

class EventLog {
    constructor({ feedsDir, enabled = true }) {
        this.feedsDir = feedsDir;
        this.enabled = enabled;
    }

    // Appends one event. Never throws: a logging failure must not block
    // Discord delivery or the seen-article bookkeeping.
    append(genre, article) {
        if (!this.enabled) return null;
        const event = toEvent(genre, article);
        try {
            fs.appendFileSync(path.join(this.feedsDir, eventFilename(genre)), JSON.stringify(event) + '\n');
        } catch (e) {
            log.error(`[EVENTS] Failed to append event for ${genre}:`, e);
        }
        return event;
    }

    // Reads a genre's log back as an array (newest last). Used by the HTTP
    // "/events-<genre>.json" route; malformed lines are skipped, not fatal.
    read(filename) {
        let raw;
        try {
            raw = fs.readFileSync(path.join(this.feedsDir, filename), 'utf8');
        } catch (e) {
            if (e.code === 'ENOENT') return [];
            throw e;
        }
        const events = [];
        for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            try { events.push(JSON.parse(line)); } catch (e) { /* skip corrupt line */ }
        }
        return events;
    }
}

module.exports = {
    SCHEMA_VERSION,
    KIND_RULES,
    classifyArticle,
    toIsoDate,
    toEvent,
    eventFilename,
    parseEventPath,
    EventLog
};
