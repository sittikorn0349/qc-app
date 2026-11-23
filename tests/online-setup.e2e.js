// Run: python3 -m http.server 8911 (repo root) & node tests/online-setup.e2e.js [path]
// Section 3 + 5 of the review: setup once per device, cache-first start, "not set up" page, auth vs offline,
// per-photo "not uploaded yet" marks, online wording of the send button.
const fs = require('fs');
const { chromium } = require('playwright');
const { FAKE } = require('./online-mode.e2e.js');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');
/* test knobs read by the fake API: fk-nosess (no session), fk-netfail (session/network calls throw TypeError), fk-projfail */
const KNOBS = `(function(){var A=window.__qcOnlineApi,f=function(k){try{return sessionStorage.getItem(k)==='1'}catch(e){return false}};
  var s0=A.session,p0=A.myProjects;
  A.session=function(){if(f('fk-netfail'))return Promise.reject(new TypeError('Failed to fetch'));if(f('fk-nosess'))return Promise.resolve(null);return s0()};
  A.myProjects=function(){if(f('fk-projfail'))return Promise.reject(new TypeError('Failed to fetch'));return p0()};
  /* expired sign-in: every data call answers 401 like PostgREST does */
  Object.keys(A).forEach(function(k){if(k==='session'||k==='signIn'||k==='signOut'||k==='subscribe'||typeof A[k]!=='function')return;var o=A[k];A[k]=function(){if(f('fk-nosess'))return Promise.reject(Object.assign(new Error('JWT expired'),{status:401,code:'PGRST301',api:k}));return o.apply(this,arguments)}});})();`;

(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const png = '/tmp/qc-app-review/test.png';
  fs.mkdirSync('/tmp/qc-app-review', { recursive: true });
  if (!fs.existsSync(png)) fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));

  async function mk() {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } }); await ctx.addInitScript(() => { try { localStorage.setItem('qa-shell', 'off'); } catch (e) {} });   // these suites drive the classic home
    await ctx.addInitScript(FAKE); await ctx.addInitScript(KNOBS);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').slice(0, 300)));
    return { ctx, page, errs, S: (f, a) => page.evaluate(f, a) };
  }
  async function until(page, fn, arg, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(150); } return false; }

  console.log('\n[5.1 first start online = setup, flag only after everything is cached]');
  let A = await mk();
  await A.page.goto(BASE + 'index.html?mode=online', { waitUntil: 'networkidle' }); await A.page.waitForTimeout(1200);
  const flag = await A.S(() => JSON.parse(localStorage.getItem('qc-setup-done') || 'null'));
  ok(flag && flag.uid === window_ME(), 'qc-setup-done written with the user id and time');
  ok(await A.S(() => !!localStorage.getItem('qc-online-members:p1') && !!localStorage.getItem('qc-online-projects:' + window.__fake.ME)), 'projects and members cached at setup');
  ok(await A.S(() => window.__qcSync().setup === true && window.__qcSync().state === 'ok'), '__qcSync reports setup done, state ok');

  console.log('\n[3.3 send button wording in online mode]');
  ok(/คนนอก/.test(await A.page.textContent('#qh-t-send')), 'home tile says it is for people outside the project');

  console.log('\n[3.4 per-photo "not uploaded yet"]');
  await A.page.click('button.qh-tile.primary'); await A.page.click('#qh-sheet [data-form="qc-inspection"]'); await A.page.waitForTimeout(500);
  await A.page.fill('#m-docno', 'QC-SET-1');
  const r0 = A.page.locator('.item').nth(0);
  await r0.locator('textarea[aria-label="ตำแหน่ง"]').fill('เสา C-1');
  await A.ctx.setOffline(true); await A.page.waitForTimeout(200);
  await r0.getByLabel('+ เพิ่มรูป').setInputFiles(png); await A.page.waitForTimeout(400);
  await A.page.locator('.dlg-back button:has-text("ใช้รูปนี้")').click(); await A.page.waitForTimeout(600);
  ok(await A.S(() => !!document.querySelector('.item .thumb.upq')), 'offline: the new photo is marked "ยังไม่อัปโหลด" on its thumbnail');
  ok(await A.S(() => window.__qcSync().state === 'offline'), 'state offline (not error)');
  await A.ctx.setOffline(false);
  ok(await until(A.page, () => !document.querySelector('.item .thumb.upq') && window.__qcSync().pending === 0 && Object.values(window.__fake.S.insp).some(h => h.docno === 'QC-SET-1'), null, 12000), 'online again: uploaded, mark removed');

  console.log('\n[5.2 restart offline with no reachable session: opens from cache]');
  await A.S(() => sessionStorage.setItem('fk-netfail', '1'));
  await A.ctx.setOffline(true);
  await A.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await A.page.waitForTimeout(1500);
  ok(await A.S(() => !document.querySelector('.qo-ov')), 'no login / error overlay');
  ok(await A.S(() => !!document.querySelector('.qo-pill') && window.__qcSync().state === 'offline'), 'pill shown, state offline');
  const dl = await A.S(() => (window.__qcDocs() || []).map(d => (d.data.meta || {}).docno));
  ok(dl.includes('QC-SET-1'), 'documents available from the device cache ' + JSON.stringify(dl));
  await A.page.click('button.qh-tile.primary'); await A.page.click('#qh-sheet [data-form="qc-inspection"]'); await A.page.waitForTimeout(500);
  await A.page.fill('#m-docno', 'QC-SET-OFF');
  await A.page.locator('.item').nth(0).locator('textarea[aria-label="ตำแหน่ง"]').fill('คาน B-1'); await A.page.waitForTimeout(900);
  ok(await until(A.page, () => window.__qcSync().pending > 0 && (window.__qcDocs() || []).some(d => (d.data.meta || {}).docno === 'QC-SET-OFF'), null, 6000), 'new work saved locally into the outbox while offline');

  console.log('\n[3.2 sign-in expired is not "offline"]');
  await A.S(() => { sessionStorage.removeItem('fk-netfail'); sessionStorage.setItem('fk-nosess', '1'); });
  await A.ctx.setOffline(false);
  await A.page.reload({ waitUntil: 'networkidle' }); await A.page.waitForTimeout(1500);
  ok(await A.S(() => !document.querySelector('.qo-ov')), 'still opens from cache (no login wall)');
  ok(await A.S(() => window.__qcSync().state === 'auth'), 'state "auth"');
  ok(/เข้าสู่ระบบใหม่/.test(await A.page.textContent('.qo-pill')), 'pill asks to sign in again');
  ok(await A.S(() => window.__qcSync().pending > 0 && !Object.values(window.__fake.S.insp).some(h => h.docno === 'QC-SET-OFF')), 'outbox kept, nothing pushed without a session');
  await A.S(() => sessionStorage.removeItem('fk-nosess'));
  await A.page.reload({ waitUntil: 'networkidle' });
  ok(await until(A.page, () => Object.values(window.__fake.S.insp).some(h => h.docno === 'QC-SET-OFF'), null, 12000), 'after signing in again the offline work is sent');
  ok(!A.errs.length, 'no page errors' + (A.errs.length ? ': ' + A.errs.slice(0, 2).join(' | ') : ''));
  await A.ctx.close();

  console.log('\n[5.2 device never set up + offline -> dedicated page]');
  let B = await mk();
  await B.page.goto(BASE + 'index.html?mode=online', { waitUntil: 'networkidle' });
  await B.S(() => { localStorage.clear(); localStorage.setItem('qc-mode', 'online'); sessionStorage.clear(); sessionStorage.setItem('fk-netfail', '1'); });
  await B.ctx.setOffline(true);
  await B.page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await B.page.waitForTimeout(1200);
  ok(/เครื่องนี้ยังไม่เคยเชื่อมต่อ/.test(await B.page.textContent('body')), 'shows "เครื่องนี้ยังไม่เคยเชื่อมต่อ"');
  ok(await B.S(() => !localStorage.getItem('qc-setup-done')), 'no setup flag');
  await B.ctx.close();

  console.log('\n[5.1 setup interrupted -> flag not set, clear message]');
  let C = await mk();
  await C.page.goto(BASE + 'index.html?mode=online', { waitUntil: 'networkidle' });
  await C.S(() => { localStorage.clear(); localStorage.setItem('qc-mode', 'online'); sessionStorage.clear(); sessionStorage.setItem('fk-projfail', '1'); });
  await C.page.reload({ waitUntil: 'networkidle' }); await C.page.waitForTimeout(1200);
  ok(/ดึงข้อมูลตั้งต้นไม่ครบ/.test(await C.page.textContent('body')), 'says setup did not finish');
  ok(await C.S(() => !localStorage.getItem('qc-setup-done')), 'flag not written');
  await C.ctx.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
  function window_ME() { return '11111111-2222-3333-4444-555555555555'; }
})();
