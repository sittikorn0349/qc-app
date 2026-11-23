const { chromium } = require('playwright');
const BASE = 'http://localhost:8911/' + (process.argv[2] || '');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗', m); };
  await p.goto(BASE + 'index.html', { waitUntil: 'networkidle' }); await p.waitForTimeout(1000);
  await p.click('#qh-t-set'); await p.waitForTimeout(300);
  ok(await p.isVisible('#qs-online'), 'offline settings show "ใช้โหมดออนไลน์"');
  await p.click('#qs-online'); await p.waitForTimeout(200);
  ok(await p.isVisible('.qc-sheet-confirm'), 'asks first (explains account + internet needed)');
  await p.click('#qc-ask-no'); await p.waitForTimeout(200);
  ok(!(await p.evaluate(() => localStorage.getItem('qc-mode'))) || (await p.evaluate(() => localStorage.getItem('qc-mode'))) !== 'online', 'cancel changes nothing');
  await p.click('#qs-online'); await p.click('#qc-ask-ok'); await p.waitForTimeout(1500);
  ok(/mode=online/.test(p.url()) && await p.evaluate(() => localStorage.getItem('qc-mode') === 'online'), 'OK → online mode remembered: ' + p.url());
  ok(!errs.filter(e => !/supabase|fetch|network/i.test(e)).length, 'no page errors ' + errs.join('|'));
  console.log(`\n${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
