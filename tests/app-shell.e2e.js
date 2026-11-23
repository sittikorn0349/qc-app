// Run: python3 -m http.server 8911 (repo root) & node tests/app-shell.e2e.js [path] [online|no006]
// New UX shell (canvas "UX ใหม่ แบบ Discord"): company › project rail › channels › feed / item thread,
// bottom nav, my tasks, plan, roles, channel settings, share link; offline (this device) and online (fake 006).
const { chromium } = require('playwright');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');
const MODE = process.argv[3] || 'offline';
const ONLINE = MODE !== 'offline';

(async () => {
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (ONLINE) {
    await ctx.addInitScript((no006) => {
      if (!sessionStorage.getItem('fakeS')) sessionStorage.setItem('fakeS', JSON.stringify({ insp: {}, items: {}, folders: {}, blobs: {}, events: [], calls: [], zones: ['ชั้น 1', 'ชั้น 2'] }));
      if (no006) sessionStorage.setItem('fk-no006', '1');
    }, MODE === 'no006');
    const { FAKE } = require('./online-mode.e2e.js'); await ctx.addInitScript(FAKE);
  }
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => { if (d.type() === 'prompt') d.accept('ของยังไม่มา'); else { errs.push('native dialog: ' + d.message()); d.dismiss(); } });
  await page.goto(BASE + 'index.html' + (ONLINE ? '?mode=online' : ''), { waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
  const S = (f, a) => page.evaluate(f, a);
  async function until(fn, arg, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(150); } return false; }
  const hash = h => S(x => { location.hash = x }, h).then(() => page.waitForTimeout(450));
  const mainText = () => S(() => document.querySelector('#qa-main').innerText);
  const chHref = name => S(n => { const a = [...document.querySelectorAll('.qa-ch')].find(x => x.textContent.replace(/^[#!]/, '').trim().startsWith(n)); return a && a.getAttribute('href') }, name);

  console.log('\n[' + MODE + ': first run → welcome, then the shell replaces the old home]');
  ok(await until(() => location.hash === '#/welcome' && !document.getElementById('qa').hidden), 'first run opens the welcome page in the shell');
  await page.click('#qa-main button.qa-btn.pri.big'); await page.waitForTimeout(400);
  ok(await S(() => getComputedStyle(document.getElementById('qc-home')).display === 'none'), 'old home grid is hidden behind the shell');
  ok(await S(() => !!document.querySelector('.qa-rail') && !!document.querySelector('.qa-side')), 'rail + channel sidebar shown');

  if (!ONLINE) {
    console.log('\n[new project: channels from floors]');
    await hash('#/newproject');
    await page.fill('input[aria-label="ชื่อโครงการ"]', 'Tower B'); await page.fill('input[aria-label="จำนวนชั้น"]', '3');
    ok((await mainText()).includes('#ชั้น 3') && (await mainText()).includes('#หลังคา'), 'preview lists ฐานราก, ชั้น 1–3, หลังคา');
    await page.click('#qa-main button.qa-btn.pri.big'); await page.waitForTimeout(800);
    const names = await S(() => [...document.querySelectorAll('.qa-ch')].map(a => a.textContent.trim()));
    ok(names.some(n => n.startsWith('!ประกาศ')) && ['ฐานราก', 'ชั้น 1', 'ชั้น 2', 'ชั้น 3', 'หลังคา'].every(z => names.some(n => n.startsWith('#' + z))), 'channels: ประกาศ + every floor (' + names.join(', ') + ')');
    ok(await S(() => document.querySelector('.qa-pj.on') && document.querySelector('.qa-pj.on').getAttribute('aria-label').includes('Tower B')), 'project icon on the rail is current');
  }

  console.log('\n[report from a channel: zone + project prefilled, back bar returns to the channel]');
  let ch2 = await chHref('ชั้น 2'); ok(!!ch2, 'channel ชั้น 2 exists');
  await hash(ch2);
  await page.click('#qa-main .qa-hd .qa-btn.pri'); // + รายงาน
  ok(await until(() => !!document.querySelector('#qh-sheet button[data-form]')), 'form picker opens over the shell');
  await page.click('#qh-sheet button[data-form]'); await page.waitForTimeout(900);
  ok(await S(() => document.getElementById('qa').hidden && getComputedStyle(document.getElementById('qa-back-bar')).display !== 'none'), 'form engine shown with the back bar');
  ok(await until(() => { const t = document.querySelector('#items .item textarea[aria-label="ตำแหน่ง"]'); return t && t.value.startsWith('ชั้น 2 · ') }), 'location starts with the channel zone');
  ok(await S(() => /Tower/.test(document.getElementById('m-project').value)), 'project field filled');
  ok(await S(() => /#ชั้น 2/.test(document.querySelector('#qa-back-bar button').textContent)), 'back bar says “กลับไป #ชั้น 2”');
  const r0 = page.locator('#items .item').first();
  await r0.locator('textarea[aria-label="ตำแหน่ง"]').fill('ชั้น 2 · เสา C-3'); await r0.locator('.irow .seg button[data-k="fix"]').click();
  await page.fill('#m-docno', 'SH-1'); await page.waitForTimeout(900);
  await page.click('#qa-back-bar button'); await page.waitForTimeout(700);
  ok(await S(h => !document.getElementById('qa').hidden && location.hash === h, ch2), 'back to the same channel');
  ok((await mainText()).includes('SH-1'), 'report card in the channel feed');
  ok(await until(() => [...document.querySelectorAll('.qa-aside .qa-task')].some(b => /เสา C-3/.test(b.textContent))), 'open item listed in the side panel');

  console.log('\n[item thread: chat on one check item]');
  await page.locator('#qa-main .qa-it', { hasText: 'เสา C-3' }).first().click(); await page.waitForTimeout(600);
  ok(await S(() => location.hash.startsWith('#/t/')), 'item opens its thread');
  if (MODE === 'no006') {
    ok(!(await S(() => !!document.querySelector('#qa-main .qa-send'))), 'server without 006: no chat composer (nothing gets stuck in a queue)');
  } else {
    await page.fill('#qa-main textarea', 'ต่อทาบเหล็กไม่พอ 40d'); await page.click('#qa-main .qa-send'); await page.waitForTimeout(600);
    ok((await mainText()).includes('ต่อทาบเหล็กไม่พอ 40d'), 'message shows in the thread');
    ok(await until(() => !!document.querySelector('#qa-main .qa-msg')), 'message bubble rendered');
  }

  console.log('\n[my tasks, overview, data]');
  await hash('#/tasks/none');
  if (!ONLINE) ok((await mainText()).includes('เสา C-3'), 'unassigned item listed under ยังไม่มอบหมาย');
  await hash('#/overview'); ok(/จุดค้างแก้ทั้งหมด/.test(await mainText()), 'overview KPIs');
  await hash('#/data'); ok(/ข้อมูลของคุณเก็บไว้ที่ไหน/.test(await mainText()), 'data & sync page');

  console.log('\n[plan: task, hold point, baseline]');
  await hash('#/plan');
  const canEdit = await S(() => [...document.querySelectorAll('#qa-main button')].some(b => b.textContent.includes('เพิ่มงาน')));
  if (!ONLINE) {
    ok(canEdit, 'owner can add plan tasks');
    // make ชั้น 2 a hold point first
    await hash('#/cs/' + decodeURIComponent(ch2.replace('#/c/', '')));
    await page.click('#qa-main [role="radio"]:has-text("H หยุดตรวจ")'); await page.click('#qa-main button.qa-btn.pri.big'); await page.waitForTimeout(700);
    ok(await S(() => [...document.querySelectorAll('.qa-ch')].some(a => /ชั้น 2/.test(a.textContent) && a.querySelector('.qa-tag.H'))), 'channel shows H tag');
    await hash('#/plan');
    await page.click('#qa-main button:has-text("เพิ่มงาน")');
    await page.fill('.qa-sheet input[aria-label="ชื่องาน"]', 'เทพื้นชั้น 3');
    await page.selectOption('.qa-sheet select[aria-label="ต้องรอจุดหยุดตรวจผ่านก่อน"]', { index: 1 });
    await page.click('.qa-sheet button:has-text("บันทึก")'); await page.waitForTimeout(700);
    ok((await mainText()).includes('เทพื้นชั้น 3'), 'task in the master plan');
    ok((await mainText()).includes('รอจุดหยุดตรวจ #ชั้น 2'), 'task held by the open hold point');
    await page.click('#qa-main button:has-text("อนุมัติแผนฐาน")'); await page.click('#qa-main button:has-text("อนุมัติแผนฐาน"), #qa-main button:has-text("กดอีกครั้ง")'); await page.waitForTimeout(700);
    ok(/แผนฐานล่าสุด/.test(await mainText()), 'baseline approved');
    await hash('#/plan/week'); ok(/การมอบงานและรับปากใช้ได้ในโหมดออนไลน์/.test(await mainText()), 'week view explains online-only commitments');
  } else {
    ok(!canEdit, 'QC role cannot edit the plan (no pl_edit)');
  }

  console.log('\n[roles & members]');
  await hash('#/roles');
  const t = await mainText();
  ok(/QC|ผู้ตรวจ/.test(t), 'role list shown');
  if (ONLINE) ok(!(await S(() => [...document.querySelectorAll('#qa-main button')].some(b => b.textContent.includes('สร้างยศใหม่')))), 'non-admin cannot create roles');
  await hash('#/members');
  if (ONLINE && MODE !== 'no006') ok(await until(() => /PM สมชาย/.test(document.querySelector('#qa-main').innerText)), 'project members listed with names');

  console.log('\n[share]');
  await hash(ch2); await page.click('#qa-main .qa-rep button:has-text("ส่ง")');
  if (ONLINE && MODE !== 'no006') {
    await page.click('.qa-sheet [role="radio"]:has-text("30 วัน")'); await page.click('.qa-sheet button:has-text("สร้างลิงก์")');
    ok(await until(() => { const i = document.querySelector('.qa-sheet input[aria-label="ลิงก์"]'); return i && /example\.test.*d=30/.test(i.value) }, null, 15000), 'share link created with 30-day expiry');
  } else {
    ok(await until(() => !!document.querySelector('.qa-sheet') && /PDF|ZIP|ลิงก์/.test(document.querySelector('.qa-sheet').innerText)), 'share sheet offers files / explains');
  }
  await page.keyboard.press('Escape');

  if (ONLINE && MODE !== 'no006') {
    console.log('\n[online: message sync, announce permission, unread, assigned fix]');
    ok(await until(() => window.__fake.S.w && window.__fake.S.w.msgs.some(m => m.body === 'ต่อทาบเหล็กไม่พอ 40d' && m.item_id), null, 12000), 'thread message reached the server with its item id');
    const ann = await chHref('ประกาศ'); await hash(ann);
    ok(!(await S(() => !!document.querySelector('#qa-main .qa-send'))), 'announcements: no composer without ch_manage');
    await S(() => { const w = window.__fake.S.w; w.msgs.push({ id: 99, client_id: 'x1', channel_id: 'ch_ชั้น 1', author: window.__fake.OTHER, body: 'พรุ่งนี้เทพื้น', created_at: new Date(Date.now() + 5000).toISOString() }); window.__fake.fire(); });
    ok(await until(() => [...document.querySelectorAll('.qa-ch')].some(a => /ชั้น 1/.test(a.textContent) && a.querySelector('.qa-badge'))), 'unread badge on #ชั้น 1');
    await S(() => { window.__fake.addShared('ish', 'PM-1', window.__fake.ME); window.__fake.S.items['ish.x1'].loc = 'ชั้น 2 · คาน B1'; window.__fake.fire(); });
    await page.waitForTimeout(1500); await hash('#/tasks/fix');
    ok(await until(() => /คาน B1|PM-1/.test(document.querySelector('#qa-main').innerText)), 'assigned item under ฉันต้องแก้');
    await page.locator('#qa-main .qa-task').first().click(); await page.waitForTimeout(700);
    await page.click('#qa-main button:has-text("แจ้งแก้แล้ว")');
    await page.fill('.qa-sheet textarea', 'ต่อทาบเพิ่มแล้ว'); await page.click('.qa-sheet button:has-text("ส่งให้ผู้ตรวจตรวจซ้ำ")');
    ok(await until(() => window.__fake.S.items['ish.x1'].status === 'fixed'), 'แจ้งแก้แล้ว reaches the server');
  }

  console.log('\n[phone layout]');
  await page.setViewportSize({ width: 390, height: 844 }); await hash('#/');
  ok(await S(() => getComputedStyle(document.querySelector('.qa-nav')).display !== 'none'), 'bottom nav on phone');
  ok(await S(() => getComputedStyle(document.querySelector('.qa-side')).display !== 'none'), 'phone home shows the channel list');
  await hash(ch2); ok(await S(() => getComputedStyle(document.querySelector('.qa-side')).display === 'none'), 'phone channel view hides the sidebar');
  const small = await S(() => [...document.querySelectorAll('#qa button, #qa a')].filter(b => b.offsetParent && b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 40 && !b.closest('.qa-tri')).map(b => b.textContent.trim().slice(0, 20)));
  ok(small.length === 0, 'touch targets ≥ 40px on phone' + (small.length ? ' (' + small.slice(0, 5).join(' | ') + ')' : ''));

  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
