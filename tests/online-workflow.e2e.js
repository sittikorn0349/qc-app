// Run: python3 -m http.server 8911 (repo root) & npm i playwright; node tests/online-workflow.e2e.js [path]
// Online fix loop: owner assigns + due date, smart lists (งาน), headman "แจ้งแก้แล้ว" on someone
// else's document, member recheck on someone else's document (offline queue + conflict).
const { chromium } = require('playwright');
const fs = require('fs');
const { FAKE } = require('./online-mode.e2e.js');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '') ;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const S = (expr, arg) => page.evaluate(expr, arg);
  async function until(fn, arg, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(150); } return false; }
  const png = '/tmp/qc-wf-test.png';
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
  const yest = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });

  await page.goto(BASE + 'index.html?mode=online', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok(await S(() => !!document.querySelector('.qo-tb')), 'task button shown next to the status pill');

  console.log('\n[owner assigns an item with a due date]');
  await page.click('button.qh-tile.primary'); await page.click('#qh-sheet [data-form="qc-inspection"]'); await page.waitForTimeout(600);
  await page.fill('#m-project', 'Tower A'); await page.fill('#m-docno', 'QC-WF-001');
  const r0 = page.locator('.item').nth(0);
  await r0.locator('textarea[aria-label="ตำแหน่ง"]').fill('เสา C-3');
  await r0.locator('textarea[aria-label="รายการตรวจ"]').fill('ระยะหุ้มเหล็ก');
  await r0.locator('button[data-k="fix"]').first().click();
  const sel = r0.locator('select[aria-label^="มอบหมายรายการที่ 1"]');
  ok(await sel.count() === 1, 'assign picker appears for an item that needs fixing');
  const opts = await sel.locator('option').allTextContents();
  ok(opts.some(o => /เฮดแมน สมศักดิ์ \(เฮดแมน\)/.test(o)) && !opts.some(o => /ผู้ดู/.test(o)), 'picker lists members with roles, headman first: ' + opts.join(' | '));
  await sel.selectOption({ label: 'เฮดแมน สมศักดิ์ (เฮดแมน)' });
  await r0.locator('input[aria-label^="กำหนดแก้เสร็จรายการที่ 1"]').fill(yest);
  await r0.locator('input[aria-label^="กำหนดแก้เสร็จรายการที่ 1"]').dispatchEvent('change');
  ok(await until((d) => { const S = window.__fake.S; const it = Object.values(S.items).find(i => i.res === 'fix' && i.loc === 'เสา C-3'); return it && it.assignee_id === window.__fake.HM && it.due_date === d && it.status === 'assigned'; }, yest, 12000), 'assignee + due date reached the server, status → assigned');
  ok(await until(() => /มอบหมายแล้ว/.test(document.querySelector('.item').textContent) && /ผู้แก้: เฮดแมน สมศักดิ์/.test(document.querySelector('.item').textContent)), 'item shows status chip and assignee');
  ok(await S(() => /เลยกำหนด/.test(document.querySelector('.item').textContent)), 'overdue due date flagged on the item');

  console.log('\n[smart lists]');
  await page.click('.qo-tb'); await page.waitForTimeout(300);
  ok(await S(() => !!document.querySelector('.qo-tasks')), 'tasks panel opens');
  await page.click('.qo-tab:has-text("เลยกำหนด")');
  ok(/ระยะหุ้มเหล็ก/.test(await page.textContent('.qo-tasks')), '"เลยกำหนด" lists the overdue item');
  await page.click('.qo-tasks button:has-text("ปิด")');

  console.log('\n[headman reports fixed on someone else\'s document]');
  await S(() => { window.__fake.addShared('ipm2', 'PM-020', window.__fake.ME); window.__fake.fire(); });
  ok(await until(() => /\d/.test(document.querySelector('.qo-tb b').textContent)), 'task badge counts the item assigned to me');
  await page.click('.qo-tb'); await page.waitForTimeout(300);
  await page.click('.qo-tab:has-text("งานของฉัน")');
  ok(/คาน B1/.test(await page.textContent('.qo-tasks')), '"งานของฉัน" lists it');
  await page.click('.qo-task:has-text("คาน B1")'); await page.waitForTimeout(800);
  ok(await S(() => window.__qcForm.viewing() && window.__qcForm.cur() === 'ipm2'), 'tapping the task opens that document');
  const fx = page.locator('.act button:has-text("แจ้งแก้แล้ว")');
  ok(await fx.count() === 1 && await fx.isEnabled(), '"แจ้งแก้แล้ว" button available to the assignee');
  ok(await S(() => document.querySelector('textarea[aria-label="ตำแหน่ง"]').disabled), 'the rest of the document stays read-only');
  const box = page.locator('.item:has(.act-box)').first();
  await box.locator('.act label.addphoto input').setInputFiles(png);
  await page.waitForTimeout(400);
  await page.locator('.dlg-back button:has-text("ใช้รูปนี้")').click();
  ok(await until(() => document.querySelectorAll('.act .thumb').length === 1 && !document.querySelector('.act .thumb.busy')), 'after-fix photo added in the action box');
  await box.locator('.act textarea').fill('แก้ระดับคานแล้ว');
  await page.locator('.act button:has-text("แจ้งแก้แล้ว")').click();
  ok(await until(() => { const it = window.__fake.S.items['ipm2.x1']; return it.status === 'fixed' && it.fixed_note === 'แก้ระดับคานแล้ว' && it.after.length === 1; }, undefined, 12000), 'server: status fixed, note and photo recorded');
  const ap = await S(() => window.__fake.S.items['ipm2.x1'].after[0]);
  ok(ap.indexOf(await S(() => window.__fake.ME) + '/') === 0 && await S((p) => !!window.__fake.S.blobs[p], ap), 'photo uploaded to the headman\'s own folder');
  ok(await until(() => /แจ้งแก้แล้ว รอตรวจซ้ำ/.test([...document.querySelectorAll('.item')].map(n => n.textContent).join(' '))), 'form shows "แจ้งแก้แล้ว รอตรวจซ้ำ"');

  console.log('\n[member rechecks someone else\'s document while offline]');
  await S(() => { window.__fake.addShared('ipm1', 'PM-007'); window.__fake.fixedBy('ipm1.x1', 'ทำแล้ว'); window.__fake.fire(); });
  ok(await until(() => { const d = window.__qcGetDoc('ipm1'); return d && d.items[0].st === 'fixed'; }), 'fixed item pulled');
  await page.click('.qo-tb'); await page.waitForTimeout(300);
  await page.click('.qo-tab:has-text("รอตรวจซ้ำ")');
  ok(/PM สมชาย/.test(await page.textContent('.qo-tasks')), '"รอตรวจซ้ำ" lists items from other people\'s documents with owner name');
  await page.click('.qo-task:has-text("PM-007")'); await page.waitForTimeout(800);
  ok(await S(() => window.__qcForm.cur() === 'ipm1'), 'opened PM-007');
  ok(/ผู้แก้แจ้งว่า: ทำแล้ว/.test(await page.textContent('.act')), 'shows the fix note from the headman');
  await ctx.setOffline(true); await page.waitForTimeout(200);
  await page.click('.act .seg button[data-k="ok"]');
  await page.locator('.act textarea').fill('ตรวจแล้ว ผ่าน');
  await page.click('.act button:has-text("บันทึกผลตรวจซ้ำ")');
  ok(await until(() => /ตรวจซ้ำผ่าน/.test(document.querySelector('.act').textContent) && /รอส่งขึ้นระบบ/.test(document.querySelector('.act').textContent)), 'shown as passed + "รอส่งขึ้นระบบ" while offline');
  ok(await S(() => window.__fake.S.items['ipm1.x1'].rres === ''), 'server untouched while offline');
  await ctx.setOffline(false);
  ok(await until(() => { const it = window.__fake.S.items['ipm1.x1']; return it.rres === 'ok' && it.rnote === 'ตรวจแล้ว ผ่าน' && it.status === 'approved'; }, undefined, 12000), 'recheck sent when back online');
  ok(await until(() => !/รอส่งขึ้นระบบ/.test(document.querySelector('.act').textContent)), 'pending mark cleared after sync');

  console.log('\n[conflict: someone rechecks first]');
  await S(() => { window.__fake.addShared('ipm3', 'PM-030'); window.__fake.fixedBy('ipm3.x1', ''); window.__fake.fire(); });
  ok(await until(() => !!window.__qcGetDoc('ipm3')), 'third document pulled');
  await S(() => window.__qcForm.openDoc('ipm3', 'x1')); await page.waitForTimeout(600);
  await S(() => window.__fake.otherRecheck('ipm3.x1', 'bad', 'PM: ยังไม่ผ่าน'));   // no realtime yet
  await page.click('.act .seg button[data-k="ok"]');
  await page.click('.act button:has-text("บันทึกผลตรวจซ้ำ")');
  ok(await until(() => window.__fake.S.events.some(e => e.kind === 'recheck_conflict' && e.item === 'ipm3.x1')), 'late recheck kept as conflict in history');
  ok(await S(() => window.__fake.S.items['ipm3.x1'].rres === 'bad'), 'first result stays on the server');
  ok(await until(() => /มีคนบันทึกผลตรวจซ้ำรายการนี้ก่อนคุณ/.test(document.body.textContent)), 'user told about the conflict');
  ok(await until(() => /ตรวจซ้ำไม่ผ่าน/.test(document.querySelector('.act').textContent)), 'form corrected to the server result');

  console.log('\n[LINE linking]');
  await page.click('.qo-pill'); await page.click('.qo-card button:has-text("เชื่อม LINE")');
  await page.click('.qo-card button:has-text("ขอรหัสเชื่อมบัญชี")');
  ok(/123456/.test(await page.textContent('.qo-card')), 'shows the 6-digit code');
  ok(await page.getAttribute('.qo-card a:has-text("เปิด LINE แล้วส่งรหัส")', 'href') === 'https://line.me/R/oaMessage/%40qcapp/?123456', 'deep link pre-fills the code in the OA chat');
  await S(() => { window.__fake.S.linked = true; });
  ok(await until(() => /เชื่อม LINE แล้ว/.test(document.querySelector('.qo-card').textContent), undefined, 9000), 'turns into "linked" once LINE receives the code');
  await page.click('.qo-card button:has-text("ปิด")');

  console.log('\n[reload keeps everything, nothing re-sent]');
  const n0 = await S(() => window.__fake.S.calls.length);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  const writes = await S((n) => window.__fake.S.calls.slice(n).filter(c => /insert|update|recheck|upload|reportFixed/.test(c)), n0);
  ok(writes.length === 0, 'no redundant writes after reload ' + JSON.stringify(writes));

  console.log('\n--- page errors ---'); console.log(errs.length ? errs.join('\n') : '(none)');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
