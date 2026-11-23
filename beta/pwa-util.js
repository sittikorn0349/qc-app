/* pwa-util.js — helpers shared by every pwa-*.js module (load first). Window global: QCU. */
(function(){
  'use strict';
  function $(s,r){return (r||document).querySelector(s)}
  function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
  function ls(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function lsSet(k,v){try{localStorage.setItem(k,v);return true}catch(e){return false}}
  function lsDel(k){try{localStorage.removeItem(k)}catch(e){}}
  function jget(k,def){try{return JSON.parse(ls(k)||'')||def}catch(e){return def}}
  function clone(o){return o==null?o:JSON.parse(JSON.stringify(o))}
  function uid(p){return (p||'')+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
  function S(x){return typeof x==='string'?x:(x==null?'':String(x))}
  /* el(tag, attrs, ...children): class, style (css text), text, on<event> (listener), true -> empty attribute;
     null/false attrs and children are skipped; children may be nodes, strings or arrays of them */
  function el(tag,attrs){
    var e=document.createElement(tag),a=attrs||{},k,v,i;
    for(k in a){
      v=a[k];if(v==null||v===false)continue;
      if(k==='class')e.className=v;else if(k==='style')e.style.cssText=v;else if(k==='text')e.textContent=v;
      else if(k.slice(0,2)==='on'&&typeof v==='function')e.addEventListener(k.slice(2),v);
      else e.setAttribute(k,v===true?'':v);
    }
    function add(c){if(c==null||c===false)return;if(Array.isArray(c)){c.forEach(add);return}e.appendChild(c.nodeType?c:document.createTextNode(String(c)))}
    for(i=2;i<arguments.length;i++)add(arguments[i]);
    return e;
  }
  /* ---------- SHA-256 (WebCrypto when present, pure JS otherwise: results are identical) ---------- */
  var K=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  function ror(x,n){return (x>>>n)|(x<<(32-n))}
  function sha256js(data){
    var h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
    var l=data.length,padLen=(l+9+63)&~63,buf=new Uint8Array(padLen);buf.set(data);buf[l]=0x80;
    var dv=new DataView(buf.buffer);dv.setUint32(padLen-8,Math.floor(l*8/4294967296));dv.setUint32(padLen-4,(l*8)>>>0);
    var w=new Uint32Array(64),i,off;
    for(off=0;off<padLen;off+=64){
      for(i=0;i<16;i++)w[i]=dv.getUint32(off+i*4);
      for(i=16;i<64;i++){var s0=ror(w[i-15],7)^ror(w[i-15],18)^(w[i-15]>>>3),s1=ror(w[i-2],17)^ror(w[i-2],19)^(w[i-2]>>>10);w[i]=(w[i-16]+s0+w[i-7]+s1)|0}
      var a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
      for(i=0;i<64;i++){
        var S1=ror(e,6)^ror(e,11)^ror(e,25),ch=(e&f)^(~e&g),t1=(hh+S1+ch+K[i]+w[i])|0,S0=ror(a,2)^ror(a,13)^ror(a,22),mj=(a&b)^(a&c)^(b&c),t2=(S0+mj)|0;
        hh=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
      }
      h[0]=(h[0]+a)|0;h[1]=(h[1]+b)|0;h[2]=(h[2]+c)|0;h[3]=(h[3]+d)|0;h[4]=(h[4]+e)|0;h[5]=(h[5]+f)|0;h[6]=(h[6]+g)|0;h[7]=(h[7]+hh)|0;
    }
    return Array.prototype.map.call(h,function(x){return ('00000000'+(x>>>0).toString(16)).slice(-8)}).join('');
  }
  function hex(ab){return Array.prototype.map.call(new Uint8Array(ab),function(b){return ('0'+b.toString(16)).slice(-2)}).join('')}
  function sha256(u8){
    if(window.__qcForceJsSha||!(window.crypto&&crypto.subtle&&crypto.subtle.digest))return Promise.resolve(sha256js(u8));
    return crypto.subtle.digest('SHA-256',u8).then(hex,function(){return sha256js(u8)});
  }
  function sha256Blob(b){return b.arrayBuffer().then(function(ab){return sha256(new Uint8Array(ab))})}
  function sha256Text(t){return sha256(new TextEncoder().encode(t))}

  /* ---------- one way to confirm a risky action, used everywhere (no native browser dialogs) ----------
     arm(btn,{armed,onConfirm,timeoutMs,need}): first press turns the button red (.armed) and changes its text,
       a second press within the time runs onConfirm; need() false -> runs at once (nothing risky to confirm).
     ask({title,text,ok,cancel,danger}): small in-app sheet, resolves true/false; the OK button is red when danger. */
  function armReset(btn){clearTimeout(btn._armT);btn.classList.remove('armed');if(btn._armLabel!=null){setText(btn,btn._armLabel);btn._armLabel=null}}
  function setText(btn,t){var n=btn.lastChild;if(n&&n.nodeType===3&&btn.childNodes.length>1)n.textContent=t;else btn.textContent=t}   /* keep a leading icon */
  function arm(btn,o){
    o=o||{};
    btn.addEventListener('click',function(e){
      if(o.need&&!o.need()){armReset(btn);o.onConfirm(e);return}
      if(btn.classList.contains('armed')){armReset(btn);o.onConfirm(e);return}
      btn._armLabel=btn.lastChild&&btn.lastChild.nodeType===3?btn.lastChild.textContent:btn.textContent;
      btn.classList.add('armed');setText(btn,o.armed||'กดอีกครั้งเพื่อยืนยัน');
      if(o.onArm)o.onArm();
      btn._armT=setTimeout(function(){armReset(btn);if(o.onDisarm)o.onDisarm()},o.timeoutMs||3500);
    });
    return {reset:function(){armReset(btn)},armed:function(){return btn.classList.contains('armed')}};
  }
  var askCss=false;
  function ask(o){
    o=o||{};
    if(!askCss){askCss=true;document.head.appendChild(el('style',null,
      '.qc-ask{position:fixed;inset:0;z-index:90;background:rgba(15,20,25,.5);display:flex;align-items:flex-end;justify-content:center}'+
      '.qc-ask-b{background:var(--card,#fff);color:var(--ink,#111);width:100%;max-width:520px;border-radius:14px 14px 0 0;padding:18px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -4px 24px rgba(0,0,0,.2)}'+
      '@media (min-width:700px){.qc-ask{align-items:center}.qc-ask-b{border-radius:12px}}'+
      '.qc-ask h2{margin:0 0 6px;font-size:1.05rem}.qc-ask p{margin:0 0 14px;line-height:1.5}'+
      '.qc-ask-a{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.qc-ask-a button{min-height:48px;min-width:96px}'+
      '.qc-ask .btn.danger{background:var(--bad,#b42318);border-color:var(--bad,#b42318);color:#fff}'));}
    return new Promise(function(resolve){
      var prev=document.activeElement;
      var okB=el('button',{type:'button',class:'btn '+(o.danger===false?'primary':'danger'),id:'qc-ask-ok'},o.ok||'ยืนยัน');
      var noB=el('button',{type:'button',class:'btn',id:'qc-ask-no'},o.cancel||'ยกเลิก');
      var box=el('div',{class:'qc-ask-b',role:'alertdialog','aria-modal':'true','aria-labelledby':'qc-ask-t','aria-describedby':'qc-ask-p'},
        el('h2',{id:'qc-ask-t'},o.title||'ยืนยัน'),o.text?el('p',{id:'qc-ask-p'},o.text):null,el('div',{class:'qc-ask-a'},noB,okB));
      var back=el('div',{class:'qc-ask qc-sheet-confirm'},box);
      function done(v){document.removeEventListener('keydown',key,true);back.remove();try{prev&&prev.focus&&prev.focus()}catch(e){}resolve(v)}
      function key(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done(false)}}
      okB.addEventListener('click',function(){done(true)});noB.addEventListener('click',function(){done(false)});
      back.addEventListener('click',function(e){if(e.target===back)done(false)});
      document.addEventListener('keydown',key,true);
      document.body.appendChild(back);noB.focus();
    });
  }

  /* dates and ids used by several modules (P2-5: one copy only) */
  function pad2(n){return String(n).padStart(2,'0')}
  function today(){var d=new Date();return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())}   /* this device's local date, YYYY-MM-DD */
  function thDate(iso){if(!iso)return '';var p=String(iso).split('-');if(p.length!==3)return iso;return (+p[2])+'/'+(+p[1])+'/'+(+p[0]+543)}
  function randHex(n){return Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(n)),function(b){return ('0'+b.toString(16)).slice(-2)}).join('')}

  /* names used in the confirm-pattern guideline: QC.armConfirm(btn,onConfirm,{armedLabel,timeoutMs}) and
     QC.confirmSheet(message,{okLabel,cancelLabel,title}) -> Promise<boolean>; same code as arm()/ask() above */
  window.QC=window.QC||{};
  QC.armConfirm=function(btn,onConfirm,o){o=o||{};return arm(btn,{armed:o.armedLabel,timeoutMs:o.timeoutMs,need:o.need,onConfirm:onConfirm})};
  /* undo right after a delete: one toast at a time; undo runs only once; the deleted thing is never gone
     because of the toast (the bin keeps it), the toast is only the quick way back */
  var toastEl=null,toastT=null,toastCss=false;
  QC.showUndoToast=function(message,onUndo,timeoutMs){
    if(!toastCss){toastCss=true;document.head.appendChild(el('style',null,
      '.qc-toast{position:fixed;left:50%;bottom:calc(88px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:95;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 24px);padding:8px 8px 8px 16px;border-radius:10px;background:#1f2328;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.25);font-size:.95rem}'+
      '.qc-toast button{min-height:44px;min-width:88px;border:0;border-radius:8px;background:transparent;color:#8cc8ff;font:inherit;font-weight:700;cursor:pointer}.qc-toast button:focus-visible{outline:2px solid #8cc8ff}'));}
    if(toastEl){toastEl.remove();clearTimeout(toastT)}
    var used=false,b=el('button',{type:'button',class:'qc-toast-undo'},'ย้อนกลับ');
    var t=el('div',{class:'qc-toast',role:'status','aria-live':'polite'},el('span',null,message),b);
    function gone(){if(toastEl===t)toastEl=null;t.remove()}
    b.addEventListener('click',function(){if(used)return;used=true;clearTimeout(toastT);gone();onUndo()});
    document.body.appendChild(t);toastEl=t;
    toastT=setTimeout(gone,timeoutMs||6000);
    return {close:gone};
  };
  QC.confirmSheet=function(message,o){o=o||{};return ask({title:o.title||'ยืนยัน',text:message,ok:o.okLabel,cancel:o.cancelLabel,danger:o.danger})};

  window.QCU={today:today,thDate:thDate,randHex:randHex,pad2:pad2,$:$,$$:$$,ls:ls,lsSet:lsSet,lsDel:lsDel,jget:jget,clone:clone,uid:uid,S:S,el:el,sha256js:sha256js,sha256:sha256,sha256Blob:sha256Blob,sha256Text:sha256Text,hex:hex,arm:arm,ask:ask};
})();
