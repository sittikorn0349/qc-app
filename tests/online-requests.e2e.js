// Run: python3 -m http.server 8911 (repo root) & node tests/online-requests.e2e.js [path]
// Inspection requests (ขอตรวจ / รับนัด / ผ่าน / ไม่ผ่าน, offline queue), cross-document search, safety form.
const { chromium } = require('playwright');
const { FAKE } = require('./online-mode.e2e.js');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('dialog', d => d.accept());
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const S = (expr, arg) => page.evaluate(expr, arg);
  async function until(fn, arg, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(150); } return false; }

  await page.goto(BASE + 'index.html?mode=online', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  console.log('\n[safety form from the form picker]');
  await page.click('button.qh-tile.primary');
  ok(/แบบตรวจความปลอดภัย/.test(await page.textContent('#qh-sheet')), '"สร้างรายงาน" picker lists the safety form');
  await page.click('#qh-sheet [data-form="safety"]'); await page.waitForTimeout(600);
  ok((await page.textContent('.top h1')).trim() === 'แบบตรวจความปลอดภัย', 'form header reads "แบบตรวจความปลอดภัย"');
  const chks = await S(() => [...document.querySelectorAll('textarea[aria-label="รายการตรวจ"]')].map(t => t.value));
  ok(chks.length >= 15 && chks.some(c => /ค้ำยันทแยง/.test(c)) && chks.some(c => /ช่องเปิดพื้น/.test(c)) && chks.some(c => /ประชุมก่อนเริ่มงาน/.test(c)), 'checklist pre-filled: scaffold, guardrail/openings, toolbox talk (' + chks.length + ')');
  const cats = await S(() => [...document.querySelector('.item select').options].map(o => o.value));
  ok(cats.includes('นั่งร้าน') && cats.includes('ราวกันตก / ช่องเปิด') && !cats.includes('คอนกรีต'), 'category list is the safety one, not QC');
  await page.fill('#m-project', 'Tower A'); await page.fill('#m-docno', 'SF-001');
  const r0 = page.locator('.item').nth(0);
  await r0.locator('textarea[aria-label="ตำแหน่ง"]').fill('นั่งร้านด้านทิศเหนือ ชั้น 3');
  await r0.locator('button[data-k="bad"]').first().click();
  ok(await until(() => Object.values(window.__fake.S.insp).some(h => h.docno === 'SF-001' && h.meta.form === 'safety'), undefined, 12000), 'safety document synced with its form marker');
  await S(() => window.__qcHome.go('home')); await page.waitForTimeout(300);
  await page.click('button.qh-tile.primary'); await page.click('#qh-sheet [data-form="qc-inspection"]'); await page.waitForTimeout(600);
  ok((await page.textContent('.top h1')).trim() === 'แบบฟอร์มตรวจงานก่อสร้าง', 'switching back gives the QC form');
  await page.fill('#m-docno', 'QC-100');
  const q0 = page.locator('.item').nth(0);
  await q0.locator('textarea[aria-label="ตำแหน่ง"]').fill('คาน B2 ชั้น 3');
  await q0.locator('textarea[aria-label="รายการตรวจ"]').fill('ระยะหุ้มเหล็ก');
  await q0.locator('select').first().selectOption('เหล็กเสริม');
  await q0.locator('button[data-k="bad"]').first().click();
  const q1 = page.locator('.item').nth(1);
  await q1.locator('textarea[aria-label="ตำแหน่ง"]').fill('เสา C1 ชั้น 2');
  await q1.locator('select').first().selectOption('เหล็กเสริม');
  await q1.locator('button[data-k="ok"]').first().click();
  ok(await until(() => Object.values(window.__fake.S.insp).some(h => h.docno === 'QC-100'), undefined, 12000), 'QC document synced');

  console.log('\n[search across documents]');
  await S(() => window.__qcOnline.search('เหล็กเสริม ชั้น 3 ไม่ผ่าน เดือนนี้')); await page.waitForTimeout(300);
  const chips = await page.textContent('.qo-tasks .qo-card');
  ok(/หมวด: เหล็กเสริม/.test(chips) && /ผล: ไม่ผ่าน/.test(chips) && /ช่วง: เดือนนี้/.test(chips) && /คำ: ชั้น 3/.test(chips), 'query understood as category + result + period + words');
  const res = await S(() => [...document.querySelectorAll('.qo-tasks .qo-task .qo-tt')].map(n => n.textContent));
  ok(res.length === 1 && /คาน B2 ชั้น 3/.test(res[0]), 'finds only the failed rebar item on floor 3: ' + JSON.stringify(res));
  await page.fill('.qo-search', 'ความปลอดภัย ไม่ผ่าน'); await page.waitForTimeout(400);
  const res2 = await S(() => [...document.querySelectorAll('.qo-tasks .qo-task .qo-tt')].map(n => n.textContent));
  ok(res2.length === 1 && /นั่งร้านด้านทิศเหนือ/.test(res2[0]), 'safety filter keeps safety documents apart from QC');
  await page.fill('.qo-search', ''); await page.click('.qo-qchip:has-text("ผ่าน")').catch(() => {});
  await page.fill('.qo-search', 'เหล็กเสริม'); await page.waitForTimeout(400);
  ok((await S(() => document.querySelectorAll('.qo-tasks .qo-task').length)) === 2, 'plain word matches every rebar item');
  await page.click('.qo-tasks .qo-task:has-text("เสา C1")'); await page.waitForTimeout(700);
  ok(await S(() => !!document.querySelector('.item.flash, .item')) && await S(() => window.__qcForm.cur()) === await S(() => Object.values(window.__fake.S.insp).find(h => h.docno === 'QC-100').id), 'tapping a result opens its document');

  console.log('\n[inspection request: foreman asks, PM inspects]');
  await page.click('.qo-tb'); await page.waitForTimeout(300);
  await page.click('.qo-tasks button:has-text("+ ขอตรวจงาน")'); await page.waitForTimeout(300);
  const f = page.locator('.qo-card');
  ok(await f.locator('text=แนบเอกสาร').count() === 1, 'offers to attach the open document');
  await f.locator('label:has-text("งานที่ขอตรวจ") input').fill('ตรวจเหล็กเสริม คาน-พื้น');
  await f.locator('label:has-text("ตำแหน่ง") input').fill('ชั้น 3 โซน A');
  await f.locator('label:has-text("ผู้ตรวจ") select').selectOption({ label: 'PM สมชาย (PM)' });
  await f.locator('label:has-text("งานถัดไปที่รอผลนี้") input').fill('เทคอนกรีตพื้นชั้น 3');
  await ctx.setOffline(true); await page.waitForTimeout(200);
  await f.locator('button:has-text("ส่งใบขอตรวจ")').click(); await page.waitForTimeout(400);
  ok(/ตรวจเหล็กเสริม คาน-พื้น/.test(await page.textContent('.qo-tasks')) && /รอส่ง/.test(await page.textContent('.qo-tasks')), 'request shows at once, marked "รอส่ง" while offline');
  ok(await S(() => !Object.keys(window.__fake.S.reqs || {}).length), 'nothing sent while offline');
  await ctx.setOffline(false);
  ok(await until(() => { const r = Object.values(window.__fake.S.reqs || {})[0]; return r && r.inspector_id === window.__fake.OTHER && r.hold === true && r.next_step === 'เทคอนกรีตพื้นชั้น 3' && !!r.inspection_id; }, undefined, 12000), 'request reached the server: inspector, hold point, next step, document');
  await S(() => { const r = Object.values(window.__fake.S.reqs)[0]; r.status = 'failed'; r.result_note = 'ระยะหุ้มไม่พอ 2 จุด'; window.__fake.fire(); });
  ok(await until(() => /ตรวจไม่ผ่าน/.test(document.querySelector('.qo-tasks').textContent)), 'result pulled in: failed');
  await page.click('.qo-tab:has-text("ใบขอตรวจ")'); await page.waitForTimeout(300);
  ok(/ยังเริ่มไม่ได้|รอผลก่อนเริ่ม/.test(await page.textContent('.qo-tasks')) && /ระยะหุ้มไม่พอ/.test(await page.textContent('.qo-tasks')), 'shows the next step is still blocked and why');
  await page.click('.qo-tasks button:has-text("ขอตรวจใหม่")'); await page.waitForTimeout(300);
  ok(await page.inputValue('.qo-card label:has-text("งานที่ขอตรวจ") input') === 'ตรวจเหล็กเสริม คาน-พื้น', '"ขอตรวจใหม่" pre-fills the form');
  await page.click('.qo-card button:has-text("ส่งใบขอตรวจ")');
  ok(await until(() => Object.keys(window.__fake.S.reqs).length === 2, undefined, 8000), 'second request sent');

  console.log('\n[I am the inspector]');
  await S(() => { window.__fake.addRequest({ id: 'req_x1', project_id: 'p1', title: 'ตรวจแบบหล่อเสา', loc: 'ชั้น 4', inspector_id: window.__fake.ME, requested_by: window.__fake.OTHER, scheduled_at: new Date(Date.now() + 3600000).toISOString(), next_step: 'เทเสาชั้น 4' }); window.__fake.fire(); });
  ok(await until(() => window.__qcOnline.requests().some(r => r.id === 'req_x1')), 'request for me pulled');
  ok(await until(() => /[1-9]/.test(document.querySelector('.qo-tb b').textContent)), 'task badge counts it');
  await page.click('.qo-card button:has-text("ปิด")').catch(() => {});
  await page.click('.qo-tb'); await page.waitForTimeout(300); await page.click('.qo-tab:has-text("ใบขอตรวจ")');
  const card = page.locator('.qo-req').filter({ hasText: 'ตรวจแบบหล่อเสา' });
  await card.locator('button:has-text("รับนัด")').click();
  ok(await until(() => window.__fake.S.reqs.req_x1.status === 'accepted', undefined, 8000), 'accept reaches the server');
  await page.locator('.qo-req').filter({ hasText: 'ตรวจแบบหล่อเสา' }).locator('button:has-text("ไม่ผ่าน")').click();
  ok(await S(() => window.__fake.S.reqs.req_x1.status) === 'accepted', '"ไม่ผ่าน" needs a reason first');
  await page.locator('.qo-req').filter({ hasText: 'ตรวจแบบหล่อเสา' }).locator('textarea').fill('ผ่าน ดิ่งได้ตามเกณฑ์');
  await page.locator('.qo-req').filter({ hasText: 'ตรวจแบบหล่อเสา' }).locator('button.qo-pass').click();
  ok(await until(() => window.__fake.S.reqs.req_x1.status === 'passed' && window.__fake.S.reqs.req_x1.result_note === 'ผ่าน ดิ่งได้ตามเกณฑ์', undefined, 8000), 'pass with note recorded');
  ok(await until(() => /เริ่มงานถัดไปได้: เทเสาชั้น 4/.test(document.querySelector('.qo-tasks').textContent)), 'card shows the next step is unlocked');

  console.log('\n[reload: nothing re-sent]');
  const n0 = await S(() => window.__fake.S.calls.length);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  const w = await S((n) => window.__fake.S.calls.slice(n).filter(c => /insert|update|recheck|upload|answer|Request/.test(c)), n0);
  ok(w.length === 0, 'no redundant writes ' + JSON.stringify(w));
  ok(await S(() => window.__qcOnline.requests().length === 3), 'requests available after reload');

  console.log('\n--- page errors ---'); console.log(errs.length ? errs.join('\n') : '(none)');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
