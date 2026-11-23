// Run: python3 -m http.server 8911 (repo root) & node tests/softdelete.e2e.js [path] [online]
// Soft delete for check items and photos: undo toast, per-document bin ("รายการที่ถูกลบ"), 30-day purge,
// bin kept in backups / left out of sent packages; online: deleted here + edited elsewhere = conflict for the user.
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');
const ONLINE = process.argv[3] === 'online';
const PNG = '/tmp/qc-sd.png';
if (!fs.existsSync(PNG)) fs.writeFileSync(PNG, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));

(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } }); await ctx.addInitScript(() => { try { localStorage.setItem('qa-shell', 'off'); } catch (e) {} });   // these suites drive the classic home
  if (ONLINE) { const { FAKE } = require('./online-mode.e2e.js'); await ctx.addInitScript(FAKE); }
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => { errs.push('native dialog: ' + d.message()); d.dismiss(); });
  const url = BASE + 'index.html' + (ONLINE ? '?mode=online' : '');
  await page.goto(url, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  const S = (f, a) => page.evaluate(f, a);
  async function until(fn, arg, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(200); } return false; }
  const items = () => S(() => [...document.querySelectorAll('#items .item')].map(n => n.querySelector('textarea[aria-label="ตำแหน่ง"]').value));

  console.log('\n[setup: a document with 3 items, a photo on item 1]');
  await S(() => window.__qcActions.newRecord()); await S(() => window.__qcHome.go('form')); await page.waitForTimeout(500);
  await page.fill('#m-project', 'Tower A'); await page.fill('#m-docno', 'SD-1');
  for (let i = 0; i < 3; i++) {
    const r = page.locator('.item').nth(i);
    await r.locator('textarea[aria-label="ตำแหน่ง"]').fill(['เสา C-3', 'คาน B-2', 'พื้น S-1'][i]);
    await r.locator('textarea[aria-label="รายการตรวจ"]').fill(['ระยะหุ้ม', 'ระยะทาบ', 'แบบหล่อ'][i]);
    await r.locator('button[data-k="fix"]').first().click();
  }
  await page.locator('.item').nth(0).getByLabel('+ เพิ่มรูป').setInputFiles(PNG); await page.waitForTimeout(400);
  await page.locator('.dlg-back button:has-text("ใช้รูปนี้")').click(); await page.waitForTimeout(1500);
  const docId = await S(() => window.__qcForm.cur());
  const photoId = await S(() => { const d = window.__qcGetDoc(window.__qcForm.cur()); return d && d.items[0].before[0]; });
  ok(!!photoId && !/^data:/.test(photoId), 'photo stored (' + String(photoId).slice(0, 12) + '…)');

  console.log('\n[delete an item: arm → confirm → toast → undo]');
  const del2 = page.locator('.item').nth(1).locator('button.del');
  await del2.click(); ok(await S(() => document.querySelectorAll('#items .item').length === 3), 'first press only arms (nothing deleted)');
  ok(await del2.evaluate(b => b.classList.contains('armed')), 'delete button is armed (red)');
  await del2.click(); await page.waitForTimeout(200);
  ok(JSON.stringify(await items()) === JSON.stringify(['เสา C-3', 'พื้น S-1']), 'item 2 gone from the form');
  ok(await page.isVisible('.qc-toast') && /ลบรายการที่ 2 แล้ว/.test(await page.textContent('.qc-toast')), 'toast "ลบรายการที่ 2 แล้ว" with ย้อนกลับ');
  ok(await S(() => window.__qcBin.count() === 1), 'kept in the document bin');
  await page.click('.qc-toast-undo'); await page.waitForTimeout(300);
  ok(JSON.stringify(await items()) === JSON.stringify(['เสา C-3', 'คาน B-2', 'พื้น S-1']), 'undo: item back in its place');
  ok(await S(() => { const t = document.querySelectorAll('#items .item')[1]; return t.querySelector('textarea[aria-label="รายการตรวจ"]').value === 'ระยะทาบ' && t.querySelector('button[data-k="fix"]').getAttribute('aria-pressed') === 'true'; }), 'with everything that was filled in');
  ok(await S(() => window.__qcBin.count() === 0 && !document.querySelector('.qc-toast')), 'bin empty again, toast closed');

  console.log('\n[delete, let the toast expire: still in the store]');
  await del2.click(); await del2.click(); await page.waitForTimeout(6800);
  ok(!(await page.isVisible('.qc-toast')), 'toast gone after ~6 s');
  await page.waitForTimeout(1200);
  const st = await S((id) => { const d = window.__qcGetDoc(id); return { n: d.items.length, bin: (d.bin || []).map(e => e.t + ':' + (e.item ? e.item.loc : '')) }; }, docId);
  ok(st.n === 2 && st.bin.length === 1 && st.bin[0] === 'item:คาน B-2', 'saved document: 2 items + bin holds item 2 ' + JSON.stringify(st));

  console.log('\n[delete a photo: toast undo; delete again: blob kept]');
  const r0 = page.locator('.item').nth(0);
  await r0.locator('.thumb .tb.x').first().click({ force: true }); await page.waitForTimeout(200);
  ok(await r0.locator('.thumb img').count() === 0 && /ลบรูปแล้ว/.test(await page.textContent('.qc-toast')), 'photo removed, toast "ลบรูปแล้ว"');
  await page.click('.qc-toast-undo'); await page.waitForTimeout(300);
  ok(await page.locator('.item').nth(0).locator('.thumb img').count() === 1, 'undo brings the photo back');
  await page.locator('.item').nth(0).locator('.thumb .tb.x').first().click({ force: true }); await page.waitForTimeout(2500);
  ok(await S((id) => window.__qcBlob(id).then(b => !!b, () => false), photoId), 'photo file still in the device store (restorable)');

  console.log('\n[later: reload, restore from "รายการที่ถูกลบ"]');
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  await S((id) => window.__qcActions.openRecord(id), docId); await S(() => window.__qcHome.go('form')); await page.waitForTimeout(600);
  await page.click('#qf-more'); await page.waitForTimeout(200);
  ok(/รายการที่ถูกลบ \(2\)/.test(await page.textContent('#qf-bin')), 'menu shows "รายการที่ถูกลบ (2)"');
  await page.click('#qf-bin'); await page.waitForTimeout(300);
  const rows = await S(() => [...document.querySelectorAll('.bin-row')].map(r => r.querySelector('.bin-tx b').textContent));
  ok(rows.length === 2 && /รูปที่พบ/.test(rows[0]) && /ระยะทาบ/.test(rows[1]), 'newest first: the photo, then item 2 ' + JSON.stringify(rows));
  ok(await S(() => /เหลือ 30 วัน/.test(document.querySelector('.bin-row').textContent)), 'shows days left (30)');
  await page.locator('.bin-row').nth(1).locator('button:has-text("กู้คืน")').click(); await page.waitForTimeout(300);
  await page.locator('.bin-row').nth(0).locator('button:has-text("กู้คืน")').click(); await page.waitForTimeout(300);
  ok(await S(() => document.querySelectorAll('.bin-row').length === 0 && /ไม่มีรายการ/.test(document.querySelector('.bin-b').textContent)), 'both restored, bin empty');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  ok(JSON.stringify(await items()) === JSON.stringify(['เสา C-3', 'คาน B-2', 'พื้น S-1']) && await page.locator('.item').nth(0).locator('.thumb img').count() === 1, 'item 2 and the photo are back');

  if (!ONLINE) {
    console.log('\n[backup keeps the bin; sent package leaves it out]');
    await page.locator('.item').nth(2).locator('button.del').click(); await page.locator('.item').nth(2).locator('button.del').click(); await page.waitForTimeout(1500);
    const bk = await S(async () => {
      const recs = (window.__qcAllDocs ? window.__qcAllDocs() : null);
      const d = window.__qcGetDoc(window.__qcForm.cur());
      const r = await QC.buildBackup({ records: [{ id: window.__qcForm.cur(), data: d }], folders: [], trashRecs: [], trashFolders: [], getPhoto: () => null });
      const z = await QC.readZip(r.blob), data = JSON.parse(await (await z.read('data.json')).text());
      return (data.inspections[0].bin || []).length;
    });
    ok(bk === 1, 'backup data.json carries the bin (1 entry)');
    const pk = await S(async () => { const p = await window.__qcSend.build([window.__qcForm.cur()], 'tester'); const z = await QC.readZip(p.blob); const docs = JSON.parse(await (await z.read('docs.json')).text()); return docs.map(x => !!x.bin); }).catch(e => 'err:' + e.message);
    ok(Array.isArray(pk) && pk.every(x => x === false), 'send package has no bin ' + JSON.stringify(pk));

    console.log('\n[30 days later: purged for good, photo file deleted]');
    await page.locator('.item').nth(0).locator('.thumb .tb.x').first().click({ force: true }); await page.waitForTimeout(1500);
    // age every bin entry by 31 days (as if deleted a month ago), then let the form save it
    await S(() => { const old = new Date(Date.now() - 31 * 864e5).toISOString(); window.__qcBin.state().forEach(e => { e.at = old; }); });
    await page.fill('#m-site', 'ทดสอบอายุถังขยะ'); await page.waitForTimeout(1800);
    const aged = await S((id) => (window.__qcGetDoc(id).bin || []).every(e => Date.now() - new Date(e.at) > 30 * 864e5), docId);
    ok(aged, 'bin entries dated 31 days ago');
    await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
    ok(await until((id) => { const d = window.__qcGetDoc(id); return d && !(d.bin || []).length; }, docId), 'purged at start-up (bin empty)');
    ok(await until((id) => window.__qcBlob(id).then(b => !b, () => true), photoId), 'the deleted photo file is removed from the device');
  } else {
    console.log('\n[online: deleted here, edited on another device → conflict, not a silent delete]');
    ok(await until((no) => { const S = window.__fake.S, h = Object.values(S.insp).find(x => x.docno === no); return h && Object.values(S.items).filter(i => i.inspection_id === h.id).length === 3; }, 'SD-1', 12000), 'document synced with 3 items');
    const sid = await S((no) => { const S = window.__fake.S, h = Object.values(S.insp).find(x => x.docno === no); return Object.values(S.items).find(i => i.inspection_id === h.id && i.loc === 'คาน B-2').id; }, 'SD-1');
    await S((s) => { const it = window.__fake.S.items[s]; it.note = 'แก้จากอีกเครื่อง'; }, sid);   // no realtime event: this device has not seen it
    const d1 = page.locator('.item').nth(1).locator('button.del'); await d1.click(); await d1.click();
    ok(await until(() => !!document.querySelector('.cf-note')), 'item comes back with a conflict note');
    ok(await S((s) => !!window.__fake.S.items[s], sid), 'server row NOT deleted');
    ok(await S(() => /อีกเครื่อง/.test(document.querySelector('.cf-note').textContent) && document.querySelector('.cf-note').closest('.item').querySelector('textarea[aria-label="หมายเหตุ"]').value === 'แก้จากอีกเครื่อง'), 'the other device\'s edit is shown');
    ok(await until((no) => { const h = Object.values(window.__fake.S.insp).find(x => x.docno === no); return h && h.extra && h.extra.cf && Object.keys(h.extra.cf).length === 1; }, 'SD-1'), 'conflict flag synced (teammates see it too)');
    await page.click('.cf-note button:has-text("ลบต่อ")'); await page.waitForTimeout(300);
    ok(await until((s) => !window.__fake.S.items[s], sid, 10000), '"ลบต่อ" → now deleted on the server');
    ok(await until((no) => { const h = Object.values(window.__fake.S.insp).find(x => x.docno === no); return h && h.extra && (h.extra.bin || []).some(e => e.t === 'item' && e.item.loc === 'คาน B-2'); }, 'SD-1'), 'and kept in the synced bin');
    console.log('\n[online: restore after the delete was synced]');
    await page.click('.qc-toast-undo').catch(() => {}); await page.waitForTimeout(300);
    if (!(await S(() => document.querySelectorAll('#items .item').length === 3))) { await page.click('#qf-more'); await page.click('#qf-bin'); await page.locator('.bin-row button:has-text("กู้คืน")').first().click(); await page.keyboard.press('Escape'); }
    ok(await until((no) => { const S = window.__fake.S, h = Object.values(S.insp).find(x => x.docno === no); return Object.values(S.items).some(i => i.inspection_id === h.id && i.loc === 'คาน B-2'); }, 'SD-1', 10000), 'restored item is back on the server (same id, not a tombstone)');
  }

  ok(!errs.length, 'no page errors / native dialogs' + (errs.length ? ': ' + errs.join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
