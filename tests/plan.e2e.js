// Run: python3 -m http.server 8911 (repo root) & node tests/plan.e2e.js [path] [online]
// 8.1 plan pins (optional): add a drawing, pin items, the pins survive save / backup / send / online sync,
// the drawing is never collected as an orphan photo, and the A3 crew sheet lists only items still to fix.
const fs = require('fs');
const { chromium } = require('playwright');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');
const ONLINE = process.argv[3] === 'online';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } }); await ctx.addInitScript(() => { try { localStorage.setItem('qa-shell', 'off'); } catch (e) {} });   // these suites drive the classic home
  if (ONLINE) { const { FAKE } = require('./online-mode.e2e.js'); await ctx.addInitScript(FAKE); }
  await ctx.addInitScript(`window.__qcNoPrint=true;`);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const S = (f, a) => page.evaluate(f, a);
  async function until(fn, arg, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(200); } return false; }
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
  // a 2-page PDF drawing: each page becomes a sheet
  const pdfB64 = await S(() => { const d = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' }); d.rect(20, 20, 250, 160); d.text('PLAN 1', 30, 30); d.addPage(); d.rect(30, 30, 200, 120); d.text('PLAN 2', 40, 40); return btoa(String.fromCharCode.apply(null, new Uint8Array(d.output('arraybuffer')))); });
  const pdfPath = '/tmp/qc-app-review/plan-2p.pdf'; fs.writeFileSync(pdfPath, Buffer.from(pdfB64, 'base64'));
  await page.locator('.pl-tab.add input').setInputFiles(pdfPath);
  ok(await until(() => document.querySelectorAll('.pl-tabs .pl-tab:not(.add):not(.mg)').length === 3, null, 15000), 'PDF drawing: both pages added as sheets (' + await S(() => [...document.querySelectorAll('.pl-tabs .pl-tab:not(.add):not(.mg)')].map(t => t.textContent).join(', ')) + ')');
  ok(await until(() => { const i = document.querySelector('.pl-stage img'); return i && i.naturalWidth > 1000 }), 'PDF page rendered as a sharp image');
  await page.locator('.pl-tabs .pl-tab').first().click(); await page.waitForTimeout(400);
  const bx = async () => page.locator('.pl-stage img').boundingBox();
  const tap = async (fx, fy) => { const box = await bx(); await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy); await page.waitForTimeout(450); };
  const confirm = async () => { await page.locator('.pl-bar .btn.primary').click(); await page.waitForTimeout(250); };
  const nextItem = async () => { await page.locator('.pl-foot button[aria-label="รายการถัดไป"]').click(); await page.waitForTimeout(300); };
  ok(/รายการที่ 1 \/ 3 · ระบุแล้ว 0/.test(await page.locator('.pl-prog').textContent()), 'progress line: รายการที่ 1 / 3 · ระบุแล้ว 0');
  ok(!/\[object /.test(await page.locator('.pl-card').textContent()), 'marking screen has no [object …] text');
  await tap(0.25, 0.4);
  ok(await page.locator('.pl-pin.ghost').count() === 1 && await page.locator('.pl-pin:not(.ghost)').count() === 0 && await page.isVisible('.pl-bar'), 'tap shows a tentative pin and a confirm bar (nothing saved yet)');
  await confirm();
  ok(await page.locator('.pl-pin.mine').count() === 1 && !(await page.isVisible('.pl-bar')), 'confirm places pin 1');
  await nextItem(); await tap(0.7, 0.6); await confirm();
  ok(await page.locator('.pl-pin:not(.ghost)').count() === 2 && (await page.locator('.pl-pin.mine').textContent()) === '2', 'next item: pin 2; pin 1 stays');
  await nextItem(); await tap(0.5, 0.2); await page.locator('.pl-bar .btn:not(.primary)').click(); await page.waitForTimeout(200);
  ok(await page.locator('.pl-pin:not(.ghost)').count() === 2, 'cancel leaves no pin');
  await tap(0.5, 0.2); await confirm();
  await tap(0.55, 0.25); ok(/ย้ายหมุด/.test(await page.locator('.pl-bar .btn.primary').textContent()), 'tapping again offers to MOVE the pin (one pin per item)');
  await confirm();
  ok(await page.locator('.pl-pin:not(.ghost)').count() === 3 && await until(() => { const d = window.__qcGetDoc(window.__qcForm.cur()); const p = d && d.plan && d.plan.pins[d.items[2].id]; return !!p && p.length === 1 && p[0].x > 0.53; }), 'still 3 pins; item 3 moved, not duplicated');
  await page.locator('.pl-pin.mine').click(); await page.waitForTimeout(200);
  ok(await page.isVisible('.pl-menu') && /รายการที่ 3/.test(await page.locator('.pl-menu').textContent()), 'tapping a pin opens its menu (no instant delete)');
  await page.locator('.pl-menu button:has-text("ลบหมุด")').click(); await page.waitForTimeout(200);
  ok(await page.locator('.pl-pin:not(.ghost)').count() === 2, 'ลบหมุด removes it');
  await page.locator('.qc-toast-undo').click(); await page.waitForTimeout(200);
  ok(await page.locator('.pl-pin:not(.ghost)').count() === 3, 'ย้อนกลับ brings it back');
  const w0 = (await page.locator('.pl-pin.mine').boundingBox()).width, sc0 = await S(() => document.querySelector('.pl-stage').style.transform);
  const vb = await page.locator('.pl-view').boundingBox();
  await page.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2); await page.mouse.wheel(0, -400); await page.waitForTimeout(200);
  const w1 = (await page.locator('.pl-pin.mine').boundingBox()).width, sc1 = await S(() => document.querySelector('.pl-stage').style.transform);
  ok(sc0 !== sc1 && Math.abs(w1 - w0) < 3, 'wheel zooms the drawing; pins keep their size (' + Math.round(w0) + '→' + Math.round(w1) + 'px)');
  await page.locator('.pl-foot button:has-text("พอดีจอ")').click();
  ok(/ระบุแล้ว 3 · ยังไม่ระบุ 0/.test(await page.locator('.pl-prog').textContent()), 'progress: all 3 marked');
  await page.locator('.pl-tabs button:has-text("จัดการแผ่นนี้")').click();
  await page.fill('.pl-menu input', 'แปลนชั้น 1'); await page.locator('.pl-menu button:has-text("บันทึกชื่อ")').click(); await page.waitForTimeout(200);
  ok(/แปลนชั้น 1 · 3/.test(await page.locator('.pl-tab[aria-selected="true"]').textContent()), 'sheet renamed; tab shows its pin count');
  await S(() => { const d = window.__qcGetDoc(window.__qcForm.cur()); });
  await page.locator('.pl-head button:has-text("เสร็จ")').click(); await page.waitForTimeout(1200);
  const lt = await rows.nth(0).locator('.plink').textContent();
  ok(/บนแบบ: แปลนชั้น 1 · หมุด 1/.test(lt), 'row shows "บนแบบ: แปลนชั้น 1 · หมุด 1" (' + lt + ')');
  const saved = await S(() => { const d = window.__qcGetDoc(window.__qcForm.cur()); return d && d.plan; });
  ok(saved && saved.sheets.length === 3 && Object.keys(saved.pins).length === 3, 'saved with the document: 3 sheets (image + 2 PDF pages), 3 pinned items');
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
    ok(bk.plan === 3 && bk.inPhotos, 'backup: plan in data.json, drawing in photos/');
    ok(bk.back && Object.keys(bk.back.pins).length === 3, 'restore (implode) keeps the pins');
  } else {
    await page.waitForTimeout(2500);
    const srv = await S(() => { const h = Object.values(window.__fake.S.insp).find(x => x.docno === 'PL-1'); return h && h.extra && h.extra.plan; });
    ok(srv && srv.sheets.length === 3 && /\//.test(srv.sheets[0].a), 'online: plan in the header (drawing as a storage path)');
    ok(srv && Object.keys(srv.pins).length === 3, 'online: pins synced');
    ok(await S(() => { const h = Object.values(window.__fake.S.insp).find(x => x.docno === 'PL-1'); return !!window.__fake.S.blobs[h.extra.plan.sheets[0].a]; }), 'online: drawing uploaded');
  }

  console.log('\n[report PDF carries the marked drawing]');
  const pages = async (k) => S(async (k) => { const b = await window.__qcActions.pdfBlob(k); const t = await b.text(); return (t.match(/\/Type \/Page\b/g) || []).length; }, k);
  const nFull = await pages('full');
  ok(nFull === 2, 'full report PDF: report page + 1 drawing page with pins (' + nFull + ' pages)');
  const html = await S(() => window.__qcLastPlanPages || '');
  const nPend = await pages('pend');
  ok(nPend === 2, 'pending-items PDF also includes the drawing page (' + nPend + ' pages)');
  ok(((await S(() => window.__qcLastPlanPages || '')).match(/pl-pdf-pin/g) || []).length === 2, 'pending PDF pins only the 2 items still to fix');
  ok(/ตำแหน่งบนแบบ · แปลนชั้น 1/.test(html) && (html.match(/pl-pdf-pin/g) || []).length === 3, 'drawing page titled with the sheet name, 3 numbered pins');
  ok(/ดูบนแบบ: แปลนชั้น 1/.test(html), 'item rows say which sheet to look at');
  ok(!/\[object /.test(html) && /ต้องแก้/.test(html), 'legend and table text render as text (no [object …])');

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
  ok(fu && fu.s === 3 && fu.p === 2 && fu.n === 2, 'follow-up document: same drawing, pins for its 2 items (' + JSON.stringify(fu) + ')');

  console.log('\n[the drawing is never cleaned up as an unused photo]');
  ok(await S(async () => { const d = window.__qcGetDoc(window.__qcForm.cur()); const b = await window.__qcBlob(d.plan.sheets[0].a); return !!b; }), 'drawing still stored');

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
