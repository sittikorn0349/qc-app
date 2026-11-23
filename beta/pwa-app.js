/* New UX shell — canvas "QC App · UX ใหม่ (แบบ Discord)".
   company › projects (rail) › channels (sidebar) › feed / check-item thread (main) › reports (aside).
   It sits over the existing form engine (index.html + pwa-home.js): opening a report hands over to the
   engine; coming back shows the shell again. Data: window.__qcWS (online, Supabase 006) or the local
   fallback below (offline mode: this device only, no server). */
(function(){
  'use strict';
  if(window.__qcApp)return;
  try{if(localStorage.getItem('qa-shell')==='off')return}catch(e){}   /* “ใช้หน้าแรกแบบเดิม” in settings */
  var U=window.QCU,$=U.$,el=U.el;
  var ONLINE=!!window.__ONLINE;

  /* ---------- icons (stroke, aria-hidden) ---------- */
  var IP={
    home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
    list:'<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',bell:'<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',back:'<path d="M15 5l-7 7 7 7"/>',chev:'<path d="M9 5l7 7-7 7"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',send:'<path d="M4 12l16-8-6 16-2-7z"/>',camera:'<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>',
    doc:'<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',cal:'<rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',cloud:'<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.6 1.5A3.5 3.5 0 0 0 7 18z"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    people:'<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.5c3 0 6 1.5 6 4.5"/>',
    shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',plan:'<path d="M4 6h10M4 12h16M4 18h7"/><path d="M18 4v4M14 16v4"/>',
    pin:'<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',share:'<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
    building:'<path d="M4 21V5l8-2v18M12 9h8v12M8 8v.01M8 12v.01M8 16v.01M16 13v.01M16 17v.01"/>',out:'<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 1.5-2.5 2-2.5 3.5M12 17v.01"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
    lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',check:'<path d="M5 12l5 5 9-10"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',
    warn:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',flag:'<path d="M5 21V4h11l-2 4 2 4H5"/>',drawing:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M9 9v11"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',zip:'<path d="M7 3h10v18H7z"/><path d="M12 3v2M12 7v2M12 11v2"/><rect x="10.5" y="14" width="3" height="4"/>',
    chat:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    refresh:'<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 21v-5h-5"/>',
    key:'<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',card:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',hist:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>'
  };
  function ic(n,s){var w=s||22,d=document.createElement('span');d.style.display='inline-flex';
    d.innerHTML='<svg width="'+w+'" height="'+w+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(IP[n]||'')+'</svg>';return d.firstChild}

  /* ---------- small helpers ---------- */
  function txt(s){return document.createTextNode(s==null?'':String(s))}
  function today(){return QCU.today()}
  function ini(name){name=String(name||'?').replace(/^(คุณ|นาย|นาง|น\.ส\.)\s*/,'').trim();var p=name.split(/\s+/);return (p.length>1?p[0][0]+p[1][0]:name.slice(0,2)).toUpperCase()}
  var COLORS=['#2B6CB0','#2F7D6B','#8A5A00','#7A2E8E','#B42318','#1F5FA8','#4A2F86','#0E7C66'];
  function colorOf(s){var h=0;s=String(s||'');for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))|0;return COLORS[Math.abs(h)%COLORS.length]}
  function fmtTime(iso){var d=new Date(iso);if(isNaN(d))return '';return d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}
  function fmtDay(iso){var d=new Date(iso);if(isNaN(d))return '';var t=new Date();var y=new Date(Date.now()-864e5);
    if(d.toDateString()===t.toDateString())return 'วันนี้';if(d.toDateString()===y.toDateString())return 'เมื่อวาน';
    return d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})}
  function fmtDate(iso){if(!iso)return '';var d=new Date(iso);return isNaN(d)?iso:d.toLocaleDateString('th-TH',{day:'numeric',month:'short'})}
  function lsJ(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
  function lsSJ(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  function uid(p){return (p||'')+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
  function flash(msg){var t=$('#qa-flash');if(!t)return;t.textContent=msg;t.hidden=false;clearTimeout(flash.t);flash.t=setTimeout(function(){t.hidden=true},3500)}

  /* ---------- offline fallback: the same calls, answered from this device ---------- */
  var BUILTIN=[
    {id:'owner',name:'เจ้าของ',color:'#7A2E8E',position:100,base:'pm',perms:['*'],builtin:true},
    {id:'admin',name:'แอดมิน',color:'#B42318',position:90,base:'pm',perms:['*'],builtin:true},
    {id:'pm',name:'PM',color:'#1F5FA8',position:80,base:'pm',perms:['ins_view','ins_create','ins_edit_own','ins_recheck','ins_assign','ins_approve','ch_manage','ch_post','mem_manage','dw_upload','pl_edit','pl_baseline','pl_assign','req_create','req_answer'],builtin:true},
    {id:'qc',name:'วิศวกร QC',color:'#0E7C66',position:70,base:'foreman',perms:['ins_view','ins_create','ins_edit_own','ins_recheck','ins_assign','ch_post','dw_upload','req_answer'],builtin:true},
    {id:'foreman',name:'โฟร์แมน',color:'#B26B00',position:60,base:'foreman',perms:['ins_view','ins_create','ins_edit_own','ch_post','req_create','pl_progress'],builtin:true},
    {id:'headman',name:'เฮดแมน / ช่าง',color:'#8A5A00',position:50,base:'headman',perms:['ins_view','ins_fix','ch_post','pl_progress'],builtin:true},
    {id:'sub',name:'ผู้รับเหมาช่วง',color:'#5A6B7F',position:40,base:'headman',perms:['ins_view','ins_fix','ch_post'],builtin:true},
    {id:'owner_rep',name:'ผู้แทนเจ้าของงาน',color:'#4A2F86',position:30,base:'viewer',perms:['ins_view','ins_approve','ch_post'],builtin:true},
    {id:'everyone',name:'@ทุกคน',color:'#98A2B3',position:0,base:'viewer',perms:['ins_view'],builtin:true}];
  function zonesOf(name,docs){
    var z=lsJ('qc-zones:'+name,null);if(Array.isArray(z)&&z.length)return z.slice();
    var seen={};(docs||[]).forEach(function(d){(d.data.items||[]).forEach(function(it){var m=/^(.+?) · /.exec(it.loc||'');if(m)seen[m[1].trim()]=1})});
    return Object.keys(seen).sort(function(a,b){return a.localeCompare(b,'th',{numeric:true})});
  }
  function LocalWS(){
    var P='qc-loc-',ls_=[];
    function all(){return window.__qcDocs?window.__qcDocs():[]}
    function pname(d){return (((d||{}).meta||{}).project||'').trim()||'ไม่ระบุโครงการ'}
    function pid(n){return 'L:'+n}
    function nameOfPid(p){return String(p||'').slice(2)}
    var api={
      local:true,available:function(){return false},
      me:function(){return {id:'me',name:localStorage.getItem('qc-inspector')||'ฉัน',email:'',org_role:'admin'}},
      projects:function(){var n={};all().forEach(function(d){n[pname(d.data)]=1});lsJ(P+'projects',[]).forEach(function(x){n[x]=1});
        var docs=all();return Object.keys(n).sort().map(function(x){return {id:pid(x),name:x,site:'',role:'pm',zones:zonesOf(x,docs.filter(function(d){return pname(d.data)===x}))}})},
      project:function(){var c=lsJ(P+'cur',null),ps=api.projects();return (ps.filter(function(x){return x.id===c})[0]||ps[0]||{}).id||null},
      switchProject:function(id){lsSJ(P+'cur',id);reloadAll()},
      docs:function(){var c=api.project();return all().filter(function(d){return pid(pname(d.data))===c})},
      company:function(){return Promise.resolve({name:'เครื่องนี้',plan:'local',seats:1,members:1,joined:true,is_admin:true,standards:lsJ(P+'std',['รายการประกอบแบบของโครงการ','มยผ.','วสท.'])})},
      companyCode:function(){return Promise.resolve(null)},
      people:function(){return Promise.resolve([])},projectPeople:function(){return Promise.resolve([])},
      perms:function(){return Promise.resolve({perms:['*'],roles:['owner'],top:1000})},
      roles:function(){return Promise.resolve(lsJ(P+'roles',BUILTIN))},
      saveRole:function(r){var rs=lsJ(P+'roles',BUILTIN).filter(function(x){return x.id!==r.id});r.id=r.id||uid('rl_');rs.push(r);rs.sort(function(a,b){return b.position-a.position});lsSJ(P+'roles',rs);return Promise.resolve([r])},
      deleteRole:function(id){lsSJ(P+'roles',lsJ(P+'roles',BUILTIN).filter(function(x){return x.id!==id||x.builtin}));return Promise.resolve()},
      channels:function(p){var n=nameOfPid(p||api.project()),z=zonesOf(n,api.docs()),meta=lsJ(P+'chmeta:'+n,{});
        var out=[{id:'L:'+n+'::ann',project_id:p,name:'ประกาศ',category:'ทั่วไป',kind:'announce',position:-1}];
        z.forEach(function(x,i){var m=meta[x]||{};out.push({id:'L:'+n+'::'+x,project_id:p,name:x,category:m.category||'โซนงาน',kind:'zone',hold:m.hold||null,standard_ref:m.ref||'',position:i})});
        return Promise.resolve(out)},
      saveChannel:function(r){var n=nameOfPid(api.project()),z=zonesOf(n,api.docs());
        if(r.name&&z.indexOf(r.name)<0){z.push(r.name);localStorage.setItem('qc-zones:'+n,JSON.stringify(z))}
        var meta=lsJ(P+'chmeta:'+n,{});meta[r.name]={category:r.category||'โซนงาน',hold:r.hold||null,ref:r.standard_ref||''};lsSJ(P+'chmeta:'+n,meta);
        return Promise.resolve([Object.assign({id:'L:'+n+'::'+r.name},r)])},
      access:function(){return Promise.resolve([])},setAccess:function(){return Promise.resolve()},
      unread:function(){return Promise.resolve([])},markRead:function(){return Promise.resolve()},
      messages:function(f){return Promise.resolve(lsJ(P+'msgs',[]).filter(function(m){return f.item?m.item_id===f.item:(m.channel_id===f.channel&&!m.item_id)}))},
      post:function(m){var row={client_id:uid('lm_'),author:'me',channel_id:m.channel_id,item_id:m.item_id||null,inspection_id:m.inspection_id||null,body:m.body||'',photos:m.files||[],created_at:new Date().toISOString(),local:true};
        var a=lsJ(P+'msgs',[]);a.push(row);lsSJ(P+'msgs',a.slice(-2000));ls_.forEach(function(f){f()});return row},
      retry:function(){},drop:function(){},pendingMessages:function(){return 0},onMessages:function(f){ls_.push(f)},
      search:function(t){return Promise.resolve(lsJ(P+'msgs',[]).filter(function(m){return (m.body||'').indexOf(t)>=0}).slice(0,50))},
      replies:function(ch){var n={};lsJ(P+'msgs',[]).forEach(function(m){if(m.item_id&&m.channel_id===ch)n[m.item_id]=(n[m.item_id]||0)+1});return Promise.resolve(n)},
      itemEvents:function(){return Promise.resolve([])},
      plan:function(p){return Promise.resolve(lsJ(P+'plan:'+(p||api.project()),[]))},
      savePlanTask:function(r){var k=P+'plan:'+api.project(),a=lsJ(k,[]);r=Object.assign({id:uid('pt_'),pct:0,dur:1,weight:0,preds:[],position:a.length},r);
        a=a.filter(function(x){return x.id!==r.id});a.push(r);a.sort(function(x,y){return x.position-y.position});lsSJ(k,a);return Promise.resolve([r])},
      deletePlanTask:function(id){var k=P+'plan:'+api.project();lsSJ(k,lsJ(k,[]).filter(function(x){return x.id!==id}));return Promise.resolve()},
      baselines:function(p){return Promise.resolve(lsJ(P+'bl:'+(p||api.project()),[]))},
      approveBaseline:function(){var p=api.project(),a=lsJ(P+'bl:'+p,[]);a.unshift({id:a.length+1,approved_by:'me',approved_at:new Date().toISOString(),snapshot:lsJ(P+'plan:'+p,[])});lsSJ(P+'bl:'+p,a.slice(0,5));return Promise.resolve(a[0].id)},
      commitments:function(){return Promise.resolve([])},assign:function(){return Promise.reject(new Error('การมอบงานในแผนใช้ได้ในโหมดออนไลน์'))},
      answer:function(){return Promise.reject(new Error('ใช้ได้ในโหมดออนไลน์'))},
      setProject:function(patch){var p=api.project();var o=lsJ(P+'proj:'+p,{});lsSJ(P+'proj:'+p,Object.assign(o,patch));return Promise.resolve()},
      projectSettings:function(){return lsJ(P+'proj:'+api.project(),{})},
      share:function(){return Promise.reject(new Error('ลิงก์ให้คนนอกใช้ได้ในโหมดออนไลน์ · ใช้ “ไฟล์ ZIP” หรือ “บันทึก PDF” แทน'))},
      photoUrl:function(id){return window.__qcUrl?window.__qcUrl(id):''},
      subscribe:function(){return function(){}},
      nameOf:function(u){return u==='me'?'คุณ':'สมาชิก'},members:function(){return []},
      createProject:function(name){var a=lsJ(P+'projects',[]);if(a.indexOf(name)<0)a.push(name);lsSJ(P+'projects',a);return Promise.resolve({id:pid(name)})},
      addMember:function(){return Promise.reject(new Error('เพิ่มคนเข้าโครงการได้ในโหมดออนไลน์'))}
    };
    return api;
  }
  var W=null;

  /* ---------- model: items, zones, status ---------- */
  var TODAY=today();
  function statusOf(it){
    var res=it.res||'';
    if(res==='ok')return {k:'ok',label:'ผ่าน',cls:'qa-p-ok',open:false};
    if(res!=='fix'&&res!=='bad')return {k:'none',label:'ยังไม่ลงผล',cls:'qa-p-mu',open:false};
    if(it.rres==='ok')return {k:'closed',label:'ปิดงาน',cls:'qa-p-ok',open:false};
    var late=!!(it.due&&it.due<TODAY);
    if(it.st==='fixed'||(!ONLINE&&(it.after||[]).length&&!it.rres))return {k:'re',label:'รอตรวจซ้ำ',cls:'qa-p-re',open:true,late:false};
    if(it.rres==='bad')return {k:'again',label:'ตรวจซ้ำไม่ผ่าน',cls:'qa-p-bad',open:true,late:late};
    if(late)return {k:'late',label:'เลยกำหนด',cls:'qa-p-bad',open:true,late:true};
    if(it.asg)return {k:'asg',label:'ค้างแก้',cls:'qa-p-fix',open:true};
    return {k:res,label:res==='bad'?'ไม่ผ่าน':'ต้องแก้ไข',cls:res==='bad'?'qa-p-bad':'qa-p-fix',open:true,unassigned:true};
  }
  function zoneOf(loc,zones){
    loc=String(loc||'').trim();var best='';
    zones.forEach(function(z){if((loc===z||loc.indexOf(z+' · ')===0||loc.indexOf(z+' ')===0)&&z.length>best.length)best=z});
    return best;
  }
  function locRest(loc,zone){loc=String(loc||'');return zone&&loc.indexOf(zone)===0?loc.slice(zone.length).replace(/^\s*·\s*/,'').trim():loc}
  function docTitle(d){var m=d.meta||{};return [m.docno,m.work].filter(Boolean).join(' · ')||'รายงานตรวจงาน'}
  function itemTitle(it){return (it.chk||'').trim().split('\n')[0]||(it.note||'').trim().split('\n')[0]||locRest(it.loc,zoneOf(it.loc,M.zones||[]))||'(ยังไม่มีข้อความ)'}
  function isMine(d){return !d.shared}
  /* everything the shell shows comes from here, recomputed on change */
  var M={docs:[],items:[],byChannel:{},channels:[],zones:[],unread:{},perms:[],roles:[],people:[],company:null,plan:[],me:null,project:null,projects:[]};
  function can(p){var P=M.preview?M.preview.perms:M.perms;return P.indexOf('*')>=0||P.indexOf(p)>=0}
  function rebuild(){
    M.me=W.me();M.projects=W.projects();M.project=W.project();
    M.docs=(W.docs()||[]).filter(function(d){return d&&d.data&&!d.data.deletedAt&&d.data.kind!=='folder'});
    var zoneCh=M.channels.filter(function(c){return c.kind==='zone'}),zones=zoneCh.map(function(c){return c.name});M.zones=zones;
    var byName={};zoneCh.forEach(function(c){byName[c.name]=c.id});
    M.items=[];M.byChannel={};
    M.docs.forEach(function(d){
      var chs={};
      (d.data.items||[]).forEach(function(it){
        if(!it.res&&!String(it.loc||'').trim()&&!String(it.chk||'').trim()&&!String(it.note||'').trim()&&!(it.before||[]).length)return;   /* blank row of a new form */
        var z=zoneOf(it.loc,zones),ch=byName[z]||'__nozone';chs[ch]=1;
        M.items.push({doc:d,it:it,zone:z,ch:ch,st:statusOf(it)});
      });
      if(!Object.keys(chs).length&&!(d.data.items||[]).some(function(it){return it.res||String(it.loc||'').trim()}))chs[zoneOfDoc(d)||'__nozone']=1;
      Object.keys(chs).forEach(function(c){(M.byChannel[c]=M.byChannel[c]||[]).push(d)});
    });
  }
  function zoneOfDoc(d){var z=String((d.data.meta||{}).zone||'').trim(),c=z&&M.channels.filter(function(c){return c.kind==='zone'&&c.name===z})[0];return c?c.id:null}
  function itemsIn(ch){return M.items.filter(function(x){return x.ch===ch})}
  function findItem(docId,itemId){return M.items.filter(function(x){return x.doc.id===docId&&x.it.id===itemId})[0]||null}
  function chById(id){return M.channels.filter(function(c){return c.id===id})[0]||(id==='__nozone'?{id:'__nozone',name:'ไม่ระบุโซน',kind:'zone',virtual:true}:null)}
  function myId(){return M.me&&M.me.id}
  function tasks(){
    var me=myId(),o={req:[],mine:[],re:[],late:[],none:[],fix:[]};
    M.items.forEach(function(x){
      if(!x.st.open)return;
      var own=isMine(x.doc);
      if(own&&x.st.k==='re')o.re.push(x);
      if(x.st.late&&(own||x.it.asg===me))o.late.push(x);
      if(own&&x.st.unassigned)o.none.push(x);
      if(own&&x.it.asg&&x.st.k!=='re')o.mine.push(x);
      if(x.it.asg===me&&x.st.k!=='re')o.fix.push(x);
    });
    if(ONLINE&&window.__qcOnline&&window.__qcOnline.requests)o.req=(window.__qcOnline.requests()||[]).filter(function(r){return ['done','passed','failed','cancelled'].indexOf(r.status)<0&&(r.inspector_id===me||r.requested_by===me)});
    return o;
  }

  /* ---------- layout ---------- */
  var root,railEl,sideEl,mainEl,asideEl,navEl,route={name:'home',args:[]},sticky={},addingCh=false;
  function go(h){if(location.hash===h)render();else location.hash=h}
  function parse(){
    var h=(location.hash||'').replace(/^#\/?/,''),p=h.split('/').map(decodeURIComponent);
    return {name:p[0]||'home',args:p.slice(1)};
  }
  function pjColor(p){return colorOf(p.id)}
  function pjIni(p){var n=String(p.name||'?').trim();var m=/[A-Za-z0-9]/.test(n[0])?n.replace(/[^A-Za-z0-9 ]/g,'').split(/\s+/).map(function(w){return w[0]}).join('').slice(0,2):n.slice(0,2);return (m||'P').toUpperCase()}
  function unreadOf(ch){return M.unread[ch]||0}
  function badge(n){return n?el('span',{class:'qa-badge','aria-hidden':'true'},String(n>99?'99+':n)):null}

  function renderRail(){
    railEl.textContent='';
    var co=el('button',{type:'button',class:'qa-co','aria-label':'บริษัท '+((M.company&&M.company.name)||'')},ini((M.company&&M.company.name)||'QC'));
    co.addEventListener('click',function(){go('#/company')});
    railEl.append(co,el('div',{class:'qa-sep'}));
    M.projects.forEach(function(p){
      var on=p.id===M.project,b=el('button',{type:'button',class:'qa-pj'+(on?' on':''),style:'background:'+pjColor(p),'aria-label':'โครงการ '+p.name+(on?' (เปิดอยู่)':''),'aria-current':on?'true':null,title:p.name},pjIni(p));
      b.addEventListener('click',function(){if(!on){W.switchProject(p.id)}else go('#/')});
      railEl.appendChild(b);
    });
    if(can('*')||!ONLINE||(M.me&&M.me.org_role==='admin')){
      var add=el('button',{type:'button',class:'qa-add','aria-label':'สร้างโครงการใหม่'},ic('plus'));
      add.addEventListener('click',function(){go('#/newproject')});railEl.appendChild(add);
    }
  }
  function syncLine(){
    if(!ONLINE)return 'เก็บในเครื่องนี้ · ใช้ได้แม้ไม่มีเน็ต';
    var s=window.__qcSync?window.__qcSync():null;if(!s)return '';
    var q=W.pendingMessages?W.pendingMessages():0,n=(s.pending||0)+q;
    return s.state==='offline'?'ไม่มีสัญญาณ · รอส่ง '+n:s.state==='auth'?'ต้องเข้าสู่ระบบใหม่ · งานไม่หาย':s.state==='error'?'ส่งไม่สำเร็จ · จะลองใหม่เอง':n?'กำลังส่ง '+n+' รายการ':'ส่งให้ทีมแล้ว';
  }
  function renderSide(){
    sideEl.textContent='';
    var p=M.projects.filter(function(x){return x.id===M.project})[0];
    var hd=el('header',{class:'qa-hd'});
    var tt=el('div',{class:'qa-tt'},el('h1',null,p?p.name:'ยังไม่มีโครงการ'),el('div',{class:'qa-sub',id:'qa-sync'},(ONLINE&&M.company&&M.company.name?M.company.name+' · ':'')+syncLine()));
    var sr=el('a',{class:'qa-ib',href:'#/search','aria-label':'ค้นหาในโครงการนี้'},ic('search'));
    hd.append(tt,sr);sideEl.appendChild(hd);
    var sc=el('div',{class:'qa-scroll'}),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);sideEl.appendChild(sc);
    if(!p){
      pad.appendChild(el('p',{class:'qa-empty'},ONLINE?'ยังไม่มีโครงการให้ตรวจ · ขอให้ PM หรือผู้ดูแลเพิ่มคุณเข้าโครงการ แล้วโครงการจะขึ้นที่นี่เอง':'ยังไม่มีโครงการ · กด “สร้างโครงการ” เพื่อเริ่ม'));
      if(!ONLINE)pad.appendChild(el('a',{class:'qa-btn pri',href:'#/newproject'},'สร้างโครงการ'));
      return;
    }
    var t=tasks(),mine=t.fix.length+t.re.length+t.req.length;
    var kp=el('div',{class:'qa-kpis'});
    [['งานของฉัน',mine,'var(--qa-tx)','#/tasks'],['รอตรวจซ้ำ',t.re.length,'var(--qa-blu)','#/tasks/re'],['เลยกำหนด',t.late.length,'var(--qa-red)','#/tasks/late']].forEach(function(k){
      kp.appendChild(el('a',{class:'qa-kpi',href:k[3]},el('b',{style:'color:'+k[2]},String(k[1])),el('span',null,k[0])));
    });
    pad.appendChild(kp);
    var chips=el('div',{class:'qa-chips'});
    [['ใบขอตรวจ','#/tasks/req'],['แบบล่าสุด','#/drawings'],['แผนงาน','#/plan'],['สมาชิก','#/members'],['ภาพรวม','#/overview']].forEach(function(c){chips.appendChild(el('a',{class:'qa-chip',href:c[1]},c[0]))});
    pad.appendChild(chips);
    /* channels, grouped by category */
    var groups={},order=[];
    M.channels.forEach(function(c){var g=c.kind==='announce'?'ทั่วไป':(c.category||'โซนงาน');if(!groups[g]){groups[g]=[];order.push(g)}groups[g].push(c)});
    if((M.byChannel['__nozone']||[]).length){if(!groups['ทั่วไป']){groups['ทั่วไป']=[];order.push('ทั่วไป')}groups['ทั่วไป'].push(chById('__nozone'))}
    order.sort(function(a,b){return (b==='ทั่วไป')-(a==='ทั่วไป')});
    if(!order.filter(function(g){return g!=='ทั่วไป'}).length&&can('ch_manage')){groups['โซนงาน']=[];order.push('โซนงาน')}
    var addG=order.filter(function(g){return g!=='ทั่วไป'})[0]||order[0];
    order.forEach(function(g,gi){
      var box=el('div',null);
      var sec=el('div',{class:'qa-sec'},el('span',null,g));
      if(g===addG&&can('ch_manage')){
        var ab=el('button',{type:'button',class:'qa-ib','aria-label':'เพิ่มชั้นหรือโซน','aria-expanded':addingCh?'true':'false'},ic('plus'));
        ab.addEventListener('click',function(){addingCh=!addingCh;renderSide()});sec.appendChild(ab);
      }
      box.appendChild(sec);
      if(g===addG&&addingCh)box.appendChild(addChannelForm(g));
      groups[g].forEach(function(c){box.appendChild(chRow(c))});
      pad.appendChild(box);
    });
    if(!M.channels.length&&!(M.byChannel['__nozone']||[]).length)pad.appendChild(el('p',{class:'qa-empty'},'ยังไม่ได้แบ่งชั้นหรือโซน · กด + เพื่อเพิ่ม เช่น ชั้น 1, ชั้น 2'));
    var me=M.me||{};
    var foot=el('a',{class:'qa-row',href:'#/me',style:'border-top:1px solid var(--qa-bd);background:var(--qa-side)'},el('span',{class:'qa-av',style:'background:'+colorOf(me.id)},ini(me.name)),
      el('span',{class:'qa-rt'},el('b',null,me.name||'ฉัน'),el('span',null,roleLine())),ic('gear',20));
    sideEl.appendChild(foot);
  }
  function roleLine(){var r=(M.myRoles||[]).map(function(id){var x=M.roles.filter(function(y){return y.id===id})[0];return x&&x.name}).filter(Boolean);return r.length?r.join(' · '):(ONLINE?'สมาชิก':'ใช้คนเดียวในเครื่องนี้')}
  function chRow(c){
    var n=unreadOf(c.id),on=(route.name==='c'&&route.args[0]===c.id)||(route.name==='cs'&&route.args[0]===c.id)||(route.name==='t'&&(function(){var x=findItem(route.args[0],route.args[1]);return x&&x.ch===c.id})()),cnt=itemsIn(c.id).filter(function(x){return x.st.open}).length;
    var a=el('a',{class:'qa-ch'+(n?' unread':'')+(on?' on':''),href:'#/c/'+encodeURIComponent(c.id),'aria-current':on?'page':null},
      el('span',{class:'h','aria-hidden':'true'},c.kind==='announce'?'!':'#'),el('span',{style:'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'},c.name));
    if(c.hold)a.appendChild(el('span',{class:'qa-tag '+c.hold,title:c.hold==='H'?'จุดหยุดตรวจ':'จุดเชิญตรวจ'},c.hold));
    if(cnt&&!n)a.appendChild(el('span',{class:'qa-pill qa-p-fix','aria-label':'ค้าง '+cnt},String(cnt)));
    if(n)a.appendChild(el('span',{class:'qa-badge','aria-label':'ยังไม่อ่าน '+n},String(n)));
    return a;
  }
  function addChannelForm(cat){
    var f=el('form',{class:'qa-card',style:'margin:0 4px 8px;padding:10px;display:flex;flex-direction:column;gap:8px'});
    var name=el('input',{placeholder:'เช่น ชั้น 4 หรือ ลานจอดรถ','aria-label':'ชื่อชั้นหรือโซน',style:'min-height:48px;padding:0 12px;border-radius:6px;border:1px solid #C9D2DC;font-size:16px'});
    var ok=el('button',{type:'submit',class:'qa-btn pri',style:'flex:1'},'เพิ่ม'),cn=el('button',{type:'button',class:'qa-btn'},'ยกเลิก');
    cn.addEventListener('click',function(){addingCh=false;renderSide()});
    f.addEventListener('submit',function(e){e.preventDefault();var v=name.value.trim();if(!v)return;
      ok.disabled=true;saveCh({name:v,category:cat==='ทั่วไป'?'โซนงาน':cat,kind:'zone',position:M.channels.length}).then(function(r){
        addingCh=false;syncZones(v);return reloadChannels().then(function(){var c=(r&&r[0])||M.channels.filter(function(x){return x.name===v})[0];if(c)go('#/c/'+encodeURIComponent(c.id));else render()})
      }).catch(function(e){ok.disabled=false;flash('เพิ่มไม่สำเร็จ: '+((e&&e.message)||''))})});
    f.append(name,el('div',{style:'display:flex;gap:8px'},ok,cn),el('span',{style:'font-size:12px;color:var(--qa-mu)'},'จะขึ้นเป็นตัวเลือกตอนกรอกตำแหน่งในรายงานด้วย'));
    setTimeout(function(){name.focus()},0);return f;
  }
  /* channel names are the project's zones: keep the location picker of the form in step */
  function syncZones(add){
    var p=M.projects.filter(function(x){return x.id===M.project})[0];if(!p)return;
    var z=M.channels.filter(function(c){return c.kind==='zone'}).map(function(c){return c.name});if(add&&z.indexOf(add)<0)z.push(add);
    try{localStorage.setItem('qc-zones:'+p.name,JSON.stringify(z))}catch(e){}
    if(ONLINE&&window.__qcOnline&&window.__qcOnline.saveZones&&can('ch_manage'))window.__qcOnline.saveZones(p.name,z).catch(function(){});
  }
  function renderNav(){
    navEl.textContent='';
    var t=tasks(),cur=route.name;
    function item(h,key,label,icon,n){var on=cur===key||(key==='home'&&(cur==='c'||cur==='t'));
      var a=el('a',{href:h,'aria-current':on?'page':null},el('span',{style:'position:relative;display:flex'},ic(icon,26),n?el('span',{class:'qa-badge'},String(n)):null),label);return a}
    var fab=el('button',{type:'button',class:'qa-fab','aria-label':'สร้างรายงาน'},ic('plus',26),el('span',null,'รายงาน'));
    fab.addEventListener('click',function(){newReport(route.name==='c'?route.args[0]:null)});
    navEl.append(item('#/','home','โครงการ','home'),item('#/tasks','tasks','งานของฉัน','list'),fab,
      item('#/noti','noti','แจ้งเตือน','bell',t.fix.length+t.re.length+t.req.length||0),item('#/me','me','ฉัน','user'));
  }

  /* ---------- router ---------- */
  var VIEWS={};
  function render(){
    if(!root||root.hidden)return;
    route=parse();
    try{rebuild()}catch(e){try{console.error(e)}catch(x){}}
    if(M.project!==M._chFor){M._chFor=M.project;reloadAll();}
    root.classList.toggle('qa-home',route.name==='home');
    renderRail();renderSide();renderNav();
    var v=VIEWS[route.name]||VIEWS.home;
    var keep=mainEl.scrollTop;
    mainEl.textContent='';asideEl.textContent='';asideEl.hidden=true;
    if(M.preview){var pb=el('div',{class:'qa-note warn',style:'margin:8px;display:flex;gap:8px;align-items:center'},el('span',{style:'flex:1'},'กำลังดูแอปในฐานะยศ “'+M.preview.name+'”'));
      var px=el('button',{type:'button',class:'qa-btn sm'},'กลับเป็นตัวเอง');px.addEventListener('click',function(){M.preview=null;render()});pb.appendChild(px);mainEl.appendChild(pb)}
    try{v.apply(null,route.args)}catch(e){mainEl.appendChild(el('p',{class:'qa-empty'},'แสดงหน้านี้ไม่สำเร็จ: '+(e&&e.message)));try{console.error(e)}catch(x){}}
    if(route.name===sticky.name&&route.args.join('/')===sticky.args)mainEl.scrollTop=keep;
    sticky={name:route.name,args:route.args.join('/')};
  }
  function header(title,sub,opts){
    opts=opts||{};
    var hd=el('header',{class:'qa-hd'+(opts.navy?' qa-navy':'')});
    var back=el('a',{class:'qa-ib qa-back',href:opts.back||'#/','aria-label':'กลับ'},ic('back',24));
    if(opts.navy)back.style.color='#fff';
    hd.append(back,el('div',{class:'qa-tt'},el('h2',null,title),sub?el('div',{class:'qa-sub'},sub):null));
    (opts.right||[]).forEach(function(r){if(r)hd.appendChild(r)});
    return hd;
  }
  function scroller(){var s=el('div',{class:'qa-scroll'});return s}

  /* ---------- engine hand-off: open / create reports ---------- */
  var pendingZone=null,lastFormId=null,backTo='#/';
  function openDoc(docId,itemId,opts){
    var A=window.__qcActions;if(!A)return;
    backTo=location.hash||'#/';
    var p=docId===((window.__qcForm&&window.__qcForm.cur&&window.__qcForm.cur())||'')?Promise.resolve(true):A.openRecord(docId);
    return Promise.resolve(p).then(function(){
      setBackLabel();window.__qcHome.go('form');
      setTimeout(function(){
        var n=itemId&&document.querySelector('#items .item[data-id="'+itemId+'"]');
        if(n){n.scrollIntoView({block:'center'});n.classList.add('qa-hl');setTimeout(function(){n.classList.remove('qa-hl')},2500)}
        if(opts&&opts.plan&&window.__qcPlan)window.__qcPlan.open(itemId||null);
      },350);
    });
  }
  function newReport(chId){
    var c=chId&&chById(chId);pendingZone=c&&c.kind==='zone'&&!c.virtual?c.name:null;backTo=location.hash||'#/';
    lastFormId=window.__qcForm&&window.__qcForm.cur&&window.__qcForm.cur();
    setBackLabel();
    if(window.__qcHome&&window.__qcHome.picker)window.__qcHome.picker();
  }
  /* after a new report opens from a channel: its first location starts with the channel's zone */
  function fillZone(){
    if(!pendingZone)return;
    var id=window.__qcForm&&window.__qcForm.cur&&window.__qcForm.cur();if(!id||id===lastFormId)return;
    var z=pendingZone;pendingZone=null;
    setTimeout(function(){
      var proj=M.projects.filter(function(x){return x.id===M.project})[0],pf=document.getElementById('m-project');
      if(proj&&pf&&!pf.value){pf.value=proj.name;pf.dispatchEvent(new Event('input',{bubbles:true}))}
      var t=document.querySelector('#items .item textarea[aria-label="ตำแหน่ง"]');
      if(t&&!t.value.trim()){t.value=z+' · ';t.dispatchEvent(new Event('input',{bubbles:true}))}
    },250);
  }
  var backBar=null;
  function setBackLabel(){
    if(!backBar)return;var h=backTo,lbl='กลับ';
    var m=/^#\/c\/(.+)$/.exec(h),c=m&&chById(decodeURIComponent(m[1]));
    if(c)lbl='กลับไป #'+c.name;else if(/^#\/t\//.test(h))lbl='กลับไปแชทจุดตรวจ';else if(/^#\/tasks/.test(h))lbl='กลับไปงานของฉัน';else lbl='กลับไปหน้าโครงการ';
    backBar.querySelector('button').lastChild.textContent=lbl;
  }

  /* ---------- views: project home (phone shows the sidebar) ---------- */
  VIEWS.home=function(){
    var first=M.channels.filter(function(c){return c.kind==='zone'})[0];
    if(window.innerWidth>=900&&first){location.replace('#/c/'+encodeURIComponent(first.id));return}
    mainEl.appendChild(el('p',{class:'qa-empty'},'เลือกชั้นหรือโซนเพื่อดูรายงานและคุยกับทีม'));
  };

  /* ---------- view: channel feed (M2 / desktop Main) ---------- */
  function photoImg(id,alt){var u=W.photoUrl?W.photoUrl(id):'';var i=el('img',{src:u||'',alt:alt||'รูป',loading:'lazy'});return i}
  function avatar(uidv,name){return el('span',{class:'qa-av',style:'background:'+colorOf(uidv),'aria-hidden':'true'},ini(name))}
  function msgView(m){
    var me=m.author===myId()||m.author==='me',who=me?'คุณ':W.nameOf(m.author);
    var box=el('div',{class:'qa-msg'+(me?' me':'')});
    var b=el('div',{class:'qa-bub'},el('div',{class:'who'},el('b',null,who),txt(' · '+fmtTime(m.created_at))));
    if(m.body)b.appendChild(el('div',{class:'txt'},m.body));
    if((m.photos||[]).length){var ph=el('div',{class:'qa-photos'});m.photos.forEach(function(p){ph.appendChild(photoImg(p,'รูปในข้อความ'))});b.appendChild(ph)}
    if(m.pending||m.failed||m.local){
      var st=el('div',{class:'st'+(m.failed?' fail':'')},m.failed?'ส่งไม่สำเร็จ: '+m.failed:m.local?'บันทึกในเครื่องนี้':'รอส่ง · จะส่งเองเมื่อมีสัญญาณ');
      if(m.failed){var r=el('button',{type:'button',class:'qa-btn sm'},'ลองใหม่');r.addEventListener('click',function(){W.retry(m.client_id);refresh()});st.appendChild(r)}
      b.appendChild(st);
    }else if(me)b.appendChild(el('div',{class:'st'},'✓ ถึงระบบ'));
    box.append(avatar(m.author,who),b);return box;
  }
  function repCard(d,chId){
    var data=d.data,its=(data.items||[]).filter(function(it){var x=findItem(d.id,it.id);return !chId||!x||x.ch===chId});
    var open=its.filter(function(it){return statusOf(it).open}).length;
    var card=el('div',{class:'qa-rep'});
    var h=el('div',{class:'h'},ic('doc',18),el('b',null,docTitle(data)),txt(' · '+(d.shared?W.nameOf(d.owner||data._owner):'คุณ')+' · '+fmtDay(data.updatedAt||data.createdAt)));
    card.appendChild(h);
    var list=el('div',{class:'its'});
    its.slice(0,6).forEach(function(it){var st=statusOf(it);
      var b=el('button',{type:'button',class:'qa-it'},el('span',{class:'qa-pill '+st.cls},st.label),el('span',{class:'tx'},(function(){var t=itemTitle(it),r=locRest(it.loc,zoneOf(it.loc,M.zones));return t+(r&&r!==t?' · '+r:'')})()));
      b.addEventListener('click',function(){go('#/t/'+encodeURIComponent(d.id)+'/'+encodeURIComponent(it.id))});list.appendChild(b)});
    if(its.length>6)list.appendChild(el('span',{style:'font-size:13px;color:var(--qa-mu)'},'และอีก '+(its.length-6)+' รายการ'));
    card.appendChild(list);
    var act=el('div',{style:'display:flex;gap:8px;flex-wrap:wrap'});
    var o=el('button',{type:'button',class:'qa-btn sm'},'เปิดรายงาน'+(open?' · ค้าง '+open:''));o.addEventListener('click',function(){openDoc(d.id)});act.appendChild(o);
    var sh=el('button',{type:'button',class:'qa-btn sm'},ic('share',16),ONLINE?'ส่งลิงก์ให้คนนอก':'ส่ง PDF / ZIP');sh.addEventListener('click',function(){shareSheet(d)});act.appendChild(sh);
    card.appendChild(act);
    return card;
  }
  /* external share (D-Share): PDF of the report on a link that expires; the chooser picks 1 / 7 / 30 days */
  function loadDoc(id){var A=window.__qcActions,cur=window.__qcForm&&window.__qcForm.cur&&window.__qcForm.cur();return cur===id?Promise.resolve(true):Promise.resolve(A.openRecord(id))}
  function shareSheet(d){
    sheet('ส่ง '+docTitle(d.data)+' ให้คนนอก',function(box,close){
      if(!ONLINE){
        box.appendChild(el('p',{style:'margin:0'},'โหมดออฟไลน์: ส่งเป็นไฟล์ (PDF หรือ ZIP) ผ่าน LINE / อีเมล · ลิงก์หมดอายุใช้ได้ในโหมดออนไลน์'));
        var f=el('button',{type:'button',class:'qa-btn pri big'},'เลือกวิธีส่ง');f.addEventListener('click',function(){loadDoc(d.id).then(function(){close();window.__qcHome.send()})});box.appendChild(f);return}
      var days=7,tri=el('div',{class:'qa-tri',role:'radiogroup','aria-label':'อายุลิงก์'});
      [[1,'1 วัน'],[7,'7 วัน'],[30,'30 วัน']].forEach(function(x){var b=el('button',{type:'button',role:'radio','aria-checked':x[0]===days?'true':'false'},x[1]);b.addEventListener('click',function(){days=x[0];tri.querySelectorAll('button').forEach(function(y){y.setAttribute('aria-checked',y===b?'true':'false')})});tri.appendChild(b)});
      box.append(el('p',{style:'margin:0;font-size:13px;color:var(--qa-mu)'},'คนนอก (ผู้ว่าจ้าง ผู้ควบคุมงาน) เปิดดู PDF ได้โดยไม่ต้องมีบัญชี · คนในโครงการเห็นผ่านแอปอยู่แล้ว'),el('div',{class:'qa-field'},el('span',null,'อายุลิงก์'),tri));
      var out=el('div',{style:'display:flex;flex-direction:column;gap:8px'});
      var go_=el('button',{type:'button',class:'qa-btn pri big'},'สร้างลิงก์');
      go_.addEventListener('click',function(){go_.disabled=true;go_.textContent='กำลังทำ PDF…';
        loadDoc(d.id).then(function(){return window.__qcActions.pdfBlob('full')}).then(function(b){return W.share(d.id,b,days)}).then(function(url){
          go_.hidden=true;var inp=el('input',{value:url,readonly:true,'aria-label':'ลิงก์','style':'min-height:48px;padding:0 10px;border-radius:8px;border:1px solid #C9D2DC'});
          var cp=el('button',{type:'button',class:'qa-btn pri'},'คัดลอกลิงก์');cp.addEventListener('click',function(){(navigator.clipboard?navigator.clipboard.writeText(url):Promise.reject()).then(function(){flash('คัดลอกแล้ว · หมดอายุใน '+days+' วัน')},function(){inp.select()})});
          out.append(inp,cp,el('span',{style:'font-size:12px;color:var(--qa-mu)'},'หมดอายุ '+fmtDate(new Date(Date.now()+days*864e5).toISOString())));
          if(navigator.share){var ns=el('button',{type:'button',class:'qa-btn'},'แชร์ผ่านแอปอื่น');ns.addEventListener('click',function(){navigator.share({title:docTitle(d.data),url:url}).catch(function(){})});out.appendChild(ns)}
        },function(e){go_.disabled=false;go_.textContent='สร้างลิงก์';flash('สร้างลิงก์ไม่สำเร็จ: '+((e&&e.message)||'ลองใหม่เมื่อมีสัญญาณ'))})});
      box.append(go_,out);
    });
  }
  function composer(opts){
    var wrap=el('div',null),files=[];
    var tray=el('div',{class:'qa-tray',hidden:true});
    var ta=el('textarea',{rows:'1','aria-label':opts.label||'พิมพ์ข้อความ',placeholder:opts.placeholder||'พิมพ์ข้อความ…'});
    var cam=el('label',{class:'qa-ib','aria-label':'แนบรูป',style:'cursor:pointer'},ic('camera',24));
    var fi=el('input',{type:'file',accept:'image/*',capture:'environment',hidden:true,multiple:true});cam.appendChild(fi);
    var send=el('button',{type:'button',class:'qa-send','aria-label':'ส่ง',disabled:true},ic('send',22));
    function upd(){send.disabled=!ta.value.trim()&&!files.length;ta.style.height='auto';ta.style.height=Math.min(140,ta.scrollHeight)+'px'}
    ta.addEventListener('input',upd);
    ta.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&window.innerWidth>=900){e.preventDefault();if(!send.disabled)send.click()}});
    fi.addEventListener('change',function(){
      var fs=[].slice.call(fi.files||[]);fi.value='';
      window.claude.use('assets').then(function(A){
        return Promise.all(fs.map(function(f){return shrink(f).then(function(b){return A.upload(b)}).then(function(r){files.push(r.id);var i=photoImg(r.id,'รูปที่จะส่ง');tray.appendChild(i);tray.hidden=false})}));
      }).then(upd,function(){flash('เก็บรูปไม่สำเร็จ (พื้นที่ในเครื่องเต็ม?)')});
    });
    send.addEventListener('click',function(){
      var body=ta.value.trim();if(!body&&!files.length)return;
      W.post({channel_id:opts.channel,item_id:opts.item||null,inspection_id:opts.doc||null,body:body,files:files.slice()});
      ta.value='';files=[];tray.textContent='';tray.hidden=true;upd();refresh();
    });
    var row=el('div',{class:'qa-comp'},cam,ta,send);
    wrap.append(tray,row);
    if(opts.note)wrap.insertBefore(el('div',{class:'qa-comp-note'},opts.note),row);
    return wrap;
  }
  function shrink(file){
    return new Promise(function(res){
      var img=new Image(),url=URL.createObjectURL(file);
      img.onload=function(){var m=1600,w=img.naturalWidth,h=img.naturalHeight,k=Math.min(1,m/Math.max(w,h));
        var c=document.createElement('canvas');c.width=Math.round(w*k);c.height=Math.round(h*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        URL.revokeObjectURL(url);c.toBlob(function(b){res(b||file)},'image/jpeg',0.82)};
      img.onerror=function(){URL.revokeObjectURL(url);res(file)};img.src=url;
    });
  }
  function canPost(c){if(!c||c.virtual||c.legacy)return false;if(c.kind==='announce')return can('ch_manage');return can('ch_post')||can('ins_create')}
  VIEWS.c=function(chId){
    var c=chById(chId);if(!c){mainEl.appendChild(el('p',{class:'qa-empty'},'ไม่พบโซนนี้ หรือคุณไม่มีสิทธิ์เห็น'));return}
    var docs=(M.byChannel[chId]||[]).slice().sort(function(a,b){return String(b.data.updatedAt||'').localeCompare(String(a.data.updatedAt||''))});
    var its=itemsIn(chId),open=its.filter(function(x){return x.st.open}).length;
    var right=[];
    if(can('ch_manage')&&!c.virtual)right.push(el('a',{class:'qa-ib',href:'#/cs/'+encodeURIComponent(chId),'aria-label':'ตั้งค่าโซนนี้'},ic('gear')));
    var nb=el('button',{type:'button',class:'qa-btn pri sm qa-mainnew',style:'margin-left:4px'},ic('plus',18),'รายงาน');nb.addEventListener('click',function(){newReport(chId)});
    if(can('ins_create')&&!c.virtual&&c.kind!=='announce')right.push(nb);
    mainEl.appendChild(header((c.kind==='announce'?'':'#')+c.name+(c.hold?' · '+c.hold:''),docs.length+' รายงาน · ค้าง '+open+(c.standard_ref?' · '+c.standard_ref:''),{right:right}));
    var sc=scroller(),feed=el('div',{class:'qa-feed',id:'qa-feed'});sc.appendChild(feed);mainEl.appendChild(sc);
    if(c.hold==='H'&&open)feed.appendChild(el('div',{class:'qa-note bad',role:'note'},el('b',null,'จุดหยุดตรวจ: '),txt('ยังมี '+open+' รายการที่ต้องแก้ · งานขั้นถัดไปในแผนงานยังเริ่มไม่ได้จนกว่าจะตรวจผ่าน')));
    var entries=docs.map(function(d){return {t:d.data.updatedAt||d.data.createdAt||'',d:d}});
    var drawn=false;
    function draw(msgs){
      feed.querySelectorAll('.qa-x').forEach(function(n){n.remove()});
      var all=entries.concat((msgs||[]).map(function(m){return {t:m.created_at,m:m}})).sort(function(a,b){return String(a.t).localeCompare(String(b.t))});
      var lastDay='';
      if(!all.length)feed.appendChild(el('p',{class:'qa-empty qa-x'},c.kind==='announce'?'ยังไม่มีประกาศ':'ยังไม่มีรายงานในโซนนี้ · กด “สร้างรายงาน” เพื่อเริ่มตรวจ หรือพิมพ์คุยกับทีมด้านล่าง'));
      all.forEach(function(e){var day=fmtDay(e.t);if(day!==lastDay){feed.appendChild(el('div',{class:'qa-day qa-x'},day));lastDay=day}
        var n=e.d?repCard(e.d,chId):msgView(e.m);n.classList.add('qa-x');feed.appendChild(n)});
      if(!drawn){sc.scrollTop=sc.scrollHeight;drawn=true}
    }
    draw([]);
    if(!c.virtual)W.messages({channel:chId}).then(function(ms){if(route.name==='c'&&route.args[0]===chId)draw(ms)}).catch(function(){});
    if(c.legacy)mainEl.appendChild(el('div',{class:'qa-note info',style:'margin:8px'},'ยังพิมพ์คุยในโครงการนี้ไม่ได้ (ผู้ดูแลระบบยังไม่เปิดใช้) · ตรวจงานและติดตามงานแก้ได้ตามปกติ'));
    if(canPost(c))mainEl.appendChild(composer({channel:chId,label:'ข้อความถึง #'+c.name,placeholder:'ข้อความถึง #'+c.name+'…',note:ONLINE?null:'โหมดออฟไลน์: ข้อความเก็บในเครื่องนี้เท่านั้น'}));
    else if(!c.virtual)mainEl.appendChild(el('div',{class:'qa-comp-note'},c.kind==='announce'?'เฉพาะ PM หรือผู้ดูแลที่ประกาศได้':'คุณดูได้ แต่ส่งข้อความในโซนนี้ไม่ได้'));
    if(M.unread[chId]){W.markRead(chId);M.unread[chId]=0}
    zonePanel(chId,null);
  };
  /* ---------- zone panel (desktop right column, canvas Main): every check item in the zone ---------- */
  function sigOf(x){var it=x.it;return [it.res,it.rres,it.st,it.asg,it.due,(it.after||[]).length,it.fnote||''].join('|')}
  function seenMap(){return lsJ('qa-seen:'+(myId()||''),{})}
  function isUnread(x){if(isMine(x.doc))return false;return seenMap()[x.doc.id+'/'+x.it.id]!==sigOf(x)}
  function markSeen(list){var m=seenMap();[].concat(list).forEach(function(x){m[x.doc.id+'/'+x.it.id]=sigOf(x)});lsSJ('qa-seen:'+(myId()||''),m)}
  var REP={};
  function zonePanel(chId,selKey){
    var c=chById(chId);if(!c)return;
    var its=itemsIn(chId).filter(function(x){return x.st.k!=='none'||(x.it.chk||x.it.note)});
    var rank=function(x){return x.st.open?(x.st.late?0:x.st.k==='re'?2:1):3};
    its.sort(function(a,b){return rank(a)-rank(b)||String(b.doc.data.updatedAt||'').localeCompare(String(a.doc.data.updatedAt||''))});
    asideEl.hidden=false;
    var flt=sticky.zf&&sticky.zfCh===chId?sticky.zf:'all',q=sticky.zfCh===chId&&sticky.zq||'';
    /* header: zone, what it covers, create report */
    var hd=el('header',{class:'qa-zh'});
    var top=el('div',{class:'qa-zh-top'},el('span',{class:'h','aria-hidden':'true'},c.kind==='announce'?'!':'#'),
      el('div',{class:'qa-tt'},el('h2',null,c.name),el('div',{class:'qa-sub'},[c.category&&c.category!=='โซนงาน'?c.category:'',c.standard_ref||'',its.length+' จุด'].filter(Boolean).join(' · '))));
    if(can('ins_create')&&!c.virtual&&c.kind!=='announce'){var nb=el('button',{type:'button',class:'qa-btn pri sm','aria-haspopup':'dialog'},ic('plus',18),'สร้างรายงาน');nb.addEventListener('click',function(){newReport(chId)});top.appendChild(nb)}
    hd.appendChild(top);
    var sl=el('label',{class:'qa-zs'},ic('search',16));var si=el('input',{type:'search','aria-label':'ค้นหาในโซนนี้',placeholder:'ค้นหาในโซนนี้ · Ctrl+K',value:q});sl.appendChild(si);hd.appendChild(sl);
    var unread=its.filter(isUnread);
    if(unread.length){var ur=el('div',{class:'qa-zu',role:'status'},el('span',{class:'d','aria-hidden':'true'}),el('span',{style:'flex:1'},'ยังไม่อ่าน '+unread.length+' รายการ'));
      var ra=el('button',{type:'button'},'อ่านทั้งหมดแล้ว');ra.addEventListener('click',function(){markSeen(unread);if(M.unread[chId]){W.markRead(chId);M.unread[chId]=0}render()});ur.appendChild(ra);hd.appendChild(ur)}
    var cats={};its.forEach(function(x){var k=(x.it.cat||'').trim();if(k)cats[k]=(cats[k]||0)+1});
    var F=[['all','ทั้งหมด',its.length],['fix','ต้องแก้',its.filter(function(x){return x.st.open&&x.st.k!=='re'}).length],['re','รอตรวจซ้ำ',its.filter(function(x){return x.st.k==='re'}).length],['late','เลยกำหนด',its.filter(function(x){return x.st.late}).length]]
      .concat(Object.keys(cats).sort(function(a,b){return cats[b]-cats[a]}).slice(0,6).map(function(k){return ['cat:'+k,k,null]}));
    var fr=el('div',{class:'qa-chips qa-zf',role:'group','aria-label':'กรองรายการ'});
    F.forEach(function(f){var b=el('button',{type:'button',class:'qa-chip'+(f[0]==='fix'?' fix':''),'aria-pressed':flt===f[0]?'true':'false'},f[1]+(f[2]!=null?' '+f[2]:''));
      b.addEventListener('click',function(){sticky.zf=f[0];sticky.zfCh=chId;render()});fr.appendChild(b)});
    hd.appendChild(fr);asideEl.appendChild(hd);
    var list=el('div',{class:'qa-scroll qa-zl'});asideEl.appendChild(list);
    var shown=its.filter(function(x){return flt==='all'||(flt==='fix'&&x.st.open&&x.st.k!=='re')||(flt==='re'&&x.st.k==='re')||(flt==='late'&&x.st.late)||(flt.indexOf('cat:')===0&&(x.it.cat||'').trim()===flt.slice(4))});
    var cards=shown.map(function(x){var n=postCard(x,selKey===x.doc.id+'/'+x.it.id);list.appendChild(n);return {n:n,t:(itemTitle(x.it)+' '+(x.it.loc||'')+' '+(x.it.cat||'')+' '+(x.it.note||'')).toLowerCase()}});
    var empty=el('p',{class:'qa-empty',hidden:true},'ไม่มีรายการที่ตรงกัน');list.appendChild(empty);
    function filt(){var v=si.value.trim().toLowerCase();sticky.zq=si.value;sticky.zfCh=chId;var k=0;cards.forEach(function(c_){var on=!v||c_.t.indexOf(v)>=0;c_.n.hidden=!on;if(on)k++});empty.hidden=k>0}
    si.addEventListener('input',filt);filt();
    if(!shown.length){empty.hidden=false;empty.textContent=its.length?'ไม่มีรายการในกลุ่มนี้':'ยังไม่มีจุดตรวจในโซนนี้ · กด “สร้างรายงาน” เพื่อเริ่มตรวจ'}
    var sel=list.querySelector('.qa-post.sel');if(sel)setTimeout(function(){sel.scrollIntoView({block:'nearest'})},0);
    if(!c.virtual&&W.replies)W.replies(chId).then(function(n){REP[chId]=n||{};list.querySelectorAll('.qa-post').forEach(function(p_){var k=p_.getAttribute('data-sid'),r=(n||{})[k]||0;var e=p_.querySelector('.rp');if(e)e.lastChild.textContent=String(r);var sy=p_.querySelector('.sy');if(sy)sy.hidden=!(n||{})['~'+k]})}).catch(function(){});
  }
  function postCard(x,sel){
    var it=x.it,un=isUnread(x),sid=sidOf(x.doc.id,it.id),rest=locRest(it.loc,x.zone);
    var a=el('a',{class:'qa-post'+(sel?' sel':'')+(un?' un':''),href:'#/t/'+encodeURIComponent(x.doc.id)+'/'+encodeURIComponent(it.id),'data-sid':sid,'aria-current':sel?'true':null,
      'aria-label':(un?'ยังไม่อ่าน · ':'')+x.st.label+' · '+itemTitle(it)+(rest?' · '+rest:'')});
    if(un)a.appendChild(el('span',{class:'qa-ud','aria-hidden':'true',title:'ยังไม่อ่าน'}));
    var th=el('div',{class:'qa-th'});var ph=(it.before||[])[0]||(it.after||[])[0];
    if(ph){var im=photoImg(ph,'');im.alt='';th.appendChild(im)}else th.appendChild(ic('camera',22));
    a.appendChild(th);
    var who=it.asg?W.nameOf(it.asg):(x.st.open?'ยังไม่มอบหมาย':(isMine(x.doc)?'คุณ':W.nameOf(x.doc.owner||x.doc.data._owner)));
    var due=it.due&&x.st.open?(x.st.late?'เลย '+fmtDate(it.due):'ครบ '+fmtDate(it.due)):'';
    var body=el('div',{class:'qa-pb'},
      el('div',{class:'l1'},el('span',{class:'qa-pill qa-p-'+stKey(x.st)},x.st.label),el('span',{class:'mu'},[it.cat||'',rest].filter(Boolean).join(' · ')||(x.doc.data.meta&&x.doc.data.meta.docno)||'')),
      el('b',null,itemTitle(it)),
      el('div',{class:'l3'},el('span',{class:'w'},(it.asg||!x.st.open)?el('span',{class:'qa-av xs',style:'background:'+colorOf(it.asg||x.doc.owner||myId()),'aria-hidden':'true'},ini(it.asg?who:(isMine(x.doc)?(M.me&&M.me.name):who))):null,txt(who)),
        due?el('span',{class:x.st.late?'late':''},due):null,
        el('span',{class:'rp','aria-label':'ข้อความ'},ic('chat',14),txt(String(((REP[x.ch]||{})[sid])||0))),
        el('span',{class:'sy',hidden:true},'รอส่ง')));
    a.appendChild(body);
    return a;
  }
  function stKey(st){return st.k==='ok'||st.k==='closed'?'ok':st.k==='re'?'re':(st.late||st.k==='bad'||st.k==='again')?'bad':st.k==='none'?'mu':'fix'}
  function stColor(st){return {ok:'var(--qa-grn)',re:'var(--qa-blu)',bad:'var(--qa-red)',fix:'var(--qa-ora)',mu:'var(--qa-mu)'}[stKey(st)]}
  function taskCard(x,extra){
    var c=stColor(x.st),b=el('a',{class:'qa-task',href:'#/t/'+encodeURIComponent(x.doc.id)+'/'+encodeURIComponent(x.it.id),style:'border-left-color:'+c});
    b.append(el('span',{class:'qa-pill qa-p-'+stKey(x.st)},x.st.label),el('b',null,itemTitle(x.it)),
      el('span',{class:'m'},el('span',null,(x.zone?'#'+x.zone:'ไม่ระบุโซน')+(function(){var r=locRest(x.it.loc,x.zone),t=itemTitle(x.it);return r&&r!==t?' · '+r:''})()+' · '+(x.doc.data.meta&&x.doc.data.meta.docno||'')+(x.it.asg?' · '+W.nameOf(x.it.asg):'')+(extra?' · '+extra:'')),el('span',null,x.it.due?(x.st.late?'เลย '+fmtDate(x.it.due):'ครบ '+fmtDate(x.it.due)):'')));
    return b;
  }

  /* ---------- view: check-item thread (M3): the item, its history and the team's chat ---------- */
  function evRow(color,who,what,at,extra){
    var r=el('div',{class:'qa-ev'},el('span',{class:'dot',style:'background:'+color}),el('div',{style:'flex:1;min-width:0'},el('b',null,who),txt(' '+what),at?el('span',{style:'margin-left:6px;font-size:12px'},fmtDay(at)+' '+fmtTime(at)):null));
    if(extra)r.lastChild.appendChild(extra);return r;
  }
  function photoRow(ids,label){if(!(ids||[]).length)return null;var p=el('div',{class:'qa-photos'},el('span',{class:'lbl'},label));ids.forEach(function(id){p.appendChild(photoImg(id,label))});return p}
  VIEWS.t=function(docId,itemId){
    var x=findItem(docId,itemId);
    if(!x){mainEl.appendChild(header('จุดตรวจ','',{back:'#/'}));mainEl.appendChild(el('p',{class:'qa-empty'},'ไม่พบรายการนี้ (อาจถูกลบ หรือยังส่งมาไม่ถึงเครื่องนี้)'));return}
    var it=x.it,d=x.doc,data=d.data,st=x.st,ch=chById(x.ch),me=myId(),own=isMine(d);
    markSeen(x);zonePanel(x.ch,d.id+'/'+it.id);
    mainEl.appendChild(header(itemTitle(it),(x.zone?'#'+x.zone+' · ':'')+docTitle(data),{back:'#/c/'+encodeURIComponent(x.ch)}));
    var sc=scroller(),feed=el('div',{class:'qa-feed'});sc.appendChild(feed);mainEl.appendChild(sc);
    /* the item card */
    var card=el('div',{class:'qa-card',style:'padding:14px;display:flex;flex-direction:column;gap:8px'});
    card.append(el('div',{style:'display:flex;gap:8px;align-items:center;flex-wrap:wrap'},el('span',{class:'qa-pill qa-p-'+stKey(st)},st.label),
      it.cat?el('span',{class:'qa-pill qa-p-mu'},it.cat):null,it.ref?el('span',{class:'qa-pill qa-p-pur'},'แบบ '+it.ref):null),
      el('b',{style:'font-size:17px'},itemTitle(it)),
      el('div',{style:'font-size:14px;color:var(--qa-mu)'},'ตำแหน่ง: '+(it.loc||'ไม่ระบุ')+(it.asg?' · ผู้แก้: '+W.nameOf(it.asg):'')+(it.due?' · ครบกำหนด '+fmtDate(it.due):'')));
    if(it.note)card.appendChild(el('div',{style:'white-space:pre-wrap'},it.note));
    /* where it is on the drawing (docs/PLAN-MARKING.md §6) */
    (function(){var P=data.plan,q=P&&(P.pins&&P.pins[it.id]||[]).filter(function(q){return P.sheets[q.s]})[0];if(!q)return;var sh=P.sheets[q.s];
      var box=el('button',{type:'button',class:'qa-mini','aria-label':'ดูตำแหน่งบนแบบ '+(sh.name||'')});
      var im=photoImg(sh.a,'แบบ '+(sh.name||''));var wrap=el('span',{class:'qa-mini-in',style:'aspect-ratio:'+(sh.w||4)+'/'+(sh.h||3)},im,el('span',{class:'qa-mini-pin st-'+stKey(st),style:'left:'+(q.x*100)+'%;top:'+(q.y*100)+'%'}));
      box.append(wrap,el('span',{class:'qa-mini-cap'},'ดูบนแบบ: '+(sh.name||'แบบแปลน')));
      box.addEventListener('click',function(){openDoc(d.id,it.id,{plan:true})});card.appendChild(box)})();
    var pb=photoRow(it.before,'รูปที่พบ'),pa=photoRow(it.after,'รูปหลังแก้');if(pb)card.appendChild(pb);if(pa)card.appendChild(pa);
    feed.appendChild(card);
    /* actions by role and state */
    var acts=el('div',{class:'qa-actions'});
    function btn(label,cls,fn){var b=el('button',{type:'button',class:'qa-btn '+(cls||'')},label);b.addEventListener('click',fn);acts.appendChild(b);return b}
    if(ONLINE&&!own&&it.asg===me&&st.open&&st.k!=='re')btn('แจ้งแก้แล้ว','pri big',function(){fixSheet(x)});
    if(ONLINE&&!own&&st.k==='re'&&can('ins_recheck'))btn('ตรวจซ้ำ','pri big',function(){recheckSheet(x)});
    if(own&&st.open)btn(st.k==='re'?'ตรวจซ้ำในรายงาน':it.asg?'แก้การมอบหมาย':'มอบหมายผู้แก้',st.k==='re'?'pri big':'big',function(){openDoc(d.id,it.id)});
    btn('เปิดในรายงาน','',function(){openDoc(d.id,it.id)});
    if(own)btn((data.plan&&data.plan.pins&&(data.plan.pins[it.id]||[]).length)?'แก้ตำแหน่งบนแบบ':'ระบุบนแบบแปลน','',function(){openDoc(d.id,it.id,{plan:true})});
    feed.appendChild(acts);
    /* history from the item itself (works offline) + server events + messages */
    var hist=el('div',{style:'display:flex;flex-direction:column;gap:6px'});feed.appendChild(el('h3',{style:'margin:8px 0 0;font-size:14px;color:var(--qa-mu)'},'ความเคลื่อนไหว'));feed.appendChild(hist);
    var owner=own?'คุณ':W.nameOf(d.owner||data._owner);
    var base=[];
    base.push({t:data.createdAt||'',n:evRow('#98A2B3',owner,'บันทึกในรายงาน '+docTitle(data),data.createdAt)});
    if(it.res)base.push({t:data.createdAt||'',n:evRow(stColor(statusOf({res:it.res})),owner,'ลงผล “'+(it.res==='ok'?'ผ่าน':it.res==='bad'?'ไม่ผ่าน':'ต้องแก้ไข')+'”',null)});
    if(it.asg)base.push({t:data.createdAt||'',n:evRow('var(--qa-ora)',owner,'มอบหมายให้ '+W.nameOf(it.asg)+(it.due?' ครบ '+fmtDate(it.due):''),null)});
    if(it.st==='fixed'||it.fnote)base.push({t:it.rat||'',n:evRow('#1F5FA8',it.asg?W.nameOf(it.asg):'ผู้แก้','แจ้งแก้แล้ว'+(it.fnote?': '+it.fnote:''),null)});
    if(it.rres)base.push({t:it.rdate||'',n:evRow(it.rres==='ok'?'var(--qa-grn)':'var(--qa-red)',owner,'ตรวจซ้ำ “'+(it.rres==='ok'?'ผ่าน':'ยังไม่ผ่าน')+'”'+(it.rnote?': '+it.rnote:''),it.rdate)});
    function drawHist(evs,msgs){
      hist.textContent='';
      var all=base.slice();
      (evs||[]).forEach(function(e){var k={assign:'มอบหมาย',status:'เปลี่ยนสถานะ',due:'กำหนดวัน',recheck:'ตรวจซ้ำ',recheck_conflict:'ตรวจซ้ำชนกัน',created:'สร้างรายการ',deleted:'ลบรายการ'}[e.kind]||e.kind;
        all.push({t:e.created_at,n:evRow('#5B6B7F',W.nameOf(e.actor),k+(e.to_value?' → '+e.to_value:'')+(e.note?' · '+e.note:''),e.created_at)})});
      (msgs||[]).forEach(function(m){all.push({t:m.created_at,n:msgView(m)})});
      all.sort(function(a,b){return String(a.t).localeCompare(String(b.t))}).forEach(function(e){hist.appendChild(e.n)});
    }
    drawHist([],[]);
    var ev=[],ms=[];
    Promise.all([ONLINE?W.itemEvents([sidOf(d.id,it.id)]).catch(function(){return []}):Promise.resolve([]),W.messages({item:sidOf(d.id,it.id)}).catch(function(){return []})]).then(function(r){
      if(route.name!=='t'||route.args[1]!==itemId)return;ev=r[0]||[];ms=r[1]||[];drawHist(ev,ms);sc.scrollTop=sc.scrollHeight});
    if(ch&&!ch.virtual&&!ch.legacy&&(can('ch_post')||it.asg===me||own))mainEl.appendChild(composer({channel:ch.id,item:sidOf(d.id,it.id),doc:d.id,label:'ข้อความในจุดตรวจนี้',placeholder:'คุยเรื่องจุดนี้…',note:ONLINE?null:'โหมดออฟไลน์: ข้อความเก็บในเครื่องนี้เท่านั้น'}));
  };
  function sidOf(docId,itemId){return docId+'.'+itemId}
  function sheet(title,build){
    var back=el('div',{class:'qa-sheet',role:'dialog','aria-modal':'true','aria-label':title}),box=el('div',{class:'qa-sb'});
    function close(){document.removeEventListener('keydown',key,true);back.remove()}
    function key(e){if(e.key==='Escape'){e.stopPropagation();close()}}
    box.appendChild(el('h2',null,title));build(box,close);back.appendChild(box);
    back.addEventListener('mousedown',function(e){if(e.target===back)close()});document.addEventListener('keydown',key,true);
    root.appendChild(back);var f=box.querySelector('input,textarea,button');if(f)f.focus();return close;
  }
  function photoPicker(box,list){
    var tray=el('div',{class:'qa-photos'});
    var lab=el('label',{class:'qa-btn',style:'cursor:pointer'},ic('camera',20),'ถ่าย / เลือกรูป');
    var fi=el('input',{type:'file',accept:'image/*',capture:'environment',hidden:true,multiple:true});lab.appendChild(fi);
    fi.addEventListener('change',function(){var fs=[].slice.call(fi.files||[]);fi.value='';
      window.claude.use('assets').then(function(A){return Promise.all(fs.map(function(f){return shrink(f).then(function(b){return A.upload(b)}).then(function(r){list.push(r.id);tray.appendChild(photoImg(r.id,'รูปหลังแก้'))})}))})});
    box.append(lab,tray);
  }
  function fixSheet(x){
    sheet('แจ้งแก้แล้ว · '+itemTitle(x.it),function(box,close){
      var after=[],note=el('textarea',{'aria-label':'สิ่งที่แก้',placeholder:'แก้อะไรไป เช่น ต่อทาบเหล็กเพิ่มเป็น 40d'});
      box.appendChild(el('label',{class:'qa-field'},el('span',null,'สิ่งที่แก้'),note));
      photoPicker(box,after);
      var go_=el('button',{type:'button',class:'qa-btn pri big'},'ส่งให้ผู้ตรวจตรวจซ้ำ');
      go_.addEventListener('click',function(){
        if(!after.length&&!note.value.trim()){flash('ใส่รูปหลังแก้หรือบอกว่าแก้อะไร');return}
        go_.disabled=true;window.__qcOnline.reportFixed(x.doc.id,x.it.id,note.value.trim(),after).then(function(){close();flash('แจ้งแก้แล้ว · รอผู้ตรวจตรวจซ้ำ');refresh()},function(e){go_.disabled=false;flash((e&&e.message)||'แจ้งไม่สำเร็จ')});
      });
      box.appendChild(go_);
    });
  }
  function recheckSheet(x){
    sheet('ตรวจซ้ำ · '+itemTitle(x.it),function(box,close){
      var res='',after=[],note=el('textarea',{'aria-label':'หมายเหตุผลตรวจซ้ำ',placeholder:'หมายเหตุ (ต้องใส่เมื่อยังไม่ผ่าน)'});
      var tri=el('div',{class:'qa-actions',role:'radiogroup','aria-label':'ผลตรวจซ้ำ'});
      [['ok','ผ่าน'],['bad','ยังไม่ผ่าน']].forEach(function(r){var b=el('button',{type:'button',role:'radio','aria-checked':'false',class:'qa-btn big'},r[1]);
        b.addEventListener('click',function(){res=r[0];tri.querySelectorAll('button').forEach(function(y){y.setAttribute('aria-checked',y===b?'true':'false');y.classList.toggle('pri',y===b)})});tri.appendChild(b)});
      box.append(tri,el('label',{class:'qa-field'},el('span',null,'หมายเหตุ'),note));photoPicker(box,after);
      var go_=el('button',{type:'button',class:'qa-btn pri big'},'บันทึกผลตรวจซ้ำ');
      go_.addEventListener('click',function(){
        if(!res){flash('เลือกผลตรวจซ้ำก่อน');return}if(res==='bad'&&!note.value.trim()){flash('บอกเหตุผลที่ยังไม่ผ่าน');note.focus();return}
        go_.disabled=true;window.__qcOnline.recheck(x.doc.id,x.it.id,res,note.value.trim(),after).then(function(){close();flash(res==='ok'?'ปิดงานแล้ว':'ส่งกลับให้แก้อีกครั้ง');refresh()},function(e){go_.disabled=false;flash((e&&e.message)||'บันทึกไม่สำเร็จ')});
      });
      box.appendChild(go_);
    });
  }

  /* ---------- view: my tasks (M5 / D-MyTasks) ---------- */
  VIEWS.tasks=function(tab){
    var t=tasks();tab=tab||(t.fix.length?'fix':t.re.length?'re':t.mine.length||!t.none.length?'mine':'none');
    var me=M.me||{};
    var hd=el('header',{class:'qa-hd qa-navy',style:'flex-direction:column;align-items:stretch;gap:10px;padding:14px 16px'});
    hd.append(el('div',{style:'display:flex;align-items:center;gap:10px'},avatar(me.id,me.name),el('div',{class:'qa-tt'},el('h2',null,'งานของฉัน'),el('div',{class:'qa-sub'},(me.name||'')+' · '+roleLine()))));
    var kp=el('div',{class:'qa-kpis'});
    [[t.late.length,'เลยกำหนด','#FF9C94'],[t.re.length,'รอฉันตรวจซ้ำ','#9CCBFF'],[t.fix.length,'ฉันต้องแก้','#FFD08A']].forEach(function(k){kp.appendChild(el('div',{class:'qa-kpi',style:'background:rgba(255,255,255,.1);border:0;color:#fff'},el('b',{style:'color:'+k[2]},String(k[0])),el('span',{style:'color:#C9D6E6'},k[1])))});
    hd.appendChild(kp);mainEl.appendChild(hd);
    var TABS=[['fix','ฉันต้องแก้',t.fix],['re','รอตรวจซ้ำ',t.re],['req','ใบขอตรวจ',t.req],['mine','ติดตามที่มอบ',t.mine],['late','เลยกำหนด',t.late],['none','ยังไม่มอบหมาย',t.none],['plan','งานในแผน',null]];
    var tl=el('div',{class:'qa-chips',role:'tablist','aria-label':'ประเภทงาน',style:'padding:10px 12px;background:var(--qa-card);border-bottom:1px solid var(--qa-bd)'});
    TABS.forEach(function(x){var a=el('a',{role:'tab',class:'qa-chip',href:'#/tasks/'+x[0],'aria-selected':tab===x[0]?'true':'false'},x[1]+(x[2]?' '+x[2].length:''));tl.appendChild(a)});
    mainEl.appendChild(tl);
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    if(tab==='plan'){planTasksMine(pad);return}
    if(tab==='req'){
      if(!ONLINE){pad.appendChild(el('p',{class:'qa-empty'},'ใบขอตรวจใช้ได้ในโหมดออนไลน์ (โฟร์แมนขอ → QC รับนัด)'));return}
      var nb=el('button',{type:'button',class:'qa-btn pri'},ic('plus',18),'ขอตรวจงาน');nb.addEventListener('click',function(){window.__qcOnline.requestForm({})});pad.appendChild(nb);
      t.req.forEach(function(r){var c=r.status==='requested'?'var(--qa-ora)':'var(--qa-blu)';
        var a=el('button',{type:'button',class:'qa-task',style:'border-left-color:'+c},el('span',{class:'qa-pill '+(r.status==='requested'?'qa-p-fix':'qa-p-re')},r.status==='requested'?'รอรับนัด':'รับนัดแล้ว'),el('b',null,r.title),
          el('span',{class:'m'},el('span',null,r.inspector_id===myId()?'ขอโดย '+W.nameOf(r.requested_by):'ผู้ตรวจ '+W.nameOf(r.inspector_id)),el('span',null,fmtDay(r.scheduled_at)+' '+fmtTime(r.scheduled_at))));
        a.addEventListener('click',function(){window.__qcOnline.tasks('req')});pad.appendChild(a)});
      if(!t.req.length)pad.appendChild(el('p',{class:'qa-empty'},'ไม่มีใบขอตรวจที่ค้าง'));return;
    }
    var list=(TABS.filter(function(x){return x[0]===tab})[0]||[])[2]||[];
    list.forEach(function(x){pad.appendChild(taskCard(x))});
    if(!list.length)pad.appendChild(el('p',{class:'qa-empty'},{fix:'ไม่มีงานแก้ที่มอบให้คุณ',re:'ไม่มีรายการรอตรวจซ้ำ',mine:'ยังไม่ได้มอบงานแก้ให้ใคร',late:'ไม่มีงานเลยกำหนด',none:'ทุกรายการที่ต้องแก้มีผู้รับผิดชอบแล้ว'}[tab]||''));
  };

  /* ---------- view: notifications (M19) ---------- */
  VIEWS.noti=function(){
    mainEl.appendChild(header('แจ้งเตือน','เฉพาะสิ่งที่เกี่ยวกับคุณ',{back:'#/'}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    var t=tasks(),rows=[];
    t.fix.forEach(function(x){rows.push([x,'มอบงานแก้ให้คุณ','var(--qa-ora)'])});
    t.re.forEach(function(x){rows.push([x,'แจ้งแก้แล้ว · รอคุณตรวจซ้ำ','#1F5FA8'])});
    t.late.forEach(function(x){rows.push([x,'เลยกำหนดแล้ว','var(--qa-red)'])});
    rows.forEach(function(r){pad.appendChild(taskCard(r[0],r[1]))});
    t.req.forEach(function(r){pad.appendChild(el('a',{class:'qa-task',href:'#/tasks/req',style:'border-left-color:#B26B00'},el('b',null,'ใบขอตรวจ: '+r.title),el('span',{class:'m'},el('span',null,W.nameOf(r.requested_by)),el('span',null,fmtDay(r.scheduled_at)))))});
    if(!pad.children.length)pad.appendChild(el('p',{class:'qa-empty'},'ไม่มีอะไรใหม่ · งานที่มอบให้คุณ ผลตรวจซ้ำ และใบขอตรวจจะขึ้นที่นี่'));
    pad.appendChild(el('a',{class:'qa-row qa-card',href:'#/profile'},el('span',{class:'qa-ico'},ic('bell',20)),el('span',{class:'qa-rt'},el('b',null,'ตั้งค่าการแจ้งเตือนและ LINE'),el('span',null,'รับงานผ่าน LINE แม้ปิดแอป')),ic('chev',20)));
  };

  /* ---------- view: search across channels (M30 / D-Search) ---------- */
  VIEWS.search=function(q){
    q=q||'';
    mainEl.appendChild(header('ค้นหา','ทั้งโครงการ',{back:'#/'}));
    var inp=el('input',{type:'search',value:q,'aria-label':'ค้นหา',placeholder:'คำในรายการ ตำแหน่ง เลขที่ หรือข้อความ',style:'width:100%;min-height:52px;padding:0 14px;border-radius:8px;border:1px solid #C9D2DC;font-size:17px'});
    var box=el('div',{class:'qa-pad',style:'background:var(--qa-card);border-bottom:1px solid var(--qa-bd)'},inp);mainEl.appendChild(box);
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    function run(){
      var v=inp.value.trim().toLowerCase();pad.textContent='';if(!v){pad.appendChild(el('p',{class:'qa-empty'},'พิมพ์อย่างน้อย 1 คำ'));return}
      var hits=M.items.filter(function(x){return [x.it.chk,x.it.loc,x.it.note,docTitle(x.doc.data)].join(' ').toLowerCase().indexOf(v)>=0}).slice(0,60);
      pad.appendChild(el('div',{class:'qa-sec'},el('span',null,'รายการตรวจ ('+hits.length+')')));hits.forEach(function(x){pad.appendChild(taskCard(x,docTitle(x.doc.data)))});
      W.search(v).then(function(ms){if(!ms||!ms.length)return;pad.appendChild(el('div',{class:'qa-sec'},el('span',null,'ข้อความ ('+ms.length+')')));
        ms.forEach(function(m){var c=chById(m.channel_id);var a=el('a',{class:'qa-task',href:m.item_id?'#/c/'+encodeURIComponent(m.channel_id):'#/c/'+encodeURIComponent(m.channel_id),style:'border-left-color:#5B6B7F'},el('b',null,m.body),el('span',{class:'m'},el('span',null,(c?'#'+c.name:'')+' · '+W.nameOf(m.author)),el('span',null,fmtDay(m.created_at))));pad.appendChild(a)})});
    }
    var tmr;inp.addEventListener('input',function(){clearTimeout(tmr);tmr=setTimeout(run,200)});setTimeout(function(){inp.focus();if(q)run()},0);
  };

  /* ---------- view: me hub (M34) ---------- */
  function row(href,icon,label,detail,onclick){
    var a=el(href?'a':'button',href?{class:'qa-row',href:href}:{class:'qa-row',type:'button'},el('span',{class:'qa-ico'},ic(icon,20)),el('span',{class:'qa-rt'},el('b',null,label),detail?el('span',null,detail):null),ic('chev',20));
    if(onclick)a.addEventListener('click',onclick);return a;
  }
  function group(title,rows){var w=el('div',null);w.appendChild(el('div',{class:'qa-sec'},el('span',null,title)));var c=el('div',{class:'qa-card'});rows.forEach(function(r){if(r)c.appendChild(r)});w.appendChild(c);return w}
  function prefSwitch(key,label,sub){
    var on=localStorage.getItem(key)==='1';
    var b=el('button',{type:'button',role:'switch',class:'qa-sw','aria-checked':on?'true':'false','aria-label':label});
    b.addEventListener('click',function(){on=!on;localStorage.setItem(key,on?'1':'0');b.setAttribute('aria-checked',on?'true':'false');applyPrefs()});
    return el('div',{class:'qa-row',style:'cursor:default'},el('span',{class:'qa-ico'},ic(key==='qa-sun'?'sun':'doc',20)),el('span',{class:'qa-rt'},el('b',null,label),el('span',null,sub)),b);
  }
  function applyPrefs(){if(!root)return;root.classList.toggle('sun',localStorage.getItem('qa-sun')==='1');root.classList.toggle('big',localStorage.getItem('qa-big')==='1')}
  VIEWS.me=function(){
    var me=M.me||{};
    var hd=el('header',{class:'qa-hd qa-navy',style:'flex-direction:column;align-items:stretch;gap:12px;padding:16px'});
    hd.append(el('div',{style:'display:flex;align-items:center;gap:12px'},el('span',{class:'qa-av',style:'width:56px;height:56px;border-radius:28px;font-size:20px;background:'+colorOf(me.id)},ini(me.name)),
      el('div',{class:'qa-tt'},el('h2',{style:'font-size:20px'},me.name||'ฉัน'),el('div',{class:'qa-sub'},roleLine()+' · '+((M.company&&M.company.name)||'')))));
    var sl=el('a',{href:'#/data',style:'min-height:48px;padding:0 12px;border-radius:8px;background:rgba(255,255,255,.1);color:#fff;text-decoration:none;display:flex;align-items:center;gap:10px'},el('span',{style:'width:10px;height:10px;border-radius:5px;background:#7BE0B0'}),el('span',{style:'flex:1;font-size:14px'},syncLine()),ic('chev',18));
    hd.appendChild(sl);mainEl.appendChild(hd);
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    pad.appendChild(group('งานและเอกสาร',[row(null,'doc','คลังเอกสาร','ทุกฉบับ · ค้นหา · เลือกหลายฉบับ · ส่งออก',function(){libOpen()}),row('#/cal','cal','ปฏิทินนัดตรวจ',ONLINE?'ใบขอตรวจและวันครบกำหนด':'วันครบกำหนดแก้งาน'),
      row('#/overview','chart','ภาพรวมโครงการ','ความคืบหน้า · จุดค้าง · จุดหยุดตรวจ'),row('#/plan','plan','แผนงาน','แผนหลัก · 3 สัปดาห์ · สัปดาห์นี้'),row('#/drawings','drawing','แบบล่าสุด','แบบแปลนที่ใช้ในโครงการนี้'),
      row(null,'doc','รายงานแบบอื่น','แบบฟอร์มสำเร็จรูป / สร้างเอง',function(){if(window.__qcForms)window.__qcForms.library()}),
      row(null,'zip','รับไฟล์ ZIP','งานที่เพื่อนส่งมา',function(){if(window.__qcHome&&window.__qcHome.importZip)window.__qcHome.importZip()})]));
    var dev=[row('#/data','cloud','ข้อมูลในเครื่องและการส่งให้ทีม',ONLINE?'ข้อมูลอยู่ที่ไหน · สำรอง · ถังขยะ':'สำรองเป็นไฟล์ · ถังขยะ'),prefSwitch('qa-sun','โหมดกลางแดด','สีเข้มขึ้น อ่านง่ายกลางแจ้ง'),prefSwitch('qa-big','ตัวอักษรใหญ่','ทั้งแอป')];
    pad.appendChild(group('เครื่องนี้',dev));
    var acc=[row('#/profile','bell','การแจ้งเตือน · LINE · ตั้งค่า','ชื่อผู้ตรวจ ลายเซ็น และโหมดการใช้งาน'),row('#/company','building','บริษัทและรหัสเข้า',(M.company&&M.company.name)||''),
      row('#/members','people','สมาชิกโครงการ','เพิ่มคนและให้ยศ'),(can('*')||!ONLINE)?row('#/roles','shield','ยศและสิทธิ์','ใครทำอะไรได้บ้าง'):null,row('#/welcome','help','ช่วยเหลือและเริ่มใช้งาน','ติดตั้งแอป · อนุญาตกล้อง/แจ้งเตือน')];
    pad.appendChild(group('บัญชี',acc));
    pad.appendChild(el('p',{style:'text-align:center;font-size:12px;color:var(--qa-mu)'},'QC App · '+(ONLINE?'โหมดออนไลน์':'โหมดออฟไลน์ (เครื่องนี้)')));
  };
  function libOpen(){var A=window.__qcActions;if(A){A.openList();}}
  VIEWS.profile=function(){
    /* the existing settings sheet (name, signature, mode switch, LINE in online mode) */
    location.replace('#/me');setTimeout(function(){if(window.__qcHome&&window.__qcHome.settings)window.__qcHome.settings()},50);
  };

  /* ---------- view: data & sync (M37) ---------- */
  VIEWS.data=function(){
    mainEl.appendChild(header('ข้อมูลในเครื่องและการส่งให้ทีม',ONLINE?'ออนไลน์ · ทีมเห็นงานเดียวกัน':'ออฟไลน์ · เก็บในเครื่องนี้',{back:'#/me'}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    var s=ONLINE&&window.__qcSync?window.__qcSync():null;
    var stat=el('div',{class:'qa-card',style:'padding:12px 14px;display:flex;flex-direction:column;gap:8px'});
    stat.append(el('b',{style:'font-size:16px'},syncLine()),el('span',{style:'font-size:13px;color:var(--qa-mu)'},ONLINE?'ส่งให้ทีมเองทุกครั้งที่มีสัญญาณ · ไม่มีสัญญาณก็ทำงานต่อได้ งานจะขึ้นว่า “รอส่ง”':'ข้อมูลอยู่ในเครื่องนี้เท่านั้น · สำรองเป็นไฟล์อย่างสม่ำเสมอ หรือเปลี่ยนเป็นโหมดออนไลน์เพื่อให้ทีมเห็น'));
    if(ONLINE){var sy=el('button',{type:'button',class:'qa-btn'},ic('refresh',18),'ส่งตอนนี้');sy.addEventListener('click',function(){window.__qcOnline.sync();flash('กำลังส่ง…');setTimeout(refresh,1500)});stat.appendChild(sy)}
    pad.appendChild(stat);
    /* where each kind of data lives */
    var nDocs=M.docs.filter(isMine).length,nPh=0,nBin=0;M.docs.filter(isMine).forEach(function(d){(d.data.items||[]).forEach(function(it){nPh+=(it.before||[]).length+(it.after||[]).length});nBin+=(d.data.bin||[]).length});
    var q=W.pendingMessages?W.pendingMessages():0,pend=s?s.pending:0;
    var rowsD=[['รายงานตรวจงานของคุณ',nDocs+' ฉบับ',ONLINE?(pend?'รอส่ง '+pend:'บนระบบ'):'ในเครื่องนี้',ONLINE&&!pend],
      ['รูปถ่าย',nPh+' รูป',ONLINE?'บนระบบ':'ในเครื่องนี้',ONLINE],
      ['ข้อความคุยกับทีม',q?'รอส่ง '+q:'—',ONLINE?(q?'รอส่ง':'บนระบบ'):'ในเครื่องนี้',ONLINE&&!q],
      ['รายงานแบบอื่น',ONLINE&&s&&s.forms?(s.forms.ready?'ส่งให้ทีมได้':'ยังอยู่ในเครื่องนี้'):'—',ONLINE&&s&&s.forms&&s.forms.ready?'บนระบบ':'ในเครื่องนี้',ONLINE&&s&&s.forms&&s.forms.ready],
      ['รายการที่ถูกลบ (กู้คืนได้ 30 วัน)',nBin+' รายการ',ONLINE?'บนระบบ':'ในเครื่องนี้',ONLINE]];
    var tb=el('div',{class:'qa-card'});
    rowsD.forEach(function(r){tb.appendChild(el('div',{class:'qa-row',style:'cursor:default'},el('span',{class:'qa-rt'},el('b',{style:'font-size:15px'},r[0]),el('span',null,r[1])),el('span',{class:'qa-pill '+(r[3]?'qa-p-ok':'qa-p-fix')},r[2])))});
    pad.append(el('div',{class:'qa-sec'},el('span',null,'ข้อมูลของคุณเก็บไว้ที่ไหน')),tb);
    pad.appendChild(group('ไฟล์และถังขยะ',[row(null,'zip','สำรองข้อมูลเป็นไฟล์ (ZIP)','รายงาน รูป แบบฟอร์ม และโซน',function(){var A=window.__qcActions;if(A&&A.exportBackup)A.exportBackup()}),
      row(null,'trash','ถังขยะ','เอกสารที่ลบ · กู้คืนได้ 30 วัน',function(){var A=window.__qcActions;if(A&&A.openTrash)A.openTrash()}),
      row(null,'doc','เปิดหน้าสำรอง/นำเข้าแบบเต็ม','ไฟล์ที่เพื่อนส่งมา · ความครบของข้อมูล',function(){if(window.__qcHome&&window.__qcHome.backup)window.__qcHome.backup()})]));
  };

  /* ---------- view: calendar (M38 / D-Calendar) ---------- */
  VIEWS.cal=function(dayArg){
    var base=new Date();base.setHours(0,0,0,0);var dow=(base.getDay()+6)%7;var mon=new Date(base.getTime()-dow*864e5);
    var sel=dayArg||QCU.today();
    mainEl.appendChild(header('ปฏิทินนัดตรวจ',mon.toLocaleDateString('th-TH',{month:'long',year:'numeric'}),{back:'#/me',right:[ONLINE?(function(){var b=el('button',{type:'button',class:'qa-ib','aria-label':'ขอตรวจ / นัดตรวจใหม่'},ic('plus'));b.addEventListener('click',function(){window.__qcOnline.requestForm({})});return b})():null]}));
    var ev={};
    function add(day,o){(ev[day]=ev[day]||[]).push(o)}
    if(ONLINE&&window.__qcOnline.requests)(window.__qcOnline.requests()||[]).forEach(function(r){if(r.status==='cancelled')return;var d=QCU.today.call?String(r.scheduled_at).slice(0,10):'';
      var dl=new Date(r.scheduled_at);d=dl.getFullYear()+'-'+String(dl.getMonth()+1).padStart(2,'0')+'-'+String(dl.getDate()).padStart(2,'0');
      add(d,{time:fmtTime(r.scheduled_at),title:r.title,sub:'ขอโดย '+W.nameOf(r.requested_by)+' · ผู้ตรวจ '+W.nameOf(r.inspector_id),tag:r.hold||'',state:r.status==='requested'?'รอรับนัด':r.status==='accepted'?'รับนัดแล้ว':r.status==='passed'?'ผ่าน':'ไม่ผ่าน',href:'#/tasks/req'})});
    M.items.forEach(function(x){if(x.st.open&&x.it.due)add(x.it.due,{time:'ครบกำหนด',title:itemTitle(x.it),sub:(x.zone?'#'+x.zone:'')+(x.it.asg?' · '+W.nameOf(x.it.asg):''),state:x.st.label,href:'#/t/'+encodeURIComponent(x.doc.id)+'/'+encodeURIComponent(x.it.id)})});
    var strip=el('div',{role:'tablist','aria-label':'วันในสัปดาห์',style:'padding:10px 8px;background:var(--qa-card);border-bottom:1px solid var(--qa-bd);display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px'});
    var WD=['จ','อ','พ','พฤ','ศ','ส','อา'];
    for(var i=0;i<7;i++){(function(i){var d=new Date(mon.getTime()+i*864e5),k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),on=k===sel,has=!!ev[k];
      var b=el('a',{role:'tab',href:'#/cal/'+k,'aria-selected':on?'true':'false','aria-label':d.toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'short'})+(has?' มี '+ev[k].length+' รายการ':''),
        style:'min-height:64px;border-radius:8px;text-decoration:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;'+(on?'background:var(--qa-on-bg);color:var(--qa-on-tx)':'color:var(--qa-tx)')},
        el('span',{style:'font-size:12px'},WD[i]),el('b',{style:'font-size:18px'},String(d.getDate())),el('span',{style:'width:6px;height:6px;border-radius:3px;background:'+(has?(on?'var(--qa-on-tx)':'var(--qa-blu)'):'transparent')}));
      strip.appendChild(b)})(i)}
    mainEl.appendChild(strip);
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    var list=ev[sel]||[];
    pad.appendChild(el('h3',{style:'margin:0 4px;font-size:15px;color:var(--qa-mu)'},new Date(sel).toLocaleDateString('th-TH',{weekday:'long',day:'numeric',month:'short'})+' · '+list.length+' รายการ'));
    list.forEach(function(e){pad.appendChild(el('a',{class:'qa-task',href:e.href,style:'border-left-color:var(--qa-blu)'},el('span',{class:'qa-pill qa-p-re'},e.time+' · '+e.state),el('b',null,e.title),el('span',{class:'m'},el('span',null,e.sub),el('span',null,''))))});
    if(!list.length)pad.appendChild(el('p',{class:'qa-empty'},'ไม่มีนัดตรวจหรือกำหนดส่งงานวันนี้'));
    pad.appendChild(el('p',{style:'font-size:12px;color:var(--qa-mu)'},'H = จุดหยุดตรวจ ขั้นต่อไปเริ่มไม่ได้จนกว่าจะผ่าน · W = จุดเชิญตรวจ ไม่มาตามนัดทำต่อได้'));
  };

  /* ---------- view: drawings (M13 / D-Drawings) ---------- */
  VIEWS.drawings=function(){
    mainEl.appendChild(header('แบบล่าสุด','แบบแปลนที่ใช้ระบุตำแหน่งในโครงการนี้',{back:'#/'}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    var by={};
    M.docs.forEach(function(d){var pl=d.data.plan;if(!pl||!pl.sheets)return;pl.sheets.forEach(function(sh,i){var k=sh.name||('แผ่น '+(i+1));
      var pins=0;Object.keys(pl.pins||{}).forEach(function(id){(pl.pins[id]||[]).forEach(function(p){if(p.s===i)pins++})});
      var cur=by[k];var t=d.data.updatedAt||'';if(!cur||t>cur.t)by[k]={t:t,sh:sh,doc:d,pins:(cur?cur.pins:0)+pins,uses:(cur?cur.uses:0)+1};else{cur.pins+=pins;cur.uses++}})});
    var ks=Object.keys(by).sort();
    ks.forEach(function(k){var x=by[k];var c=el('button',{type:'button',class:'qa-rep'},el('div',{class:'h'},ic('drawing',18),el('b',null,k),txt(' · ใช้ใน '+x.uses+' รายงาน · หมุด '+x.pins+' จุด')));
      var im=photoImg(x.sh.a,k);im.style.width='100%';im.style.maxHeight='220px';im.style.objectFit='contain';im.style.background='#fff';c.appendChild(im);
      c.addEventListener('click',function(){openDoc(x.doc.id,null,{plan:true})});pad.appendChild(c)});
    if(!ks.length)pad.appendChild(el('p',{class:'qa-empty'},'ยังไม่มีแบบแปลน · เพิ่มได้จาก “ระบุบนแบบแปลน” ในรายการตรวจ (ไม่บังคับ)'));
  };

  /* ---------- view: company, join, billing (M11/M12/M14/M15, D-Members, D-Billing) ---------- */
  VIEWS.company=function(){
    var co=M.company||{};
    mainEl.appendChild(header(co.name||'บริษัท','คนในบริษัท รหัสเข้า และการตั้งค่า',{back:'#/me'}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    if(!ONLINE){pad.appendChild(el('div',{class:'qa-note info'},'โหมดออฟไลน์ใช้คนเดียวในเครื่องนี้ · บริษัท รหัสเข้า และการเพิ่มคน ใช้ได้ในโหมดออนไลน์ (เปลี่ยนได้ที่ ฉัน › ตั้งค่า)'));}
    pad.appendChild(el('div',{class:'qa-card',style:'padding:14px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;text-align:center'},
      el('div',null,el('b',{style:'font-size:22px;display:block'},String(co.members||1)),el('span',{style:'font-size:12px;color:var(--qa-mu)'},'คนในบริษัท')),
      el('div',null,el('b',{style:'font-size:22px;display:block'},String(M.projects.length)),el('span',{style:'font-size:12px;color:var(--qa-mu)'},'โครงการที่คุณอยู่')),
      el('div',null,el('b',{style:'font-size:22px;display:block'},{free:'ฟรี',team:'ทีม',org:'องค์กร',local:'เครื่องนี้'}[co.plan]||co.plan||'—'),el('span',{style:'font-size:12px;color:var(--qa-mu)'},'แพ็กเกจ'))));
    if(ONLINE&&co.is_admin){
      var codeBox=el('div',{class:'qa-card',style:'padding:14px;display:flex;flex-direction:column;gap:10px'},el('b',null,'รหัสเข้าบริษัท'),el('span',{style:'font-size:13px;color:var(--qa-mu)'},'คนที่ได้รหัสนี้เข้าบริษัทได้ (ยังไม่เห็นโครงการจนกว่า PM จะเพิ่ม) · ใช้ฟรีสำหรับผู้ถูกชวน'));
      var codeEl=el('div',{style:'font-size:28px;font-weight:700;letter-spacing:.12em'},'…');codeBox.appendChild(codeEl);
      var acts=el('div',{style:'display:flex;gap:8px;flex-wrap:wrap'});
      var cp=el('button',{type:'button',class:'qa-btn pri'},'คัดลอกข้อความชวน'),rt=el('button',{type:'button',class:'qa-btn'},'เปลี่ยนรหัส');
      acts.append(cp,rt);codeBox.appendChild(acts);pad.appendChild(codeBox);
      W.companyCode().then(function(c){codeEl.textContent=c||'—'});
      cp.addEventListener('click',function(){var t='เข้าบริษัท '+(co.name||'')+' ใน QC App: เปิด '+location.origin+location.pathname+'?mode=online แล้วใส่รหัส '+codeEl.textContent;
        (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){flash('คัดลอกแล้ว · วางใน LINE ได้เลย')},function(){prompt('คัดลอกข้อความนี้',t)})});
      QCU.arm(rt,{armed:'กดอีกครั้ง: รหัสเดิมจะใช้ไม่ได้',timeoutMs:4000,onConfirm:function(){W.rotateCode().then(function(c){codeEl.textContent=c;flash('เปลี่ยนรหัสแล้ว')},function(e){flash(e.message)})}});
      var nm=el('input',{value:co.name||'','aria-label':'ชื่อบริษัท'}),sv=el('button',{type:'button',class:'qa-btn'},'บันทึกชื่อ');
      sv.addEventListener('click',function(){W.updateCompany({name:nm.value.trim()}).then(function(){flash('บันทึกแล้ว');reloadAll()},function(e){flash(e.message)})});
      pad.appendChild(el('div',{class:'qa-card',style:'padding:14px;display:flex;flex-direction:column;gap:8px'},el('label',{class:'qa-field'},el('span',null,'ชื่อบริษัท'),nm),sv));
    }
    pad.appendChild(group('ตั้งค่าบริษัท',[row('#/roles','shield','ยศและสิทธิ์','9 ยศสำเร็จรูป · แก้ชื่อ สี สิทธิ์ ลำดับ'),row('#/standards','flag','มาตรฐานตั้งต้น',(co.standards||[]).join(' → ')),
      ONLINE?row('#/people','people','คนในบริษัท','ทุกคนที่เข้ามาด้วยรหัส'):null,ONLINE&&co.is_admin?row('#/audit','hist','ประวัติการเปลี่ยนสิทธิ์','ใคร เปลี่ยนอะไร เมื่อไร'):null,row('#/billing','card','แพ็กเกจ','ฟรี / ทีม / องค์กร')]));
  };
  VIEWS.standards=function(){
    var co=M.company||{},list=(co.standards||['รายการประกอบแบบของโครงการ','มยผ.','วสท.']).slice();
    mainEl.appendChild(header('มาตรฐานตั้งต้น','ใช้ตามลำดับ · บนสุดมาก่อน',{back:'#/company'}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    pad.appendChild(el('div',{class:'qa-note info'},'รายการประกอบแบบของโครงการเป็นเอกสารตามสัญญา จึงมาก่อน · ถ้าไม่ได้ระบุไว้ ใช้ มยผ. สำหรับงานโครงสร้างและสถาปัตย์ และ วสท. สำหรับงานไฟฟ้าและระบบ'));
    var box=el('div',{class:'qa-card'});pad.appendChild(box);
    function draw(){box.textContent='';list.forEach(function(s,i){var up=el('button',{type:'button',class:'qa-ib','aria-label':'เลื่อน '+s+' ขึ้น',disabled:i===0?true:null},'↑');
      up.addEventListener('click',function(){var t=list[i-1];list[i-1]=list[i];list[i]=t;draw()});box.appendChild(el('div',{class:'qa-row',style:'cursor:default'},el('b',{style:'width:24px'},String(i+1)),el('span',{class:'qa-rt'},el('b',null,s)),up))})}
    draw();
    var editable=!ONLINE||co.is_admin;
    if(editable){var sv=el('button',{type:'button',class:'qa-btn pri'},'บันทึกลำดับ');sv.addEventListener('click',function(){(ONLINE?W.updateCompany({standards:list}):Promise.resolve(lsSJ('qc-loc-std',list))).then(function(){flash('บันทึกแล้ว');reloadAll()},function(e){flash(e.message)})});pad.appendChild(sv)}
    else pad.appendChild(el('p',{style:'font-size:13px;color:var(--qa-mu)'},'แอดมินบริษัทเปลี่ยนลำดับได้'));
  };
  VIEWS.billing=function(){
    var co=M.company||{};
    mainEl.appendChild(header('แพ็กเกจ','เก็บเงินที่ระดับบริษัท · ผู้ถูกชวนใช้ฟรี',{back:'#/company'}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    [['free','เริ่มต้น','ฟรี','ทีมเล็ก · ตรวจงานได้ครบ · ทำงานร่วมกันทั้งทีม'],['team','ทีม','1,490 ฿ / เดือน','หลายโครงการ · แผนงาน · ยศกำหนดเอง · LINE'],['org','องค์กร','ติดต่อ','หลายบริษัทในเครือ · รายงานผู้บริหาร · SSO']].forEach(function(p){
      var on=co.plan===p[0];pad.appendChild(el('div',{class:'qa-card',style:'padding:14px;display:flex;flex-direction:column;gap:4px;'+(on?'border:2px solid var(--qa-pri)':'')},el('b',{style:'font-size:17px'},p[1]+(on?' · ใช้อยู่':'')),el('span',{style:'font-size:20px;font-weight:700'},p[2]),el('span',{style:'color:var(--qa-mu)'},p[3])))});
    pad.appendChild(el('div',{class:'qa-note warn'},'ยังไม่มีระบบชำระเงินในแอป · เปลี่ยนแพ็กเกจผ่านผู้ดูแลระบบ'));
  };
  VIEWS.people=function(){
    mainEl.appendChild(header('คนในบริษัท','',{back:'#/company'}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    W.people().then(function(ps){(ps||[]).forEach(function(p){pad.appendChild(el('div',{class:'qa-row qa-card',style:'cursor:default'},avatar(p.id,p.name),el('span',{class:'qa-rt'},el('b',null,p.name||p.email),el('span',null,(p.email||'')+(p.joined?'':' · ยังไม่ได้ใส่รหัสเข้า'))),el('span',{class:'qa-pill qa-p-mu'},{admin:'แอดมิน',ceo:'ผู้บริหาร',staff:'พนักงาน'}[p.org_role]||'')))});
      if(!(ps||[]).length)pad.appendChild(el('p',{class:'qa-empty'},'ไม่มีข้อมูล (เฉพาะแอดมินและ PM เห็นรายชื่อทั้งบริษัท)'))});
  };
  VIEWS.join=function(){
    mainEl.appendChild(header('เข้าบริษัท','',{back:'#/'}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    var co=M.company||{};
    if(co.joined){pad.append(el('div',{class:'qa-note ok'},'คุณอยู่ใน '+(co.name||'บริษัท')+' แล้ว'),el('p',{class:'qa-empty'},M.projects.length?'เลือกโครงการที่ต้องการตรวจได้เลย':'ยังไม่มีโครงการให้ตรวจ · ขอให้ PM หรือผู้ดูแลเพิ่มคุณเข้าโครงการ แล้วโครงการจะขึ้นเอง'));return}
    var inp=el('input',{'aria-label':'รหัสเข้าบริษัท',placeholder:'เช่น SCC-4K7',autocapitalize:'characters',style:'font-size:24px;letter-spacing:.12em;text-align:center'});
    var b=el('button',{type:'button',class:'qa-btn pri big'},'เข้าบริษัท');
    b.addEventListener('click',function(){var v=inp.value.trim();if(!v)return;b.disabled=true;W.join(v).then(function(ok){b.disabled=false;if(ok){flash('เข้าบริษัทแล้ว');reloadAll()}else flash('รหัสไม่ถูกต้อง · ขอรหัสจากแอดมินของบริษัท')},function(e){b.disabled=false;flash(e.message)})});
    pad.append(el('p',null,'ใส่รหัสเข้าบริษัทที่ได้จากแอดมิน · ใช้ฟรี'),el('label',{class:'qa-field'},el('span',null,'รหัสเข้า'),inp),b,el('p',{style:'font-size:13px;color:var(--qa-mu)'},'เข้าบริษัทแล้ว โครงการจะขึ้นเฉพาะเมื่อ PM เพิ่มคุณเข้าโครงการ'));
  };

  /* ---------- permissions catalogue (D-Roles) ---------- */
  var PERMS=[
    ['รายงานตรวจงาน',[['ins_view','ดูรายงานและรายการตรวจ','ทุกโซนที่เห็น'],['ins_create','สร้างรายงาน','ตรวจงานและออก PDF'],['ins_recheck','ตรวจซ้ำ','ลงผลผ่าน / ยังไม่ผ่าน'],
      ['ins_assign','มอบหมายงานแก้','เลือกผู้แก้และวันครบกำหนด'],['ins_fix','รับงานแก้','แจ้งแก้แล้วพร้อมรูปหลังแก้'],['ins_approve','อนุมัติและลงนาม','ใบขอเท แบบฟอร์มที่ต้องอนุมัติ']]],
    ['โซนและการคุย',[['ch_post','ส่งข้อความ','ในโซนที่เห็น'],['ch_manage','จัดการชั้น/โซน','เพิ่ม แก้ ตั้งว่าใครเห็น และประกาศ']]],
    ['คนและโครงการ',[['mem_manage','เพิ่มคนและให้ยศ','ได้เฉพาะยศที่ต่ำกว่าตัวเอง'],['dw_upload','อัปโหลดแบบ','แบบแปลนและรุ่นแบบ'],['req_create','ขอตรวจงาน','ใบขอตรวจ'],['req_answer','รับนัด / ตอบใบขอตรวจ','']]],
    ['แผนงาน',[['pl_edit','แก้แผนงาน','เลื่อนงาน ตั้งงานก่อน-หลัง'],['pl_baseline','อนุมัติแผนฐาน','ล็อกแผนเป็นเส้นฐานวัดความคืบหน้าและงวดงาน'],['pl_assign','มอบงานในแผน','ส่งงานประจำสัปดาห์ให้คน'],['pl_progress','รายงานความคืบหน้า','รับปาก / ติดอุปสรรค / %']]]];
  var BASE_TH={pm:'ผู้จัดการ (PM)',foreman:'ผู้ตรวจ / โฟร์แมน',headman:'ผู้แก้งาน',viewer:'ผู้ดู'};

  /* ---------- view: project members (D-ProjectMembers / M7) ---------- */
  VIEWS.members=function(){
    var p=M.projects.filter(function(x){return x.id===M.project})[0]||{};
    mainEl.appendChild(header('สมาชิกโครงการ',p.name||'',{back:'#/'}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    if(!ONLINE){pad.appendChild(el('div',{class:'qa-note info'},'โหมดออฟไลน์ใช้คนเดียว · เพิ่มคนเข้าโครงการและให้ยศได้ในโหมดออนไลน์'));return}
    var mng=can('mem_manage');
    Promise.all([W.projectPeople(),W.roles()]).then(function(r){
      var people=r[0]||[],roles=(r[1]||[]).filter(function(x){return x.id!=='everyone'});
      people.forEach(function(u){
        var rr=(u.roles||[]).map(function(id){return roles.filter(function(x){return x.id===id})[0]}).filter(Boolean);
        var line=el('div',{class:'qa-card',style:'padding:10px 12px;display:flex;flex-direction:column;gap:8px'});
        line.appendChild(el('div',{style:'display:flex;align-items:center;gap:10px'},avatar(u.id,u.name),el('span',{class:'qa-rt',style:'flex:1;min-width:0;display:flex;flex-direction:column'},el('b',null,(u.id===myId()?'คุณ · ':'')+(u.name||u.email)),el('span',{style:'font-size:13px;color:var(--qa-mu)'},u.email||''))));
        var chips=el('div',{style:'display:flex;gap:6px;flex-wrap:wrap'});
        rr.forEach(function(x){chips.appendChild(el('span',{class:'qa-pill qa-p-mu',style:'display:inline-flex;align-items:center;gap:6px;color:var(--qa-tx)'},el('span',{class:'qa-dotc',style:'width:10px;height:10px;flex:0 0 10px;background:'+x.color}),txt(x.name)))});
        if(!rr.length)chips.appendChild(el('span',{class:'qa-pill qa-p-mu'},BASE_TH[u.base]||u.base));
        line.appendChild(chips);
        if(mng&&u.id!==myId()){var e=el('button',{type:'button',class:'qa-btn sm'},'แก้ยศ');e.addEventListener('click',function(){rolePicker(u,roles)});line.appendChild(e)}
        pad.appendChild(line);
      });
      if(mng){var add=el('button',{type:'button',class:'qa-btn pri'},ic('plus',18),'เพิ่มคนในบริษัทเข้าโครงการ');add.addEventListener('click',function(){addPeople(people,roles)});pad.insertBefore(add,pad.firstChild)}
    }).catch(function(e){pad.appendChild(el('p',{class:'qa-empty'},'โหลดรายชื่อไม่สำเร็จ: '+e.message))});
  };
  function rolePicker(u,roles){
    sheet('ยศของ '+(u.name||u.email),function(box,close){
      var sel={};(u.roles||[]).forEach(function(id){sel[id]=1});
      box.appendChild(el('p',{style:'margin:0;font-size:13px;color:var(--qa-mu)'},'มีได้หลายยศ · สิทธิ์รวมกัน · ให้ได้เฉพาะยศที่ต่ำกว่ายศของคุณ'));
      roles.forEach(function(r){var on=!!sel[r.id];var b=el('button',{type:'button',role:'checkbox','aria-checked':on?'true':'false',class:'qa-row qa-card'},el('span',{class:'qa-dotc',style:'background:'+r.color}),el('span',{class:'qa-rt'},el('b',null,r.name),el('span',null,BASE_TH[r.base])),ic(on?'check':'plus',20));
        b.addEventListener('click',function(){on=!on;if(on)sel[r.id]=1;else delete sel[r.id];b.setAttribute('aria-checked',on?'true':'false');b.lastChild.replaceWith(ic(on?'check':'plus',20))});box.appendChild(b)});
      var sv=el('button',{type:'button',class:'qa-btn pri big'},'บันทึกยศ'),rm=el('button',{type:'button',class:'qa-btn danger'},'นำออกจากโครงการ');
      sv.addEventListener('click',function(){var ids=Object.keys(sel);if(!ids.length){flash('เลือกอย่างน้อย 1 ยศ หรือกด “นำออกจากโครงการ”');return}
        sv.disabled=true;W.setMemberRoles(null,u.id,ids).then(function(){close();flash('บันทึกยศแล้ว');reloadAll()},function(e){sv.disabled=false;flash(e.message)})});
      QCU.arm(rm,{armed:'กดอีกครั้งเพื่อนำออก',onConfirm:function(){W.setMemberRoles(null,u.id,[]).then(function(){close();flash('นำออกแล้ว');reloadAll()},function(e){flash(e.message)})}});
      box.append(sv,rm);
    });
  }
  function addPeople(already,roles){
    sheet('เพิ่มคนเข้าโครงการ',function(box,close){
      var have={};already.forEach(function(u){have[u.id]=1});
      var q=el('input',{type:'search','aria-label':'ค้นหาคนในบริษัท',placeholder:'ชื่อหรืออีเมล',style:'min-height:48px;padding:0 12px;border-radius:8px;border:1px solid #C9D2DC'});
      var role=el('select',{'aria-label':'ยศในโครงการ',style:'min-height:48px;border-radius:8px;border:1px solid #C9D2DC;padding:0 10px'});
      roles.forEach(function(r){role.appendChild(el('option',{value:r.id},r.name))});role.value='qc';
      var list=el('div',{class:'qa-card'});box.append(q,el('label',{class:'qa-field'},el('span',null,'ยศที่จะให้'),role),list);
      var picked={};
      W.people().then(function(ps){
        function draw(){list.textContent='';var v=q.value.trim().toLowerCase();
          (ps||[]).filter(function(p){return !have[p.id]&&(!v||((p.name||'')+(p.email||'')).toLowerCase().indexOf(v)>=0)}).forEach(function(p){
            var on=!!picked[p.id],b=el('button',{type:'button',role:'checkbox','aria-checked':on?'true':'false',class:'qa-row'},avatar(p.id,p.name),el('span',{class:'qa-rt'},el('b',null,p.name||p.email),el('span',null,p.email||'')),ic(on?'check':'plus',20));
            b.addEventListener('click',function(){if(picked[p.id])delete picked[p.id];else picked[p.id]=1;draw()});list.appendChild(b)});
          if(!list.children.length)list.appendChild(el('p',{class:'qa-empty'},'ไม่พบ · คนนอกบริษัทต้องเข้าบริษัทด้วยรหัสก่อน'))}
        q.addEventListener('input',draw);draw();
      });
      var go_=el('button',{type:'button',class:'qa-btn pri big'},'เพิ่มเข้าโครงการ');
      go_.addEventListener('click',function(){var ids=Object.keys(picked);if(!ids.length)return;go_.disabled=true;
        Promise.all(ids.map(function(u){return W.setMemberRoles(null,u,[role.value])})).then(function(){close();flash('เพิ่ม '+ids.length+' คนแล้ว');reloadAll()},function(e){go_.disabled=false;flash(e.message)})});
      box.appendChild(go_);
    });
  }

  /* ---------- view: roles & permissions (D-Roles, Discord-style) ---------- */
  VIEWS.roles=function(sel){
    mainEl.appendChild(header('ยศและสิทธิ์','ใช้ทั้งบริษัท · ให้ยศรายโครงการได้',{back:'#/company'}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    var admin=!ONLINE||(!M.legacy&&M.company&&M.company.is_admin);
    W.roles().then(function(rs){
      rs=(rs&&rs.length?rs:BUILTIN).slice().sort(function(a,b){return b.position-a.position});
      if(M.legacy)pad.appendChild(el('div',{class:'qa-note warn'},'ตอนนี้ใช้สิทธิ์ตามบทบาท PM / โฟร์แมน / เฮดแมน · การแก้ยศเองยังไม่เปิดใช้ (แจ้งผู้ดูแลระบบ)'));
      if(!sel){
        pad.appendChild(el('div',{class:'qa-note info'},'ยศบนกว่า = อาวุโสกว่า · จัดการได้เฉพาะยศที่ต่ำกว่าตัวเอง · สิทธิ์ของคนที่มีหลายยศรวมกัน · ยศเจ้าของล็อกไว้เพื่อไม่ให้บริษัทถูกล็อกออก'));
        rs.forEach(function(r){var a=el('a',{class:'qa-row qa-card',href:'#/roles/'+encodeURIComponent(r.id)},el('span',{class:'qa-dotc',style:'background:'+r.color}),el('span',{class:'qa-rt'},el('b',null,r.name),el('span',null,BASE_TH[r.base]+' · '+(r.perms.indexOf('*')>=0?'ทุกสิทธิ์':r.perms.length+' สิทธิ์'))),ic('chev',20));pad.appendChild(a)});
        if(admin){var nb=el('button',{type:'button',class:'qa-btn pri'},ic('plus',18),'สร้างยศใหม่');nb.addEventListener('click',function(){W.saveRole({name:'ยศใหม่',color:'#5B6B7F',position:20,base:'viewer',perms:['ins_view']}).then(function(r){go('#/roles/'+encodeURIComponent(r[0].id))},function(e){flash(e.message)})});pad.insertBefore(nb,pad.children[1])}
        return;
      }
      var r=rs.filter(function(x){return x.id===sel})[0];if(!r){pad.appendChild(el('p',{class:'qa-empty'},'ไม่พบยศนี้'));return}
      var locked=r.id==='owner'||!admin,draft=JSON.parse(JSON.stringify(r));
      var nm=el('input',{value:r.name,'aria-label':'ชื่อยศ',disabled:locked||r.builtin&&r.id==='everyone'?true:null}),co=el('input',{type:'color',value:r.color,'aria-label':'สียศ',disabled:locked?true:null,style:'width:64px;padding:0'});
      var base=el('select',{'aria-label':'ระดับสิทธิ์หลัก',disabled:locked||r.builtin?true:null});Object.keys(BASE_TH).forEach(function(k){base.appendChild(el('option',{value:k},BASE_TH[k]))});base.value=r.base;
      var pos=el('input',{type:'number',value:String(r.position),min:'1',max:'95','aria-label':'ลำดับ (สูง = อาวุโส)',disabled:locked||r.builtin?true:null});
      pad.appendChild(el('div',{class:'qa-card',style:'padding:14px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end'},el('label',{class:'qa-field'},el('span',null,'ชื่อยศ'),nm),el('label',{class:'qa-field'},el('span',null,'สี'),co),
        el('label',{class:'qa-field'},el('span',null,'ระดับสิทธิ์หลัก'),base),el('label',{class:'qa-field'},el('span',null,'ลำดับ'),pos)));
      if(locked&&r.id==='owner')pad.appendChild(el('div',{class:'qa-note warn'},'ยศเจ้าของล็อกไว้ทุกสิทธิ์ เพื่อไม่ให้บริษัทถูกล็อกออก'));
      var all=draft.perms.indexOf('*')>=0;
      PERMS.forEach(function(g){var box=el('div',{class:'qa-card',style:'padding:4px 14px'});box.appendChild(el('div',{class:'qa-sec',style:'padding-left:0'},el('span',null,g[0])));
        g[1].forEach(function(p){var on=all||draft.perms.indexOf(p[0])>=0;var sw=el('button',{type:'button',role:'switch',class:'qa-sw','aria-checked':on?'true':'false','aria-label':p[1],disabled:locked||all?true:null});
          sw.addEventListener('click',function(){var i=draft.perms.indexOf(p[0]);if(i>=0)draft.perms.splice(i,1);else draft.perms.push(p[0]);sw.setAttribute('aria-checked',i>=0?'false':'true')});
          box.appendChild(el('div',{class:'qa-perm'},el('div',null,el('b',null,p[1]),p[2]?el('span',null,p[2]):null),sw))});
        pad.appendChild(box)});
      var acts=el('div',{class:'qa-actions'});
      var pv=el('button',{type:'button',class:'qa-btn'},'ดูแอปในฐานะยศนี้');pv.addEventListener('click',function(){M.preview={name:draft.name,perms:draft.perms.slice()};flash('กำลังดูในฐานะ '+draft.name+' · กด “กลับเป็นตัวเอง” ด้านบนเพื่อเลิกดู');go('#/')});acts.appendChild(pv);
      if(!locked){var sv=el('button',{type:'button',class:'qa-btn pri'},'บันทึก');sv.addEventListener('click',function(){
          draft.name=nm.value.trim()||draft.name;draft.color=co.value;draft.base=base.value;draft.position=Math.max(1,Math.min(95,+pos.value||draft.position));
          W.saveRole({id:draft.id,name:draft.name,color:draft.color,position:draft.position,base:draft.base,perms:draft.perms,builtin:draft.builtin}).then(function(){flash('บันทึกยศแล้ว · บันทึกในประวัติแล้ว');go('#/roles')},function(e){flash(e.message)})});acts.appendChild(sv);
        if(!r.builtin){var dl=el('button',{type:'button',class:'qa-btn danger'},'ลบยศ');QCU.arm(dl,{armed:'กดอีกครั้งเพื่อลบ',onConfirm:function(){W.deleteRole(r.id).then(function(){go('#/roles')},function(e){flash(e.message)})}});acts.appendChild(dl)}}
      pad.appendChild(acts);
    });
  };
  VIEWS.audit=function(){
    mainEl.appendChild(header('ประวัติการเปลี่ยนสิทธิ์','ใคร เปลี่ยนอะไร เมื่อไร',{back:'#/company'}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    if(!ONLINE||!W.audit){pad.appendChild(el('p',{class:'qa-empty'},'ใช้ได้ในโหมดออนไลน์'));return}
    var A={insert_role:'สร้างยศ',update_role:'แก้ยศ',delete_role:'ลบยศ',set_roles:'ให้ยศ',remove_member:'นำออกจากโครงการ',approve_baseline:'อนุมัติแผนฐาน'};
    W.audit().then(function(rows){(rows||[]).forEach(function(r){var d=r.detail||{};var what=A[r.action]||r.action;
      var det=r.action==='set_roles'?(d.roles||[]).join(', '):r.action==='update_role'&&d.after?(d.after.name||''):'';
      pad.appendChild(el('div',{class:'qa-ev'},el('span',{class:'dot'}),el('div',null,el('b',null,W.nameOf(r.actor)),txt(' '+what+' '+(r.action==='set_roles'||r.action==='remove_member'?W.nameOf(r.target):'')+(det?' · '+det:'')),el('span',{style:'margin-left:6px;font-size:12px'},fmtDay(r.at)+' '+fmtTime(r.at)))))});
      if(!(rows||[]).length)pad.appendChild(el('p',{class:'qa-empty'},'ยังไม่มีการเปลี่ยนแปลง'))},function(e){pad.appendChild(el('p',{class:'qa-empty'},e.message))});
  };

  /* ---------- view: channel settings (D-ChannelSettings / M9) ---------- */
  VIEWS.cs=function(chId){
    var c=chById(chId);if(!c){mainEl.appendChild(el('p',{class:'qa-empty'},'ไม่พบโซนนี้'));return}
    mainEl.appendChild(header('ตั้งค่า #'+c.name,'ใครเห็น ใครโพสต์ได้',{back:'#/c/'+encodeURIComponent(chId)}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    var nm=el('input',{value:c.name,'aria-label':'ชื่อชั้นหรือโซน'}),cat=el('input',{value:c.category||'','aria-label':'หมวด',list:'qa-cats'}),ref=el('input',{value:c.standard_ref||'','aria-label':'มาตรฐานอ้างอิง',placeholder:'เช่น มยผ. 1103'});
    var dl=el('datalist',{id:'qa-cats'});['โซนงาน','โครงสร้าง','สถาปัตย์','ไฟฟ้า','สุขาภิบาล','ป้องกันอัคคีภัย'].forEach(function(x){dl.appendChild(el('option',{value:x}))});
    var hold=c.hold||'';var tri=el('div',{class:'qa-tri',role:'radiogroup','aria-label':'ชนิดจุดตรวจ'});
    [['','ปกติ'],['W','W เชิญตรวจ'],['H','H หยุดตรวจ']].forEach(function(h){var b=el('button',{type:'button',role:'radio','aria-checked':hold===h[0]?'true':'false'},h[1]);b.addEventListener('click',function(){hold=h[0];tri.querySelectorAll('button').forEach(function(y){y.setAttribute('aria-checked',y===b?'true':'false')})});tri.appendChild(b)});
    pad.appendChild(el('div',{class:'qa-card',style:'padding:14px;display:flex;flex-direction:column;gap:10px'},el('label',{class:'qa-field'},el('span',null,'ชื่อชั้นหรือโซน'),nm),el('label',{class:'qa-field'},el('span',null,'หมวด'),cat,dl),
      el('label',{class:'qa-field'},el('span',null,'มาตรฐานอ้างอิง'),ref),el('div',{class:'qa-field'},el('span',null,'จุดตรวจ'),tri),
      el('p',{style:'margin:0;font-size:12px;color:var(--qa-mu)'},'H = ห้ามทำขั้นต่อไปจนกว่าจะตรวจผ่าน (ผูกกับแผนงาน) · W = แจ้งผู้ตรวจ ถ้าไม่มาตามนัดทำต่อได้')));
    var rows=[];
    if(ONLINE&&!c.virtual){
      var acc=el('div',{class:'qa-card',style:'padding:6px 14px'});acc.appendChild(el('div',{class:'qa-sec',style:'padding-left:0'},el('span',null,'ใครเห็นและพิมพ์ในโซนนี้ได้ · อนุญาต / ตามยศ / ห้าม')));pad.appendChild(acc);
      Promise.all([W.roles(),W.access(chId)]).then(function(r){var rs=(r[0]||[]).filter(function(x){return x.id!=='owner'&&x.id!=='admin'}),cur={};(r[1]||[]).forEach(function(a){cur[a.role_id]=a});
        rs.forEach(function(role){var a=cur[role.id]||{see:'inherit',post:'inherit'},o={role_id:role.id,channel_id:chId,see:a.see,post:a.post};rows.push(o);
          function tri3(k,lbl){var t=el('div',{class:'qa-tri',role:'radiogroup','aria-label':lbl+' '+role.name});[['allow','อนุญาต'],['inherit','ตามยศ'],['deny','ห้าม']].forEach(function(v){var b=el('button',{type:'button',role:'radio','aria-checked':o[k]===v[0]?'true':'false'},v[1]);b.addEventListener('click',function(){o[k]=v[0];t.querySelectorAll('button').forEach(function(y){y.setAttribute('aria-checked',y===b?'true':'false')})});t.appendChild(b)});return t}
          acc.appendChild(el('div',{style:'padding:8px 0;border-top:1px solid var(--qa-bd);display:flex;flex-direction:column;gap:6px'},el('b',null,el('span',{class:'qa-dotc',style:'background:'+role.color+';margin-right:6px'}),txt(role.name)),
            el('div',{style:'display:flex;gap:8px;flex-wrap:wrap;align-items:center'},el('span',{style:'width:56px;font-size:13px'},'เห็น'),tri3('see','ใครเห็น')),el('div',{style:'display:flex;gap:8px;flex-wrap:wrap;align-items:center'},el('span',{style:'width:56px;font-size:13px'},'โพสต์'),tri3('post','ใครโพสต์'))))})});
    }
    var sv=el('button',{type:'button',class:'qa-btn pri big'},'บันทึก');
    sv.addEventListener('click',function(){sv.disabled=true;var rename=nm.value.trim()&&nm.value.trim()!==c.name;
      saveCh({id:ONLINE&&!M.legacy?c.id:undefined,project_id:c.project_id,name:nm.value.trim()||c.name,category:cat.value.trim()||'โซนงาน',kind:c.kind,hold:hold||null,standard_ref:ref.value.trim(),position:c.position||0})
        .then(function(){return rows.length?W.setAccess(rows):null}).then(function(){flash('บันทึกแล้ว');if(rename)syncZones();return reloadChannels()}).then(function(){go('#/c/'+encodeURIComponent(chId))},function(e){sv.disabled=false;flash(e.message)})});
    pad.appendChild(sv);
  };

  /* ---------- view: new project (M6 / D-NewProject): channels from floors, forms by work category ---------- */
  VIEWS.newproject=function(){
    mainEl.appendChild(header('สร้างโครงการ','ใส่จำนวนชั้น แล้วแอปแบ่งชั้นให้',{back:'#/'}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    if(ONLINE&&!(M.me&&M.me.org_role==='admin')){pad.appendChild(el('div',{class:'qa-note info'},'สร้างโครงการได้เฉพาะแอดมินบริษัท · ขอให้แอดมินสร้าง แล้วเพิ่มคุณเป็น PM'));return}
    var name=el('input',{'aria-label':'ชื่อโครงการ',placeholder:'เช่น อาคารพักอาศัย 8 ชั้น'}),site=el('input',{'aria-label':'สถานที่',placeholder:'เช่น บางนา'});
    var floors=el('input',{type:'number',min:'0',max:'80',value:'5','aria-label':'จำนวนชั้น'}),base=el('input',{type:'checkbox',checked:true,id:'qa-np-b'}),roof=el('input',{type:'checkbox',checked:true,id:'qa-np-r'});
    var prev=el('div',{style:'display:flex;gap:6px;flex-wrap:wrap'});
    function zones(){var z=[];if(base.checked)z.push('ฐานราก');for(var i=1;i<=Math.min(80,+floors.value||0);i++)z.push('ชั้น '+i);if(roof.checked)z.push('หลังคา');return z}
    function draw(){prev.textContent='';zones().forEach(function(z){prev.appendChild(el('span',{class:'qa-pill qa-p-mu'},'#'+z))});prev.appendChild(el('span',{class:'qa-pill qa-p-mu'},'! ประกาศ'))}
    [floors,base,roof].forEach(function(i){i.addEventListener('input',draw);i.addEventListener('change',draw)});draw();
    pad.appendChild(el('div',{class:'qa-card',style:'padding:14px;display:flex;flex-direction:column;gap:10px'},el('label',{class:'qa-field'},el('span',null,'ชื่อโครงการ'),name),el('label',{class:'qa-field'},el('span',null,'สถานที่'),site),
      el('label',{class:'qa-field'},el('span',null,'จำนวนชั้น'),floors),el('label',{style:'display:flex;gap:8px;align-items:center;min-height:44px'},base,txt('มีฐานราก')),el('label',{style:'display:flex;gap:8px;align-items:center;min-height:44px'},roof,txt('มีหลังคา')),
      el('div',{class:'qa-field'},el('span',null,'ชั้นและโซนที่จะมี'),prev)));
    pad.appendChild(el('p',{style:'font-size:13px;color:var(--qa-mu)'},'เพิ่มหรือแก้ชั้นและโซนภายหลังได้ · แบบฟอร์มตรวจงานทุกแบบใช้ได้ทุกโครงการ'));
    var go_=el('button',{type:'button',class:'qa-btn pri big'},'สร้างโครงการ');
    go_.addEventListener('click',function(){var n=name.value.trim();if(!n){name.focus();return}go_.disabled=true;var z=zones();
      try{localStorage.setItem('qc-zones:'+n,JSON.stringify(z))}catch(e){}
      W.createProject(n,site.value.trim()).then(function(r){
        if(!ONLINE){W.switchProject(r.id);flash('สร้างโครงการแล้ว');go('#/');return}
        /* online: zones on the project, then the PM opens it (channels are made on first visit) */
        var api=window.__qcOnline;var pid=r&&r.id;
        flash('สร้างโครงการแล้ว · เพิ่มคนเข้าโครงการได้ที่ “สมาชิก”');
        lsSJ('qa-newproj-zones',{id:pid,zones:z});setTimeout(function(){W.switchProject(pid)},600);
      },function(e){go_.disabled=false;flash('สร้างไม่สำเร็จ: '+e.message)})});
    pad.appendChild(go_);
  };

  /* ---------- view: overview (M39 / D-Overview) ---------- */
  VIEWS.overview=function(){
    mainEl.appendChild(header('ภาพรวมโครงการ','อัปเดต '+fmtTime(new Date().toISOString()),{back:'#/'}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    var t=tasks(),openAll=M.items.filter(function(x){return x.st.open});
    var kp=el('div',{style:'display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px'});
    [[openAll.length,'จุดค้างแก้ทั้งหมด','var(--qa-tx)','#/tasks/mine'],[t.late.length,'เลยกำหนด','var(--qa-red)','#/tasks/late'],[openAll.filter(function(x){return x.st.k==='re'}).length,'รอตรวจซ้ำ','var(--qa-blu)','#/tasks/re'],[M.docs.length,'รายงานทั้งหมด','var(--qa-tx)',null]].forEach(function(k){
      kp.appendChild(el(k[3]?'a':'div',{class:'qa-kpi',href:k[3]||null,style:'min-height:76px'},el('b',{style:'font-size:26px;color:'+k[2]},String(k[0])),el('span',null,k[1])))});
    pad.appendChild(kp);
    var held=M.channels.filter(function(c){return c.hold==='H'&&itemsIn(c.id).some(function(x){return x.st.open})});
    held.forEach(function(c){pad.appendChild(el('a',{class:'qa-note bad',href:'#/c/'+encodeURIComponent(c.id),style:'text-decoration:none;color:inherit;display:flex;gap:10px'},ic('lock',22),el('span',null,el('b',null,'จุดหยุดตรวจยังไม่ผ่าน: #'+c.name),el('br'),txt('ยังมี '+itemsIn(c.id).filter(function(x){return x.st.open}).length+' รายการต้องแก้ · งานในแผนที่ผูกไว้ยังเริ่มไม่ได้'))))});
    progressCard(pad);
    var zs=el('div',{class:'qa-card',style:'padding:10px 14px'});zs.appendChild(el('div',{class:'qa-sec',style:'padding-left:0'},el('span',null,'จุดค้างแก้ แยกตามชั้น/โซน')));
    var max=1,rowsZ=M.channels.filter(function(c){return c.kind==='zone'}).map(function(c){var o=itemsIn(c.id).filter(function(x){return x.st.open});max=Math.max(max,o.length);return [c,o.length,o.filter(function(x){return x.st.late}).length]});
    rowsZ.forEach(function(r){zs.appendChild(el('a',{href:'#/c/'+encodeURIComponent(r[0].id),style:'min-height:44px;display:flex;align-items:center;gap:10px;text-decoration:none;color:inherit'},el('span',{style:'width:96px;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'},'#'+r[0].name),
      el('span',{style:'flex:1;height:10px;border-radius:5px;background:var(--qa-soft);overflow:hidden;display:flex'},el('span',{style:'height:100%;background:var(--qa-blu);width:'+((r[1]-r[2])/max*100)+'%'}),el('span',{style:'height:100%;background:#C2372E;width:'+(r[2]/max*100)+'%'})),el('b',{style:'width:28px;text-align:right'},String(r[1]))))});
    zs.appendChild(el('span',{style:'font-size:12px;color:var(--qa-mu)'},'แถบแดง = เลยกำหนด'));pad.appendChild(zs);
    var who={};openAll.filter(function(x){return x.st.late&&x.it.asg}).forEach(function(x){who[x.it.asg]=(who[x.it.asg]||0)+1});
    if(Object.keys(who).length){var pc=el('div',{class:'qa-card'});Object.keys(who).forEach(function(u){pc.appendChild(el('div',{class:'qa-row',style:'cursor:default'},avatar(u,W.nameOf(u)),el('span',{class:'qa-rt'},el('b',null,W.nameOf(u))),el('b',{style:'color:#C2372E'},String(who[u]))))});
      pad.append(el('div',{class:'qa-sec'},el('span',null,'คนที่มีงานเลยกำหนด')),pc)}
  };

  /* ---------- plan (D-Plan / M40): master, 3-week look-ahead, this week ---------- */
  function dIso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function dAdd(iso,n){var d=new Date(iso+'T00:00:00');d.setDate(d.getDate()+n);return dIso(d)}
  function dDiff(a,b){return Math.round((new Date(a+'T00:00:00')-new Date(b+'T00:00:00'))/864e5)}
  function monday(iso){var d=new Date((iso||today())+'T00:00:00');d.setDate(d.getDate()-((d.getDay()+6)%7));return dIso(d)}
  /* simple CPM over calendar days: FS/SS/FF with lag; the planned start is a "start no earlier than" */
  function cpm(ts){
    var by={},order=[],seen={},onStack={};ts.forEach(function(t){by[t.id]=t});
    function visit(t){if(seen[t.id])return;if(onStack[t.id])return;onStack[t.id]=1;(t.preds||[]).forEach(function(p){if(by[p.id])visit(by[p.id])});onStack[t.id]=0;seen[t.id]=1;order.push(t)}
    ts.forEach(visit);
    var R={};
    order.forEach(function(t){var es=t.start||today(),d=Math.max(0,+t.dur||0);
      (t.preds||[]).forEach(function(p){var q=R[p.id];if(!q)return;var lag=+p.lag||0;
        if(p.type==='SS')es=maxD(es,dAdd(q.es,lag));else if(p.type==='FF')es=maxD(es,dAdd(q.ef,lag-d));else es=maxD(es,dAdd(q.ef,lag))});
      R[t.id]={es:es,ef:dAdd(es,d),dur:d}});
    var end=order.reduce(function(m,t){return maxD(m,R[t.id].ef)},today());
    order.slice().reverse().forEach(function(t){var r=R[t.id],lf=end;
      ts.forEach(function(s){(s.preds||[]).forEach(function(p){if(p.id!==t.id||!R[s.id]||R[s.id].ls==null)return;var lag=+p.lag||0,q=R[s.id];
        var v=p.type==='SS'?dAdd(q.ls,-lag+r.dur):p.type==='FF'?dAdd(q.lf,-lag):dAdd(q.ls,-lag);if(v<lf)lf=v})});
      r.lf=lf;r.ls=dAdd(lf,-r.dur);r.float=dDiff(r.ls,r.es);r.crit=r.float<=0});
    return {R:R,end:end};
  }
  function maxD(a,b){return a>b?a:b}
  function heldBy(t){var c=t.hold_channel_id&&chById(t.hold_channel_id);if(!c)return null;var o=itemsIn(c.id).filter(function(x){return x.st.open});return o.length?{ch:c,n:o.length}:null}
  function weightOf(t,mode){return mode==='days'?Math.max(1,+t.dur||1):(+t.weight||0)}
  function plannedPct(ts,R,mode,at){var W_=0,P=0;ts.forEach(function(t){var w=weightOf(t,mode),r=R[t.id];if(!r)return;W_+=w;
      var f=r.dur?Math.max(0,Math.min(1,dDiff(at,r.es)/r.dur)):(at>=r.es?1:0);P+=w*f});return W_?P/W_*100:0}
  function actualPct(ts,mode){var W_=0,P=0;ts.forEach(function(t){var w=weightOf(t,mode);W_+=w;P+=w*(+t.pct||0)/100});return W_?P/W_*100:0}
  function planMode(){var p=M.projects.filter(function(x){return x.id===M.project})[0]||{};return lsJ('qa-wt:'+M.project,p.weighting||'boq')}
  function scurve(ts,R,base,mode){
    var all=ts.map(function(t){return R[t.id]}).filter(Boolean);if(!all.length)return null;
    var s=all.reduce(function(m,r){return r.es<m?r.es:m},all[0].es),e=all.reduce(function(m,r){return r.ef>m?r.ef:m},all[0].ef),n=Math.max(1,dDiff(e,s));
    var BR=null;if(base&&base.snapshot&&base.snapshot.length){BR=cpm(base.snapshot).R}
    var Wd=320,Hd=120,pts=[],bpts=[];
    for(var i=0;i<=20;i++){var at=dAdd(s,Math.round(n*i/20));pts.push([i/20*Wd,Hd-plannedPct(ts,R,mode,at)/100*Hd]);if(BR)bpts.push([i/20*Wd,Hd-plannedPct(base.snapshot,BR,mode,at)/100*Hd])}
    var tx=Math.max(0,Math.min(1,dDiff(today(),s)/n))*Wd,ty=Hd-actualPct(ts,mode)/100*Hd;
    function path(a){return a.map(function(p,i){return (i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)}).join(' ')}
    var svg='<svg viewBox="-4 -4 '+(Wd+8)+' '+(Hd+8)+'" width="100%" height="140" role="img" aria-label="กราฟความคืบหน้าสะสม: แผน และ ทำได้จริง">'+
      '<rect x="0" y="0" width="'+Wd+'" height="'+Hd+'" fill="#F6F8FA" stroke="#DDE3EA"/>'+
      (BR?'<path d="'+path(bpts)+'" fill="none" stroke="#5B6B7F" stroke-width="2" stroke-dasharray="5 4"/>':'')+
      '<path d="'+path(pts)+'" fill="none" stroke="#2F5D9A" stroke-width="2.5"/>'+
      '<line x1="'+tx+'" x2="'+tx+'" y1="0" y2="'+Hd+'" stroke="#B26B00" stroke-width="1.5"/>'+
      '<circle cx="'+tx+'" cy="'+ty+'" r="5" fill="#1E7A46"/></svg>';
    var w=el('div');w.innerHTML=svg;return w.firstChild;
  }
  function progressCard(pad){
    var box=el('div',{class:'qa-card',style:'padding:12px 14px;display:flex;flex-direction:column;gap:8px'});pad.appendChild(box);
    box.appendChild(el('b',null,'ความคืบหน้าตามแผน'));
    Promise.all([W.plan(),W.baselines()]).then(function(r){var ts=r[0]||[],base=(r[1]||[])[0];
      if(!ts.length){box.appendChild(el('span',{style:'color:var(--qa-mu)'},'ยังไม่มีแผนงาน · เพิ่มได้ที่ “แผนงาน”'));return}
      var mode=planMode(),C=cpm(ts),pl=plannedPct(ts,C.R,mode,today()),ac=actualPct(ts,mode),gap=ac-pl;
      box.append(el('div',{style:'display:flex;gap:16px;flex-wrap:wrap'},el('span',null,'แผน ',el('b',null,pl.toFixed(1)+'%')),el('span',null,'ทำได้ ',el('b',null,ac.toFixed(1)+'%')),
        el('span',{style:'color:'+(gap<-5?'var(--qa-red)':gap<0?'var(--qa-ora)':'var(--qa-grn)')},(gap>=0?'เร็วกว่าแผน ':'ช้ากว่าแผน ')+Math.abs(gap).toFixed(1)+'%')),
        el('span',{style:'font-size:12px;color:var(--qa-mu)'},'ถ่วงน้ำหนักด้วย'+(mode==='days'?'จำนวนวัน':'มูลค่าตาม BOQ')+(base?' · แผนฐานอนุมัติ '+fmtDate(base.approved_at):' · ยังไม่มีแผนฐาน')));
      var sv=scurve(ts,C.R,base,mode);if(sv)box.appendChild(sv);
      box.appendChild(el('a',{href:'#/plan',class:'qa-btn sm'},'เปิดแผนงาน'));
    }).catch(function(){box.appendChild(el('span',{style:'color:var(--qa-mu)'},'โหลดแผนงานไม่สำเร็จ'))});
  }
  VIEWS.plan=function(tab){
    tab=tab||'master';
    var right=[];
    mainEl.appendChild(header('แผนงาน','แผนหลัก · 3 สัปดาห์ · สัปดาห์นี้',{back:'#/',right:right}));
    var tl=el('div',{role:'tablist','aria-label':'มุมมองแผน',style:'display:flex;gap:6px;padding:8px 12px;background:var(--qa-card);border-bottom:1px solid var(--qa-bd);overflow-x:auto'});
    [['master','แผนหลัก'],['3w','3 สัปดาห์'],['week','สัปดาห์นี้']].forEach(function(x){tl.appendChild(el('a',{role:'tab',href:'#/plan/'+x[0],'aria-selected':tab===x[0]?'true':'false',class:'qa-chip'+(tab===x[0]?' on':''),style:tab===x[0]?'background:var(--qa-on-bg);color:var(--qa-on-tx)':''},x[1]))});
    mainEl.appendChild(tl);
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    Promise.all([W.plan(),W.baselines()]).then(function(r){
      var ts=(r[0]||[]).slice().sort(function(a,b){return (a.position||0)-(b.position||0)}),bases=r[1]||[],base=bases[0],C=cpm(ts),mode=planMode();
      var BR=base&&base.snapshot?cpm(base.snapshot).R:null;
      if(tab==='week'){planWeek(pad,ts,C);return}
      /* summary + settings */
      progressCard(pad);
      var bar=el('div',{class:'qa-actions'});
      if(can('pl_edit')){var add=el('button',{type:'button',class:'qa-btn pri'},ic('plus',18),'เพิ่มงาน');add.addEventListener('click',function(){taskSheet(null,ts)});bar.appendChild(add)}
      var wt=el('select',{'aria-label':'ถ่วงน้ำหนักความคืบหน้า',style:'min-height:44px;border-radius:8px;border:1px solid #C9D2DC;padding:0 8px'},el('option',{value:'boq'},'ถ่วงด้วยมูลค่า BOQ'),el('option',{value:'days'},'ถ่วงด้วยจำนวนวัน'));
      wt.value=mode;wt.addEventListener('change',function(){lsSJ('qa-wt:'+M.project,wt.value);if(can('pl_edit'))W.setProject({weighting:wt.value}).catch(function(){});render()});bar.appendChild(wt);
      if(can('pl_baseline')&&ts.length){var ap=el('button',{type:'button',class:'qa-btn'},ic('lock',18),'อนุมัติแผนฐาน');
        QCU.arm(ap,{armed:'กดอีกครั้ง: ล็อกแผนนี้เป็นเส้นฐาน',timeoutMs:4000,onConfirm:function(){W.approveBaseline().then(function(){flash('อนุมัติแผนฐานแล้ว · ใช้วัดความคืบหน้าและงวดงาน');reloadAll()},function(e){flash(e.message)})}});bar.appendChild(ap)}
      pad.appendChild(bar);
      if(base)pad.appendChild(el('p',{style:'margin:0;font-size:12px;color:var(--qa-mu)'},'แผนฐานล่าสุด: อนุมัติโดย '+W.nameOf(base.approved_by)+' · '+fmtDate(base.approved_at)+' · เส้นเทาใต้แถบ = แผนฐาน'));
      var list=ts;
      var from=today(),to=dAdd(from,21);
      if(tab==='3w')list=ts.filter(function(t){var x=C.R[t.id];return x&&x.es<=to&&x.ef>=from&&(+t.pct||0)<100});
      if(!list.length){pad.appendChild(el('p',{class:'qa-empty'},tab==='3w'?'ไม่มีงานใน 3 สัปดาห์ข้างหน้า':'ยังไม่มีงานในแผน'+(can('pl_edit')?' · กด “เพิ่มงาน”':'')));return}
      var s0=list.reduce(function(m,t){return C.R[t.id].es<m?C.R[t.id].es:m},C.R[list[0].id].es);if(tab==='3w')s0=from;
      var e0=tab==='3w'?to:list.reduce(function(m,t){return C.R[t.id].ef>m?C.R[t.id].ef:m},C.R[list[0].id].ef),span=Math.max(1,dDiff(e0,s0));
      var card=el('div',{class:'qa-card'});pad.appendChild(card);
      list.forEach(function(t){var x=C.R[t.id],h=heldBy(t),b=BR&&BR[t.id];
        var g=el('div',{class:'qa-gantt','aria-hidden':'true'});
        var L=Math.max(0,dDiff(x.es,s0))/span*100,Wd=Math.max(1.5,Math.min(100-L,(x.dur||0.5)/span*100));
        var bar_=el('span',{class:'b'+(x.crit?' crit':''),style:'left:'+L+'%;width:'+Wd+'%'},el('i',{style:'width:'+(+t.pct||0)+'%'}));g.appendChild(bar_);
        if(b){var bl=Math.max(0,dDiff(b.es,s0))/span*100;g.appendChild(el('span',{class:'bl',style:'left:'+bl+'%;width:'+Math.max(1,b.dur/span*100)+'%'}))}
        var late=b&&x.ef>b.ef?dDiff(x.ef,b.ef):0;
        var rowEl=el('button',{type:'button',class:'qa-row',style:'flex-direction:column;align-items:stretch;gap:4px'},
          el('div',{style:'display:flex;gap:8px;align-items:baseline'},el('b',{style:'flex:1;min-width:0'},(t.wbs?t.wbs+' ':'')+t.name),el('span',{style:'font-size:13px;color:var(--qa-mu)'},Math.round(+t.pct||0)+'%')),
          el('span',{style:'font-size:12px;color:var(--qa-mu)'},fmtDate(x.es)+' – '+fmtDate(x.ef)+' · '+x.dur+' วัน'+(x.crit?' · เส้นงานวิกฤต':' · เผื่อ '+x.float+' วัน')+(late?' · ช้ากว่าแผนฐาน '+late+' วัน':'')+(t.assignee?' · '+W.nameOf(t.assignee):'')),g);
        if(h)rowEl.appendChild(el('span',{class:'qa-pill qa-p-bad'},ic('lock',14),'รอจุดหยุดตรวจ #'+h.ch.name+' ผ่าน ('+h.n+' รายการค้าง)'));
        rowEl.addEventListener('click',function(){taskSheet(t,ts)});card.appendChild(rowEl)});
      pad.appendChild(el('p',{style:'font-size:12px;color:var(--qa-mu)'},'แถบส้ม = เส้นงานวิกฤต (เลื่อนแล้วงานทั้งโครงการเลื่อน) · ส่วนเข้ม = ทำได้แล้ว'));
    }).catch(function(e){pad.appendChild(el('p',{class:'qa-empty'},'โหลดแผนไม่สำเร็จ: '+e.message))});
  };
  function taskSheet(t,ts){
    var edit=can('pl_edit'),prog=can('pl_progress')||edit;
    sheet(t?t.name:'งานใหม่',function(box,close){
      var d=t?JSON.parse(JSON.stringify(t)):{name:'',wbs:'',start:today(),dur:5,weight:0,pct:0,preds:[],channel_id:null,hold_channel_id:null};
      function inp(lbl,k,type,extra){var i=el('input',Object.assign({type:type||'text',value:d[k]==null?'':String(d[k]),'aria-label':lbl,disabled:edit?null:true},extra||{}));i.addEventListener('input',function(){d[k]=type==='number'?+i.value:i.value});return el('label',{class:'qa-field'},el('span',null,lbl),i)}
      box.append(inp('ชื่องาน','name'),el('div',{style:'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px'},inp('รหัสงาน (WBS)','wbs'),inp('เริ่มไม่ก่อน','start','date')),
        el('div',{style:'display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px'},inp('ระยะเวลา (วัน)','dur','number',{min:'0'}),inp('มูลค่าตาม BOQ (บาท)','weight','number',{min:'0'})));
      function chSel(lbl,k,filter){var s=el('select',{'aria-label':lbl,disabled:edit?null:true,style:'min-height:48px;border-radius:8px;border:1px solid #C9D2DC;padding:0 8px'},el('option',{value:''},'—'));
        M.channels.filter(filter).forEach(function(c){s.appendChild(el('option',{value:c.id},'#'+c.name+(c.hold?' ('+c.hold+')':'')))});s.value=d[k]||'';s.addEventListener('change',function(){d[k]=s.value||null});return el('label',{class:'qa-field'},el('span',null,lbl),s)}
      box.append(chSel('ชั้น / โซน','channel_id',function(c){return c.kind==='zone'}),chSel('ต้องรอจุดหยุดตรวจผ่านก่อน','hold_channel_id',function(c){return c.hold==='H'}));
      /* predecessors */
      var pr=el('div',{class:'qa-field'},el('span',null,'งานก่อนหน้า'));var plist=el('div',{style:'display:flex;flex-direction:column;gap:6px'});pr.appendChild(plist);
      function drawP(){plist.textContent='';(d.preds||[]).forEach(function(p,i){var o=ts.filter(function(x){return x.id===p.id})[0];
        var rm=el('button',{type:'button',class:'qa-ib','aria-label':'เอางานก่อนหน้าออก',disabled:edit?null:true},ic('x',18));rm.addEventListener('click',function(){d.preds.splice(i,1);drawP()});
        plist.appendChild(el('div',{style:'display:flex;gap:6px;align-items:center'},el('span',{style:'flex:1'},(o?o.name:'(ลบแล้ว)')+' · '+({FS:'เสร็จแล้วเริ่ม',SS:'เริ่มพร้อมกัน',FF:'เสร็จพร้อมกัน'}[p.type]||p.type)+(+p.lag?' +'+p.lag+' วัน':'')),rm))});
        if(edit){var s=el('select',{'aria-label':'เพิ่มงานก่อนหน้า',style:'min-height:44px;border-radius:8px;border:1px solid #C9D2DC'},el('option',{value:''},'+ เพิ่มงานก่อนหน้า'));
          ts.filter(function(x){return !t||x.id!==t.id}).forEach(function(x){s.appendChild(el('option',{value:x.id},x.name))});
          var ty=el('select',{'aria-label':'ความสัมพันธ์',style:'min-height:44px;border-radius:8px;border:1px solid #C9D2DC'},el('option',{value:'FS'},'เสร็จแล้วเริ่ม'),el('option',{value:'SS'},'เริ่มพร้อมกัน'),el('option',{value:'FF'},'เสร็จพร้อมกัน'));
          var lag=el('input',{type:'number',value:'0','aria-label':'เผื่อ (วัน)',style:'width:72px;min-height:44px'});
          s.addEventListener('change',function(){if(!s.value)return;d.preds=d.preds||[];d.preds.push({id:s.value,type:ty.value,lag:+lag.value||0});drawP()});
          plist.appendChild(el('div',{style:'display:flex;gap:6px;flex-wrap:wrap;align-items:center'},s,ty,el('label',{style:'display:inline-flex;align-items:center;gap:6px;font-size:13px'},'เผื่อ',lag,'วัน')))}}
      drawP();box.appendChild(pr);
      if(prog&&t){var pc=el('input',{type:'range',min:'0',max:'100',step:'5',value:String(+d.pct||0),'aria-label':'ความคืบหน้า %'}),pv=el('b',null,(+d.pct||0)+'%');
        pc.addEventListener('input',function(){d.pct=+pc.value;pv.textContent=pc.value+'%'});box.appendChild(el('label',{class:'qa-field'},el('span',null,'ความคืบหน้า ',pv),pc))}
      var h=t&&heldBy(t);if(h)box.appendChild(el('div',{class:'qa-note bad'},'ยังเริ่มไม่ได้: จุดหยุดตรวจ #'+h.ch.name+' ยังค้าง '+h.n+' รายการ'));
      var acts=el('div',{class:'qa-actions'});
      if(edit||prog){var sv=el('button',{type:'button',class:'qa-btn pri big'},'บันทึก');sv.addEventListener('click',function(){
          if(!String(d.name||'').trim()){flash('ใส่ชื่องาน');return}
          if(h&&(+d.pct||0)>(+t.pct||0)){flash('ยังเริ่มไม่ได้จนกว่าจุดหยุดตรวจ #'+h.ch.name+' จะผ่าน');return}
          var row={id:d.id,name:d.name.trim(),wbs:d.wbs||'',start:d.start||today(),dur:Math.max(0,+d.dur||0),weight:+d.weight||0,pct:Math.max(0,Math.min(100,+d.pct||0)),preds:d.preds||[],channel_id:d.channel_id||null,hold_channel_id:d.hold_channel_id||null,position:t?t.position:ts.length};
          if(!row.id)delete row.id;sv.disabled=true;W.savePlanTask(row).then(function(){close();flash('บันทึกแล้ว');reloadAll()},function(e){sv.disabled=false;flash(e.message)})});acts.appendChild(sv)}
      if(edit&&t){var dl=el('button',{type:'button',class:'qa-btn danger'},'ลบงาน');QCU.arm(dl,{armed:'กดอีกครั้งเพื่อลบงานนี้',onConfirm:function(){W.deletePlanTask(t.id).then(function(){close();reloadAll()},function(e){flash(e.message)})}});acts.appendChild(dl)}
      box.appendChild(acts);
    });
  }
  var CM_TH={assigned:'รอรับปาก',promised:'รับปากแล้ว',declined:'ทำไม่ได้',blocked:'ติดอุปสรรค',done:'เสร็จ',held:'รอจุดหยุดตรวจ'};
  function planWeek(pad,ts,C){
    var wk=monday(),end=dAdd(wk,6);
    var cand=ts.filter(function(t){var x=C.R[t.id];return x&&x.es<=end&&x.ef>=wk&&(+t.pct||0)<100});
    pad.appendChild(el('p',{style:'margin:0;color:var(--qa-mu)'},'สัปดาห์ '+fmtDate(wk)+' – '+fmtDate(end)+' · มอบงาน → คนรับปาก → รายงานเสร็จ/ติดอุปสรรค'));
    if(!ONLINE){pad.appendChild(el('div',{class:'qa-note info'},'การมอบงานและรับปากใช้ได้ในโหมดออนไลน์ · ในโหมดนี้ปรับ % ได้ที่แผนหลัก'))}
    W.commitments(cand.map(function(t){return t.id})).then(function(cm){cm=(cm||[]).filter(function(c){return c.week===wk});
      var by={};cm.forEach(function(c){by[c.task_id]=c});
      var ppc=cm.length?Math.round(cm.filter(function(c){return c.state==='done'}).length/cm.length*100):null;
      if(ppc!=null)pad.appendChild(el('div',{class:'qa-card',style:'padding:12px 14px'},el('b',null,'ทำตามที่รับปาก (PPC) '+ppc+'%'),el('span',{style:'display:block;font-size:12px;color:var(--qa-mu)'},'งานที่เสร็จ ÷ งานที่รับปากสัปดาห์นี้')));
      cand.forEach(function(t){var c=by[t.id],h=heldBy(t);
        var card=el('div',{class:'qa-card',style:'padding:10px 12px;display:flex;flex-direction:column;gap:6px'},el('b',null,t.name),
          el('span',{style:'font-size:13px;color:var(--qa-mu)'},fmtDate(C.R[t.id].es)+' – '+fmtDate(C.R[t.id].ef)+' · '+Math.round(+t.pct||0)+'%'+(c?' · '+W.nameOf(c.user_id)+': '+(CM_TH[c.state]||c.state):' · ยังไม่มอบ')));
        if(c&&c.blocker)card.appendChild(el('span',{class:'qa-pill qa-p-bad'},'อุปสรรค: '+c.blocker));
        if(h)card.appendChild(el('span',{class:'qa-pill qa-p-bad'},'รอจุดหยุดตรวจ #'+h.ch.name));
        if(ONLINE&&!c&&can('pl_assign')){var a=el('button',{type:'button',class:'qa-btn sm'},'มอบงานสัปดาห์นี้');a.addEventListener('click',function(){assignSheet(t,wk)});card.appendChild(a)}
        if(ONLINE&&c&&c.user_id===myId())card.appendChild(answerRow(t,c));
        pad.appendChild(card)});
      if(!cand.length)pad.appendChild(el('p',{class:'qa-empty'},'ไม่มีงานในแผนสัปดาห์นี้'));
    }).catch(function(e){pad.appendChild(el('p',{class:'qa-empty'},e.message))});
  }
  function answerRow(t,c){
    var w=el('div',{class:'qa-actions'});
    [['promised','รับปาก'],['done','เสร็จ'],['blocked','ติดอุปสรรค'],['declined','ทำไม่ได้']].forEach(function(s){if(c.state===s[0])return;
      var b=el('button',{type:'button',class:'qa-btn sm'+(s[0]==='done'||s[0]==='promised'?' pri':'')},s[1]);
      b.addEventListener('click',function(){var why='';if(s[0]==='blocked'||s[0]==='declined'){why=prompt('เหตุผล (เช่น ของยังไม่มา ฝนตก)')||'';if(!why)return}
        W.answer(t.id,c.week,s[0],why,s[0]==='done'?100:null).then(function(st){flash(st==='held'?'ยังเริ่มไม่ได้: จุดหยุดตรวจยังไม่ผ่าน':'บันทึกแล้ว');reloadAll()},function(e){flash(e.message)})});w.appendChild(b)});
    return w;
  }
  function assignSheet(t,wk){
    sheet('มอบงาน · '+t.name,function(box,close){
      var s=el('select',{'aria-label':'มอบให้',style:'min-height:48px;border-radius:8px;border:1px solid #C9D2DC'});
      W.projectPeople().then(function(ps){(ps||[]).forEach(function(p){s.appendChild(el('option',{value:p.id},p.name||p.email))})});
      var b=el('button',{type:'button',class:'qa-btn pri big'},'มอบงาน');
      b.addEventListener('click',function(){if(!s.value)return;b.disabled=true;W.assign({task_id:t.id,week:wk,user_id:s.value}).then(function(){close();flash('มอบงานแล้ว · รอรับปาก');reloadAll()},function(e){b.disabled=false;flash(e.message)})});
      box.append(el('label',{class:'qa-field'},el('span',null,'มอบให้'),s),b);
    });
  }
  function planTasksMine(pad){
    if(!ONLINE){pad.appendChild(el('p',{class:'qa-empty'},'งานในแผนที่ถูกมอบให้คุณใช้ได้ในโหมดออนไลน์'));return}
    Promise.all([W.plan(),null]).then(function(r){var ts=r[0]||[],C=cpm(ts),wk=monday();
      return W.commitments(ts.map(function(t){return t.id})).then(function(cm){
        var mine=(cm||[]).filter(function(c){return c.user_id===myId()&&c.week===wk});
        mine.forEach(function(c){var t=ts.filter(function(x){return x.id===c.task_id})[0];if(!t)return;
          var card=el('div',{class:'qa-card',style:'padding:10px 12px;display:flex;flex-direction:column;gap:6px'},el('b',null,t.name),el('span',{style:'font-size:13px;color:var(--qa-mu)'},(CM_TH[c.state]||c.state)+' · '+fmtDate(C.R[t.id].es)+' – '+fmtDate(C.R[t.id].ef)));
          card.appendChild(answerRow(t,c));pad.appendChild(card)});
        if(!mine.length)pad.appendChild(el('p',{class:'qa-empty'},'สัปดาห์นี้ยังไม่มีงานในแผนที่มอบให้คุณ'));
      })}).catch(function(e){pad.appendChild(el('p',{class:'qa-empty'},e.message))});
  }

  /* ---------- welcome / first run (M33) ---------- */
  VIEWS.welcome=function(){
    mainEl.appendChild(header('เริ่มใช้งาน','',{back:'#/me'}));
    var sc=scroller(),pad=el('div',{class:'qa-pad'});sc.appendChild(pad);mainEl.appendChild(sc);
    var steps=[['ติดตั้งแอปลงเครื่อง','เปิดเร็วขึ้น ใช้ได้แม้ไม่มีสัญญาณ · Android: เมนู ⋮ › ติดตั้งแอป · iPhone: แชร์ › เพิ่มไปยังหน้าจอโฮม'],
      ['อนุญาตกล้อง','ใช้ถ่ายรูปก่อน/หลังแก้ · กดอนุญาตเมื่อเบราว์เซอร์ถาม'],
      [ONLINE?'อนุญาตการแจ้งเตือน':'สำรองข้อมูลเป็นไฟล์',ONLINE?'รู้ทันทีเมื่อมีงานแก้ ใบขอตรวจ หรือข้อความถึงคุณ':'ข้อมูลอยู่ในเครื่องนี้ · สำรองเป็น ZIP อย่างน้อยสัปดาห์ละครั้ง'],
      ['ใช้แบบนี้','เลือกชั้นหรือโซนที่จะตรวจ · กด “+ รายงาน” เพื่อเริ่มตรวจ · แตะจุดที่ต้องแก้เพื่อคุยกับทีมและดูว่าแก้แล้วหรือยัง · “งานของฉัน” คือสิ่งที่คุณต้องทำต่อ']];
    steps.forEach(function(s,i){pad.appendChild(el('div',{class:'qa-card',style:'padding:12px 14px;display:flex;gap:12px'},el('b',{style:'width:28px;height:28px;border-radius:14px;background:var(--qa-pri);color:#fff;display:flex;align-items:center;justify-content:center'},String(i+1)),el('div',null,el('b',null,s[0]),el('p',{style:'margin:4px 0 0;color:var(--qa-mu)'},s[1]))))});
    if(ONLINE&&'Notification' in window&&Notification.permission==='default'){var nb=el('button',{type:'button',class:'qa-btn pri'},'อนุญาตการแจ้งเตือน');nb.addEventListener('click',function(){Notification.requestPermission().then(function(){render()})});pad.appendChild(nb)}
    var ok=el('button',{type:'button',class:'qa-btn pri big'},'เริ่มใช้งาน');ok.addEventListener('click',function(){lsSJ('qa-welcomed',1);go('#/')});pad.appendChild(ok);
  };

  /* ---------- Ctrl+K palette (desktop) ---------- */
  function palette(){
    if(document.querySelector('.qa-pal'))return;
    sheet('ไปที่…',function(box,close){
      box.parentNode.classList.add('qa-pal');
      var q=el('input',{type:'search',placeholder:'ชั้น/โซน จุดตรวจ หรือเมนู','aria-label':'ค้นหาเพื่อไปที่'}),list=el('div',{class:'qa-card',role:'listbox'});box.append(q,list);
      var pages=[['งานของฉัน','#/tasks'],['แจ้งเตือน','#/noti'],['แผนงาน','#/plan'],['ภาพรวม','#/overview'],['ปฏิทิน','#/cal'],['สมาชิก','#/members'],['ยศและสิทธิ์','#/roles'],['ข้อมูลและการส่งให้ทีม','#/data'],['บริษัท','#/company'],['แบบล่าสุด','#/drawings']];
      var sel=0,opts=[];
      function draw(){list.textContent='';var v=q.value.trim().toLowerCase();opts=[];
        M.channels.forEach(function(c){if(!v||c.name.toLowerCase().indexOf(v)>=0)opts.push(['#'+c.name,'#/c/'+encodeURIComponent(c.id)])});
        pages.forEach(function(p){if(!v||p[0].indexOf(v)>=0)opts.push(p)});
        if(v)M.items.filter(function(x){return (itemTitle(x.it)+' '+(x.it.loc||'')).toLowerCase().indexOf(v)>=0}).slice(0,8).forEach(function(x){opts.push([itemTitle(x.it)+' · '+(x.zone||''),'#/t/'+encodeURIComponent(x.doc.id)+'/'+encodeURIComponent(x.it.id)])});
        if(v)opts.push(['ค้นหาข้อความ “'+q.value.trim()+'”','#/search/'+encodeURIComponent(q.value.trim())]);
        sel=Math.min(sel,Math.max(0,opts.length-1));
        opts.slice(0,14).forEach(function(o,i){var a=el('a',{class:'qa-row',role:'option',href:o[1],'aria-selected':i===sel?'true':'false'},el('span',{class:'qa-rt'},el('b',null,o[0])));a.addEventListener('click',close);list.appendChild(a)})}
      q.addEventListener('input',function(){sel=0;draw()});
      q.addEventListener('keydown',function(e){if(e.key==='ArrowDown'){sel=Math.min(sel+1,Math.min(13,opts.length-1));draw();e.preventDefault()}else if(e.key==='ArrowUp'){sel=Math.max(0,sel-1);draw();e.preventDefault()}else if(e.key==='Enter'&&opts[sel]){close();location.hash=opts[sel][1]}});
      draw();setTimeout(function(){q.focus()},0);
    });
  }

  /* ---------- data loading ---------- */
  /* online server without migration 006: channels come from the project's zones (005), chat waits for the upgrade */
  function legacyMode(){return ONLINE&&W.available&&!W.available()}
  function legacyChannels(){
    var p=M.projects.filter(function(x){return x.id===M.project})[0];if(!p)return [];
    var z=lsJ('qc-zones:'+p.name,null);if(!Array.isArray(z)||!z.length)z=(p.zones&&p.zones.length)?p.zones:zonesOf(p.name,M.docs);
    return z.map(function(n,i){return {id:'Z:'+n,project_id:p.id,name:n,category:'โซนงาน',kind:'zone',position:i,legacy:true}});
  }
  function saveCh(r){
    if(!M.legacy)return W.saveChannel(r);
    syncZones(r.name);return Promise.resolve([{id:'Z:'+r.name,name:r.name,kind:'zone'}]);
  }
  function reloadChannels(){
    if(legacyMode()){M.legacy=true;M.channels=legacyChannels();render();return Promise.resolve()}
    return Promise.resolve(M.project?W.channels(M.project):[]).then(function(cs){M.channels=(cs||[]).slice().sort(function(a,b){return (a.kind==='announce'?-1:0)-(b.kind==='announce'?-1:0)||(a.position||0)-(b.position||0)});render()}).catch(function(){});
  }
  function reloadAll(){
    return Promise.all([
      Promise.resolve(W.company()).then(function(c){M.company=c||M.company||{name:'',joined:true}}).catch(function(){}),
      M.project?Promise.resolve(W.perms(M.project)).then(function(p){p=p||{};M.perms=p.perms||(ONLINE?[]:['*']);M.myRoles=p.roles||[];
        if(ONLINE&&!(W.available&&W.available())){M.perms=legacyPerms()}}).catch(function(){M.perms=ONLINE?legacyPerms():['*']}):Promise.resolve(),
      Promise.resolve(W.roles()).then(function(r){M.roles=r||BUILTIN}).catch(function(){M.roles=BUILTIN}),
      M.project?Promise.resolve(W.unread(M.project)).then(function(u){M.unread={};(u||[]).forEach(function(x){M.unread[x.channel_id]=+x.n||0})}).catch(function(){}):Promise.resolve()
    ]).then(reloadChannels);
  }
  /* server without 006 yet: map the 005 project role to permissions so the shell still works */
  function legacyPerms(){
    var r=window.__qcOnline&&window.__qcOnline.role&&window.__qcOnline.role();
    return r==='pm'?['*']:r==='foreman'?['ins_view','ins_create','ins_recheck','ins_assign','ch_post','req_answer','req_create','pl_progress']:r==='headman'?['ins_view','ins_fix','ch_post','req_create','pl_progress']:['ins_view'];
  }
  var rT=null;
  function refresh(){clearTimeout(rT);rT=setTimeout(function(){if(!root||root.hidden)return;var a=document.activeElement;if(a&&root.contains(a)&&/INPUT|TEXTAREA|SELECT/.test(a.tagName))return;if(!ONLINE)reloadChannels();else render()},120)}

  /* ---------- boot ---------- */
  function show(on){
    if(!root)return;
    root.hidden=!on;document.body.classList.toggle('qa-on',true);
    if(on){render()}else{fillZone()}
  }
  function boot(){
    if(!window.__qcHome||!window.__qcActions||!document.body){setTimeout(boot,60);return}
    if(ONLINE&&!window.__qcWS){setTimeout(boot,60);return}
    W=(ONLINE&&window.__qcWS)?window.__qcWS:LocalWS();
    root=el('div',{id:'qa'});
    var body=el('div',{class:'qa-body'});
    railEl=el('nav',{class:'qa-rail','aria-label':'บริษัทและโครงการ'});
    sideEl=el('aside',{class:'qa-side','aria-label':'ชั้นและโซนในโครงการ'});
    mainEl=el('main',{class:'qa-main',id:'qa-main'});
    asideEl=el('aside',{class:'qa-aside','aria-label':'รายการตรวจในโซนนี้',hidden:true});
    body.append(railEl,sideEl,mainEl,asideEl);
    navEl=el('nav',{class:'qa-nav','aria-label':'เมนูหลัก'});
    var fl=el('div',{id:'qa-flash',role:'status','aria-live':'polite',hidden:true});
    root.append(body,navEl,fl);
    document.body.appendChild(root);
    applyPrefs();
    /* back bar on top of the form engine */
    backBar=el('div',{id:'qa-back-bar'});
    var bb=el('button',{type:'button'},ic('back',18),txt('กลับไปหน้าโครงการ'));
    bb.addEventListener('click',function(){var h=backTo||'#/';if(location.hash!==h)location.hash=h;window.__qcHome.go('home')});
    backBar.append(bb,el('span',null,'แก้รายงานได้ตามปกติ · บันทึกเองอัตโนมัติ'));
    document.body.insertBefore(backBar,document.body.firstChild);
    M.channels=[];
    try{rebuild()}catch(e){}
    if(!lsJ('qa-welcomed',0)&&!location.hash)location.hash='#/welcome';
    new MutationObserver(function(){var on=document.body.classList.contains('qc-home-on');if(on===root.hidden)show(on)}).observe(document.body,{attributes:true,attributeFilter:['class']});
    show(document.body.classList.contains('qc-home-on'));
    reloadAll();
    window.addEventListener('hashchange',function(){if(!root.hidden)render();else if(location.hash&&location.hash!=='#'){window.__qcHome.go('home')}});
    window.addEventListener('qc-change',refresh);window.addEventListener('qc-sync',refresh);
    if(W.onMessages)W.onMessages(refresh);
    if(W.subscribe)try{W.subscribe(function(){M.unread=M.unread||{};Promise.resolve(W.unread(M.project)).then(function(u){M.unread={};(u||[]).forEach(function(x){M.unread[x.channel_id]=+x.n||0});refresh()}).catch(refresh)})}catch(e){}
    document.addEventListener('keydown',function(e){if(root.hidden)return;if((e.ctrlKey||e.metaKey)&&(e.key==='k'||e.key==='K')){e.preventDefault();palette()}});
    window.addEventListener('resize',function(){var w=window.innerWidth>=900;if(w!==refresh.w){refresh.w=w;refresh()}});refresh.w=window.innerWidth>=900;
    window.__qcApp={render:render,go:go,reload:reloadAll,model:function(){return M},ws:function(){return W},open:openDoc,palette:palette,preview:function(p){M.preview=p||null;render()}};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
