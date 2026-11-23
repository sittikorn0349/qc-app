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
    myProjects:function(){return Promise.resolve([{id:'p1',name:'Tower A',site:'Bangna',categories:[],role:'foreman',zones:S.zones||[]}])},
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
    /* 005: form documents / templates / zones; sessionStorage fk-no005=1 simulates a server without the migration */
    formDocs:function(p){if(sessionStorage.getItem('fk-no005')==='1')return Promise.reject({code:'PGRST205',message:"Could not find the table 'public.form_docs' in the schema cache"});log('formDocs');return Promise.resolve(Object.values(S.fdocs||{}).filter(function(r){return r.project_id===p}).map(c))},
    putFormDoc:function(r){if(sessionStorage.getItem('fk-no005')==='1')return Promise.reject({code:'PGRST205',message:'form_docs'});log('putFormDoc');S.fdocs=S.fdocs||{};var ex=S.fdocs[r.id];if(ex&&ex.owner_id!==ME)return Promise.resolve([]);var x=c(r);x.owner_id=ME;S.fdocs[r.id]=x;return Promise.resolve([{id:r.id}])},
    formTemplates:function(p){if(sessionStorage.getItem('fk-no005')==='1')return Promise.reject({code:'PGRST205',message:'form_templates'});return Promise.resolve(Object.values(S.ftpl||{}).filter(function(r){return r.project_id===p}).map(c))},
    putFormTemplate:function(r){log('putFormTemplate');S.ftpl=S.ftpl||{};var x=c(r);x.owner_id=x.owner_id||ME;S.ftpl[r.id]=x;return Promise.resolve([{id:r.id}])},
    setZones:function(p,z){if(sessionStorage.getItem('fk-no005')==='1')return Promise.reject({code:'PGRST202',message:'set_project_zones'});S.zones=z;return Promise.resolve(z)},
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
    subscribe:function(p,cb){S.rt.push(cb);return function(){}},
    /* 006 workspace; sessionStorage fk-no006=1 simulates a server without it */
    ws:sessionStorage.getItem('fk-no006')==='1'?undefined:(function(){
      function W(){S.w=S.w||{chs:{},msgs:[],roles:null,reads:{},plan:{},bl:[],cm:{},audit:[],code:'SCC-4K7',joined:true,co:{name:'บริษัท ทดสอบ',plan:'team',standards:['รายการประกอบแบบของโครงการ','มยผ.','วสท.']},my:{p1:['qc']},access:{}};
        if(!S.w.roles)S.w.roles=[{id:'owner',name:'เจ้าของ',color:'#B42318',position:100,base:'pm',perms:['*'],builtin:true},{id:'pm',name:'ผู้จัดการโครงการ',color:'#4A2F86',position:80,base:'pm',perms:['*'],builtin:true},
          {id:'qc',name:'QC',color:'#1F5FA8',position:60,base:'foreman',perms:['ins_view','ins_create','ins_recheck','ins_assign','ch_post','req_answer','pl_progress'],builtin:true},
          {id:'headman',name:'หัวหน้าช่าง',color:'#B26B00',position:40,base:'headman',perms:['ins_view','ins_fix','ch_post','req_create','pl_progress'],builtin:true},{id:'everyone',name:'ทุกคน',color:'#5B6B7F',position:0,base:'viewer',perms:['ins_view'],builtin:true}];
        return S.w}
      function perms(p){var w=W(),ids=w.my[p]||[],o=[];ids.forEach(function(id){var r=w.roles.filter(function(x){return x.id===id})[0];if(r)o=o.concat(r.perms)});return o}
      return {
        company:function(){var w=W();return Promise.resolve(Object.assign({id:1,members:3,seats:10,joined:w.joined,is_admin:false},w.co))},
        companyCode:function(){return Promise.resolve(null)},rotateCode:function(){return Promise.reject(new Error('not admin'))},
        join:function(code){var w=W();if(code===w.code){w.joined=true;return Promise.resolve(true)}return Promise.resolve(false)},
        updateCompany:function(){return Promise.reject(new Error('not admin'))},
        people:function(){return Promise.resolve([{id:ME,name:'Foreman Test',email:'foreman@example.com',org_role:'staff',joined:true},{id:OTHER,name:'PM สมชาย',email:'pm@example.com',org_role:'staff',joined:true},{id:HM,name:'เฮดแมน สมศักดิ์',email:'hm@example.com',org_role:'staff',joined:true}])},
        projectPeople:function(p){var w=W();return Promise.resolve([{id:ME,name:'Foreman Test',email:'foreman@example.com',base:'foreman',roles:w.my[p]||[]},{id:OTHER,name:'PM สมชาย',email:'pm@example.com',base:'pm',roles:['pm']},{id:HM,name:'เฮดแมน สมศักดิ์',email:'hm@example.com',base:'headman',roles:['headman']}])},
        perms:function(p){var w=W();return Promise.resolve({perms:perms(p),roles:w.my[p]||[],top:60})},
        roles:function(){return Promise.resolve(c(W().roles))},
        saveRole:function(r){var w=W();if(perms('p1').indexOf('*')<0)return Promise.reject(new Error('ไม่มีสิทธิ์จัดการยศ'));r=c(r);r.id=r.id||('rl_'+Math.random().toString(36).slice(2,8));w.roles=w.roles.filter(function(x){return x.id!==r.id}).concat([r]);return Promise.resolve([r])},
        deleteRole:function(){return Promise.reject(new Error('no'))},
        setMemberRoles:function(p,u,ids){var w=W();if(perms(p).indexOf('mem_manage')<0&&perms(p).indexOf('*')<0)return Promise.reject(new Error('ไม่มีสิทธิ์ให้ยศ'));w.my[p]=ids;return Promise.resolve(null)},
        audit:function(){return Promise.resolve(c(W().audit))},
        ensureChannels:function(p){var w=W();(S.zones||[]).forEach(function(z,i){var id='ch_'+z;if(!w.chs[id])w.chs[id]={id:id,project_id:p,name:z,category:'โซนงาน',kind:'zone',hold:null,standard_ref:'',position:i}});
          if(!w.chs.ch_ann)w.chs.ch_ann={id:'ch_ann',project_id:p,name:'ประกาศ',category:'ทั่วไป',kind:'announce',position:-1};return Promise.resolve(null)},
        channels:function(p){return Promise.resolve(Object.values(W().chs).filter(function(x){return x.project_id===p&&!x.archived_at}).map(c))},
        saveChannel:function(r){var w=W();var p=perms(r.project_id||'p1');if(p.indexOf('ch_manage')<0&&p.indexOf('*')<0)return Promise.reject(new Error('ไม่มีสิทธิ์จัดการช่อง'));r=c(r);r.id=r.id||('ch_'+r.name);w.chs[r.id]=Object.assign(w.chs[r.id]||{},r);return Promise.resolve([c(w.chs[r.id])])},
        access:function(ch){return Promise.resolve(c(W().access[ch]||[]))},setAccess:function(rows){var w=W();rows.forEach(function(r){w.access[r.channel_id]=(w.access[r.channel_id]||[]).filter(function(x){return x.role_id!==r.role_id}).concat([c(r)])});return Promise.resolve(null)},
        unread:function(p){var w=W(),n={};w.msgs.forEach(function(m){if(m.author!==ME&&!m.item_id&&(!w.reads[m.channel_id]||m.created_at>w.reads[m.channel_id]))n[m.channel_id]=(n[m.channel_id]||0)+1});return Promise.resolve(Object.keys(n).map(function(k){return {channel_id:k,n:n[k]}}))},
        markRead:function(ch){W().reads[ch]=now();return Promise.resolve(null)},
        messages:function(f){return Promise.resolve(W().msgs.filter(function(m){return f.item?m.item_id===f.item:(m.channel_id===f.channel&&!m.item_id)}).map(c))},
        search:function(p,t){return Promise.resolve(W().msgs.filter(function(m){return (m.body||'').indexOf(t)>=0}).map(c))},
        post:function(row){log('post');var w=W();var ch=w.chs[row.channel_id];var p=perms('p1');
          if(ch&&ch.kind==='announce'&&p.indexOf('ch_manage')<0&&p.indexOf('*')<0)return Promise.reject(Object.assign(new Error('ช่องประกาศโพสต์ได้เฉพาะผู้จัดการช่อง'),{code:'42501'}));
          if(w.msgs.some(function(m){return m.client_id===row.client_id}))return Promise.resolve([]);
          var m=c(row);m.id=w.msgs.length+1;m.author=ME;m.created_at=now();w.msgs.push(m);return Promise.resolve([m])},
        editMessage:function(){return Promise.resolve(null)},
        replies:function(ch){return Promise.resolve(W().msgs.filter(function(m){return m.channel_id===ch&&m.item_id}).map(function(m){return {item_id:m.item_id}}))},
        itemEvents:function(ids){return Promise.resolve(S.events.filter(function(e){return ids.indexOf(e.item)>=0}).map(function(e){return {item_id:e.item,kind:e.kind,actor:ME,detail:{res:e.res},created_at:now()}}))},
        plan:function(p){return Promise.resolve(Object.values(W().plan).filter(function(t){return t.project_id===p}).map(c))},
        savePlanTask:function(r){var w=W();r=c(r);r.id=r.id||('pt_'+Math.random().toString(36).slice(2,8));w.plan[r.id]=Object.assign(w.plan[r.id]||{pct:0,preds:[],weight:0,position:0},r);return Promise.resolve([c(w.plan[r.id])])},
        deletePlanTask:function(id){delete W().plan[id];return Promise.resolve(null)},
        baselines:function(){return Promise.resolve(c(W().bl))},
        approveBaseline:function(p){var w=W();if(perms(p).indexOf('pl_baseline')<0&&perms(p).indexOf('*')<0)return Promise.reject(new Error('ไม่มีสิทธิ์อนุมัติแผนฐาน'));
          w.bl.unshift({id:w.bl.length+1,approved_by:ME,approved_at:now(),snapshot:Object.values(w.plan).map(c)});return Promise.resolve(w.bl[0].id)},
        commitments:function(ids){var w=W();return Promise.resolve(Object.values(w.cm).filter(function(x){return ids.indexOf(x.task_id)>=0}).map(c))},
        assign:function(row){var w=W();w.cm[row.task_id+'|'+row.week]=Object.assign({state:'assigned',blocker:'',note:''},c(row));return Promise.resolve(null)},
        answer:function(t,wk,st,why,pct){var w=W(),x=w.cm[t+'|'+wk];if(!x)return Promise.resolve('gone');var task=w.plan[t];
          if(task&&task.hold_channel_id&&(st==='promised'||st==='done')&&Object.values(S.items).some(function(i){return (i.loc||'').indexOf((w.chs[task.hold_channel_id]||{}).name+' · ')===0&&(i.status==='open'||i.status==='assigned'||i.status==='fixed'||i.status==='rejected')}))return Promise.resolve('held');
          x.state=st;x.blocker=st==='blocked'?why:'';if(pct!=null&&task)task.pct=pct;return Promise.resolve('ok')},
        setProject:function(){return Promise.resolve(null)},
        share:function(path,blob,days,row){S.blobs['share/'+path]=blob;return Promise.resolve('https://example.test/s/'+encodeURIComponent(path)+'?d='+days)},
        subscribe:function(p,cb){S.rt.push(cb);return function(){}}
      };
    })()
  };
})();`;

module.exports = { FAKE };
if (require.main === module) (async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } }); await ctx.addInitScript(() => { try { localStorage.setItem('qa-shell', 'off'); } catch (e) {} });   // these suites drive the classic home
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push('[console] ' + m.text()); });
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
  const S = (expr, arg) => page.evaluate(expr, arg);
  async function until(fn, arg, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn, arg)) return true; await page.waitForTimeout(150); } return false; }

  await page.goto('http://localhost:8911/' + (process.argv[2] || '') + 'index.html?mode=online', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok(await S(() => !!window.__ONLINE && localStorage.getItem('qc-mode') === 'online'), 'online shell loaded and mode remembered');
  ok(await S(() => !!document.querySelector('.qo-pill')), 'status pill shown (single project auto-selected)');
  ok(/Tower A/.test(await page.textContent('.qo-pill')), 'pill shows project name');

  console.log('\n[create + photo + sync]');
  await page.click('button.qh-tile.primary'); await page.click('#qh-sheet [data-form="qc-inspection"]'); await page.waitForTimeout(600);
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
