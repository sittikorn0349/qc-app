/* Form engine: forms described as data (a list of widgets), filled on screen, saved on this device, exported to an A4 PDF.
   Built-in forms (daily report, pour permit, material receiving) and forms people build themselves share one renderer.
   The original inspection form (index.html) and the safety form stay as they are; the home "สร้างรายงาน" picker lists all of them.
   Public API: window.__qcForms = { builtins, customs(), get(id), newDoc(formId), openDoc(id), library(), builder(formId|null, copyFrom) } */
(function(){
  'use strict';
  var U=window.QCU;  /* shared helpers: pwa-util.js */
  var $=U.$,el=U.el,ls=U.ls,lsSet=U.lsSet,clone=U.clone;
  /* ---------- helpers ---------- */
  function uid(p){return (p||'')+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
  function today(){var d=new Date(),p=function(n){return String(n).padStart(2,'0')};return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())}
  function fmtDate(iso){if(!iso)return '';var p=String(iso).split('-');if(p.length!==3)return iso;return (+p[2])+'/'+(+p[1])+'/'+(+p[0]+543)}
  function lines(s){return String(s||'').split('\n').map(function(x){return x.trim()}).filter(Boolean)}
  function status(t){var s=$('#qcf-status');if(s)s.textContent=t||''}

  /* ---------- storage (IndexedDB, own database so the original form's data is untouched) ---------- */
  var dbP=null;
  function db(){
    if(dbP)return dbP;
    dbP=new Promise(function(res,rej){
      var r=indexedDB.open('qc-forms',1);
      r.onupgradeneeded=function(){var d=r.result;if(!d.objectStoreNames.contains('docs'))d.createObjectStore('docs',{keyPath:'id'});if(!d.objectStoreNames.contains('forms'))d.createObjectStore('forms',{keyPath:'id'})};
      r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)};
    });
    return dbP;
  }
  function tx(store,mode,fn){return db().then(function(d){return new Promise(function(res,rej){var t=d.transaction(store,mode),s=t.objectStore(store),out=fn(s);t.oncomplete=function(){res(out&&out.result!==undefined?out.result:out)};t.onerror=function(){rej(t.error)}})})}
  function all(store){return tx(store,'readonly',function(s){return s.getAll()})}
  function put(store,v){return tx(store,'readwrite',function(s){s.put(v)})}
  function del(store,id){return tx(store,'readwrite',function(s){s.delete(id)})}

  /* ---------- widget catalogue (also the builder palette) ---------- */
  var WIDGETS={
    heading:{name:'หัวข้อ',desc:'ชื่อส่วนของเอกสาร',make:function(){return {label:'หัวข้อใหม่'}}},
    fields:{name:'ช่องข้อมูล',desc:'ชุดช่องกรอก เช่น โครงการ วันที่ ตำแหน่ง',make:function(){return {label:'ข้อมูลทั่วไป',fields:[{label:'โครงการ',type:'text',auto:'project'},{label:'เลขที่เอกสาร',type:'text',auto:'docno'},{label:'วันที่',type:'date',auto:'date'}]}}},
    text:{name:'ข้อความ',desc:'ช่องพิมพ์ยาว เช่น หมายเหตุ ปัญหา',make:function(){return {label:'หมายเหตุ',multiline:true}}},
    choice:{name:'ตัวเลือก',desc:'เลือกได้ 1 ข้อ เช่น ผลการพิจารณา',make:function(){return {label:'ผลการพิจารณา',options:['ผ่าน','ผ่านโดยมีเงื่อนไข','ไม่ผ่าน']}}},
    checklist:{name:'เช็กลิสต์',desc:'รายการตรวจ กดผล ผ่าน/ไม่ผ่าน ต่อข้อ',make:function(){return {label:'รายการตรวจ',items:['รายการที่ 1','รายการที่ 2'],options:['ผ่าน','ไม่ผ่าน','ไม่เกี่ยว'],note:true}}},
    table:{name:'ตาราง',desc:'กรอกเป็นแถว เช่น แรงงาน เครื่องจักร',make:function(){return {label:'ตาราง',columns:[{label:'รายการ',type:'text'},{label:'จำนวน',type:'number'}],rows:[]}}},
    photos:{name:'รูปถ่าย',desc:'แนบรูปพร้อมคำบรรยาย',make:function(){return {label:'รูปประกอบ',caption:true}}},
    signatures:{name:'ลงนาม',desc:'ช่องลงนามหลายฝ่าย',make:function(){return {label:'ลงนาม',roles:['ผู้ตรวจ','ผู้ควบคุมงาน']}}},
    note:{name:'ข้อความคงที่',desc:'คำอธิบายที่พิมพ์ลงเอกสาร',make:function(){return {label:'',text:'ข้อความอธิบาย'}}}
  };
  var AUTO={project:'โครงการ (ล่าสุด)',docno:'เลขที่รันอัตโนมัติ',date:'วันนี้',inspector:'ชื่อผู้กรอก'};

  /* ---------- built-in forms ---------- */
  function W(type,props){var w=Object.assign({id:'w'+(++W.n),type:type},props);return w}W.n=0;
  var HEAD=function(extra){return W('fields',{label:'ข้อมูลทั่วไป',fields:[{label:'โครงการ',type:'text',auto:'project'},{label:'เลขที่เอกสาร',type:'text',auto:'docno'},{label:'วันที่',type:'date',auto:'date'}].concat(extra||[])})};
  var BUILTINS=[
    {id:'daily',name:'รายงานประจำวัน',sub:'แรงงาน เครื่องจักร งานที่ทำ ปัญหา รูป',short:'DR',builtin:true,widgets:[
      HEAD([{label:'สภาพอากาศ เช้า',type:'select',options:['แดด','เมฆมาก','ฝนตกเล็กน้อย','ฝนตกหนัก']},{label:'สภาพอากาศ บ่าย',type:'select',options:['แดด','เมฆมาก','ฝนตกเล็กน้อย','ฝนตกหนัก']},{label:'ผู้รายงาน',type:'text',auto:'inspector'}]),
      W('table',{label:'แรงงาน',columns:[{label:'ประเภทช่าง',type:'text'},{label:'จำนวน (คน)',type:'number'},{label:'หมายเหตุ',type:'text'}],rows:[['ช่างไม้','',''],['ช่างเหล็ก','',''],['ช่างปูน','',''],['กรรมกร','','']]}),
      W('table',{label:'เครื่องจักร / อุปกรณ์',columns:[{label:'รายการ',type:'text'},{label:'จำนวน',type:'number'},{label:'ชั่วโมงใช้งาน',type:'number'}],rows:[]}),
      W('table',{label:'งานที่ทำวันนี้',columns:[{label:'ตำแหน่ง / โซน',type:'text'},{label:'รายละเอียดงาน',type:'text'},{label:'ความคืบหน้า (%)',type:'number'}],rows:[]}),
      W('text',{label:'ปัญหา / อุปสรรค',multiline:true}),
      W('text',{label:'แผนงานพรุ่งนี้',multiline:true}),
      W('photos',{label:'รูปประกอบ',caption:true}),
      W('signatures',{label:'ลงนาม',roles:['ผู้รายงาน','ผู้ควบคุมงาน']})]},
    {id:'pour',name:'ใบขออนุญาตเทคอนกรีต',sub:'ตรวจความพร้อมก่อนเท และอนุมัติ 3 ฝ่าย',short:'PP',builtin:true,widgets:[
      HEAD([{label:'ตำแหน่งที่เท',type:'text'},{label:'เวลาเริ่มเท',type:'text'},{label:'ปริมาณ (ลบ.ม.)',type:'number'},{label:'กำลังอัด (ksc)',type:'text'},{label:'ผู้ผลิตคอนกรีต',type:'text'},{label:'ค่ายุบตัวที่กำหนด (ซม.)',type:'text'}]),
      W('checklist',{label:'ตรวจความพร้อมก่อนเท',options:['พร้อม','ไม่พร้อม','ไม่เกี่ยว'],note:true,items:['เหล็กเสริมตรวจผ่านแล้ว (ระบุเลขใบตรวจในหมายเหตุ)','ระยะหุ้ม / ลูกปูนครบ','แบบหล่อแข็งแรง ได้แนวและระดับ ไม่รั่ว','ค้ำยันมั่นคง ตรวจแล้ว','ท่อและงานระบบที่ฝังติดตั้งและตรวจแล้ว','ทำความสะอาดแบบหล่อ ไม่มีเศษวัสดุหรือน้ำขัง','เครื่องจี้ ปั๊ม ไฟส่องสว่าง พร้อมและมีสำรอง','เตรียมแบบหล่อตัวอย่างและกรวยวัดค่ายุบตัว','สภาพอากาศเหมาะสม']}),
      W('photos',{label:'รูปความพร้อมก่อนเท',caption:true}),
      W('choice',{label:'ผลการพิจารณา',options:['อนุญาตให้เท','อนุญาตโดยมีเงื่อนไข','ไม่อนุญาต']}),
      W('text',{label:'เงื่อนไข / หมายเหตุ',multiline:true}),
      W('signatures',{label:'ลงนาม',roles:['ผู้รับเหมา (ผู้ขอ)','วิศวกรผู้ควบคุมงาน','ผู้แทนเจ้าของงาน']})]},
    {id:'material',name:'บันทึกตรวจรับวัสดุ',sub:'ตรวจวัสดุเข้าหน้างานตามสเปก',short:'MR',builtin:true,widgets:[
      HEAD([{label:'ชื่อวัสดุ',type:'text'},{label:'ผู้จำหน่าย',type:'text'},{label:'เลขที่ใบส่งของ',type:'text'},{label:'จำนวนที่ส่ง',type:'number'},{label:'หน่วย',type:'text'}]),
      W('checklist',{label:'ตรวจรับ',options:['ผ่าน','ไม่ผ่าน','ไม่เกี่ยว'],note:true,items:['ชนิด ขนาด ยี่ห้อ ตรงตามข้อกำหนดหรือที่อนุมัติ','จำนวนตรงกับใบส่งของ','มีใบรับรองหรือผลทดสอบจากผู้ผลิต','สภาพดี ไม่ชำรุด ไม่เป็นสนิม ไม่เปียกชื้น','กองเก็บถูกวิธี ยกพ้นพื้น มีผ้าคลุม']}),
      W('photos',{label:'รูปวัสดุ / ป้ายสินค้า / ใบส่งของ',caption:true}),
      W('choice',{label:'ผลการตรวจรับ',options:['รับ','รับบางส่วน','ไม่รับ / ส่งคืน']}),
      W('text',{label:'หมายเหตุ',multiline:true}),
      W('signatures',{label:'ลงนาม',roles:['ผู้ตรวจรับ','ผู้ส่งของ']})]}
  ];
  var CUSTOM=[];
  function loadCustom(){return all('forms').then(function(a){CUSTOM=a.sort(function(x,y){return (y.updatedAt||'').localeCompare(x.updatedAt||'')});return CUSTOM}).catch(function(){return CUSTOM})}
  function get(id){return BUILTINS.concat(CUSTOM).filter(function(f){return f.id===id})[0]}

  /* ---------- documents ---------- */
  function blankValue(w){
    switch(w.type){
      case 'fields':var o={};(w.fields||[]).forEach(function(f,i){o[i]=''});return o;
      case 'checklist':return (w.items||[]).map(function(){return {r:'',n:''}});
      case 'table':return (w.rows&&w.rows.length?clone(w.rows):[(w.columns||[]).map(function(){return ''})]);
      case 'photos':return [];
      case 'signatures':var s={};(w.roles||[]).forEach(function(r,i){s[i]={name:'',date:''}});return s;
      default:return '';
    }
  }
  function autoVal(a,form,docs){
    if(a==='date')return today();
    if(a==='inspector')return ls('qc-sender-name')||'';
    if(a==='project'){var m=$('#m-project');return ls('qcf-last-project')||(m&&m.value)||''}
    if(a==='docno'){
      var code=(ls('qc-code')||'').trim(),n=docs.filter(function(d){return d.formId===form.id}).length+1;
      return (code?code+'-':'')+(form.short||'F')+'-'+String(n).padStart(3,'0');
    }
    return '';
  }
  function newDoc(formId){
    var form=get(formId);if(!form)return Promise.reject(new Error('form'));
    return all('docs').then(function(docs){
      var v={};
      form.widgets.forEach(function(w){
        v[w.id]=blankValue(w);
        if(w.type==='fields')(w.fields||[]).forEach(function(f,i){if(f.auto)v[w.id][i]=autoVal(f.auto,form,docs)});
      });
      var d={id:uid('f'),formId:form.id,form:clone(form),values:v,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      return put('docs',d).then(function(){return d});
    });
  }
  function titleOf(d){
    var f=d.form,head=f.widgets.filter(function(w){return w.type==='fields'})[0],v=head?d.values[head.id]||{}:{},no='',pj='';
    if(head)head.fields.forEach(function(x,i){if(x.auto==='docno')no=v[i];if(x.auto==='project')pj=v[i]});
    return {name:f.name,no:no||'',project:pj||'',date:d.updatedAt};
  }

  /* ---------- overlay shell ---------- */
  var CSS=[
    '#qcf{position:fixed;inset:0;z-index:55;background:var(--bg);overflow:auto;-webkit-overflow-scrolling:touch}',
    '#qcf .qf-in{max-width:1100px;margin:0 auto;padding:0 max(16px,env(safe-area-inset-left,0px)) 40px;display:flex;flex-direction:column;gap:16px}',
    '#qcf .qf-bar{position:sticky;top:0;z-index:3;background:var(--bg);display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--line)}',
    '#qcf .qf-bar h1{flex:1 1 12rem;min-width:0;font-size:1.15rem;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#qcf .qf-st{font-size:.8rem;color:var(--muted);flex:1 1 100%}',
    '#qcf .qg{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}',
    '#qcf .qseg{display:flex;flex-wrap:wrap;gap:6px}#qcf .qseg button{min-height:38px;padding:0 12px;border-radius:6px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font:inherit}',
    '#qcf .qseg button[aria-pressed=true]{border-color:var(--accent);background:var(--accent);color:var(--accent-fg);font-weight:600}',
    '#qcf .qseg button[aria-pressed=true].r-bad{background:var(--bad-bg);color:var(--bad);border-color:var(--bad)}',
    '#qcf .qseg button[aria-pressed=true].r-ok{background:var(--ok-bg);color:var(--ok);border-color:var(--ok)}',
    '#qcf .qseg button[aria-pressed=true].r-na{background:var(--surface);color:var(--muted);border-color:var(--muted)}',
    '#qcf .qck{display:grid;grid-template-columns:2.2rem minmax(0,1.6fr) auto minmax(0,1fr);gap:10px;align-items:start;padding:10px 0;border-top:1px solid var(--line)}',
    '#qcf .qck .qno{grid-column:1;grid-row:1;color:var(--accent);font-weight:700;padding-top:6px}#qcf .qck .qtx{padding-top:6px;min-width:0}',
    '@media (max-width:720px){#qcf .qck{grid-template-columns:2rem minmax(0,1fr)}#qcf .qck>.qtx{grid-column:2;grid-row:1}#qcf .qck>.qseg{grid-column:2;grid-row:2}#qcf .qck>input{grid-column:2;grid-row:3}}',
    '#qcf table.qt{width:100%;border-collapse:collapse}#qcf table.qt th{font-size:.78rem;color:var(--muted);text-align:left;font-weight:500;padding:4px}#qcf table.qt td{padding:4px;vertical-align:top}',
    '#qcf .qtw{overflow-x:auto}#qcf table.qt input{min-width:6rem}',
    '#qcf .qph{display:flex;flex-wrap:wrap;gap:10px}#qcf .qph figure{margin:0;width:150px;display:flex;flex-direction:column;gap:4px}',
    '#qcf .qph img{width:150px;height:112px;object-fit:cover;border-radius:6px;border:1px solid var(--line)}',
    '#qcf .qph .add{width:150px;height:112px;border:1px dashed var(--line);border-radius:6px;background:transparent;color:var(--fg);font:inherit}',
    '#qcf .qsg{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}#qcf .qsg>div{border:1px solid var(--line);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px}',
    '#qcf .qsg .ln{height:44px;border-bottom:1px solid var(--muted);font-size:.75rem;color:var(--muted);display:flex;align-items:flex-end;justify-content:center}',
    '#qcf .qnote{color:var(--muted);white-space:pre-wrap}',
    '#qcf .qlist{display:flex;flex-direction:column;gap:8px}#qcf .qrow{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface)}',
    '#qcf .qrow b{display:block}#qcf .qrow small{color:var(--muted)}#qcf .qrow .grow{flex:1 1 14rem;min-width:0}',
    '#qcf .qb-pal{display:flex;flex-wrap:wrap;gap:8px}#qcf .qb-pal button{flex:1 1 9.5rem;text-align:left;min-height:56px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--fg);font:inherit}',
    '#qcf .qb-pal small{display:block;color:var(--muted);font-size:.75rem}',
    '#qcf .qb-w{border:1px solid var(--line);border-radius:10px;background:var(--surface);padding:12px;display:flex;flex-direction:column;gap:8px}',
    '#qcf .qb-w header{display:flex;align-items:center;gap:8px}#qcf .qb-w header b{flex:1}#qcf .qb-w .tag{font-size:.72rem;padding:2px 8px;border-radius:10px;background:var(--bg);color:var(--muted)}',
    '#qcf .qb-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}#qcf .qb-row>*{flex:1 1 10rem}',
    '#qcf .qhelp{font-size:.8rem;color:var(--muted)}',
    '#qcf .qb-chk{display:flex;align-items:center;gap:8px;font-size:.9rem}#qcf .qb-chk input{width:20px;height:20px;flex:0 0 auto}',
    '#qcf-pdf{position:fixed;left:-10000px;top:0}.qcf-sheet{width:794px;height:1123px;background:#fff;color:#111;padding:40px 44px;box-sizing:border-box;font-family:var(--font);font-size:13px;line-height:1.45;position:relative;overflow:hidden}',
    '.qcf-sheet h1{font-size:20px;margin:0 0 4px;text-align:center}.qcf-sheet .xsub{text-align:center;color:#555;font-size:12px;margin-bottom:10px}',
    '.qcf-sheet h2{font-size:14px;margin:12px 0 6px;padding-bottom:3px;border-bottom:1.5px solid #333}',
    '.qcf-sheet table{width:100%;border-collapse:collapse}.qcf-sheet td,.qcf-sheet th{border:1px solid #999;padding:4px 6px;vertical-align:top;text-align:left}.qcf-sheet th{background:#eee;font-weight:600}',
    '.qcf-sheet .xkv td:nth-child(odd){background:#f5f5f5;width:18%;color:#333}.qcf-sheet th{color:#111!important;background:#e9ecef!important}',
    '.qcf-sheet .xph{display:flex;flex-wrap:wrap;gap:8px}.qcf-sheet .xph figure{margin:0;width:226px}.qcf-sheet .xph img{width:226px;height:170px;object-fit:cover;border:1px solid #999}.qcf-sheet figcaption{font-size:11px;color:#333}',
    '.qcf-sheet .xsg{display:flex;gap:10px}.qcf-sheet .xsg>div{flex:1;border:1px solid #999;padding:8px;text-align:center}.qcf-sheet .xsg .xln{height:40px;border-bottom:1px dotted #333;margin-bottom:4px}',
    '.qcf-sheet .pn{position:absolute;left:44px;right:44px;bottom:18px;display:flex;justify-content:space-between;font-size:11px;color:#555}',
    '.qcf-sheet .runhead{display:flex;justify-content:space-between;font-size:11px;color:#555;border-bottom:1px solid #999;padding-bottom:4px;margin-bottom:8px}',
    '.qcf-sheet .xchk{font-weight:600}.qcf-sheet .xbad{color:#b0261f}.qcf-sheet .xok{color:#1b7545}'
  ].join('\n');
  var root=null,cur=null,saveT=null;
  function ensureRoot(){
    if(!$('#qcf-css')){var st=el('style',{id:'qcf-css'});st.textContent=CSS;document.head.appendChild(st)}
    if(!root){root=el('div',{id:'qcf',role:'region','aria-label':'แบบฟอร์ม'});document.body.appendChild(root)}
    root.hidden=false;root.textContent='';root.scrollTop=0;document.body.style.overflow='hidden';
    return root;
  }
  function close(){
    flush();if(root){root.hidden=true;root.textContent=''}document.body.style.overflow='';cur=null;
    try{window.dispatchEvent(new Event('qc-change'))}catch(e){}
  }
  function bar(title,btns,back){
    var b=el('button',{type:'button',class:'btn',id:'qcf-back'},'‹ '+(back||'หน้าแรก'));b.onclick=close;
    return el('div',{class:'qf-bar noprint'},b,el('h1',null,title),btns||null,el('div',{class:'qf-st',id:'qcf-status',role:'status','aria-live':'polite'}));
  }
  function btn(t,fn,cls,attrs){var b=el('button',Object.assign({type:'button',class:'btn'+(cls?' '+cls:'')},attrs||{}),t);b.onclick=fn;return b}

  /* ---------- fill view ---------- */
  function touch(){
    if(!cur)return;cur.updatedAt=new Date().toISOString();
    clearTimeout(saveT);saveT=setTimeout(flush,400);status('กำลังบันทึก…');
  }
  function flush(){
    clearTimeout(saveT);saveT=null;if(!cur||!cur.__dirty||!cur.id)return;var d=cur;d.__dirty=false;
    var head=d.form.widgets.filter(function(w){return w.type==='fields'})[0];
    if(head)head.fields.forEach(function(f,i){if(f.auto==='project'&&d.values[head.id][i])lsSet('qcf-last-project',d.values[head.id][i])});
    var rec=Object.assign({},d);delete rec.__dirty;
    put('docs',rec).then(function(){status('บันทึกในเครื่องแล้ว '+new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}))},function(){status('บันทึกไม่สำเร็จ')});
  }
  function setV(fn){fn(cur.values);cur.__dirty=true;touch()}
  function inp(type,value,onchange,attrs){
    var i=el(type==='textarea'?'textarea':'input',Object.assign(type==='textarea'?{rows:3}:{type:type==='number'?'text':type,inputmode:type==='number'?'decimal':null},attrs||{}));
    i.value=value==null?'':value;
    i.addEventListener('input',function(){onchange(i.value)});
    return i;
  }
  function seg(options,value,onpick,label){
    var g=el('div',{class:'qseg',role:'group','aria-label':label});
    options.forEach(function(o,k){
      var cls=/ไม่เกี่ยว/.test(o)?'r-na':/^ไม่/.test(o)?'r-bad':k===0?'r-ok':'';
      var b=el('button',{type:'button',class:cls,'aria-pressed':value===o?'true':'false'},o);
      b.onclick=function(){var nv=b.getAttribute('aria-pressed')==='true'?'':o;onpick(nv);[].forEach.call(g.children,function(x){x.setAttribute('aria-pressed',x===b&&nv?'true':'false')})};
      g.appendChild(b);
    });
    return g;
  }
  function readPhoto(file){
    return new Promise(function(res,rej){
      var r=new FileReader();r.onerror=rej;r.onload=function(){
        var img=new Image();img.onerror=rej;img.onload=function(){
          var m=1600,s=Math.min(1,m/Math.max(img.width,img.height)),c=document.createElement('canvas');
          c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
          res(c.toDataURL('image/jpeg',0.82));
        };img.src=r.result;
      };r.readAsDataURL(file);
    });
  }
  function renderWidget(w,v,preview){
    var sec=el('section',{class:'card','data-w':w.id,'data-type':w.type});
    var title=w.label?el('h2',null,w.label):null;
    switch(w.type){
      case 'heading':return el('h2',{class:'qf-heading',style:'margin:8px 0 0;font-size:1.1rem'},w.label||'');
      case 'note':sec.appendChild(title);sec.appendChild(el('div',{class:'qnote'},w.text||''));return sec;
      case 'fields':
        sec.appendChild(title);
        var g=el('div',{class:'qg'});
        (w.fields||[]).forEach(function(f,i){
          var id='qf-'+w.id+'-'+i,c;
          if(f.type==='select'){c=el('select',{id:id},el('option',{value:''},'— เลือก —'),(f.options||[]).map(function(o){return el('option',{value:o},o)}));c.value=v[i]||'';c.onchange=function(){setV(function(V){V[w.id][i]=c.value})}}
          else c=inp(f.type==='date'?'date':f.type==='number'?'number':'text',v[i],function(x){setV(function(V){V[w.id][i]=x})},{id:id});
          g.appendChild(el('div',null,el('label',{class:'fl','for':id},f.label),c));
        });
        sec.appendChild(g);return sec;
      case 'text':
        sec.appendChild(el('label',{class:'fl','for':'qf-'+w.id,style:'font-size:1rem;color:var(--fg);font-weight:600;margin-bottom:8px'},w.label));
        sec.appendChild(inp(w.multiline?'textarea':'text',v,function(x){setV(function(V){V[w.id]=x})},{id:'qf-'+w.id}));return sec;
      case 'choice':
        sec.appendChild(title);sec.appendChild(seg(w.options||[],v,function(x){setV(function(V){V[w.id]=x})},w.label));return sec;
      case 'checklist':
        var cnt=el('span',{class:'qhelp',style:'margin-left:8px;font-weight:400'});
        function upd(){var n=v.filter(function(x){return x.r}).length,b=v.filter(function(x){return x.r===(w.options||[])[1]}).length;cnt.textContent='ตรวจแล้ว '+n+'/'+v.length+(b?' · '+(w.options||[])[1]+' '+b:'')}
        sec.appendChild(el('h2',null,w.label||'',cnt));
        (w.items||[]).forEach(function(it,i){
          var row=v[i]||(v[i]={r:'',n:''});
          var r=el('div',{class:'qck'},el('span',{class:'qno'},String(i+1)),el('div',{class:'qtx'},it),
            seg(w.options||[],row.r,function(x){setV(function(){row.r=x});upd()},'ผล '+it));
          if(w.note!==false)r.appendChild(inp('text',row.n,function(x){setV(function(){row.n=x})},{'aria-label':'หมายเหตุ '+it,placeholder:'หมายเหตุ'}));
          sec.appendChild(r);
        });
        upd();return sec;
      case 'table':
        sec.appendChild(title);
        var cols=w.columns||[],tb=el('tbody');
        function drawRows(){
          tb.textContent='';
          v.forEach(function(row,ri){
            var tr=el('tr');
            cols.forEach(function(c,ci){tr.appendChild(el('td',null,inp(c.type==='number'?'number':'text',row[ci],function(x){setV(function(){row[ci]=x})},{'aria-label':c.label+' แถวที่ '+(ri+1)})))});
            var d=btn('ลบ',function(){setV(function(){v.splice(ri,1)});drawRows()},'sm',{'aria-label':'ลบแถวที่ '+(ri+1)});
            tr.appendChild(el('td',{style:'width:1%'},d));tb.appendChild(tr);
          });
        }
        drawRows();
        sec.appendChild(el('div',{class:'qtw'},el('table',{class:'qt'},el('thead',null,el('tr',null,cols.map(function(c){return el('th',null,c.label)}),el('th',null,''))),tb)));
        sec.appendChild(btn('+ เพิ่มแถว',function(){setV(function(){v.push(cols.map(function(){return ''}))});drawRows();var l=tb.lastChild&&tb.lastChild.querySelector('input');if(l)l.focus()},'sm',{style:'align-self:flex-start;margin-top:8px'}));
        return sec;
      case 'photos':
        sec.appendChild(title);
        var wrap=el('div',{class:'qph'}),file=el('input',{type:'file',accept:'image/*',multiple:true,hidden:true,'aria-label':'เลือกรูป'});
        function drawPh(){
          wrap.textContent='';
          v.forEach(function(p,i){
            var f=el('figure',null,el('img',{src:p.d,alt:p.c||('รูปที่ '+(i+1))}));
            if(w.caption!==false)f.appendChild(inp('text',p.c,function(x){setV(function(){p.c=x})},{'aria-label':'คำบรรยายรูปที่ '+(i+1),placeholder:'คำบรรยาย'}));
            f.appendChild(btn('ลบรูป',function(){setV(function(){v.splice(i,1)});drawPh()},'sm'));
            wrap.appendChild(f);
          });
          var add=el('button',{type:'button',class:'add'},'+ เพิ่มรูป');add.onclick=function(){file.click()};wrap.appendChild(add);
        }
        file.onchange=function(){
          var fs=[].slice.call(file.files||[]);file.value='';status('กำลังย่อรูป…');
          fs.reduce(function(p,f){return p.then(function(){return readPhoto(f).then(function(d){setV(function(){v.push({d:d,c:''})})})})},Promise.resolve()).then(drawPh,function(){status('อ่านรูปไม่ได้')});
        };
        drawPh();sec.appendChild(wrap);sec.appendChild(file);return sec;
      case 'signatures':
        sec.appendChild(title);
        var sg=el('div',{class:'qsg'});
        (w.roles||[]).forEach(function(r,i){
          var s=v[i]||(v[i]={name:'',date:''});
          sg.appendChild(el('div',null,el('b',null,r),el('div',{class:'ln'},'ลายมือชื่อ (ลงบนเอกสารที่พิมพ์)'),
            inp('text',s.name,function(x){setV(function(){s.name=x})},{'aria-label':'ชื่อ-สกุล '+r,placeholder:'ชื่อ-สกุล'}),
            inp('date',s.date,function(x){setV(function(){s.date=x})},{'aria-label':'วันที่ '+r})));
        });
        sec.appendChild(sg);return sec;
    }
    return sec;
  }
  function openDoc(id){
    return all('docs').then(function(docs){
      var d=docs.filter(function(x){return x.id===id})[0];if(!d){status('ไม่พบฉบับนี้');return}
      fill(d);
    });
  }
  function fill(d){
    cur=d;var r=ensureRoot(),t=titleOf(d);
    var pdf=btn('Plot PDF',function(){exportPdf(d)},'primary',{id:'qcf-pdf-btn'});
    var lib=btn('ฉบับอื่น',function(){flush();library()});
    var inner=el('div',{class:'qf-in'},bar(t.name+(t.no?' · '+t.no:''),[lib,pdf]),
      el('h1',{style:'margin:4px 0 0;font-size:1.5rem'},d.form.name));
    d.form.widgets.forEach(function(w){
      if(d.values[w.id]===undefined)d.values[w.id]=blankValue(w);
      inner.appendChild(renderWidget(w,d.values[w.id]));
    });
    inner.appendChild(el('div',{class:'card',style:'display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end'},btn('Plot PDF',function(){exportPdf(d)},'primary')));
    r.appendChild(inner);status('บันทึกในเครื่องนี้อัตโนมัติ');
    var first=r.querySelector('input,textarea,select');if(first&&first.focus)try{first.focus({preventScroll:true})}catch(e){}
  }

  /* ---------- library of documents made with these forms ---------- */
  function library(){
    var r=ensureRoot(),list=el('div',{class:'qlist'});
    r.appendChild(el('div',{class:'qf-in'},bar('รายงานแบบอื่น',[btn('+ สร้างรายงาน',function(){close();if(window.__qcHome&&window.__qcHome.picker)window.__qcHome.picker()},'primary')]),
      el('p',{class:'qhelp',style:'margin:0'},'ฉบับที่ทำด้วยแบบฟอร์มสำเร็จรูปหรือแบบฟอร์มที่สร้างเอง · เก็บในเครื่องนี้'),list));
    all('docs').then(function(docs){
      docs.sort(function(a,b){return (b.updatedAt||'').localeCompare(a.updatedAt||'')});
      if(!docs.length){list.appendChild(el('div',{class:'qhelp'},'ยังไม่มีฉบับ กด “+ สร้างรายงาน” เพื่อเริ่ม'));return}
      docs.forEach(function(d){
        var t=titleOf(d),dl=btn('ลบ',function(){
          if(!dl.classList.contains('armed')){dl.classList.add('armed');dl.textContent='ยืนยันลบ?';setTimeout(function(){dl.classList.remove('armed');dl.textContent='ลบ'},3000);return}
          del('docs',d.id).then(function(){row.remove();status('ลบแล้ว')});
        },'sm');
        var row=el('div',{class:'qrow'},el('div',{class:'grow'},el('b',null,t.name+(t.no?' · '+t.no:'')),el('small',null,(t.project||'ไม่ระบุโครงการ')+' · แก้ล่าสุด '+new Date(d.updatedAt).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}))),
          btn('เปิด',function(){fill(d)},'primary sm'),btn('PDF',function(){exportPdf(d)},'sm'),dl);
        list.appendChild(row);
      });
    });
  }

  /* ---------- PDF (A4 sheets drawn as HTML, then html2canvas + jsPDF like the original form) ---------- */
  function pdfBlocks(d){
    var out=[];
    function H(t){var h=el('h2',null,t||'');h.__keep=true;return h}
    d.form.widgets.forEach(function(w){
      var v=d.values[w.id];
      switch(w.type){
        case 'heading':out.push(el('h2',null,w.label||''));break;
        case 'note':out.push(el('div',null,w.label?H(w.label):null,el('div',{style:'white-space:pre-wrap'},w.text||'')));break;
        case 'fields':
          var t=el('table',{class:'xkv'}),tb=el('tbody'),fs=w.fields||[];
          for(var i=0;i<fs.length;i+=2){
            var tr=el('tr');[i,i+1].forEach(function(k){if(k<fs.length){var x=v[k];tr.appendChild(el('td',null,fs[k].label));tr.appendChild(el('td',null,fs[k].type==='date'?fmtDate(x):(x||'-')))}else{tr.appendChild(el('td'));tr.appendChild(el('td'))}});
            tb.appendChild(tr);
          }
          t.appendChild(tb);out.push(el('div',null,w.label&&w.label!=='ข้อมูลทั่วไป'?H(w.label):null,t));break;
        case 'text':out.push(el('div',null,H(w.label),el('div',{style:'white-space:pre-wrap;min-height:20px'},v||'-')));break;
        case 'choice':out.push(el('div',null,H(w.label),el('div',null,(w.options||[]).map(function(o){return el('span',{style:'margin-right:18px'+(o===v?';font-weight:700':'')},(o===v?'☑ ':'☐ ')+o)}))));break;
        case 'checklist':
          out.push(H(w.label));
          var head=el('tr',null,el('th',{style:'width:6%'},'ลำดับ'),el('th',null,'รายการ'),el('th',{style:'width:16%'},'ผล'));if(w.note!==false)head.appendChild(el('th',{style:'width:28%'},'หมายเหตุ'));
          (w.items||[]).forEach(function(it,i){
            var x=v[i]||{},bad=x.r&&x.r===(w.options||[])[1];
            var tr=el('tr',null,el('td',{style:'text-align:center'},String(i+1)),el('td',null,it),el('td',{class:'xchk '+(bad?'xbad':x.r?'xok':'')},x.r||'-'));
            if(w.note!==false)tr.appendChild(el('td',null,x.n||''));
            out.push({table:true,head:head,row:tr});
          });
          break;
        case 'table':
          out.push(H(w.label));
          var th=el('tr',null,el('th',{style:'width:6%'},'ลำดับ'),(w.columns||[]).map(function(c){return el('th',null,c.label)}));
          var rows=(v||[]).filter(function(r){return r.some(function(c){return String(c||'').trim()})});
          if(!rows.length)rows=[(w.columns||[]).map(function(){return '-'})];
          rows.forEach(function(r,i){out.push({table:true,head:th,row:el('tr',null,el('td',{style:'text-align:center'},String(i+1)),r.map(function(c){return el('td',null,c||'')}))})});
          break;
        case 'photos':
          if(!v||!v.length)break;
          out.push(H(w.label));
          for(var p=0;p<v.length;p+=3)out.push(el('div',{class:'xph'},v.slice(p,p+3).map(function(x,k){return el('figure',null,el('img',{src:x.d,alt:''}),el('figcaption',null,'รูปที่ '+(p+k+1)+(x.c?' '+x.c:'')))})));
          break;
        case 'signatures':
          out.push(el('div',null,H(w.label),el('div',{class:'xsg'},(w.roles||[]).map(function(r,i){var s=(v||{})[i]||{};return el('div',null,el('div',{style:'font-weight:600'},r),el('div',{class:'xln'}),el('div',null,'('+(s.name||'..............................')+')'),el('div',null,'วันที่ '+(fmtDate(s.date)||'....../....../......')))}))));
          break;
      }
    });
    return out;
  }
  var PAGE_H=1123-40-60;
  function buildSheets(d){
    var host=$('#qcf-pdf')||document.body.appendChild(el('div',{id:'qcf-pdf','aria-hidden':'true'}));
    host.textContent='';
    var t=titleOf(d),sheets=[],sh,body,curTable=null,curHead=null;
    function newSheet(first){
      sh=el('div',{class:'sheet qcf-sheet'});body=el('div');sh.appendChild(body);host.appendChild(sh);sheets.push(sh);curTable=null;curHead=null;
      if(first){body.appendChild(el('h1',null,d.form.name));body.appendChild(el('div',{class:'xsub'},[t.project,t.no?'เลขที่ '+t.no:''].filter(Boolean).join(' · ')))}
      else body.appendChild(el('div',{class:'runhead'},el('span',null,t.project||d.form.name),el('span',null,t.no?'เลขที่ '+t.no:d.form.name)));
    }
    newSheet(true);
    pdfBlocks(d).forEach(function(b){
      if(b.table){
        if(!curTable||curHead!==b.head){curTable=el('tbody');curHead=b.head;body.appendChild(el('table',null,el('thead',null,b.head.cloneNode(true)),curTable))}
        curTable.appendChild(b.row);
        if(body.offsetHeight>PAGE_H){
          if(curTable.children.length>1){curTable.removeChild(b.row);newSheet(false);curTable=el('tbody');curHead=b.head;body.appendChild(el('table',null,el('thead',null,b.head.cloneNode(true)),curTable));curTable.appendChild(b.row)}
          else{var tbl=curTable.parentNode,prev=tbl.previousSibling,kept=prev&&prev.__keep?prev:null;if(body.children.length>(kept?2:1)){tbl.remove();if(kept)kept.remove();newSheet(false);if(kept)body.appendChild(kept);body.appendChild(tbl)}}
        }
        return;
      }
      curTable=null;curHead=null;body.appendChild(b);
      if(body.offsetHeight>PAGE_H&&body.children.length>1){var pv=b.previousSibling,kp=pv&&pv.__keep&&body.children.length>2?pv:null;body.removeChild(b);if(kp)kp.remove();newSheet(false);if(kp)body.appendChild(kp);body.appendChild(b)}
    });
    sheets.forEach(function(s,i){s.appendChild(el('div',{class:'pn'},el('span',null,d.form.name+(t.no?' · '+t.no:'')),el('span',null,'หน้า '+(i+1)+' / '+sheets.length)))});
    return sheets;
  }
  function preview(sheets){
    return new Promise(function(res){
      var vw=Math.min(window.innerWidth-32,600),sc=Math.min(1,vw/794),host=$('#qcf-pdf');
      var body=el('div',{style:'flex:1;overflow:auto;padding:14px;display:flex;flex-direction:column;align-items:center;gap:16px;background:var(--bg)'});
      sheets.forEach(function(s){var h=el('div',{style:'width:'+(794*sc)+'px;height:'+(1123*sc)+'px;position:relative;flex:0 0 auto;box-shadow:0 2px 10px rgba(0,0,0,.3)'});s.style.cssText='position:absolute;left:0;top:0;transform:scale('+sc+');transform-origin:top left';h.appendChild(s);body.appendChild(h)});
      var no=btn('ยกเลิก',function(){done(false)}),ok=btn('สร้างไฟล์ PDF',function(){done(true)},'primary',{id:'qcf-pdf-ok'});
      var back=el('div',{class:'dlg-back',style:'z-index:70',id:'qcf-preview'},el('div',{class:'dlg',role:'dialog','aria-label':'ตัวอย่าง PDF',style:'max-width:'+(794*sc+32)+'px;width:94%;height:88vh'},
        el('div',{style:'padding:14px 16px;border-bottom:1px solid var(--line)'},el('b',null,'ตัวอย่างก่อนสร้างไฟล์ PDF'),' ',el('span',{style:'color:var(--muted)'},sheets.length+' หน้า')),body,
        el('div',{class:'rb-actions',style:'padding:12px 16px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:flex-end'},no,ok)));
      document.body.appendChild(back);ok.focus();
      function done(v){sheets.forEach(function(s){s.style.cssText='';host.appendChild(s)});back.remove();res(v)}
    });
  }
  var busy=false;
  function exportPdf(d){
    if(busy)return;flush();busy=true;
    if(!window.jspdf||!window.html2canvas){status('ไม่พบตัวสร้าง PDF');busy=false;return}
    status('กำลังเตรียม PDF…');
    var sheets,ready=(document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve();
    ready.then(function(){
      sheets=buildSheets(d);
      var imgs=[].slice.call($('#qcf-pdf').querySelectorAll('img'));
      return Promise.all(imgs.map(function(i){return i.complete?0:new Promise(function(r){i.onload=i.onerror=r})}));
    }).then(function(){return preview(sheets)}).then(function(ok){
      if(!ok)throw {code:'cancelled'};
      var pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4',orientation:'portrait'}),chain=Promise.resolve();
      sheets.forEach(function(s,i){chain=chain.then(function(){status('กำลังสร้าง PDF… หน้า '+(i+1)+' / '+sheets.length);
        return window.html2canvas(s,{scale:2,backgroundColor:'#ffffff',logging:false,scrollX:0,scrollY:0,windowWidth:900,windowHeight:1200,
          onclone:function(doc){var r=doc.getElementById('qcf-pdf');if(r){r.style.position='absolute';r.style.left='0';r.style.top='0'}}
        }).then(function(c){if(i>0)pdf.addPage();pdf.addImage(c.toDataURL('image/jpeg',0.88),'JPEG',0,0,210,297,undefined,'FAST')})})});
      return chain.then(function(){return pdf.output('blob')});
    }).then(function(blob){
      var t=titleOf(d),name=(d.form.name+'_'+(t.no||t.project||today())).replace(/[\\\/:*?"<>|]+/g,'_')+'.pdf';
      window.__qcfLastPdf={name:name,size:blob.size};
      var use=(window.claude&&window.claude.use)?window.claude.use('downloads').catch(function(){return null}):Promise.resolve(null);
      return use.then(function(dl){
        if(dl)return dl.save({filename:name,data:blob});
        var a=el('a',{href:URL.createObjectURL(blob),download:name});document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},2000);
      });
    }).then(function(){status('ส่งไฟล์ PDF ให้บันทึกแล้ว')},function(e){
      var c=e&&e.code;status(c==='cancelled'?'ยกเลิกการสร้าง PDF':c==='declined'?'ยกเลิกการบันทึก PDF':'สร้าง PDF ไม่สำเร็จ ลองอีกครั้ง');if(!c)try{console.error(e)}catch(x){}
    }).then(function(){var h=$('#qcf-pdf');if(h)h.textContent='';busy=false});
  }

  /* ---------- builder: compose a form from the widget catalogue ---------- */
  function builder(formId,copyFrom){
    var src=formId?get(formId):copyFrom?get(copyFrom):null;
    var f=src&&!src.builtin&&formId?clone(src):{id:uid('c'),name:src?src.name+' (ปรับเอง)':'แบบฟอร์มใหม่',sub:'',short:'CF',widgets:src?clone(src.widgets).map(function(w){w.id=uid('w');return w}):[]};
    var r=ensureRoot(),listEl=el('div',{class:'qlist'}),saved=!!(formId&&src&&!src.builtin);
    var name=inp('text',f.name,function(x){f.name=x;dirty()},{id:'qb-name'}),sub=inp('text',f.sub,function(x){f.sub=x;dirty()},{id:'qb-sub',placeholder:'เช่น ใช้ตรวจอะไร'});
    var save=btn('บันทึกแบบฟอร์ม',doSave,'primary',{id:'qb-save'}),use=btn('ใช้แบบฟอร์มนี้',function(){doSave().then(function(){newDoc(f.id).then(fill)})},'',{id:'qb-use'});
    var pv=btn('ดูตัวอย่าง',function(){showPreview()},'',{id:'qb-preview'});
    function dirty(){status('ยังไม่บันทึก')}
    function doSave(){
      if(!f.name.trim()){status('ตั้งชื่อแบบฟอร์มก่อน');name.focus();return Promise.reject()}
      if(!f.widgets.length){status('เพิ่มวิเจ็ตอย่างน้อย 1 ชิ้น');return Promise.reject()}
      f.updatedAt=new Date().toISOString();f.custom=true;
      return put('forms',clone(f)).then(loadCustom).then(function(){saved=true;status('บันทึกแบบฟอร์มแล้ว · อยู่ในเมนู “สร้างรายงาน”')});
    }
    function move(i,d){var j=i+d;if(j<0||j>=f.widgets.length)return;var t=f.widgets[i];f.widgets[i]=f.widgets[j];f.widgets[j]=t;draw();dirty()}
    function cfg(w){
      var box=el('div',{class:'qb-cfg',style:'display:flex;flex-direction:column;gap:8px'});
      function field(lbl,node,help){return el('label',{class:'fl',style:'display:flex;flex-direction:column;gap:4px'},lbl,node,help?el('span',{class:'qhelp'},help):null)}
      box.appendChild(field('ชื่อหัวข้อ',inp('text',w.label,function(x){w.label=x;dirty()})));
      switch(w.type){
        case 'note':box.appendChild(field('ข้อความ',inp('textarea',w.text,function(x){w.text=x;dirty()})));break;
        case 'text':var mc=el('input',{type:'checkbox'});mc.checked=!!w.multiline;mc.onchange=function(){w.multiline=mc.checked;dirty()};box.appendChild(el('label',{class:'qb-chk'},mc,'พิมพ์ได้หลายบรรทัด'));break;
        case 'choice':box.appendChild(field('ตัวเลือก (บรรทัดละ 1 ข้อ)',inp('textarea',(w.options||[]).join('\n'),function(x){w.options=lines(x);dirty()})));break;
        case 'checklist':
          box.appendChild(field('รายการตรวจ (บรรทัดละ 1 ข้อ)',inp('textarea',(w.items||[]).join('\n'),function(x){w.items=lines(x);dirty()},{rows:6})));
          box.appendChild(field('ผลที่เลือกได้ (คั่นด้วย ,)',inp('text',(w.options||[]).join(', '),function(x){w.options=x.split(',').map(function(s){return s.trim()}).filter(Boolean);dirty()}),'ข้อที่ 2 ถือเป็นผลไม่ผ่าน (แสดงสีแดงใน PDF)'));
          var nc=el('input',{type:'checkbox'});nc.checked=w.note!==false;nc.onchange=function(){w.note=nc.checked;dirty()};box.appendChild(el('label',{class:'qb-chk'},nc,'มีช่องหมายเหตุต่อข้อ'));break;
        case 'table':
          box.appendChild(field('คอลัมน์ (บรรทัดละ 1 คอลัมน์ ใส่ # ท้ายชื่อถ้าเป็นตัวเลข)',inp('textarea',(w.columns||[]).map(function(c){return c.label+(c.type==='number'?' #':'')}).join('\n'),function(x){w.columns=lines(x).map(function(s){var n=/#\s*$/.test(s);return {label:s.replace(/#\s*$/,'').trim(),type:n?'number':'text'}});dirty()})));
          box.appendChild(field('แถวตั้งต้น (ไม่บังคับ บรรทัดละ 1 แถว ค่าในคอลัมน์แรก)',inp('textarea',(w.rows||[]).map(function(r){return r[0]}).join('\n'),function(x){w.rows=lines(x).map(function(s){return [s].concat((w.columns||[]).slice(1).map(function(){return ''}))});dirty()})));break;
        case 'photos':var cc=el('input',{type:'checkbox'});cc.checked=w.caption!==false;cc.onchange=function(){w.caption=cc.checked;dirty()};box.appendChild(el('label',{class:'qb-chk'},cc,'มีคำบรรยายใต้รูป'));break;
        case 'signatures':box.appendChild(field('ผู้ลงนาม (บรรทัดละ 1 ฝ่าย)',inp('textarea',(w.roles||[]).join('\n'),function(x){w.roles=lines(x);dirty()})));break;
        case 'fields':
          var fl=el('div',{style:'display:flex;flex-direction:column;gap:6px'});
          function drawF(){
            fl.textContent='';
            (w.fields||[]).forEach(function(x,i){
              var ty=el('select',{'aria-label':'ชนิดช่อง '+x.label},[['text','ข้อความ'],['number','ตัวเลข'],['date','วันที่'],['select','ตัวเลือก']].map(function(o){return el('option',{value:o[0]},o[1])}));ty.value=x.type||'text';
              var au=el('select',{'aria-label':'กรอกอัตโนมัติ '+x.label},el('option',{value:''},'ไม่กรอกให้'),Object.keys(AUTO).map(function(k){return el('option',{value:k},AUTO[k])}));au.value=x.auto||'';
              var op=inp('text',(x.options||[]).join(', '),function(s){x.options=s.split(',').map(function(q){return q.trim()}).filter(Boolean);dirty()},{placeholder:'ตัวเลือก คั่นด้วย ,','aria-label':'ตัวเลือกของ '+x.label,hidden:x.type!=='select'});
              ty.onchange=function(){x.type=ty.value;op.hidden=x.type!=='select';dirty()};au.onchange=function(){x.auto=au.value;dirty()};
              fl.appendChild(el('div',{class:'qb-row'},inp('text',x.label,function(s){x.label=s;dirty()},{'aria-label':'ชื่อช่องที่ '+(i+1)}),ty,au,op,btn('ลบ',function(){w.fields.splice(i,1);drawF();dirty()},'sm',{style:'flex:0 0 auto','aria-label':'ลบช่อง '+x.label})));
            });
            fl.appendChild(btn('+ เพิ่มช่อง',function(){(w.fields=w.fields||[]).push({label:'ช่องใหม่',type:'text'});drawF();dirty()},'sm',{style:'align-self:flex-start'}));
          }
          drawF();box.appendChild(fl);break;
      }
      return box;
    }
    function draw(){
      listEl.textContent='';
      if(!f.widgets.length)listEl.appendChild(el('div',{class:'qhelp'},'ยังไม่มีวิเจ็ต เลือกจากด้านบนเพื่อเริ่ม'));
      f.widgets.forEach(function(w,i){
        var title=el('b',null,w.label||WIDGETS[w.type].name);
        var card=el('div',{class:'qb-w','data-w':w.id},el('header',null,el('span',{class:'tag'},WIDGETS[w.type].name),title,
          btn('▲',function(){move(i,-1)},'sm',{'aria-label':'เลื่อนขึ้น'}),btn('▼',function(){move(i,1)},'sm',{'aria-label':'เลื่อนลง'}),
          btn('ลบ',function(){f.widgets.splice(i,1);draw();dirty()},'sm',{'aria-label':'ลบวิเจ็ต '+(w.label||'')})));
        var c=cfg(w);card.appendChild(c);
        var lab=c.querySelector('input');if(lab)lab.addEventListener('input',function(){title.textContent=lab.value||WIDGETS[w.type].name});
        listEl.appendChild(card);
      });
    }
    function showPreview(){
      var fake={form:clone(f),values:{}};f.widgets.forEach(function(w){fake.values[w.id]=blankValue(w)});
      var holder=el('div',{style:'display:flex;flex-direction:column;gap:12px;pointer-events:none;opacity:.95'});
      var saveCur=cur;cur={values:fake.values,form:fake.form};
      f.widgets.forEach(function(w){holder.appendChild(renderWidget(w,fake.values[w.id],true))});cur=saveCur;
      var back=el('div',{class:'dlg-back',style:'z-index:70',id:'qb-pv'},el('div',{class:'dlg',role:'dialog','aria-label':'ตัวอย่างแบบฟอร์ม',style:'height:88vh'},
        el('div',{style:'padding:12px 16px;border-bottom:1px solid var(--line);display:flex;gap:8px;align-items:center'},el('b',{style:'flex:1'},'ตัวอย่าง: '+f.name),btn('ปิด',function(){back.remove()})),
        el('div',{style:'flex:1;overflow:auto;padding:14px;background:var(--bg)'},holder)));
      document.body.appendChild(back);
    }
    var pal=el('div',{class:'qb-pal',role:'group','aria-label':'เพิ่มวิเจ็ต'});
    Object.keys(WIDGETS).forEach(function(k){
      var b=el('button',{type:'button','data-add':k},el('b',null,'+ '+WIDGETS[k].name),el('small',null,WIDGETS[k].desc));
      b.onclick=function(){var w=Object.assign({id:uid('w'),type:k},WIDGETS[k].make());f.widgets.push(w);draw();dirty();var c=listEl.lastChild;if(c&&c.scrollIntoView)c.scrollIntoView({block:'center'});var i=c&&c.querySelector('input');if(i)i.focus({preventScroll:true})};
      pal.appendChild(b);
    });
    var starts=el('select',{'aria-label':'เริ่มจากแบบฟอร์มที่มี',id:'qb-start'},el('option',{value:''},'เริ่มจากแบบฟอร์มที่มี…'),BUILTINS.concat(CUSTOM).map(function(x){return el('option',{value:x.id},x.name)}));
    starts.onchange=function(){var s=get(starts.value);starts.value='';if(!s)return;f.widgets=f.widgets.concat(clone(s.widgets).map(function(w){w.id=uid('w');return w}));if(f.name==='แบบฟอร์มใหม่')name.value=f.name=s.name+' (ปรับเอง)';draw();dirty()};
    var delF=saved?btn('ลบแบบฟอร์มนี้',function(){if(!delF.classList.contains('armed')){delF.classList.add('armed');delF.textContent='กดอีกครั้งเพื่อลบ';return}del('forms',f.id).then(loadCustom).then(function(){close();status('')})},'',{style:'color:var(--bad)'}):null;
    r.appendChild(el('div',{class:'qf-in'},bar('ตัวสร้างแบบฟอร์ม',[pv,use,save],'ปิด'),
      el('section',{class:'card'},el('h2',null,'ชื่อแบบฟอร์ม'),el('div',{class:'qg'},el('div',null,el('label',{class:'fl','for':'qb-name'},'ชื่อ (แสดงในเมนูและหัวเอกสาร PDF)'),name),el('div',null,el('label',{class:'fl','for':'qb-sub'},'คำอธิบายสั้น'),sub))),
      el('section',{class:'card'},el('h2',null,'วิเจ็ตสำเร็จรูป'),el('p',{class:'qhelp',style:'margin:0 0 8px'},'กดเพื่อเพิ่มต่อท้าย แล้วปรับรายละเอียดด้านล่าง · ลำดับในหน้านี้คือลำดับใน PDF'),pal,el('div',{style:'margin-top:10px'},starts)),
      el('h2',{style:'margin:4px 0 -6px'},'ส่วนประกอบของแบบฟอร์ม'),listEl,delF));
    draw();status(saved?'แก้แบบฟอร์มที่บันทึกไว้':'แบบฟอร์มใหม่ยังไม่บันทึก');
  }

  loadCustom();
  window.__qcForms={
    builtins:BUILTINS,customs:function(){return CUSTOM},reload:loadCustom,get:get,
    newDoc:function(id){return newDoc(id).then(function(d){fill(d);return d})},
    openDoc:openDoc,library:library,builder:builder,close:close,
    count:function(){return all('docs').then(function(a){return a.length}).catch(function(){return 0})},
    /* data access for backup / send / restore (index.html buildBackup, pwa-send.js) */
    titleOf:function(d){var t=titleOf(d);return t.name+(t.no?' · '+t.no:'')},
    listDocs:function(){return all('docs').then(function(a){return a.sort(function(x,y){return (y.updatedAt||'').localeCompare(x.updatedAt||'')})}).catch(function(){return []})},
    getDocs:function(ids){return all('docs').then(function(a){var m={};a.forEach(function(d){m[d.id]=d});return ids.map(function(id){return m[id]||null})})},
    exportAll:function(){return Promise.all([all('docs'),all('forms')]).then(function(r){return {docs:r[0],forms:r[1]}}).catch(function(){return {docs:[],forms:[]}})},
    /* merge by id; an existing copy that is the same age or newer is kept (never overwrite newer local work) */
    importAll:function(data){
      data=data||{};var n={docs:0,forms:0,skipped:0};
      return Promise.all([all('docs'),all('forms')]).then(function(r){
        var have=[{},{}];r[0].forEach(function(d){have[0][d.id]=d});r[1].forEach(function(f){have[1][f.id]=f});
        var chain=Promise.resolve();
        [['docs',data.docs||[],0],['forms',data.forms||[],1]].forEach(function(g){
          g[1].forEach(function(x){
            if(!x||!x.id)return;var ex=have[g[2]][x.id];
            if(ex&&(ex.updatedAt||'')>=(x.updatedAt||'')){n.skipped++;return}
            chain=chain.then(function(){return put(g[0],x)}).then(function(){n[g[0]]++});
          });
        });
        return chain;
      }).then(function(){return loadCustom()}).then(function(){try{window.dispatchEvent(new Event('qc-change'))}catch(e){}return n});
    },
    putDocs:function(list){var chain=Promise.resolve();(list||[]).forEach(function(d){chain=chain.then(function(){return put('docs',d)})});return chain.then(function(){try{window.dispatchEvent(new Event('qc-change'))}catch(e){}})}
  };
})();
