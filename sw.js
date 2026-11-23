var V='qc-v13',FONTS='qc-fonts-v1';
var SHELL=['./','./index.html','./manifest.webmanifest','./pwa-shell.js','./pwa-extras.js','./pwa-send.js','./pwa-home.js','./pwa-forms.js','./share-test.html','./libs/jspdf.umd.min.js','./libs/html2canvas.min.js','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(V).then(function(c){return c.addAll(SHELL)}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==V&&k!==FONTS}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
function idb(){return new Promise(function(res,rej){var r=indexedDB.open('qc-offline',1);
  r.onupgradeneeded=function(){var d=r.result;if(!d.objectStoreNames.contains('docs'))d.createObjectStore('docs',{keyPath:'path'});if(!d.objectStoreNames.contains('blobs'))d.createObjectStore('blobs')};
  r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)}})}
function blobOf(id){return idb().then(function(d){return new Promise(function(res,rej){var q=d.transaction('blobs','readonly').objectStore('blobs').get(id);q.onsuccess=function(){res(q.result)};q.onerror=function(){rej(q.error)}})})}
self.addEventListener('fetch',function(e){
  var req=e.request;if(req.method!=='GET')return;
  var u=new URL(req.url),m=u.pathname.match(/\/_blob\/([^\/]+)$/);
  if(m&&u.origin===location.origin){
    e.respondWith(blobOf(decodeURIComponent(m[1])).then(function(b){return b?new Response(b,{headers:{'Content-Type':b.type||'image/jpeg','Cache-Control':'no-store'}}):new Response('',{status:404})},function(){return new Response('',{status:500})}));
    return;
  }
  if(u.origin===location.origin){
    var stat=/\/(libs|icons)\//.test(u.pathname);
    e.respondWith(caches.match(req,{ignoreSearch:true}).then(function(hit){
      var net=fetch(req).then(function(r){if(r&&r.ok){var c=r.clone();caches.open(V).then(function(ca){ca.put(req,c)})}return r});
      if(hit&&stat){net.catch(function(){});return hit}
      if(!hit)return net.catch(function(){return req.mode==='navigate'?caches.match('./index.html'):Response.error()});
      /* app files: take the fresh copy when online (so updates show at once); fall back to the cached one when offline or slow (3 s) */
      return Promise.race([net.catch(function(){return hit}),new Promise(function(r){setTimeout(function(){r(hit)},3000)})]);
    }));
    return;
  }
  if(/fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)){
    e.respondWith(caches.open(FONTS).then(function(c){return c.match(req).then(function(hit){
      var net=fetch(req).then(function(r){c.put(req,r.clone());return r}).catch(function(){return hit||Response.error()});
      return hit||net;
    })}));
  }
});
