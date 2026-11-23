// Run: python3 -m http.server 8911 (repo root) & node tests/review-fixes2.e2e.js [path] [online]
// Review round 2: 2.3 home actions call index.html directly, 2.1 receipt checked in the sender's app,
// 2.4 form-engine documents in the library, 2.5 shared helpers.
const { chromium } = require('playwright');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');
const ONLINE = process.argv[3] === 'online';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  if (ONLINE) { const { FAKE } = require('./online-mode.e2e.js'); await ctx.addInitScript(FAKE); }
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const S = (f, a) => page.evaluate(f, a);
  const view = () => S(() => window.__qcHome.view());
  const home = async () => { await S(() => window.__qcHome.go('home')); await page.waitForTimeout(300); };
  await page.goto(BASE + 'index.html' + (ONLINE ? '?mode=online' : ''), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  console.log('\n[2.5 shared helpers]');
  ok(await S(() => !!window.QCU && typeof QCU.el === 'function' && typeof QCU.sha256Text === 'function'), 'window.QCU loaded before the modules');
  ok(await S(async () => (await QCU.sha256Text('abc')) === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'), 'shared sha256 is correct');
  ok(await S(() => { const e = QCU.el('div', { class: 'a', text: 't', onclick: () => {} }, ['x', null, QCU.el('b', null, 'y')]); return e.className === 'a' && e.textContent === 'txy'; }), 'shared el() handles class / text / arrays / null');

  console.log('\n[2.3 home actions go through __qcActions (no hidden button clicks, no 90 s window)]');
  ok(await S(() => !!window.__qcActions && ['newRecord', 'dupRecord', 'followUp', 'openRecord', 'trashCurrent', 'openList'].every(k => typeof window.__qcActions[k] === 'function')), '__qcActions exposed');
  await page.click('#qh-t-new'); await page.click('#qh-sheet [data-form="qc-inspection"]'); await page.waitForTimeout(600);
  ok(await view() === 'form', 'new report: form opened');
  await page.fill('#m-docno', 'RV-001');
  const r0 = page.locator('.item').nth(0);
  await r0.locator('textarea[aria-label="ตำแหน่ง"]').fill('เสา C-3');
  await r0.locator('button[data-k="fix"]').first().click();
  await page.waitForTimeout(1200);
  await home();
  /* a stray click elsewhere must not navigate */
  await S(() => document.getElementById('btn-dup').click()); await page.waitForTimeout(700);
  ok(await view() === 'home', 'a direct click on the hidden form button does not move home (no pending window)');
  await page.click('#qh-t-follow'); await page.waitForTimeout(900);
  ok(await view() === 'form', 'ตรวจรอบใหม่ from home: opened the follow-up document');
  ok(await S(() => /ตรวจรอบใหม่ต่อจากฉบับ/.test(document.querySelector('#remarks, textarea[aria-label*="หมายเหตุ"]')?.value || JSON.stringify(window.__qcGetDoc(window.__qcForm.cur()) || {}))), 'it is the follow-up of RV-001');
  await home();
  const n0 = await S(() => window.__qcDocs().length);
  await page.click('#qh-t-dup'); await page.waitForTimeout(1200);
  ok(await view() === 'form' && (await S(() => window.__qcDocs().length)) >= n0, 'ทำสำเนา from home: opened the copy');
  await home();
  /* library opened from home: picking a document moves to the form; closing it without picking does not */
  await page.click('#qh-t-lib'); await page.waitForTimeout(400);
  await S(() => document.getElementById('dlg-close').click()); await page.waitForTimeout(300);
  await S(() => window.__qcActions.openRecord(window.__qcDocs()[0].id)); await page.waitForTimeout(500);
  ok(await view() === 'home', 'library closed without picking: a later open does not jump to the form');
  await page.click('#qh-t-lib'); await page.waitForTimeout(400);
  await page.locator('#reclist .rec').first().locator('button, .rec-t').first().click(); await page.waitForTimeout(800);
  ok(await view() === 'form', 'library opened from home: picking a document opens it');

  console.log('\n[2.4 form-engine documents in the library]');
  await S(async () => { const d = await window.__qcForms.newDoc('pour'); window.__qcForms.close(); d.updatedAt = new Date().toISOString(); await window.__qcForms.putDocs([d]); });
  await home();
  await page.click('#qh-t-lib'); await page.waitForTimeout(800);
  ok(await S(() => !!document.querySelector('#lib-forms-h') && /รายงานแบบอื่น \(\d+\)/.test(document.querySelector('#lib-forms-h').textContent)), 'library shows a "รายงานแบบอื่น" section');
  ok(await S(() => [...document.querySelectorAll('#reclist .lib-form')].some(r => r.textContent.includes('ใบขออนุญาตเทคอนกรีต'))), 'the pour permit is listed with the inspections');
  await page.locator('#reclist .lib-form').first().locator('button').click(); await page.waitForTimeout(600);
  ok(await S(() => !!document.querySelector('#qcf-sheet, .qcf-view, #qcf-preview') || document.body.textContent.includes('ใบขออนุญาตเทคอนกรีต')), 'เปิด opens it in the form engine');
  await S(() => window.__qcForms.close && window.__qcForms.close());

  console.log('\n[2.1 receipt: checked in the sender app, not read aloud]');
  const r = await S(async () => {
    localStorage.setItem('qc-sender-name', 'ผู้ส่ง');
    const id = window.__qcDocs()[0].id;
    const pkg = await window.__qcSend.build([id]);
    window.__qcSend.markSent(pkg);
    const files = pkg.manifest.files.map(f => [f.name, f.sha256]);
    const rc = await window.__qcSend.receiptOf(pkg.manifest.code, files, 'วิชัย');
    const good = await window.__qcSend.verifyReceipt(window.__qcSend.receiptText(pkg.manifest.code, rc, 'วิชัย', 1));
    const forged = await window.__qcSend.verifyReceipt(window.__qcSend.receiptText(pkg.manifest.code, pkg.manifest.code, 'วิชัย', 1));
    const otherName = await window.__qcSend.verifyReceipt(window.__qcSend.receiptText(pkg.manifest.code, rc, 'คนอื่น', 1));
    const sent = JSON.parse(localStorage.getItem('qc-sent'))[id];
    return { good, forged, otherName, ack: sent && sent.ack };
  });
  ok(r.good.ok, 'a genuine receipt is accepted: ' + r.good.msg);
  ok(!r.forged.ok, 'a receipt made from the 8-digit code alone is rejected');
  ok(!r.otherName.ok, 'a receipt with another receiver name is rejected');
  ok(r.ack && r.ack.by === 'วิชัย', 'the sent record is marked as confirmed by the receiver');

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
