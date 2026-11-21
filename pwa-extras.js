/* Offline-app extras: backup reminder, install button, storage status. Pure UI; talks to the form only through its public buttons. */
(function(){
  'use strict';
  var DAY=864e5,WARN=7;
  function $(s){return document.querySelector(s)}
  function lastBackup(){try{var v=+localStorage.getItem('qc-last-backup');return v>0?v:0}catch(e){return 0}}
  var isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent),standalone=(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)||navigator.standalone;
  var deferred=null,persisted=null;
  var bar=document.createElement('section');bar.className='card noprint';bar.id='qc-bar';bar.hidden=true;
  bar.setAttribute('aria-label','สถานะการสำรองข้อมูล');
  bar.style.cssText='display:flex;gap:8px 14px;flex-wrap:wrap;align-items:center;justify-content:space-between';
  var msg=document.createElement('span');msg.style.cssText='flex:1 1 18rem;min-width:0';
  var btn=document.createElement('button');btn.type='button';btn.className='btn sm primary';btn.textContent='สำรองตอนนี้';
  btn.addEventListener('click',function(){var b=$('#bk-export');if(b)b.click()});
  bar.appendChild(msg);bar.appendChild(btn);
  /* ---- install card: one button on Android, step-by-step on iPhone, "open in browser" inside LINE/Facebook ---- */
  var UA=navigator.userAgent,inApp=/Line\/|FBAN|FBAV|Instagram|MicroMessenger|; wv\)/i.test(UA),isFile=location.protocol==='file:';
  var card=document.createElement('section');card.className='card noprint';card.id='qc-installcard';card.hidden=true;card.setAttribute('aria-label','ติดตั้งแอป');
  card.style.cssText='display:grid;gap:8px';
  var ititle=document.createElement('b');ititle.textContent='ติดตั้งแอปลงหน้าจอมือถือ';
  var ibody=document.createElement('div');ibody.id='qc-hint';ibody.style.cssText='line-height:1.6';
  var iacts=document.createElement('div');iacts.style.cssText='display:flex;flex-wrap:wrap;gap:8px';
  var inst=document.createElement('button');inst.type='button';inst.className='btn primary';inst.id='qc-install';inst.hidden=true;inst.textContent='ติดตั้งแอปลงหน้าจอ';
  var copy=document.createElement('button');copy.type='button';copy.className='btn';copy.id='qc-copylink';copy.hidden=true;copy.textContent='คัดลอกลิงก์ แล้วเปิดใน Safari/Chrome';
  var hide=document.createElement('button');hide.type='button';hide.className='btn sm';hide.id='qc-installhide';hide.textContent='ซ่อน';
  iacts.appendChild(inst);iacts.appendChild(copy);iacts.appendChild(hide);card.appendChild(ititle);card.appendChild(ibody);card.appendChild(iacts);
  var hint=ibody;
  function dismissed(){try{return localStorage.getItem('qc-install-hide')==='1'}catch(e){return false}}
  hide.addEventListener('click',function(){try{localStorage.setItem('qc-install-hide','1')}catch(e){}render()});
  copy.addEventListener('click',function(){
    var u=location.href.split('#')[0];
    (navigator.clipboard&&navigator.clipboard.writeText?navigator.clipboard.writeText(u):Promise.reject()).then(function(){copy.textContent='คัดลอกลิงก์แล้ว นำไปวางใน Safari/Chrome'},function(){copy.textContent='คัดลอกไม่ได้ กดค้างที่ลิงก์ในแถบที่อยู่เพื่อคัดลอก'});
  });
  inst.addEventListener('click',function(){if(!deferred)return;deferred.prompt();deferred.userChoice.finally(function(){deferred=null;render()})});
  window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferred=e;render()});
  window.addEventListener('appinstalled',function(){deferred=null;render()});
  function renderInstall(){
    var show=!standalone&&!dismissed();
    card.hidden=!show;if(!show)return;
    inst.hidden=!deferred;copy.hidden=!inApp;
    if(isFile){hint.textContent='ตอนนี้เปิดจากไฟล์ในเครื่อง ติดตั้งลงหน้าจอไม่ได้ ต้องเปิดจากลิงก์เว็บ (https) ที่อัปโหลดไว้ตามขั้นตอนใน README';return}
    if(inApp){hint.textContent='คุณเปิดอยู่ในแอป LINE/Facebook ซึ่งติดตั้งลงหน้าจอไม่ได้ ให้คัดลอกลิงก์แล้วไปเปิดใน '+(isIOS?'Safari':'Chrome')+' ก่อน';return}
    if(deferred){hint.textContent='กดปุ่มด้านล่าง แล้วกด “ติดตั้ง” ไอคอน “ตรวจงาน” จะขึ้นบนหน้าจอ';return}
    if(isIOS){hint.textContent='iPhone/iPad (ต้องใช้ Safari): 1) กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรขึ้น) 2) เลื่อนลงแล้วเลือก “เพิ่มไปยังหน้าจอโฮม” 3) กด “เพิ่ม” ไอคอน “ตรวจงาน” จะขึ้นบนหน้าจอ';return}
    hint.textContent='Android: แตะเมนู ⋮ ของ Chrome มุมขวาบน แล้วเลือก “ติดตั้งแอป” หรือ “เพิ่มลงหน้าจอหลัก” (ถ้าเพิ่งเปิดหน้านี้ รอสักครู่หรือรีเฟรชแล้วปุ่มติดตั้งจะขึ้นเอง) ไอคอนอาจอยู่ในลิ้นชักแอป ให้กดค้างลากมาวางหน้าจอได้';
  }
  function ago(t){var d=Math.floor((Date.now()-t)/DAY);return d<=0?'วันนี้':d+' วันก่อน'}
  function render(){
    var n=(window.__qcStats?window.__qcStats().docs:0),lb=lastBackup();
    var stale=n>0&&(!lb||(Date.now()-lb)>WARN*DAY);
    bar.hidden=!stale;
    if(stale){
      msg.textContent=lb?('สำรองข้อมูลล่าสุด '+ago(lb)+' · ข้อมูล '+n+' ฉบับเก็บอยู่ในเบราว์เซอร์นี้เท่านั้น ควรสำรองเป็น ZIP'):('ยังไม่เคยสำรองข้อมูล · ข้อมูล '+n+' ฉบับเก็บอยู่ในเบราว์เซอร์นี้เท่านั้น ถ้าล้างข้อมูลเบราว์เซอร์จะหาย');
      if(persisted===false)msg.textContent+=' (เบราว์เซอร์ยังไม่รับรองการเก็บถาวร)';
    }
    renderInstall();
  }
  function mount(){
    var wrap=$('.wrap'),actions=$('.top .actions');if(!wrap)return;
    var top=$('.top');top.insertAdjacentElement('afterend',bar);bar.insertAdjacentElement('beforebegin',card);
    try{if(navigator.storage&&navigator.storage.persisted)navigator.storage.persisted().then(function(v){persisted=v;render()})}catch(e){}
    window.addEventListener('qc-change',render);render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else setTimeout(mount,0);
})();
