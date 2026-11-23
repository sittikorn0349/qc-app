// Run: python3 -m http.server 8911 (repo root) & node tests/ux-field.e2e.js [path] [online]
// Section 7 (field UX): 7.1 quick entry, 7.2 touch targets, 7.3 dictation, 7.4 standard zones.
const fs = require('fs');
const { chromium, devices } = require('playwright');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');
const ONLINE = process.argv[3] === 'online';
/* fake speech recognition: returns one Thai phrase */
const SRFAKE = `window.webkitSpeechRecognition=function(){var r=this;r.start=function(){setTimeout(function(){r.onresult&&r.onresult({resultIndex:0,results:[Object.assign([{transcript:'เหล็กปลอกห่างเกิน'}],{isFinal:true})]});r.onend&&r.onend()},50)};r.stop=function(){r.onend&&r.onend()}};window.SpeechRecognition=window.webkitSpeechRecognition;`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 7'] }); await ctx.addInitScript(() => { try { localStorage.setItem('qa-shell', 'off'); } catch (e) {} });   // these suites drive the classic home
  if (ONLINE) { const { FAKE } = require('./online-mode.e2e.js'); await ctx.addInitScript(FAKE); }
  await ctx.addInitScript(SRFAKE);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const S = (f, a) => page.evaluate(f, a);
  await page.goto(BASE + 'index.html' + (ONLINE ? '?mode=online' : ''), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.tap('#qh-t-new'); await page.tap('#qh-sheet [data-form="qc-inspection"]'); await page.waitForTimeout(600);
  await page.fill('#m-project', 'อาคาร A'); await page.fill('#m-docno', 'UX-1');
  /* five items from a template */
  await page.selectOption('#tpl', { index: 1 }); await page.waitForTimeout(500);
  const n = await S(() => document.querySelectorAll('.item').length);
  ok(n >= 4, 'template added ' + n + ' items');

  console.log('\n[7.1 quick entry]');
  ok(await S(() => !document.getElementById('qc-next').hidden), 'floating "ไปรายการถัดไปที่ยังไม่ตรวจ" shown');
  ok(/\d+/.test(await page.textContent('#qc-next-n')), 'it shows how many are left');
  await page.tap('#qf-fast');
  ok(await S(() => document.getElementById('qf-fast').getAttribute('aria-pressed') === 'true' && localStorage.getItem('qc-fast') === '1'), 'กรอกเร็ว on and remembered');
  await page.locator('.item').nth(0).locator('.irow .seg button[data-k="ok"]').tap(); await page.waitForTimeout(700);
  ok(await S(() => { const a = document.activeElement, it = a && a.closest('.item'); return !!it && it === document.querySelectorAll('.item')[1]; }), 'after ผ่าน, focus moved to the next unchecked item');
  await page.locator('.item').nth(1).locator('.irow .seg button[data-k="fix"]').tap(); await page.waitForTimeout(500);
  ok(await S(() => { const a = document.activeElement; return a && a.tagName === 'TEXTAREA' && !!a.closest('.note') && a.closest('.item') === document.querySelectorAll('.item')[1]; }), 'after ต้องแก้ไข, focus goes to its note (not the next item)');
  await page.tap('#qc-next'); await page.waitForTimeout(600);
  ok(await S(() => { const a = document.activeElement, it = a && a.closest('.item'); return !!it && !document.querySelectorAll('.item')[2].dataset.res && it === document.querySelectorAll('.item')[2]; }), 'floating button jumps to the next unchecked item');
  await page.tap('#qf-compact'); await page.waitForTimeout(300);
  ok(await S(() => document.querySelectorAll('.item.compact').length >= 2), 'ย่อแถว: rows show only number, check, result');
  ok(await S(() => { const r = document.querySelectorAll('.item')[2]; return getComputedStyle(r.querySelector('.photos')).display === 'none' && getComputedStyle(r.querySelector('.irow .seg')).display !== 'none'; }), 'photos hidden, result buttons visible in a compact row');
  ok(await S(() => !document.querySelectorAll('.item')[1].classList.contains('compact')), 'the ต้องแก้ไข row stays open for photo / note');
  await page.locator('.item').nth(2).locator('.xpand').tap(); await page.waitForTimeout(300);
  ok(await S(() => !document.querySelectorAll('.item')[2].classList.contains('compact')), 'tapping "รูป ตำแหน่ง หมายเหตุ" opens that row');

  console.log('\n[7.2 touch targets]');
  const png = '/tmp/qc-app-review/test.png';
  if (!fs.existsSync(png)) { fs.mkdirSync('/tmp/qc-app-review', { recursive: true }); fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')); }
  await page.locator('.item').nth(2).getByLabel('+ เพิ่มรูป').setInputFiles(png); await page.waitForTimeout(500);
  const use = page.locator('.dlg-back button:has-text("ใช้รูปนี้")');
  try { await use.waitFor({ state: 'visible', timeout: 4000 }); await use.tap(); } catch (e) { }
  await page.waitForSelector('.item .thumb', { timeout: 6000 }).catch(() => {}); await page.waitForTimeout(400);
  const box = await S(() => { const m = document.querySelector('.item .thumb .tb.more'); if (!m) return null; const r = m.getBoundingClientRect(); return { w: r.width, h: r.height, small: [...document.querySelectorAll('.item .thumb .tb:not(.more)')].every(b => getComputedStyle(b).display === 'none') }; });
  ok(box && box.w >= 44 && box.h >= 44, 'one photo-options button ≥ 44×44 px (' + (box && Math.round(box.w)) + 'px)');
  ok(box && box.small, 'the four 28 px buttons are not shown on touch screens');
  await page.locator('.item .thumb .tb.more').first().tap(); await page.waitForTimeout(300);
  ok(await S(() => !document.getElementById('phsheet').hidden && document.querySelectorAll('#phsheet-b .btn').length === 4), 'opens a sheet with 4 large choices');
  ok(await S(() => [...document.querySelectorAll('#phsheet-b .btn')].every(b => b.getBoundingClientRect().height >= 48)), 'each choice ≥ 48 px tall');
  await page.locator('#phsheet-b .btn:has-text("หมุน")').tap(); await page.waitForTimeout(800);
  ok(await S(() => document.getElementById('phsheet').hidden), 'choosing an action closes the sheet');

  console.log('\n[7.3 dictation]');
  const mic = page.locator('.item').nth(2).locator('.mic');
  ok(await mic.count() === 1, 'mic button on the note field (speech recognition available)');
  await mic.tap(); await page.waitForTimeout(200);
  ok(/อินเทอร์เน็ต/.test(await page.locator('.item').nth(2).locator('.mic-note').textContent()), 'first tap explains, next to the mic, that speech goes over the internet');
  await mic.tap(); await page.waitForTimeout(400);
  ok(/เหล็กปลอกห่างเกิน/.test(await page.locator('.item').nth(2).locator('.note textarea').inputValue()), 'second tap: dictated text added to the note');
  await ctx.setOffline(true); await mic.tap(); await page.waitForTimeout(200);
  ok(/ไม่มีสัญญาณ/.test(await page.textContent('#status')), 'offline: says it needs internet instead of failing silently');
  await ctx.setOffline(false);

  console.log('\n[7.4 standard zones]');
  await page.tap('#qf-compact'); await page.waitForTimeout(300);
  ok(await S(() => !!document.querySelector('.item .zadd')), 'first row offers "+ ตั้งรายชื่อโซน / ชั้นของโครงการ"');
  await page.locator('.item .zadd').tap(); await page.waitForTimeout(300);
  await page.fill('#phsheet-b textarea', 'ฐานราก\nชั้น 1\nชั้น 2\nชั้น 3');
  await page.locator('#phsheet-b .btn.primary').tap(); await page.waitForTimeout(400);
  ok(await S(() => JSON.parse(localStorage.getItem('qc-zones:อาคาร A')).length === 4), 'zones saved for the project');
  await page.locator('.item').nth(3).locator('select.zsel').selectOption('ชั้น 3'); await page.waitForTimeout(300);
  await page.locator('.item').nth(3).locator('.loc textarea').type('เสา C-3');
  ok(await page.locator('.item').nth(3).locator('.loc textarea').inputValue() === 'ชั้น 3 · เสา C-3', 'location = zone + detail: "ชั้น 3 · เสา C-3"');
  await page.locator('.item').nth(3).locator('select.zsel').selectOption('ชั้น 2'); await page.waitForTimeout(300);
  ok(await page.locator('.item').nth(3).locator('.loc textarea').inputValue() === 'ชั้น 2 · เสา C-3', 'changing the zone keeps the detail');

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
