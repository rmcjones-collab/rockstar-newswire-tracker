const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classifyArticle, toIsoDate, toEvent, eventFilename, parseEventPath, EventLog, SCHEMA_VERSION } = require('../src/eventLog');

function article(title, tags = [], subtitle = '') {
    return { id: 123, title, tags, subtitle, link: 'https://www.rockstargames.com/newswire/article/x', date: '2026-11-19T14:00:00Z', img: 'https://img/x.png' };
}

test('classifyArticle picks the most specific kind first', () => {
    assert.strictEqual(classifyArticle(article('Grand Theft Auto VI Title Update 1.02 Notes')), 'title_update');
    assert.strictEqual(classifyArticle(article('Grand Theft Auto VI Is Now Available')), 'launch');
    assert.strictEqual(classifyArticle(article('Watch the Grand Theft Auto VI Launch Trailer')), 'trailer');
    assert.strictEqual(classifyArticle(article('Pre-Order The Goodtime State – Vice City Collection Now While Supplies Last')), 'store');
    assert.strictEqual(classifyArticle(article('Pre-Load Grand Theft Auto VI Starting November 12')), 'launch');
    assert.strictEqual(classifyArticle(article('Grand Theft Auto VI: An Extended Look')), 'trailer');
    assert.strictEqual(classifyArticle(article('This Week in GTA Online: 3X GTA$ on Community Series')), 'weekly_event');
    assert.strictEqual(classifyArticle(article('Grand Theft Auto VI: Original Score by Justice')), 'music');
    assert.strictEqual(classifyArticle(article('The Vice City Collection Now at the Rockstar Store')), 'store');
    assert.strictEqual(classifyArticle(article('Something else entirely')), 'news');
});

test('classifyArticle also reads tags and subtitle', () => {
    assert.strictEqual(classifyArticle(article('Untitled', ['Fan Art'])), 'community');
    assert.strictEqual(classifyArticle(article('Untitled', [], 'Patch notes for today')), 'title_update');
});

test('toEvent produces a stable schema with a tier-0 source', () => {
    const e = toEvent('grand_theft_auto_vi', article('Grand Theft Auto VI Is Now Available', ['Grand Theft Auto VI']), new Date('2026-11-19T15:00:00Z'));
    assert.deepStrictEqual(e, {
        schemaVersion: SCHEMA_VERSION,
        id: '123',
        genre: 'grand_theft_auto_vi',
        kind: 'launch',
        title: 'Grand Theft Auto VI Is Now Available',
        url: 'https://www.rockstargames.com/newswire/article/x',
        date: '2026-11-19T14:00:00.000Z',
        dateRaw: '2026-11-19T14:00:00Z',
        tags: ['Grand Theft Auto VI'],
        subtitle: '',
        image: 'https://img/x.png',
        source: { tier: 0, name: 'rockstar-newswire' },
        recordedAt: '2026-11-19T15:00:00.000Z'
    });
});

test('toIsoDate handles Rockstar locale strings with narrow no-break spaces', () => {
    const iso = toIsoDate('10/15/26, 1:00\u202fPM');
    assert.ok(iso, 'should parse');
    assert.strictEqual(iso.slice(0, 10), '2026-10-15');
    assert.strictEqual(toIsoDate('not a date'), null);
    assert.strictEqual(toIsoDate(''), null);
    assert.strictEqual(toIsoDate(new Date('2026-11-19T00:00:00Z')), '2026-11-19T00:00:00.000Z');
});

test('eventFilename and parseEventPath round-trip and reject traversal', () => {
    assert.strictEqual(eventFilename('grand_theft_auto_vi'), 'events-grand-theft-auto-vi.jsonl');
    assert.deepStrictEqual(parseEventPath('/events-grand-theft-auto-vi.jsonl'), { filename: 'events-grand-theft-auto-vi.jsonl', asJson: false });
    assert.deepStrictEqual(parseEventPath('/events-updates.json'), { filename: 'events-updates.jsonl', asJson: true });
    assert.strictEqual(parseEventPath('/events-../secret.json'), null);
    assert.strictEqual(parseEventPath('/feed-latest.xml'), null);
});

test('EventLog appends JSONL and reads it back, skipping corrupt lines', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventlog-'));
    const logger = new EventLog({ feedsDir: dir });
    logger.append('grand_theft_auto_vi', article('A'));
    logger.append('grand_theft_auto_vi', article('B'));
    fs.appendFileSync(path.join(dir, 'events-grand-theft-auto-vi.jsonl'), '{not json\n');
    const events = logger.read('events-grand-theft-auto-vi.jsonl');
    assert.strictEqual(events.length, 2);
    assert.deepStrictEqual(events.map(e => e.title), ['A', 'B']);
    assert.deepStrictEqual(logger.read('events-missing.jsonl'), []);
});

test('EventLog is a no-op when disabled', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventlog-'));
    const logger = new EventLog({ feedsDir: dir, enabled: false });
    assert.strictEqual(logger.append('latest', article('A')), null);
    assert.strictEqual(fs.readdirSync(dir).length, 0);
});
