/* Online storage shell (Supabase). Same window.claude.use('db'|'user'|'assets'|'downloads') API as
   pwa-shell.js, so the form does not change. Loaded only in online mode (see the loader in index.html).

   Offline-first: every write lands in a per-user IndexedDB cache + outbox first, then a sync loop
   pushes it. Push diffs the local document against the last server snapshot ("base") so only fields
   this device changed are written (other people's rechecks survive). Recheck results go through the
   recheck_item() RPC, which refuses to overwrite a newer recheck made by someone else. */
(function(){
  'use strict';
  var U=window.QCU;  /* shared helpers: pwa-util.js */
  var lsSet=U.lsSet,clone=U.clone,el=U.el;
  window.__PWA=true;window.__ONLINE=true;
  var CFG={url:'https://kcuhizrtegornpqtaijx.supabase.co',key:'sb_publishable_nFtSYV-yofy8A49VPojy3g_TvNUCSgX',bucket:'inspection-photos'};
  var MAXB=20*1024*1024,PK='qc-online-project',PL='qc-online-projects';
  var HF=['docno','insp_date','site','work','weather','meta','sign','summary','remarks','folder_id','extra','deleted_at'];
  var IF=['ord','loc','chk','res','note','cat','ref','before','after','rres','rdate','rnote','assignee_id','due_date'];

  /* ---------- small helpers ---------- */
  function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function stable(o){
    if(o===undefined)return 'null';
    if(o===null||typeof o!=='object')return JSON.stringify(o);
    if(Array.isArray(o))return '['+o.map(stable).join(',')+']';
    return '{'+Object.keys(o).sort().filter(function(k){return o[k]!==undefined}).map(function(k){return JSON.stringify(k)+':'+stable(o[k])}).join(',')+'}';
  }
  function eq(a,b){return stable(a)===stable(b)}
  var today=QCU.today;

  /* ---------- server API (one place for every Supabase call; tests can swap it) ---------- */
  function makeApi(){
    var sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'qc-online-auth'}});
    function chk(r){if(r.error){var e=new Error(r.error.message||'error');e.code=r.error.code||r.error.statusCode||'error';throw e}return r.data}
    var IH='id,project_id,owner_id,docno,insp_date,site,work,weather,meta,sign,summary,remarks,rev,created_at,updated_at,deleted_at,folder_id,extra';
    var II='id,inspection_id,project_id,ord,loc,chk,res,note,cat,ref,before,after,rres,rdate,rnote,rchk_at,status,assignee_id,due_date,fixed_note';
    function chunks(a,n){var o=[];for(var i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o}
    return {
      session:function(){return sb.auth.getSession().then(function(r){return r.data&&r.data.session||null})},
      signIn:function(redirect){return sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirect}})},
      signOut:function(){return sb.auth.signOut()},
      myProjects:function(){return sb.rpc('my_projects').then(chk)},
      myProfile:function(uid){return sb.from('profiles').select('id,display_name,email,org_role').eq('id',uid).maybeSingle().then(chk)},
      inspections:function(f){
        var q=sb.from('inspections').select(IH);
        if(f.id)q=q.eq('id',f.id);
        if(f.project)q=q.eq('project_id',f.project);
        if(f.owner)q=q.eq('owner_id',f.owner);
        if(f.notOwner)q=q.neq('owner_id',f.notOwner);
        return q.then(chk);
      },
      items:function(ids){
        if(!ids.length)return Promise.resolve([]);
        return Promise.all(chunks(ids,80).map(function(c){return sb.from('inspection_items').select(II).in('inspection_id',c).then(chk)}))
          .then(function(r){return [].concat.apply([],r)});
      },
      insertHeader:function(row){return sb.from('inspections').insert(row).then(chk)},
      updateHeader:function(id,patch){return sb.from('inspections').update(patch).eq('id',id).select('id').then(chk)},
      deleteHeader:function(id){return sb.from('inspections').delete().eq('id',id).then(chk)},
      insertItems:function(rows){return rows.length?sb.from('inspection_items').insert(rows).then(chk):Promise.resolve()},
      updateItem:function(id,patch){return sb.from('inspection_items').update(patch).eq('id',id).select('id').then(chk)},
      deleteItems:function(ids){return ids.length?sb.from('inspection_items').delete().in('id',ids).then(chk):Promise.resolve()},
      /* 005: form-engine documents, team templates, project zones */
      formDocs:function(p){return sb.from('form_docs').select('id,owner_id,form_id,title,data,updated_at,deleted_at').eq('project_id',p).then(chk)},
      putFormDoc:function(row){return sb.from('form_docs').upsert(row,{onConflict:'id'}).select('id').then(chk)},
      formTemplates:function(p){return sb.from('form_templates').select('id,owner_id,name,data,updated_at,deleted_at').eq('project_id',p).then(chk)},
      putFormTemplate:function(row){return sb.from('form_templates').upsert(row,{onConflict:'id'}).select('id').then(chk)},
      setZones:function(p,z){return sb.rpc('set_project_zones',{p:p,z:z}).then(chk)},
      requests:function(p){return sb.from('inspection_requests').select('*').eq('project_id',p).order('scheduled_at',{ascending:true}).then(chk)},
      insertRequest:function(row){return sb.from('inspection_requests').insert(row).then(chk)},
      answerRequest:function(id,action,note,photos,at){return sb.rpc('answer_inspection_request',{p_id:id,p_action:action,p_note:note||'',p_photos:photos||[],p_scheduled:at||null}).then(chk)},
      lineStatus:function(){return sb.rpc('line_status').then(chk)},
      lineLinkStart:function(){return sb.rpc('line_link_start').then(chk)},
      lineUnlink:function(){return sb.rpc('line_unlink').then(chk)},
      reportFixed:function(id,after,note){return sb.rpc('report_fixed',{p_item:id,p_after:after||[],p_note:note||''}).then(chk)},
      recheck:function(id,res,note,after,seen){return sb.rpc('recheck_item',{p_item:id,p_result:res,p_note:note||'',p_after:after||[],p_seen_at:seen||null}).then(chk)},
      folders:function(){return sb.from('folders').select('id,name,created_at,updated_at,deleted_at').then(chk)},
      upsertFolder:function(row){return sb.from('folders').upsert(row).then(chk)},
      deleteFolder:function(id){return sb.from('folders').delete().eq('id',id).then(chk)},
      upload:function(path,blob){return sb.storage.from(CFG.bucket).upload(path,blob,{contentType:blob.type||'image/jpeg',upsert:true}).then(chk)},
      download:function(path){return sb.storage.from(CFG.bucket).download(path).then(chk)},
      remove:function(path){return sb.storage.from(CFG.bucket).remove([path]).then(chk)},
      profiles:function(ids){return ids.length?sb.from('profiles').select('id,display_name,email').in('id',ids).then(chk):Promise.resolve([])},
      profileByEmail:function(email){return sb.from('profiles').select('id,display_name,email').ilike('email',email).maybeSingle().then(chk)},
      members:function(p){return sb.from('project_members').select('user_id,role').eq('project_id',p).then(chk)},
      addMember:function(p,u,role){return sb.from('project_members').upsert({project_id:p,user_id:u,role:role}).then(chk)},
      removeMember:function(p,u){return sb.from('project_members').delete().eq('project_id',p).eq('user_id',u).then(chk)},
      createProject:function(name,site){return sb.from('projects').insert({name:name,site:site||''}).select('id').single().then(chk)},
      /* 006: workspace for the new UX (company, roles, channels, messages, plan, shares) */
      ws:{
        company:function(){return sb.rpc('company_info').then(chk).then(function(r){return r&&r[0]||null})},
        companyCode:function(){return sb.rpc('company_code').then(chk)},
        rotateCode:function(){return sb.rpc('rotate_join_code').then(chk)},
        join:function(code){return sb.rpc('join_company',{code:code}).then(chk)},
        updateCompany:function(patch){return sb.from('company').update(patch).eq('id',1).then(chk)},
        people:function(){return sb.rpc('company_people').then(chk)},
        projectPeople:function(p){return sb.rpc('project_people',{p:p}).then(chk)},
        perms:function(p){return sb.rpc('my_permissions',{p:p}).then(chk).then(function(r){return r&&r[0]||{perms:[],roles:[],top:-1}})},
        roles:function(){return sb.from('roles').select('*').order('position',{ascending:false}).then(chk)},
        saveRole:function(row){return sb.from('roles').upsert(row).select('*').then(chk)},
        deleteRole:function(id){return sb.from('roles').delete().eq('id',id).then(chk)},
        setMemberRoles:function(p,u,ids){return sb.rpc('set_member_roles',{p:p,u:u,role_ids:ids}).then(chk)},
        audit:function(){return sb.from('role_audit').select('*').order('at',{ascending:false}).limit(200).then(chk)},
        ensureChannels:function(p){return sb.rpc('ensure_channels',{p:p}).then(chk)},
        channels:function(p){return sb.from('channels').select('*').eq('project_id',p).is('archived_at',null).order('position').then(chk)},
        saveChannel:function(row){return sb.from('channels').upsert(row).select('*').then(chk)},
        access:function(ch){return sb.from('channel_access').select('*').eq('channel_id',ch).then(chk)},
        setAccess:function(rows){return sb.from('channel_access').upsert(rows).then(chk)},
        unread:function(p){return sb.rpc('unread_counts',{p:p}).then(chk)},
        markRead:function(ch){return sb.from('channel_reads').upsert({channel_id:ch,last_read:new Date().toISOString()},{onConflict:'user_id,channel_id'}).then(chk)},
        messages:function(f){var q=sb.from('messages').select('*').is('deleted_at',null).order('created_at',{ascending:true}).limit(f.limit||300);
          if(f.item)q=q.eq('item_id',f.item);else q=q.eq('channel_id',f.channel).is('item_id',null);return q.then(chk)},
        search:function(p,text){return sb.from('messages').select('*').eq('project_id',p).is('deleted_at',null).ilike('body','%'+text+'%').limit(50).then(chk)},
        post:function(row){return sb.from('messages').upsert(row,{onConflict:'client_id',ignoreDuplicates:true}).select('*').then(chk)},
        editMessage:function(id,patch){return sb.from('messages').update(patch).eq('id',id).then(chk)},
        replies:function(ch){return sb.from('messages').select('item_id').eq('channel_id',ch).not('item_id','is',null).is('deleted_at',null).limit(3000).then(chk)},
        itemEvents:function(ids){return ids.length?sb.from('item_events').select('*').in('item_id',ids).order('created_at').then(chk):Promise.resolve([])},
        plan:function(p){return sb.from('plan_tasks').select('*').eq('project_id',p).order('position').then(chk)},
        savePlanTask:function(row){return sb.from('plan_tasks').upsert(row).select('*').then(chk)},
        deletePlanTask:function(id){return sb.from('plan_tasks').delete().eq('id',id).then(chk)},
        baselines:function(p){return sb.from('plan_baselines').select('id,approved_by,approved_at,snapshot').eq('project_id',p).order('approved_at',{ascending:false}).limit(5).then(chk)},
        approveBaseline:function(p){return sb.rpc('approve_baseline',{p:p}).then(chk)},
        commitments:function(taskIds){return taskIds.length?sb.from('plan_commitments').select('*').in('task_id',taskIds).then(chk):Promise.resolve([])},
        assign:function(row){return sb.from('plan_commitments').insert(row).then(chk)},
        answer:function(t,w,st,why,pct){return sb.rpc('answer_commitment',{t:t,w:w,st:st,why:why||'',progress:pct==null?null:pct}).then(chk)},
        setProject:function(p,patch){return sb.from('projects').update(patch).eq('id',p).then(chk)},
        share:function(path,blob,days,row){
          return sb.storage.from('shares').upload(path,blob,{contentType:'application/pdf',upsert:true}).then(chk)
            .then(function(){return sb.storage.from('shares').createSignedUrl(path,Math.max(60,Math.round(days*86400)))}).then(chk)
            .then(function(r){return sb.from('share_links').insert(row).then(chk).then(function(){return r.signedUrl})})},
        subscribe:function(p,cb){
          var ch=sb.channel('qcw-'+p)
            .on('postgres_changes',{event:'*',schema:'public',table:'messages',filter:'project_id=eq.'+p},cb)
            .on('postgres_changes',{event:'*',schema:'public',table:'channels',filter:'project_id=eq.'+p},cb)
            .subscribe();
          return function(){try{sb.removeChannel(ch)}catch(e){}};
        }
      },
      subscribe:function(p,cb){
        var ch=sb.channel('qc-'+p)
          .on('postgres_changes',{event:'*',schema:'public',table:'inspections',filter:'project_id=eq.'+p},cb)
          .on('postgres_changes',{event:'*',schema:'public',table:'inspection_items',filter:'project_id=eq.'+p},cb)
          .on('postgres_changes',{event:'*',schema:'public',table:'inspection_requests',filter:'project_id=eq.'+p},cb)
          .subscribe();
        return function(){try{sb.removeChannel(ch)}catch(e){}};
      }
    };
  }
  var api=window.__qcOnlineApi||makeApi();

  /* ---------- identity, ids, photo paths ---------- */
  var UID=null,UIDH='',ME=null,CUR=null,ROLE=null,PROJECTS=[],PFX='';
  var hex=QCU.randHex;   /* random id bytes (shared, pwa-util.js) */
  function newAssetId(){return 'u'+UIDH+'_'+hex(12)}
  function idToPath(id){var m=/^u([0-9a-f]{32})_([0-9a-f]+)$/.exec(id||'');if(!m)return null;var u=m[1];return u.slice(0,8)+'-'+u.slice(8,12)+'-'+u.slice(12,16)+'-'+u.slice(16,20)+'-'+u.slice(20)+'/'+m[2]}
  function pathToId(p){var m=/^([0-9a-f-]{36})\/([0-9a-f]+)$/.exec(p||'');return m?'u'+m[1].replace(/-/g,'')+'_'+m[2]:p}
  function canCreate(){return ROLE==='pm'||ROLE==='foreman'}

  /* ---------- document <-> rows ---------- */
  function sid(doc,item){return doc+'.'+item}
  function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||'')?s:null}
  function headerOf(d){
    var m=d.meta||{};
    return {docno:m.docno||'',insp_date:validDate(m.date),site:m.site||'',work:m.work||'',weather:m.weather||'',
      meta:m,sign:d.sign||{},summary:d.summary||'',remarks:d.remarks||'',folder_id:d.folder||null,
      extra:extraOf(d),deleted_at:d.deletedAt||null};
  }
  /* header extra (jsonb, no schema change): plan pins, and the document's deleted items/photos (bin) + open
     "deleted here, edited elsewhere" conflicts (cf). Photo ids become storage paths like everywhere else. */
  function extraOf(d){
    var x={v:d.v||2,rx:d.rx||null,plan:planToRow(d.plan)};
    if(d.bin&&d.bin.length)x.bin=binMap(d.bin,idToPath);
    if(d.cf&&Object.keys(d.cf).length)x.cf=d.cf;
    return x;
  }
  function binMap(bin,f){
    return (bin||[]).map(function(e){
      if(e.t==='item'){var it=Object.assign({},e.item);it.before=(it.before||[]).map(function(a){return f(a)||a});it.after=(it.after||[]).map(function(a){return f(a)||a});return {t:'item',at:e.at,i:e.i,item:it}}
      return {t:'ph',at:e.at,item:e.item,k:e.k,j:e.j,p:f(e.p)||e.p};
    });
  }
  /* plan pins live in the header's extra (no schema change); drawing ids become storage paths like photos */
  function planToRow(p){if(!p||!p.sheets||!p.sheets.length)return null;return {sheets:p.sheets.map(function(x){return {a:idToPath(x.a)||x.a,name:x.name||'',w:x.w||0,h:x.h||0}}),pins:p.pins||{}}}
  function planFromRow(p){if(!p||!p.sheets||!p.sheets.length)return null;return {sheets:p.sheets.map(function(x){return {a:pathToId(x.a),name:x.name||'',w:x.w||0,h:x.h||0}}),pins:p.pins||{}}}
  function itemsOf(id,d){
    var out={};
    (d.items||[]).forEach(function(it,i){
      out[sid(id,it.id)]={ord:i,loc:it.loc||'',chk:it.chk||'',res:it.res||'',note:it.note||'',cat:it.cat||'',ref:it.ref||'',
        before:(it.before||[]).map(idToPath).filter(Boolean),after:(it.after||[]).map(idToPath).filter(Boolean),
        rres:it.rres||'',rdate:it.rdate||'',rnote:it.rnote||'',assignee_id:it.asg||null,due_date:validDate(it.due)};
    });
    return out;
  }
  function rowsToDoc(h,items){
    var pre=h.id+'.',ex=h.extra||{};
    var its=(items||[]).slice().sort(function(a,b){return a.ord-b.ord}).map(function(r){
      return {id:r.id.indexOf(pre)===0?r.id.slice(pre.length):r.id,loc:r.loc,chk:r.chk,res:r.res,note:r.note,cat:r.cat,ref:r.ref,
        rres:r.rres,rdate:r.rdate,rnote:r.rnote,before:(r.before||[]).map(pathToId),after:(r.after||[]).map(pathToId),
        asg:r.assignee_id||'',due:r.due_date||'',st:r.status||'',rat:r.rchk_at||'',fnote:r.fixed_note||''};
    });
    return {v:ex.v||2,kind:'inspection',meta:Object.assign({},h.meta||{}),sign:h.sign||{},summary:h.summary||'',remarks:h.remarks||'',
      items:its,createdAt:h.created_at||'',updatedAt:h.updated_at||'',rev:0,folder:h.folder_id||'',deletedAt:h.deleted_at||'',
      rx:ex.rx||null,plan:planFromRow(ex.plan),_project:h.project_id,_owner:h.owner_id,
      bin:ex.bin?binMap(ex.bin,pathToId):undefined,cf:ex.cf||undefined};
  }
  function baseOf(h,items){
    var d=rowsToDoc(h,items),b={h:headerOf(d),items:itemsOf(h.id,d)};
    (items||[]).forEach(function(r){if(b.items[r.id])b.items[r.id].rchk_at=r.rchk_at||null});
    return b;
  }
  function contentKey(d){var o={meta:d.meta,sign:d.sign,summary:d.summary,remarks:d.remarks,items:d.items,folder:d.folder||'',deletedAt:d.deletedAt||''};if(d.plan&&d.plan.sheets&&d.plan.sheets.length)o.plan=d.plan;if(d.bin&&d.bin.length)o.bin=d.bin;if(d.cf&&Object.keys(d.cf).length)o.cf=d.cf;return stable(o)}

  /* ---------- 3-way merge for saves made from an outdated copy ----------
     The form saves its whole document. If a sync updated our copy in the meantime (e.g. someone
     else rechecked an item) and the form had not reloaded it yet, a plain save would put the old
     values back. We keep the versions the form may be holding (by rev) and merge per field:
     fields the user did not touch take the newer value. Sync versions use rev numbers in their
     own range (multiples of 1000) so they never collide with the form's +1 saves. */
  var hist=new Map();
  function remember(id,d){var h=hist.get(id);if(!h){h=new Map();hist.set(id,h)}h.delete(+d.rev||0);h.set(+d.rev||0,d);while(h.size>12)h.delete(h.keys().next().value)}
  function recall(id,rev){var h=hist.get(id);return h&&h.get(rev)}
  function syncRev(after){return (Math.floor((+after||0)/1000)+1)*1000}
  var DOCF=['meta','sign','summary','remarks','folder','deletedAt','bin','cf'];
  var ITF=['loc','chk','res','note','cat','ref','rres','rdate','rnote','before','after','asg','due','st','rat','fnote'];
  function mergeObj(b,m,t){
    if(!b||typeof m!=='object'||typeof t!=='object'||!m||!t||Array.isArray(m))return eq(m,b)?t:m;
    var o={},keys={};[b,m,t].forEach(function(x){Object.keys(x||{}).forEach(function(k){keys[k]=1})});
    Object.keys(keys).forEach(function(k){var v=eq(m[k],b[k])?t[k]:m[k];if(v!==undefined)o[k]=v});
    return o;
  }
  function merge3(b,m,t){
    var out=Object.assign({},m);
    DOCF.forEach(function(f){out[f]=(f==='meta'||f==='sign')?mergeObj(b[f]||{},m[f]||{},t[f]||{}):(eq(m[f],b[f])?t[f]:m[f])});
    var bi={},ti={},mi={};(b.items||[]).forEach(function(x){bi[x.id]=x});(t.items||[]).forEach(function(x){ti[x.id]=x});(m.items||[]).forEach(function(x){mi[x.id]=x});
    var items=[];
    (m.items||[]).forEach(function(x){
      var bx=bi[x.id],tx2=ti[x.id];
      if(!tx2){if(bx&&ITF.every(function(f){return eq(x[f],bx[f])}))return;items.push(x);return}
      if(!bx){items.push(x);return}
      var y=Object.assign({},x);ITF.forEach(function(f){y[f]=eq(x[f],bx[f])?tx2[f]:x[f]});items.push(y);
    });
    (t.items||[]).forEach(function(x){if(!bi[x.id]&&!mi[x.id])items.push(x)});
    /* deleted on this side, changed on the other since: never drop the other side's work silently.
       Keep their version, take it out of our bin, and flag it (cf) so the user decides. */
    (b.items||[]).forEach(function(bx){
      var tx2=ti[bx.id];if(mi[bx.id]||!tx2)return;
      if(ITF.every(function(f){return eq(tx2[f],bx[f])}))return;
      var be=(out.bin||[]).filter(function(e){return e.t==='item'&&e.item&&e.item.id===bx.id})[0];
      if(!be)return;
      out.bin=out.bin.filter(function(e){return e!==be});
      items.splice(Math.min(be.i||0,items.length),0,Object.assign({},tx2));
      out.cf=Object.assign({},out.cf||{});out.cf[bx.id]=new Date().toISOString();
    });
    out.items=items;
    return out;
  }

  /* ---------- IndexedDB: per-user cache, base snapshots, outbox, photos ---------- */
  var idb=null,cache=new Map(),shared=new Map(),base=new Map(),outbox=new Map(),uploads=new Set(),ver={};
  function openDb(){
    return new Promise(function(res,rej){
      var r=indexedDB.open('qc-online-'+UID,1);
      r.onupgradeneeded=function(){var d=r.result;
        ['docs','shared','base','outbox'].forEach(function(s){if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'k'})});
        if(!d.objectStoreNames.contains('blobs'))d.createObjectStore('blobs');
        if(!d.objectStoreNames.contains('uploads'))d.createObjectStore('uploads');
      };
      r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)};
    });
  }
  function tx(stores,mode,fn){
    return new Promise(function(res,rej){
      var t=idb.transaction(stores,mode),out=fn(t);
      t.oncomplete=function(){res(out&&out.result!==undefined?out.result:out)};t.onerror=t.onabort=function(){rej(t.error||{code:'error'})};
    });
  }
  function getAll(s){return tx([s],'readonly',function(t){return t.objectStore(s).getAll()})}
  function getKeys(s){return tx([s],'readonly',function(t){return t.objectStore(s).getAllKeys()})}
  function loadAll(){
    return Promise.all([getAll('docs'),getAll('shared'),getAll('base'),getAll('outbox'),getKeys('uploads')]).then(function(r){
      cache.clear();r[0].forEach(function(x){cache.set(x.k,x.v);if(x.v&&x.v.kind!=='folder'&&x.k.indexOf(PFX)===0)remember(x.k.slice(PFX.length),x.v)});
      shared.clear();r[1].forEach(function(x){shared.set(x.k,x.v)});
      base.clear();r[2].forEach(function(x){base.set(x.k,x.v)});
      outbox.clear();r[3].forEach(function(x){outbox.set(x.k,x.v)});
      uploads=new Set(r[4]);
    });
  }
  /* write several stores in one transaction: ops = [[store, key, value|undefined(=delete)], ...] */
  function persist(ops){
    if(!ops.length)return Promise.resolve();
    var stores=Array.from(new Set(ops.map(function(o){return o[0]})));
    return tx(stores,'readwrite',function(t){
      ops.forEach(function(o){
        var s=t.objectStore(o[0]);
        if(o[0]==='blobs'||o[0]==='uploads'){if(o[2]===undefined)s.delete(o[1]);else s.put(o[2],o[1])}
        else if(o[2]===undefined)s.delete(o[1]);else s.put({k:o[1],v:o[2]});
      });
    });
  }

  /* ---------- live queries (same shape as the offline shell) ---------- */
  var subs=[],bc=null;
  function colOf(p){return p.split('/').slice(0,-1).join('/')}
  function rowsFor(c){
    var list=[];
    if(c==='data/users/'+UID){
      cache.forEach(function(d,p){if(p.indexOf(PFX)===0&&(d.kind==='folder'||d._project===CUR))list.push({id:p.slice(PFX.length),data:d})});
    }else if(c==='submitted'){
      var owners={};shared.forEach(function(x){if(x.project!==CUR)return;var o=owners[x.owner];if(!o||x.data.updatedAt>o)owners[x.owner]=x.data.updatedAt||''});
      Object.keys(owners).forEach(function(u){list.push({id:u,data:{ownerId:u,updatedAt:owners[u]}})});
    }else{
      var m=/^submitted\/([^/]+)\/docs$/.exec(c);
      if(m)shared.forEach(function(x,id){if(x.owner===m[1]&&x.project===CUR)list.push({id:id,data:x.data})});
    }
    return list;
  }
  function snapOf(q){
    var list=rowsFor(q.c);
    if(q.ord){list=list.filter(function(x){return x.data[q.ord]!=null});list.sort(function(a,b){var x=a.data[q.ord],y=b.data[q.ord];return x===y?0:(x<y?1:-1)})}
    if(q.lim)list=list.slice(0,q.lim);
    var ds=list.map(function(x){return {id:x.id,exists:true,data:function(){return clone(x.data)},metadata:{}}});
    return {docs:ds,size:ds.length,empty:!ds.length,metadata:{fromCache:false,hasPendingWrites:false},docChanges:function(){return[]}};
  }
  function notify(){try{updateTaskBtn()}catch(e){}try{window.dispatchEvent(new Event('qc-change'))}catch(e){}subs.forEach(function(s){setTimeout(function(){try{s.next(snapOf(s.q))}catch(e){}},0)})}
  function announce(){try{bc&&bc.postMessage('chg')}catch(e){}}

  function localPut(id,data){
    var path=PFX+id;ver[id]=(ver[id]||0)+1;
    var ob={type:data.kind==='folder'?'folder':'doc'};
    cache.set(path,data);outbox.set(id,ob);
    return persist([['docs',path,data],['outbox',id,ob]]).then(function(){notify();announce();schedule()});
  }
  function localDelete(id){
    var path=PFX+id,d=cache.get(path);ver[id]=(ver[id]||0)+1;
    var ob={type:d&&d.kind==='folder'?'folder':'doc',del:true};
    cache.delete(path);outbox.set(id,ob);
    return persist([['docs',path,undefined],['outbox',id,ob]]).then(function(){notify();announce();schedule()});
  }
  function mkQuery(c,ord,lim){
    return {
      orderBy:function(f){return mkQuery(c,f,lim)},limit:function(n){return mkQuery(c,ord,n)},
      onSnapshot:function(next){var s={q:{c:c,ord:ord,lim:lim},next:next};subs.push(s);setTimeout(function(){next(snapOf(s.q))},0);return function(){subs=subs.filter(function(x){return x!==s})}},
      get:function(){return Promise.resolve(snapOf({c:c,ord:ord,lim:lim}))},
      doc:function(id){
        var path=c+'/'+id,own=c==='data/users/'+UID;
        return {
          set:function(data){
            if(!own)return Promise.resolve();          /* "submitted" bookkeeping from the old team mode: not used online */
            data=clone(data);
            var ex=cache.get(path);
            if(data.kind!=='folder'){
              if(!ex&&!canCreate())return Promise.reject({code:'permission_denied'});
              data._project=(ex&&ex._project)||CUR;data._owner=UID;
              if(ex&&ex.kind!=='folder'){
                var dr=+data.rev||0,cr=+ex.rev||0,b=cr!==dr-1&&recall(id,dr-1);
                remember(id,data);
                if(b){
                  var merged=merge3(b,data,ex);
                  if(contentKey(merged)!==contentKey(data)){merged.rev=syncRev(Math.max(cr,dr));merged.by='sync';data=merged;remember(id,data)}
                }
              }else remember(id,data);
            }
            return localPut(id,data);
          },
          update:function(patch){
            if(!own)return Promise.resolve();
            var ex=cache.get(path);if(!ex)return Promise.reject({code:'not_found'});
            return localPut(id,Object.assign({},ex,clone(patch)));
          },
          delete:function(){return own?localDelete(id):Promise.resolve()},
          get:function(){var d=cache.get(path);return Promise.resolve({exists:!!d,data:function(){return d?clone(d):undefined}})}
        };
      }
    };
  }
  var db={collection:function(p){return mkQuery(p)},doc:function(p){return mkQuery(colOf(p)).doc(p.split('/').pop())}};

  /* ---------- sync ---------- */
  var syncing=false,again=false,st=null,lastErr='',conflicts=0,stopRealtime=null,authErr=false;
  /* a sync failure because the sign-in expired is not the same as "no internet": local work continues either way,
     but the user has to sign in again before the outbox can be sent */
  function isAuth(e){return !!e&&(e.status===401||e.status===403&&/jwt|token/i.test(e.message||'')||e.code==='PGRST301'||e.code==='PGRST303'||/jwt|refresh token|not authenticated|session.*(expired|missing)|invalid claim/i.test((e.message||'')+' '+(e.error_description||'')))}
  function schedule(ms){clearTimeout(st);st=setTimeout(runSync,ms==null?600:ms)}
  function isNet(e){return !navigator.onLine||(e&&(e.name==='TypeError'||/fetch|network|Failed to fetch|Load failed/i.test(e.message||'')))}
  function runSync(){
    if(!UID||!CUR)return;
    if(syncing){again=true;return}
    if(!navigator.onLine){status();return}
    if(authErr){status();return}            /* waiting for a new sign-in; local writes still go to the outbox */
    syncing=true;status();
    uploadAll().then(pushAll).then(pull).then(formSync).then(flushMsgs).then(function(){lastErr=''},function(e){
      if(isAuth(e)){authErr=true;lastErr='';}
      else lastErr=isNet(e)?'':(e&&(e.message||e.code))||'error';
      try{console.warn('[qc-online] sync',e)}catch(x){}
    }).then(function(){
      syncing=false;status();
      if(again){again=false;schedule(400)}
      else if(outbox.size||uploads.size)schedule(lastErr?30000:5000);
    });
  }
  /* ---------- form-engine documents + team templates (migration 005) ----------
     newest-wins per document (the documents are filled by one person); deletions travel as deleted_at.
     If the server has no tables yet, everything keeps working locally and the status says so. */
  var FS={ready:null,why:'',pending:0},FSK=function(){return 'qc-fsync:'+UID+':'+CUR},TOMB=function(){return 'qc-ftomb:'+UID};
  function fsGet(k,d){try{return JSON.parse(lsGet(k)||'')||d}catch(e){return d}}
  function noTable(e){return !!e&&(e.code==='42P01'||e.code==='PGRST205'||e.code==='PGRST202'||e.status===404||/form_docs|form_templates|schema cache/i.test(e.message||''))}
  function formPending(){
    var F=window.__qcForms;if(!F||!UID||!CUR)return Promise.resolve(0);
    var done=fsGet(FSK(),{}),tomb=fsGet(TOMB(),{});
    return F.listDocs().then(function(ds){return ds.filter(function(d){return (!d._project||d._project===CUR)&&(!d._owner||d._owner===UID)&&done[d.id]!==(d.updatedAt||'')}).length+Object.keys(tomb).length});
  }
  function formSync(){
    var F=window.__qcForms;if(!F||!CUR)return;
    var done=fsGet(FSK(),{}),tomb=fsGet(TOMB(),{}),proj=CUR;
    return api.formDocs(proj).then(function(rows){
      FS.ready=true;FS.why='';
      var srv={};(rows||[]).forEach(function(r){srv[r.id]=r});
      /* 1. deletions made here */
      var chain=Promise.resolve();
      Object.keys(tomb).forEach(function(id){
        chain=chain.then(function(){var r=srv[id];if(!r||r.owner_id!==UID){delete tomb[id];return}
          return api.putFormDoc({id:id,project_id:r.project_id||proj,form_id:r.form_id,title:r.title,data:r.data,updated_at:new Date().toISOString(),deleted_at:new Date().toISOString()}).then(function(){delete tomb[id];r.deleted_at=new Date().toISOString()})});   /* the snapshot below must not pull it back */
      });
      return chain.then(function(){lsSet(TOMB(),JSON.stringify(tomb));return F.listDocs()}).then(function(local){
        var lm={},push=[],tag=[];local.forEach(function(d){lm[d.id]=d});
        local.forEach(function(d){
          if(d._project&&d._project!==proj)return;
          if(d._owner&&d._owner!==UID)return;
          if(!d._project){d=Object.assign({},d,{_project:proj,_owner:UID});tag.push(d)}
          var r=srv[d.id];
          if(r&&r.deleted_at)return;
          if(done[d.id]===(d.updatedAt||'')&&r)return;
          if(r&&((r.data&&r.data.updatedAt)||'')>(d.updatedAt||''))return;      /* server is newer: pulled below */
          push.push(d);
        });
        var c2=tag.length?F.putDocs(tag):Promise.resolve();
        push.forEach(function(d){
          c2=c2.then(function(){return api.putFormDoc({id:d.id,project_id:proj,form_id:(d.form&&d.form.id)||d.formId||'',title:F.titleOf(d),data:d,updated_at:d.updatedAt||new Date().toISOString(),deleted_at:null})})
            .then(function(){done[d.id]=d.updatedAt||''});
        });
        return c2.then(function(){
          /* 2. pull what is newer on the server (other devices, other members) */
          var inc=[],gone=[];
          (rows||[]).forEach(function(r){
            if(r.deleted_at||tomb[r.id]){if(lm[r.id]&&r.deleted_at&&r.owner_id!==UID)gone.push(r.id);return}   /* the owner deleted it */
            var d=Object.assign({},r.data||{},{id:r.id,_project:proj,_owner:r.owner_id});
            if(!lm[r.id]||(d.updatedAt||'')>(lm[r.id].updatedAt||''))inc.push(d);
            done[r.id]=d.updatedAt||'';
          });
          return (gone.length?F.removeDocs(gone):Promise.resolve()).then(function(){return inc.length?F.importAll({docs:inc}):null});
        });
      }).then(function(){lsSet(FSK(),JSON.stringify(done))});
    }).then(function(){
      /* 3. team templates: share mine, take the team's */
      return api.formTemplates(proj).then(function(rows){
        var have={};(rows||[]).forEach(function(r){have[r.id]=r});
        var mine=(F.customs()||[]).filter(function(f){return !f._owner||f._owner===UID}),c3=Promise.resolve();
        mine.forEach(function(f){var r=have[f.id];if(r&&((r.data&&r.data.updatedAt)||'')>=(f.updatedAt||''))return;
          c3=c3.then(function(){return api.putFormTemplate({id:f.id,project_id:proj,name:f.name||'',data:Object.assign({},f,{_owner:UID}),updated_at:f.updatedAt||new Date().toISOString(),deleted_at:null})})});
        return c3.then(function(){
          var inc=(rows||[]).filter(function(r){return !r.deleted_at&&r.owner_id!==UID}).map(function(r){return Object.assign({},r.data,{id:r.id,_owner:r.owner_id,custom:true})});
          return inc.length?F.importAll({forms:inc}):null;
        });
      });
    }).then(formPending).then(function(n){FS.pending=n;status()},function(e){
      if(isAuth(e)||isNet(e))throw e;
      FS.why=noTable(e)?'เซิร์ฟเวอร์ยังไม่เปิดส่วนนี้ (ยังไม่ได้ติดตั้ง migration 005)':'ซิงก์รายงานแบบอื่นไม่สำเร็จชั่วคราว จะลองใหม่';
      if(noTable(e))FS.ready=false;
      try{console.warn('[qc-online] form sync',e)}catch(x){}
      return formPending().then(function(n){FS.pending=n;status()});
    });
  }
  window.addEventListener('qc-form-deleted',function(e){
    var id=e&&e.detail&&e.detail.id;if(!id||!UID)return;
    var t=fsGet(TOMB(),{});t[id]=new Date().toISOString();lsSet(TOMB(),JSON.stringify(t));schedule(500);
  });
  window.addEventListener('qc-change',function(){if(UID&&CUR)formPending().then(function(n){if(n!==FS.pending){FS.pending=n;status();schedule(2000)}})});
  function uploadAll(){
    var ids=Array.from(uploads),chain=Promise.resolve();
    ids.forEach(function(id){
      chain=chain.then(function(){
        return tx(['blobs'],'readonly',function(t){return t.objectStore('blobs').get(id)}).then(function(b){
          var p=idToPath(id);
          if(!b||!p){uploads.delete(id);return persist([['uploads',id,undefined]])}
          return api.upload(p,b).then(function(){uploads.delete(id);return persist([['uploads',id,undefined]])});
        });
      });
    });
    return chain;
  }
  function pushAll(){
    var chain=Promise.resolve();
    Array.from(outbox.keys()).forEach(function(id){chain=chain.then(function(){return pushOne(id)})});
    return chain;
  }
  function serverDoc(id){
    return api.inspections({id:id}).then(function(hs){
      var h=hs&&hs[0];if(!h)return {h:null,items:[]};
      return api.items([id]).then(function(items){return {h:h,items:items}});
    });
  }
  function done(id,v,ops){
    if(ver[id]===v){outbox.delete(id);ops.push(['outbox',id,undefined])}
    return persist(ops);
  }
  function pushOne(id){
    var ob=outbox.get(id);if(!ob)return Promise.resolve();
    var v=ver[id]||0,path=PFX+id;
    if(ob.type==='rx'||ob.type==='fx')return pushAct(id,ob,v);
    if(ob.type==='rq'||ob.type==='ra')return pushReq(id,ob,v);
    if(ob.type==='folder'){
      if(ob.del)return api.deleteFolder(id).then(function(){return done(id,v,[])});
      var f=cache.get(path);if(!f)return done(id,v,[]);
      return api.upsertFolder({id:id,name:f.name||'',created_at:f.createdAt||new Date().toISOString(),updated_at:f.updatedAt||new Date().toISOString(),deleted_at:f.deletedAt||null})
        .then(function(){return done(id,v,[])});
    }
    if(ob.del){
      return api.deleteHeader(id).then(function(){base.delete(id);return done(id,v,[['base',id,undefined]])});
    }
    var d=cache.get(path);if(!d)return done(id,v,[]);
    var LH=headerOf(d),LI=itemsOf(id,d),B=base.get(id)||null;
    return serverDoc(id).then(function(S){
      var work=Promise.resolve(),conflictHere=0;
      if(!S.h){
        var row=Object.assign({id:id,project_id:d._project||CUR,owner_id:UID,created_at:d.createdAt||new Date().toISOString()},LH);
        var rows=Object.keys(LI).map(function(k){return Object.assign({id:k,inspection_id:id},LI[k])});
        work=api.insertHeader(row).then(function(){return api.insertItems(rows)});
      }else if(S.h.owner_id!==UID){
        /* the PM handed this document to someone else: stop syncing our copy */
        cache.delete(path);base.delete(id);outbox.delete(id);
        lastErr='เอกสาร “'+(LH.docno||id)+'” ถูกโอนให้ผู้อื่นแล้ว การแก้ไขล่าสุดในเครื่องนี้ไม่ได้ถูกบันทึก';
        notify();
        return persist([['docs',path,undefined],['base',id,undefined],['outbox',id,undefined]]);
      }else{
        var SB=baseOf(S.h,S.items),SRaw={};S.items.forEach(function(r){SRaw[r.id]=r});
        var hp={};HF.forEach(function(f){if(!B||!eq(LH[f],B.h[f]))hp[f]=LH[f]});
        var ins=[],upd=[],rech=[],dels=[];
        Object.keys(LI).forEach(function(k){
          var li=LI[k],bi=B&&B.items[k],si=SB.items[k];
          if(!si){
            var changed=!bi||IF.some(function(f){return !eq(li[f],bi[f])});
            if(changed)ins.push(Object.assign({id:k,inspection_id:id},li));
            return;
          }
          var ref=bi||si,p={};
          IF.forEach(function(f){if(!eq(li[f],ref[f]))p[f]=li[f]});
          if('rres' in p&&(li.rres==='ok'||li.rres==='bad')){
            var added=li.after.filter(function(x){return (ref.after||[]).indexOf(x)<0});
            rech.push({id:k,res:li.rres,note:li.rnote,after:added,seen:(bi?bi.rchk_at:SRaw[k].rchk_at)||null,rdate:li.rdate});
            delete p.rres;delete p.rnote;delete p.after;delete p.rdate;
          }
          if(Object.keys(p).length)upd.push({id:k,p:p});
        });
        var cfx=[];
        if(B)Object.keys(B.items).forEach(function(k){
          if(LI[k]||!SB.items[k])return;
          /* we deleted it; was it changed on the server after our last sync? then it is a conflict, not a delete */
          if(IF.some(function(f){return !eq(SB.items[k][f],B.items[k][f])}))cfx.push(k);else dels.push(k);
        });
        if(cfx.length){
          var nd=clone(d),srv={},pre=id+'.';rowsToDoc(S.h,S.items).items.forEach(function(x){srv[x.id]=x});
          nd.bin=nd.bin||[];nd.cf=Object.assign({},nd.cf||{});
          cfx.forEach(function(k){
            var iid=k.slice(pre.length),it=srv[iid];if(!it)return;
            var be=nd.bin.filter(function(e){return e.t==='item'&&e.item&&e.item.id===iid})[0];
            nd.bin=nd.bin.filter(function(e){return e!==be});
            nd.items.splice(Math.min(be?be.i:nd.items.length,nd.items.length),0,it);
            nd.cf[iid]=new Date().toISOString();
          });
          nd.rev=syncRev(d.rev);nd.by='sync';
          cache.set(path,nd);remember(id,nd);ver[id]=(ver[id]||0)+1;notify();
          /* nothing written to the server this round; the next push sends the document with the item kept + flagged */
          return persist([['docs',path,nd]]).then(function(){schedule()});
        }
        if(Object.keys(hp).length)work=work.then(function(){return api.updateHeader(id,hp).then(function(r){if(!r||!r.length)throw {code:'not_owner',message:'not owner'}})});
        work=work.then(function(){return api.insertItems(ins)});
        upd.forEach(function(u){work=work.then(function(){return api.updateItem(u.id,u.p)})});
        rech.forEach(function(r){
          work=work.then(function(){return api.recheck(r.id,r.res,r.note,r.after,r.seen)}).then(function(res){
            if(res==='conflict'){conflictHere++;return}
            if(res==='ok'&&r.rdate&&r.rdate!==today())return api.updateItem(r.id,{rdate:r.rdate});
          });
        });
        work=work.then(function(){return api.deleteItems(dels)});
      }
      return work.then(function(){return serverDoc(id)}).then(function(S2){
        if(!S2.h)return done(id,v,[]);
        var nb=baseOf(S2.h,S2.items),ops=[['base',id,nb]];base.set(id,nb);
        if(conflictHere){conflicts+=conflictHere}
        if(ver[id]===v){
          var fresh=rowsToDoc(S2.h,S2.items),cur=cache.get(path);
          if(cur&&contentKey(fresh)!==contentKey(cur)){
            fresh.rev=syncRev(cur.rev);fresh.by='sync';fresh.createdAt=cur.createdAt||fresh.createdAt;
            cache.set(path,fresh);remember(id,fresh);ops.push(['docs',path,fresh]);notify();
          }
        }
        return done(id,v,ops);
      });
    });
  }

  /* ---------- actions on other people's documents (recheck / report fixed) ----------
     Members may not edit someone else's document; they act on single items through RPCs.
     Actions queue in the outbox (key "rx:<doc>.<item>" / "fx:<doc>.<item>") so they work offline,
     and are shown on the shared copy straight away until the server confirms them. */
  function uniq(a){var o=[];a.forEach(function(x){if(x&&o.indexOf(x)<0)o.push(x)});return o}
  function applyActs(docId,doc){
    outbox.forEach(function(ob){
      if((ob.type!=='rx'&&ob.type!=='fx')||ob.doc!==docId)return;
      (doc.items||[]).forEach(function(it){
        if(it.id!==ob.iid)return;
        it.after=uniq((it.after||[]).concat(ob.after.map(pathToId)));it.pend=ob.type;
        if(ob.type==='rx'){it.rres=ob.res;it.rnote=ob.note;it.rdate=today();it.st=ob.res==='ok'?'approved':'rejected'}
        else{it.st='fixed';it.rres='';it.fnote=ob.note}
      });
    });
    return doc;
  }
  var actListeners=[];
  var toastEl=null,toastT=null;
  function toast(t){
    css();if(!toastEl){toastEl=el('div',{class:'qo-toast',role:'status','aria-live':'polite'});document.body.appendChild(toastEl)}
    toastEl.textContent=t;toastEl.hidden=false;clearTimeout(toastT);toastT=setTimeout(function(){toastEl.hidden=true},7000);
  }
  function actMsg(t){toast(t);actListeners.forEach(function(f){try{f(t)}catch(e){}});try{window.dispatchEvent(new CustomEvent('qc-msg',{detail:t}))}catch(e){}}
  function pushAct(key,ob,v){
    var p=ob.type==='rx'?api.recheck(ob.item,ob.res,ob.note,ob.after,ob.seen||null):api.reportFixed(ob.item,ob.after,ob.note);
    return p.then(function(r){
      if(r==='conflict'){conflicts++;actMsg('มีคนบันทึกผลตรวจซ้ำรายการนี้ก่อนคุณ ระบบใช้ผลที่ถึงก่อน ผลของคุณเก็บไว้ในประวัติ')}
      else if(r==='gone')actMsg('รายการนี้ถูกเจ้าของลบไปแล้ว');
    },function(e){
      if(isNet(e))throw e;
      actMsg((ob.type==='rx'?'บันทึกผลตรวจซ้ำ':'แจ้งแก้แล้ว')+'ไม่สำเร็จ: '+(e.message||e.code||e));
    }).then(function(){return done(key,v,[])});
  }
  function act(type,docId,iid,o){
    return ready.then(function(){
      var x=shared.get(docId);if(!x)throw new Error('ไม่พบเอกสารนี้');
      var it=(x.data.items||[]).filter(function(i){return i.id===iid})[0];if(!it)throw new Error('ไม่พบรายการนี้');
      if(type==='fx'&&it.asg!==UID)throw new Error('รายการนี้ไม่ได้มอบหมายให้คุณ');
      if(type==='rx'&&o.res!=='ok'&&o.res!=='bad')throw new Error('เลือกผลตรวจซ้ำก่อน');
      var key=type+':'+docId+'.'+iid,prev=outbox.get(key);
      var ob={type:type,doc:docId,iid:iid,item:sid(docId,iid),res:o.res||'',note:o.note||'',
        after:uniq((prev?prev.after:[]).concat((o.after||[]).map(idToPath))),seen:prev?prev.seen:(it.rat||null)};
      ver[key]=(ver[key]||0)+1;outbox.set(key,ob);
      var nd=applyActs(docId,clone(x.data));nd.rev=(+x.data.rev||0)+1;
      var nx=Object.assign({},x,{data:nd,key:contentKey(nd)});shared.set(docId,nx);
      return persist([['outbox',key,ob],['shared',docId,nx]]).then(function(){notify();announce();schedule(0)});
    });
  }

  /* ---------- project members (names for owners, assignee picker) ---------- */
  var MEMBERS=[];
  function loadMembers(strict){
    var k='qc-online-members:'+CUR;
    try{MEMBERS=JSON.parse(lsGet(k)||'[]')}catch(e){MEMBERS=[]}
    var p=api.members(CUR).then(function(ms){
      return api.profiles(ms.map(function(m){return m.user_id})).then(function(ps){
        var by={};ps.forEach(function(p){by[p.id]=p});
        MEMBERS=ms.map(function(m){var p=by[m.user_id]||{};return {id:m.user_id,role:m.role,name:p.display_name||p.email||'สมาชิก',email:p.email||''}});
        lsSet(k,JSON.stringify(MEMBERS));notify();
      });
    });
    return strict?p:p.catch(function(e){if(isAuth(e)){authErr=true;status()}});
  }
  function nameOf(u){if(u===UID)return 'คุณ';var m=MEMBERS.filter(function(x){return x.id===u})[0];return m?m.name:'สมาชิก'}

  /* ---------- smart lists: my tasks / waiting for recheck / overdue ---------- */
  var ST_TH={open:'ยังไม่มอบหมาย',assigned:'มอบหมายแล้ว',fixed:'แจ้งแก้แล้ว รอตรวจซ้ำ',approved:'ตรวจซ้ำผ่าน',rejected:'ตรวจซ้ำไม่ผ่าน'};
  function allItems(){
    var out=[];
    function add(docId,d,owner,own,proj){
      if(!d||d.kind==='folder'||d.deletedAt||proj!==CUR)return;
      (d.items||[]).forEach(function(it){if(it.res==='fix'||it.res==='bad')out.push({doc:docId,d:d,it:it,owner:owner,own:own})});
    }
    cache.forEach(function(d,p){if(p.indexOf(PFX)===0)add(p.slice(PFX.length),d,UID,true,d._project)});
    shared.forEach(function(x,id){add(id,x.data,x.owner,false,x.project)});
    return out;
  }
  function stOf(it){return it.st||(it.rres==='ok'?'approved':it.rres==='bad'?'rejected':it.asg?'assigned':'open')}
  function lists(){
    var t=today(),all=allItems(),L={mine:[],recheck:[],late:[],open:[]};
    all.forEach(function(x){
      var s=stOf(x.it);
      if(x.it.asg===UID&&(s==='assigned'||s==='rejected'))L.mine.push(x);
      if(s==='fixed')L.recheck.push(x);
      if(x.it.due&&x.it.due<t&&(s==='open'||s==='assigned'||s==='rejected'))L.late.push(x);
      if(x.own&&s==='open')L.open.push(x);
    });
    L.mine.sort(function(a,b){return (a.it.due||'9')<(b.it.due||'9')?-1:1});
    return L;
  }
  /* ---------- 8.5 due-date reminders: a device notification once a day for my fixes due today / tomorrow / late.
     Works while the app has been opened that day; a reminder with the app closed needs the server (LINE OA). ---------- */
  var DUEK='qc-due-notified';
  function dueSoon(){
    var t=today(),tm=new Date(Date.now()+86400000).toLocaleDateString('sv-SE',{timeZone:'Asia/Bangkok'});
    return lists().mine.filter(function(x){return x.it.due&&x.it.due<=tm}).map(function(x){return {x:x,late:x.it.due<t,today:x.it.due===t}});
  }
  function dueCheck(force){
    if(!('Notification' in window)||Notification.permission!=='granted')return Promise.resolve(false);
    var t=today();if(!force&&lsGet(DUEK)===t)return Promise.resolve(false);
    var L=dueSoon();if(!L.length)return Promise.resolve(false);
    var late=L.filter(function(y){return y.late}).length,td=L.filter(function(y){return y.today}).length;
    var body=(late?'เลยกำหนด '+late+' รายการ · ':'')+(td?'ครบวันนี้ '+td+' รายการ · ':'')+'รวมที่ต้องแก้ภายในพรุ่งนี้ '+L.length+' รายการ';
    lsSet(DUEK,t);
    var show=function(reg){var o={body:body,tag:'qc-due',icon:'./icons/icon-192.png',data:{url:location.href}};return reg&&reg.showNotification?reg.showNotification('งานแก้ที่ใกล้ครบกำหนด',o):new Notification('งานแก้ที่ใกล้ครบกำหนด',o)};
    return (navigator.serviceWorker?navigator.serviceWorker.getRegistration():Promise.resolve(null)).then(show,function(){return show(null)}).then(function(){return true},function(){return false});
  }
  function askDue(){
    if(!('Notification' in window))return Promise.resolve('unsupported');
    return Promise.resolve(Notification.permission==='default'?Notification.requestPermission():Notification.permission).then(function(p){if(p==='granted')dueCheck(true);return p});
  }
  var taskBtn=null;
  function taskCount(){var L=lists();return L.mine.length+L.recheck.length+reqLists().todo.length}
  function updateTaskBtn(){if(!taskBtn)return;var n=taskCount();taskBtn.querySelector('b').textContent=n?String(n):'';taskBtn.classList.toggle('qo-has',!!n)}
  function tasksPanel(start){
    var v=overlay(),L=lists(),RL=reqLists(),tab=start||(RL.todo.length?'req':L.mine.length?'mine':L.recheck.length?'recheck':L.late.length?'late':'open');
    v.o.classList.add('qo-tasks');
    var TABS=[['req','ใบขอตรวจ'],['mine','งานของฉัน'],['recheck','รอตรวจซ้ำ'],['late','เลยกำหนด'],['open','ยังไม่มอบหมาย']];
    var bar=el('div',{class:'qo-tabs',role:'tablist'}),body=el('div',{class:'qo-list'});
    function draw(){
      L=lists();RL=reqLists();L.req=RL.open;bar.textContent='';body.textContent='';
      TABS.forEach(function(t){
        bar.appendChild(el('button',{type:'button',role:'tab','aria-selected':tab===t[0]?'true':'false',class:'qo-tab'+(tab===t[0]?' on':''),onclick:function(){tab=t[0];draw()}},t[1]+' ',el('span',{class:'qo-n'},String(L[t[0]].length))));
      });
      if(tab==='req'){drawRequests(body,RL,v);return}
      var list=L[tab];
      if(!list.length)body.appendChild(el('p',{class:'qo-sm',style:'padding:14px 4px'},{mine:'ไม่มีงานที่มอบหมายให้คุณค้างอยู่',recheck:'ไม่มีรายการที่แจ้งแก้แล้วรอตรวจซ้ำ',late:'ไม่มีรายการเลยกำหนด',open:'ทุกรายการที่ต้องแก้ในเอกสารของคุณมอบหมายแล้ว'}[tab]));
      list.forEach(function(x){
        var it=x.it,m=x.d.meta||{},s=stOf(it),late=it.due&&it.due<today()&&s!=='fixed'&&s!=='approved';
        var sub=[m.docno||m.work||'เอกสาร',x.own?'ของคุณ':'ของ '+nameOf(x.owner)].join(' · ');
        var chips=el('span',{class:'qo-chips'},el('span',{class:'qo-chip st-'+s},ST_TH[s]||s));
        if(it.asg)chips.appendChild(el('span',{class:'qo-chip'},'ผู้แก้ '+nameOf(it.asg)));
        if(it.due)chips.appendChild(el('span',{class:'qo-chip'+(late?' late':'')},(late?'เลยกำหนด ':'กำหนด ')+fmtD(it.due)));
        if(m.form==='safety')chips.appendChild(el('span',{class:'qo-chip late'},'ความปลอดภัย'));
        if(it.pend)chips.appendChild(el('span',{class:'qo-chip'},'รอส่ง'));
        body.appendChild(el('button',{type:'button',class:'qo-task',onclick:function(){v.close();openItem(x.doc,it.id)}},
          el('span',{class:'qo-tt'},(it.loc?it.loc+' · ':'')+(it.chk||it.note||'(ไม่มีชื่อรายการ)')),
          el('span',{class:'qo-sm'},sub),chips));
      });
    }
    v.c.append(el('div',{style:'display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap'},el('h2',null,'งาน'),
      el('span',{style:'display:flex;gap:8px;flex-wrap:wrap'},
        el('button',{class:'btn',type:'button',onclick:function(){v.close();searchPanel()}},'ค้นหา'),
        canCreate()?el('button',{class:'btn primary',type:'button',onclick:function(){v.close();requestForm()}},'+ ขอตรวจงาน'):null,
        el('button',{class:'btn',type:'button',onclick:v.close},'ปิด'))),bar,body);
    draw();
    var later=false;
    function busy(){var a=document.activeElement;return a&&v.o.contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)}
    var h=function(){if(!document.body.contains(v.o)){window.removeEventListener('qc-change',h);return}if(busy()){later=true;return}draw()};
    v.o.addEventListener('focusout',function(){setTimeout(function(){if(later&&!busy()){later=false;draw()}},0)});
    window.addEventListener('qc-change',h);
  }
  function fmtD(s){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');return m?(+m[3])+'/'+(+m[2]):s}
  function openItem(docId,iid){
    try{if(window.__qcHome&&window.__qcHome.view&&window.__qcHome.view()!=='form')window.__qcHome.go('form')}catch(e){}
    if(window.__qcForm&&window.__qcForm.openDoc)window.__qcForm.openDoc(docId,iid);
  }


  /* ---------- ใบขอตรวจงาน (inspection requests) ----------
     Rows live in REQS (cached per project in localStorage); creating and answering queue in the
     outbox ("rq:<id>" insert, "ra:<id>" answer) so they work offline and are shown at once. */
  var REQS=[],SRV=[],RQ_TH={requested:'รอผู้ตรวจรับนัด',accepted:'รับนัดแล้ว',passed:'ตรวจผ่าน',failed:'ตรวจไม่ผ่าน',cancelled:'ยกเลิกแล้ว'};
  function reqKey(){return 'qc-online-reqs:'+UID+':'+CUR}
  function loadReqCache(){try{SRV=JSON.parse(lsGet(reqKey())||'[]')}catch(e){SRV=[]}REQS=applyReqOps(SRV)}
  function applyReqOps(list){
    var by={},out=list.map(function(r){var c=Object.assign({},r);by[c.id]=c;return c});
    outbox.forEach(function(ob){
      if(ob.type==='rq'&&!by[ob.row.id]){var n=Object.assign({status:'requested',result_note:'',result_photos:[],created_at:new Date().toISOString()},ob.row,{pend:1});by[n.id]=n;out.push(n)}
    });
    outbox.forEach(function(ob){
      if(ob.type!=='ra')return;var r=by[ob.id];if(!r)return;r.pend=1;
      if(ob.action==='accept')r.status='accepted';
      else if(ob.action==='pass'||ob.action==='fail'){r.status=ob.action==='pass'?'passed':'failed';r.result_note=ob.note;r.result_by=UID}
      else if(ob.action==='cancel')r.status='cancelled';
      else if(ob.action==='reschedule'){r.scheduled_at=ob.at;r.status='requested'}
    });
    out.sort(function(a,b){return a.scheduled_at<b.scheduled_at?-1:1});
    return out;
  }
  function pullRequests(){
    return api.requests(CUR).then(function(rows){
      SRV=rows||[];var next=applyReqOps(SRV);
      lsSet(reqKey(),JSON.stringify(SRV));
      if(eq(next,REQS))return;
      REQS=next;notify();
    });
  }
  function reqLists(){
    var all=REQS,open=all.filter(function(r){return r.status==='requested'||r.status==='accepted'});
    var closed=all.filter(function(r){return !(r.status==='requested'||r.status==='accepted')}).sort(function(a,b){return (b.result_at||b.scheduled_at)<(a.result_at||a.scheduled_at)?-1:1}).slice(0,20);
    return {open:open,closed:closed,todo:open.filter(function(r){return r.inspector_id===UID})};
  }
  function refreshReqs(){REQS=applyReqOps(SRV);notify();announce();schedule(0)}
  function queue(key,ob){ver[key]=(ver[key]||0)+1;outbox.set(key,ob);return persist([['outbox',key,ob]]).then(refreshReqs)}
  function pushReq(key,ob,v){
    var p=ob.type==='rq'?api.insertRequest(ob.row).then(function(){return 'ok'},function(e){if(e&&(e.code==='23505'||/duplicate/i.test(e.message||'')))return 'ok';throw e})
      :api.answerRequest(ob.id,ob.action,ob.note,ob.photos,ob.at);
    return p.then(function(r){
      if(r==='closed')actMsg('ใบขอตรวจนี้ปิดไปแล้ว ผลของคุณไม่ได้ถูกบันทึก');
      else if(r==='gone')actMsg('ใบขอตรวจนี้ถูกลบไปแล้ว');
    },function(e){
      if(isNet(e))throw e;
      var m=e.message||e.code||String(e);
      actMsg((ob.type==='rq'?'ส่งใบขอตรวจ':'บันทึกผลใบขอตรวจ')+'ไม่สำเร็จ: '+(/inspector must be/.test(m)?'ผู้ตรวจไม่ได้อยู่ในโครงการแล้ว':/only the/.test(m)?'คุณไม่มีสิทธิ์ทำขั้นนี้':m));
    }).then(function(){return done(key,v,[])});
  }
  function requestCreate(o){
    var id='req_'+hex(16);
    var row={id:id,project_id:CUR,title:o.title,loc:o.loc||'',cat:o.cat||'',hold:!!o.hold,next_step:o.next||'',note:o.note||'',
      inspection_id:o.doc||null,requested_by:UID,inspector_id:o.inspector,scheduled_at:o.at};
    return queue('rq:'+id,{type:'rq',row:row}).then(function(){return id});
  }
  function requestAnswer(id,action,note,at){
    var key='ra:'+id+':'+action,ob={type:'ra',id:id,action:action,note:note||'',photos:[],at:at||null};
    return queue(key,ob);
  }
  function fmtAt(iso){var d=new Date(iso);if(isNaN(d))return '';function p(n){return (n<10?'0':'')+n}return d.getDate()+'/'+(d.getMonth()+1)+' '+p(d.getHours())+':'+p(d.getMinutes())+' น.'}
  function localInput(d){function p(n){return (n<10?'0':'')+n}return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes())}
  var reqDraft={};
  function drawRequests(body,RL,v){
    function card(r){
      var meIns=r.inspector_id===UID,meReq=r.requested_by===UID,open=r.status==='requested'||r.status==='accepted';
      var chips=el('span',{class:'qo-chips'},el('span',{class:'qo-chip rq-'+r.status},RQ_TH[r.status]||r.status));
      if(r.hold)chips.appendChild(el('span',{class:'qo-chip late',title:'จุดหยุดตรวจ: งานถัดไปต้องรอผลตรวจผ่าน'},'H จุดหยุดตรวจ'));
      chips.appendChild(el('span',{class:'qo-chip'},'นัด '+fmtAt(r.scheduled_at)));
      if(r.pend)chips.appendChild(el('span',{class:'qo-chip'},'รอส่ง'));
      var box=el('div',{class:'qo-task qo-req'},
        el('span',{class:'qo-tt'},r.title+(r.loc?' · '+r.loc:'')),
        el('span',{class:'qo-sm'},(meIns?'คุณเป็นผู้ตรวจ':'ผู้ตรวจ '+nameOf(r.inspector_id))+' · '+(meReq?'คุณขอตรวจ':'ขอโดย '+nameOf(r.requested_by))),chips);
      if(r.next_step)box.appendChild(el('span',{class:'qo-next '+(r.status==='passed'?'ok':r.hold?'lock':'')},
        r.status==='passed'?'เริ่มงานถัดไปได้: '+r.next_step:(r.hold?'รอผลก่อนเริ่ม: ':'งานถัดไป: ')+r.next_step));
      if(r.note)box.appendChild(el('span',{class:'qo-sm'},'หมายเหตุ: '+r.note));
      if(r.result_note)box.appendChild(el('span',{class:'qo-sm'},'ผลตรวจ: '+r.result_note));
      var acts=el('span',{class:'qo-acts'});
      if(r.inspection_id)acts.appendChild(el('button',{class:'btn',type:'button',onclick:function(){v.close();openItem(r.inspection_id,'')}},'เปิดเอกสาร'));
      if(open&&(meIns||ROLE==='pm')){
        if(r.status==='requested')acts.appendChild(el('button',{class:'btn',type:'button',onclick:function(){requestAnswer(r.id,'accept')}},'รับนัด'));
        var ta=el('textarea',{rows:2,placeholder:'ผลตรวจ / สิ่งที่ต้องแก้','aria-label':'บันทึกผลตรวจ '+r.title,class:'qo-note'});
        ta.value=reqDraft[r.id]||'';ta.addEventListener('input',function(){reqDraft[r.id]=ta.value});
        box.appendChild(ta);
        acts.appendChild(el('button',{class:'btn qo-pass',type:'button',onclick:function(){requestAnswer(r.id,'pass',ta.value);delete reqDraft[r.id]}},'ผ่าน'));
        acts.appendChild(el('button',{class:'btn qo-fail',type:'button',onclick:function(){
          if(!ta.value.trim()){ta.focus();toast('ระบุสิ่งที่ต้องแก้ก่อนบันทึกว่าไม่ผ่าน');return}
          requestAnswer(r.id,'fail',ta.value);delete reqDraft[r.id];
        }},'ไม่ผ่าน'));
      }
      if(open&&(meReq||meIns||ROLE==='pm')){
        var dt=el('input',{type:'datetime-local','aria-label':'เวลานัดใหม่ '+r.title,class:'qo-dt'});dt.value=localInput(new Date(r.scheduled_at));
        acts.appendChild(el('span',{class:'qo-move'},dt,el('button',{class:'btn',type:'button',onclick:function(){
          var d=new Date(dt.value);if(isNaN(d)){dt.focus();return}requestAnswer(r.id,'reschedule','',d.toISOString());
        }},'เลื่อนนัด')));
      }
      if(open&&(meReq||ROLE==='pm'))acts.appendChild(el('button',{class:'btn',type:'button',onclick:function(){QCU.ask({title:'ยกเลิกใบขอตรวจ',text:'“'+r.title+'” จะถูกยกเลิก และแจ้งผู้เกี่ยวข้อง',ok:'ยกเลิกใบขอตรวจ',cancel:'ไม่ยกเลิก'}).then(function(y){if(y)requestAnswer(r.id,'cancel')})}},'ยกเลิก'));
      if(!open&&r.status==='failed'&&meReq)acts.appendChild(el('button',{class:'btn primary',type:'button',onclick:function(){v.close();requestForm({title:r.title,loc:r.loc,cat:r.cat,hold:r.hold,next:r.next_step,inspector:r.inspector_id,doc:r.inspection_id,note:'แก้แล้ว ขอตรวจใหม่'})}},'ขอตรวจใหม่'));
      if(acts.childNodes.length)box.appendChild(acts);
      return box;
    }
    if(!RL.open.length)body.appendChild(el('p',{class:'qo-sm',style:'padding:10px 4px'},canCreate()?'ยังไม่มีใบขอตรวจที่เปิดอยู่ กด “+ ขอตรวจงาน” เมื่องานพร้อมให้ตรวจ':'ยังไม่มีใบขอตรวจที่เปิดอยู่'));
    RL.open.forEach(function(r){body.appendChild(card(r))});
    if(RL.closed.length){body.appendChild(el('div',{class:'qo-sm',style:'font-weight:700;margin-top:6px'},'ปิดแล้วล่าสุด'));RL.closed.forEach(function(r){body.appendChild(card(r))})}
  }
  var REQ_CATS=['เหล็กเสริม','แบบหล่อ / นั่งร้าน','คอนกรีต','งานก่ออิฐ / ฉาบ','งานไฟฟ้า','งานสุขาภิบาล','งานสถาปัตย์ / อื่นๆ','ความปลอดภัย'];
  function requestForm(pre){
    pre=pre||{};
    var v=overlay(),err=el('div',{class:'qo-err'});
    var curId=window.__qcForm&&window.__qcForm.cur&&window.__qcForm.cur(),cd=curId&&cache.get(PFX+curId),canLink=!!(cd&&base.has(curId));
    var cm=(cd&&cd.meta)||{};
    function field(label,input){return el('label',{class:'qo-f'},el('span',null,label),input)}
    var title=el('input',{placeholder:'เช่น ตรวจเหล็กเสริม คาน-พื้น'});title.value=pre.title||cm.work||'';
    var loc=el('input',{placeholder:'เช่น ชั้น 3 โซน A'});loc.value=pre.loc||'';
    var cat=el('select',null,el('option',{value:''},'— หมวดงาน —'));REQ_CATS.forEach(function(c){cat.appendChild(el('option',{value:c},c))});cat.value=pre.cat||'';
    var t=new Date(Date.now()+86400000);t.setHours(9,0,0,0);
    var at=el('input',{type:'datetime-local'});at.value=localInput(t);
    var ins=el('select',null,el('option',{value:''},'— เลือกผู้ตรวจ —'));
    MEMBERS.filter(function(m){return m.id!==UID&&m.role!=='headman'}).forEach(function(m){ins.appendChild(el('option',{value:m.id},m.name+' ('+(ROLE_TH[m.role]||m.role)+')'))});
    ins.value=pre.inspector||'';
    var hold=el('input',{type:'checkbox'});hold.checked=pre.hold!==false;
    var next=el('input',{placeholder:'เช่น เทคอนกรีตพื้นชั้น 3'});next.value=pre.next||'';
    var note=el('textarea',{rows:2,placeholder:'เช่น เตรียมบันไดและไฟส่องสว่างไว้แล้ว'});note.value=pre.note||'';
    var link=el('input',{type:'checkbox'});link.checked=!!(pre.doc||canLink);
    var send=el('button',{class:'btn primary qo-gbtn',type:'button'},'ส่งใบขอตรวจ');
    send.addEventListener('click',function(){
      err.textContent='';
      if(!title.value.trim()){title.focus();err.textContent='ระบุงานที่ขอตรวจ';return}
      if(!ins.value){ins.focus();err.textContent='เลือกผู้ตรวจ';return}
      var d=new Date(at.value);if(isNaN(d)){at.focus();err.textContent='ระบุวันเวลานัด';return}
      send.disabled=true;
      requestCreate({title:title.value.trim(),loc:loc.value.trim(),cat:cat.value,hold:hold.checked,next:next.value.trim(),note:note.value.trim(),
        inspector:ins.value,at:d.toISOString(),doc:link.checked?(pre.doc||(canLink?curId:null)):null}).then(function(){
        v.close();toast(navigator.onLine?'ส่งใบขอตรวจแล้ว · ผู้ตรวจจะได้รับแจ้งทาง LINE':'บันทึกใบขอตรวจแล้ว · จะส่งเมื่อมีสัญญาณ');tasksPanel('req');
      },function(e){send.disabled=false;err.textContent=e.message||String(e)});
    });
    v.c.append(el('h2',null,'ขอตรวจงาน'),
      el('p',null,'ผู้ตรวจได้รับแจ้งทาง LINE ทันที ผลตรวจจะบอกว่างานถัดไปเริ่มได้หรือยัง'),
      field('งานที่ขอตรวจ',title),field('ตำแหน่ง',loc),field('หมวดงาน',cat),field('วันเวลานัด',at),field('ผู้ตรวจ',ins),
      el('label',{class:'qo-chk'},hold,el('span',null,'เป็นจุดหยุดตรวจ (H): งานถัดไปต้องรอผลตรวจผ่าน')),
      field('งานถัดไปที่รอผลนี้',next),field('หมายเหตุถึงผู้ตรวจ',note),
      (pre.doc||canLink)?el('label',{class:'qo-chk'},link,el('span',null,'แนบเอกสาร “'+((cm.docno||cm.work||'ที่เปิดอยู่'))+'”')):null,
      err,send,el('button',{class:'btn',type:'button',onclick:v.close},'ยกเลิก'));
    if(!MEMBERS.length)err.textContent='ยังโหลดรายชื่อสมาชิกไม่ได้ ต่ออินเทอร์เน็ตแล้วลองใหม่';
    title.focus();
  }

  /* ---------- ค้นหาข้ามทุกเอกสาร ----------
     Free text such as "เหล็กเสริม ชั้น 3 ไม่ผ่าน เดือนนี้": known words become filters (result, period,
     category, person, safety), everything left must appear in the item or its document. */
  var S_RES=[['ไม่ผ่าน','res','bad'],['ต้องแก้ไข','res','fix'],['ต้องแก้','res','fix'],['ตรวจซ้ำผ่าน','st','approved'],['ตรวจซ้ำไม่ผ่าน','st','rejected'],['รอตรวจซ้ำ','st','fixed'],['แจ้งแก้แล้ว','st','fixed'],['ค้างแก้','pend',1],['ค้าง','pend',1],['เลยกำหนด','late',1],['ยังไม่ตรวจ','res',''],['ผ่าน','res','ok']];
  var S_TIME=[['วันนี้','today'],['เมื่อวาน','yday'],['สัปดาห์นี้','week'],['อาทิตย์นี้','week'],['สัปดาห์ที่แล้ว','lweek'],['เดือนนี้','month'],['เดือนที่แล้ว','lmonth']];
  var S_CAT=[['เหล็กเสริม','เหล็กเสริม'],['เหล็ก','เหล็กเสริม'],['แบบหล่อ','แบบหล่อ'],['นั่งร้าน','นั่งร้าน'],['คอนกรีต','คอนกรีต'],['ก่ออิฐ','ก่ออิฐ'],['ฉาบ','ฉาบ'],['ไฟฟ้า','ไฟฟ้า'],['สุขาภิบาล','สุขาภิบาล'],['ประปา','สุขาภิบาล'],['สถาปัตย์','สถาปัตย์'],['ราวกันตก','ราวกันตก']];
  function parseQuery(q){
    var f={text:[],labels:[]},rest=' '+(q||'').toLowerCase()+' ';
    function take(word){var i=rest.indexOf(word);if(i<0)return false;rest=rest.slice(0,i)+' '+rest.slice(i+word.length);return true}
    if(take('ความปลอดภัย')||take('safety')){f.safety=true;f.labels.push('แบบฟอร์ม: ตรวจความปลอดภัย')}
    S_RES.forEach(function(x){if(f.res===undefined&&f.st===undefined&&!f.pend&&!f.late&&take(x[0])){f[x[1]]=x[2];f.labels.push('ผล: '+x[0])}});
    S_TIME.forEach(function(x){if(!f.when&&take(x[0])){f.when=x[1];f.labels.push('ช่วง: '+x[0])}});
    S_CAT.forEach(function(x){if(!f.cat&&take(x[0])){f.cat=x[1];f.labels.push('หมวด: '+x[0])}});
    if(take('ของฉัน')){f.mine=true;f.labels.push('ผู้แก้: คุณ')}
    MEMBERS.forEach(function(m){if(f.person)return;var first=(m.name||'').split(/\s+/).filter(function(w){return w.length>1&&!/^(pm|คุณ|ช่าง|เฮดแมน|โฟร์แมน)$/i.test(w)})[0];if(first&&take(first.toLowerCase())){f.person=m.id;f.labels.push('คน: '+m.name)}});
    f.text=rest.split(/\s+/).filter(Boolean);
    if(f.text.length)f.labels.push('คำ: '+f.text.join(' '));
    return f;
  }
  function range(w){
    var n=new Date(),d0=new Date(n.getFullYear(),n.getMonth(),n.getDate());
    function iso(d){return d.toLocaleDateString('sv-SE')}
    var dow=(d0.getDay()+6)%7,mon=new Date(d0.getTime()-dow*86400000);
    if(w==='today')return [iso(d0),iso(d0)];
    if(w==='yday'){var y=new Date(d0.getTime()-86400000);return [iso(y),iso(y)]}
    if(w==='week')return [iso(mon),iso(new Date(mon.getTime()+6*86400000))];
    if(w==='lweek'){var lm=new Date(mon.getTime()-7*86400000);return [iso(lm),iso(new Date(lm.getTime()+6*86400000))]}
    if(w==='month')return [iso(new Date(n.getFullYear(),n.getMonth(),1)),iso(new Date(n.getFullYear(),n.getMonth()+1,0))];
    if(w==='lmonth')return [iso(new Date(n.getFullYear(),n.getMonth()-1,1)),iso(new Date(n.getFullYear(),n.getMonth(),0))];
    return null;
  }
  function searchItems(q){
    var f=parseQuery(q),out=[],t=today(),rg=f.when&&range(f.when);
    function scan(docId,d,owner,own,proj){
      if(!d||d.kind==='folder'||d.deletedAt||proj!==CUR)return;
      var m=d.meta||{},isSafe=m.form==='safety';
      if(f.safety&&!isSafe)return;
      if(rg&&!(m.date>=rg[0]&&m.date<=rg[1]))return;
      var dtext=[m.docno,m.work,m.project,m.site].join(' ').toLowerCase();
      (d.items||[]).forEach(function(it){
        var s=stOf(it),fx=it.res==='fix'||it.res==='bad';
        if(f.res!==undefined&&it.res!==f.res)return;
        if(f.st&&!(fx&&s===f.st))return;
        if(f.pend&&!(fx&&it.rres!=='ok'))return;
        if(f.late&&!(fx&&it.due&&it.due<t&&s!=='approved'&&s!=='fixed'))return;
        if(f.mine&&it.asg!==UID)return;
        if(f.person&&it.asg!==f.person)return;
        var itext=[it.loc,it.chk,it.note,it.cat,it.ref,it.rnote].join(' ').toLowerCase();
        if(f.cat&&(it.cat||'').toLowerCase().indexOf(f.cat)<0&&itext.indexOf(f.cat)<0)return;
        var all=itext+' '+dtext;
        if(!f.text.every(function(w){return all.indexOf(w)>=0}))return;
        if(!it.loc&&!it.chk&&!it.note&&!it.res)return;
        out.push({doc:docId,d:d,it:it,owner:owner,own:own,safe:isSafe});
      });
    }
    cache.forEach(function(d,p){if(p.indexOf(PFX)===0)scan(p.slice(PFX.length),d,UID,true,d._project)});
    shared.forEach(function(x,id){scan(id,x.data,x.owner,false,x.project)});
    out.sort(function(a,b){var x=(a.d.meta||{}).date||'',y=(b.d.meta||{}).date||'';return x<y?1:x>y?-1:0});
    return {f:f,items:out};
  }
  var RES_TH={ok:'ผ่าน',fix:'ต้องแก้ไข',bad:'ไม่ผ่าน','':'ยังไม่ตรวจ'};
  function searchPanel(initial){
    var v=overlay();v.o.classList.add('qo-tasks');
    var inp=el('input',{type:'search',placeholder:'เช่น เหล็กเสริม ชั้น 3 ไม่ผ่าน เดือนนี้','aria-label':'ค้นหาทุกเอกสารในโครงการ',class:'qo-search'});
    inp.value=initial||'';
    var parsed=el('div',{class:'qo-chips'}),count=el('div',{class:'qo-sm'}),body=el('div',{class:'qo-list'});
    var QUICK=['ไม่ผ่าน','ต้องแก้','รอตรวจซ้ำ','เลยกำหนด','ของฉัน','สัปดาห์นี้','เดือนนี้','ความปลอดภัย'];
    var quick=el('div',{class:'qo-chips'});
    QUICK.forEach(function(w){quick.appendChild(el('button',{type:'button',class:'qo-qchip',onclick:function(){
      var q=' '+inp.value+' ';inp.value=(q.indexOf(' '+w+' ')>=0?q.replace(' '+w+' ',' '):q+w).trim();run();inp.focus();
    }},w))});
    var tm=null;
    function run(){
      var r=searchItems(inp.value);parsed.textContent='';body.textContent='';
      r.f.labels.forEach(function(l){parsed.appendChild(el('span',{class:'qo-chip'},l))});
      count.textContent=inp.value.trim()?'พบ '+r.items.length+' รายการ'+(r.items.length>200?' (แสดง 200 รายการแรก)':''):'พิมพ์คำค้น หรือแตะตัวกรองด้านบน';
      if(!inp.value.trim())return;
      r.items.slice(0,200).forEach(function(x){
        var it=x.it,m=x.d.meta||{},s=stOf(it),fx=it.res==='fix'||it.res==='bad';
        var chips=el('span',{class:'qo-chips'},el('span',{class:'qo-chip res-'+(it.res||'none')},RES_TH[it.res||'']));
        if(fx)chips.appendChild(el('span',{class:'qo-chip st-'+s},ST_TH[s]||s));
        if(it.cat)chips.appendChild(el('span',{class:'qo-chip'},it.cat));
        if(x.safe)chips.appendChild(el('span',{class:'qo-chip late'},'ความปลอดภัย'));
        if(it.asg)chips.appendChild(el('span',{class:'qo-chip'},'ผู้แก้ '+nameOf(it.asg)));
        body.appendChild(el('button',{type:'button',class:'qo-task',onclick:function(){v.close();openItem(x.doc,it.id)}},
          el('span',{class:'qo-tt'},(it.loc?it.loc+' · ':'')+(it.chk||it.note||'(ไม่มีชื่อรายการ)')),
          el('span',{class:'qo-sm'},[m.docno||m.work||'เอกสาร',m.date?fmtD(m.date):'',x.own?'ของคุณ':'ของ '+nameOf(x.owner)].filter(Boolean).join(' · ')),chips));
      });
    }
    inp.addEventListener('input',function(){clearTimeout(tm);tm=setTimeout(run,150)});
    v.c.append(el('div',{style:'display:flex;justify-content:space-between;align-items:center'},el('h2',null,'ค้นหา'),el('button',{class:'btn',type:'button',onclick:v.close},'ปิด')),
      inp,quick,parsed,count,body);
    run();inp.focus();
  }

  function pull(){
    var own,fl,sh;
    return Promise.all([api.inspections({project:CUR,owner:UID}),api.folders(),api.inspections({project:CUR,notOwner:UID})]).then(function(r){
      own=r[0]||[];fl=r[1]||[];sh=r[2]||[];
      return api.items(own.map(function(h){return h.id}).concat(sh.map(function(h){return h.id})));
    }).then(function(items){
      var by={},ops=[],changed=false;
      items.forEach(function(r){(by[r.inspection_id]=by[r.inspection_id]||[]).push(r)});
      var seen={};
      own.forEach(function(h){
        seen[h.id]=1;
        if(outbox.has(h.id))return;                  /* local edits win until they are pushed */
        var path=PFX+h.id,doc=rowsToDoc(h,by[h.id]||[]),cur=cache.get(path),nb=baseOf(h,by[h.id]||[]);
        base.set(h.id,nb);ops.push(['base',h.id,nb]);
        if(!cur||contentKey(cur)!==contentKey(doc)){
          doc.rev=syncRev(cur?cur.rev:0);doc.by='sync';if(cur)doc.createdAt=cur.createdAt||doc.createdAt;
          cache.set(path,doc);remember(h.id,doc);ops.push(['docs',path,doc]);changed=true;
        }
      });
      cache.forEach(function(d,path){
        var id=path.slice(PFX.length);
        if(path.indexOf(PFX)!==0||d.kind==='folder'||d._project!==CUR||seen[id]||outbox.has(id)||!base.has(id))return;
        cache.delete(path);base.delete(id);ops.push(['docs',path,undefined],['base',id,undefined]);changed=true;
      });
      var fseen={};
      fl.forEach(function(f){
        fseen[f.id]=1;if(outbox.has(f.id))return;
        var path=PFX+f.id,doc={kind:'folder',name:f.name,createdAt:f.created_at,updatedAt:f.updated_at,deletedAt:f.deleted_at||''},cur=cache.get(path);
        if(!cur||!eq(cur,doc)){cache.set(path,doc);ops.push(['docs',path,doc]);changed=true}
      });
      cache.forEach(function(d,path){
        var id=path.slice(PFX.length);
        if(path.indexOf(PFX)===0&&d.kind==='folder'&&!fseen[id]&&!outbox.has(id)){cache.delete(path);ops.push(['docs',path,undefined]);changed=true}
      });
      var sseen={};
      sh.forEach(function(h){
        sseen[h.id]=1;
        var doc=rowsToDoc(h,by[h.id]||[]),cur=shared.get(h.id);
        applyActs(h.id,doc);
        if(cur&&cur.key===contentKey(doc)&&cur.owner===h.owner_id)return;
        doc.rev=cur?(+cur.data.rev||0)+1:1;doc.submittedAt=h.updated_at;doc.sub={rev:doc.rev,at:h.updated_at};
        var x={owner:h.owner_id,data:doc,key:contentKey(doc),project:h.project_id};
        shared.set(h.id,x);ops.push(['shared',h.id,x]);changed=true;
      });
      shared.forEach(function(x,id){if(x.project===CUR&&!sseen[id]){shared.delete(id);ops.push(['shared',id,undefined]);changed=true}});
      return persist(ops).then(function(){if(changed){notify();announce()}});
    }).then(pullRequests);
  }

  /* ---------- status (badge + floating pill) ---------- */
  var pill=null;
  function syncState(){
    var n=outbox.size+uploads.size+(FS.ready===true?FS.pending:0);
    return {online:navigator.onLine,pending:n,syncing:syncing,error:lastErr,conflicts:conflicts,project:CUR,role:ROLE,
      setup:!!setupInfo(),auth:authErr,forms:{ready:FS.ready===true,pending:FS.pending,why:FS.why||(FS.ready===null?'ยังไม่ได้ตรวจกับเซิร์ฟเวอร์':'')},
      state:!navigator.onLine?'offline':authErr?'auth':lastErr?'error':(n||syncing)?'pending':'ok'};
  }
  window.__qcSync=syncState;
  window.__qcPendingUpload=function(id){return uploads.has(id)};
  var ROLE_TH={pm:'PM',foreman:'โฟร์แมน',headman:'เฮดแมน',viewer:'ผู้ดู'};
  function status(){
    var s=syncState();
    try{window.dispatchEvent(new Event('qc-sync'))}catch(e){}
    if(!pill)return;
    var p=PROJECTS.filter(function(x){return x.id===CUR})[0];
    var txt=s.state==='offline'?'ออฟไลน์ · รอส่ง '+s.pending:s.state==='auth'?'ต้องเข้าสู่ระบบใหม่ · รอส่ง '+s.pending:s.state==='error'?'ซิงก์ไม่สำเร็จ ชั่วคราว':s.state==='pending'?'กำลังซิงก์…':'ซิงก์แล้ว';
    pill.querySelector('.qo-t').textContent=(p?p.name:'')+' · '+txt;
    pill.className='qo-pill qo-'+s.state;
    pill.title=(ME?ME.email+' · ':'')+(ROLE_TH[ROLE]||'')+(s.error?' · '+s.error:'')+(conflicts?' · ผลตรวจซ้ำชนกัน '+conflicts+' รายการ (ใช้ผลที่ถึงระบบก่อน ของคุณเก็บไว้ในประวัติ)':'');
  }

  /* ---------- UI: login, project picker, menu, members ---------- */
  function css(){
    if(document.getElementById('qo-css'))return;
    var s=el('style',{id:'qo-css'});
    s.textContent=[
      '.qo-ov{position:fixed;inset:0;z-index:2147483000;background:var(--bg,#f4f6f8);color:var(--fg,#1b2430);display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto}',
      '.qo-card{width:min(440px,100%);background:var(--surface,#fff);border:1px solid var(--line,#d5dbe1);border-radius:14px;padding:22px;display:flex;flex-direction:column;gap:12px;box-shadow:0 8px 30px rgba(0,0,0,.12)}',
      '.qo-card h2{margin:0;font-size:1.25rem}.qo-card p{margin:0;color:var(--muted,#5a6672);font-size:.92rem;line-height:1.5}',
      '.qo-card input,.qo-card select{min-height:42px;padding:8px 10px;border:1px solid var(--line,#ccd);border-radius:8px;font:inherit;background:var(--bg,#fff);color:inherit}',
      '.qo-list{display:flex;flex-direction:column;gap:8px}.qo-row{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 10px;border:1px solid var(--line,#ddd);border-radius:10px}',
      '.qo-err{color:#b42318;font-size:.9rem;min-height:1.2em}.qo-sm{font-size:.85rem;color:var(--muted,#5a6672)}',
      '.qo-pill{position:fixed;left:8px;bottom:8px;z-index:99999;display:flex;align-items:center;gap:6px;max-width:calc(100vw - 16px);padding:6px 12px;border-radius:999px;border:1px solid var(--line,#ccd);background:var(--surface,#fff);color:var(--fg,#222);font-size:.8rem;box-shadow:0 2px 10px rgba(0,0,0,.15);cursor:pointer}',
      '.qo-pill .qo-d{width:8px;height:8px;border-radius:50%;background:#12b76a;flex:0 0 auto}.qo-pill.qo-pending .qo-d{background:#f79009}.qo-pill.qo-offline .qo-d{background:#98a2b3}.qo-pill.qo-error .qo-d{background:#d92d20}',
      '.qo-pill .qo-t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.qo-gbtn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:46px;font-size:1rem}',
      '.qo-tb{position:fixed;right:8px;bottom:8px;z-index:99999;display:flex;align-items:center;gap:6px;min-height:40px;padding:6px 14px;border-radius:999px;border:1px solid var(--line,#ccd);background:var(--surface,#fff);color:var(--fg,#222);font:inherit;font-size:.85rem;font-weight:600;box-shadow:0 2px 10px rgba(0,0,0,.15);cursor:pointer}',
      '.qo-tb b{min-width:1.4em;padding:0 5px;border-radius:999px;background:#f79009;color:#fff;font-size:.78rem;line-height:1.5;text-align:center}.qo-tb b:empty{display:none}',
      '.qo-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:58px;z-index:2147483001;max-width:min(520px,calc(100vw - 24px));padding:10px 14px;border-radius:10px;background:#1b2430;color:#fff;font-size:.9rem;line-height:1.45;box-shadow:0 6px 24px rgba(0,0,0,.25)}.qo-toast[hidden]{display:none}',
      '.qo-search{min-height:48px;font-size:1rem}.qo-qchip{min-height:40px;padding:0 12px;border-radius:999px;border:1px solid var(--line,#ccd);background:transparent;color:inherit;font:inherit;font-size:.85rem;cursor:pointer}',
      '.qo-chip.res-ok{background:#d1fadf;color:#05603a}.qo-chip.res-fix{background:#fef0c7;color:#93370d}.qo-chip.res-bad{background:#fee4e2;color:#b42318}',
      '.qo-chip.rq-requested{background:#fef0c7;color:#93370d}.qo-chip.rq-accepted{background:#d1e9ff;color:#175cd3}.qo-chip.rq-passed{background:#d1fadf;color:#05603a}.qo-chip.rq-failed{background:#fee4e2;color:#b42318}',
      '.qo-req{cursor:default}.qo-next{font-size:.85rem;font-weight:600;padding:4px 8px;border-radius:8px;background:rgba(127,127,127,.12)}.qo-next.lock{background:#fee4e2;color:#7a271a}.qo-next.ok{background:#d1fadf;color:#05603a}',
      '.qo-acts{display:flex;flex-wrap:wrap;gap:6px;width:100%}.qo-acts .btn{min-height:44px}.qo-pass{background:#12b76a!important;border-color:#12b76a!important;color:#fff!important}.qo-fail{background:#d92d20!important;border-color:#d92d20!important;color:#fff!important}',
      '.qo-note{width:100%;box-sizing:border-box;min-height:56px;padding:8px;border:1px solid var(--line,#ccd);border-radius:8px;font:inherit;background:var(--bg,#fff);color:inherit}',
      '.qo-move{display:flex;gap:6px;align-items:center}.qo-dt{min-height:44px;padding:0 8px;border:1px solid var(--line,#ccd);border-radius:8px;font:inherit;background:var(--bg,#fff);color:inherit}',
      '.qo-f{display:flex;flex-direction:column;gap:4px;font-size:.88rem;font-weight:600}.qo-f textarea{min-height:56px;padding:8px 10px;border:1px solid var(--line,#ccd);border-radius:8px;font:inherit;font-weight:400;background:var(--bg,#fff);color:inherit}',
      '.qo-chk{display:flex;gap:10px;align-items:flex-start;font-size:.9rem;min-height:44px}.qo-chk input{width:22px;height:22px;margin-top:2px;flex:0 0 auto}',
      '.qo-tasks{align-items:flex-start}.qo-tasks .qo-card{width:min(640px,100%)}',
      '.qo-tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:2px}.qo-tab{flex:0 0 auto;min-height:40px;padding:6px 12px;border-radius:999px;border:1px solid var(--line,#ccd);background:transparent;color:inherit;font:inherit;font-size:.88rem;cursor:pointer}',
      '.qo-tab.on{background:var(--fg,#1b2430);color:var(--bg,#fff);border-color:transparent}.qo-n{opacity:.7;font-size:.8rem}',
      '.qo-task{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;padding:12px;border:1px solid var(--line,#ddd);border-radius:12px;background:var(--surface,#fff);color:inherit;font:inherit;cursor:pointer;min-height:56px}',
      '.qo-tt{font-weight:600;line-height:1.35}.qo-chips{display:flex;flex-wrap:wrap;gap:4px}.qo-chip{font-size:.75rem;padding:1px 8px;border-radius:999px;background:rgba(127,127,127,.14)}',
      '.qo-chip.st-fixed{background:#fef0c7;color:#93370d}.qo-chip.st-rejected,.qo-chip.late{background:#fee4e2;color:#b42318}.qo-chip.st-approved{background:#d1fadf;color:#05603a}.qo-chip.st-assigned{background:#d1e9ff;color:#175cd3}'
    ].join('');
    document.head.appendChild(s);
  }
  function overlay(){css();var o=el('div',{class:'qo-ov'});var c=el('div',{class:'qo-card'});o.appendChild(c);document.body.appendChild(o);return {o:o,c:c,close:function(){o.remove()}}}
  function toOffline(){lsSet('qc-mode','offline');location.href=location.pathname}
  function showLogin(){
    var v=overlay(),err=el('div',{class:'qo-err'});
    var b=el('button',{class:'btn primary qo-gbtn',type:'button'},'เข้าสู่ระบบด้วย Google');
    b.addEventListener('click',function(){
      b.disabled=true;err.textContent='';if(window.qcDesktop)err.textContent='เปิดหน้าเข้าสู่ระบบในเบราว์เซอร์แล้ว เข้าสู่ระบบเสร็จระบบจะพากลับมาที่โปรแกรมเอง';
      api.signIn((window.qcDesktop&&window.qcDesktop.authRedirect)||(location.origin+location.pathname)).then(function(r){if(r&&r.error)throw r.error}).catch(function(e){b.disabled=false;err.textContent='เข้าสู่ระบบไม่สำเร็จ: '+(e.message||e)});
    });
    v.c.append(el('h2',null,'QC App · ออนไลน์'),
      el('p',null,'เข้าสู่ระบบเพื่อใช้เอกสารร่วมกับทีมในโครงการ ข้อมูลยังบันทึกในเครื่องก่อนเสมอ แม้สัญญาณหลุดก็ใช้งานต่อได้'),
      b,err,el('button',{class:'btn',type:'button',onclick:toOffline},'กลับไปใช้แบบออฟไลน์ (เฉพาะเครื่องนี้)'));
    return new Promise(function(){});   /* the page redirects to Google */
  }
  function pickProject(isAdmin){
    return new Promise(function(resolve){
      var v=overlay(),list=el('div',{class:'qo-list'}),err=el('div',{class:'qo-err'});
      v.c.append(el('h2',null,'เลือกโครงการ'),el('p',null,'บัญชี '+(ME&&ME.email||'')));
      if(PROJECTS.length){
        PROJECTS.forEach(function(p){
          list.appendChild(el('button',{class:'btn',type:'button',style:'justify-content:space-between;display:flex;text-align:left',onclick:function(){v.close();resolve(p.id)}},
            el('span',null,p.name+(p.site?' · '+p.site:'')),el('span',{class:'qo-sm'},ROLE_TH[p.role]||p.role)));
        });
      }else{
        v.c.appendChild(el('p',null,isAdmin?'ยังไม่มีโครงการ สร้างโครงการแรกได้ด้านล่าง':'บัญชีนี้ยังไม่เป็นสมาชิกโครงการใด ติดต่อแอดมินให้เพิ่มคุณเข้าโครงการ แล้วเปิดหน้านี้ใหม่'));
      }
      v.c.appendChild(list);
      if(isAdmin){
        var n=el('input',{placeholder:'ชื่อโครงการใหม่'}),s=el('input',{placeholder:'สถานที่ / ไซต์ (ไม่บังคับ)'});
        var mk=el('button',{class:'btn primary',type:'button'},'สร้างโครงการ (คุณเป็น PM)');
        mk.addEventListener('click',function(){
          var name=n.value.trim();if(!name){n.focus();return}
          mk.disabled=true;err.textContent='';
          api.createProject(name,s.value.trim()).then(function(p){return api.addMember(p.id,UID,'pm').then(function(){return p.id})})
            .then(function(id){return loadProjects().then(function(){v.close();resolve(id)})})
            .catch(function(e){mk.disabled=false;err.textContent='สร้างไม่สำเร็จ: '+(e.message||e)});
        });
        v.c.append(el('p',{class:'qo-sm'},'แอดมิน: สร้างโครงการใหม่'),n,s,mk);
      }
      v.c.append(err,el('button',{class:'btn',type:'button',onclick:function(){api.signOut().then(function(){location.reload()})}},'ออกจากระบบ'));
    });
  }
  function membersPanel(){
    var v=overlay(),list=el('div',{class:'qo-list'}),err=el('div',{class:'qo-err'});
    var p=PROJECTS.filter(function(x){return x.id===CUR})[0]||{};
    var em=el('input',{type:'email',placeholder:'อีเมล Google ของสมาชิก'}),rl=el('select');
    ['foreman','headman','viewer','pm'].forEach(function(r){rl.appendChild(el('option',{value:r},ROLE_TH[r]))});
    var add=el('button',{class:'btn primary',type:'button'},'เพิ่มสมาชิก');
    function render(){
      list.textContent='กำลังโหลด…';
      api.members(CUR).then(function(ms){
        return api.profiles(ms.map(function(m){return m.user_id})).then(function(ps){
          var by={};ps.forEach(function(x){by[x.id]=x});list.textContent='';
          ms.forEach(function(m){
            var pr=by[m.user_id]||{};
            var rm=el('button',{class:'btn sm',type:'button'},'นำออก');
            rm.addEventListener('click',function(){if(m.user_id===UID){err.textContent='นำตัวเองออกจากตรงนี้ไม่ได้';return}api.removeMember(CUR,m.user_id).then(render,function(e){err.textContent=e.message})});
            list.appendChild(el('div',{class:'qo-row'},el('span',null,(pr.display_name||pr.email||m.user_id)+' ',el('span',{class:'qo-sm'},pr.email||'')),el('span',{class:'qo-sm'},ROLE_TH[m.role]||m.role),rm));
          });
        });
      }).catch(function(e){list.textContent='';err.textContent=e.message});
    }
    add.addEventListener('click',function(){
      var e=em.value.trim();if(!e){em.focus();return}
      err.textContent='';add.disabled=true;
      api.profileByEmail(e).then(function(pr){
        if(!pr)throw new Error('ไม่พบบัญชีนี้ ให้เจ้าของอีเมลเปิดแอปโหมดออนไลน์และเข้าสู่ระบบด้วย Google หนึ่งครั้งก่อน');
        return api.addMember(CUR,pr.id,rl.value);
      }).then(function(){em.value='';render()},function(x){err.textContent=x.message||String(x)}).then(function(){add.disabled=false});
    });
    v.c.append(el('h2',null,'สมาชิก · '+(p.name||'')),list,el('p',{class:'qo-sm'},'เพิ่มสมาชิก (เจ้าของอีเมลต้องเข้าสู่ระบบในแอปมาแล้วอย่างน้อยหนึ่งครั้ง)'),em,rl,add,err,
      el('button',{class:'btn',type:'button',onclick:v.close},'ปิด'));
    render();
  }
  function linePanel(){
    var v=overlay(),body=el('div',{class:'qo-list'}),err=el('div',{class:'qo-err'}),poll=null;
    v.c.append(el('h2',null,'แจ้งเตือนทาง LINE'),
      el('p',null,'รับแจ้งเตือนเมื่อมีงานแก้มอบหมายให้คุณ เมื่อเฮดแมนแจ้งแก้แล้วในเอกสารของคุณ ผลตรวจซ้ำ และสรุปงานเลยกำหนดทุกเช้า 8 โมง'),body,err);
    function close(){clearInterval(poll);v.close()}
    function linked(){
      body.textContent='';
      body.append(el('p',{style:'font-weight:600;color:#05603a'},'✓ เชื่อม LINE แล้ว'),
        el('button',{class:'btn',type:'button',onclick:function(){api.lineUnlink().then(show,function(e){err.textContent=e.message})}},'ยกเลิกการเชื่อม'));
    }
    function show(){
      clearInterval(poll);body.textContent='กำลังโหลด…';err.textContent='';
      api.lineStatus().then(function(s){
        if(s.linked)return linked();
        body.textContent='';
        if(!s.oa){body.appendChild(el('p',null,'ผู้ดูแลระบบยังไม่ได้ตั้งค่าบัญชี LINE Official Account ของบริษัท'));return}
        var get=el('button',{class:'btn primary qo-gbtn',type:'button'},'ขอรหัสเชื่อมบัญชี');
        get.addEventListener('click',function(){
          get.disabled=true;
          api.lineLinkStart().then(function(r){
            body.textContent='';
            var oa=r.oa.charAt(0)==='@'?r.oa:'@'+r.oa;
            body.append(
              el('p',null,'1. เพิ่มเพื่อน LINE ของบริษัท '+oa),
              el('a',{class:'btn',href:'https://line.me/R/ti/p/'+encodeURIComponent(oa),target:'_blank',rel:'noopener',style:'display:flex;align-items:center;justify-content:center;min-height:46px;text-decoration:none'},'เพิ่มเพื่อน '+oa),
              el('p',null,'2. ส่งรหัสนี้ในแชท (ใช้ได้ 15 นาที)'),
              el('div',{style:'font-size:2rem;font-weight:700;letter-spacing:.3em;text-align:center;padding:8px;border:1px dashed var(--line,#ccd);border-radius:10px','aria-label':'รหัส '+r.code.split('').join(' ')},r.code),
              el('a',{class:'btn primary',href:'https://line.me/R/oaMessage/'+encodeURIComponent(oa)+'/?'+encodeURIComponent(r.code),target:'_blank',rel:'noopener',style:'display:flex;align-items:center;justify-content:center;min-height:46px;text-decoration:none'},'เปิด LINE แล้วส่งรหัส'),
              el('p',{class:'qo-sm'},'หน้านี้จะเปลี่ยนเป็น “เชื่อมแล้ว” เองเมื่อ LINE ได้รับรหัส'));
            poll=setInterval(function(){if(!document.body.contains(v.o)){clearInterval(poll);return}api.lineStatus().then(function(x){if(x.linked){clearInterval(poll);linked()}},function(){})},4000);
          },function(e){get.disabled=false;err.textContent='ขอรหัสไม่สำเร็จ: '+(e.message||e)});
        });
        body.appendChild(get);
      },function(e){body.textContent='';err.textContent=isNet(e)?'ต้องต่ออินเทอร์เน็ตเพื่อตั้งค่านี้':'โหลดไม่สำเร็จ: '+(e.message||e)});
    }
    v.c.append(el('button',{class:'btn',type:'button',onclick:close},'ปิด'));
    show();
  }
  function menu(){
    var v=overlay(),s=syncState(),p=PROJECTS.filter(function(x){return x.id===CUR})[0]||{};
    v.c.append(el('h2',null,p.name||'โครงการ'),
      el('p',null,(ME&&ME.email||'')+' · '+(ROLE_TH[ROLE]||ROLE||'')+(ME&&ME.org_role==='admin'?' · แอดมิน':'')),
      el('p',null,s.state==='offline'?'ออฟไลน์อยู่ · รอส่งขึ้นระบบ '+s.pending+' รายการ (จะส่งเองเมื่อมีสัญญาณ)':s.state==='error'?'ซิงก์ไม่สำเร็จ: '+s.error:s.pending?'กำลังส่งขึ้นระบบ '+s.pending+' รายการ':'ข้อมูลตรงกับระบบแล้ว'),
      conflicts?el('p',null,'ผลตรวจซ้ำชนกับคนอื่น '+conflicts+' รายการ: ระบบใช้ผลที่ถึงก่อน ผลของคุณเก็บไว้ในประวัติ'):null);
    if(!canCreate())v.c.appendChild(el('p',null,'บทบาทนี้เปิดดูเอกสารของทีมได้ แต่สร้างเอกสารใหม่ไม่ได้'));
    if(s.state==='auth')v.c.append(el('p',{class:'qo-err'},'การเข้าสู่ระบบหมดอายุ ข้อมูลที่ทำไว้ยังอยู่ในเครื่องครบ '+s.pending+' รายการ และจะส่งขึ้นระบบหลังเข้าสู่ระบบใหม่'),
      el('button',{class:'btn primary',type:'button',onclick:function(){v.close();showLogin()}},'เข้าสู่ระบบใหม่'));
    v.c.append(el('button',{class:'btn',type:'button',onclick:function(){v.close();tasksPanel()}},'งาน · ใบขอตรวจ'));
    v.c.append(el('button',{class:'btn',type:'button',onclick:function(){v.close();searchPanel()}},'ค้นหาทุกเอกสาร'));
    v.c.append(el('button',{class:'btn',type:'button',onclick:function(){v.close();linePanel()}},'เชื่อม LINE รับแจ้งเตือน'));
    if('Notification' in window)v.c.append(el('button',{class:'btn',type:'button',id:'qo-due',onclick:function(){askDue().then(function(p){toast(p==='granted'?'เปิดแจ้งเตือนกำหนดแก้ในเครื่องนี้แล้ว (วันละครั้ง)':p==='denied'?'เครื่องนี้ปิดการแจ้งเตือนไว้ เปิดได้ที่การตั้งค่าเบราว์เซอร์':'ยังไม่ได้เปิดแจ้งเตือน')})}},Notification.permission==='granted'?'แจ้งเตือนกำหนดแก้: เปิดอยู่':'เปิดแจ้งเตือนกำหนดแก้ (ในเครื่อง)'));
    v.c.append(el('button',{class:'btn',type:'button',onclick:function(){v.close();runSync()}},'ซิงก์ตอนนี้'));
    if(ROLE==='pm'||(ME&&ME.org_role==='admin'))v.c.append(el('button',{class:'btn',type:'button',onclick:function(){v.close();membersPanel()}},'จัดการสมาชิก'));
    if(PROJECTS.length>1||(ME&&ME.org_role==='admin'))v.c.append(el('button',{class:'btn',type:'button',onclick:function(){lsSet(PK,'');location.reload()}},'เปลี่ยนโครงการ'));
    v.c.append(
      el('button',{class:'btn',type:'button',onclick:function(){
        confirmLeave().then(function(y){if(y)api.signOut().then(function(){location.reload()})});
      }},'ออกจากระบบ'),
      el('button',{class:'btn',type:'button',onclick:function(){confirmLeave().then(function(y){if(y)toOffline()})}},'สลับไปโหมดออฟไลน์'),
      el('button',{class:'btn primary',type:'button',onclick:v.close},'ปิด'));
  }
  function confirmLeave(){
    if(!(outbox.size||uploads.size))return Promise.resolve(true);
    return QCU.ask({title:'ยังมีข้อมูลที่ยังไม่ได้ส่งขึ้นระบบ',text:(outbox.size+uploads.size)+' รายการ จะรอส่งในเครื่องนี้จนกว่าจะกลับเข้ามาในบัญชีเดิม ถ้าล้างข้อมูลเครื่องหรือเปลี่ยนเครื่อง ข้อมูลนี้จะหาย',ok:'ออกต่อ',cancel:'อยู่ต่อเพื่อส่งก่อน'});
  }
  function showPill(){
    css();
    pill=el('button',{class:'qo-pill',type:'button','aria-label':'สถานะออนไลน์และเมนูบัญชี'},el('span',{class:'qo-d'}),el('span',{class:'qo-t'},''));
    pill.addEventListener('click',menu);document.body.appendChild(pill);
    taskBtn=el('button',{class:'qo-tb',type:'button','aria-label':'งานของฉันและรายการรอตรวจซ้ำ',onclick:function(){tasksPanel()}},'งาน ',el('b',null,''));
    document.body.appendChild(taskBtn);status();updateTaskBtn();
  }

  /* ---------- boot ---------- */
  function loadProjects(){
    return api.myProjects().then(function(ps){PROJECTS=ps||[];lsSet(PL+':'+UID,JSON.stringify(PROJECTS))},function(e){
      try{PROJECTS=JSON.parse(lsGet(PL+':'+UID)||'[]')}catch(x){PROJECTS=[]}
      if(!PROJECTS.length&&!isNet(e))throw e;
    });
  }
  function whenBody(){return document.body?Promise.resolve():new Promise(function(r){document.addEventListener('DOMContentLoaded',r)})}
  /* ---------- setup (once per device, needs internet) and cache-first start ---------- */
  var SETUP='qc-setup-done';
  function setupInfo(){try{var o=JSON.parse(lsGet(SETUP)||'null');return o&&o.uid?o:null}catch(e){return null}}
  function meKey(u){return 'qc-online-me:'+u}
  function withTimeout(p,ms){return Promise.race([p,new Promise(function(res){setTimeout(function(){res('timeout')},ms)})])}
  function showNotSetup(why){
    var v=overlay();
    v.c.append(el('h2',null,'เครื่องนี้ยังไม่เคยเชื่อมต่อ'),
      el('p',null,why||'การใช้แบบออนไลน์ครั้งแรกในเครื่องนี้ต้องมีอินเทอร์เน็ต เพื่อเข้าสู่ระบบและดึงโครงการ สมาชิก และเอกสารมาเก็บไว้ในเครื่อง หลังจากนั้นใช้งานได้แม้ไม่มีสัญญาณหลายวัน'),
      el('button',{class:'btn primary',type:'button',onclick:function(){location.reload()}},'ลองใหม่'),
      el('button',{class:'btn',type:'button',onclick:toOffline},'ใช้แบบออฟไลน์ (เฉพาะเครื่องนี้) ไปก่อน'));
    return new Promise(function(){});
  }
  function identify(u,cached){
    UID=u.id;UIDH=UID.replace(/-/g,'');PFX='data/users/'+UID+'/';
    ME={id:UID,email:u.email||'',name:(u.user_metadata&&(u.user_metadata.full_name||u.user_metadata.name))||''};
    if(cached){try{var m=JSON.parse(lsGet(meKey(UID))||'null');if(m)ME=Object.assign(ME,m)}catch(e){}}
  }
  /* project zones (005): the PM's list is the project's; cached under the project name used by the location field */
  function zonesFromProjects(){(PROJECTS||[]).forEach(function(p){if(p&&p.name&&Array.isArray(p.zones)&&p.zones.length)lsSet('qc-zones:'+p.name,JSON.stringify(p.zones))})}
  function saveZones(name,list){
    var p=(PROJECTS||[]).filter(function(x){return x.id===CUR})[0];
    if(!p||p.name!==name)return Promise.resolve({local:true});
    return api.setZones(CUR,list).then(function(z){p.zones=z||list;lsSet(PL+':'+UID,JSON.stringify(PROJECTS));zonesFromProjects();return {ok:true}},
      function(e){if(noTable(e)||e&&e.code==='PGRST202')return {local:true,why:'เซิร์ฟเวอร์ยังไม่เปิดส่วนนี้'};if(e&&(e.code==='42501'||/not allowed/.test(e.message||'')))return {denied:true};return {local:true,why:isNet(e)?'ไม่มีสัญญาณ':'บันทึกขึ้นเซิร์ฟเวอร์ไม่สำเร็จ'}});
  }
  function choose(){
    var isAdmin=ME.org_role==='admin',saved=lsGet(PK);
    var pick=PROJECTS.filter(function(p){return p.id===saved})[0]||(PROJECTS.length===1&&!isAdmin?PROJECTS[0]:null);
    return pick?pick.id:pickProject(isAdmin);
  }
  /* everything offline work needs, fetched up front (not on demand): profile, projects + roles, members, documents */
  function runSetup(){
    var fail=function(){throw {setup:true}};
    return Promise.all([api.myProjects().then(function(ps){PROJECTS=ps||[];lsSet(PL+':'+UID,JSON.stringify(PROJECTS))}),
      api.myProfile(UID).then(function(p){if(p)ME.org_role=p.org_role})]).catch(fail).then(function(){
      lsSet(meKey(UID),JSON.stringify({email:ME.email,name:ME.name,org_role:ME.org_role||null}));
      zonesFromProjects();
      return choose();
    }).then(function(id){
      CUR=id;lsSet(PK,id);
      return loadMembers(true).then(function(){return pull()}).catch(fail);
    }).then(function(){
      lsSet(SETUP,JSON.stringify({uid:UID,at:new Date().toISOString(),projects:PROJECTS.length}));
    });
  }
  function start(){
    ROLE=(PROJECTS.filter(function(p){return p.id===CUR})[0]||{}).role||null;
    try{bc=new BroadcastChannel('qc-online-'+UID);bc.onmessage=function(){loadAll().then(notify)}}catch(e){}
    try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){}
    loadReqCache();
    showPill();
    window.addEventListener('online',function(){schedule(0)});window.addEventListener('offline',status);
    setInterval(function(){if(!document.hidden)schedule(0)},60000);
    document.addEventListener('visibilitychange',function(){if(!document.hidden){schedule(0);setTimeout(dueCheck,3000)}});
    setTimeout(dueCheck,4000);
    try{stopRealtime=api.subscribe(CUR,function(){schedule(1500)})}catch(e){}
    schedule(0);
  }
  var ready=whenBody().then(function(){
    /* the session check never gates the form on a set-up device: it runs with a short timeout and the cache wins */
    return withTimeout(api.session().catch(function(e){return {err:e}}),navigator.onLine?4000:300);
  }).then(function(s){
    var set=setupInfo(),sess=s&&s.user?s:null;
    /* devices that used the online beta before the setup flag existed already hold a full cache: adopt it */
    if(!set){
      var legacyUid=sess?sess.user.id:null;
      if(!legacyUid)try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);if(k&&k.indexOf(PL+':')===0){legacyUid=k.slice(PL.length+1);break}}}catch(e){}
      var lp=legacyUid&&lsGet(PL+':'+legacyUid);
      if(lp&&lp!=='[]'&&lsGet(PK)){lsSet(SETUP,JSON.stringify({uid:legacyUid,at:new Date().toISOString(),migrated:true}));set=setupInfo()}
    }
    if(set){
      if(sess&&sess.user.id!==set.uid){lsSet(SETUP,'');set=null}       /* a different account signed in: set up again */
    }
    if(set){
      identify(sess?sess.user:{id:set.uid},true);
      if(!sess)authErr=navigator.onLine&&s!=='timeout'&&!(s&&s.err&&isNet(s.err));   /* online but no session = sign-in expired */
      try{PROJECTS=JSON.parse(lsGet(PL+':'+UID)||'[]')}catch(e){PROJECTS=[]}
      return Promise.all([openDb().then(function(d){idb=d;return loadAll()})]).then(function(){
        var saved=lsGet(PK),ok=PROJECTS.filter(function(p){return p.id===saved})[0];
        return ok?saved:choose();
      }).then(function(id){
        CUR=id;lsSet(PK,id);loadMembers();start();
        /* background refresh of what setup cached */
        if(sess&&navigator.onLine){
          loadProjects().then(function(){ROLE=(PROJECTS.filter(function(p){return p.id===CUR})[0]||{}).role||ROLE;zonesFromProjects();status()}).catch(function(){});
          api.myProfile(UID).then(function(p){if(p){ME.org_role=p.org_role;lsSet(meKey(UID),JSON.stringify({email:ME.email,name:ME.name,org_role:ME.org_role||null}))}},function(){});
        }
      });
    }
    if(!sess){
      if(!navigator.onLine||s==='timeout'||(s&&s.err&&isNet(s.err)))return showNotSetup();
      return showLogin();
    }
    identify(sess.user,false);
    if(!navigator.onLine)return showNotSetup();
    return openDb().then(function(d){idb=d;return loadAll()}).then(runSetup).then(start,function(e){
      if(e&&e.setup)return showNotSetup('ดึงข้อมูลตั้งต้นไม่ครบ (สัญญาณหลุดระหว่างดึง) เครื่องนี้ยังไม่พร้อมใช้แบบออฟไลน์ ต่ออินเทอร์เน็ตแล้วลองใหม่');
      throw e;
    });
  });

  /* ---------- assets (photos) ---------- */
  function getBlob(id){
    return ready.then(function(){return tx(['blobs'],'readonly',function(t){return t.objectStore('blobs').get(id)})}).then(function(b){
      if(b)return b;
      var p=idToPath(id);if(!p)return null;
      return api.download(p).then(function(dl){
        if(!dl)return null;
        var fixed=/^image\//.test(dl.type)?dl:new Blob([dl],{type:'image/jpeg'});
        return persist([['blobs',id,fixed]]).then(function(){return fixed});
      },function(){return null});
    });
  }
  var assets={
    upload:function(blob){
      if(blob.size>MAXB)return Promise.reject({code:'too_large'});
      var id=newAssetId();uploads.add(id);
      return persist([['blobs',id,blob],['uploads',id,1]]).then(function(){
        schedule();return {id:id,url:'./_blob/'+id,sizeBytes:blob.size,contentType:blob.type||'image/jpeg'};
      },function(){uploads.delete(id);return Promise.reject({code:'quota_or_state'})});
    },
    delete:function(id){
      var p=idToPath(id),pending=uploads.has(id);uploads.delete(id);
      return persist([['blobs',id,undefined],['uploads',id,undefined]]).then(function(){
        if(!pending&&p&&p.indexOf(UID+'/')===0&&navigator.onLine)return api.remove(p).catch(function(){});
      }).then(function(){return {deleted:true}});
    }
  };
  var user={id:function(){return Promise.resolve(UID)},me:function(){return Promise.resolve({id:UID,email:ME&&ME.email,name:ME&&ME.name})},
    isOwner:function(){return true},canEdit:function(){return true},can:function(){return Promise.resolve(true)},
    profiles:function(ids){return api.profiles(ids).then(function(ps){var o={};ps.forEach(function(p){o[p.id]={name:p.display_name||p.email||''}});return o})}};
  var downloads={save:function(req){
    var blob=req.data instanceof Blob?req.data:new Blob([req.data]),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=req.filename;document.body.appendChild(a);a.click();a.remove();
    if(/^qc-backup-/.test(req.filename)){try{localStorage.setItem('qc-last-backup',String(Date.now()))}catch(e){}window.dispatchEvent(new Event('qc-change'))}
    setTimeout(function(){URL.revokeObjectURL(url)},60000);
    return Promise.resolve({status:'saved'});
  }};

  /* photos load straight from the cache / Storage, like the offline shell */
  var PLACE='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  var urlCache={},BLOBRE=/(?:^|\/)_blob\/([^\/?#]+)(?:[?#].*)?$/;
  var nativeFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    var u=typeof input==='string'?input:(input&&input.url)||'',m=BLOBRE.exec(u);
    if(!m)return nativeFetch(input,init);
    return getBlob(decodeURIComponent(m[1])).then(function(b){
      return b?new Response(b,{status:200,headers:{'Content-Type':b.type||'image/jpeg'}}):new Response('',{status:404});
    });
  };
  window.__qcUrl=function(id){return urlCache[id]||(PLACE+'#qc='+encodeURIComponent(id))};
  function resolveImg(img){
    var src=img.getAttribute('src')||'',i=src.indexOf('#qc=');
    if(src.indexOf('data:image/gif')!==0||i<0)return;
    var id=decodeURIComponent(src.slice(i+4));
    function put(u){if((img.getAttribute('src')||'')===src)img.src=u}
    if(urlCache[id]){put(urlCache[id]);return}
    getBlob(id).then(function(b){
      if(!b)return;
      urlCache[id]=URL.createObjectURL(b);put(urlCache[id]);
    });
  }
  function scan(n){if(n.nodeType!==1)return;if(n.tagName==='IMG')resolveImg(n);else if(n.querySelectorAll)n.querySelectorAll('img').forEach(resolveImg)}
  new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==='attributes')resolveImg(m.target);else m.addedNodes.forEach(scan)})})
    .observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});

  /* ---------- hooks used by pwa-home / pwa-send / pwa-extras ---------- */
  function ownDocs(){var out=[];cache.forEach(function(d,p){if(p.indexOf(PFX)===0&&d.kind!=='folder'&&!d.deletedAt&&d._project===CUR)out.push({id:p.slice(PFX.length),data:clone(d)})});return out}
  window.__qcStats=function(){return {docs:ownDocs().length}};
  /* ---------- workspace facade for the new UX (006). Reads are cached per user so the shell opens offline;
     messages go through their own outbox (client_id = idempotent resend). ---------- */
  var WS=api.ws||null,wsNo=false;
  function wsKey(k){return 'qc-wsc:'+UID+':'+k}
  function cached(k,fn){
    if(!WS||wsNo)return Promise.resolve(JSON.parse(lsGet(wsKey(k))||'null'));
    return fn().then(function(v){try{lsSet(wsKey(k),JSON.stringify(v))}catch(e){}return v},function(e){
      if(noTable(e)||(e&&(e.code==='PGRST202'||e.code==='42883')))wsNo=true;   /* server without 006 yet */
      var c=lsGet(wsKey(k));if(c!=null)return JSON.parse(c);if(isNet(e)||wsNo)return null;throw e});
  }
  function msgQ(){try{return JSON.parse(lsGet('qc-msgq:'+UID)||'[]')}catch(e){return []}}
  function setMsgQ(q){lsSet('qc-msgq:'+UID,JSON.stringify(q));notifyMsgs()}
  var msgListeners=[];function notifyMsgs(){msgListeners.forEach(function(f){try{f()}catch(e){}})}
  function flushMsgs(){
    var q=msgQ();if(!q.length||!WS||wsNo)return Promise.resolve();
    var m=q[0];
    if((m.files||[]).some(function(f){return uploads.has(f)}))return Promise.resolve();   /* photos first (uploadAll), then the message */
    return Promise.resolve((m.files||[]).map(function(f){return idToPath(f)||f})).then(function(ph){
      var row={client_id:m.client_id,project_id:m.project_id,channel_id:m.channel_id,inspection_id:m.inspection_id||null,item_id:m.item_id||null,body:m.body,photos:ph.filter(Boolean)};
      return WS.post(row);
    }).then(function(){setMsgQ(msgQ().filter(function(x){return x.client_id!==m.client_id}));return flushMsgs()},function(e){
      if(isNet(e)||isAuth(e))throw e;
      /* refused by the server (no permission / channel gone): keep it visible as failed instead of retrying forever */
      setMsgQ(msgQ().map(function(x){return x.client_id===m.client_id?Object.assign({},x,{failed:(e&&e.message)||'ส่งไม่สำเร็จ'}):x}));
    });
  }
  function projectDocs(){
    var out=ownDocs();
    shared.forEach(function(x,id){if(x&&x.data&&!x.data.deletedAt&&(!x.data._project||x.data._project===CUR))out.push({id:id,data:clone(x.data),owner:x.owner||x.data._owner||null,shared:true})});
    return out;
  }
  var wsApi={
    available:function(){return !!WS&&!wsNo},
    me:function(){return {id:UID,name:ME&&ME.name||'',email:ME&&ME.email||'',org_role:ME&&ME.org_role||'staff'}},
    projects:function(){return (PROJECTS||[]).slice()},
    project:function(){return CUR},
    switchProject:function(id){if(id&&id!==CUR){lsSet(PK,id);location.reload()}},
    docs:projectDocs,
    company:function(){return cached('company',WS?WS.company:null)},
    companyCode:function(){return WS?WS.companyCode():Promise.resolve(null)},
    rotateCode:function(){return WS.rotateCode()},
    join:function(code){return WS.join(code)},
    updateCompany:function(p){return WS.updateCompany(p)},
    people:function(){return cached('people',WS?WS.people:null)},
    projectPeople:function(p){p=p||CUR;return cached('pp:'+p,function(){return WS.projectPeople(p)})},
    perms:function(p){p=p||CUR;return cached('perm:'+p,function(){return WS.perms(p)})},
    roles:function(){return cached('roles',WS?WS.roles:null)},
    saveRole:function(r){return WS.saveRole(r)},deleteRole:function(id){return WS.deleteRole(id)},
    setMemberRoles:function(p,u,ids){return WS.setMemberRoles(p||CUR,u,ids)},
    audit:function(){return WS.audit()},
    channels:function(p){p=p||CUR;return cached('ch:'+p,function(){return WS.ensureChannels(p).then(function(){return WS.channels(p)})})},
    saveChannel:function(r){return WS.saveChannel(Object.assign({project_id:CUR},r))},
    access:function(ch){return WS.access(ch)},setAccess:function(rows){return WS.setAccess(rows)},
    unread:function(p){p=p||CUR;return cached('un:'+p,function(){return WS.unread(p)})},
    markRead:function(ch){return WS&&!wsNo?WS.markRead(ch).catch(function(){}):Promise.resolve()},
    messages:function(f){var k='m:'+(f.item?'i:'+f.item:'c:'+f.channel);
      return cached(k,function(){return WS.messages(f)}).then(function(rows){
        var pend=msgQ().filter(function(m){return f.item?m.item_id===f.item:(m.channel_id===f.channel&&!m.item_id)});
        return (rows||[]).concat(pend.map(function(m){return {client_id:m.client_id,author:UID,body:m.body,photos:m.files||[],created_at:m.at,pending:true,failed:m.failed||null,item_id:m.item_id||null}}));
      })},
    post:function(m){
      var row={client_id:'msg_'+QCU.randHex(10),project_id:CUR,channel_id:m.channel_id,inspection_id:m.inspection_id||null,item_id:m.item_id||null,body:m.body||'',files:m.files||[],at:new Date().toISOString()};
      setMsgQ(msgQ().concat([row]));schedule(0);return row;
    },
    retry:function(cid){setMsgQ(msgQ().map(function(x){if(x.client_id===cid){x=Object.assign({},x);delete x.failed}return x}));schedule(0)},
    drop:function(cid){setMsgQ(msgQ().filter(function(x){return x.client_id!==cid}))},
    pendingMessages:function(){return msgQ().length},
    onMessages:function(f){msgListeners.push(f)},
    search:function(t){return WS&&!wsNo?WS.search(CUR,t).catch(function(){return []}):Promise.resolve([])},
    replies:function(ch){return cached('rp:'+ch,function(){return WS.replies(ch)}).then(function(rows){var n={};(rows||[]).forEach(function(r){n[r.item_id]=(n[r.item_id]||0)+1});
      msgQ().forEach(function(m){if(m.item_id&&m.channel_id===ch){n[m.item_id]=(n[m.item_id]||0)+1;n['~'+m.item_id]=1}});return n})},
    itemEvents:function(ids){return cached('ev:'+ids.join(',').slice(0,120),function(){return WS.itemEvents(ids)})},
    plan:function(p){p=p||CUR;return cached('plan:'+p,function(){return WS.plan(p)})},
    savePlanTask:function(r){return WS.savePlanTask(Object.assign({project_id:CUR},r))},deletePlanTask:function(id){return WS.deletePlanTask(id)},
    baselines:function(p){p=p||CUR;return cached('bl:'+p,function(){return WS.baselines(p)})},
    approveBaseline:function(p){return WS.approveBaseline(p||CUR)},
    commitments:function(ids){return cached('cm:'+CUR,function(){return WS.commitments(ids)})},
    assign:function(row){return WS.assign(row)},
    answer:function(t,w,st,why,pct){return WS.answer(t,w,st,why,pct)},
    setProject:function(patch){return WS.setProject(CUR,patch)},
    share:function(docId,blob,days){var path=UID+'/'+docId+'-'+Date.now()+'.pdf';
      return WS.share(path,blob,days,{project_id:CUR,doc_id:docId,path:path,expires_at:new Date(Date.now()+days*864e5).toISOString()})},
    photoUrl:function(id){return window.__qcUrl?window.__qcUrl(id):null},
    subscribe:function(cb){return WS&&!wsNo?WS.subscribe(CUR,cb):function(){}},
    nameOf:nameOf,
    members:function(){return MEMBERS.slice()},
    createProject:function(name,site){return api.createProject(name,site)},
    addMember:function(p,u,role){return api.addMember(p,u,role)}
  };
  window.__qcWS=wsApi;
  window.addEventListener('online',function(){schedule(0)});

  window.__qcDocs=ownDocs;
  window.__qcGetDoc=function(id){var d=cache.get(PFX+id);if(d)return clone(d);var s=shared.get(id);return s?clone(s.data):null};
  window.__qcBlob=function(id){return getBlob(id)};
  var NOT_ONLINE='โหมดออนไลน์ยังไม่รองรับการรับไฟล์/กู้คืนจากไฟล์ สลับไปโหมดออฟไลน์เพื่อใช้ฟีเจอร์นี้';
  window.__qcCommit=function(){return Promise.reject(new Error(NOT_ONLINE))};
  window.__qc={importData:function(){return Promise.reject(new Error(NOT_ONLINE))}};
  window.__qcOnline={sync:function(){runSync()},state:syncState,project:function(){return CUR},role:function(){return ROLE},
    uid:function(){return UID},members:function(){return MEMBERS.slice()},name:nameOf,canCreate:canCreate,
    recheck:function(doc,iid,res,note,after){return act('rx',doc,iid,{res:res,note:note,after:after})},
    reportFixed:function(doc,iid,note,after){return act('fx',doc,iid,{note:note,after:after})},
    tasks:function(t){tasksPanel(t)},dueSoon:dueSoon,dueCheck:dueCheck,saveZones:saveZones,formSync:function(){return formSync()},lists:lists,search:function(q){searchPanel(q)},requestForm:function(o){requestForm(o)},requests:function(){return REQS.slice()},parseQuery:parseQuery,onMessage:function(f){actListeners.push(f)}};

  var caps={db:db,user:user,assets:assets,downloads:downloads};
  window.claude={use:function(n){return ready.then(function(){return caps[n]||null},function(){return null})}};
})();
