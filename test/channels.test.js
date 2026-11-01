const { test } = require('node:test');
const assert = require('node:assert');
const { resolveChannel, validateChannels, envVarForGenre, normalizeColor, GTA_VI_PRESET } = require('../src/channels');

const SHARED = 'https://discord.com/api/webhooks/1/shared';
const GTAVI = 'https://discord.com/api/webhooks/2/gtavi';

test('genre without a channel falls back to the shared webhook and defaults', () => {
    const c = resolveChannel('latest', { webhookUrl: SHARED, discordProfileName: 'Tracker' }, {});
    assert.strictEqual(c.webhookUrl, SHARED);
    assert.strictEqual(c.dedicated, false);
    assert.strictEqual(c.profileName, 'Tracker');
    assert.strictEqual(c.authorName, 'Rockstar Newswire');
    assert.strictEqual(c.color, undefined);
});

test('grand_theft_auto_vi applies the preset when only a webhook is configured', () => {
    const c = resolveChannel('grand_theft_auto_vi', {
        webhookUrl: SHARED,
        channels: { grand_theft_auto_vi: { webhookUrl: GTAVI } }
    }, {});
    assert.strictEqual(c.webhookUrl, GTAVI);
    assert.strictEqual(c.dedicated, true);
    assert.strictEqual(c.profileName, GTA_VI_PRESET.profileName);
    assert.strictEqual(c.color, GTA_VI_PRESET.color);
    assert.strictEqual(c.authorName, GTA_VI_PRESET.authorName);
});

test('explicit channel values override the preset', () => {
    const c = resolveChannel('grand_theft_auto_vi', {
        channels: { grand_theft_auto_vi: { webhookUrl: GTAVI, profileName: 'Custom', color: '#00FF00', mentionRoleId: '42' } }
    }, {});
    assert.strictEqual(c.profileName, 'Custom');
    assert.strictEqual(c.color, 0x00FF00);
    assert.strictEqual(c.mentionRoleId, '42');
});

test('environment variable beats config.yaml for the channel webhook', () => {
    const env = { [envVarForGenre('grand_theft_auto_vi')]: GTAVI };
    assert.strictEqual(envVarForGenre('grand_theft_auto_vi'), 'DISCORD_WEBHOOK_URL_GRAND_THEFT_AUTO_VI');
    const c = resolveChannel('grand_theft_auto_vi', { webhookUrl: SHARED }, env);
    assert.strictEqual(c.webhookUrl, GTAVI);
    assert.strictEqual(c.dedicated, true);
});

test('placeholder webhook is treated as not configured', () => {
    const c = resolveChannel('updates', { webhookUrl: SHARED, channels: { updates: { webhookUrl: 'YOUR_WEBHOOK_URL_HERE' } } }, {});
    assert.strictEqual(c.dedicated, false);
    assert.strictEqual(c.webhookUrl, SHARED);
});

test('validateChannels flags non-Discord webhook hosts', () => {
    const problems = validateChannels({ channels: { gta_online: { webhookUrl: 'https://evil.example/hook' } } }, {});
    assert.strictEqual(problems.length, 1);
    assert.match(problems[0], /channels\.gta_online\.webhookUrl/);
    assert.deepStrictEqual(validateChannels({ channels: { gta_online: { webhookUrl: GTAVI } } }, {}), []);
});

test('normalizeColor accepts hex strings and integers', () => {
    assert.strictEqual(normalizeColor('#F26B8A'), 0xF26B8A);
    assert.strictEqual(normalizeColor('f26b8a'), 0xF26B8A);
    assert.strictEqual(normalizeColor(15887242), 15887242);
    assert.strictEqual(normalizeColor('not a colour'), undefined);
    assert.strictEqual(normalizeColor(undefined), undefined);
});
