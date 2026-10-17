const {test}=require('node:test'),assert=require('node:assert/strict');
const {uiEnv}=require('./ui-env'),{Layer,Prop}=require('./ae');
test('repeated UI clicks keep Auto on all layers and preserve manual selection changes between clicks',()=>{
 const p=new Prop('ADBE Opacity',[2,6]),a=new Layer(0,10,[p]),b=new Layer(7,9),s=uiEnv([a,b]);
 const native=p.setSelectedAtKey;p.setSelectedAtKey=function(i,v){native.call(this,i,v);a.selected=true;};
 for(let i=0;i<2;i++){s.ui.controls.after.forward.onClick();assert.match(s.ui.controls.context.text,/Все/);assert.equal(a.selected,false);}
 assert.ok(Math.abs(b.inPoint-(7+2/24))<1e-10);
 b.selected=true;s.ui.controls.after.forward.onClick();assert.equal(b.selected,true);assert.equal(a.selected,false);
 assert.ok(Math.abs(b.inPoint-(7+3/24))<1e-10);assert.match(s.ui.controls.context.text,/Выбрано/);
});
