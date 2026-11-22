// Run: python3 -m http.server 8911 (repo root) & npm i playwright; node tests/online-mode.e2e.js
// Online mode end-to-end with an in-browser fake of the Supabase API (window.__qcOnlineApi).
// Exercises the real form + pwa-shell-online.js: create, photo upload, sync, other people's
// rechecks surviving owner edits, recheck conflict, offline queue, shared documents, reload.
const { chromium } = require('playwright');
const fs = require('fs');

const FAKE = `
(function(){
  var ME='11111111-2222-3333-4444-555555555555', OTHER='99999999-8888-7777-6666-555555555555', HM='77777777-6666-5555-4444-333333333333';
  var S0=null;try{S0=JSON.parse(sessionStorage.getItem('fakeS')||'null')}catch(e){}
  var S=S0||{insp:{},items:{},folders:{},blobs:{},events:[],calls:[]};S.rt=[];
  function save(){var x=Object.assign({},S);delete x.rt;var b={};Object.keys(S.blobs).forEach(function(k){b[k]=true});x.blobs=b;sessionStorage.setItem('fakeS',JSON.stringify(x))}
  setInterval(save,100);
  function now(){return new Date(Date.now()+(S.skew=(S.skew||0)+1)).toISOString()}
  function c(o){return JSON.parse(JSON.stringify(o))}
  function today(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Bangkok'})}
  function status(it,keepFixed){
    if(it.res!=='fix'&&it.res!=='bad')return null;
    if(keepFixed&&it.status==='fixed')return 'fixed';
    return it.rres==='ok'?'approved':it.rres==='bad'?'rejected':it.assignee_id?'assigned':'open';
  }
  function log(n,a){S.calls.push(n)}
  window.__fake={S:S,ME:ME,OTHER:OTHER,HM:HM,
    addRequest:function(r){S.reqs=S.reqs||{};S.reqs[r.id]=Object.assign({status:'requested',result_note:'',result_photos:[],hold:true,loc:'',cat:'',next_step:'',note:'',inspection_id:null,created_at:now()},r)},
    fixedBy:function(sid,note){var it=S.items[sid];it.status='fixed';it.rres='';it.fixed_note=note||''},
    fire:function(){S.rt.forEach(function(cb){cb({})})},
    otherRecheck:function(sid,res,note){var it=S.items[sid];it.rres=res;it.rnote=note;it.rdate=today();it.rchk_at=now();it.status=status(it)},
    addShared:function(id,docno,asg){S.insp[id]={id:id,project_id:'p1',owner_id:OTHER,docno:docno,insp_date:null,site:'',work:'งานของ PM',weather:'',meta:{project:'Tower A',docno:docno,work:'งานของ PM'},sign:{},summary:'',remarks:'',rev:0,created_at:now(),updated_at:now(),deleted_at:null,folder_id:null,extra:{v:2}};
      S.items[id+'.x1']={id:id+'.x1',inspection_id:id,project_id:'p1',ord:0,loc:'คาน B1',chk:'ระดับ',res:'fix',note:'',cat:'',ref:'',before:[],after:[],rres:'',rdate:'',rnote:'',rchk_at:null,assignee_id:asg||null,due_date:null,fixed_note:'',status:asg?'assigned':'open'}}
  };
  window.__qcOnlineApi={
    session:function(){return Promise.resolve({user:{id:ME,email:'foreman@example.com',user_metadata:{full_name:'Foreman Test'}}})},
    signIn:function(){return Promise.resolve()},signOut:function(){return Promise.resolve()},
    myProjects:function(){return Promise.resolve([{id:'p1',name:'Tower A',site:'Bangna',categories:[],role:'foreman'}])},
    myProfile:function(){return Promise.resolve({org_role:'staff'})},
    inspections:function(f){log('inspections');return Promise.resolve(Object.values(S.insp).filter(function(h){
      return (!f.id||h.id===f.id)&&(!f.project||h.project_id===f.project)&&(!f.owner||h.owner_id===f.owner)&&(!f.notOwner||h.owner_id!==f.notOwner)}).map(c))},
    items:function(ids){return Promise.resolve(Object.values(S.items).filter(function(i){return ids.indexOf(i.inspection_id)>=0}).map(c))},
    insertHeader:function(row){log('insertHeader');if(row.owner_id!==ME)return Promise.reject(new Error('rls'));var r=c(row);r.rev=0;r.updated_at=now();S.insp[r.id]=r;return Promise.resolve(null)},
    updateHeader:function(id,p){log('updateHeader');var h=S.insp[id];if(!h||h.owner_id!==ME)return Promise.resolve([]);Object.assign(h,c(p));h.rev++;h.updated_at=now();return Promise.resolve([{id:id}])},
    deleteHeader:function(id){var h=S.insp[id];if(h&&h.owner_id===ME){delete S.insp[id];Object.keys(S.items).forEach(function(k){if(S.items[k].inspection_id===id)delete S.items[k]})}return Promise.resolve(null)},
    insertItems:function(rows){log('insertItems');rows.forEach(function(r){var h=S.insp[r.inspection_id];if(!h||h.owner_id!==ME)throw new Error('rls');var it=c(r);it.project_id=h.project_id;it.rchk_at=(it.rres==='ok'||it.rres==='bad')?now():null;it.status=status(it);S.items[it.id]=it});return Promise.resolve(null)},
    updateItem:function(id,p){log('updateItem:'+Object.keys(p).join('+'));var it=S.items[id];if(!it||S.insp[it.inspection_id].owner_id!==ME)return Promise.resolve([]);
      var before=it.rres;Object.assign(it,c(p));if('rres' in p&&p.rres!==before&&(p.rres==='ok'||p.rres==='bad'))it.rchk_at=now();it.status=status(it,!('rres' in p));return Promise.resolve([{id:id}])},
    deleteItems:function(ids){ids.forEach(function(id){delete S.items[id]});return Promise.resolve(null)},
    recheck:function(id,res,note,after,seen){log('recheck');var it=S.items[id];if(!it)return Promise.resolve('gone');
      if((it.rchk_at||null)!==(seen||null)){S.events.push({kind:'recheck_conflict',item:id,res:res,note:note});return Promise.resolve('conflict')}
      it.rres=res;it.rnote=note||'';it.rdate=today();it.after=it.after.concat(after||[]);it.rchk_at=now();it.status=status(it);S.events.push({kind:'recheck',item:id,res:res});return Promise.resolve('ok')},
    reportFixed:function(id,after,note){log('reportFixed');var it=S.items[id];if(!it)return Promise.resolve('gone');
      if(it.assignee_id!==ME)return Promise.reject(Object.assign(new Error('item not assigned to you'),{code:'P0001'}));
      if(it.status==='fixed')return Promise.resolve('already_fixed');
      it.status='fixed';it.rres='';it.after=it.after.concat(after||[]);it.fixed_note=note||'';return Promise.resolve('ok')},
    folders:function(){return Promise.resolve(Object.values(S.folders).map(c))},
    upsertFolder:function(r){S.folders[r.id]=c(r);return Promise.resolve(null)},
    deleteFolder:function(id){delete S.folders[id];return Promise.resolve(null)},
    upload:function(path,blob){log('upload');S.blobs[path]=blob;return Promise.resolve({path:path})},
    download:function(path){return Promise.resolve(S.blobs[path]?(S.blobs[path] instanceof Blob?S.blobs[path]:new Blob([new Uint8Array([137,80,78,71])],{type:'image/png'})):null)},
    remove:function(path){delete S.blobs[path];return Promise.resolve(null)},
    profiles:function(ids){return Promise.resolve(ids.map(function(id){return {id:id,display_name:id===OTHER?'PM สมชาย':id===HM?'เฮดแมน สมศักดิ์':'Foreman Test',email:''}}))},
    profileByEmail:function(){return Promise.resolve(null)},members:function(){return Promise.resolve([{user_id:ME,role:'foreman'},{user_id:OTHER,role:'pm'},{user_id:HM,role:'headman'}])},
    addMember:function(){return Promise.resolve(null)},removeMember:function(){return Promise.resolve(null)},
    createProject:function(){return Promise.reject(new Error('no'))},
    requests:function(){return Promise.resolve(Object.values(S.reqs||{}).map(c))},
    insertRequest:function(row){log('insertRequest');S.reqs=S.reqs||{};if(S.reqs[row.id])return Promise.reject(Object.assign(new Error('duplicate key'),{code:'23505'}));
      if(row.inspector_id===ME)return Promise.reject(Object.assign(new Error('choose someone else to inspect'),{code:'P0001'}));
      var r=c(row);r.status='requested';r.result_note='';r.result_photos=[];r.created_at=now();S.reqs[r.id]=r;return Promise.resolve(null)},
    answerRequest:function(id,action,note,photos,at){log('answerRequest:'+action);var r=(S.reqs||{})[id];if(!r)return Promise.resolve('gone');
      if(r.status!=='requested'&&r.status!=='accepted')return Promise.resolve('closed');
      if(action==='accept')r.status='accepted';else if(action==='pass'||action==='fail'){r.status=action==='pass'?'passed':'failed';r.result_note=note||'';r.result_by=ME;r.result_at=now()}
      else if(action==='cancel')r.status='cancelled';else if(action==='reschedule'){r.scheduled_at=at;r.status='requested'}
      return Promise.resolve('ok')},
    lineStatus:function(){return Promise.resolve({linked:!!S.linked,oa:'@qcapp'})},lineLinkStart:function(){return Promise.resolve({code:'123456',oa:'@qcapp',linked:false})},lineUnlink:function(){S.linked=false;return Promise.resolve(null)},
    subscribe:function(p,cb){S.rt.push(cb);return function(){}}
  };
})();`;

module.exports = { FAKE };
if (require.main === module) (async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const S = (expr, arg) => page.evaluate(expr, arg);
  async function until(fn, arg, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(150); } return false; }

  await page.goto('http://localhost:8911/index.html?mode=online', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok(await S(() => !!window.__ONLINE && localStorage.getItem('qc-mode') === 'online'), 'online shell loaded and mode remembered');
  ok(await S(() => !!document.querySelector('.qo-pill')), 'status pill shown (single project auto-selected)');
  ok(/Tower A/.test(await page.textContent('.qo-pill')), 'pill shows project name');

  console.log('\n[create + photo + sync]');
  await page.click('button.qh-tile.primary'); await page.waitForTimeout(600);
  await page.fill('#m-project', 'Tower A'); await page.fill('#m-docno', 'QC-ON-001');
  const r0 = page.locator('.item').nth(0), r1 = page.locator('.item').nth(1);
  await r0.locator('textarea[aria-label="ตำแหน่ง"]').fill('เสา C-3');
  await r0.locator('textarea[aria-label="รายการตรวจ"]').fill('ระยะหุ้มเหล็ก');
  await r0.locator('button[data-k="fix"]').first().click();
  await r1.locator('textarea[aria-label="ตำแหน่ง"]').fill('คาน B-2');
  await r1.locator('button[data-k="bad"]').first().click();
  const png = '/tmp/qc-app-review/test.png';
  if (!fs.existsSync(png)) fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
  await r0.getByLabel('+ เพิ่มรูป').setInputFiles(png);
  await page.waitForTimeout(400);
  await page.locator('.dlg-back button:has-text("ใช้รูปนี้")').click();
  const synced = await until(() => { const S = window.__fake.S; const h = Object.values(S.insp).find(x => x.docno === 'QC-ON-001'); if (!h) return false; const its = Object.values(S.items).filter(i => i.inspection_id === h.id); return its.some(i => i.res === 'fix' && i.before.length === 1) && Object.keys(S.blobs).length === 1; }, undefined, 12000);
  ok(synced, 'document, items and photo reached the server');
  const docId = await S(() => Object.values(window.__fake.S.insp).find(x => x.docno === 'QC-ON-001').id);
  const sidA = await S((id) => Object.values(window.__fake.S.items).find(i => i.inspection_id === id && i.res === 'fix').id, docId);
  const sidB = await S((id) => Object.values(window.__fake.S.items).find(i => i.inspection_id === id && i.res === 'bad').id, docId);
  ok(await S((id) => window.__fake.S.insp[id].owner_id === window.__fake.ME && window.__fake.S.insp[id].project_id === 'p1', docId), 'owner and project set on server');
  const bpath = await S((s) => window.__fake.S.items[s].before[0], sidA);
  ok(/^11111111-2222-3333-4444-555555555555\/[0-9a-f]+$/.test(bpath), 'photo stored under uploader folder: ' + bpath);
  ok(await until(() => /ออนไลน์ · ซิงก์แล้ว/.test(document.querySelector('#badge').textContent)), 'badge shows online + synced');

  console.log('\n[someone else rechecks; owner edits the same item without seeing it yet]');
  await S((s) => window.__fake.otherRecheck(s, 'ok', 'ผ่านแล้ว (PM)'), sidA);   // no realtime event fired
  await r0.locator('textarea[aria-label="ตำแหน่ง"]').fill('เสา C-3 ชั้น 2');
  ok(await until((s) => window.__fake.S.items[s].loc === 'เสา C-3 ชั้น 2', sidA), 'owner edit reached server');
  const a = await S((s) => window.__fake.S.items[s], sidA);
  ok(a.rres === 'ok' && a.rnote === 'ผ่านแล้ว (PM)', 'other person\'s recheck NOT overwritten by owner save');
  ok(await until((s) => { const d = window.__qcGetDoc(window.__qcForm.cur()); return d && d.items.some(i => i.rres === 'ok' && i.rnote === 'ผ่านแล้ว (PM)'); }), 'recheck pulled into the local copy');
  await r0.locator('textarea[aria-label="ตำแหน่ง"]').fill('เสา C-3 ชั้น 2 (แก้ต่อ)');   // still typing: form copy is outdated
  ok(await until((s) => window.__fake.S.items[s].loc === 'เสา C-3 ชั้น 2 (แก้ต่อ)', sidA), 'second edit from the outdated form copy reached server');
  const a2 = await S((s) => window.__fake.S.items[s], sidA);
  ok(a2.rres === 'ok' && a2.rnote === 'ผ่านแล้ว (PM)', 'outdated form copy did NOT wipe the recheck (3-way merge)');
  await page.keyboard.press('Tab'); await page.mouse.click(5, 5);
  ok(await until(() => [...document.querySelectorAll('.item')].some(n => n.dataset.res === 'ok')), 'form shows the recheck result once the user leaves the field');
  ok(await S(() => [...document.querySelectorAll('textarea[aria-label="ตำแหน่ง"]')].some(t => t.value === 'เสา C-3 ชั้น 2 (แก้ต่อ)')), 'user\'s own typing kept after the merge');

  console.log('\n[recheck conflict: two people recheck the same item]');
  await S((s) => window.__fake.otherRecheck(s, 'bad', 'PM: ยังไม่ผ่าน'), sidB);   // server first, owner hasn't seen it
  await r1.locator('.re-toggle').click().catch(() => {});
  const okBtn = r1.locator('.re .seg button[data-k="ok"]');
  if (await okBtn.count() === 0) await r1.locator('.re-toggle').click();
  await r1.locator('.re .seg button[data-k="ok"]').click();
  ok(await until(() => window.__fake.S.events.some(e => e.kind === 'recheck_conflict')), 'owner\'s late recheck reported as conflict (kept in history)');
  const b = await S((s) => window.__fake.S.items[s], sidB);
  ok(b.rres === 'bad' && b.rnote === 'PM: ยังไม่ผ่าน', 'first recheck to reach server stays');
  ok(await until((s) => { const d = window.__qcGetDoc(window.__qcForm.cur()); return d.items.some(i => i.rres === 'bad' && i.rnote === 'PM: ยังไม่ผ่าน'); }), 'local copy corrected to the server result');
  ok(await S(() => window.__qcSync().conflicts === 1), 'conflict counted for the status menu');

  console.log('\n[offline queue]');
  await ctx.setOffline(true);
  await page.waitForTimeout(300);
  await r0.locator('textarea[aria-label="รายการตรวจ"]').fill('ระยะหุ้มเหล็ก (แก้ตอนออฟไลน์)');
  ok(await until(() => /ออฟไลน์ · รอส่ง [1-9]/.test(document.querySelector('#badge').textContent)), 'badge shows offline + pending');
  ok(await S((s) => window.__fake.S.items[s].chk === 'ระยะหุ้มเหล็ก', sidA), 'server untouched while offline');
  await ctx.setOffline(false);
  ok(await until((s) => window.__fake.S.items[s].chk === 'ระยะหุ้มเหล็ก (แก้ตอนออฟไลน์)', sidA, 12000), 'queued edit sent when back online');
  ok(await until(() => /ซิงก์แล้ว/.test(document.querySelector('#badge').textContent)), 'badge back to synced');

  console.log('\n[shared documents from others]');
  await S(() => { window.__fake.addShared('ipm1', 'PM-007'); window.__fake.fire(); });
  ok(await until(() => !!window.__qcGetDoc('ipm1')), 'other person\'s document pulled via realtime');
  await page.evaluate(() => document.querySelector('#btn-list').click());
  await page.waitForTimeout(400);
  const tab = page.locator('button:has-text("ของคนอื่นในโครงการ")');
  ok(await tab.count() > 0, 'library shows "others in project" tab');
  if (await tab.count()) { await tab.first().click(); await page.waitForTimeout(300); ok(/PM-007/.test(await page.textContent('#reclist')), 'shared document listed'); }

  console.log('\n[reload: data persists and nothing re-sent]');
  const before = await S(() => window.__fake.S.calls.length);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  ok(await S((id) => !!window.__qcGetDoc(id), docId), 'own document available after reload');
  const writes = await S((n) => window.__fake.S.calls.slice(n).filter(c => /insert|update|recheck|upload/.test(c)), before);
  ok(writes.length === 0, 'no redundant writes after reload ' + JSON.stringify(writes));

  console.log('\n--- page errors ---'); console.log(errs.length ? errs.join('\n') : '(none)');
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})();
