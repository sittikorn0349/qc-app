// Run: python3 -m http.server 8911 (repo root) & node tests/handoff.e2e.js [path]
// Developer handoff (P0–P3): one confirm pattern, direct actions, ⋯ menu, lightbox swipe,
// library multi-select + location search, import retry, debug link hidden, shared helpers.
const { chromium } = require('playwright');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');

(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } }); await ctx.addInitScript(() => { try { localStorage.setItem('qa-shell', 'off'); } catch (e) {} });   // these suites drive the classic home
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  let nativeDialogs = 0; page.on('dialog', d => { nativeDialogs++; d.dismiss(); });
  await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  const S = (f, a) => page.evaluate(f, a);

  console.log('\n[shared helpers]');
  ok(await S(() => typeof QCU.arm === 'function' && typeof QCU.ask === 'function' && typeof QC.armConfirm === 'function' && typeof QC.confirmSheet === 'function'), 'QCU.arm / QCU.ask and QC.armConfirm / QC.confirmSheet exist');
  ok(await S(() => typeof QC.buildBackup === 'function'), 'page QC helpers kept alongside (merge, not overwrite)');
  ok(await S(() => typeof QCU.today === 'function' && /^\d{4}-\d\d-\d\d$/.test(QCU.today()) && QCU.thDate('2026-11-23') === '23/11/2569'), 'shared date helpers');

  console.log('\n[confirm sheet replaces native dialogs]');
  const pr = S(() => { window.__askRes = null; QC.confirmSheet('ทดสอบ', { okLabel: 'ตกลง' }).then(v => { window.__askRes = v; }); });
  await pr; await page.waitForTimeout(200);
  ok(await page.isVisible('.qc-sheet-confirm [role="alertdialog"]'), 'sheet shown (.qc-sheet-confirm, alertdialog)');
  ok(await S(() => document.activeElement && document.activeElement.id === 'qc-ask-no'), 'focus starts on the safe choice');
  ok(await S(() => getComputedStyle(document.getElementById('qc-ask-ok')).backgroundColor !== 'rgba(0, 0, 0, 0)'), 'OK button is the red danger button');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  ok(await S(() => window.__askRes === false && !document.querySelector('.qc-ask')), 'Escape = cancel, sheet removed');
  await S(() => { QC.confirmSheet('x').then(v => { window.__askRes = v; }); }); await page.waitForTimeout(150);
  await page.click('#qc-ask-ok'); await page.waitForTimeout(100);
  ok(await S(() => window.__askRes === true), 'OK resolves true');

  console.log('\n[arm-then-confirm]');
  const arm = await S(async () => {
    const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'ลบ'; document.body.appendChild(b);
    let n = 0; QC.armConfirm(b, () => n++, { armedLabel: 'ยืนยันลบ', timeoutMs: 300 });
    b.click(); const a1 = { armed: b.classList.contains('armed'), t: b.textContent, n };
    await new Promise(r => setTimeout(r, 400)); const a2 = { armed: b.classList.contains('armed'), t: b.textContent };
    b.click(); b.click(); const a3 = { n, armed: b.classList.contains('armed'), t: b.textContent }; b.remove();
    return { a1, a2, a3 };
  });
  ok(arm.a1.armed && arm.a1.t === 'ยืนยันลบ' && arm.a1.n === 0, 'first press arms (red, label changes), nothing runs');
  ok(!arm.a2.armed && arm.a2.t === 'ลบ', 'disarms after the timeout');
  ok(arm.a3.n === 1 && !arm.a3.armed && arm.a3.t === 'ลบ', 'press twice runs once and resets');

  console.log('\n[two saved documents with locations]');
  async function mkDoc(no, loc) {
    await S(() => window.__qcActions.newRecord()); await S(() => window.__qcHome.go('form')); await page.waitForTimeout(500);
    await page.fill('#m-docno', no); await page.fill('#m-project', 'อาคาร ทดสอบ');
    const f = page.locator('.loc input, .loc textarea').first(); await f.fill(loc);
    await page.waitForTimeout(1300);
  }
  await mkDoc('HO-1', 'เสา C-3 ชั้น 1'); await mkDoc('HO-2', 'คาน B7 ชั้น 4');

  console.log('\n[⋯ menu holds every action on this document]');
  await S(() => window.__qcHome && window.__qcHome.go('form')); await page.waitForTimeout(400);
  await page.click('#qf-more'); await page.waitForTimeout(200);
  const items = await S(() => [...document.querySelectorAll('.qf-menu [role=menuitem]')].map(b => b.id || b.textContent.trim()));
  ok(['qf-dup', 'qf-follow'].every(k => items.indexOf(k) >= 0), 'menu has ทำสำเนา and ตรวจรอบใหม่ ' + JSON.stringify(items));
  ok(items.indexOf('qf-plan') >= 0 && items.some(t => /ถังขยะ/.test(t)), 'menu still has plan + trash');
  await page.keyboard.press('Escape'); await page.click('body', { position: { x: 5, y: 5 } }).catch(() => {}); await page.waitForTimeout(200);

  console.log('\n[library: search by location, multi-select, bulk trash]');
  await S(() => window.__qcActions.openList()); await page.waitForTimeout(400);
  await page.click('[data-k="all"], .fd-open >> text=ทั้งหมด').catch(() => {});
  await page.fill('#q', 'B7'); await page.waitForTimeout(300);
  const found = await S(() => [...document.querySelectorAll('#reclist .rec.m3 .rec-t')].map(x => x.textContent));
  ok(found.length === 1 && /HO-2/.test(found[0]), 'search "B7" finds the document by an item location ' + JSON.stringify(found));
  await page.fill('#q', 'อาคาร ทดสอบ'); await page.waitForTimeout(300);
  await page.click('#sel-mode'); await page.waitForTimeout(200);
  ok(await page.isVisible('#sel-bar') && await S(() => document.querySelectorAll('#reclist .rec-cb').length >= 2), 'select mode: checkboxes + action bar');
  const before = await S(() => window.__qcActions.listOpen() && document.querySelector('#curtitle') && document.querySelector('#curtitle').textContent);
  await page.click('#reclist .rec.m3 .rec-open >> nth=0'); await page.waitForTimeout(200);
  ok(await S(() => window.__qcActions.listOpen()), 'tapping a row selects instead of opening');
  ok(/เลือก 1 ฉบับ/.test(await page.textContent('#sel-n')), 'count shows 1');
  await page.click('#sel-all'); await page.waitForTimeout(200);
  ok(/เลือก 2 ฉบับ/.test(await page.textContent('#sel-n')), 'select all → 2');
  await page.click('#sel-del'); await page.waitForTimeout(150);
  ok(await S(() => document.getElementById('sel-del').classList.contains('armed')), 'bulk delete uses the same armed (red) confirm');
  await page.click('#sel-del'); await page.waitForTimeout(2500);
  ok(await S(() => !document.querySelectorAll('#reclist .rec.m3').length || [...document.querySelectorAll('#reclist .rec-t')].every(x => !/HO-/.test(x.textContent))), 'both moved to the trash');
  ok(await S(() => document.getElementById('sel-bar').hidden), 'select mode ends after the action');
  await S(() => window.__qcActions.closeList()); await page.waitForTimeout(200);

  console.log('\n[direct actions instead of timed synthetic clicks]');
  ok(await S(() => typeof window.__qcActions.openTrash === 'function' && typeof window.__qcActions.exportBackup === 'function'), '__qcActions.openTrash / exportBackup');
  await S(() => window.__qcActions.openTrash()); await page.waitForTimeout(300);
  ok(/ถังขยะ/.test(await page.textContent('#scope')) && /HO-/.test(await page.textContent('#reclist')), 'openTrash shows the trash at once (with the 2 documents)');
  await S(() => window.__qcActions.closeList());

  console.log('\n[lightbox swipes through the set]');
  await S(() => window.__qcActions.newRecord()); await S(() => window.__qcHome.go('form')); await page.waitForTimeout(500);
  const r0 = page.locator('.item').nth(0);
  for (let k = 0; k < 3; k++) {
    await r0.getByLabel('+ เพิ่มรูป').setInputFiles('/tmp/qc-photo.jpg'); await page.waitForTimeout(400);
    const use = page.locator('.dlg-back button:has-text("ใช้รูปนี้")'); if (await use.count()) await use.click();
    await page.waitForTimeout(700);
  }
  const nThumbs = await r0.locator('.thumb img').count();
  ok(nThumbs === 3, '3 photos in the row (' + nThumbs + ')');
  await r0.locator('.thumb img').nth(1).click({ force: true }); await page.waitForTimeout(200);
  ok(await page.isVisible('#lb') && /2 \/ 3/.test(await page.textContent('#lb .lb-count')), 'opens at photo 2 of 3');
  const box = await page.locator('#lb').boundingBox();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(200);
  ok(await page.isVisible('#lb') && /3 \/ 3/.test(await page.textContent('#lb .lb-count')), 'swipe left → photo 3, viewer stays open');
  ok(await S(() => document.querySelector('#lb .lb-next').disabled), 'next disabled on the last photo');
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(100);
  ok(/2 \/ 3/.test(await page.textContent('#lb .lb-count')), 'arrow key goes back');
  await page.click('#lb', { position: { x: 20, y: 20 } }); await page.waitForTimeout(150);
  ok(await S(() => document.getElementById('lb').hidden), 'tap on the background closes');

  console.log('\n[markup: two-finger pinch zooms, never draws]');
  await r0.locator('.thumb .tb.ann').first().click({ force: true }); await page.waitForTimeout(500);
  const pz = await S(async () => {
    const cv = document.querySelector('.an-stage canvas'), r = cv.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ev = (t, id, x, y) => cv.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, isPrimary: id === 1, pointerType: 'touch' }));
    ev('pointerdown', 1, cx - 30, cy); ev('pointerdown', 2, cx + 30, cy);
    for (let k = 1; k <= 5; k++) { ev('pointermove', 1, cx - 30 - k * 20, cy); ev('pointermove', 2, cx + 30 + k * 20, cy); }
    ev('pointerup', 2, cx + 130, cy); ev('pointerup', 1, cx - 130, cy);
    const zb = [...document.querySelectorAll('.an-bar button')].find(b => /พอดีจอ/.test(b.textContent));
    const out = { tf: cv.style.transform, zoomShown: zb && !zb.hidden, undoOff: document.querySelector('.an-bar button[aria-label="ย้อนกลับ"]').disabled };
    zb && zb.click(); out.reset = cv.style.transform === '';
    return out;
  });
  ok(/scale\((?!1\))/.test(pz.tf) && pz.zoomShown, 'pinch zooms the photo and shows "พอดีจอ" (' + pz.tf + ')');
  ok(pz.undoOff, 'nothing was drawn by the two fingers');
  ok(pz.reset, '"พอดีจอ" resets the zoom');
  await page.locator('.an-head button:has-text("ยกเลิก")').click(); await page.waitForTimeout(200);

  console.log('\n[settings: test page link only with ?dev=1]');
  await S(() => window.__qcHome && window.__qcHome.go('home')); await page.waitForTimeout(300);
  await page.click('#qh-t-set'); await page.waitForTimeout(400);
  ok(await S(() => !document.querySelector('a[href="./share-test.html"]')), 'no debug link for normal users');

  ok(nativeDialogs === 0, 'no native confirm/alert dialogs were opened (' + nativeDialogs + ')');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
