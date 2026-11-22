/* Home screen for the offline app: a form picker, the "latest document" card and 9 equal square tiles,
   plus a slim bar on the form page (back, send, ⋯ menu). It drives the form only through its existing
   buttons, so documents, hashes and the send/receive format are untouched. */
(function(){
  'use strict';
  var FORMS=[{id:'qc-inspection',name:'แบบฟอร์มตรวจงานก่อสร้าง',sub:'งาน QC ตามมาตรฐาน'},{id:'safety',name:'แบบตรวจความปลอดภัย',sub:'นั่งร้าน · ราวกันตก · ประชุมก่อนเริ่มงาน'}];
  var FORM_K='qc-form',CODE_K='qc-code',NAME_K='qc-sender-name';
  function $(s,r){return (r||document).querySelector(s)}
  function ls(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  function el(tag,attrs){
    var e=document.createElement(tag),a=attrs||{},k,i,c;
    for(k in a){if(a[k]==null||a[k]===false)continue;if(k==='class')e.className=a[k];else if(k.slice(0,2)==='on')e[k]=a[k];else e.setAttribute(k,a[k]===true?'':a[k])}
    for(i=2;i<arguments.length;i++){c=arguments[i];if(c==null||c===false)continue;e.appendChild(typeof c==='string'?document.createTextNode(c):c)}
    return e;
  }
  var P={
    plus:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6M9 14h6"/>',
    folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    send:'<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
    recheck:'<path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18 2v4h-4"/><path d="M6 22v-4h4"/><path d="m9 12 2 2 4-4"/>',
    copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    inbox:'<path d="M12 3v11"/><path d="m8 10 4 4 4-4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    db:'<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/><path d="M4 11.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    trash:'<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
    gear:'<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    back:'<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
    more:'<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
    chev:'<path d="m6 9 6 6 6-6"/>'
  };
  function icon(n){var s=document.createElement('span');s.className='qh-ic';s.setAttribute('aria-hidden','true');
    s.innerHTML='<svg viewBox="0 0 24 24" focusable="false">'+P[n]+'</svg>';return s}

  var CSS=[
    '#qc-home{position:fixed;inset:0;z-index:30;background:var(--bg);color:var(--fg);overflow-y:auto;-webkit-overflow-scrolling:touch;',
    'padding-top:max(18px,env(safe-area-inset-top,0px));padding-bottom:max(24px,env(safe-area-inset-bottom,0px));',
    'padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}',
    '.qh-in{max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:14px}',
    '.qh-in h1{font-size:1.5rem;margin:0}.qh-sub{color:var(--muted);font-size:.85rem;margin-top:2px}',
    '.qh-lbl{font-size:.78rem;color:var(--muted);letter-spacing:.02em;margin-bottom:4px;display:block}',
    '.qh-fp{position:relative}',
    '.qh-fbtn{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:0 12px;border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:12px;font:inherit;text-align:left;cursor:pointer}',
    '.qh-fbtn .qh-t{flex:1;min-width:0;font-weight:600}',
    '.qh-ic svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;display:block}',
    '.qh-flist{position:absolute;left:0;right:0;top:100%;margin:4px 0 0;padding:6px;list-style:none;background:var(--surface);border:1px solid var(--line);border-radius:12px;z-index:5;box-shadow:0 8px 24px rgba(0,0,0,.18)}',
    '.qh-flist li{padding:10px 12px;border-radius:8px}',
    '.qh-flist li[role=option]{cursor:pointer;display:flex;gap:8px;align-items:center;font-weight:600;background:var(--bg)}',
    '.qh-flist li.qh-note{color:var(--muted);font-size:.8rem}',
    '.qh-last{border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}',
    '.qh-lt{font-weight:600;font-size:1.02rem;overflow-wrap:anywhere}.qh-ls{color:var(--muted);font-size:.85rem;overflow-wrap:anywhere}',
    '.qh-lrow{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap}',
    '.qh-msg{min-height:1.3em;font-size:.88rem;color:var(--warn);overflow-wrap:anywhere}.qh-msg:empty{display:none}',
    '.qh-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}',
    '.qh-tile{aspect-ratio:1/1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:8px 6px;text-align:center;',
    'border:1px solid var(--line);background:var(--surface);color:var(--fg);border-radius:14px;font:inherit;cursor:pointer;min-width:0;-webkit-tap-highlight-color:transparent}',
    '.qh-tile .qh-ic svg{width:30px;height:30px}',
    '.qh-tile b{font-size:.9rem;font-weight:600;line-height:1.25;overflow-wrap:anywhere}',
    '.qh-tile small{font-size:.72rem;color:var(--muted);line-height:1.2;overflow-wrap:anywhere}',
    '.qh-tile.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}.qh-tile.primary small{color:inherit;opacity:.85}',
    '.qh-tile[aria-disabled=true]{opacity:.45}.qh-tile:active{transform:scale(.97)}',
    '.qh-in h1:focus{outline:none}',
    'body.qc-home-on{overflow:hidden}',
    '#qc-home .qh-slot{display:flex;flex-direction:column;gap:12px}#qc-home .qh-slot:empty{display:none}',
    /* form page bar */
    '#qc-formbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:8px;background:var(--bg);padding:8px 0;border-bottom:1px solid var(--line)}',
    '#qc-formbar .qf-t{flex:1;min-width:0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#qc-formbar #qf-send{margin-left:auto}@media (max-width:560px){#qc-formbar .qf-t{display:none}}',
    '#qc-formbar .btn{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}',
    '#qc-formbar .qh-ic svg{width:18px;height:18px}',
    '.qf-menu{position:absolute;right:0;top:100%;margin-top:4px;min-width:220px;padding:6px;background:var(--surface);border:1px solid var(--line);border-radius:12px;z-index:25;box-shadow:0 8px 24px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:4px}',
    '.qf-menu button{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:var(--fg);font:inherit;text-align:left;cursor:pointer}',
    '.qf-menu button:hover{background:var(--bg)}.qf-menu button.danger{color:var(--bad)}.qf-menu button.armed{background:var(--bad-bg);font-weight:600}',
    'body.qc-hub .rb-top .rb-actions{display:none!important}',
    /* sheet */
    '#qh-sheet{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center;padding:0}',
    '#qh-sheet .qh-card{width:100%;max-width:520px;max-height:90vh;overflow:auto;background:var(--surface);color:var(--fg);border:1px solid var(--line);border-radius:16px 16px 0 0;padding:16px max(16px,env(safe-area-inset-left,0px)) max(18px,env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:12px}',
    '@media (min-width:700px){#qh-sheet{align-items:center}#qh-sheet .qh-card{border-radius:16px}}',
    '#qh-sheet h2{margin:0;font-size:1.15rem}',
    '.qh-big{display:flex;align-items:center;gap:12px;min-height:56px;padding:0 14px;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:12px;font:inherit;text-align:left;cursor:pointer}',
    '.qh-big small{display:block;color:var(--muted);font-size:.78rem}',
    '.qh-row{display:flex;flex-direction:column;gap:4px}.qh-row input{border:1px solid var(--line);background:var(--bg);border-radius:8px;min-height:44px;padding:0 10px}',
    '.qh-kv{font-size:.85rem;color:var(--muted);overflow-wrap:anywhere}'
  ].join('');

  var booted=false,view='home',pending=false,pendT,home,wrap,formbar,msgEl,lastEls={},tiles={},sheet,menuEl,armT;

  function click(sel){var b=$(sel);if(b)b.click();return !!b}
  function curId(){return window.__qcForm&&window.__qcForm.cur&&window.__qcForm.cur()}
  function curDoc(){var id=curId(),d=id&&window.__qcGetDoc&&window.__qcGetDoc(id);return (d&&!d.deletedAt)?d:null}
  function libCount(){var b=$('#btn-list'),m=b&&/\((\d+)\)/.exec(b.textContent||'');return m?+m[1]:0}
  function expectNav(){pending=true;clearTimeout(pendT);pendT=setTimeout(function(){pending=false},90000)}
  function setMsg(t){if(msgEl)msgEl.textContent=t||''}

  /* ---------- navigation ---------- */
  function applyHome(){
    view='home';home.hidden=false;document.body.classList.add('qc-home-on');
    if(wrap){wrap.inert=true;wrap.setAttribute('aria-hidden','true')}
    closeMenu();refresh();if(booted){var h=$('h1',home);if(h)h.focus({preventScroll:true})}home.scrollTop=0;
  }
  function applyForm(){
    view='form';home.hidden=true;document.body.classList.remove('qc-home-on');
    if(wrap){wrap.inert=false;wrap.removeAttribute('aria-hidden')}
    window.scrollTo(0,0);
  }
  function goForm(){
    if(view==='form')return;
    try{history.pushState({qc:'form'},'')}catch(e){}
    applyForm();
  }
  function goHome(){
    if(view==='home')return;
    var st=null;try{st=history.state}catch(e){}
    if(st&&st.qc==='form'){try{history.back();return}catch(e){}}
    applyHome();
  }
  window.addEventListener('popstate',function(e){
    var s=e.state;if(s&&s.qc==='form')applyForm();else applyHome();
  });

  /* ---------- home content ---------- */
  function refresh(){
    if(!home)return;
    var d=curDoc(),has=!!d,t=($('#curtitle')||{}).textContent||'';
    t=t.replace(/\s*\(ยังไม่ได้บันทึก\)\s*$/,'');
    if(has){
      var m=d.meta||{};
      lastEls.t.textContent=t||'ฉบับยังไม่ตั้งชื่อ';
      var bits=[m.project,m.work,m.date].filter(Boolean).join(' · ');
      var bd=$('#badge'),sb=$('#qc-sentbadge'),st=[];
      if(sb&&!sb.hidden&&sb.textContent)st.push(sb.textContent);
      lastEls.s.textContent=[bits,st.join(' · ')].filter(Boolean).join(' — ');
      lastEls.open.hidden=false;
    }else{
      lastEls.t.textContent='ยังไม่มีฉบับล่าสุด';
      lastEls.s.textContent='กด “ฉบับใหม่” เพื่อเริ่ม หรือเปิดจาก “คลังเอกสาร”';
      lastEls.open.hidden=true;
    }
    Object.keys(tiles).forEach(function(k){
      var tl=tiles[k];if(tl.need)tl.el.setAttribute('aria-disabled',has?'false':'true');
    });
    var n=libCount();tiles.lib.sub.textContent=n?n+' ฉบับ':'ยังไม่มี';
  }

  function tile(id,label,sub,ic,opts){
    opts=opts||{};
    var subEl=el('small',null,sub||''),b=el('button',{type:'button',class:'qh-tile'+(opts.primary?' primary':''),id:'qh-t-'+id,'aria-disabled':opts.need?'true':null},icon(ic),el('b',null,label),subEl);
    b.addEventListener('click',function(){
      if(opts.need&&!curDoc()){setMsg('ต้องมีฉบับล่าสุดก่อน กด “ฉบับใหม่” หรือเปิดฉบับจาก “คลังเอกสาร” แล้วลองอีกครั้ง');return}
      setMsg('');opts.run();
    });
    tiles[id]={el:b,sub:subEl,need:!!opts.need};
    return b;
  }

  function openLib(){expectNav();click('#btn-list')}
  function openFile(){closeSheet();expectNav();click('#btn-list');var f=$('#bk-file');if(f)f.click()}

  function build(){
    var st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
    wrap=$('.wrap');
    document.body.classList.add('qc-hub');

    /* form picker */
    var selId=ls(FORM_K),sel=FORMS.filter(function(f){return f.id===selId})[0]||FORMS[0];
    var fname=el('span',{class:'qh-t'},sel.name);
    var fbtn=el('button',{type:'button',class:'qh-fbtn',id:'qh-fbtn','aria-haspopup':'listbox','aria-expanded':'false'},icon('plus'),fname,icon('chev'));
    var flist=el('ul',{class:'qh-flist',id:'qh-flist',role:'listbox','aria-label':'เลือกแบบฟอร์ม',hidden:true});
    FORMS.forEach(function(f){
      var li=el('li',{role:'option','aria-selected':f.id===sel.id?'true':'false',tabindex:'0'},el('b',null,f.name+(f.id===sel.id?'  ✓':'')),f.sub?el('small',{style:'display:block;color:var(--muted);font-size:.78rem'},f.sub):null);
      function pick(){
        lsSet(FORM_K,f.id);sel=f;fname.textContent=f.name;flist.hidden=true;fbtn.setAttribute('aria-expanded','false');
        [].forEach.call(flist.querySelectorAll('li[role=option]'),function(n,i){var on=FORMS[i].id===f.id;n.setAttribute('aria-selected',on?'true':'false');n.querySelector('b').textContent=FORMS[i].name+(on?'  ✓':'')});
        var t=document.querySelector('#qh-t-new small');if(t)t.textContent=f.name.replace(/^แบบฟอร์ม/,'');
      }
      li.addEventListener('click',pick);li.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();pick()}});
      flist.appendChild(li);
    });
    flist.appendChild(el('li',{class:'qh-note'},'แบบตรวจความปลอดภัยแยกจากงาน QC: มีเช็กลิสต์ของตัวเอง และติดป้าย “ความปลอดภัย” ในคลังเอกสาร'));
    fbtn.addEventListener('click',function(e){e.stopPropagation();var o=flist.hidden;flist.hidden=!o;fbtn.setAttribute('aria-expanded',o?'true':'false')});
    document.addEventListener('click',function(e){if(!flist.hidden&&!flist.contains(e.target)){flist.hidden=true;fbtn.setAttribute('aria-expanded','false')}});
    var fp=el('div',{class:'qh-fp'},el('span',{class:'qh-lbl'},'แบบฟอร์ม'),fbtn,flist);

    /* latest card */
    lastEls.t=el('div',{class:'qh-lt'});lastEls.s=el('div',{class:'qh-ls'});
    lastEls.open=el('button',{type:'button',class:'btn primary',id:'qh-open'},'เปิดต่อ');
    lastEls.open.addEventListener('click',function(){goForm()});
    var last=el('section',{class:'qh-last','aria-label':'ฉบับล่าสุด'},el('span',{class:'qh-lbl'},'ฉบับล่าสุด'),el('div',{class:'qh-lrow'},el('div',{style:'min-width:0;flex:1 1 12rem'},lastEls.t,lastEls.s),lastEls.open));

    msgEl=el('div',{class:'qh-msg',role:'status','aria-live':'polite',id:'qh-msg'});

    /* tiles */
    var grid=el('div',{class:'qh-grid',role:'group','aria-label':'เมนูหลัก'},
      tile('new','ฉบับใหม่',sel.name.replace(/^แบบฟอร์ม/,''),'plus',{primary:true,run:function(){expectNav();click('#btn-new')}}),
      tile('lib','คลังเอกสาร','','folder',{run:openLib}),
      tile('send','ส่งเอกสาร','ไฟล์ ZIP','send',{need:true,run:function(){click('#btn-send')}}),
      tile('follow','ตรวจรอบใหม่','จากรายการค้าง','recheck',{need:true,run:function(){expectNav();click('#btn-follow')}}),
      tile('dup','ทำสำเนา','เป็นฉบับใหม่','copy',{need:true,run:function(){expectNav();click('#btn-dup')}}),
      tile('imp','รับไฟล์ ZIP','งานที่เพื่อนส่งมา','inbox',{run:openFile}),
      tile('bk','สำรอง / กู้คืน','ข้อมูลทั้งหมด','db',{run:openBackup}),
      tile('trash','ถังขยะ','กู้คืนได้ 30 วัน','trash',{run:openTrash}),
      tile('set','ตั้งค่า','รหัสผู้ตรวจ ฯลฯ','gear',{run:openSettings}));

    var slot=el('div',{class:'qh-slot',id:'qh-slot'});
    home=el('div',{id:'qc-home',role:'main','aria-label':'หน้าแรก'},
      el('div',{class:'qh-in'},
        el('header',null,el('h1',{tabindex:'-1'},'ตรวจงานก่อสร้าง'),el('div',{class:'qh-sub'},'ข้อมูลเก็บในเครื่องนี้ · ใช้ได้โดยไม่ต้องมีอินเทอร์เน็ต')),
        fp,last,msgEl,grid,slot));
    document.body.appendChild(home);

    /* form bar */
    var back=el('button',{type:'button',class:'btn',id:'qf-back','aria-label':'กลับหน้าแรก'},icon('back'),'หน้าแรก');
    back.addEventListener('click',goHome);
    var title=el('div',{class:'qf-t',id:'qf-title'},'');
    var send=el('button',{type:'button',class:'btn primary',id:'qf-send'},icon('send'),'ส่งเอกสาร');
    send.addEventListener('click',function(){click('#btn-send')});
    var more=el('button',{type:'button',class:'btn',id:'qf-more','aria-haspopup':'menu','aria-expanded':'false','aria-label':'เมนูเพิ่มเติม'},icon('more'));
    more.addEventListener('click',function(e){e.stopPropagation();menuEl?closeMenu():openMenu(more)});
    formbar=el('div',{id:'qc-formbar',class:'noprint'},back,title,send,more);
    if(wrap)wrap.insertBefore(formbar,wrap.firstChild);
    document.addEventListener('click',function(e){if(menuEl&&!menuEl.contains(e.target))closeMenu()});
    document.addEventListener('keydown',function(e){
      if(e.key!=='Escape')return;
      if(sheet){closeSheet();return}
      if(menuEl)closeMenu();
    });

    /* mirror status + title, auto-navigate after actions that open/create a document */
    var NAV=/^(เปิดฉบับ|เริ่มฉบับใหม่|ทำสำเนาแล้ว|สร้างฉบับใหม่จากรายการค้าง)/,TRASHED=/^ย้ายไปถังขยะแล้ว/;
    var s=$('#status');
    if(s)new MutationObserver(function(){
      var t=(s.textContent||'').trim();if(!t)return;
      if(view==='home'){
        if(!/^(กำลังเตรียม|โหลดข้อมูล)/.test(t))setMsg(NAV.test(t)&&pending?'':t);
        if(pending&&NAV.test(t)){pending=false;closeSheet();goForm();if(/^เริ่มฉบับใหม่/.test(t)){var f=$('#m-docno');if(f)f.focus({preventScroll:true})}}
      }else if(pending&&TRASHED.test(t)){pending=false;goHome();setMsg(t)}
      refresh();
    }).observe(s,{childList:true,characterData:true,subtree:true});
    var ct=$('#curtitle');
    function syncTitle(){var t=((ct&&ct.textContent)||'').replace(/\s*\(ยังไม่ได้บันทึก\)\s*$/,'');title.textContent=t||'ฉบับยังไม่ตั้งชื่อ';refresh()}
    if(ct)new MutationObserver(syncTitle).observe(ct,{childList:true,characterData:true,subtree:true});
    var bl=$('#btn-list');if(bl)new MutationObserver(refresh).observe(bl,{childList:true,characterData:true,subtree:true});
    window.addEventListener('qc-change',refresh);
    syncTitle();

    /* the install card and backup reminder belong on the home page */
    var tries=0,iv=setInterval(function(){
      var c=$('#qc-installcard'),b=$('#qc-bar');
      if(c||b){clearInterval(iv);if(c)slot.appendChild(c);if(b)slot.appendChild(b)}
      else if(++tries>40)clearInterval(iv);
    },100);

    try{history.replaceState({qc:'home'},'')}catch(e){}
    applyHome();booted=true;
  }

  /* ---------- form-page menu ---------- */
  function openMenu(anchor){
    closeMenu();
    var lib=el('button',{type:'button',role:'menuitem'},icon('folder'),'ไปที่คลังเอกสาร');
    lib.addEventListener('click',function(){closeMenu();click('#btn-list')});
    var del=el('button',{type:'button',role:'menuitem',class:'danger'},icon('trash'),'ย้ายไปถังขยะ');
    del.addEventListener('click',function(){
      if(del.classList.contains('armed')){
        clearTimeout(armT);closeMenu();expectNav();
        var r=$('#reset');if(r){r.click();r.click()}
        return;
      }
      del.classList.add('armed');del.lastChild.textContent='กดอีกครั้งเพื่อยืนยัน';
      armT=setTimeout(function(){del.classList.remove('armed');del.lastChild.textContent='ย้ายไปถังขยะ'},3500);
    });
    menuEl=el('div',{class:'qf-menu',role:'menu'},lib,del);
    formbar.appendChild(menuEl);anchor.setAttribute('aria-expanded','true');
  }
  function closeMenu(){
    if(menuEl){menuEl.remove();menuEl=null}clearTimeout(armT);
    var m=$('#qf-more');if(m)m.setAttribute('aria-expanded','false');
  }

  /* ---------- sheets ---------- */
  function openSheet(title,nodes){
    closeSheet();
    var card=el('div',{class:'qh-card',role:'dialog','aria-modal':'true','aria-label':title},el('h2',null,title));
    nodes.forEach(function(n){card.appendChild(n)});
    var close=el('button',{type:'button',class:'btn'},'ปิด');close.addEventListener('click',closeSheet);card.appendChild(close);
    sheet=el('div',{id:'qh-sheet'},card);
    sheet.addEventListener('mousedown',function(e){if(e.target===sheet)closeSheet()});
    document.body.appendChild(sheet);close.focus();
  }
  function closeSheet(){if(sheet){sheet.remove();sheet=null}}
  function big(ic,t,sub,fn){
    var b=el('button',{type:'button',class:'qh-big'},icon(ic),el('span',null,t,el('small',null,sub||'')));
    b.addEventListener('click',fn);return b;
  }
  function openBackup(){
    openSheet('สำรอง / กู้คืนข้อมูล',[
      el('div',{class:'qh-kv'},'ไฟล์สำรองเก็บทุกฉบับ โฟลเดอร์ และรูป เก็บไว้ในที่ปลอดภัย (เช่น Drive, LINE Keep) เผื่อเครื่องหาย'),
      big('db','สำรองข้อมูลทั้งหมด (ZIP)','บันทึกไฟล์ลงเครื่อง',function(){closeSheet();expectNav();click('#btn-list');setTimeout(function(){click('#bk-export')},60)}),
      big('inbox','กู้คืนจากไฟล์ ZIP','เลือกไฟล์สำรองหรือไฟล์ส่งงาน',openFile)
    ]);
  }
  function openTrash(){
    expectNav();click('#btn-list');
    var n=0,iv=setInterval(function(){
      var b=$('.fd-trash .fd-open');
      if(b){clearInterval(iv);b.click()}else if(++n>20)clearInterval(iv);
    },60);
  }
  function openSettings(){
    var code=el('input',{type:'text',id:'qs-code',maxlength:'6',value:ls(CODE_K)||'',placeholder:'เช่น A',autocapitalize:'characters'});
    var name=el('input',{type:'text',id:'qs-name',value:ls(NAME_K)||'',placeholder:'เช่น สมชาย ใจดี',autocomplete:'name'});
    var saved=el('div',{class:'qh-kv',role:'status'});
    var save=el('button',{type:'button',class:'btn primary'},'บันทึกการตั้งค่า');
    save.addEventListener('click',function(){
      lsSet(CODE_K,code.value.trim().replace(/[^A-Za-z0-9ก-๙]/g,'').slice(0,6));lsSet(NAME_K,name.value.trim());
      code.value=ls(CODE_K)||'';saved.textContent='บันทึกแล้ว (รหัสนี้จะนำหน้าเลขที่เอกสารของฉบับใหม่)';
    });
    var store=el('div',{class:'qh-kv'},'กำลังตรวจที่เก็บข้อมูล…'),ver=el('div',{class:'qh-kv'},'');
    var persist=el('button',{type:'button',class:'btn',hidden:true},'ขอให้เบราว์เซอร์เก็บข้อมูลถาวร');
    function mb(n){return (n/1048576).toFixed(n>=1048576*10?0:1)+' MB'}
    function renderStore(){
      try{
        var ps=navigator.storage&&navigator.storage.persisted?navigator.storage.persisted():Promise.resolve(null),
            es=navigator.storage&&navigator.storage.estimate?navigator.storage.estimate():Promise.resolve(null);
        Promise.all([ps,es]).then(function(r){
          var p=r[0],e=r[1],t='ที่เก็บข้อมูล: '+(p===true?'ถาวร (เบราว์เซอร์รับรองแล้ว)':(p===false?'ยังไม่รับรองถาวร ควรสำรองไฟล์เป็นระยะ':'ไม่ทราบสถานะ'));
          if(e&&e.usage!=null)t+=' · ใช้ไป '+mb(e.usage)+(e.quota?' จาก '+mb(e.quota):'');
          store.textContent=t;persist.hidden=p!==false||!navigator.storage.persist;
        }).catch(function(){store.textContent='ตรวจที่เก็บข้อมูลไม่ได้'});
      }catch(e){store.textContent='ตรวจที่เก็บข้อมูลไม่ได้'}
    }
    persist.addEventListener('click',function(){try{navigator.storage.persist().then(renderStore,renderStore)}catch(e){}});
    try{caches.keys().then(function(k){var v=k.filter(function(x){return /^qc-v/.test(x)});ver.textContent='เวอร์ชันแอป: '+(v.join(', ')||'-')+(navigator.onLine?'':' · ออฟไลน์')})}catch(e){}
    renderStore();
    openSheet('ตั้งค่า',[
      el('div',{class:'qh-row'},el('label',{class:'qh-lbl','for':'qs-code'},'รหัสผู้ตรวจ (นำหน้าเลขที่เอกสาร สูงสุด 6 ตัว)'),code),
      el('div',{class:'qh-row'},el('label',{class:'qh-lbl','for':'qs-name'},'ชื่อผู้ส่งไฟล์'),name),
      save,saved,store,persist,ver,
      el('a',{href:'./share-test.html',class:'qh-kv'},'ทดสอบการส่งไฟล์จากมือถือ (หน้าทดสอบ)')
    ]);
  }

  function boot(){
    if(!$('.wrap')||!$('#status')){setTimeout(boot,50);return}
    build();
    window.__qcHome={go:function(v){v==='form'?goForm():goHome()},view:function(){return view}};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
