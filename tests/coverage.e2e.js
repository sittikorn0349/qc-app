// Run: python3 -m http.server 8911 (repo root) & node tests/coverage.e2e.js [path] [online]
// The review's main point: users must see what is backed up / synced and what is not.
// Offline: zones in the backup, form documents counted, "ข้อมูลของคุณเก็บไว้ที่ไหน".
// Online: form documents + team templates sync (migration 005); without the migration the app says so.
const { chromium } = require('playwright');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');
const ONLINE = process.argv[3] === 'online';

(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  async function mk(init) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } }); await ctx.addInitScript(() => { try { localStorage.setItem('qa-shell', 'off'); } catch (e) {} });   // these suites drive the classic home
    if (ONLINE) { const { FAKE } = require('./online-mode.e2e.js'); await ctx.addInitScript(FAKE); }
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(BASE + 'index.html' + (ONLINE ? '?mode=online' : ''), { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
    return { ctx, page, errs, S: (f, a) => page.evaluate(f, a) };
  }
  async function until(page, fn, arg, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(200); } return false; }
  const mkDaily = (S, title) => S(async (t) => { const d = await window.__qcForms.newDoc('daily'); window.__qcForms.close(); d.updatedAt = new Date().toISOString(); d.values = d.values || {}; d.values.__t = t; await window.__qcForms.putDocs([d]); return d.id; }, title);

  if (!ONLINE) {
    console.log('\n[offline: zones travel in the backup]');
    const A = await mk();
    await A.S(() => localStorage.setItem('qc-zones:อาคาร A', JSON.stringify(['ชั้น 1', 'ชั้น 2'])));
    const bk = await A.S(async () => {
      const r = await QC.buildBackup({ records: [], folders: [], trashRecs: [], trashFolders: [], zones: QC.zonesAll(), getPhoto: () => null });
      const z = await QC.readZip(r.blob), data = JSON.parse(await (await z.read('data.json')).text());
      localStorage.removeItem('qc-zones:อาคาร A'); localStorage.setItem('qc-zones:อาคาร B', JSON.stringify(['x']));
      const n = QC.restoreZones(data);
      return { inFile: data.zones, n, back: JSON.parse(localStorage.getItem('qc-zones:อาคาร A') || '[]'), kept: localStorage.getItem('qc-zones:อาคาร B') };
    });
    ok(bk.inFile && bk.inFile['อาคาร A'] && bk.inFile['อาคาร A'].length === 2, 'backup data.json has the zone list');
    ok(bk.back.length === 2 && bk.n === 1, 'restore brings the zones back');
    ok(bk.kept === '["x"]', 'other projects\' zones untouched');

    console.log('\n[offline: coverage panel + reminder counts form documents]');
    await mkDaily(A.S, 'd1');
    await A.page.click('#qh-t-bk'); await A.page.waitForTimeout(800);
    const cov = await A.page.textContent('#qh-cov');
    ok(/ข้อมูลของคุณเก็บไว้ที่ไหน/.test(cov), 'backup sheet shows "ข้อมูลของคุณเก็บไว้ที่ไหน"');
    ok(/รายงานแบบอื่น[^]*\(1\)[^]*ไฟล์สำรอง/.test(cov), 'form documents listed as in the backup (1)');
    ok(/รายชื่อโซน/.test(cov) && /ยังไม่เคยสำรอง|สำรองเป็นไฟล์ล่าสุด/.test(cov), 'zones row and last-backup line');
    await A.page.keyboard.press('Escape'); await A.page.waitForTimeout(200);
    await A.S(() => window.__qcHome.go('form')); await A.page.waitForTimeout(1500);
    ok(await A.S(() => !document.getElementById('qc-bar').hidden && /1/.test(document.getElementById('qc-bar').textContent)), 'backup reminder appears for a form document alone');
    ok(!A.errs.length, 'no page errors' + (A.errs.length ? ': ' + A.errs.join(' | ') : ''));
    await A.ctx.close();
  } else {
    console.log('\n[online, server WITHOUT migration 005: the app says so]');
    const B = await mk(`sessionStorage.setItem('fk-no005','1')`);
    await mkDaily(B.S, 'b1');
    await B.S(() => window.__qcOnline.formSync()); await B.page.waitForTimeout(400);
    const st = await B.S(() => window.__qcSync().forms);
    ok(st.ready === false && /migration 005/.test(st.why), 'sync state: forms not ready, reason given');
    ok(st.pending >= 1, 'pending counts the local form document');
    ok(await B.S(() => window.__qcSync().state !== 'error'), 'inspection sync is not marked as failed because of it');
    await B.page.click('#qh-t-bk'); await B.page.waitForTimeout(800);
    ok(/ในเครื่องนี้เท่านั้น ยังไม่ซิงก์/.test(await B.page.textContent('#qh-cov')), 'coverage panel: "ในเครื่องนี้เท่านั้น ยังไม่ซิงก์"');
    ok(await B.S(() => !!document.querySelector('#qh-cov .qh-covr.warn')), 'that row is highlighted');
    ok(!B.errs.length, 'no page errors' + (B.errs.length ? ': ' + B.errs.join(' | ') : ''));
    await B.ctx.close();

    console.log('\n[online, server WITH migration 005]');
    const C = await mk();
    const id = await mkDaily(C.S, 'c1');
    await C.S(() => window.__qcOnline.formSync()); await C.page.waitForTimeout(300);
    ok(await C.S((i) => !!(window.__fake.S.fdocs || {})[i], id), 'form document pushed to the server');
    ok(await C.S(() => window.__qcSync().forms.ready === true && window.__qcSync().forms.pending === 0), 'state: ready, nothing pending');
    ok(await C.S(async (i) => (await window.__qcForms.getDocs([i]))[0]._project === 'p1', id), 'the document is tagged with the project');
    /* another member's document arrives */
    await C.S(() => { window.__fake.S.fdocs.x9 = { id: 'x9', project_id: 'p1', owner_id: window.__fake.OTHER, form_id: 'pour', title: 'ใบขอเทของ PM', data: { id: 'x9', form: { id: 'pour', name: 'ใบขออนุญาตเทคอนกรีต', widgets: [] }, values: {}, updatedAt: '2026-11-23T05:00:00.000Z' }, updated_at: '2026-11-23T05:00:00Z', deleted_at: null }; });
    await C.S(() => window.__qcOnline.formSync()); await C.page.waitForTimeout(300);
    ok(await C.S(async () => !!(await window.__qcForms.getDocs(['x9']))[0]), 'a teammate\'s form document is pulled');
    /* edit -> push newer */
    await C.S(async (i) => { const d = (await window.__qcForms.getDocs([i]))[0]; d.values.__t = 'c1-edit'; d.updatedAt = new Date(Date.now() + 1000).toISOString(); await window.__qcForms.putDocs([d]); }, id);
    await C.S(() => window.__qcOnline.formSync());
    ok(await C.S((i) => window.__fake.S.fdocs[i].data.values.__t === 'c1-edit', id), 'an edit is pushed');
    /* delete -> tombstone */
    await C.S((i) => window.dispatchEvent(new CustomEvent('qc-form-deleted', { detail: { id: i } })), id);
    await C.S(async (i) => { await new Promise(r => { const o = indexedDB.open('qc-forms', 1); o.onsuccess = () => { const t = o.result.transaction('docs', 'readwrite'); t.objectStore('docs').delete(i); t.oncomplete = r; }; }); }, id);
    await C.S(() => window.__qcOnline.formSync());
    ok(await C.S((i) => !!window.__fake.S.fdocs[i].deleted_at, id), 'a deletion reaches the server (deleted_at)');
    ok(await C.S(async (i) => !(await window.__qcForms.getDocs([i]))[0], id), 'and the document does not come back on the next pull');
    /* team templates */
    await C.S(async () => { await new Promise(r => { const o = indexedDB.open('qc-forms', 1); o.onsuccess = () => { const t = o.result.transaction('forms', 'readwrite'); t.objectStore('forms').put({ id: 'cT', name: 'ตรวจกันซึมของทีม', custom: true, widgets: [], updatedAt: new Date().toISOString() }); t.oncomplete = r; }; }); await window.__qcForms.reload(); });
    await C.S(() => window.__qcOnline.formSync());
    ok(await C.S(() => !!(window.__fake.S.ftpl || {}).cT), 'my custom form is shared as a team template');
    /* zones */
    await C.page.click('#qh-t-new'); await C.page.click('#qh-sheet [data-form="qc-inspection"]'); await C.page.waitForTimeout(500);
    await C.page.fill('#m-project', 'Tower A');
    await C.page.locator('.item .zadd').click(); await C.page.fill('#phsheet-b textarea', 'ชั้น 1\nชั้น 2'); await C.page.locator('#phsheet-b .btn.primary').click();
    ok(await until(C.page, () => JSON.stringify(window.__fake.S.zones) === '["ชั้น 1","ชั้น 2"]'), 'zones saved for the whole project on the server');
    ok(/ทุกคนในโครงการ/.test(await C.page.textContent('#status')), 'status says it is for everyone in the project');
    ok(!C.errs.length, 'no page errors' + (C.errs.length ? ': ' + C.errs.join(' | ') : ''));
    await C.ctx.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
