// Run: python3 -m http.server 8911 (repo root) & node tests/review-fixes.e2e.js [path] [online]
// Review fixes: 1.2 navigation by explicit event, 1.1 form-engine documents in backup / restore / send, 2.2 mode rename.
const { chromium } = require('playwright');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');
const ONLINE = process.argv[3] === 'online';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true }); await ctx.addInitScript(() => { try { localStorage.setItem('qa-shell', 'off'); } catch (e) {} });   // these suites drive the classic home
  if (ONLINE) { const { FAKE } = require('./online-mode.e2e.js'); await ctx.addInitScript(FAKE); }
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const S = (expr, arg) => page.evaluate(expr, arg);
  await page.goto(BASE + 'index.html' + (ONLINE ? '?mode=online' : ''), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  console.log('\n[1.2 navigation follows the qc-action event, not the status wording]');
  ok(await S(() => window.__qcHome.view()) === 'home', 'starts on home');
  await S(() => { const s = document.getElementById('status'); s.textContent = 'เปิดฉบับ “ทดสอบ” แล้ว'; });
  await page.waitForTimeout(300);
  ok(await S(() => window.__qcHome.view()) === 'home', 'status text alone ("เปิดฉบับ…") no longer navigates');
  const evs = [];
  await page.exposeFunction('__rec', t => evs.push(t));
  await S(() => document.addEventListener('qc-action', e => window.__rec(e.detail.type)));
  await page.click('#qh-t-new'); await page.click('#qh-sheet [data-form="qc-inspection"]'); await page.waitForTimeout(800);
  ok(evs.includes('new'), 'starting a new report fires qc-action {type:"new"}');
  ok(await S(() => window.__qcHome.view()) === 'form', 'home moved to the form on that event');

  console.log('\n[2.2 mode value renamed]');
  ok(await S(() => /\bstored\b/.test(document.getElementById('badge').className)), 'badge class is "stored" (no "cloud" for local storage)');
  ok(await S(() => !/\bcloud\b/.test(document.getElementById('badge').className)), 'no "cloud" class on the local-storage badge');

  console.log('\n[1.1 form-engine documents are in backup and restore]');
  const fid = await S(async (png) => {
    const d = await window.__qcForms.newDoc('daily'); window.__qcForms.close && window.__qcForms.close();
    const ph = d.form.widgets.find(w => w.type === 'photos');
    d.values[ph.id] = [{ d: png, c: 'รูปทดสอบ' }];
    d.updatedAt = '2026-11-23T01:00:00.000Z';
    await window.__qcForms.putDocs([d]); return d.id;
  }, PNG);
  ok(!!fid, 'a daily report with a photo is stored in qc-forms');
  const bk = await S(async () => {
    const forms = await window.__qcForms.exportAll();
    const r = await QC.buildBackup({ records: [], folders: [], trashRecs: [], trashFolders: [], forms, getPhoto: () => null });
    const z = await QC.readZip(r.blob), data = JSON.parse(await (await z.read('data.json')).text());
    return { counts: r.counts, names: z.names, n: data.formDocs.length, fp: data.formPhotos.length, inline: JSON.stringify(data).includes('data:image') };
  });
  ok(bk.n >= 1 && bk.counts.formDocs >= 1, 'backup data.json has formDocs (' + bk.n + ')');
  ok(bk.fp >= 1 && bk.names.some(n => n.startsWith('form-photos/')), 'form photos are files in form-photos/');
  ok(!bk.inline, 'no inline data URLs left in data.json');
  const rest = await S(async (id) => {
    const before = (await window.__qcForms.getDocs([id]))[0];
    const forms = await window.__qcForms.exportAll();
    const r = await QC.buildBackup({ records: [], folders: [], trashRecs: [], trashFolders: [], forms, getPhoto: () => null });
    /* wipe the doc, restore from the zip */
    await new Promise((res, rej) => { const o = indexedDB.open('qc-forms', 1); o.onsuccess = () => { const t = o.result.transaction('docs', 'readwrite'); t.objectStore('docs').delete(id); t.oncomplete = res; t.onerror = rej; }; });
    const gone = !(await window.__qcForms.getDocs([id]))[0];
    const z = await QC.readZip(r.blob), data = JSON.parse(await (await z.read('data.json')).text());
    const n = await QC.restoreForms(z, data);
    const after = (await window.__qcForms.getDocs([id]))[0];
    const again = await QC.restoreForms(z, data);
    return { gone, n, same: JSON.stringify(after) === JSON.stringify(before), again };
  }, fid);
  ok(rest.gone, 'doc removed before restore');
  ok(rest.n && rest.n.docs >= 1, 'restoreForms brought it back');
  ok(rest.same, 'restored doc is identical, photo data URL included');
  ok(rest.again && rest.again.docs === 0 && rest.again.skipped >= 1, 'restoring again skips (local copy same age or newer)');

  console.log('\n[1.1 form-engine documents travel in "ส่งเอกสาร"]');
  const sd = await S(async (id) => {
    localStorage.setItem('qc-sender-name', 'ทดสอบ');
    const pkg = await window.__qcSend.build(['f:' + id]);
    const an = await window.__qcSend.analyze(pkg.blob);
    return { ok: an.ok, errs: an.errors, forms: (pkg.manifest.forms || []).length, files: pkg.manifest.files.map(f => f.name), code: pkg.manifest.code, size: pkg.blob.size, b64: await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(pkg.blob); }) };
  }, fid);
  ok(sd.ok, 'package with a form document passes the receiver check' + (sd.errs.length ? ' ' + sd.errs.join('; ') : ''));
  ok(sd.forms === 1 && sd.files.includes('forms.json'), 'manifest lists the form document and forms.json');
  const tamper = await S(async (b64) => {
    const blob = await (await fetch(b64)).blob(), z = await QC.readZip(blob), ents = [];
    for (const n of z.names) { let b = await z.read(n); if (n === 'forms.json') { const a = JSON.parse(await b.text()); a[0].values.x = 'แก้'; b = new Blob([JSON.stringify(a)]); } ents.push({ name: n, blob: b }); }
    const an = await window.__qcSend.analyze(await QC.makeZip(ents)); return an.ok;
  }, sd.b64);
  ok(!tamper, 'an edited forms.json is rejected');
  /* receive into this device after deleting the local copy */
  await S(async (id) => { await new Promise((res) => { const o = indexedDB.open('qc-forms', 1); o.onsuccess = () => { const t = o.result.transaction('docs', 'readwrite'); t.objectStore('docs').delete(id); t.oncomplete = res; }; }); }, fid);
  await S(async (b64) => { const blob = await (await fetch(b64)).blob(); window.__qcImport(new File([blob], 'ส่งงาน.zip', { type: 'application/zip' }), () => {}); }, sd.b64);
  await page.waitForSelector('#qc-modal button.btn.primary', { timeout: 8000 });
  const modalTxt = await page.textContent('#qc-modal');
  ok(modalTxt.includes('รายงานประจำวัน'), 'receive dialog lists the daily report');
  await page.click('#qc-modal button.btn.primary'); await page.waitForTimeout(800);
  ok(/นำเข้าสำเร็จ/.test(await page.textContent('#qc-modal')), 'import confirmed and read back');
  ok(/รหัสตอบรับ [0-9A-F]{4}-[0-9A-F]{4}/.test(await page.textContent('#rc-text')), 'receiver gets a receipt to send back (2.1)');
  ok(await S(async (id) => !!(await window.__qcForms.getDocs([id]))[0], fid), 'form document is back on the device');

  ok(!errs.length, 'no console / page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
