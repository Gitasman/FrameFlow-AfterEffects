const {test}=require('node:test'),assert=require('node:assert/strict');
const {uiEnv,find}=require('./ui-env'),{Layer,Prop}=require('./ae');
function open(s){s.ui.controls.report.onClick();return s.windows.at(-1);}
function field(w){return w.children.find(c=>c.type==='edittext');}
function previewButton(w,label){const c=find(w,label);assert.ok(c,'missing read-only preview action '+label);return c;}
test('all four previews describe the current operation without changing layers, keys, selection, preferences or Undo',()=>{
 for(const [label,region,direction] of [['До −','before',-1],['До +','before',1],['После −','after',-1],['После +','after',1]]){
  const p=new Prop('ADBE Opacity',[2,6]),l=new Layer(0,10,[p]),s=uiEnv([l]);
  s.ui.controls.frames.text='5';const w=open(s),writes=s.writes.length;
  previewButton(w,label).onClick();const text=field(w).text;
  assert.match(text,/ПРОВЕРКА БЕЗ ПРИМЕНЕНИЯ/);assert.match(text,new RegExp('Region='+region));
  assert.match(text,new RegExp('Frames=5; Direction='+direction));assert.match(text,/Слоёв: 1; ключей: 1/);
  assert.match(text,/Сцена не изменена/);assert.equal(l.inPoint,0);assert.equal(l.outPoint,10);
  assert.deepEqual(p.keys.map(k=>k.time),[2,6]);assert.equal(l.selected,false);
  assert.equal(s.undo.begins,0);assert.equal(s.writes.length,writes);
 }
});
test('preview catches a collision and lets the last applied report be restored',()=>{
 const p=new Prop('ADBE Opacity',[4,6]),s=uiEnv([new Layer(0,10,[p])]);
 s.ui.controls.after.forward.onClick();s.ui.controls.frames.text='49';const w=open(s),saved=field(w).text;
 previewButton(w,'До +').onClick();assert.match(field(w).text,/Коллизия|порядок/);
 const restore=previewButton(w,'Последний результат');assert.equal(restore.enabled,true);restore.onClick();
 assert.equal(field(w).text,saved);assert.equal(s.undo.begins,1);
});
test('preview explains finite-source skips instead of writing an impossible video edge',()=>{
 const l=new Layer(71/24,8);l._start=71/24;l.stretch=100;l.timeRemapEnabled=false;
 l.source={duration:121/24,mainSource:{isStill:false}};
 const s=uiEnv([l,new Layer(9,12)]);s.comp.time=5.625;s.comp.duration=15;s.ui.controls.frames.text='5';const w=open(s);
 previewButton(w,'После +').onClick();assert.match(field(w).text,/Пропуски: 1/);assert.match(field(w).text,/Предел исходного медиа/);
 assert.equal(l.outPoint,8);assert.equal(s.undo.begins,0);
});
test('preview reads fresh CTI and selection and actual execution makes its own new plan',()=>{
 const a=new Layer(0,3),b=new Layer(8,12),s=uiEnv([a,b]),w=open(s);
 b.selected=true;s.comp.time=9;previewButton(w,'После +').onClick();assert.match(field(w).text,/CTI=9 s/);
 assert.match(field(w).text,/К изменению: 1/);assert.match(field(w).text,/kind=edge/);
 find(w,'Закрыть').onClick();b.selected=false;s.comp.time=5;
 s.ui.controls.after.forward.onClick();assert.ok(Math.abs(b.inPoint-(8+1/24))<1e-10);assert.equal(a.inPoint,0);
});
test('invalid step disables only previews and leaves the last report available',()=>{
 const s=uiEnv([new Layer(8,12)]);s.ui.controls.frames.text='';const w=open(s),before=field(w).text;
 assert.equal(previewButton(w,'После +').enabled,false);assert.ok(before);assert.equal(s.undo.begins,0);
 assert.equal(find(w,'Сохранить TXT').enabled,true);assert.ok(w.children.some(c=>/положительное|Кадры/.test(c.text)));
});
test('preview error after composition closes is readable and the last report is retained',()=>{
 const s=uiEnv([new Layer(8,12)]),w=open(s),before=field(w).text;s.globals.app.project.activeItem=null;
 previewButton(w,'После +').onClick();assert.match(field(w).text,/Откройте композицию/);
 previewButton(w,'Последний результат').onClick();assert.equal(field(w).text,before);assert.equal(s.undo.begins,0);
});
test('export writes the displayed preview and never the stale applied report',()=>{
 const s=uiEnv([new Layer(8,12)]);let exported='';
 s.globals.File.saveDialog=()=>({open:()=>true,write:t=>{exported=t;return true;},close(){}});
 const w=open(s);previewButton(w,'После +').onClick();find(w,'Сохранить TXT').onClick();
 assert.equal(exported,field(w).text);assert.match(exported,/ПРОВЕРКА БЕЗ ПРИМЕНЕНИЯ/);
});
