// Run: python3 -m http.server 8911 (repo root) & node tests/features.e2e.js [path] [online]
// Section 8: 8.6 finger signatures, 8.4 corrective-action dashboard, 8.3 template library + share, 8.5 due reminders (online).
const { chromium } = require('playwright');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');
const ONLINE = process.argv[3] === 'online';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true }); await ctx.addInitScript(() => { try { localStorage.setItem('qa-shell', 'off'); } catch (e) {} });   // these suites drive the classic home
  if (ONLINE) { const { FAKE } = require('./online-mode.e2e.js'); await ctx.addInitScript(FAKE); }
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const S = (f, a) => page.evaluate(f, a);
  await page.goto(BASE + 'index.html' + (ONLINE ? '?mode=online' : ''), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  console.log('\n[8.3 template library]');
  await page.click('#qh-t-new');
  for (const n of ['ตรวจงานกันซึม', 'ตรวจนั่งร้านประจำวัน', 'ทดสอบแรงดันท่อ', 'ตรวจงานไฟฟ้าก่อนปิดฝ้า', 'ตรวจรับห้องก่อนส่งมอบ'])
    ok((await page.textContent('#qh-sheet')).includes(n), 'picker offers ' + n);
  await page.click('#qh-sheet [data-form="scaffold"]'); await page.waitForTimeout(500);
  ok(/ฐานรองแข็งแรง/.test(await page.textContent('body')), 'scaffold form opens with its checklist');
  await S(() => window.__qcForms.close());
  const tf = await S(async () => {
    const f = { id: 'c-test', name: 'ตรวจกันซึมของทีม', custom: true, widgets: [{ id: 'w1', type: 'text', label: 'หมายเหตุ' }], updatedAt: new Date().toISOString() };
    await new Promise(r => { const o = indexedDB.open('qc-forms', 1); o.onsuccess = () => { const t = o.result.transaction('forms', 'readwrite'); t.objectStore('forms').put(f); t.oncomplete = r; }; });
    await window.__qcForms.reload(); return window.__qcForms.customs().length;
  });
  ok(tf >= 1, 'a custom form exists');
  await S(() => window.__qcForms.library()); await page.waitForTimeout(500);
  ok(await S(() => !!document.getElementById('qf-tpl-list') && document.getElementById('qf-tpl-list').textContent.includes('ตรวจกันซึมของทีม')), 'library has "คลังแบบฟอร์มของทีม" with the custom form');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#qf-tpl-list button:has-text("ส่งออกเป็นไฟล์")').first().click()]);
  const path = await dl.path(), json = JSON.parse(require('fs').readFileSync(path, 'utf8'));
  ok(json.format === 'qc-form' && json.form.name === 'ตรวจกันซึมของทีม', 'exported as a .json template file');
  await page.locator('input[aria-label="นำเข้าแบบฟอร์มจากไฟล์"]').setInputFiles(path); await page.waitForTimeout(600);
  ok(await S(() => window.__qcForms.customs().filter(f => f.name === 'ตรวจกันซึมของทีม').length === 2), 'importing the file adds it as a new form');
  await S(() => window.__qcForms.close());

  console.log('\n[8.6 finger signature]');
  await page.click('#qh-t-new'); await page.click('#qh-sheet [data-form="qc-inspection"]'); await page.waitForTimeout(600);
  await page.fill('#m-docno', 'SG-1'); await page.fill('#m-contractor', 'บ.ทดสอบ');
  await page.locator('.item').nth(0).locator('textarea[aria-label="ตำแหน่ง"]').fill('เสา C-1');
  await page.locator('.item').nth(0).locator('.irow .seg button[data-k="fix"]').click();
  await page.waitForTimeout(400);
  ok(await page.locator('.sign .sp-btn').count() === 3, 'three "เซ็นชื่อด้วยนิ้ว" buttons');
  await page.locator('.sign .sp-btn').first().click(); await page.waitForTimeout(200);
  const cv = await page.locator('.sp-card canvas').boundingBox();
  await page.mouse.move(cv.x + 30, cv.y + 120); await page.mouse.down();
  for (let k = 0; k < 12; k++) await page.mouse.move(cv.x + 30 + k * 30, cv.y + 120 + (k % 2 ? -40 : 40));
  await page.mouse.up();
  await page.locator('.sp-card button:has-text("บันทึกลายเซ็น")').click(); await page.waitForTimeout(1200);
  ok(await S(() => !!document.querySelector('.sign .line img')), 'the signature shows in the form');
  ok(await S(() => { const d = window.__qcGetDoc(window.__qcForm.cur()); return d && d.sign && /^data:image\/png/.test(d.sign.inspector.img || ''); }), 'stored with the document (sign.inspector.img)');
  ok(await S(() => !!document.querySelector('#m-date') && !!window.__qcGetDoc(window.__qcForm.cur()).sign.inspector.date), 'signing fills the date');
  const h = await S(async () => { const d = window.__qcGetDoc(window.__qcForm.cur()); const a = await window.__qcSend.hashDoc(d); const c = JSON.parse(JSON.stringify(d)); delete c.sign.inspector.img; return a !== await window.__qcSend.hashDoc(c); });
  ok(h, 'the drawn signature is part of the document hash (send / receive sees it)');

  console.log('\n[8.4 dashboard]');
  await S(() => window.__qcHome.go('home')); await page.waitForTimeout(400);
  await page.click('#qh-t-dash'); await page.waitForTimeout(300);
  const dash = await page.textContent('#qh-sheet');
  ok(/สรุปงานค้างแก้/.test(dash) && /ค้างแก้/.test(dash), 'dashboard sheet opens');
  ok(/บ\.ทดสอบ/.test(dash), 'groups pending fixes by contractor');
  ok(await S(() => +document.querySelectorAll('.qd-kpi b')[1].textContent >= 1), 'KPI counts the pending item');
  await S(() => document.querySelector('#qh-sheet button.btn:last-child, #qh-sheet .qh-x')?.click());

  if (ONLINE) {
    console.log('\n[8.5 due reminders]');
    const due = await S(async () => {
      const id = window.__qcForm.cur(), d = window.__qcGetDoc(id);
      const y = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
      d.items[0].asg = window.__qcOnline.uid(); d.items[0].due = y; d.items[0].st = 'assigned';
      await window.claude.use('db').then(db => db.collection('data/users/' + window.__qcOnline.uid()).doc(id).set(d));
      await new Promise(r => setTimeout(r, 300));
      /* headless Chromium always denies notifications: stand in for the permission and record what would be shown */
      Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
      ServiceWorkerRegistration.prototype.showNotification = function (t, o) { window.__shown = [t, o]; return Promise.resolve(); };
      return { body: '', soon: window.__qcOnline.dueSoon().length, shown: await window.__qcOnline.dueCheck(true), again: await window.__qcOnline.dueCheck(false), shownTxt: window.__shown && window.__shown[1].body };
    });
    ok(due.soon >= 1, 'my late fix is in the reminder list');
    ok(due.shown === true && /เลยกำหนด 1/.test(due.shownTxt || ''), 'a device notification is shown: ' + due.shownTxt);
    ok(due.again === false, 'only once per day');
  }

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
