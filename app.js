'use strict';
/* Registro CIPP — prototipo. Estructura replicada desde el codebook REDCap PID 27. Solo datos ficticios. */

const GATE_HASH='70d5ac21a7aeab3308d3eb3b538bfa4c45a730e74d3674caec756267cd3d473d';
const STORE_KEY='cipp_registro_v1';
const EVENT_FORM={paciente_arm_1:'paciente',controles_arm_1:'consulta',examenes_arm_1:'cistometria_simple',cirugias_arm_1:'cirugiaprocedimiento'};
const INSTR=Object.fromEntries(DICTIONARY.instruments.map(i=>[i.form,i]));

/* ---------- sha256 (subtle + fallback) ---------- */
async function tryGateHash(str){
  if(!(window.crypto&&crypto.subtle))return null;
  const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
}

/* ---------- store ---------- */
const store={
  data:null,
  load(){try{this.data=JSON.parse(localStorage.getItem(STORE_KEY))}catch(e){this.data=null}
    if(!this.data)this.data={records:{}};return this.data},
  save(){this.data.updated_at=new Date().toISOString();localStorage.setItem(STORE_KEY,JSON.stringify(this.data))},
  records(){return this.data.records}
};

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
function pad(n){return String(n).padStart(2,'0')}
function nowFmt(validation){
  const d=new Date();
  const date=`${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}`;
  const time=`${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if(validation&&validation.startsWith('datetime_seconds'))return `${date} ${time}:${pad(d.getSeconds())}`;
  if(validation&&validation.startsWith('datetime'))return `${date} ${time}`;
  return date;
}
function parseDate(s){
  if(!s)return null;
  const m=String(s).match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if(m)return new Date(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0),+(m[6]||0));
  const m2=String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m2)return new Date(+m2[1],+m2[2]-1,+m2[3]);
  return null;
}
function isNum(x){return /^-?\d+(\.\d+)?$/.test(String(x).trim())}

/* ---------- REDCap logic / calc engine ---------- */
function tokenize(src){
  const toks=[];let i=0;
  while(i<src.length){
    const c=src[i];
    if(/\s/.test(c)){i++;continue}
    if(c==='['){const parts=[];let ok=true;
      while(src[i]==='['){const j=src.indexOf(']',i);if(j<0){ok=false;break}parts.push(src.slice(i+1,j));i=j+1}
      if(!ok)throw new Error('ref sin cerrar');toks.push({t:'ref',parts});continue}
    if(c==="'"||c==='"'){const q=c;let j=i+1,out='';while(j<src.length&&src[j]!==q){out+=src[j];j++}toks.push({t:'str',v:out});i=j+1;continue}
    if(/\d/.test(c)||(c==='.'&&/\d/.test(src[i+1]||''))){let j=i;while(j<src.length&&/[\d.]/.test(src[j]))j++;toks.push({t:'num',v:parseFloat(src.slice(i,j))});i=j;continue}
    if(/[A-Za-z_]/.test(c)){let j=i;while(j<src.length&&/[\w]/.test(src[j]))j++;const w=src.slice(i,j).toLowerCase();
      if(w==='and'||w==='or'||w==='not')toks.push({t:w});else toks.push({t:'ident',v:w});i=j;continue}
    if(c==='>'&&src[i+1]==='='){toks.push({t:'op',v:'>='});i+=2;continue}
    if(c==='<'&&src[i+1]==='='){toks.push({t:'op',v:'<='});i+=2;continue}
    if(c==='<'&&src[i+1]==='>'){toks.push({t:'op',v:'<>'});i+=2;continue}
    if(c==='='||c==='<'||c==='>'){toks.push({t:'op',v:c});i++;continue}
    if('+-*/'.includes(c)){toks.push({t:'op',v:c});i++;continue}
    if(c==='('){toks.push({t:'('});i++;continue}
    if(c===')'){toks.push({t:')'});i++;continue}
    if(c===','){toks.push({t:','});i++;continue}
    i++;
  }
  return toks;
}
function parseLogic(src){
  const toks=tokenize(src);let p=0;
  function peek(){return toks[p]}function eat(){return toks[p++]}
  function parseOr(){let l=parseAnd();while(peek()&&peek().t==='or'){eat();l={k:'or',l,r:parseAnd()}}return l}
  function parseAnd(){let l=parseNot();while(peek()&&peek().t==='and'){eat();l={k:'and',l,r:parseNot()}}return l}
  function parseNot(){if(peek()&&peek().t==='not'){eat();return{k:'not',x:parseNot()}}return parseCmp()}
  function parseCmp(){let l=parseAdd();
    if(peek()&&peek().t==='op'&&['=','<>','>','<','>=','<='].includes(peek().v)){const op=eat().v;return{k:'cmp',op,l,r:parseAdd()}}
    return l}
  function parseAdd(){let l=parseMul();while(peek()&&peek().t==='op'&&(peek().v==='+'||peek().v==='-')){const op=eat().v;l={k:'bin',op,l,r:parseMul()}}return l}
  function parseMul(){let l=parseUnary();while(peek()&&peek().t==='op'&&(peek().v==='*'||peek().v==='/')){const op=eat().v;l={k:'bin',op,l,r:parseUnary()}}return l}
  function parseUnary(){if(peek()&&peek().t==='op'&&peek().v==='-'){eat();return{k:'neg',x:parseUnary()}}return parseAtom()}
  function parseAtom(){
    const tk=eat();
    if(!tk)throw new Error('fin inesperado');
    if(tk.t==='num')return{k:'num',v:tk.v};
    if(tk.t==='str')return{k:'str',v:tk.v};
    if(tk.t==='ref')return{k:'ref',parts:tk.parts};
    if(tk.t==='('){const e=parseOr();if(peek()&&peek().t===')')eat();return e}
    if(tk.t==='ident'){
      if(peek()&&peek().t==='('){eat();const args=[];if(!(peek()&&peek().t===')')){args.push(parseOr());while(peek()&&peek().t===','){eat();args.push(parseOr())}}if(peek()&&peek().t===')')eat();return{k:'fn',name:tk.v,args}}
      return{k:'str',v:tk.v};
    }
    throw new Error('token inesperado');
  }
  const ast=parseOr();return ast;
}
function truthy(v){return v!==''&&v!==null&&v!==undefined&&v!==false&&v!=='0'&&v!==0}
function cmpVals(op,a,b){
  if(isNum(a)&&isNum(b)){a=parseFloat(a);b=parseFloat(b)}
  else{a=String(a);b=String(b)}
  switch(op){case '=':return a===b;case '<>':return a!==b;case '>':return a>b;case '<':return a<b;case '>=':return a>=b;case '<=':return a<=b}
  return false;
}
function evalAst(node,resolve){
  switch(node.k){
    case 'num':return node.v;
    case 'str':return node.v;
    case 'ref':return resolve(node.parts);
    case 'or':return truthy(evalAst(node.l,resolve))||truthy(evalAst(node.r,resolve));
    case 'and':return truthy(evalAst(node.l,resolve))&&truthy(evalAst(node.r,resolve));
    case 'not':return !truthy(evalAst(node.x,resolve));
    case 'cmp':return cmpVals(node.op,evalAst(node.l,resolve),evalAst(node.r,resolve));
    case 'neg':return -parseFloat(evalAst(node.x,resolve)||0);
    case 'bin':{const a=parseFloat(evalAst(node.l,resolve))||0,b=parseFloat(evalAst(node.r,resolve))||0;
      return node.op==='+'?a+b:node.op==='-'?a-b:node.op==='*'?a*b:(b===0?NaN:a/b)}
    case 'fn':{const args=node.args.map(a=>evalAst(a,resolve));return callFn(node.name,args)}
  }
  return '';
}
function callFn(name,args){
  switch(name){
    case 'rounddown':return Math.floor(parseFloat(args[0])||0);
    case 'roundup':return Math.ceil(parseFloat(args[0])||0);
    case 'round':{const x=parseFloat(args[0])||0;const n=args.length>1?parseInt(args[1]):0;const f=Math.pow(10,n);return Math.round(x*f)/f}
    case 'abs':return Math.abs(parseFloat(args[0])||0);
    case 'min':return Math.min(...args.map(a=>parseFloat(a)||0));
    case 'max':return Math.max(...args.map(a=>parseFloat(a)||0));
    case 'sqrt':return Math.sqrt(parseFloat(args[0])||0);
    case 'if':return truthy(args[0])?args[1]:args[2];
    case 'datediff':{const d1=parseDate(args[0]),d2=parseDate(args[1]);if(!d1||!d2)return '';
      const unit=String(args[2]||'d').replace(/['"]/g,'');const signed=truthy(String(args[3]||'').replace(/['"]/g,''));
      let diff;
      if(unit==='y'){diff=(d2.getFullYear()-d1.getFullYear());const adj=(d2.getMonth()-d1.getMonth())||((d2.getDate()-d1.getDate())/100);if(adj<0)diff-=1}
      else if(unit==='m'){diff=(d2.getFullYear()-d1.getFullYear())*12+(d2.getMonth()-d1.getMonth())}
      else if(unit==='h'){diff=Math.floor((d2-d1)/36e5)}
      else if(unit==='i'){diff=Math.floor((d2-d1)/6e4)}
      else if(unit==='s'){diff=Math.floor((d2-d1)/1e3)}
      else{diff=Math.floor((d2-d1)/864e5)}
      return signed?diff:Math.abs(diff)}
  }
  return '';
}

/* ---------- annotations ---------- */
function splitTop(s){
  const parts=[];let depth=0,q=null,cur='';
  for(const c of s){
    if(q){cur+=c;if(c===q)q=null;continue}
    if(c==="'"||c==='"'){q=c;cur+=c;continue}
    if(c==='('){depth++;cur+=c;continue}
    if(c===')'){depth--;cur+=c;continue}
    if(c===','&&depth===0){parts.push(cur);cur='';continue}
    cur+=c;
  }
  parts.push(cur);return parts.map(x=>x.trim());
}
function parseAnnotation(annot){
  const out={hidden:false,readonly:false,def:null,placeholder:null,ifs:[]};
  if(!annot)return out;
  let rest=annot;
  let idx;
  while((idx=rest.indexOf('@IF('))>=0){
    let depth=0,j=idx+3;
    for(;j<rest.length;j++){if(rest[j]==='(')depth++;if(rest[j]===')'){depth--;if(depth===0)break}}
    const inner=rest.slice(idx+4,j);
    rest=rest.slice(0,idx)+rest.slice(j+1);
    const parts=splitTop(inner);
    out.ifs.push({cond:parts[0]||'',then:parts[1]||'',els:parts[2]||''});
  }
  if(/@HIDDEN/.test(rest))out.hidden=true;
  if(/@READONLY/.test(rest))out.readonly=true;
  const dm=rest.match(/@DEFA?U?LT\s*=\s*('[^']*'|"[^"]*"|@NOW|\S+)/i);
  if(dm)out.def=dm[1].replace(/^['"]|['"]$/g,'');
  const pm=rest.match(/@PLACEHOLDER\s*=\s*("([^"]*)"|'([^']*)')/);
  if(pm)out.placeholder=pm[2]||pm[3]||'';
  return out;
}
function applyActionChunk(chunk,flags){
  if(/@HIDDEN/.test(chunk))flags.hidden=true;
  if(/@READONLY/.test(chunk))flags.readonly=true;
  const dm=chunk.match(/@DEFA?U?LT\s*=\s*('[^']*'|"[^"]*"|@NOW|\S+)/i);
  if(dm)flags.def=dm[1].replace(/^['"]|['"]$/g,'');
  const hc=chunk.match(/@HIDECHOICE\s*=\s*'([^']*)'/);
  if(hc)flags.hidechoices=hc[1].split(',').map(x=>x.trim());
}

/* ---------- app state ---------- */
let cur={recordId:null,form:null,instanceIdx:null};
let formState={};
let fieldMeta=[];

function resolveRef(parts){
  if(parts[0]==='current-instance')return String((cur.instanceIdx??0)+1);
  let form=cur.form,name,code;
  if(parts.length===1){name=parts[0]}
  else if(EVENT_FORM.hasOwnProperty(parts[0])){form=EVENT_FORM[parts[0]];name=parts[1];code=parts[2]}
  else{name=parts[0];code=parts[1]}
  if(form===cur.form||form===null&&false){}
  let data;
  if(form===cur.form||form===undefined||form===cur.form)data=formState;
  else{
    if(!form)return '';
    const rec=store.records()[cur.recordId];
    const insts=rec&&rec.instruments[form];
    if(!insts||!insts.length)return '';
    data=insts[insts.length-1].data;
  }
  const v=data[name];
  if(v===undefined||v===null)return '';
  if(typeof v==='object'){
    if(code!==undefined)return v[code]==='1'?'1':'0';
    return Object.values(v).some(x=>x==='1')?'1':'0';
  }
  return v;
}
function evalExpr(src){
  if(!src)return '';
  try{return evalAst(parseLogic(src),resolveRef)}catch(e){return ''}
}

/* ---------- gate ---------- */
async function tryGate(){
  const v=$('#gate-pass').value;
  const h=await tryGateHash(v);
  if(h&&h===GATE_HASH){sessionStorage.setItem('cipp_gate','1');showApp()}
  else{$('#gate-error').textContent='Clave incorrecta'}
}

/* ---------- views ---------- */
function showApp(){
  $('#gate').classList.add('hidden');$('#app').classList.remove('hidden');
  renderHome();
}
function setMain(node){const m=$('#main');m.innerHTML='';m.appendChild(node)}

function renderHome(filter=''){
  store.load();
  const wrap=el('div');
  const c1=el('div','card');
  c1.appendChild(el('h2',null,'Registros'));
  const row=el('div','row');
  const search=el('input');search.type='text';search.placeholder='Buscar por ID de registro…';search.value=filter;
  search.oninput=()=>renderHome(search.value);
  const bNew=el('button','btn','+ Nuevo registro');
  bNew.onclick=()=>{
    const id=prompt('ID del nuevo registro (pat_id ficticio, ej: DEMO-003):');
    if(!id)return;
    if(store.records()[id]){alert('Ya existe un registro con ese ID');return}
    store.records()[id]={id,created_at:new Date().toISOString(),instruments:{}};
    store.save();openRecord(id);
  };
  const bDemo=el('button','btn secondary','Cargar datos de demostración');
  bDemo.onclick=loadDemoData;
  row.append(search,bNew,bDemo);
  c1.appendChild(row);
  const recs=Object.values(store.records()).filter(r=>r.id.toLowerCase().includes(filter.toLowerCase()));
  if(recs.length){
    const t=el('table','list');
    t.innerHTML='<thead><tr><th>ID registro</th><th>Paciente</th><th>Consulta</th><th>Cistometría</th><th>Cirugía</th><th>Actualizado</th></tr></thead>';
    const tb=el('tbody');
    for(const r of recs.sort((a,b)=>a.id.localeCompare(b.id))){
      const tr=el('tr');
      const td=el('td');const b=el('button','linklike',r.id);b.onclick=()=>openRecord(r.id);td.appendChild(b);tr.appendChild(td);
      const cnt=f=>(r.instruments[f]||[]).length;
      ['paciente','consulta','cistometria_simple','cirugiaprocedimiento'].forEach(f=>tr.appendChild(el('td',null,String(cnt(f)))));
      tr.appendChild(el('td',null,r.updated_at?new Date(r.updated_at).toLocaleString('es-CL'):'—'));
      tb.appendChild(tr);
    }
    t.appendChild(tb);c1.appendChild(t);
  }else{
    c1.appendChild(el('p','muted','Sin registros todavía. Crea uno nuevo o carga los datos de demostración (ficticios).'));
  }
  wrap.appendChild(c1);
  const c2=el('div','card');
  c2.appendChild(el('h2',null,'Instrumentos del piloto (ruta Bulkamid)'));
  const ul=el('ul');ul.style.marginLeft='18px';
  for(const i of DICTIONARY.instruments){const li=el('li',null,`${i.label} — ${i.fields.length} campos`);ul.appendChild(li)}
  c2.appendChild(ul);
  c2.appendChild(el('p','muted','Estructura replicada 1:1 desde el codebook REDCap del proyecto CIPP (PID 27): tipos de campo, opciones, validaciones, lógica de salto, campos calculados y campos requeridos.'));
  wrap.appendChild(c2);
  setMain(wrap);
  if(document.activeElement!==search&&filter){search.focus();search.setSelectionRange(filter.length,filter.length)}
}

function openRecord(id){
  cur={recordId:id,form:null,instanceIdx:null};
  renderRecord();
}
function renderRecord(){
  store.load();
  const rec=store.records()[cur.recordId];
  if(!rec){renderHome();return}
  const wrap=el('div');
  const card=el('div','card');
  const head=el('div','record-head');
  head.appendChild(el('h2',null,'Registro '+rec.id));
  const bDel=el('button','btn danger','Eliminar registro');
  bDel.onclick=()=>{if(confirm('¿Eliminar el registro '+rec.id+' y todos sus datos?')){delete store.records()[rec.id];store.save();renderHome()}};
  head.appendChild(bDel);
  card.appendChild(head);
  const tabs=el('div','tabs');
  for(const i of DICTIONARY.instruments){
    const n=(rec.instruments[i.form]||[]).length;
    const t=el('button','tab'+(cur.form===i.form?' active':''),`${i.label} (${n})`);
    t.onclick=()=>{cur.form=i.form;cur.instanceIdx=null;renderRecord()};
    tabs.appendChild(t);
  }
  card.appendChild(tabs);
  if(!cur.form){card.appendChild(el('p','muted','Selecciona un instrumento para ver o ingresar datos.'))}
  else{
    const inst=INSTR[cur.form];
    const insts=rec.instruments[cur.form]||[];
    if(insts.length){
      const t=el('table','list');
      t.innerHTML='<thead><tr><th>#</th><th>Guardado</th><th>Resumen</th><th></th></tr></thead>';
      const tb=el('tbody');
      insts.forEach((ins,idx)=>{
        const tr=el('tr');
        tr.appendChild(el('td',null,String(idx+1)));
        tr.appendChild(el('td',null,ins.saved_at?new Date(ins.saved_at).toLocaleString('es-CL'):'—'));
        const summ=Object.entries(ins.data).filter(([k,v])=>v&&typeof v!=='object').slice(0,3).map(([k,v])=>k+'='+v).join(', ');
        tr.appendChild(el('td',null,summ||'—'));
        const td=el('td');const b=el('button','linklike','Abrir');b.onclick=()=>{cur.instanceIdx=idx;renderForm()};td.appendChild(b);tr.appendChild(td);
        tb.appendChild(tr);
      });
      t.appendChild(tb);card.appendChild(t);
    }else{
      card.appendChild(el('p','muted','Sin instancias guardadas de '+inst.label+'.'));
    }
    const bAdd=el('button','btn','+ Nueva instancia de '+inst.label);
    bAdd.onclick=()=>{cur.instanceIdx=null;renderForm()};
    card.appendChild(el('p'));card.appendChild(bAdd);
  }
  wrap.appendChild(card);
  setMain(wrap);
}

/* ---------- form ---------- */
function renderForm(){
  store.load();
  const rec=store.records()[cur.recordId];
  const inst=INSTR[cur.form];
  const existing=cur.instanceIdx!==null?rec.instruments[cur.form]?.[cur.instanceIdx]:null;
  formState=existing?JSON.parse(JSON.stringify(existing.data)):{};
  fieldMeta=[];
  const wrap=el('div');
  const card=el('div','card');
  card.appendChild(el('h2',null,inst.label+(existing?` — instancia ${cur.instanceIdx+1}`:' — nueva instancia')));
  card.appendChild(el('p','muted','Registro '+cur.recordId));
  const formBox=el('div');
  for(const f of inst.fields){
    const ann=parseAnnotation(f.annotation);
    if(ann.hidden)continue;
    if(f.type==='descriptive'){
      if(f.section){formBox.appendChild(el('div','f-section',f.section))}
      const d=el('div','f-desc',f.label);
      formBox.appendChild(d);continue;
    }
    if(f.section){formBox.appendChild(el('div','f-section',f.section))}
    const row=el('div','f-row');row.dataset.var=f.var;
    const lab=el('div','f-label');
    lab.appendChild(document.createTextNode(f.label));
    if(f.required)lab.appendChild(el('span','req',' *'));
    lab.appendChild(el('span','varname',f.var));
    row.appendChild(lab);
    const inp=el('div','f-input');
    buildInput(inp,f,ann);
    row.appendChild(inp);
    formBox.appendChild(row);
    fieldMeta.push({f,ann,row});
  }
  card.appendChild(formBox);
  const actions=el('div','form-actions');
  const bSave=el('button','btn','Guardar instancia');
  const msg=el('span','msg');
  bSave.onclick=()=>saveInstance(msg);
  const bBack=el('button','btn secondary','Volver');
  bBack.onclick=()=>renderRecord();
  actions.append(bSave,bBack,msg);
  card.appendChild(actions);
  wrap.appendChild(card);
  setMain(wrap);
  applyDefaults();
  evaluateAll();
}

function buildInput(box,f,ann){
  const cur_=formState[f.var];
  if(f.type==='text'||f.type==='sql'){
    const i=el('input');i.type='text';i.dataset.var=f.var;
    if(f.validation==='email')i.inputMode='email';
    if(ann.placeholder)i.placeholder=ann.placeholder;
    if(f.type==='sql')i.placeholder=(i.placeholder?i.placeholder+' · ':'')+'(lista dinámica en REDCap — texto libre en el prototipo)';
    i.value=cur_??'';
    i.oninput=()=>{formState[f.var]=i.value;evaluateAll()};
    box.appendChild(i);
  }else if(f.type==='notes'){
    const t=el('textarea');t.dataset.var=f.var;
    if(ann.placeholder)t.placeholder=ann.placeholder;
    t.value=cur_??'';
    t.oninput=()=>{formState[f.var]=t.value;evaluateAll()};
    box.appendChild(t);
  }else if(f.type==='radio'||f.type==='yesno'){
    const ch=el('div','choices');
    for(const c of f.choices){
      const l=el('label','choice');l.dataset.choice=c.value;
      const r=el('input');r.type='radio';r.name='r_'+f.var;r.value=c.value;
      if(String(cur_??'')===c.value)r.checked=true;
      r.onchange=()=>{formState[f.var]=c.value;evaluateAll()};
      l.append(r,document.createTextNode(c.label));ch.appendChild(l);
    }
    box.appendChild(ch);
  }else if(f.type==='dropdown'){
    const s=el('select');s.dataset.var=f.var;
    s.appendChild(el('option',null,'— seleccionar —')).value='';
    for(const c of f.choices){
      const o=el('option',null,c.label);o.value=c.value;o.dataset.choice=c.value;
      if(String(cur_??'')===c.value)o.selected=true;
      s.appendChild(o);
    }
    s.onchange=()=>{formState[f.var]=s.value;evaluateAll()};
    box.appendChild(s);
  }else if(f.type==='checkbox'){
    const ch=el('div','choices');
    const st=formState[f.var]&&typeof formState[f.var]==='object'?formState[f.var]:{};
    formState[f.var]=st;
    for(const c of f.choices){
      const l=el('label','choice');l.dataset.choice=c.value;
      const r=el('input');r.type='checkbox';r.value=c.value;
      r.checked=st[c.value]==='1';
      r.onchange=()=>{st[c.value]=r.checked?'1':'0';evaluateAll()};
      l.append(r,document.createTextNode(c.label));ch.appendChild(l);
    }
    box.appendChild(ch);
  }else if(f.type==='calc'){
    const o=el('span','calc-out','—');o.dataset.var=f.var;o.dataset.calc='1';
    box.appendChild(o);
  }else if(f.type==='file'){
    box.appendChild(el('span','readonly-note','(campo de archivo — no disponible en el prototipo)'));
  }else{
    const i=el('input');i.type='text';i.dataset.var=f.var;i.value=cur_??'';
    i.oninput=()=>{formState[f.var]=i.value;evaluateAll()};
    box.appendChild(i);
  }
}

function applyDefaults(){
  for(const m of fieldMeta){
    if(formState[m.f.var]!==undefined&&formState[m.f.var]!=='')continue;
    let def=m.ann.def;
    for(const ifc of m.ann.ifs){
      const chosen=truthy(evalExpr(ifc.cond))?ifc.then:ifc.els;
      const flags={};applyActionChunk(chosen,flags);
      if(flags.def!==undefined&&flags.def!==null)def=flags.def;
    }
    if(def===null||def===undefined)continue;
    if(def==='@NOW')def=nowFmt(m.f.validation);
    else if(def==='[user-fullname]')def='Usuario Demo';
    def=String(def).replace(/^['"]|['"]$/g,'');
    if(m.f.type==='radio'||m.f.type==='yesno'||m.f.type==='dropdown'){formState[m.f.var]=def;setInputValue(m.f.var,def)}
    else if(m.f.type==='text'||m.f.type==='notes'||m.f.type==='sql'){formState[m.f.var]=def;setInputValue(m.f.var,def)}
  }
}
function setInputValue(varn,val){
  const row=document.querySelector(`.f-row[data-var="${CSS.escape(varn)}"]`);
  if(!row)return;
  const inp=row.querySelector('input[type=text],textarea,select');
  if(inp)inp.value=val;
  const radios=row.querySelectorAll('input[type=radio]');
  radios.forEach(r=>{r.checked=r.value===String(val)});
}

function evaluateAll(){
  for(const m of fieldMeta){
    const {f,ann,row}=m;
    let visible=true,readonly=ann.readonly,hidechoices=[];
    if(f.branching){
      const r=evalExpr(f.branching);
      visible=truthy(r);
    }
    for(const ifc of ann.ifs){
      const chosen=truthy(evalExpr(ifc.cond))?ifc.then:ifc.els;
      const flags={hidden:false,readonly:false,hidechoices:null};
      applyActionChunk(chosen,flags);
      if(flags.hidden)visible=false;
      if(flags.readonly)readonly=true;
      if(flags.hidechoices)hidechoices=flags.hidechoices;
    }
    row.classList.toggle('hidden',!visible);
    row.querySelectorAll('input,textarea,select').forEach(i=>{i.disabled=readonly});
    if(hidechoices.length){
      row.querySelectorAll('[data-choice]').forEach(n=>{
        n.classList.toggle('hidden',hidechoices.includes(n.dataset.choice));
      });
    }else{
      row.querySelectorAll('[data-choice]').forEach(n=>n.classList.remove('hidden'));
    }
    if(f.type==='calc'){
      const out=row.querySelector('.calc-out');
      const v=evalExpr(f.calc);
      const disp=(v===''||v===null||Number.isNaN(v))?'—':(typeof v==='number'?(Number.isInteger(v)?v:v.toFixed(1)):v);
      out.textContent=String(disp);
      formState[f.var]=v==='—'?'':v;
    }
  }
}

const VALIDATIONS={
  date_dmy:/^\d{2}-\d{2}-\d{4}$/,
  datetime_dmy:/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}$/,
  datetime_seconds_dmy:/^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/,
  date_ymd:/^\d{4}-\d{2}-\d{2}$/,
  number:/^-?\d+(\.\d+)?$/,
  integer:/^-?\d+$/,
  email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/
};
function fieldEmpty(f,v){
  if(v===undefined||v===null||v==='')return true;
  if(typeof v==='object')return !Object.values(v).some(x=>x==='1');
  return false;
}
function saveInstance(msg){
  const errors=[];
  for(const m of fieldMeta){
    const {f,row}=m;
    if(row.classList.contains('hidden'))continue;
    const v=formState[f.var];
    if(f.required&&fieldEmpty(f,v))errors.push('Falta campo requerido: '+f.label.slice(0,60));
    if((f.type==='text'||f.type==='notes')&&v&&f.validation&&VALIDATIONS[f.validation]&&!VALIDATIONS[f.validation].test(String(v))){
      errors.push('Formato inválido en "'+f.label.slice(0,40)+'" ('+f.validation+')');
      const inp=row.querySelector('input,textarea');if(inp)inp.classList.add('invalid');
    }else{
      const inp=row.querySelector('input,textarea');if(inp)inp.classList.remove('invalid');
    }
  }
  if(errors.length){
    msg.className='msg err';msg.textContent=errors.length+' problema(s): '+errors.slice(0,3).join(' · ')+(errors.length>3?' …':'');
    return;
  }
  const rec=store.records()[cur.recordId];
  if(!rec.instruments[cur.form])rec.instruments[cur.form]=[];
  const clean=JSON.parse(JSON.stringify(formState));
  const inst={saved_at:new Date().toISOString(),data:clean};
  if(cur.instanceIdx!==null)rec.instruments[cur.form][cur.instanceIdx]=inst;
  else rec.instruments[cur.form].push(inst);
  rec.updated_at=new Date().toISOString();
  store.save();
  msg.className='msg ok';msg.textContent='Guardado ✓';
  setTimeout(()=>renderRecord(),700);
}

/* ---------- export / import ---------- */
function csvCell(v){v=String(v??'');return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
function renderExport(){
  store.load();
  const wrap=el('div');
  const card=el('div','card');
  card.appendChild(el('h2',null,'Exportar datos (ficticios)'));
  card.appendChild(el('p','muted','CSV por instrumento, con columnas como en REDCap (checkbox expandidos var___código).'));
  for(const inst of DICTIONARY.instruments){
    const b=el('button','btn secondary','CSV: '+inst.label);
    b.style.margin='4px 6px 4px 0';
    b.onclick=()=>exportCSV(inst);
    card.appendChild(b);
  }
  card.appendChild(el('hr'));
  const bJson=el('button','btn','Exportar todo (JSON)');
  bJson.onclick=()=>{
    const blob=new Blob([JSON.stringify(store.data,null,1)],{type:'application/json'});
    downloadBlob(blob,'cipp-registro-backup.json');
  };
  card.appendChild(bJson);
  wrap.appendChild(card);
  setMain(wrap);
}
function exportCSV(inst){
  const vars=inst.fields.filter(f=>!['descriptive'].includes(f.type));
  const cols=['record_id','instance'];
  const map=[];
  for(const f of vars){
    if(f.type==='checkbox'){for(const c of f.choices){cols.push(f.var+'___'+c.value);map.push({var:f.var,code:c.value})}}
    else if(f.type==='file'){/* skip */}
    else{cols.push(f.var);map.push({var:f.var})}
  }
  const rows=[cols.join(',')];
  for(const rec of Object.values(store.records())){
    (rec.instruments[inst.form]||[]).forEach((ins,idx)=>{
      const cells=[rec.id,String(idx+1)];
      for(const m of map){
        const v=ins.data[m.var];
        if(m.code)cells.push(v&&typeof v==='object'?(v[m.code]||'0'):'0');
        else cells.push(typeof v==='object'?'':(v??''));
      }
      rows.push(cells.map(csvCell).join(','));
    });
  }
  downloadBlob(new Blob([rows.join('\n')],{type:'text/csv'}),inst.form+'.csv');
}
function downloadBlob(blob,name){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
function importJSON(file){
  const r=new FileReader();
  r.onload=()=>{
    try{
      const d=JSON.parse(r.result);
      if(!d||typeof d!=='object'||!d.records)throw new Error('formato no válido');
      if(!confirm('Esto reemplaza TODOS los registros actuales. ¿Continuar?'))return;
      store.data=d;store.save();alert('Importado ✓');renderHome();
    }catch(e){alert('No se pudo importar: '+e.message)}
  };
  r.readAsText(file);
}

/* ---------- demo data ---------- */
function loadDemoData(){
  store.load();
  if(store.records()['DEMO-001']){alert('Los datos de demostración ya están cargados.');return}
  const now=new Date().toISOString();
  store.records()['DEMO-001']={id:'DEMO-001',created_at:now,updated_at:now,instruments:{
    paciente:[{saved_at:now,data:{pat_id:'DEMO-001',pat_legacy:'0',pat_creation_date:'17-10-2026',pat_names:'Paciente Ficticia',pat_last_name_1:'Demo',pat_last_name_2:'Uno',pat_dob:'15-03-1968'}}],
    consulta:[{saved_at:now,data:{visit_legacy:'0'}}],
    cistometria_simple:[{saved_at:now,data:{cystometry_legacy:'0'}}],
    cirugiaprocedimiento:[{saved_at:now,data:{surgery_incontinence_bulking_agent:'1'}}]
  }};
  store.records()['DEMO-002']={id:'DEMO-002',created_at:now,updated_at:now,instruments:{
    paciente:[{saved_at:now,data:{pat_id:'DEMO-002',pat_legacy:'0',pat_creation_date:'17-10-2026',pat_names:'Paciente Ficticia',pat_last_name_1:'Demo',pat_last_name_2:'Dos',pat_dob:'02-11-1975'}}]
  }};
  store.save();renderHome();
}

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded',()=>{
  $('#gate-form').addEventListener('submit',e=>{e.preventDefault();tryGate()});
  $('#nav-home').onclick=()=>renderHome();
  $('#nav-export').onclick=()=>renderExport();
  $('#nav-import').onclick=()=>$('#import-file').click();
  $('#import-file').addEventListener('change',e=>{if(e.target.files[0])importJSON(e.target.files[0]);e.target.value=''});
  $('#nav-lock').onclick=()=>{sessionStorage.removeItem('cipp_gate');location.reload()};
  store.load();
  if(sessionStorage.getItem('cipp_gate')==='1')showApp();
});
