// Run: python3 -m http.server 8911 (repo root) & node tests/plan.e2e.js [path] [online]
// 8.1 plan pins (optional): add a drawing, pin items, the pins survive save / backup / send / online sync,
// the drawing is never collected as an orphan photo, and the A3 crew sheet lists only items still to fix.
const fs = require('fs');
const { chromium } = require('playwright');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');
const ONLINE = process.argv[3] === 'online';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  if (ONLINE) { const { FAKE } = require('./online-mode.e2e.js'); await ctx.addInitScript(FAKE); }
  await ctx.addInitScript(`window.__qcNoPrint=true;`);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const S = (f, a) => page.evaluate(f, a);
  /* a 300x200 "drawing" */
  const plan = '/tmp/qc-app-review/plan.png';
  fs.mkdirSync('/tmp/qc-app-review', { recursive: true });
  await page.goto(BASE + 'index.html' + (ONLINE ? '?mode=online' : ''), { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
  const b64 = await S(() => { const c = document.createElement('canvas'); c.width = 300; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 300, 200); x.strokeRect(20, 20, 260, 160); return c.toDataURL('image/png').split(',')[1]; });
  fs.writeFileSync(plan, Buffer.from(b64, 'base64'));

  await page.click('#qh-t-new'); await page.click('#qh-sheet [data-form="qc-inspection"]'); await page.waitForTimeout(600);
  await page.fill('#m-project', 'Tower A'); await page.fill('#m-docno', 'PL-1');
  const rows = page.locator('.item');
  await rows.nth(0).locator('textarea[aria-label="ตำแหน่ง"]').fill('เสา C-1'); await rows.nth(0).locator('.irow .seg button[data-k="fix"]').click();
  await rows.nth(1).locator('textarea[aria-label="ตำแหน่ง"]').fill('คาน B-2'); await rows.nth(1).locator('.irow .seg button[data-k="bad"]').click();
  await rows.nth(2).locator('textarea[aria-label="ตำแหน่ง"]').fill('พื้น S-3'); await rows.nth(2).locator('.irow .seg button[data-k="ok"]').click();
  await page.waitForTimeout(900);

  console.log('\n[optional and out of the way]');
  ok(/ไม่บังคับ/.test(await rows.nth(0).locator('.plink').textContent()), 'each row offers "+ ระบุบนแบบแปลน (ไม่บังคับ)" inside the location field');
  await page.click('#qf-more');
  ok(await page.isVisible('#qf-plan') && await page.isVisible('#qf-planprint'), 'form menu has "ระบุตำแหน่งบนแบบแปลน" and "พิมพ์แผ่นแผนผังสำหรับช่าง (A3)"');
  await page.keyboard.press('Escape'); await S(() => document.getElementById('qf-more').click());

  console.log('\n[add a drawing, pin items]');
  await rows.nth(0).locator('.plink').click(); await page.waitForTimeout(300);
  ok(await page.isVisible('.pl-back'), 'plan screen opens');
  await page.locator('.pl-tab.add input').setInputFiles(plan); await page.waitForTimeout(1500);
  ok(await S(() => window.__qcPlan.has()), 'drawing added to the document');
  const box = await page.locator('.pl-stage img').boundingBox();
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.4); await page.waitForTimeout(300);
  const nPin = await page.locator('.pl-pin.mine').count();
  ok(nPin === 1, 'tap on the drawing places pin 1 (' + nPin + ')');
  await page.locator('.pl-foot button:has-text("รายการถัดไป")').click(); await page.waitForTimeout(200);
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.6); await page.waitForTimeout(300);
  ok(await page.locator('.pl-pin').count() === 2 && (await page.locator('.pl-pin.mine').textContent()) === '2', 'next item: pin 2, pin 1 shown grey');
  await page.locator('.pl-foot button:has-text("รายการถัดไป")').click(); await page.waitForTimeout(200);
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.2); await page.waitForTimeout(300);
  await page.locator('.pl-pin.mine').click(); await page.waitForTimeout(200);
  ok(await page.locator('.pl-pin').count() === 2, 'tapping your own pin removes it');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.2); await page.waitForTimeout(200);
  await page.locator('.pl-head button:has-text("เสร็จ")').click(); await page.waitForTimeout(1200);
  const lt = await rows.nth(0).locator('.plink').textContent();
  ok(/บนแบบ: plan · หมุด 1/.test(lt), 'row shows "บนแบบ: plan · หมุด 1" (' + lt + ')');
  const saved = await S(() => { const d = window.__qcGetDoc(window.__qcForm.cur()); return d && d.plan; });
  ok(saved && saved.sheets.length === 1 && Object.keys(saved.pins).length === 3, 'saved with the document: 1 sheet, 3 pinned items');
  ok(await S(() => { const d = window.__qcGetDoc(window.__qcForm.cur()); return d.plan.pins[d.items[0].id][0].x > 0.2 && d.plan.pins[d.items[0].id][0].x < 0.3; }), 'pin position stored as a fraction of the sheet');

  console.log('\n[the drawing goes everywhere the document goes]');
  const send = await S(async () => { const d = window.__qcGetDoc(window.__qcForm.cur()); const pkg = await window.__qcSend.build([window.__qcForm.cur()]); const an = await window.__qcSend.analyze(pkg.blob);
    const c = JSON.parse(JSON.stringify(d)); delete c.plan; return { ok: an.ok, files: pkg.manifest.files.length, photo: pkg.photos, differs: await window.__qcSend.hashDoc(d) !== await window.__qcSend.hashDoc(c) }; });
  ok(send.ok && send.photo >= 1, 'send package includes the drawing and passes the check');
  ok(send.differs, 'pins are part of the document hash');
  if (!ONLINE) {
    const bk = await S(async () => { const r = await QC.buildBackup({ records: [{ id: window.__qcForm.cur(), data: window.__qcGetDoc(window.__qcForm.cur()) }], folders: [], trashRecs: [], trashFolders: [], getPhoto: id => window.__qcBlob(id) });
      const z = await QC.readZip(r.blob), data = JSON.parse(await (await z.read('data.json')).text()); const insp = data.inspections[0];
      return { plan: insp.plan && insp.plan.sheets.length, inPhotos: data.photos.some(p => p.id === insp.plan.sheets[0].a), back: QC.implode(insp, data.items.filter(i => i.inspectionId === insp.id)).plan }; });
    ok(bk.plan === 1 && bk.inPhotos, 'backup: plan in data.json, drawing in photos/');
    ok(bk.back && Object.keys(bk.back.pins).length === 3, 'restore (implode) keeps the pins');
  } else {
    await page.waitForTimeout(2500);
    const srv = await S(() => { const h = Object.values(window.__fake.S.insp).find(x => x.docno === 'PL-1'); return h && h.extra && h.extra.plan; });
    ok(srv && srv.sheets.length === 1 && /\//.test(srv.sheets[0].a), 'online: plan in the header (drawing as a storage path)');
    ok(srv && Object.keys(srv.pins).length === 3, 'online: pins synced');
    ok(await S(() => { const h = Object.values(window.__fake.S.insp).find(x => x.docno === 'PL-1'); return !!window.__fake.S.blobs[h.extra.plan.sheets[0].a]; }), 'online: drawing uploaded');
  }

  console.log('\n[A3 sheet for the crew]');
  await S(() => window.__qcPlan.print(false)); await page.waitForTimeout(800);
  const h = await S(() => window.__qcPlanHTML || '');
  ok(/size:A3 landscape/.test(h), 'A3 landscape page');
  ok((h.match(/class="pin"/g) || []).length === 2, 'only the 2 items still to fix are pinned (the passed one is left out)');
  ok(/เสา C-1/.test(h) && /คาน B-2/.test(h) && !/พื้น S-3/.test(h), 'table lists the items to fix only');
  ok(/แผ่นแผนผังสำหรับช่าง/.test(h) && /PL-1/.test(h) && /☐/.test(h), 'title block with the report number and tick boxes');
  await S(() => window.__qcPlan.print(true)); await page.waitForTimeout(500);
  ok(((await S(() => window.__qcPlanHTML)).match(/class="pin/g) || []).length === 3, '"ทุกจุด" option shows all 3 (passed one grey)');

  console.log('\n[follow-up keeps the pins of open items]');
  await S(() => window.__qcActions.followUp()); await page.waitForTimeout(1200);
  const fu = await S(() => { const d = window.__qcGetDoc(window.__qcForm.cur()); return d && d.plan && { s: d.plan.sheets.length, p: Object.keys(d.plan.pins).length, n: d.items.length }; });
  ok(fu && fu.s === 1 && fu.p === 2 && fu.n === 2, 'follow-up document: same drawing, pins for its 2 items');

  console.log('\n[the drawing is never cleaned up as an unused photo]');
  ok(await S(async () => { const d = window.__qcGetDoc(window.__qcForm.cur()); const b = await window.__qcBlob(d.plan.sheets[0].a); return !!b; }), 'drawing still stored');

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
