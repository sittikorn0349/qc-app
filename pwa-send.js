/* Send / receive inspection documents as a verified file (ZIP).
   Package "qc-send" v1:  manifest.json (+ docs.json + photos/*) with a SHA-256 for every file.
   Receiver checks everything BEFORE writing anything, then writes all rows in one transaction. */
(function(){
  'use strict';
  var U=window.QCU;  /* shared helpers: pwa-util.js */
  var ls=U.ls,lsSet=U.lsSet,el=U.el,clone=U.clone,jget=U.jget,S=U.S,sha256js=U.sha256js,sha256=U.sha256,sha256Blob=U.sha256Blob,sha256Text=U.sha256Text,hex=U.hex;
  var PKGS_K='qc-sent-pkgs',NAME_K='qc-sender-name',CODE_K='qc-code',EXT_K='qc-send-ext',SENT_K='qc-sent',RECV_K='qc-recv-log',BIG=15*1024*1024;
  var $=function(s,r){return (r||document).querySelector(s)};


  /* ---------- canonical content of a document (what "the same document" means) ---------- */
  function ids(a){return (Array.isArray(a)?a:[]).filter(function(x){return typeof x==='string'&&x})}
  function content(d){
    var m=d.meta||{},g=d.sign||{};
    return JSON.stringify({
      meta:['project','docno','site','date','work','inspector','contractor','weather'].map(function(k){return S(m[k])}),
      sign:['inspector','supervisor','contractor'].map(function(k){return [S((g[k]||{}).name),S((g[k]||{}).date)]}),
      summary:S(d.summary),remarks:S(d.remarks),
      items:(d.items||[]).map(function(it){return [S(it.id),S(it.loc),S(it.chk),S(it.res),S(it.note),S(it.cat),S(it.ref),S(it.rres),S(it.rdate),S(it.rnote),ids(it.before),ids(it.after)]})
    });
  }
  function hashDoc(d){return sha256Text(content(d))}
  function titleOf(d){var m=d.meta||{},t=(m.work||m.project||'').trim(),no=(m.docno||'').trim();return (no&&t)?no+' · '+t:(no||t||'ฉบับยังไม่ตั้งชื่อ')}
  function photosOf(d){var o=[],seen={};(d.items||[]).forEach(function(it){ids(it.before).concat(ids(it.after)).forEach(function(x){if(!seen[x]){seen[x]=1;o.push(x)}})});return o}
  function sniff(b){
    return b.slice(0,12).arrayBuffer().then(function(ab){
      var u=new Uint8Array(ab);
      if(u[0]===0xFF&&u[1]===0xD8)return 'image/jpeg';
      if(u[0]===0x89&&u[1]===0x50&&u[2]===0x4E&&u[3]===0x47)return 'image/png';
      if(u[0]===0x47&&u[1]===0x49&&u[2]===0x46)return 'image/gif';
      if(u[0]===0x52&&u[1]===0x49&&u[2]===0x46&&u[3]===0x46&&u[8]===0x57&&u[9]===0x45)return 'image/webp';
      return '';
    });
  }
  function extOf(t){return /png/.test(t)?'png':/webp/.test(t)?'webp':/gif/.test(t)?'gif':'jpg'}
  function fmtCode(h){h=h.slice(0,8).toUpperCase();return h.slice(0,4)+'-'+h.slice(4)}
  function mb(n){return (n/1048576).toFixed(1)}
  function sz(n){return n<1048576?Math.max(1,Math.round(n/1024))+' KB':mb(n)+' MB'}
  function pad(n){return String(n).padStart(2,'0')}
  function stamp(){var d=new Date();return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'-'+pad(d.getHours())+pad(d.getMinutes())}
  function newId(){return 'i'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
  function fmtShort(iso){var d=new Date(iso);if(isNaN(d))return '';try{return d.toLocaleString('th-TH',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}catch(e){return ''}}

  /* unanswered items / items still awaiting re-inspection, so the sender notices before sending */
  function gaps(d){
    var items=(d&&d.items)||[],blank=0,pend=0;
    items.forEach(function(it){
      if(!it.res)blank++;
      else if((it.res==='fix'||it.res==='bad')&&it.rres!=='ok')pend++;
    });
    return {blank:blank,pend:pend};
  }

  /* ---------- build + verify a package ---------- */
  var ZIP_README='แพ็กเกจส่งงาน (qc-send v1)\nmanifest.json = รายการไฟล์พร้อมรหัสตรวจ SHA-256 และรหัสยืนยัน\ndocs.json = ข้อมูลเอกสาร\nphotos/ = รูปถ่ายต้นฉบับ\nนำเข้าที่แอปตรวจงานก่อสร้าง > คลังเอกสาร > นำเข้า ระบบจะตรวจความครบถ้วนก่อนนำเข้าทุกครั้ง ห้ามแก้ไขไฟล์ในนี้\n';
  function fail(msg,list){var e=new Error(msg);e.list=list||[];e.user=true;return e}

  async function build(idList){
    await window.__qcForm.drain();
    var sender={name:(ls(NAME_K)||'').trim(),code:(ls(CODE_K)||'').trim()},docs=[],photoSet={},photoOrder=[],i,j;
    /* 'f:<id>' = a document from the form engine (pwa-forms.js); photos travel inside it as data URLs */
    var fids=idList.filter(function(x){return x.indexOf('f:')===0}).map(function(x){return x.slice(2)});
    idList=idList.filter(function(x){return x.indexOf('f:')!==0});
    var fdocs=[];
    if(fids.length){
      if(!window.__qcForms)throw fail('เครื่องนี้ยังไม่มีระบบรายงานแบบอื่น');
      fdocs=await window.__qcForms.getDocs(fids);
      if(fdocs.some(function(d){return !d}))throw fail('ไม่พบรายงานแบบอื่นที่เลือก (อาจถูกลบไปแล้ว)');
    }
    for(i=0;i<idList.length;i++){
      var d=window.__qcGetDoc(idList[i]);
      if(!d)throw fail('ไม่พบเอกสารที่เลือก (อาจถูกลบไปแล้ว)');
      var ph=photosOf(d),inline=[];
      (d.items||[]).forEach(function(it){ids(it.before).concat(ids(it.after)).forEach(function(x){if(x.indexOf('data:')===0)inline.push(x)})});
      if(inline.length)throw fail('เอกสาร “'+titleOf(d)+'” มีรูปที่ยังไม่ถูกเก็บในเครื่อง ส่งไม่ได้');
      docs.push({id:idList[i],data:d,title:titleOf(d),photos:ph});
      ph.forEach(function(x){if(!photoSet[x]){photoSet[x]=1;photoOrder.push(x)}});
    }
    var entries=[],files=[],missing=[],bad=[];
    for(j=0;j<photoOrder.length;j++){
      var pid=photoOrder[j],b=null;
      try{b=await window.__qcBlob(pid)}catch(e){}
      if(!b){missing.push(pid);continue}
      var t=await sniff(b);if(!t){bad.push(pid);continue}
      var name='photos/'+pid+'.'+extOf(t),blob=new Blob([b],{type:t});
      files.push({name:name,size:blob.size,sha256:await sha256Blob(blob)});entries.push({name:name,blob:blob});
    }
    if(missing.length||bad.length){
      var lst=[];docs.forEach(function(x){var m=x.photos.filter(function(p){return missing.indexOf(p)>=0||bad.indexOf(p)>=0}).length;if(m)lst.push('“'+x.title+'” มีรูปหาย/เสีย '+m+' รูป')});
      throw fail('พบรูปที่หายหรือเสียในเครื่อง จึงยังไม่สร้างไฟล์ส่ง (กันส่งงานไม่ครบ)',lst);
    }
    var docsOut=docs.map(function(x){return Object.assign({id:x.id},x.data)}),docsTxt=JSON.stringify(docsOut),docsBlob=new Blob([docsTxt],{type:'application/json'});
    files.unshift({name:'docs.json',size:docsBlob.size,sha256:await sha256Blob(docsBlob)});
    var mforms=[];
    if(fdocs.length){
      var fBlob=new Blob([JSON.stringify(fdocs)],{type:'application/json'});
      files.push({name:'forms.json',size:fBlob.size,sha256:await sha256Blob(fBlob)});entries.push({name:'forms.json',blob:fBlob});
      for(i=0;i<fdocs.length;i++)mforms.push({id:fdocs[i].id,title:window.__qcForms.titleOf(fdocs[i]),updatedAt:S(fdocs[i].updatedAt),hash:await sha256Text(JSON.stringify(fdocs[i]))});
    }
    var mdocs=[];
    for(i=0;i<docs.length;i++)mdocs.push({id:docs[i].id,docno:S((docs[i].data.meta||{}).docno),title:docs[i].title,rev:+docs[i].data.rev||0,updatedAt:S(docs[i].data.updatedAt),hash:await hashDoc(docs[i].data),photos:docs[i].photos.length});
    var mf={format:'qc-send',version:1,createdAt:new Date().toISOString(),sender:sender,docs:mdocs,files:files};
    if(mforms.length)mf.forms=mforms;
    mf.code=fmtCode(await codeOf(mf));
    entries.unshift({name:'docs.json',blob:docsBlob});
    entries.unshift({name:'manifest.json',blob:new Blob([JSON.stringify(mf)],{type:'application/json'})});
    entries.push({name:'README.txt',blob:new Blob([ZIP_README],{type:'text/plain'})});
    var zip=await QC.makeZip(entries);
    /* verify what we just built exactly as the receiver will */
    var an=await analyze(zip);
    if(!an.ok)throw fail('ตรวจไฟล์ที่สร้างแล้วไม่ผ่าน จึงไม่ปล่อยให้ส่ง ลองใหม่อีกครั้ง',an.errors);
    return {blob:zip,manifest:mf,docs:docs,forms:fdocs,size:zip.size,photos:photoOrder.length};
  }
  function codeOf(mf){var a=[mf.docs.map(function(d){return [d.id,d.hash]}),mf.files.map(function(f){return [f.name,f.sha256]})];if(mf.forms)a.push(mf.forms.map(function(d){return [d.id,d.hash]}));return sha256Text(JSON.stringify(a))}

  /* ---------- analyze (receiver side; also used to self-check the sender's file) ---------- */
  async function analyze(blob){
    var errs=[],out={ok:false,errors:errs};
    var z;
    try{z=await QC.readZip(blob)}catch(e){errs.push('อ่านไฟล์ ZIP ไม่ได้ หรือไฟล์ไม่ครบ (อาจถูกตัดตอนส่ง)');return out}
    async function rd(name){try{return await z.read(name)}catch(e){errs.push('ไฟล์ “'+name+'” เสียหาย ('+(/crc|size|trunc/.test(e.message)?'ข้อมูลไม่ตรงกับตอนส่ง':e.message)+')');return null}}
    var mfb=await rd('manifest.json');if(!mfb){if(!errs.length)errs.push('ไม่มี manifest.json');return out}
    var mf;try{mf=JSON.parse(await mfb.text())}catch(e){errs.push('manifest.json อ่านไม่ได้');return out}
    if(mf.format!=='qc-send'||mf.version!==1||!Array.isArray(mf.docs)||!Array.isArray(mf.files)){errs.push('ไม่ใช่ไฟล์ส่งงานของแอปนี้ หรือเป็นเวอร์ชันที่ไม่รองรับ');return out}
    var listed={},k;
    for(k=0;k<mf.files.length;k++){
      var f=mf.files[k];listed[f.name]=f;
      var fb=await rd(f.name);if(!fb){if(z.names.indexOf(f.name)<0)errs.push('ไฟล์หาย: '+f.name);continue}
      if(fb.size!==f.size)errs.push('ขนาดไม่ตรง: '+f.name);
      else if(await sha256Blob(fb)!==f.sha256)errs.push('เนื้อหาไม่ตรงกับตอนส่ง: '+f.name);
    }
    z.names.forEach(function(n){if(n!=='manifest.json'&&n!=='README.txt'&&!listed[n])errs.push('มีไฟล์ที่ไม่อยู่ในรายการ: '+n)});
    var docs=null,dj=await rd('docs.json');
    if(dj){try{docs=JSON.parse(await dj.text())}catch(e){errs.push('docs.json อ่านไม่ได้')}}
    var photos={};
    if(docs){
      if(!Array.isArray(docs)||docs.length!==mf.docs.length)errs.push('จำนวนเอกสารไม่ตรงกับรายการ');
      else for(k=0;k<docs.length;k++){
        var md=mf.docs[k],d=docs[k];
        if(!d||d.id!==md.id){errs.push('ลำดับ/รหัสเอกสารไม่ตรงรายการ (ฉบับที่ '+(k+1)+')');continue}
        if(await hashDoc(d)!==md.hash)errs.push('ข้อมูลเอกสาร “'+(md.title||md.id)+'” ถูกแก้หรือเสียหาย');
        photosOf(d).forEach(function(pid){
          var hit=Object.keys(listed).filter(function(n){return n.indexOf('photos/'+pid+'.')===0})[0];
          if(!hit)errs.push('เอกสาร “'+(md.title||md.id)+'” อ้างรูปที่ไม่มีในไฟล์ ('+pid.slice(0,8)+'…)');else photos[pid]=hit;
        });
      }
    }
    var pids=Object.keys(photos),pblobs={};
    for(k=0;k<pids.length;k++){
      var pb=await rd(photos[pids[k]]);if(!pb)continue;
      var ty=await sniff(pb);if(!ty){errs.push('ไฟล์รูปไม่ใช่รูปภาพ: '+photos[pids[k]]);continue}
      pblobs[pids[k]]={blob:new Blob([pb],{type:ty}),sha:listed[photos[pids[k]]].sha256};
    }
    var forms=[];
    if(mf.forms){
      if(!Array.isArray(mf.forms)||!listed['forms.json'])errs.push('รายการรายงานแบบอื่นไม่ครบ');
      else{
        var fj=await rd('forms.json');
        if(fj){try{forms=JSON.parse(await fj.text())}catch(e){errs.push('forms.json อ่านไม่ได้')}}
        if(!Array.isArray(forms)||forms.length!==mf.forms.length)errs.push('จำนวนรายงานแบบอื่นไม่ตรงกับรายการ');
        else for(k=0;k<forms.length;k++){
          if(!forms[k]||forms[k].id!==mf.forms[k].id){errs.push('ลำดับ/รหัสรายงานแบบอื่นไม่ตรงรายการ (ฉบับที่ '+(k+1)+')');continue}
          if(await sha256Text(JSON.stringify(forms[k]))!==mf.forms[k].hash)errs.push('ข้อมูลรายงาน “'+(mf.forms[k].title||mf.forms[k].id)+'” ถูกแก้หรือเสียหาย');
        }
      }
    }
    if(mf.code!==fmtCode(await codeOf(mf)))errs.push('รหัสยืนยันไม่ตรง (รายการไฟล์ถูกแก้ไข)');
    out.ok=!errs.length;out.manifest=mf;out.docs=docs;out.photos=pblobs;out.forms=forms;return out;
  }

  /* ---------- receive ---------- */
  async function planReceive(an){
    var local=window.__qcDocs(),mf=an.manifest,plan=[],k,warn=[];
    var errs=[];
    var pids=Object.keys(an.photos),newBlobs=[];
    for(k=0;k<pids.length;k++){
      var ex=await window.__qcBlob(pids[k]);
      if(ex){if(await sha256Blob(ex)!==an.photos[pids[k]].sha)errs.push('รหัสรูปชนกับรูปอื่นในเครื่อง ('+pids[k].slice(0,8)+'…) ไม่นำเข้าเพื่อกันรูปถูกเขียนทับ')}
      else newBlobs.push({id:pids[k],blob:an.photos[pids[k]].blob});
    }
    if(errs.length)return {errors:errs};
    var now=new Date().toISOString(),from=(mf.sender&&mf.sender.name)||'',cd=mf.code;
    for(k=0;k<an.docs.length;k++){
      var d=an.docs[k],md=mf.docs[k],pkgHash=md.hash,item={id:d.id,title:md.title||titleOf(d),docno:S((d.meta||{}).docno),kind:'',data:null};
      var already=null;
      for(var x=0;x<local.length;x++){var rxx=local[x].data.rx;if(rxx&&rxx.src&&rxx.src.id===d.id&&rxx.src.hash===pkgHash){already=local[x];break}}
      var loc=local.filter(function(y){return y.id===d.id})[0];
      var lh=loc?await hashDoc(loc.data):'';
      if(already||(loc&&lh===pkgHash)){item.kind='same'}
      else{
        var data=clone(d);data.folder='';data.deletedAt='';data.sub=null;data.by='import';
        data.createdAt=d.createdAt||now;data.updatedAt=now;data.rev=1;
        if(!loc){item.kind='new'}
        else if(loc.data.rx&&loc.data.rx.hash===lh){item.kind='update';data.rev=(+loc.data.rev||0)+1;data.folder=loc.data.folder||'';data.createdAt=loc.data.createdAt||data.createdAt}
        else{
          item.kind='conflict';data.id=undefined;
          var m=data.meta=data.meta||{};
          if(m.docno)m.docno=m.docno+' (รับเข้า)';else if(m.work)m.work=m.work+' (รับเข้า)';else m.project=(m.project||'')+' (รับเข้า)';
          item.newId=newId();
        }
        delete data.id;
        data.rx={hash:await hashDoc(data),src:{id:d.id,hash:pkgHash},at:now,code:cd,from:from};
        item.data=data;item.targetId=item.kind==='conflict'?item.newId:d.id;
        item.docno=S((data.meta||{}).docno);
        if(item.docno.trim()){
          var dup=local.filter(function(y){return y.id!==item.targetId&&S((y.data.meta||{}).docno).trim().toLowerCase()===item.docno.trim().toLowerCase()})[0];
          if(dup)warn.push('เลขที่ “'+item.docno+'” ซ้ำกับอีกฉบับในเครื่อง (“'+titleOf(dup.data)+'”) ตรวจสอบเลขที่หลังนำเข้า');
        }
      }
      plan.push(item);
    }
    if((an.forms||[]).length){
      if(!window.__qcForms)return {errors:['เครื่องนี้ยังไม่มีระบบรายงานแบบอื่น จึงรับไฟล์นี้ไม่ได้ ให้อัปเดตแอปก่อน']};
      var lf=await window.__qcForms.listDocs(),lm={};lf.forEach(function(y){lm[y.id]=y});
      for(k=0;k<an.forms.length;k++){
        var fd=an.forms[k],mfd=mf.forms[k],fl=lm[fd.id],fit={form:true,id:fd.id,title:mfd.title||fd.id,kind:'',data:null};
        if(fl&&await sha256Text(JSON.stringify(fl))===mfd.hash)fit.kind='same';
        else if(!fl){fit.kind='new';fit.data=clone(fd)}
        else if(S(fl.updatedAt)<=S(fd.updatedAt)){fit.kind='update';fit.data=clone(fd)}
        else{fit.kind='conflict';fit.data=clone(fd);fit.data.id='f'+Math.random().toString(36).slice(2,10);fit.data.updatedAt=now}
        if(fit.data)fit.hash=await sha256Text(JSON.stringify(fit.data));
        plan.push(fit);
      }
    }
    return {errors:[],items:plan,blobs:newBlobs,warn:warn,from:from,code:cd,createdAt:mf.createdAt};
  }
  var KIND={new:['ฉบับใหม่','c-ok'],update:['อัปเดตจากฉบับที่เคยรับ','c-ok'],same:['มีอยู่แล้ว ไม่ต้องนำเข้า',''],conflict:['ต่างจากฉบับในเครื่อง เก็บไว้ทั้งสองฉบับ','c-fix']};

  var modal=null;
  function closeModal(){if(modal){modal.remove();modal=null;document.body.style.overflow=''}}
  function openModal(title,body){
    closeModal();
    var card=el('div',{class:'card',id:'qc-modal',role:'dialog','aria-modal':'true','aria-label':title,style:'max-width:620px;width:100%;max-height:90vh;overflow:auto;margin:0'},el('h2',null,title),body);
    modal=el('div',{style:'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px'},card);
    modal.addEventListener('mousedown',function(e){if(e.target===modal)closeModal()});
    document.body.appendChild(modal);document.body.style.overflow='hidden';return card;
  }
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&modal)closeModal()});
  function para(t,style){return el('p',{style:style||'margin:6px 0'},t)}
  function errBox(msg,list){
    var b=el('div',{class:'notice',style:'margin:8px 0',role:'alert'},el('span',null,msg));
    if(list&&list.length){var ul=el('ul',{style:'margin:6px 0 0;padding-left:20px;flex-basis:100%'});list.slice(0,8).forEach(function(x){ul.appendChild(el('li',null,x))});if(list.length>8)ul.appendChild(el('li',null,'…และอีก '+(list.length-8)+' รายการ'));b.appendChild(ul)}
    return b;
  }

  async function receive(file,dmsg){
    var body=el('div',null,para('กำลังตรวจไฟล์… (ยังไม่มีการเขียนข้อมูลใด ๆ)'));
    openModal('นำเข้าไฟล์ส่งงาน',body);
    var an;
    try{an=await analyze(file)}catch(e){an={ok:false,errors:['ตรวจไฟล์ไม่สำเร็จ: '+e.message]}}
    body.textContent='';
    if(!an.ok){
      body.appendChild(errBox('ไฟล์นี้ไม่ผ่านการตรวจ จึงไม่นำเข้าอะไรเลย ให้ผู้ส่งสร้างไฟล์แล้วส่งใหม่',an.errors));
      body.appendChild(el('div',{class:'rb-actions',style:'margin-top:10px'},el('button',{class:'btn',type:'button',onclick:closeModal},'ปิด')));
      dmsg('นำเข้าไม่สำเร็จ: ไฟล์ไม่ผ่านการตรวจ (ไม่ได้นำเข้าอะไรเลย)',true);return;
    }
    var pl;try{pl=await planReceive(an)}catch(e){pl={errors:['วางแผนนำเข้าไม่สำเร็จ: '+e.message]}}
    if(pl.errors.length){
      body.appendChild(errBox('นำเข้าไม่ได้',pl.errors));
      body.appendChild(el('div',{class:'rb-actions',style:'margin-top:10px'},el('button',{class:'btn',type:'button',onclick:closeModal},'ปิด')));return;
    }
    var todo=pl.items.filter(function(x){return x.kind!=='same'});
    body.appendChild(para('ไฟล์ผ่านการตรวจครบทุกรายการ ✓'));
    body.appendChild(para('ผู้ส่ง: '+(pl.from||'ไม่ระบุ')+(pl.createdAt?' · สร้างเมื่อ '+fmtShort(pl.createdAt):'')));
    body.appendChild(el('p',{style:'margin:6px 0'},'รหัสยืนยัน ',el('b',null,pl.code),' (เทียบกับรหัสที่ผู้ส่งเห็น ต้องตรงกัน)'));
    var ul=el('div',{style:'display:grid;gap:6px;margin:8px 0'});
    pl.items.forEach(function(x){
      var kd=KIND[x.kind];
      ul.appendChild(el('div',{class:'rec',style:'grid-template-columns:minmax(0,1fr)'},el('span',{class:'rec-t'},x.title),el('div',{class:'rec-chips'},el('span',kd[1]?{class:kd[1]}:null,kd[0]))));
    });
    body.appendChild(ul);
    body.appendChild(para('รูปใหม่ที่จะเพิ่ม '+pl.blobs.length+' รูป'));
    pl.warn.forEach(function(w){body.appendChild(errBox(w))});
    var msg=el('div',{role:'status',style:'margin:6px 0'});
    var go=el('button',{class:'btn primary',type:'button'},todo.length?'ยืนยันนำเข้า '+todo.length+' ฉบับ':'ปิด');
    var cancel=el('button',{class:'btn',type:'button',onclick:closeModal},todo.length?'ยกเลิก':'ปิด');
    body.appendChild(msg);body.appendChild(el('div',{class:'rb-actions',style:'margin-top:10px'},todo.length?go:null,cancel));
    if(!todo.length){msg.textContent='ทุกฉบับในไฟล์นี้มีอยู่ในเครื่องแล้ว ไม่มีอะไรต้องนำเข้า';dmsg('ไฟล์นี้นำเข้าไปแล้ว ไม่มีอะไรเปลี่ยน');return}
    go.addEventListener('click',async function(){
      go.disabled=true;cancel.disabled=true;msg.textContent='กำลังนำเข้า…';
      try{
        var tIns=todo.filter(function(x){return !x.form}),tFrm=todo.filter(function(x){return x.form});
        if(tIns.length||pl.blobs.length)await window.__qcCommit({docs:tIns.map(function(x){return {id:x.targetId,data:x.data}}),blobs:pl.blobs});
        if(tFrm.length)await window.__qcForms.putDocs(tFrm.map(function(x){return x.data}));
        /* read back everything we claim to have written */
        var bad=[];
        for(var i=0;i<tIns.length;i++){var g=window.__qcGetDoc(tIns[i].targetId);if(!g||await hashDoc(g)!==tIns[i].data.rx.hash)bad.push(tIns[i].title)}
        if(tFrm.length){var back=await window.__qcForms.getDocs(tFrm.map(function(x){return x.data.id}));for(var f2=0;f2<tFrm.length;f2++)if(!back[f2]||await sha256Text(JSON.stringify(back[f2]))!==tFrm[f2].hash)bad.push(tFrm[f2].title)}
        for(var j=0;j<pl.blobs.length;j++){var rb=await window.__qcBlob(pl.blobs[j].id);if(!rb||rb.size!==pl.blobs[j].blob.size)bad.push('รูป '+pl.blobs[j].id.slice(0,8))}
        if(bad.length)throw new Error('ตรวจย้อนหลังไม่ผ่าน: '+bad.join(', '));
        var log=jget(RECV_K,[]);log.unshift({at:new Date().toISOString(),code:pl.code,from:pl.from,n:todo.length});lsSet(RECV_K,JSON.stringify(log.slice(0,50)));
        body.textContent='';
        body.appendChild(para('นำเข้าสำเร็จ ✓ '+todo.length+' ฉบับ · รูป '+pl.blobs.length+' รูป · ตรวจย้อนหลังแล้วข้อมูลครบ'));
        body.appendChild(el('p',{style:'margin:6px 0'},'รหัสยืนยัน ',el('b',null,pl.code)));
        /* receipt back to the sender, checked in the sender's app (not by reading digits aloud) */
        var rName=el('input',{type:'text',id:'rc-name',value:ls(NAME_K)||'',placeholder:'ชื่อผู้รับ',autocomplete:'name'});
        var rOut=el('pre',{id:'rc-text',style:'white-space:pre-wrap;margin:6px 0;padding:8px;border:1px solid var(--line);border-radius:6px;font:inherit'});
        var mkR=async function(){var nm=rName.value.trim();if(!nm){rOut.textContent='กรอกชื่อผู้รับก่อน';return null}lsSet(NAME_K,nm);var rc=await receiptOf(an.manifest.code,an.manifest.files.map(function(f){return [f.name,f.sha256]}),nm);rOut.textContent=receiptText(an.manifest.code,rc,nm,todo.length+pl.items.filter(function(x){return x.kind==='same'}).length);return rOut.textContent};
        var rShare=el('button',{class:'btn primary',type:'button',id:'rc-share'},'ส่งใบตอบรับกลับ (LINE / อีเมล)');
        rShare.addEventListener('click',async function(){var t=await mkR();if(!t)return;if(navigator.share)navigator.share({text:t}).catch(function(){});else if(navigator.clipboard)navigator.clipboard.writeText(t).catch(function(){})});
        rName.addEventListener('input',function(){mkR()});
        body.appendChild(el('div',{style:'margin:10px 0 0'},el('label',{class:'fl',for:'rc-name'},'ส่งใบตอบรับให้ผู้ส่ง (ผู้ส่งกดยืนยันในแอปได้ทันที)'),rName,rOut));
        body.appendChild(el('div',{class:'rb-actions',style:'margin-top:10px'},rShare,el('button',{class:'btn',type:'button',onclick:closeModal},'ปิด')));
        mkR();
        dmsg('นำเข้าส่งงานแล้ว '+todo.length+' ฉบับ · รหัสยืนยัน '+pl.code);
      }catch(e){
        msg.textContent='นำเข้าไม่สำเร็จ ('+e.message+') ข้อมูลเดิมในเครื่องไม่ถูกแก้ ลองใหม่อีกครั้ง';cancel.disabled=false;
      }
    });
  }

  /* ---------- older backup ZIPs (data.json): now CRC-checked before anything is written ---------- */
  async function legacy(file,z,dmsg){
    dmsg('กำลังตรวจไฟล์สำรอง…');
    var data;
    try{var b=await z.read('data.json');if(!b)throw new Error('no data');data=JSON.parse(await b.text())}
    catch(e){dmsg('นำเข้าไม่สำเร็จ: ไฟล์ไม่ใช่ไฟล์สำรองของแอปนี้ หรือเสียหาย',true);return}
    var bad=[],cache={};
    for(var i=0;i<(data.photos||[]).length;i++){
      var ph=data.photos[i];
      try{var pb=await z.read(ph.file,ph.mime);if(!pb)bad.push(ph.file);else cache[ph.id]=pb}catch(e){bad.push(ph.file)}
    }
    if(bad.length){dmsg('ไม่นำเข้า: ไฟล์รูปเสียหายหรือหายในไฟล์สำรอง '+bad.length+' รูป (ไม่ได้นำเข้าอะไรเลย) เช่น '+bad[0],true);return}
    try{
      var n=await window.__qc.importData(data,function(p){return Promise.resolve(cache[p.id]||null)},function(a,t){if(a%5===0||a===t)dmsg('กำลังนำเข้ารูป '+a+' / '+t)});
      var fr=null;try{fr=await QC.restoreForms(z,data)}catch(e){dmsg('นำเข้าฉบับตรวจงานแล้ว แต่รายงานแบบอื่นในไฟล์สำรองนำเข้าไม่ได้ ('+e.message+')',true);return}
      var listed={};(data.photos||[]).forEach(function(p){listed[p.id]=1});
      var miss=0,seen={};(data.items||[]).forEach(function(it){(it.before||[]).concat(it.after||[]).forEach(function(x){if(x&&!listed[x]&&!seen[x]){seen[x]=1;miss++}})});
      dmsg('นำเข้าแล้ว '+n.inspections+' ฉบับ'+(n.skipped?' (ข้าม '+n.skipped+' ฉบับที่ในเครื่องใหม่กว่า)':'')+' · รูปใหม่ '+n.photos+(n.badPhotos?' · รูปที่ไฟล์เสีย '+n.badPhotos+' รูป':'')+(miss?' · ⚠ ไฟล์สำรองนี้ไม่มีรูปอยู่แล้ว '+miss+' รูป (ขาดมาตั้งแต่ตอนสำรอง)':''),!!(miss||n.badPhotos)+(fr&&(fr.docs||fr.forms)?' · รายงานแบบอื่น '+fr.docs+' ฉบับ แบบฟอร์ม '+fr.forms+' แบบ':''));
    }catch(e){dmsg('นำเข้าไม่สำเร็จ ข้อมูลเดิมไม่ถูกแก้ ลองอีกครั้ง',true)}
  }
  window.__qcImport=async function(file,dmsg){
    dmsg=dmsg||function(){};
    var z;
    try{z=await QC.readZip(file)}catch(e){dmsg('นำเข้าไม่สำเร็จ: อ่านไฟล์ ZIP ไม่ได้ หรือไฟล์ไม่ครบ (อาจถูกตัดตอนส่ง) ให้ผู้ส่งส่งใหม่',true);return}
    if(z.names.indexOf('manifest.json')>=0)return receive(file,dmsg);
    return legacy(file,z,dmsg);
  };
  window.__qcSend={sha256:sha256,sha256js:sha256js,hashDoc:hashDoc,build:build,analyze:analyze,receiptOf:receiptOf,receiptText:receiptText,verifyReceipt:verifyReceipt,markSent:function(pkg){markSent(null,pkg,'test')}};

  /* ---------- send UI ---------- */
  function sentMap(){return jget(SENT_K,{})}
  function markSent(list,pkg,how){
    var m=sentMap(),at=new Date().toISOString();
    pkg.manifest.docs.forEach(function(d){m[d.id]={hash:d.hash,at:at,code:pkg.manifest.code,how:how}});
    lsSet(SENT_K,JSON.stringify(m));
    /* keep what is needed to check the receiver's receipt later (file hashes, not content) */
    var pk=jget(PKGS_K,{});pk[pkg.manifest.code]={at:at,files:pkg.manifest.files.map(function(f){return [f.name,f.sha256]}),n:pkg.manifest.docs.length+(pkg.manifest.forms||[]).length,ids:pkg.manifest.docs.map(function(d){return d.id})};
    var keys=Object.keys(pk).sort(function(a,b){return S(pk[b].at)<S(pk[a].at)?-1:1});keys.slice(100).forEach(function(k){delete pk[k]});
    lsSet(PKGS_K,JSON.stringify(pk));refreshBadge();
  }
  /* ---------- receipt (2.1): proves inside the app that the receiver imported this exact file ----------
     receipt = hash of the package's file hashes + the receiver's name; someone who only heard the 8-digit
     code cannot produce it, and the sender checks it against what was sent */
  function receiptOf(code,files,name){return sha256Text(JSON.stringify(['qc-recv',code,files,S(name).trim()])).then(fmtCode)}
  function receiptText(code,rc,name,n){return 'ใบตอบรับไฟล์ส่งงาน '+code+'\nผู้รับ: '+S(name).trim()+'\nได้รับครบ '+n+' ฉบับ\nรหัสตอบรับ '+rc}
  async function verifyReceipt(text){
    var t=S(text),mc=/ไฟล์ส่งงาน\s+([0-9A-F]{4}-[0-9A-F]{4})/i.exec(t),mr=/รหัสตอบรับ\s+([0-9A-F]{4}-[0-9A-F]{4})/i.exec(t),mn=/ผู้รับ:\s*([^\n]+)/.exec(t);
    if(!mc||!mr||!mn)return {ok:false,msg:'อ่านใบตอบรับไม่ได้ ให้วางข้อความที่ผู้รับส่งกลับมาทั้งหมด'};
    var code=mc[1].toUpperCase(),pk=jget(PKGS_K,{})[code];
    if(!pk)return {ok:false,msg:'ไม่พบไฟล์ส่งงานรหัส '+code+' ที่ส่งจากเครื่องนี้'};
    var want=await receiptOf(code,pk.files,mn[1]);
    if(want!==mr[1].toUpperCase())return {ok:false,msg:'รหัสตอบรับไม่ตรง ผู้รับอาจได้ไฟล์ไม่ครบ หรือได้ไฟล์ฉบับอื่น ให้ส่งไฟล์ใหม่'};
    var at=new Date().toISOString(),all=jget(PKGS_K,{});all[code].ack={by:mn[1].trim(),at:at};lsSet(PKGS_K,JSON.stringify(all));
    var m=sentMap();Object.keys(m).forEach(function(id){if(m[id].code===code)m[id].ack={by:mn[1].trim(),at:at}});lsSet(SENT_K,JSON.stringify(m));refreshBadge();
    return {ok:true,code:code,by:mn[1].trim(),n:pk.n,msg:'ยืนยันแล้ว: '+mn[1].trim()+' ได้รับไฟล์ '+code+' ครบ '+pk.n+' ฉบับ'};
  }
  function saveFile(blob,name){
    var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url)},60000);
  }
  function openSend(){
    var cur=window.__qcForm&&window.__qcForm.cur(),all=(window.__qcDocs?window.__qcDocs():[]).sort(function(a,b){return S(b.data.updatedAt)<S(a.data.updatedAt)?-1:1});
    var sent=sentMap(),sel={};
    var nameIn=el('input',{type:'text',id:'sd-name',value:ls(NAME_K)||'',placeholder:'เช่น สมชาย ใจดี',autocomplete:'name'});
    var codeIn=el('input',{type:'text',id:'sd-code',value:ls(CODE_K)||'',maxlength:'6',placeholder:'เช่น A',autocapitalize:'characters'});
    var extSel=el('select',{id:'sd-ext','aria-label':'นามสกุลไฟล์'},el('option',{value:'zip'},'.zip (ค่าเริ่มต้น)'),el('option',{value:'qcz'},'.qcz (ถ้า LINE/อีเมลไม่รับ .zip)'));extSel.value=ls(EXT_K)==='qcz'?'qcz':'zip';
    var list=el('div',{style:'display:grid;gap:6px;max-height:34vh;overflow:auto;margin:6px 0'});
    var info=el('div',{role:'status',style:'margin:6px 0'}),acts=el('div',{class:'rb-actions',style:'margin-top:10px'});
    var body=el('div',null,
      para('เลือกเอกสารที่จะส่ง ระบบจะสร้างไฟล์ ตรวจความครบถ้วนให้ แล้วค่อยให้กดส่งทาง LINE หรืออีเมล'),
      el('div',{class:'meta'},el('div',null,el('label',{class:'fl',for:'sd-name'},'ชื่อผู้ส่ง'),nameIn),el('div',null,el('label',{class:'fl',for:'sd-code'},'รหัสผู้ตรวจ (กันเลขที่เอกสารซ้ำ)'),codeIn)),
      el('small',{style:'display:block;color:var(--muted)'},'รหัสผู้ตรวจจะนำหน้าเลขที่เอกสารใหม่ เช่น A-INS-006 ผู้ตรวจแต่ละคนใช้รหัสต่างกัน'),
      el('div',{style:'margin-top:8px'},el('label',{class:'fl',for:'sd-ext'},'นามสกุลไฟล์'),extSel),
      el('h2',{style:'font-size:1rem;margin:12px 0 0'},'เอกสาร'),list,info,acts);
    var rcIn=el('textarea',{id:'sd-receipt',rows:'3',placeholder:'วางข้อความใบตอบรับที่ผู้รับส่งกลับมา',style:'width:100%;box-sizing:border-box'}),rcMsg=el('div',{role:'status',id:'sd-receipt-msg',style:'margin:6px 0'});
    var rcBtn=el('button',{class:'btn',type:'button',id:'sd-receipt-ok'},'ตรวจใบตอบรับ');
    rcBtn.addEventListener('click',async function(){var r=await verifyReceipt(rcIn.value);rcMsg.textContent=r.msg;rcMsg.className=r.ok?'':'notice'});
    body.appendChild(el('details',{style:'margin-top:12px'},el('summary',null,'ยืนยันว่าผู้รับได้ไฟล์ครบ (ใบตอบรับ)'),el('div',{style:'margin-top:6px'},rcIn,el('div',{class:'rb-actions',style:'margin-top:6px'},rcBtn),rcMsg)));
    var card=openModal('ส่งเอกสาร',body);
    function counts(){var n=Object.keys(sel).filter(function(k){return sel[k]}).length;go.disabled=!n;go.textContent=n?'สร้างไฟล์ส่ง ('+n+' ฉบับ)':'เลือกเอกสารก่อน'}
    if(!all.length)list.appendChild(el('div',{class:'empty'},'ยังไม่มีเอกสารในเครื่อง'));
    all.forEach(function(x){
      var s=sent[x.id],cb=el('input',{type:'checkbox','aria-label':'เลือก '+titleOf(x.data)});cb.checked=x.id===cur;sel[x.id]=cb.checked;
      cb.addEventListener('change',function(){sel[x.id]=cb.checked;counts()});
      var chips=el('div',{class:'rec-chips'},el('span',null,photosOf(x.data).length+' รูป'));
      var g=gaps(x.data);
      if(g.blank)chips.appendChild(el('span',{class:'c-fix'},'ยังไม่ตรวจ '+g.blank));
      if(g.pend)chips.appendChild(el('span',{class:'c-fix'},'รอตรวจซ้ำ '+g.pend));
      if(s)chips.appendChild(el('span',null,'เคยสร้างไฟล์ส่งแล้ว '+fmtShort(s.at)));
      list.appendChild(el('label',{class:'rec',style:'grid-template-columns:auto minmax(0,1fr);cursor:pointer'},cb,el('span',{style:'min-width:0'},el('span',{class:'rec-t',style:'display:block'},titleOf(x.data)),chips)));
    });
    var go=el('button',{class:'btn primary',type:'button'},'สร้างไฟล์ส่ง');
    var close=el('button',{class:'btn',type:'button',onclick:closeModal},'ปิด');
    acts.appendChild(go);acts.appendChild(close);counts();
    /* documents from the form engine (รายงานประจำวัน ใบขอเท ตรวจรับวัสดุ แบบฟอร์มที่สร้างเอง) */
    if(window.__qcForms)window.__qcForms.listDocs().then(function(fl){
      if(!fl.length)return;
      var emp=list.querySelector('.empty');if(emp)emp.remove();
      fl.forEach(function(d){
        var key='f:'+d.id,t=window.__qcForms.titleOf(d),cb=el('input',{type:'checkbox','aria-label':'เลือก '+t});sel[key]=false;
        cb.addEventListener('change',function(){sel[key]=cb.checked;counts()});
        list.appendChild(el('label',{class:'rec',style:'grid-template-columns:auto minmax(0,1fr);cursor:pointer'},cb,el('span',{style:'min-width:0'},el('span',{class:'rec-t',style:'display:block'},t),el('div',{class:'rec-chips'},el('span',null,'รายงานแบบอื่น')))));
      });
    });
    var gapsConfirmed=false;
    go.addEventListener('click',async function(){
      var nm=nameIn.value.trim();
      if(!nm){info.textContent='กรอกชื่อผู้ส่งก่อน (ให้ผู้รับรู้ว่าไฟล์มาจากใคร)';nameIn.focus();return}
      var idl=Object.keys(sel).filter(function(k){return sel[k]});
      if(!gapsConfirmed){
        var totalGaps=0;idl.forEach(function(id){var d=window.__qcGetDoc(id);if(d){var g=gaps(d);totalGaps+=g.blank+g.pend}});
        if(totalGaps){
          gapsConfirmed=true;
          info.textContent='';
          info.appendChild(errBox('ฉบับที่เลือกยังมีรายการที่ยังไม่ตรวจ/รอตรวจซ้ำรวม '+totalGaps+' รายการ — กด “สร้างไฟล์ส่ง” อีกครั้งถ้าต้องการส่งต่อเลย'));
          go.textContent='ยืนยันส่งทั้งที่ยังไม่ครบ';
          return;
        }
      }
      lsSet(NAME_K,nm);lsSet(CODE_K,codeIn.value.trim().replace(/[^A-Za-z0-9ก-๙]/g,'').slice(0,6));lsSet(EXT_K,extSel.value);
      go.disabled=true;info.textContent='กำลังสร้างและตรวจไฟล์…';info.className='';
      var pkg;
      try{pkg=await build(idl)}catch(e){
        info.textContent='';info.appendChild(errBox(e.user?e.message:'สร้างไฟล์ไม่สำเร็จ: '+e.message,e.list));go.disabled=false;return;
      }
      showReady(body,pkg,extSel.value);
    });
  }
  function showReady(body,pkg,ext){
    body.textContent='';
    var nDocs=pkg.manifest.docs.length+(pkg.manifest.forms||[]).length,fname=('ส่งงาน_'+(nDocs===1?((pkg.manifest.docs[0]&&pkg.manifest.docs[0].docno)||'1ฉบับ'):nDocs+'ฉบับ')+'_'+stamp()).replace(/[\\\/:*?"<>|\s]+/g,'_')+'.'+ext;
    body.appendChild(para('สร้างไฟล์และตรวจแล้ว ✓ ครบ '+nDocs+' ฉบับ · รูป '+pkg.photos+' รูป · ขนาด '+mb(pkg.size)+' MB'));
    body.appendChild(el('p',{style:'margin:6px 0'},'รหัสยืนยัน ',el('b',null,pkg.manifest.code),' (หลังผู้รับนำเข้า แอปผู้รับจะสร้าง “ใบตอบรับ” ให้ส่งกลับ แล้วกด ส่งเอกสาร > ยืนยันว่าผู้รับได้ไฟล์ครบ เพื่อตรวจในแอป)'));
    body.appendChild(el('p',{style:'margin:6px 0;color:var(--muted)'},'ไฟล์: '+fname));
    if(pkg.size>BIG)body.appendChild(errBox('ไฟล์ใหญ่ '+mb(pkg.size)+' MB อีเมลหรือ LINE อาจรับไม่ได้ แนะนำให้กลับไปเลือกส่งทีละฉบับ'));
    var msg=el('div',{role:'status',style:'margin:8px 0'});
    var type=ext==='zip'?'application/zip':'application/octet-stream';
    var shareBtn=el('button',{class:'btn primary',type:'button'},'ส่ง… (LINE / อีเมล)');
    var saveBtn=el('button',{class:'btn',type:'button'},'บันทึกไฟล์ (แล้วแนบเอง)');
    shareBtn.addEventListener('click',function(){
      var file;try{file=new File([pkg.blob],fname,{type:type})}catch(e){file=null}
      if(!file||!navigator.share||(navigator.canShare&&!navigator.canShare({files:[file]}))){
        msg.textContent='เครื่องนี้ส่งไฟล์ผ่านหน้าต่างแชร์ไม่ได้ จึงบันทึกไฟล์ให้ ให้ไปแนบในแชตหรืออีเมลเอง';saveFile(pkg.blob,fname);markSent(null,pkg,'save');return;
      }
      navigator.share({files:[file],title:'ส่งงาน '+pkg.manifest.code}).then(function(){
        markSent(null,pkg,'share');
        msg.textContent='สร้างไฟล์และส่งเข้าหน้าต่างแชร์แล้ว (แอปรู้ไม่ได้ว่าปลายทางได้รับหรือยัง) ให้ผู้รับยืนยันรหัส '+pkg.manifest.code;
      },function(e){
        if(e&&e.name==='AbortError'){msg.textContent='ยกเลิกการส่ง ยังไม่มีการทำเครื่องหมายว่าส่งแล้ว';return}
        msg.textContent='ส่งผ่านหน้าต่างแชร์ไม่สำเร็จ ('+(e&&e.name||'error')+') จึงบันทึกไฟล์ให้ ให้ไปแนบเอง';saveFile(pkg.blob,fname);markSent(null,pkg,'save');
      });
    });
    saveBtn.addEventListener('click',function(){saveFile(pkg.blob,fname);markSent(null,pkg,'save');msg.textContent='บันทึกไฟล์แล้ว ดูที่แอป Files/ดาวน์โหลด แล้วแนบในแชตหรืออีเมล ให้ผู้รับยืนยันรหัส '+pkg.manifest.code});
    body.appendChild(msg);
    body.appendChild(el('div',{class:'rb-actions'},shareBtn,saveBtn,el('button',{class:'btn',type:'button',onclick:closeModal},'ปิด')));
    shareBtn.focus();
  }

  /* ---------- sent / edited-after-send badge ---------- */
  var badge=null,bt=null;
  async function refreshBadge(){
    if(!badge||!window.__qcForm)return;
    var id=window.__qcForm.cur(),s=sentMap()[id],d=window.__qcGetDoc&&window.__qcGetDoc(id);
    if(!s||!d){badge.hidden=true;return}
    var h=await hashDoc(d);badge.hidden=false;
    if(h===s.hash){badge.className='badge sub';badge.textContent=(s.ack?'ผู้รับยืนยันแล้ว ('+s.ack.by+') · ':'สร้างไฟล์ส่งแล้ว · รอใบตอบรับ · ')+s.code}
    else{badge.className='badge draft';badge.textContent='แก้ไขหลังส่ง · ส่งใหม่ได้'}
  }
  function mount(){
    var acts=$('.rb .rb-actions')||$('.rb-actions'),bd=$('#badge');if(!acts||!bd||!window.__qcDocs)return;
    var btn=el('button',{class:'btn primary',id:'btn-send',type:'button',title:'สร้างไฟล์ส่งงาน (ตรวจความครบถ้วน) แล้วส่งทาง LINE หรืออีเมล'},'ส่งเอกสาร');
    btn.addEventListener('click',openSend);acts.insertBefore(btn,acts.firstChild);
    badge=el('span',{class:'badge',id:'qc-sentbadge',hidden:true});bd.parentNode.appendChild(badge);
    window.addEventListener('qc-change',function(){clearTimeout(bt);bt=setTimeout(refreshBadge,400)});
    document.addEventListener('focusout',function(){clearTimeout(bt);bt=setTimeout(refreshBadge,900)});
    refreshBadge();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(mount,0)});else setTimeout(mount,0);
})();
