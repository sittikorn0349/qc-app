// Run: python3 -m http.server 8911 (repo root) & node tests/annotate.e2e.js [path]
// Photo markup: draw a circle, an arrow and text on a new photo (before saving) and on a saved thumb.
const { chromium } = require('playwright');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  const tile = page.locator('button.qh-tile.primary'); if (await tile.count()) { await tile.click(); await page.click('#qh-sheet [data-form="qc-inspection"]'); await page.waitForTimeout(500); }
  const r0 = page.locator('.item').nth(0);
  await r0.getByLabel('+ เพิ่มรูป').setInputFiles('/tmp/qc-photo.jpg'); await page.waitForTimeout(500);
  const mark = page.locator('.dlg-back button:has-text("ขีดเขียน")');
  ok(await mark.count() === 1, 'confirm dialog offers "✎ ขีดเขียน"');
  await mark.click(); await page.waitForTimeout(300);
  const cv = page.locator('.an-back canvas'); ok(await cv.count() === 1, 'markup screen opens');
  const b = await cv.boundingBox();
  const drag = async (x1, y1, x2, y2) => { await page.mouse.move(b.x + b.width * x1, b.y + b.height * y1); await page.mouse.down(); await page.mouse.move(b.x + b.width * (x1 + x2) / 2, b.y + b.height * (y1 + y2) / 2, { steps: 4 }); await page.mouse.move(b.x + b.width * x2, b.y + b.height * y2, { steps: 4 }); await page.mouse.up(); };
  const sig = () => page.evaluate(() => { const c = document.querySelector('.an-back canvas'); return c.toDataURL().length; });
  const s0 = await sig();
  await drag(0.35, 0.3, 0.65, 0.7);
  const s1 = await sig(); ok(s1 !== s0, 'circle drawn (canvas changed)');
  await page.click('.an-bar button:has-text("ลูกศร")'); await page.click('.an-bar button[aria-label="สีเหลือง"]');
  await drag(0.1, 0.1, 0.33, 0.3); ok(await sig() !== s1, 'yellow arrow drawn');
  await page.click('.an-bar button:has-text("ข้อความ")');
  await page.mouse.click(b.x + b.width * 0.1, b.y + b.height * 0.8);
  ok(await page.isVisible('.an-txt input'), 'text box appears after tapping the photo');
  await page.fill('.an-txt input', 'ระยะหุ้มไม่พอ'); await page.keyboard.press('Enter');
  ok(await page.evaluate(() => !document.querySelector('.an-bar button[aria-label="ย้อนกลับ"]').disabled), 'undo available');
  const btnMin = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.an-bar button')].map(x => x.getBoundingClientRect().height)));
  ok(btnMin >= 48, 'toolbar buttons ≥ 48px for gloves (' + btnMin + ')');
  await page.screenshot({ path: '/tmp/annotate-screen.png' });
  await page.click('.an-head .done'); await page.waitForTimeout(400);
  ok(await page.isVisible('.dlg-back button:has-text("ขีดเขียนเพิ่ม")'), 'preview updated with the markup');
  await page.click('.dlg-back button:has-text("ใช้รูปนี้")');
  await page.waitForFunction(() => document.querySelectorAll('.item .thumb img').length === 1 && !document.querySelector('.thumb.busy'));
  const d1 = await page.evaluate(() => document.querySelector('.item .thumb img').src);
  ok(/^(data:image\/jpeg|blob:|http)/.test(d1), 'marked-up photo saved to the item');
  // the saved pixels differ from the original: red ring at the left edge of the circle
  const px = await page.evaluate(() => new Promise(r => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; const x = c.getContext('2d'); x.drawImage(i, 0, 0); let red = 0; const d = x.getImageData(0, 0, c.width, c.height).data; for (let k = 0; k < d.length; k += 4) if (d[k] > 200 && d[k + 1] < 90 && d[k + 2] < 90) red++; r(red); }; i.src = document.querySelector('.item .thumb img').src; }));
  ok(px > 200, 'red markup baked into the saved photo (' + px + ' red px)');

  console.log('\n[mark up a saved photo]');
  /* touch screen: the photo actions live behind one 44 px ⋯ button (7.2) */
  await page.click('.item .thumb .tb.more'); await page.click('#phsheet-b button:has-text("ขีดเขียน")'); await page.waitForTimeout(400);
  ok(await page.isVisible('.an-back canvas'), 'thumb ✎ opens markup');
  await page.click('.an-head button:has-text("ยกเลิก")'); await page.waitForTimeout(200);
  ok(!(await page.isVisible('.an-back')) && await page.evaluate((s) => document.querySelector('.item .thumb img').src === s, d1), 'cancel leaves the photo untouched');
  /* touch screen: the photo actions live behind one 44 px ⋯ button (7.2) */
  await page.click('.item .thumb .tb.more'); await page.click('#phsheet-b button:has-text("ขีดเขียน")'); await page.waitForTimeout(400);
  const b2 = await page.locator('.an-back canvas').boundingBox();
  await page.mouse.move(b2.x + 20, b2.y + 20); await page.mouse.down(); await page.mouse.move(b2.x + 120, b2.y + 90, { steps: 6 }); await page.mouse.up();
  await page.click('.an-head .done');
  ok(await page.waitForFunction((s) => { const i = document.querySelector('.item .thumb img'); return i && i.src !== s && !document.querySelector('.thumb.busy'); }, d1, { timeout: 5000 }).then(() => true, () => false), 'saved photo replaced with the marked-up version');
  console.log('\n--- page errors ---'); console.log(errs.length ? errs.join('\n') : '(none)');
  console.log(`\n${pass} passed, ${fail} failed`); await browser.close(); process.exit(fail ? 1 : 0);
})();
