const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./harness'),{Prop,Layer,env}=require('./ae');
const request={scope:'auto',region:'after',direction:1,frames:1,compMarkers:false};
// Model the user's AE observation: key writes activate a layer in the timeline.
// Removing selection restoration from production must break the repeat-click case.
function activateOnKeyWrite(p,l,layers){const native=p.setSelectedAtKey;
 p.setSelectedAtKey=function(i,on){native.call(this,i,on);for(const x of layers)x.selected=false;l.selected=true;};
}
function setup(layers){const s=env(layers);return{...s,h:load(s.globals).FFHost};}
function run(s,r=request){return s.h.applyPlan(s.h.prepare(r));}
test('Auto with no initial layers selected keeps the same full scope across repeated offsets',()=>{
 const p=new Prop('ADBE Opacity',[2,6]),cross=new Layer(0,10,[p]),later=new Layer(7,9),ls=[cross,later];
 activateOnKeyWrite(p,cross,ls);const s=setup(ls);
 assert.equal(run(s).ok,true);assert.deepEqual(s.comp.selectedLayers,[]);
 assert.equal(run(s).ok,true);assert.deepEqual(s.comp.selectedLayers,[]);
 assert.ok(Math.abs(later.inPoint-(7+2/24))<1e-10);assert.ok(Math.abs(p.keyTime(2)-(6+2/24))<1e-10);
 assert.equal(p.keySelected(1),true);assert.equal(p.keySelected(2),false);
});
test('all four offset buttons preserve initially empty layer selection',()=>{
 for(const region of ['before','after'])for(const direction of [-1,1]){
  const p=new Prop('ADBE Opacity',[2,6]),l=new Layer(0,10,[p]),s=setup([l]);activateOnKeyWrite(p,l,[l]);
  const r=run(s,{...request,region,direction});assert.equal(r.ok,true);
  assert.equal(l.selected,false,region+direction);assert.equal(s.undo.ends,1);
 }
});
test('explicit All restores exactly the original multiple-selection set, including untouched locked layers',()=>{
 const p=new Prop('ADBE Opacity',[2,6]),a=new Layer(0,10,[p],true),b=new Layer(7,9,[],true),locked=new Layer(0,10,[],true),c=new Layer(7,9);
 locked.locked=true;const ls=[a,b,locked,c],s=setup(ls);activateOnKeyWrite(p,a,ls);
 assert.equal(run(s,{...request,scope:'all'}).ok,true);assert.deepEqual(ls.map(l=>l.selected),[true,true,true,false]);assert.equal(locked.locked,true);
});
test('restoration also runs after a failed write and rollback recreates selected keys',()=>{
 const p=new Prop('ADBE Opacity',[2,6]),q=new Prop('ADBE Opacity',[2,6]),a=new Layer(0,10,[p]),b=new Layer(0,10,[q]),ls=[a,b],s=setup(ls);
 activateOnKeyWrite(p,a,ls);activateOnKeyWrite(q,b,ls);q.failOnce=true;
 const r=run(s);assert.equal(r.ok,false);assert.equal(r.restored,true);assert.deepEqual(s.comp.selectedLayers,[]);
 assert.deepEqual(p.keys.map(k=>k.time),[2,6]);assert.deepEqual(q.keys.map(k=>k.time),[2,6]);assert.equal(s.undo.ends,1);
});
test('native whole-layer and close-gap translations preserve original selection too',()=>{
 for(const gap of [false,true]){
  const a=new Layer(0,3),b=new Layer(8,10),ls=[a,b],s=setup(ls);s.comp.duration=20;
  const native=Object.getOwnPropertyDescriptor(Layer.prototype,'startTime');
  Object.defineProperty(b,'startTime',{get(){return native.get.call(this);},set(v){native.set.call(this,v);this.selected=true;}});
  const plan=gap?s.h.prepareGap({scope:'auto'}):s.h.prepare(request),r=s.h.applyPlan(plan);
  assert.equal(r.ok,true);assert.deepEqual(s.comp.selectedLayers,[]);assert.equal(s.undo.ends,1);
 }
});
test('a no-op does not write layer selection or create an Undo group',()=>{
 const l=new Layer(0,3),s=setup([l]);let writes=0,selected=false;
 Object.defineProperty(l,'selected',{get:()=>selected,set:v=>{writes++;selected=v;}});
 assert.equal(run(s).changed,0);assert.equal(writes,0);assert.equal(s.undo.begins,0);
});
test('persistent selection-restoration failure stays explicit and closes Undo after scene recovery',()=>{
 const p=new Prop('ADBE Opacity',[2,6]),l=new Layer(0,10,[p]),s=setup([l]);let selected=false;
 Object.defineProperty(l,'selected',{get:()=>selected,set:v=>{if(!v)throw Error('selection denied');selected=v;}});
 activateOnKeyWrite(p,l,[]);
 const r=run(s);assert.equal(r.ok,false);assert.equal(r.restored,true);assert.ok(r.selectionError);
 assert.equal(r.selectionRestored,false);assert.equal(s.undo.ends,1);assert.deepEqual(p.keys.map(k=>k.time),[2,6]);
 assert.match(s.h.report(s.h.prepare({...request,region:'before'}),r,'TEST'),/ВЫДЕЛЕНИЕ НЕ ВОССТАНОВЛЕНО/);
});
test('rollback readback covers final selection cleanup if the host couples layer and key flags',()=>{
 const p=new Prop('ADBE Opacity',[2,6]),q=new Prop('ADBE Opacity',[2,6]),a=new Layer(0,10,[p]),b=new Layer(0,10,[q]),s=setup([a,b]);let selected=false;
 Object.defineProperty(a,'selected',{get:()=>selected,set:v=>{selected=v;if(!v)p.keys.forEach(k=>k.selected=false);}});
 activateOnKeyWrite(p,a,[]);q.failOnce=true;
 const r=run(s);assert.equal(r.ok,false);assert.equal(r.restored,false);
 assert.ok(r.recoveryErrors.some(e=>/selected|ключа/.test(e)),'readback must catch changed key flags after selection cleanup');
 assert.match(r.error.message,/injected write failure/);assert.equal(a.selected,false);assert.equal(s.undo.ends,1);
});
