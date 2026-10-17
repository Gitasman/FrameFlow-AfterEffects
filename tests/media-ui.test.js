const {test}=require('node:test'),assert=require('node:assert/strict');
const {uiEnv}=require('./ui-env'),{Layer}=require('./ae');
function finiteVideo(){
 const l=new Layer(71/24,8);l._start=71/24;l.stretch=100;l.timeRemapEnabled=false;
 l.source={duration:121/24,mainSource:{isStill:false}};return l;
}
function clickAfterPlus(layers){
 const s=uiEnv(layers);s.comp.time=5.625;s.comp.duration=15;
 s.ui.controls.frames.text='5';s.ui.controls.frames.onChange();
 s.ui.controls.after.forward.onClick();return s;
}
function report(s){s.ui.controls.report.onClick();return s.windows.at(-1).children.find(c=>c.type==='edittext').text;}
test('after plus shows explicit media skip, partial report, and movement of available layers',()=>{
 const video=finiteVideo(),other=new Layer(9,12),s=clickAfterPlus([other,video]);
 assert.equal(other.inPoint,9+5/24);assert.equal(video.outPoint,8);
 assert.match(s.ui.controls.status.text,/Слоёв: 1/);
 assert.match(s.ui.controls.status.text,/Пропущено: 1 · предел медиа/);
 assert.equal(s.ui.root.enabled,true);
 const r=report(s);assert.match(r,/ok=true/);assert.match(r,/partial=true/);
 assert.match(r,/Out запрошен 8\.2083/);assert.match(r,/доступен до 8 s/);
 assert.match(r,/Весь слой пропущен/);assert.doesNotMatch(r,/Ошибка:/);
});
test('only blocked footage gives a clear no-change message and usable controls',()=>{
 const video=finiteVideo(),s=clickAfterPlus([video]);
 assert.equal(video.outPoint,8);assert.equal(s.undo.begins,0);
 assert.match(s.ui.controls.status.text,/Предел исходного медиа/);
 assert.match(s.ui.controls.status.text,/Слой пропущен/);
 assert.equal(s.ui.root.enabled,true);assert.equal(s.ui.controls.after.back.enabled,true);
 assert.match(report(s),/changed=0.*skipped=1; partial=false/);
 s.ui.controls.after.back.onClick();assert.equal(video.outPoint,8-5/24);
 assert.match(s.ui.controls.status.text,/Слоёв: 1/);
});
