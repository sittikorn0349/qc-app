/* Online storage shell (Supabase). Same window.claude.use('db'|'user'|'assets'|'downloads') API as
   pwa-shell.js, so the form does not change. Loaded only in online mode (see the loader in index.html).

   Offline-first: every write lands in a per-user IndexedDB cache + outbox first, then a sync loop
   pushes it. Push diffs the local document against the last server snapshot ("base") so only fields
   this device changed are written (other people's rechecks survive). Recheck results go through the
   recheck_item() RPC, which refuses to overwrite a newer recheck made by someone else. */
(function(){
  'use strict';
  window.__PWA=true;window.__ONLINE=true;
  var CFG={url:'https://kcuhizrtegornpqtaijx.supabase.co',key:'sb_publishable_nFtSYV-yofy8A49VPojy3g_TvNUCSgX',bucket:'inspection-photos'};
  var MAXB=20*1024*1024,PK='qc-online-project',PL='qc-online-projects';
  var HF=['docno','insp_date','site','work','weather','meta','sign','summary','remarks','folder_id','extra','deleted_at'];
  var IF=['ord','loc','chk','res','note','cat','ref','before','after','rres','rdate','rnote'];

  /* ---------- small helpers ---------- */
  function lsGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  function clone(o){return o==null?o:JSON.parse(JSON.stringify(o))}
  function stable(o){
    if(o===undefined)return 'null';
    if(o===null||typeof o!=='object')return JSON.stringify(o);
    if(Array.isArray(o))return '['+o.map(stable).join(',')+']';
    return '{'+Object.keys(o).sort().filter(function(k){return o[k]!==undefined}).map(function(k){return JSON.stringify(k)+':'+stable(o[k])}).join(',')+'}';
  }
  function eq(a,b){return stable(a)===stable(b)}
  function today(){return new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Bangkok'})}
  function el(tag,attrs){
    var e=document.createElement(tag),k;
    for(k in (attrs||{})){var v=attrs[k];if(k==='style')e.style.cssText=v;else if(k.indexOf('on')===0)e.addEventListener(k.slice(2),v);else if(v!=null&&v!==false)e.setAttribute(k,v===true?'':v)}
    for(var i=2;i<arguments.length;i++){var c=arguments[i];if(c==null||c===false)continue;e.append(c.nodeType?c:document.createTextNode(c))}
    return e;
  }

  /* ---------- server API (one place for every Supabase call; tests can swap it) ---------- */
  function makeApi(){
    var sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce',storageKey:'qc-online-auth'}});
    function chk(r){if(r.error){var e=new Error(r.error.message||'error');e.code=r.error.code||r.error.statusCode||'error';throw e}return r.data}
    var IH='id,project_id,owner_id,docno,insp_date,site,work,weather,meta,sign,summary,remarks,rev,created_at,updated_at,deleted_at,folder_id,extra';
    var II='id,inspection_id,project_id,ord,loc,chk,res,note,cat,ref,before,after,rres,rdate,rnote,rchk_at,status,assignee_id,due_date';
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
      subscribe:function(p,cb){
        var ch=sb.channel('qc-'+p)
          .on('postgres_changes',{event:'*',schema:'public',table:'inspections',filter:'project_id=eq.'+p},cb)
          .on('postgres_changes',{event:'*',schema:'public',table:'inspection_items',filter:'project_id=eq.'+p},cb)
          .subscribe();
        return function(){try{sb.removeChannel(ch)}catch(e){}};
      }
    };
  }
  var api=window.__qcOnlineApi||makeApi();

  /* ---------- identity, ids, photo paths ---------- */
  var UID=null,UIDH='',ME=null,CUR=null,ROLE=null,PROJECTS=[],PFX='';
  function hex(n){return Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(n)),function(b){return ('0'+b.toString(16)).slice(-2)}).join('')}
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
      extra:{v:d.v||2,rx:d.rx||null},deleted_at:d.deletedAt||null};
  }
  function itemsOf(id,d){
    var out={};
    (d.items||[]).forEach(function(it,i){
      out[sid(id,it.id)]={ord:i,loc:it.loc||'',chk:it.chk||'',res:it.res||'',note:it.note||'',cat:it.cat||'',ref:it.ref||'',
        before:(it.before||[]).map(idToPath).filter(Boolean),after:(it.after||[]).map(idToPath).filter(Boolean),
        rres:it.rres||'',rdate:it.rdate||'',rnote:it.rnote||''};
    });
    return out;
  }
  function rowsToDoc(h,items){
    var pre=h.id+'.',ex=h.extra||{};
    var its=(items||[]).slice().sort(function(a,b){return a.ord-b.ord}).map(function(r){
      return {id:r.id.indexOf(pre)===0?r.id.slice(pre.length):r.id,loc:r.loc,chk:r.chk,res:r.res,note:r.note,cat:r.cat,ref:r.ref,
        rres:r.rres,rdate:r.rdate,rnote:r.rnote,before:(r.before||[]).map(pathToId),after:(r.after||[]).map(pathToId)};
    });
    return {v:ex.v||2,kind:'inspection',meta:Object.assign({},h.meta||{}),sign:h.sign||{},summary:h.summary||'',remarks:h.remarks||'',
      items:its,createdAt:h.created_at||'',updatedAt:h.updated_at||'',rev:0,folder:h.folder_id||'',deletedAt:h.deleted_at||'',
      rx:ex.rx||null,_project:h.project_id,_owner:h.owner_id};
  }
  function baseOf(h,items){
    var d=rowsToDoc(h,items),b={h:headerOf(d),items:itemsOf(h.id,d)};
    (items||[]).forEach(function(r){if(b.items[r.id])b.items[r.id].rchk_at=r.rchk_at||null});
    return b;
  }
  function contentKey(d){return stable({meta:d.meta,sign:d.sign,summary:d.summary,remarks:d.remarks,items:d.items,folder:d.folder||'',deletedAt:d.deletedAt||''})}

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
  var DOCF=['meta','sign','summary','remarks','folder','deletedAt'];
  var ITF=['loc','chk','res','note','cat','ref','rres','rdate','rnote','before','after'];
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
  function notify(){try{window.dispatchEvent(new Event('qc-change'))}catch(e){}subs.forEach(function(s){setTimeout(function(){try{s.next(snapOf(s.q))}catch(e){}},0)})}
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
  var syncing=false,again=false,st=null,lastErr='',conflicts=0,stopRealtime=null;
  function schedule(ms){clearTimeout(st);st=setTimeout(runSync,ms==null?600:ms)}
  function isNet(e){return !navigator.onLine||(e&&(e.name==='TypeError'||/fetch|network|Failed to fetch|Load failed/i.test(e.message||'')))}
  function runSync(){
    if(!UID||!CUR)return;
    if(syncing){again=true;return}
    if(!navigator.onLine){status();return}
    syncing=true;status();
    uploadAll().then(pushAll).then(pull).then(function(){lastErr=''},function(e){
      lastErr=isNet(e)?'':(e&&(e.message||e.code))||'error';
      try{console.warn('[qc-online] sync',e)}catch(x){}
    }).then(function(){
      syncing=false;status();
      if(again){again=false;schedule(400)}
      else if(outbox.size||uploads.size)schedule(lastErr?30000:5000);
    });
  }
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
        if(B)Object.keys(B.items).forEach(function(k){if(!LI[k]&&SB.items[k])dels.push(k)});
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
        if(cur&&cur.key===contentKey(doc)&&cur.owner===h.owner_id)return;
        doc.rev=cur?(+cur.data.rev||0)+1:1;doc.submittedAt=h.updated_at;doc.sub={rev:doc.rev,at:h.updated_at};
        var x={owner:h.owner_id,data:doc,key:contentKey(doc),project:h.project_id};
        shared.set(h.id,x);ops.push(['shared',h.id,x]);changed=true;
      });
      shared.forEach(function(x,id){if(x.project===CUR&&!sseen[id]){shared.delete(id);ops.push(['shared',id,undefined]);changed=true}});
      return persist(ops).then(function(){if(changed){notify();announce()}});
    });
  }

  /* ---------- status (badge + floating pill) ---------- */
  var pill=null;
  function syncState(){
    var n=outbox.size+uploads.size;
    return {online:navigator.onLine,pending:n,syncing:syncing,error:lastErr,conflicts:conflicts,project:CUR,role:ROLE,
      state:!navigator.onLine?'offline':lastErr?'error':(n||syncing)?'pending':'ok'};
  }
  window.__qcSync=syncState;
  var ROLE_TH={pm:'PM',foreman:'โฟร์แมน',headman:'เฮดแมน',viewer:'ผู้ดู'};
  function status(){
    var s=syncState();
    try{window.dispatchEvent(new Event('qc-sync'))}catch(e){}
    if(!pill)return;
    var p=PROJECTS.filter(function(x){return x.id===CUR})[0];
    var txt=s.state==='offline'?'ออฟไลน์ · รอส่ง '+s.pending:s.state==='error'?'ซิงก์ไม่สำเร็จ':s.state==='pending'?'กำลังซิงก์…':'ซิงก์แล้ว';
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
      '.qo-gbtn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:46px;font-size:1rem}'
    ].join('');
    document.head.appendChild(s);
  }
  function overlay(){css();var o=el('div',{class:'qo-ov'});var c=el('div',{class:'qo-card'});o.appendChild(c);document.body.appendChild(o);return {o:o,c:c,close:function(){o.remove()}}}
  function toOffline(){lsSet('qc-mode','offline');location.href=location.pathname}
  function showLogin(){
    var v=overlay(),err=el('div',{class:'qo-err'});
    var b=el('button',{class:'btn primary qo-gbtn',type:'button'},'เข้าสู่ระบบด้วย Google');
    b.addEventListener('click',function(){
      b.disabled=true;err.textContent='';
      api.signIn(location.origin+location.pathname).then(function(r){if(r&&r.error)throw r.error}).catch(function(e){b.disabled=false;err.textContent='เข้าสู่ระบบไม่สำเร็จ: '+(e.message||e)});
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
  function menu(){
    var v=overlay(),s=syncState(),p=PROJECTS.filter(function(x){return x.id===CUR})[0]||{};
    v.c.append(el('h2',null,p.name||'โครงการ'),
      el('p',null,(ME&&ME.email||'')+' · '+(ROLE_TH[ROLE]||ROLE||'')+(ME&&ME.org_role==='admin'?' · แอดมิน':'')),
      el('p',null,s.state==='offline'?'ออฟไลน์อยู่ · รอส่งขึ้นระบบ '+s.pending+' รายการ (จะส่งเองเมื่อมีสัญญาณ)':s.state==='error'?'ซิงก์ไม่สำเร็จ: '+s.error:s.pending?'กำลังส่งขึ้นระบบ '+s.pending+' รายการ':'ข้อมูลตรงกับระบบแล้ว'),
      conflicts?el('p',null,'ผลตรวจซ้ำชนกับคนอื่น '+conflicts+' รายการ: ระบบใช้ผลที่ถึงก่อน ผลของคุณเก็บไว้ในประวัติ'):null);
    if(!canCreate())v.c.appendChild(el('p',null,'บทบาทนี้เปิดดูเอกสารของทีมได้ แต่สร้างเอกสารใหม่ไม่ได้'));
    v.c.append(el('button',{class:'btn',type:'button',onclick:function(){v.close();runSync()}},'ซิงก์ตอนนี้'));
    if(ROLE==='pm'||(ME&&ME.org_role==='admin'))v.c.append(el('button',{class:'btn',type:'button',onclick:function(){v.close();membersPanel()}},'จัดการสมาชิก'));
    if(PROJECTS.length>1||(ME&&ME.org_role==='admin'))v.c.append(el('button',{class:'btn',type:'button',onclick:function(){lsSet(PK,'');location.reload()}},'เปลี่ยนโครงการ'));
    v.c.append(
      el('button',{class:'btn',type:'button',onclick:function(){
        if((outbox.size||uploads.size)&&!confirmLeave())return;
        api.signOut().then(function(){location.reload()});
      }},'ออกจากระบบ'),
      el('button',{class:'btn',type:'button',onclick:function(){if((outbox.size||uploads.size)&&!confirmLeave())return;toOffline()}},'สลับไปโหมดออฟไลน์'),
      el('button',{class:'btn primary',type:'button',onclick:v.close},'ปิด'));
  }
  function confirmLeave(){return window.confirm('ยังมีข้อมูลที่ยังไม่ได้ส่งขึ้นระบบ '+(outbox.size+uploads.size)+' รายการ ถ้าออกตอนนี้ ข้อมูลจะรอส่งในเครื่องนี้จนกว่าจะกลับเข้ามาในบัญชีเดิม ดำเนินการต่อ?')}
  function showPill(){
    css();
    pill=el('button',{class:'qo-pill',type:'button','aria-label':'สถานะออนไลน์และเมนูบัญชี'},el('span',{class:'qo-d'}),el('span',{class:'qo-t'},''));
    pill.addEventListener('click',menu);document.body.appendChild(pill);status();
  }

  /* ---------- boot ---------- */
  function loadProjects(){
    return api.myProjects().then(function(ps){PROJECTS=ps||[];lsSet(PL+':'+UID,JSON.stringify(PROJECTS))},function(e){
      try{PROJECTS=JSON.parse(lsGet(PL+':'+UID)||'[]')}catch(x){PROJECTS=[]}
      if(!PROJECTS.length&&!isNet(e))throw e;
    });
  }
  function whenBody(){return document.body?Promise.resolve():new Promise(function(r){document.addEventListener('DOMContentLoaded',r)})}
  var ready=whenBody().then(function(){return api.session()}).then(function(s){
    if(!s)return showLogin();
    UID=s.user.id;UIDH=UID.replace(/-/g,'');PFX='data/users/'+UID+'/';
    ME={id:UID,email:s.user.email||'',name:(s.user.user_metadata&&(s.user.user_metadata.full_name||s.user.user_metadata.name))||''};
    return Promise.all([openDb().then(function(d){idb=d;return loadAll()}),loadProjects(),
      api.myProfile(UID).then(function(p){if(p)ME.org_role=p.org_role},function(){})]).then(function(){
      var isAdmin=ME.org_role==='admin',saved=lsGet(PK);
      var pick=PROJECTS.filter(function(p){return p.id===saved})[0]||(PROJECTS.length===1&&!isAdmin?PROJECTS[0]:null);
      return pick?pick.id:pickProject(isAdmin);
    }).then(function(id){
      CUR=id;lsSet(PK,id);
      ROLE=(PROJECTS.filter(function(p){return p.id===id})[0]||{}).role||null;
      try{bc=new BroadcastChannel('qc-online-'+UID);bc.onmessage=function(){loadAll().then(notify)}}catch(e){}
      try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){}
      showPill();
      window.addEventListener('online',function(){schedule(0)});window.addEventListener('offline',status);
      setInterval(function(){if(!document.hidden)schedule(0)},60000);
      document.addEventListener('visibilitychange',function(){if(!document.hidden)schedule(0)});
      try{stopRealtime=api.subscribe(CUR,function(){schedule(1500)})}catch(e){}
      schedule(0);
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
  window.__qcDocs=ownDocs;
  window.__qcGetDoc=function(id){var d=cache.get(PFX+id);if(d)return clone(d);var s=shared.get(id);return s?clone(s.data):null};
  window.__qcBlob=function(id){return getBlob(id)};
  var NOT_ONLINE='โหมดออนไลน์ยังไม่รองรับการรับไฟล์/กู้คืนจากไฟล์ สลับไปโหมดออฟไลน์เพื่อใช้ฟีเจอร์นี้';
  window.__qcCommit=function(){return Promise.reject(new Error(NOT_ONLINE))};
  window.__qc={importData:function(){return Promise.reject(new Error(NOT_ONLINE))}};
  window.__qcOnline={sync:function(){runSync()},state:syncState,project:function(){return CUR},role:function(){return ROLE}};

  var caps={db:db,user:user,assets:assets,downloads:downloads};
  window.claude={use:function(n){return ready.then(function(){return caps[n]||null},function(){return null})}};
})();
