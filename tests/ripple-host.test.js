const {test}=require('node:test'),assert=require('node:assert/strict');const {load}=require('./harness'),{Prop,Layer,PV,env}=require('./ae');
function setup(ls){const s=env(ls);s.comp.duration=20;return{...s,h:load(s.globals).FFHost};}
const insert={scope:'all',mode:'insert',fromFrames:'120',lengthFrames:'48',compMarkers:false};
const remove={...insert,mode:'remove'};
function plan(s,r=insert){assert.equal(typeof s.h.prepareRipple,'function','missing host time editing');return s.h.prepareRipple(r);}
function run(s,r=insert){const p=plan(s,r);return{p,r:s.h.applyPlan(p)};}
test('insertion combines crossing animation and native downstream translation in one Undo',()=>{
 const p=new Prop('ADBE Opacity',[2,5,8]),a=new Layer(0,10,[p]),b=new Layer(8,12),s=setup([a,b]),{r}=run(s);
 assert.equal(r.ok,true);assert.deepEqual(p.keys.map(k=>k.time),[2,7,10]);assert.equal(a.outPoint,12);assert.equal(b.inPoint,10);assert.equal(s.undo.begins,1);assert.equal(s.undo.ends,1);assert.equal(s.comp.time,5);assert.equal(s.comp.duration,20);
});
test('removal drops only keys inside the half-open range and preserves remaining native values',()=>{
 const p=new Prop('ADBE Opacity',[2,5,6,7,9]),l=new Layer(0,10,[p]),s=setup([l]),{r}=run(s,remove);
 assert.equal(r.ok,true);assert.equal(r.deletedKeys,2);assert.equal(l.outPoint,8);assert.deepEqual(p.keys.map(k=>[k.time,k.value]),[[2,10],[5,13],[7,14]]);assert.equal(p.keySelected(1),true);
});
test('later failure restores deleted keys, values and prior layer selection',()=>{
 const p=new Prop('ADBE Opacity',[2,5,6,7,9]),q=new Prop('ADBE Opacity',[2,8]),a=new Layer(0,10,[p]),b=new Layer(0,10,[q]),s=setup([a,b]);q.failOnce=true;
 const n=p.setSelectedAtKey;p.setSelectedAtKey=function(i,v){n.call(this,i,v);a.selected=true;};
 const {r}=run(s,remove);assert.equal(r.ok,false);assert.equal(r.restored,true);assert.equal(r.deletedKeys,0);assert.deepEqual(p.keys.map(k=>k.time),[2,5,6,7,9]);assert.deepEqual(p.keys.map(k=>k.value),[10,11,12,13,14]);assert.equal(a.selected,false);assert.equal(a.outPoint,10);assert.equal(s.undo.ends,1);
});
test('affected lock blocks the entire ripple before any earlier writes',()=>{const a=new Layer(8,12),b=new Layer(9,13);b.locked=true;const s=setup([a,b]),{r,p}=run(s);assert.equal(r.ok,false);assert.ok(p.errors.length);assert.equal(a.inPoint,8);assert.equal(s.undo.begins,0);});
test('earlier locked layers do not block downstream time edits',()=>{const a=new Layer(0,3);a.locked=true;const b=new Layer(8,12),s=setup([a,b]);assert.equal(run(s).r.ok,true);assert.equal(b.inPoint,10);});
test('wholly removed layer blocks with no silent object deletion',()=>{const a=new Layer(5,7),b=new Layer(8,12),s=setup([a,b]),{r,p}=run(s,remove);assert.equal(r.ok,false);assert.match(p.skips.join(''),/целиком/);assert.equal(s.comp.numLayers,2);assert.equal(b.inPoint,8);});
test('property losing all keys blocks the entire operation',()=>{const p=new Prop('ADBE Opacity',[5,6]),s=setup([new Layer(0,10,[p])]),{r}=run(s,remove);assert.equal(r.ok,false);assert.equal(p.numKeys,2);assert.equal(s.undo.begins,0);});
test('crossing finite footage and precomps require explicit existing Time Remap',()=>{
 for(const mode of ['insert','remove'])for(const kind of ['video','precomp']){
  const l=new Layer(0,10);l.timeRemapEnabled=false;l.stretch=100;l.source=kind==='video'?{duration:10,mainSource:{isStill:false}}:new (env([]).globals.CompItem)([]);
  // Use this fixture's CompItem constructor as the current host does.
  const s=setup([l,new Layer(8,12)]);if(kind==='precomp')l.source=new s.globals.CompItem([]);
  const {r,p}=run(s,{...insert,mode});assert.equal(r.ok,false);assert.match(p.skips.join(''),/Time Remap/);assert.equal(l.outPoint,10);assert.equal(s.undo.begins,0);
 }
});
test('still images and natively moved finite footage remain supported',()=>{const still=new Layer(0,10),later=new Layer(8,12);still.source={mainSource:{isStill:true}};later.source={duration:4,mainSource:{isStill:false}};later.timeRemapEnabled=false;const s=setup([still,later]);assert.equal(run(s).r.ok,true);assert.equal(still.outPoint,12);assert.equal(later.inPoint,10);});
test('Time Remap removal retains its anchor and expression enable state',()=>{const p=new Prop('ADBE Time Remapping',[2,5,6,7,9]);p.canSetExpression=true;p.expression='value';p.expressionEnabled=false;const l=new Layer(0,10,[p]);l.timeRemapEnabled=true;l.source={mainSource:{isStill:false}};const s=setup([l]),{r}=run(s,remove);assert.equal(r.ok,true);assert.equal(p.inaccessible,undefined);assert.equal(p.expressionEnabled,false);assert.deepEqual(p.keys.map(k=>k.time),[2,5,7]);});
test('duration marker crossing edit boundary blocks instead of silently changing its span',()=>{const m=new Prop('ADBE Marker',[4],PV.MARKER);m.keys[0].value.duration=2;const s=setup([new Layer(0,10,[m])]),{r,p}=run(s);assert.equal(r.ok,false);assert.match(p.skips.join(''),/длительностью/);assert.equal(s.undo.begins,0);});
test('protected markers are never removed or moved by ripple',()=>{const m=new Prop('ADBE Marker',[2,6,8],PV.MARKER);m.keys[1].value.protectedRegion=true;const s=setup([new Layer(0,10,[m])]);assert.equal(run(s,remove).r.ok,false);assert.equal(m.numKeys,3);});
test('optional comp marker removal uses the same retained snapshot semantics',()=>{const s=setup([new Layer(8,12)]);s.comp.markerProperty=new Prop('ADBE Marker',[2,6,9],PV.MARKER);const {r}=run(s,{...remove,compMarkers:true});assert.equal(r.ok,true);assert.equal(r.deletedKeys,1);assert.deepEqual(s.comp.markerProperty.keys.map(k=>k.time),[2,7]);});
test('Auto and explicit selection scopes preserve unselected layers',()=>{const a=new Layer(8,12,[],true),b=new Layer(8,12),s=setup([a,b]);assert.equal(run(s,{...insert,scope:'auto'}).r.ok,true);assert.equal(a.inPoint,10);assert.equal(b.inPoint,8);assert.equal(a.selected,true);});
test('read-only preparation reports deletion counts without mutating scene or preferences',()=>{const p=new Prop('ADBE Opacity',[2,5,6,9]),s=setup([new Layer(0,10,[p])]),pl=plan(s,remove),report=s.h.report(pl,null,'CHECK');assert.match(report,/удалению.*2|Удалить ключей: 2/);assert.equal(p.numKeys,4);assert.equal(s.undo.begins,0);});
test('marker properties may become empty without a static animation value transition',()=>{const s=setup([new Layer(8,12)]);s.comp.markerProperty=new Prop('ADBE Marker',[6],PV.MARKER);const {r}=run(s,{...remove,compMarkers:true});assert.equal(r.ok,true);assert.equal(r.deletedKeys,1);assert.equal(s.comp.markerProperty.numKeys,0);});
test('comp marker write failure restores earlier deleted animation keys and all markers',()=>{const p=new Prop('ADBE Opacity',[2,5,6,9]),s=setup([new Layer(0,10,[p])]);s.comp.markerProperty=new Prop('ADBE Marker',[2,6,9],PV.MARKER);s.comp.markerProperty.failOnce=true;const {r}=run(s,{...remove,compMarkers:true});assert.equal(r.ok,false);assert.equal(r.restored,true);assert.deepEqual(p.keys.map(k=>k.time),[2,5,6,9]);assert.deepEqual(s.comp.markerProperty.keys.map(k=>k.time),[2,6,9]);assert.equal(s.undo.ends,1);});
