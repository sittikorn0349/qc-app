/* Offline storage shell: gives the form the same window.claude.use('db'|'user'|'assets'|'downloads') API,
   backed by IndexedDB on this device. Swap this file for an online adapter later; the form does not change. */
(function(){
  'use strict';
  window.__PWA=true;
  var DBN='qc-offline',UID='local',MAXB=20*1024*1024;
  var idb=null,docs=new Map(),subs=[],bc=null;
  function open(){
    return new Promise(function(res,rej){
      var r=indexedDB.open(DBN,1);
      r.onupgradeneeded=function(){var d=r.result;if(!d.objectStoreNames.contains('docs'))d.createObjectStore('docs',{keyPath:'path'});if(!d.objectStoreNames.contains('blobs'))d.createObjectStore('blobs')};
      r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)};
    });
  }
  function tx(store,mode,fn){
    return new Promise(function(res,rej){
      var t=idb.transaction(store,mode),out=fn(t.objectStore(store));
      t.oncomplete=function(){res(out&&out.result)};t.onerror=t.onabort=function(){rej(t.error||{code:'error'})};
    });
  }
  function loadAll(){
    return tx('docs','readonly',function(s){return s.getAll()}).then(function(rows){
      docs.clear();rows.forEach(function(r){docs.set(r.path,r.data)});
    });
  }
  function clone(o){return JSON.parse(JSON.stringify(o))}
  function colOf(p){return p.split('/').slice(0,-1).join('/')}
  function snapOf(q){
    var list=[];
    docs.forEach(function(d,p){if(colOf(p)===q.c)list.push({id:p.split('/').pop(),data:d})});
    if(q.ord){
      list=list.filter(function(x){return x.data[q.ord]!=null});
      list.sort(function(a,b){var x=a.data[q.ord],y=b.data[q.ord];return x===y?0:(x<y?1:-1)});
    }
    if(q.lim)list=list.slice(0,q.lim);
    var ds=list.map(function(x){return {id:x.id,exists:true,data:function(){return clone(x.data)},metadata:{}}});
    return {docs:ds,size:ds.length,empty:!ds.length,metadata:{fromCache:false,hasPendingWrites:false},docChanges:function(){return[]}};
  }
  function notify(){try{window.dispatchEvent(new Event('qc-change'))}catch(e){}subs.forEach(function(s){setTimeout(function(){try{s.next(snapOf(s.q))}catch(e){}},0)})}
  function announce(){try{bc&&bc.postMessage('chg')}catch(e){}}
  function put(path,data){
    return tx('docs','readwrite',function(s){return s.put({path:path,data:data})}).then(function(){docs.set(path,data);notify();announce()});
  }
  function mkQuery(c,ord,lim){
    return {
      orderBy:function(f){return mkQuery(c,f,lim)},limit:function(n){return mkQuery(c,ord,n)},
      onSnapshot:function(next,err){var s={q:{c:c,ord:ord,lim:lim},next:next};subs.push(s);setTimeout(function(){next(snapOf(s.q))},0);return function(){subs=subs.filter(function(x){return x!==s})}},
      get:function(){return Promise.resolve(snapOf({c:c,ord:ord,lim:lim}))},
      doc:function(id){
        var path=c+'/'+id;
        return {
          set:function(data){return put(path,clone(data))},
          update:function(patch){
            if(!docs.has(path))return Promise.reject({code:'not_found'});
            return put(path,Object.assign({},docs.get(path),clone(patch)));
          },
          delete:function(){
            return tx('docs','readwrite',function(s){return s.delete(path)}).then(function(){docs.delete(path);notify();announce()});
          },
          get:function(){var d=docs.get(path);return Promise.resolve({exists:!!d,data:function(){return d?clone(d):undefined}})}
        };
      }
    };
  }
  var db={collection:function(p){return mkQuery(p)},doc:function(p){return mkQuery(colOf(p)).doc(p.split('/').pop())}};

  var assets={
    upload:function(blob){
      if(blob.size>MAXB)return Promise.reject({code:'too_large'});
      var id='a'+Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(12)),function(b){return ('0'+b.toString(16)).slice(-2)}).join('');
      return tx('blobs','readwrite',function(s){return s.put(blob,id)}).then(function(){
        return {id:id,url:'./_blob/'+id,sizeBytes:blob.size,contentType:blob.type||'image/jpeg'};
      },function(){return Promise.reject({code:'quota_or_state'})});
    },
    delete:function(id){return tx('blobs','readwrite',function(s){return s.delete(id)}).then(function(){return {deleted:true}})}
  };
  var user={id:function(){return Promise.resolve(UID)},me:function(){return Promise.resolve({id:UID})},
    isOwner:function(){return true},canEdit:function(){return true},can:function(){return Promise.resolve(true)},profiles:function(){return Promise.resolve({})}};
  var downloads={save:function(req){
    var blob=req.data instanceof Blob?req.data:new Blob([req.data]),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=req.filename;document.body.appendChild(a);a.click();a.remove();
    if(/^qc-backup-/.test(req.filename)){try{localStorage.setItem('qc-last-backup',String(Date.now()))}catch(e){}window.dispatchEvent(new Event('qc-change'))}
    setTimeout(function(){URL.revokeObjectURL(url)},60000);
    return Promise.resolve({status:'saved'});
  }};

  var ready=open().then(function(d){idb=d;return loadAll()}).then(function(){
    try{bc=new BroadcastChannel('qc-offline');bc.onmessage=function(){loadAll().then(notify)}}catch(e){}
    try{if(navigator.storage&&navigator.storage.persist)navigator.storage.persist()}catch(e){}
  });

  /* ---- photos: read straight from IndexedDB, so they show even without a service worker (e.g. file://) ---- */
  var PLACE='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  var urlCache={},BLOBRE=/(?:^|\/)_blob\/([^\/?#]+)(?:[?#].*)?$/;
  function getBlob(id){return ready.then(function(){return tx('blobs','readonly',function(s){return s.get(id)})})}
  function sniff(b){
    return b.slice(0,12).arrayBuffer().then(function(ab){
      var u=new Uint8Array(ab),t='';
      if(u[0]===0xFF&&u[1]===0xD8)t='image/jpeg';
      else if(u[0]===0x89&&u[1]===0x50&&u[2]===0x4E&&u[3]===0x47)t='image/png';
      else if(u[0]===0x47&&u[1]===0x49&&u[2]===0x46)t='image/gif';
      else if(u[0]===0x52&&u[1]===0x49&&u[2]===0x46&&u[3]===0x46&&u[8]===0x57&&u[9]===0x45)t='image/webp';
      return t;
    });
  }
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
      if(!b){put('./_blob/missing');return}
      return (b.type&&/^image\//.test(b.type)?Promise.resolve(b):sniff(b).then(function(t){return new Blob([b],{type:t||'image/jpeg'})})).then(function(fixed){
        urlCache[id]=URL.createObjectURL(fixed);put(urlCache[id]);
      });
    },function(){put('./_blob/missing')});
  }
  function scan(n){
    if(n.nodeType!==1)return;
    if(n.tagName==='IMG')resolveImg(n);
    else if(n.querySelectorAll)n.querySelectorAll('img').forEach(resolveImg);
  }
  new MutationObserver(function(ms){ms.forEach(function(m){
    if(m.type==='attributes')resolveImg(m.target);
    else m.addedNodes.forEach(scan);
  })}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
  window.__qcStats=function(){var n=0;docs.forEach(function(d){if(d&&d.kind!=='folder'&&!d.deletedAt)n++});return {docs:n}};
  /* ---- hooks for the send/receive module (pwa-send.js) ---- */
  var PFX='data/users/'+UID+'/';
  window.__qcDocs=function(){var out=[];docs.forEach(function(d,p){if(d&&d.kind!=='folder'&&!d.deletedAt&&p.indexOf(PFX)===0)out.push({id:p.slice(PFX.length),data:clone(d)})});return out};
  window.__qcGetDoc=function(id){var d=docs.get(PFX+id);return d?clone(d):null};
  window.__qcBlob=function(id){return getBlob(id)};
  /* one IndexedDB transaction over docs + blobs: either every row lands or none does */
  window.__qcCommit=function(plan){
    return ready.then(function(){return new Promise(function(res,rej){
      var t=idb.transaction(['docs','blobs'],'readwrite'),ds=t.objectStore('docs'),bs=t.objectStore('blobs');
      t.oncomplete=function(){res()};t.onerror=t.onabort=function(){rej(t.error||new Error('commit failed'))};
      try{
        (plan.blobs||[]).forEach(function(b){bs.put(b.blob,b.id)});
        (plan.docs||[]).forEach(function(d){ds.put({path:PFX+d.id,data:d.data})});
      }catch(e){try{t.abort()}catch(x){}rej(e)}
    })}).then(function(){(plan.docs||[]).forEach(function(d){docs.set(PFX+d.id,clone(d.data))});notify();announce()});
  };
  var caps={db:db,user:user,assets:assets,downloads:downloads};
  window.claude={use:function(n){return ready.then(function(){return caps[n]||null},function(){return null})}};

  /* restore from a backup ZIP made by the form (QC.buildBackup) */
  window.__qc={importData:function(data,readPhoto,onProgress){
    var prj={},ppl={},items={},n={inspections:0,skipped:0,photos:0},chain=ready;
    (data.projects||[]).forEach(function(p){prj[p.id]=p});(data.parties||[]).forEach(function(p){ppl[p.id]=p});
    (data.items||[]).forEach(function(i){(items[i.inspectionId]=items[i.inspectionId]||[]).push(i)});
    var phs=data.photos||[];
    phs.forEach(function(ph,i){
      chain=chain.then(function(){
        return tx('blobs','readonly',function(s){return s.count(ph.id)}).then(function(c){
          if(c)return;
          return readPhoto(ph).then(function(b){
            if(!b)return;
            return sniff(b).then(function(t){
              if(!t){n.badPhotos=(n.badPhotos||0)+1;return}
              var fixed=(b.type===t)?b:new Blob([b],{type:t});
              return tx('blobs','readwrite',function(s){return s.put(fixed,ph.id)}).then(function(){n.photos++});
            });
          });
        });
      }).then(function(){if(onProgress)onProgress(i+1,phs.length)});
    });
    (data.folders||[]).forEach(function(f){
      chain=chain.then(function(){
        var p='data/users/'+UID+'/'+f.id;if(docs.has(p))return;
        return put(p,{kind:'folder',name:f.name,createdAt:f.createdAt||'',updatedAt:f.updatedAt||f.createdAt||'',deletedAt:f.deletedAt||''});
      });
    });
    (data.inspections||[]).forEach(function(r){
      chain=chain.then(function(){
        var p='data/users/'+UID+'/'+r.id,ex=docs.get(p);
        if(ex&&(ex.updatedAt||'')>(r.updatedAt||'')){n.skipped++;return}
        var pr=prj[r.projectId]||{},ip=ppl[r.inspectorId]||{},cn=ppl[r.contractorId]||{};
        r.meta={project:pr.name||'',docno:r.docno||'',site:r.site||pr.site||'',date:r.date||'',work:r.work||'',inspector:ip.name||'',contractor:cn.name||'',weather:r.weather||''};
        var its=(items[r.id]||[]).sort(function(a,b){return a.order-b.order});
        var d=QC.implode(r,its);d.kind='inspection';
        n.inspections++;
        return put(p,d);
      });
    });
    return chain.then(function(){return n});
  }};
})();
