// Read UI timing and exercise the actual solo-menu control on a synthetic preview.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
const args = process.argv.slice(2), option = key => args[args.indexOf(key) + 1];
const smoke = args.includes('--smoke');
const cdp = args.includes('--cdp') ? option('--cdp') : 'http://127.0.0.1:9229';
const cdpUrl = new URL(cdp);
assert(['127.0.0.1','localhost','[::1]'].includes(cdpUrl.hostname), 'CDP must be loopback');
const browser = smoke ? await chromium.launch({headless:true}) : await chromium.connectOverCDP(cdp);
try {
    let page = smoke ? await browser.newPage() : null;
    if (!smoke) for (const candidate of browser.contexts().flatMap(c => c.pages())) {
        if (!['http://127.0.0.1:4186', 'https://localhost'].includes(new URL(candidate.url()).origin)) continue;
        if (await candidate.evaluate(() => document.querySelector('meta[name="domino-local-review"]')?.content === 's039').catch(() => false)) { page=candidate; break; }
    }
    assert(page, 'Open only the synthetic4186 preview in Chrome or the isolated audit package; Play app is never selected');
    if (smoke) await page.goto('http://127.0.0.1:4186/');
    const rows = [];
    for (let run=0; run<3; run++) {
        if (run) await page.reload({waitUntil:'domcontentloaded'});
        await page.waitForFunction(() => document.querySelector('meta[name="domino-local-review"]')?.content === 's039' && !document.querySelector('#splash-screen'),null,{timeout:10000});
        assert.equal(await page.evaluate(() => Object.values(window.DOMINO_ENDPOINTS || {}).every(url => new URL(url).hostname === '127.0.0.1')),true);
        await page.locator('#open-solo-modal-btn').click();
        await page.locator('#start-game-btn').waitFor({state:'visible'});
        rows.push(await page.evaluate(() => ({interactiveMarkMs:performance.getEntriesByName('domino-startup-interactive')[0]?.startTime ?? null, verifiedMenuOpenMs:performance.now(), viewport:[innerWidth,innerHeight], dpr:devicePixelRatio, native:window.Capacitor?.getPlatform?.() || 'browser'})));
    }
    const result = {scope:smoke?'desktop-harness-smoke':'physical-device-preview', rows, userAgent:await page.evaluate(() => navigator.userAgent), limits:['First sample is current navigation, not a certified cold OS launch.','Reloads2/3 are warm UI samples.','Verified menu time includes harness polling/interaction overhead.','No Play package, native launch, production network or offline-device claim.']};
    const target = smoke ? 'docs/remediation/evidence/session-039/startup-harness-smoke.json' : 'docs/remediation/evidence/session-039/startup-device-measurement.json';
    fs.writeFileSync(target,JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify(result));
} finally { await browser.close(); }
