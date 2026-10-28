// Browser smoke test: node scripts/e2e.mjs [outDir]
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('dist');
const out = process.argv[2] || '/tmp/shots';
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(4173);

const errors = [];
const browser = await chromium.launch();
async function run(name, viewport, fn) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: viewport.width < 700, isMobile: viewport.width < 700 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${name}] PAGEERROR ${e.message}\n${e.stack?.split('\n').slice(0, 4).join('\n')}`));
  await page.goto('http://localhost:4173/');
  await page.waitForSelector('.app', { timeout: 8000 });
  await fn(page, (n) => page.screenshot({ path: `${out}/${name}-${n}.png` }));
  await ctx.close();
}
const step = async (label, fn) => { try { await fn(); } catch (e) { errors.push(`STEP FAILED ${label}: ${e.message.split('\n')[0]}`); } };

await run('desk', { width: 1400, height: 880 }, async (page, shot) => {
  await shot('01-today');
  await step('quickadd', async () => {
    await page.fill('.qa-wrap .qa-input', 'Call mom tomorrow 6pm #family !high');
    await page.waitForTimeout(200); await shot('02-quickadd-typing');
    await page.press('.qa-wrap .qa-input', 'Enter');
    await page.fill('.qa-wrap .qa-input', 'Pay electricity bill today !medium #bills');
    await page.press('.qa-wrap .qa-input', 'Enter');
    await page.fill('.qa-wrap .qa-input', 'Gym every monday and thursday 7am');
    await page.press('.qa-wrap .qa-input', 'Enter');
  });
  await step('next7', async () => { await page.click('.side-item:has-text("Next 7 Days")'); await page.waitForTimeout(150); await shot('03-next7'); });
  await step('open task', async () => {
    await page.click('.task-row:has-text("Call mom")'); await page.waitForSelector('.detail'); await page.waitForTimeout(150);
    await page.fill('.cl-new >> nth=0', 'Ask about weekend'); await page.press('.cl-new >> nth=0', 'Enter');
    await page.fill('.cl-new >> nth=1', 'Book train'); await page.press('.cl-new >> nth=1', 'Enter');
    await page.click('.detail-content'); await page.keyboard.type('Remember to ask about the trip.');
    await page.click('.detail-title');
    await shot('04-detail');
    await page.click('.date-btn'); await page.waitForSelector('.datepicker'); await shot('05-datepicker');
    await page.click('.dp-row:has-text("Repeat")'); await page.click('.menu-item:has-text("Custom")'); await shot('06-repeat-custom');
    await page.keyboard.press('Escape');
  });
  await step('complete', async () => { await page.click('.task-row:has-text("Pay electricity") .check'); await page.waitForTimeout(200); await shot('07-completed-toast'); });
  await step('new list', async () => {
    await page.click('.side-head:has-text("Lists") .icon-btn'); await page.click('.menu-item:has-text("Add list")');
    await page.fill('.modal .input', 'Exam prep'); await page.click('.emoji-opt >> nth=5'); await page.click('.modal .btn-primary');
    await page.fill('.qa-wrap .qa-input', 'Revise chapter 1 ~Exam'); await page.press('.qa-wrap .qa-input', 'Enter');
    await page.fill('.qa-wrap .qa-input', 'Mock test friday'); await page.press('.qa-wrap .qa-input', 'Enter');
    await page.click('.pane-actions .icon-btn[aria-label="View options"]'); await page.click('.menu-item:has-text("Add section")');
    await page.fill('.modal .input', 'This week'); await page.click('.modal .btn-primary');
    await page.click('.layout-switch .icon-btn[title="Kanban"]'); await page.waitForTimeout(200); await shot('08-kanban');
    await page.click('.layout-switch .icon-btn[title="Timeline"]'); await page.waitForTimeout(200); await shot('09-timeline');
    await page.click('.layout-switch .icon-btn[title="List"]');
  });
  await step('drag task to list', async () => {
    const src = await page.locator('.task-row:has-text("Mock test")').boundingBox();
    const dst = await page.locator('.side-item:has-text("Inbox")').boundingBox();
    await page.mouse.move(src.x + 60, src.y + 15); await page.mouse.down();
    await page.mouse.move(src.x + 80, src.y + 25, { steps: 3 }); await page.mouse.move(dst.x + 40, dst.y + 15, { steps: 8 });
    await shot('10-dragging'); await page.mouse.up(); await page.waitForTimeout(200);
  });
  await step('filter', async () => {
    await page.click('.side-head:has-text("Filters") .icon-btn'); await page.fill('.modal .input >> nth=0', 'Urgent');
    await page.click('.modal .chip:has-text("High")'); await shot('11-filter'); await page.click('.modal .btn-primary');
  });
  await step('calendar', async () => {
    await page.click('.rail-btn[aria-label="Calendar"]'); await page.waitForTimeout(250); await shot('12-cal-month');
    await page.click('.segmented button:has-text("Week")'); await page.waitForTimeout(250); await shot('13-cal-week');
    await page.click('.segmented button:has-text("Agenda")'); await page.waitForTimeout(200); await shot('14-cal-agenda');
    await page.click('.segmented button:has-text("Month")');
  });
  await step('habits', async () => {
    await page.click('.rail-btn[aria-label="Habit"]'); await page.waitForTimeout(150);
    await page.click('.empty .btn-primary'); await page.click('.presets .chip:has-text("Drink water")'); await page.click('.modal .btn-primary');
    await page.click('.pane-actions .icon-btn[aria-label="New habit"]'); await page.click('.presets .chip:has-text("Exercise")'); await page.click('.modal .btn-primary');
    await page.click('.habit-card:has-text("Exercise") .habit-check');
    await page.click('.habit-card:has-text("Drink water") .habit-check'); await page.click('.habit-card:has-text("Drink water") .habit-check');
    await page.click('.habit-card:has-text("Exercise")'); await page.waitForTimeout(200); await shot('15-habits');
  });
  await step('focus', async () => {
    await page.click('.rail-btn[aria-label="Focus"]'); await page.waitForTimeout(150);
    await page.click('.focus-task'); await page.click('.picker-list .menu-item >> nth=1');
    await page.click('.focus-controls .btn-primary'); await page.waitForTimeout(1300); await shot('16-focus-running');
    await page.click('.focus-controls .btn-primary'); // pause
  });
  await step('countdown', async () => {
    await page.click('.rail-btn[aria-label="Countdown"]'); await page.click('.empty .btn-primary');
    await page.fill('.modal .input >> nth=0', 'Final exam'); await page.click('.modal .btn-primary');
    await page.click('.pane-actions .icon-btn[aria-label="New countdown"]'); await page.click('.modal .segmented button:has-text("Birthday")');
    await page.fill('.modal .input >> nth=0', "Mom's birthday"); await page.fill('.modal input[type=date]', '1965-12-02'); await page.click('.modal .btn-primary');
    await shot('17-countdown');
  });
  await step('stats', async () => { await page.click('.rail-btn[aria-label="Statistics"]'); await page.waitForTimeout(200); await shot('18-stats'); });
  await step('search', async () => { await page.click('.rail-btn[aria-label="Search"]'); await page.fill('.search-input', 'mom'); await page.waitForTimeout(150); await shot('19-search'); });
  await step('settings', async () => { await page.click('.rail-btn[aria-label="Settings"]'); await page.waitForTimeout(150); await shot('20-settings'); });
  await step('dark', async () => { await page.click('.segmented button:has-text("Dark")'); await page.click('.rail-btn[aria-label="Tasks"]'); await page.click('.side-item:has-text("All")'); await page.waitForTimeout(200); await shot('21-dark-all'); await page.click('.rail-btn[aria-label="Calendar"]'); await shot('22-dark-cal'); });
  await step('reload persists', async () => {
    await page.reload(); await page.waitForSelector('.app'); await page.click('.rail-btn[aria-label="Tasks"]'); await page.click('.side-item:has-text("All")');
    const n = await page.locator('.task-row').count(); if (n < 5) throw new Error('only ' + n + ' tasks after reload');
  });
});

await run('mob', { width: 390, height: 844 }, async (page, shot) => {
  await shot('01-today');
  await step('fab add', async () => {
    await page.click('.fab'); await page.fill('.qa-sheet .qa-input', 'Buy groceries tomorrow 7pm #home'); await shot('02-sheet'); await page.press('.qa-sheet .qa-input', 'Enter');
    await page.waitForTimeout(150); await shot('03-after-add');
  });
  await step('open detail', async () => { await page.click('.task-row >> nth=0'); await page.waitForTimeout(250); await shot('04-detail'); await page.click('.detail-head .icon-btn[aria-label="Back"]'); });
  await step('drawer', async () => { await page.click('.pane-head .icon-btn[aria-label="Lists"]'); await page.waitForTimeout(250); await shot('05-drawer'); await page.click('.drawer .side-item:has-text("Next 7 Days")'); });
  await step('calendar', async () => { await page.click('.bottom-nav button:has-text("Calendar")'); await page.waitForTimeout(250); await shot('06-cal'); });
  await step('habit', async () => { await page.click('.bottom-nav button:has-text("Habit")'); await page.waitForTimeout(150); await shot('07-habit'); });
  await step('focus', async () => { await page.click('.bottom-nav button:has-text("Focus")'); await page.waitForTimeout(150); await shot('08-focus'); });
  await step('more', async () => { await page.click('.bottom-nav button:has-text("More")'); await page.waitForTimeout(150); await shot('09-more'); await page.click('.more-grid button:has-text("Settings")'); await page.waitForTimeout(150); await shot('10-settings'); });
  await step('datepicker sheet', async () => {
    await page.click('.bottom-nav button:has-text("Tasks")'); await page.click('.task-row >> nth=0'); await page.click('.date-btn'); await page.waitForTimeout(200); await shot('11-dp');
  });
});

await browser.close();
server.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'No errors');
