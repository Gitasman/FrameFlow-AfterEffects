'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(process.env.FF_SOURCE || path.join(__dirname, '..', 'extension', 'jsx', 'host.jsx'), 'utf8');
const definitions = source.slice(source.indexOf('var FFCore ='), source.indexOf('var FFCEP ='));

function fixture({locked = false, selectedKeys = [false, true, false], second = false} = {}) {
  const types = {OneD:1, TwoD:2, ThreeD:3, TwoD_SPATIAL:4, ThreeD_SPATIAL:5, COLOR:6,
    LAYER_INDEX:7, MASK_INDEX:8, SHAPE:9, TEXT_DOCUMENT:10, MARKER:11};
  let writes = 0, undo = 0;
  const keys = [1,2,3].map((time,i) => ({time,value:i*10,selected:selectedKeys[i]}));
  const layer = {index:1,id:101,inPoint:0,outPoint:5,startTime:0,locked,selected:true,
    numProperties:1,selectedProperties:[],stretch:100};
  let startTime=0;
  Object.defineProperty(layer,'startTime',{get:()=>startTime,set:value=>{const delta=value-startTime;startTime=value;keys.forEach(k=>{k.time+=delta;});}});
  const prop = {propertyValueType:types.OneD,propertyType:1,isSpatial:false,canSetExpression:false,
    matchName:'ADBE Opacity',propertyIndex:1,name:'Opacity',
    propertyGroup:() => layer,
    keyTime:i => keys[i-1].time,keyValue:i => keys[i-1].value,keySelected:i => keys[i-1].selected,
    keyInInterpolationType:() => 1,keyOutInterpolationType:() => 1,
    keyInTemporalEase:() => [{speed:0,influence:33.333}],keyOutTemporalEase:() => [{speed:0,influence:33.333}],
    keyTemporalAutoBezier:() => false,keyTemporalContinuous:() => false,
    setValueAtTime:(time,value) => { writes++; const old=keys.find(k=>k.time===time); if(old) old.value=value; else keys.push({time,value,selected:false}); keys.sort((a,b)=>a.time-b.time); },
    removeKey:i=>{writes++;keys.splice(i-1,1);},
    setSelectedAtKey:(i,value)=>{writes++;keys[i-1].selected=value;},
    setInterpolationTypeAtKey:()=>{},setTemporalAutoBezierAtKey:()=>{},setTemporalContinuousAtKey:()=>{}
  };
  Object.defineProperty(prop,'numKeys',{get:()=>keys.length});
  layer.property = id => id === 1 || id === 'ADBE Opacity' ? prop : null;
  const other={index:2,id:102,inPoint:3,outPoint:6,startTime:3,locked:true,selected:true,numProperties:0,selectedProperties:[],property:()=>null};
  const layers = second ? [layer,other] : [layer];
  function CompItem() {}
  const comp = new CompItem();
  Object.assign(comp,{time:2,duration:10,frameDuration:1/24,id:1,numLayers:layers.length,selectedLayers:layers,layer:i=>layers[i-1]});
  const context = {PropertyValueType:types,PropertyType:{PROPERTY:1},KeyframeInterpolationType:{BEZIER:2},
    CompItem,KeyframeEase:function(speed,influence){this.speed=speed;this.influence=influence;},
    app:{project:{activeItem:comp},beginUndoGroup:()=>{undo++;},endUndoGroup:()=>{undo--;}}};
  vm.createContext(context); vm.runInContext(definitions,context);
  return {core:context.FFCore,host:context.FFHost,comp,layer,prop,keys,writes:()=>writes,undo:()=>undo};
}
function request(mode,extra={}) { return {scope:'selected',frames:12,region:'after',direction:1,mode,...extra}; }

test('selected-key mode plans one key and leaves layer boundaries untouched',()=>{
  const f=fixture(), p=f.host.prepare(request('selectedKeys'));
  assert.equal(p.changes.length,1);
  assert.equal(p.changes[0].kind,'property');
  assert.deepEqual(Array.from(p.changes[0].times),[1,2.5,3]);
  assert.equal(f.writes(),0);
  assert.equal(f.layer.outPoint,5);
});
test('key-only apply changes selected key time without moving layer or other keys',()=>{
  const f=fixture(), result=f.host.applyPlan(f.host.prepare(request('selectedKeys')));
  assert.equal(result.ok,true);
  assert.deepEqual(f.keys.map(k=>k.time),[1,2.5,3]);
  assert.deepEqual(f.keys.map(k=>k.value),[0,10,20]);
  assert.deepEqual(f.keys.map(k=>k.selected),[false,true,false]);
  assert.equal(f.layer.startTime,0);assert.equal(f.layer.inPoint,0);assert.equal(f.layer.outPoint,5);
  assert.equal(result.movedKeys,1);assert.equal(f.undo(),0);
});
test('empty selected-key mode never falls back to all keys',()=>{
  const f=fixture({selectedKeys:[false,false,false]}),p=f.host.prepare(request('selectedKeys'));
  assert.equal(p.changes.length,0);assert.equal(f.writes(),0);
});
test('all-keys mode moves only the requested CTI side',()=>{
  const f=fixture(),p=f.host.prepare(request('keys'));
  assert.equal(p.changes[0].kind,'property');
  assert.deepEqual(Array.from(p.changes[0].times),[1,2.5,3.5]);
});
test('legacy default still extends the crossing layer and shifts later keys',()=>{
  const f=fixture(),p=f.host.prepare(request(undefined));
  assert.equal(p.changes[0].kind,'edge');assert.equal(p.changes[0].after.outPoint,5.5);
  assert.deepEqual(Array.from(p.changes[0].properties[0].times),[1,2.5,3.5]);
});
test('whole-layer mode uses layer In as its anchor and includes crossing layers before CTI',()=>{
  const f=fixture(),p=f.host.prepare(request('layers',{region:'before'}));
  assert.equal(p.changes[0].kind,'layer');assert.equal(p.changes[0].after.start,0.5);
  assert.equal(p.changes[0].after.inPoint,0.5);assert.equal(p.changes[0].after.outPoint,5.5);
  assert.deepEqual(Array.from(p.changes[0].properties[0].times),[1.5,2.5,3.5]);
});
test('whole-layer mode does not retime a crossing layer on the after side',()=>{
  const f=fixture();assert.equal(f.host.prepare(request('layers')).changes.length,0);
});
test('strict preflight blocks every write when another requested target is locked',()=>{
  const f=fixture({second:true}),p=f.host.prepare(request('keys',{strict:true}));
  assert.equal(p.changes.length,1);assert.equal(p.skips.length,1);
  const result=f.host.applyPlan(p);assert.equal(result.ok,false);assert.equal(f.writes(),0);assert.equal(f.undo(),0);
});
test('collision blocks selected-key operation before writes',()=>{
  const f=fixture(),p=f.host.prepare(request('selectedKeys',{frames:24}));
  assert.ok(p.errors.length>0);assert.equal(f.host.applyPlan(p).ok,false);assert.equal(f.writes(),0);
});
test('subframe times and fractional FPS do not round to frames',()=>{
  const f=fixture();const out=f.core.keyPlan([{time:1.123,selected:true},{time:4,selected:false}],
    {cti:0,frameDuration:1001/30000},{frames:12,direction:1,region:'after'},true);
  assert.ok(Math.abs(out.times[0]-(1.123+12*1001/30000))<1e-12);assert.equal(out.times[1],4);
});
test('roving partial move is rejected by the existing timing planner',()=>{
  const f=fixture(),out=f.core.keyPlan([{time:1,selected:false},{time:2,selected:true,roving:true},{time:3,selected:false}],
    {cti:0,frameDuration:1/24},request('selectedKeys'),true);
  assert.ok(out.skip);assert.equal(out.moved,0);
});
test('unknown modes cannot cause legacy writes',()=>{
  const f=fixture();assert.throws(()=>f.host.prepare(request('futureMode')));assert.equal(f.writes(),0);
});
test('advanced preferences roundtrip false and protect unknown data',()=>{
  const f=fixture(),core=f.core;
  assert.equal(typeof core.parseAdvancedState,'function');
  const parsed=core.parseAdvancedState(core.encodeAdvancedState({mode:'selectedKeys',strict:false}));
  assert.equal(parsed.settings.strict,false);assert.equal(parsed.settings.mode,'selectedKeys');
  assert.equal(core.parseAdvancedState('v2|mode=keys').storageProtected,true);
  assert.equal(core.parseAdvancedState('v1|mode=keys|mode=layers').storageProtected,true);
});
test('whole-layer apply uses native translation exactly once',()=>{
  const f=fixture(),result=f.host.applyPlan(f.host.prepare(request('layers',{region:'before'})));
  assert.equal(result.ok,true);assert.equal(f.writes(),0);
  assert.deepEqual(f.keys.map(k=>k.time),[1.5,2.5,3.5]);assert.equal(f.layer.startTime,0.5);
});
test('failed key-only apply restores data and retains original property diagnostic',()=>{
  const f=fixture(),plan=f.host.prepare(request('selectedKeys'));
  const setter=f.prop.setValueAtTime;let fail=true;
  f.prop.setValueAtTime=(time,value)=>{if(fail){fail=false;const error=new Error('fixture write failure');error.line=77;throw error;}setter(time,value);};
  const result=f.host.applyPlan(plan);
  assert.equal(result.ok,false);assert.equal(result.error.message,'fixture write failure');assert.equal(result.error.line,77);
  assert.equal(result.failure.kind,'property');assert.equal(result.failure.layerIndex,1);
  assert.equal(result.restored,true);assert.deepEqual(f.keys.map(k=>k.time),[1,2,3]);
  assert.equal(result.recoveryErrors.length,0);assert.equal(f.undo(),0);
});
test('changed lock after planning blocks writes',()=>{
  const f=fixture(),p=f.host.prepare(request('selectedKeys'));f.layer.locked=true;
  assert.equal(f.host.applyPlan(p).ok,false);assert.equal(f.writes(),0);
});
test('unsupported selected property skips its complete layer',()=>{
  const f=fixture();f.prop.propertyValueType=99;
  const p=f.host.prepare(request('selectedKeys'));assert.equal(p.changes.length,0);assert.equal(p.skips.length,1);
});
test('unsupported unselected property does not block selected-key editing',()=>{
  const f=fixture({selectedKeys:[false,false,false]});f.prop.propertyValueType=99;
  const p=f.host.prepare(request('selectedKeys'));assert.equal(p.changes.length,0);assert.equal(p.skips.length,0);
});
test('strict skip also prevents composition marker writes',()=>{
  const f=fixture({locked:true});f.comp.markerProperty=f.prop;
  const p=f.host.prepare(request('keys',{strict:true,compMarkers:true}));assert.equal(p.changes.length,1);
  assert.equal(f.host.applyPlan(p).ok,false);assert.equal(f.writes(),0);
});
test('close-gap retains its original mode-independent whole-layer plan',()=>{
  const f=fixture({second:true});f.comp.layer(2).locked=false;f.layer.outPoint=1;f.comp.time=1.5;
  const p=f.host.prepareGap({scope:'selected',compMarkers:false,mode:'selectedKeys'});
  assert.equal(p.request.mode,undefined);assert.equal(p.changes.length,1);
  assert.equal(p.changes[0].kind,'layer');assert.equal(p.changes[0].after.start,1);
});
