// Run: python3 -m http.server 8911 (repo root) & node tests/forms.e2e.js [path] [online]
// "สร้างรายงาน" form picker, built-in forms on the form engine, form builder, PDF export.
const { chromium } = require('playwright');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');
const ONLINE = process.argv[3] === 'online';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAQklEQVR42u3PMQ0AAAgDoC251a3hHFJBByqZSFYwMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL6dAAJ9AJ1xXwBbgAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  if (ONLINE) { const { FAKE } = require('./online-mode.e2e.js'); await ctx.addInitScript(FAKE); }
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const S = (expr, arg) => page.evaluate(expr, arg);
  const url = BASE + 'index.html' + (ONLINE ? '?mode=online' : '');
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  console.log('\n[home: "สร้างรายงาน" opens the form picker]');
  ok(!(await page.$('#qh-fbtn')), 'old dropdown picker is gone from home');
  ok(/สร้างรายงาน/.test(await page.textContent('#qh-t-new')), 'primary tile reads "สร้างรายงาน"');
  await page.click('#qh-t-new');
  const sheet = await page.textContent('#qh-sheet');
  for (const n of ['แบบฟอร์มตรวจงานก่อสร้าง', 'แบบตรวจความปลอดภัย', 'รายงานประจำวัน', 'ใบขออนุญาตเทคอนกรีต', 'บันทึกตรวจรับวัสดุ', 'สร้างแบบฟอร์มเอง'])
    ok(sheet.includes(n), 'picker lists ' + n);

  console.log('\n[original inspection form still opens from the picker]');
  await page.click('#qh-sheet [data-form="qc-inspection"]'); await page.waitForTimeout(700);
  ok((await page.textContent('.top h1')).trim() === 'แบบฟอร์มตรวจงานก่อสร้าง', 'original form opened');
  ok(await S(() => window.__qcHome.view()) === 'form', 'home switched to the form view');
  await page.fill('#m-project', 'Tower A');
  await S(() => window.__qcHome.go('home')); await page.waitForTimeout(300);

  console.log('\n[built-in: pour permit]');
  await page.click('#qh-t-new');
  await page.click('#qh-sheet [data-form="pour"]'); await page.waitForTimeout(500);
  ok(await page.isVisible('#qcf'), 'form engine view opens');
  ok((await page.textContent('#qcf h1 + h1, #qcf .qf-in > h1')).includes('ใบขออนุญาตเทคอนกรีต'), 'title is the pour permit');
  const head = await S(() => [...document.querySelectorAll('#qcf [data-type=fields] input, #qcf [data-type=fields] select')].map(i => i.value));
  ok(/PP-001$/.test(head[1]), 'document number auto-filled (' + head[1] + ')');
  ok(/^\d{4}-\d\d-\d\d$/.test(head[2]), 'date auto-filled');
  ok(head[0] === 'Tower A', 'project carried from the open inspection (' + head[0] + ')');
  ok((await page.$$('#qcf .qck')).length === 9, 'checklist has 9 readiness items');
  await page.locator('#qcf .qck').nth(1).locator('button:has-text("ไม่พร้อม")').click();
  await page.locator('#qcf .qck').nth(1).locator('input').fill('ลูกปูนขาด 3 จุด');
  await page.locator('#qcf .qck').nth(0).locator('button:has-text("พร้อม")').first().click();
  ok(/ตรวจแล้ว 2\/9 · ไม่พร้อม 1/.test(await page.textContent('#qcf [data-type=checklist] h2')), 'checklist counter updates');
  await page.locator('#qcf [data-type=choice] button:has-text("อนุญาตโดยมีเงื่อนไข")').click();
  await page.setInputFiles('#qcf [data-type=photos] input[type=file]', { name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForTimeout(500);
  ok((await page.$$('#qcf [data-type=photos] img')).length === 1, 'photo attached and shown');
  await page.locator('#qcf [data-type=signatures] input[type=text]').first().fill('สมชาย ผู้รับเหมา');
  await page.waitForTimeout(700);
  ok(/บันทึกในเครื่องแล้ว/.test(await page.textContent('#qcf-status')), 'autosaved on this device');

  console.log('\n[PDF]');
  await page.click('#qcf-pdf-btn');
  await page.waitForSelector('#qcf-preview', { timeout: 15000 });
  const pages = await page.$$eval('#qcf-preview .sheet', a => a.length);
  ok(pages >= 1, 'A4 preview shows ' + pages + ' page(s)');
  const pdfText = await page.textContent('#qcf-preview');
  ok(pdfText.includes('ใบขออนุญาตเทคอนกรีต') && pdfText.includes('ลูกปูนขาด 3 จุด') && pdfText.includes('☑ อนุญาตโดยมีเงื่อนไข') && pdfText.includes('สมชาย ผู้รับเหมา'), 'sheet carries title, notes, decision and signer');
  const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
  await page.click('#qcf-pdf-ok');
  const d = await dl;
  // headless Chromium reports non-ASCII download names as "download", so check the name the app asked for
  const asked = await S(() => window.__qcfLastPdf);
  ok(d && asked && /^ใบขออนุญาตเทคอนกรีต_.*PP-001\.pdf$/.test(asked.name) && asked.size > 20000, 'PDF downloaded (' + (asked && asked.name) + ', ' + (asked && asked.size) + ' bytes)');
  await page.waitForTimeout(400);

  console.log('\n[library + persistence]');
  await page.click('#qcf-back'); await page.waitForTimeout(300);
  ok(!(await page.isVisible('#qcf')), 'back returns home');
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(900);
  ok(/1 ฉบับ/.test(await page.textContent('#qh-t-forms')), 'home tile counts 1 document');
  await page.click('#qh-t-forms'); await page.waitForTimeout(400);
  ok((await page.textContent('#qcf')).includes('ใบขออนุญาตเทคอนกรีต'), 'library lists the pour permit');
  await page.click('#qcf .qrow button:has-text("เปิด")'); await page.waitForTimeout(400);
  ok(await page.locator('#qcf .qck').nth(1).locator('input').inputValue() === 'ลูกปูนขาด 3 จุด', 'values survive a reload');
  ok(await page.locator('#qcf .qck').nth(1).locator('button[aria-pressed=true]').textContent() === 'ไม่พร้อม', 'result survives a reload');
  await page.click('#qcf-back'); await page.waitForTimeout(300);

  console.log('\n[daily report table]');
  await page.click('#qh-t-new'); await page.click('#qh-sheet [data-form="daily"]'); await page.waitForTimeout(400);
  const labour = page.locator('#qcf [data-type=table]').first();
  ok(await labour.locator('tbody tr').count() === 4, 'labour table starts with 4 trades');
  await labour.locator('tbody tr').nth(0).locator('input').nth(1).fill('6');
  await labour.locator('button:has-text("+ เพิ่มแถว")').click();
  ok(await labour.locator('tbody tr').count() === 5, 'row added');
  await page.click('#qcf-back'); await page.waitForTimeout(300);

  console.log('\n[form builder]');
  await page.click('#qh-t-new'); await page.click('#qh-build'); await page.waitForTimeout(300);
  ok((await page.textContent('#qcf')).includes('ตัวสร้างแบบฟอร์ม'), 'builder opens');
  await page.fill('#qb-name', 'ตรวจงานกันซึม');
  for (const k of ['fields', 'checklist', 'table', 'photos', 'choice', 'signatures']) await page.click(`#qcf [data-add="${k}"]`);
  ok((await page.$$('#qcf .qb-w')).length === 6, '6 widgets added from the palette');
  const ck = page.locator('#qcf .qb-w').nth(1);
  await ck.locator('textarea').first().fill('ทำความสะอาดผิวก่อนทา\nทาชั้นรองพื้น\nความหนาตามสเปก');
  await page.locator('#qcf .qb-w').nth(1).locator('button[aria-label="เลื่อนขึ้น"]').click();
  ok((await page.locator('#qcf .qb-w').nth(0).getAttribute('data-w')) !== null && /เช็กลิสต์/.test(await page.locator('#qcf .qb-w').nth(0).textContent()), 'reorder moves the checklist to the top');
  await page.locator('#qcf .qb-w').nth(0).locator('button[aria-label="เลื่อนลง"]').click();
  await page.click('#qb-preview'); await page.waitForTimeout(200);
  ok((await page.textContent('#qb-pv')).includes('ทาชั้นรองพื้น'), 'preview renders the edited checklist');
  await page.click('#qb-pv button:has-text("ปิด")');
  await page.click('#qb-save'); await page.waitForTimeout(300);
  ok(/บันทึกแบบฟอร์มแล้ว/.test(await page.textContent('#qcf-status')), 'custom form saved');
  await page.click('#qb-use'); await page.waitForTimeout(500);
  ok((await page.textContent('#qcf .qf-in > h1')).includes('ตรวจงานกันซึม'), 'new document from the custom form');
  ok((await page.$$('#qcf .qck')).length === 3, 'custom checklist has 3 items');
  await page.locator('#qcf .qck').nth(2).locator('button:has-text("ไม่ผ่าน")').click();
  await page.waitForTimeout(600);
  await page.click('#qcf-pdf-btn'); await page.waitForSelector('#qcf-preview', { timeout: 15000 });
  ok((await page.textContent('#qcf-preview')).includes('ความหนาตามสเปก'), 'custom form prints to PDF preview');
  await page.click('#qcf-preview button:has-text("ยกเลิก")'); await page.waitForTimeout(300);
  await page.click('#qcf-back'); await page.waitForTimeout(300);
  await page.click('#qh-t-new');
  ok((await page.textContent('#qh-sheet')).includes('ตรวจงานกันซึม'), 'picker lists the custom form');
  await page.click('#qh-sheet button[aria-label="แก้แบบฟอร์ม ตรวจงานกันซึม"]'); await page.waitForTimeout(300);
  ok(await page.inputValue('#qb-name') === 'ตรวจงานกันซึม', 'custom form opens back in the builder for editing');
  await page.click('#qcf-back');

  console.log('\n[mobile width]');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('#qh-t-new'); await page.click('#qh-sheet [data-form="material"]'); await page.waitForTimeout(400);
  const ow = await S(() => document.getElementById('qcf').scrollWidth <= window.innerWidth + 1);
  ok(ow, 'no horizontal overflow at 390px');

  ok(errs.length === 0, 'no console errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
