(function(){
  'use strict';
  const M=FFModel,$=id=>document.getElementById(id),icons=id=>'<svg aria-hidden="true"><use href="#i-'+id+'"/></svg>';
  const modeNames={layers:'Слои целиком',keys:'Только ключи',selectedKeys:'Выделенные ключи',offset:'Time Offset'};
  const modeNotes={layers:'Перенос всех ключей вместе со слоем',keys:'Ключи стороны курсора, без изменения краёв',selectedKeys:'Только ключи, выделенные в AE',offset:'Поведение 1.4: край пересекающего слоя и ключи'};
  const labelColors=['#9b9b9b','#c09a9a','#c7be91','#9dbbbb','#b0a4c2','#b6a4bc','#c7b39b','#9fb6b3','#8dabc6','#94b5a0','#b6a0cd','#c59a81','#a2a4c4','#c0a0b1','#8eb8a5','#b6b6b6','#b1bb92'];
  let prefs,preferenceStore,saveTimer=null,saveError='',state=null,bridge=null,isDemo=false,disposed=false,pollTimer=null,busy=false,drag=null,lastAnchor=null,zoom=0,pps=1,labelWidth=226,viewLayers=[],menuOwner=null,dialogFocus=null,lastDirection=['after',1],lastReport='',history=[],rowFrame=0,scrollX=0,readFailures=0,connectionFailed=false;
  const timeline=$('timeline'),surface=$('surface'),rows=$('rows');
  function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function textTime(t){return prefs.units==='frames'?String(M.frame(t,state.frameDuration)):M.timecode(t,state.frameDuration,state.displayStart);}
  function status(text,error){$('status').textContent=text;$('status').title=text;$('status-icon').classList.toggle('error',!!error);}
  function log(op,detail){history.push(new Date().toISOString()+' '+op+' '+String(detail||'').slice(0,350));if(history.length>40)history.shift();}
  function reportText(){
    const d=bridge&&bridge.diagnostics,env=state?state.environment:d&&d.environment;
    return 'FrameFlow '+M.VERSION+'\n'+(isDemo?'ДЕМО · AE не подключён\n':'')+
      (env?'AE '+env.ae+' / build '+env.build+'\nOS '+env.os+'\n'+(env.engine?'ExtendScript '+env.engine+'\n':''):'AE: нет подтверждённого соединения\n')+
      (state?'Comp ID '+state.compId+' / FPS '+(1/state.frameDuration)+' / CTI '+state.time+'\n':'')+
      (d?'Загрузчик: '+d.stage+' / ядро: '+(d.hostVersion||'не подтверждено')+'\n':'')+
      (connectionFailed?'Автообновление приостановлено до «Обновить».\n':'')+'\n'+lastReport+'\n\nПоследние события:\n'+history.join('\n');
  }
  function preferenceError(message){saveError=message;status(message,true);const node=$('settings-status');if(node)node.textContent=message;}
  function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{preferenceStore.save(prefs);saveError='';const el=$('settings-status');if(el)el.textContent='Настройки сохранены на этом компьютере.';}catch(e){preferenceError(e.message);}},220);}
  function change(key,value){try{prefs=M.validate(Object.assign({},prefs,{[key]:value}));applyAppearance();persist();if(['rowHeight','labelWidth','spacing','showKinds','fontSize','units','font'].includes(key))render();if(key==='mode'||key==='scope'||key==='snap'||key==='frames')renderControls();if(['autoRefresh','poll'].includes(key))schedulePoll();return true;}catch(e){status(e.message,true);return false;}}
  function applyAppearance(){
    const style=document.documentElement.style;
    for(const [key,css,unit]of[['fontSize','font-size','px'],['rowHeight','row','px'],['spacing','gap','px'],['labelWidth','labels','px'],['radius','radius','px'],['accent','accent','']])style.setProperty('--'+css,prefs[key]+unit);
    style.setProperty('--selected',hexAlpha(prefs.accent,.13));
    style.setProperty('--font',prefs.font==='mono'?'"SFMono-Regular",Consolas,monospace':prefs.font==='sans'?'Arial,"Helvetica Neue",sans-serif':'system-ui,-apple-system,"Segoe UI",sans-serif');
    let light=prefs.theme==='light';
    if(prefs.theme==='host'&&window.__adobe_cep__){try{const env=JSON.parse(window.__adobe_cep__.getHostEnvironment()),c=env.appSkinInfo.panelBackgroundColor.color;light=c.red+c.green+c.blue>420;}catch(e){light=false;}}
    const effectiveAccent=M.accentFor(prefs.accent,light);style.setProperty('--accent',effectiveAccent);style.setProperty('--selected',hexAlpha(effectiveAccent,.13));
    document.body.classList.toggle('light',light);document.body.classList.toggle('motion',prefs.motion);document.body.classList.toggle('high-contrast',prefs.contrast==='high');
  }
  function hexAlpha(hex,a){return 'rgba('+[1,3,5].map(n=>parseInt(hex.slice(n,n+2),16)).join(',')+','+a+')';}
  function ready(){return !!state&&!busy&&!bridge.uncertain&&!connectionFailed;}
  function targetIds(){return state?(prefs.scope==='all'?state.layers:M.selected(state)).map(l=>l.id):[];}
  function setBusy(value){busy=value;$('app').setAttribute('aria-busy',String(value));renderControls();}
  function renderControls(){
    $('mode').innerHTML=esc(modeNames[prefs.mode])+icons('chevron');$('scope').innerHTML=(prefs.scope==='all'?'Вся композиция':'Выделенные')+icons('chevron');
    if(document.activeElement!==$('frames'))$('frames').value=prefs.frames;
    document.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===prefs.frames));
    $('snap').classList.toggle('active',prefs.snap);$('snap').setAttribute('aria-pressed',String(prefs.snap));
    $('offset-controls').hidden=prefs.mode==='layers';$('offset-hint').textContent=prefs.mode==='offset'?'Край слоя и ключи':'Ключи относительно курсора';
    const r=ready(),selection=M.selected(state),targets=targetIds(),any=targets.length>0;
    ['minus','plus'].forEach(id=>{$(id).disabled=!r||!any||prefs.mode!=='layers';});
    ['trim-in','trim-out','split','apply-in','apply-out','apply-shift'].forEach(id=>{$(id).disabled=!r||selection.length===0;});
    document.querySelectorAll('[data-offset]').forEach(b=>{b.disabled=!r||!any;});$('preview-plan').disabled=!r||!any;$('gap').disabled=!r;$('cti').disabled=!r;$('refresh').disabled=busy;
    $('selection-count').textContent=state?M.selected(state).length+' / '+state.layers.length+' слоёв':'0 слоёв';
    const live=!connectionFailed&&(!!state||bridge&&bridge.connected);
    $('connection').textContent=isDemo?'Демо':connectionFailed?'Сбой связи':live?'AE подключён':'Нет AE';$('connection').className='connection '+(isDemo?'demo':live?'live':'');
  }
  function accept(next,force){
    validateState(next);
    const changed=!state||state.token!==next.token;state=next;
    $('comp-name').textContent=state.name;$('comp-name').title=state.name;
    $('comp-meta').textContent=Number((1/state.frameDuration).toFixed(3))+' fps / '+M.frame(state.duration,state.frameDuration)+' кадров';
    if(changed||force)render();else renderControls();
  }
  function validateState(s){
    if(!s||s.version!==M.VERSION||typeof s.token!=='string'||!s.environment||!Array.isArray(s.layers)||s.layers.length>2000||!Number.isFinite(s.duration)||s.duration<=0||!Number.isFinite(s.frameDuration)||s.frameDuration<=0||!Number.isFinite(s.time))throw Error('Некорректное состояние композиции от AE.');
    const ids=new Set();s.layers.forEach(l=>{if(!Number.isInteger(l.id)||ids.has(l.id)||typeof l.name!=='string'||![l.start,l.inPoint,l.outPoint,l.stretch].every(Number.isFinite))throw Error('Некорректные данные слоя.');ids.add(l.id);});
  }
  async function request(data,quiet){
    if(disposed||busy)return null;
    closeMenu();setBusy(true);
    if(!quiet)status(data.op==='read'?'Обновляем из AE…':'Применяем в AE…');
    try{
      const result=await bridge.call(data);if(disposed)return null;
      if(data.op==='read'){readFailures=0;connectionFailed=false;}
      if(result.state)accept(result.state);
      if(result.report)lastReport=result.report;
      if(result.failure){log(data.op,result.message);lastReport=result.report||JSON.stringify(result.failure,null,2);status(result.message,true);showReport();}
      else if(!quiet){status(result.message||(isDemo?'Демо · AE не подключён':'Синхронизировано с AE'));log(data.op,'подтверждено');}
      return result;
    }catch(e){
      if(disposed)return null;
      connectionFailed=!!(bridge.needsReconnect||bridge.uncertain);
      if(data.op==='read')readFailures++;
      status(e.message,true);
      log(data.op,(e.code?e.code+' / '+e.stage+' · ':'')+e.message);
      lastReport=e.message+(e.code?'\nКод: '+e.code+'\nЭтап: '+e.stage+'\nЗапрос: '+data.op:'')+(e.host?'\n'+JSON.stringify(e.host,null,2):'');
      if(data.op==='read') {state=null;render();$('empty-title').textContent=connectionFailed?'Ядро AE не подключено':'Нет активной композиции';$('empty-text').textContent=e.message;}
      return null;
    }finally{setBusy(false);schedulePoll();}
  }
  function refresh(quiet=false){if(drag||!bridge||(quiet&&connectionFailed))return Promise.resolve(null);return request({op:'read'},quiet);}
  function action(data){if(!ready()){status(bridge&&bridge.uncertain?'Результат действия неизвестен. Нажмите «Обновить».':'Дождитесь подключения к AE.',true);return Promise.resolve(null);}return request(Object.assign({token:state.token},data));}
  function calcScale(){
    labelWidth=window.innerWidth<=600?160:prefs.labelWidth;
    const visible=Math.max(120,timeline.clientWidth-labelWidth-20),base=state?visible/state.duration:1;
    pps=base*Math.pow(2,zoom/12.5);
  }
  function render(){
    calcScale();renderControls();
    if(!state){rows.innerHTML='';$('ruler').innerHTML='';$('empty').hidden=false;$('playhead').hidden=true;$('demo').hidden=!!window.__adobe_cep__;return;}
    const query=$('search').value.toLocaleLowerCase(),only=$('only-selected').checked;
    viewLayers=state.layers.filter(l=>(!only||l.selected)&&(!query||l.name.toLocaleLowerCase().includes(query)));
    const width=Math.ceil(state.duration*pps)+40;
    surface.style.width=(labelWidth+width)+'px';rows.style.height=(viewLayers.length*prefs.rowHeight)+'px';
    $('empty').hidden=viewLayers.length>0;
    if(!viewLayers.length){$('empty-title').textContent=state.layers.length?'Слои не найдены':'Композиция пуста';$('empty-text').textContent=state.layers.length?'Измените поиск или отключите фильтр выделения.':'Добавьте слои в After Effects и обновите панель.';$('demo').hidden=true;}
    renderRuler(width);renderRows();renderTime();renderInspector();
  }
  function tickStep(){
    const target=82/pps;let step=state.frameDuration;
    const candidates=[state.frameDuration,2*state.frameDuration,5*state.frameDuration,10*state.frameDuration,.5,1,2,5,10,15,30,60,120,300,600,1800,3600];
    for(const c of candidates)if(c>=target){step=c;break;}return step;
  }
  function renderRuler(width){
    const step=tickStep(),grid=Math.max(1,step*pps),left=Math.max(0,(timeline.scrollLeft)/pps-step),right=Math.min(state.duration,(timeline.scrollLeft+timeline.clientWidth)/pps),start=Math.max(0,Math.floor(left/step));
    document.documentElement.style.setProperty('--grid',grid+'px');
    let ticks='';for(let i=start;i*step<=right+step;i++){const t=i*step;if(t>state.duration)break;const label=prefs.units==='frames'?M.frame(t,state.frameDuration):M.timecode(t,state.frameDuration,state.displayStart).replace(/^00:/,'');ticks+='<div class="tick major" style="left:'+t*pps+'px"><span>'+esc(label)+'</span></div>';}
    $('ruler').innerHTML='<div class="ruler-label"><span>Слой</span><button id="select-visible" title="Выделить все видимые слои">Выбрать всё</button></div><div class="ruler-track" style="width:'+width+'px">'+ticks+'<div class="work-area" style="left:'+state.workStart*pps+'px;width:'+state.workDuration*pps+'px"></div></div>';
  }
  function clip(l,ghost,bounds){
    const a=bounds?bounds.inPoint:l.inPoint,b=bounds?bounds.outPoint:l.outPoint,left=Math.max(0,a*pps),right=Math.min(state.duration*pps,b*pps);
    if(right<0||left>state.duration*pps)return '';
    return '<div class="clip '+(l.locked?'locked ':'')+(!l.enabled?'disabled ':'')+(ghost?'drag-ghost':'')+'" '+(ghost?'':'data-clip="'+l.id+'" tabindex="-1"')+' style="left:'+left+'px;width:'+Math.max(2,right-left)+'px" title="'+esc(l.name+' · '+textTime(a)+' — '+textTime(b)+(l.locked?' · Locked':''))+'"><span class="handle in" data-edge="in"></span><span class="clip-name">'+esc(l.name)+'</span><span class="handle out" data-edge="out"></span></div>';
  }
  function renderRows(){
    if(!state)return;const start=Math.max(0,Math.floor((timeline.scrollTop-34)/prefs.rowHeight)-3),end=Math.min(viewLayers.length,start+Math.ceil(timeline.clientHeight/prefs.rowHeight)+8),width=Math.ceil(state.duration*pps)+40;
    let html='';for(let i=start;i<end;i++){
      const l=viewLayers[i],color=labelColors[l.label]||labelColors[0],kind={text:'T',shape:'◇',comp:'▣',camera:'C',light:'L',null:'N',audio:'♪',media:'▰'}[l.kind]||'▰';
      html+='<div class="layer-row '+(l.selected?'selected':'')+'" data-row="'+l.id+'" style="top:'+i*prefs.rowHeight+'px;--clip:'+color+'"><div class="layer-label" data-select="'+l.id+'" tabindex="-1" title="'+esc(l.name)+'"><span class="layer-index">'+l.index+'</span><span class="layer-color"></span>'+(prefs.showKinds?'<span class="layer-kind" aria-label="'+esc(l.kind)+'">'+kind+'</span>':'')+'<span class="layer-name">'+esc(l.name)+'</span><span class="layer-state">'+(l.locked?icons('lock'):'')+(!l.enabled?icons('eye'):'')+'</span></div><div class="layer-track" style="width:'+width+'px">'+clip(l,false)+'</div></div>';
    }
    rows.innerHTML=html;
  }
  function renderTime(time){
    if(!state)return;const t=time===undefined?state.time:time;
    if(document.activeElement!==$('cti'))$('cti').value=textTime(t);
    $('frame-label').textContent=M.frame(t,state.frameDuration)+'f';
    const x=labelWidth+t*pps;$('playhead').style.left=x+'px';$('playhead').hidden=x<timeline.scrollLeft+labelWidth-1;
  }
  function renderInspector(){
    const selected=M.selected(state),one=selected.length===1?selected[0]:null;
    $('inspect-name').textContent=one?one.name:selected.length?selected.length+' выбранных слоёв':'Выберите слой';
    for(const [id,value]of[['in-value',one?textTime(one.inPoint):''],['out-value',one?textTime(one.outPoint):'']])if(document.activeElement!==$(id))$(id).value=value;
    $('inspect-duration').textContent=one?M.frame(one.outPoint-one.inPoint,state.frameDuration)+' кадров':'—';$('inspect-start').textContent=one?textTime(one.start):'—';
  }
  function schedulePoll(){
    clearTimeout(pollTimer);if(disposed||connectionFailed||!prefs.autoRefresh||isDemo||!window.__adobe_cep__)return;
    const interval=Math.min(30000,prefs.poll*Math.pow(2,Math.min(readFailures,5)));
    pollTimer=setTimeout(()=>{if(!busy&&!drag&&!document.hidden&&$('overlay').hidden&&!document.querySelector('input:focus'))refresh(true);else schedulePoll();},document.hasFocus()?interval:Math.max(3000,interval));
  }
  function setZoom(next,anchorTime){
    if(drag)return;const old=pps,center=anchorTime===undefined?(timeline.scrollLeft+(timeline.clientWidth-labelWidth)/2)/old:anchorTime;
    zoom=Math.min(100,Math.max(0,next));$('zoom').value=zoom;render();timeline.scrollLeft=Math.max(0,center*pps-(timeline.clientWidth-labelWidth)/2);renderRuler(Math.ceil(state?state.duration*pps:1)+40);renderTime();
  }
  async function select(id,e){
    if(!ready())return;let next=M.selected(state).map(l=>l.id);
    if(e.shiftKey&&lastAnchor!==null){const a=viewLayers.findIndex(l=>l.id===lastAnchor),b=viewLayers.findIndex(l=>l.id===id);next=viewLayers.slice(Math.min(a<0?b:a,b),Math.max(a<0?b:a,b)+1).map(l=>l.id);}
    else if(e.ctrlKey||e.metaKey)next=next.includes(id)?next.filter(v=>v!==id):next.concat(id);
    else next=[id];lastAnchor=id;return action({op:'select',ids:next});
  }
  function pointerTime(e){return Math.max(0,Math.min(state.duration-state.frameDuration,(e.clientX-timeline.getBoundingClientRect().left+timeline.scrollLeft-labelWidth)/pps));}
  function clearDrag(){
    if(!drag)return;const pointer=drag.pointer;drag=null;try{timeline.releasePointerCapture(pointer);}catch(e){}
    rows.querySelectorAll('.drag-ghost').forEach(el=>el.remove());rows.querySelectorAll('.drag-source').forEach(el=>el.classList.remove('drag-source'));
    $('guide').hidden=true;$('ghost-label').hidden=true;renderTime();
  }
  function pointerDown(e){
    if(!ready()||e.button===2||e.target.closest('.ruler-label'))return;
    if(e.button===1){e.preventDefault();drag={kind:'pan',pointer:e.pointerId,x:e.clientX,scroll:timeline.scrollLeft};timeline.setPointerCapture(e.pointerId);return;}
    const el=e.target.closest('[data-clip]'),label=e.target.closest('[data-select]');
    if(label){e.preventDefault();timeline.focus();select(Number(label.dataset.select),e);return;}
    if(el){
      const id=Number(el.dataset.clip),l=state.layers.find(l=>l.id===id);
      if(e.ctrlKey||e.metaKey||e.shiftKey){e.preventDefault();select(id,e);return;}
      if(l.locked){status('Слой заблокирован. Снимите блокировку в AE.',true);return;}
      const edge=e.target.dataset.edge,ids=l.selected?M.selected(state).map(l=>l.id):[id];
      if(state.layers.filter(l=>ids.includes(l.id)).some(l=>l.locked)){status('В выделении есть заблокированный слой.',true);return;}
      drag={kind:edge?'trim':'move',edge,layer:l,ids:edge?[id]:ids,pointer:e.pointerId,x:e.clientX,scroll:timeline.scrollLeft,token:state.token,delta:0,value:edge==='in'?l.inPoint:l.outPoint,moved:false};
      if(!l.selected){lastAnchor=id;drag.selectionPromise=action({op:'select',ids:[id]});}
    }else if(e.target.closest('.ruler-track')||e.target.closest('.layer-track')){
      drag={kind:'seek',pointer:e.pointerId,time:Math.min(state.duration-state.frameDuration,Math.round(pointerTime(e)/state.frameDuration)*state.frameDuration)};renderTime(drag.time);
    }else return;
    e.preventDefault();timeline.focus();timeline.setPointerCapture(e.pointerId);
  }
  function pointerMove(e){
    if(!drag||drag.pointer!==e.pointerId)return;
    if(drag.kind==='pan'){timeline.scrollLeft=drag.scroll-(e.clientX-drag.x);return;}
    if(drag.kind==='seek'){drag.time=Math.min(state.duration-state.frameDuration,Math.round(pointerTime(e)/state.frameDuration)*state.frameDuration);renderTime(drag.time);return;}
    if(Math.abs(e.clientX-drag.x)<3&&!drag.moved)return;drag.moved=true;
    const fd=state.frameDuration;
    let delta=Math.round(((e.clientX-drag.x+timeline.scrollLeft-drag.scroll)/pps)/fd)*fd;
    let snap=M.snapDelta(state,drag.ids,delta,pps,prefs.snap&&!e.altKey,false),guide=snap.guide;
    if(drag.kind==='move'){delta=snap.delta;drag.delta=delta/fd;}
    else{
      const edge=drag.edge==='in'?drag.layer.inPoint:drag.layer.outPoint;
      let value=edge+delta;
      if(prefs.snap&&!e.altKey){let best=7/pps;guide=null;[0,state.duration,state.time,...state.layers.filter(l=>l.id!==drag.layer.id).flatMap(l=>[l.inPoint,l.outPoint])].forEach(t=>{const d=Math.abs(value-t);if(d<best){best=d;value=t;guide=t;}});}
      drag.value=M.trimLimit(drag.layer,drag.edge,value,fd);delta=drag.value-edge;if(Math.abs(drag.value-value)>fd*.00001)guide=null;
    }
    rows.querySelectorAll('.drag-ghost').forEach(el=>el.remove());
    drag.ids.forEach(id=>{const l=state.layers.find(l=>l.id===id),el=rows.querySelector('[data-clip="'+id+'"]');if(!el)return;el.classList.add('drag-source');const bounds=drag.kind==='move'?{inPoint:l.inPoint+delta,outPoint:l.outPoint+delta}:{inPoint:drag.edge==='in'?drag.value:l.inPoint,outPoint:drag.edge==='out'?drag.value:l.outPoint};el.parentElement.insertAdjacentHTML('beforeend',clip(l,true,bounds));});
    $('guide').hidden=guide===null;$('guide').style.left=(labelWidth+(guide||0)*pps)+'px';
    const label=$('ghost-label');label.hidden=false;label.textContent=drag.kind==='move'?(delta>=0?'+':'')+Number((delta/fd).toFixed(3))+' кадров':(drag.edge==='in'?'In ':'Out ')+textTime(drag.value);
    label.style.left=Math.min(labelWidth+Math.max(0,drag.layer.inPoint+delta)*pps,timeline.scrollLeft+timeline.clientWidth-130)+'px';
  }
  async function pointerUp(e){
    if(!drag||drag.pointer!==e.pointerId)return;const d=drag;clearDrag();
    if(d.kind==='seek'){action({op:'seek',time:d.time});return;}
    if(d.selectionPromise){const selected=await d.selectionPromise;if(!selected||selected.failure)return;}
    if(!d.moved)return;
    if(d.kind==='move'&&Math.abs(d.delta)>1e-7)action({op:'move',ids:d.ids,deltaFrames:d.delta});
    else if(d.kind==='trim')action({op:'trim',ids:d.ids,edge:d.edge,time:d.value});
  }
  function closeMenu(){if(menuOwner){menuOwner.setAttribute('aria-expanded','false');menuOwner=null;}$('menu').hidden=true;}
  function openMenu(owner,items){
    const was=menuOwner===owner;closeMenu();if(was)return;
    menuOwner=owner;owner.setAttribute('aria-expanded','true');const menu=$('menu');menu.innerHTML='';
    items.forEach(item=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked',String(item.active));b.innerHTML='<span class="menu-copy"><span>'+esc(item.label)+'</span>'+(item.note?'<small>'+esc(item.note)+'</small>':'')+'</span>'+(item.active?icons('check'):'');b.onclick=()=>{item.onClick();closeMenu();owner.focus();};menu.append(b);});
    menu.hidden=false;const rect=owner.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(rect.left,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.min(rect.bottom+5,innerHeight-menu.offsetHeight-8)+'px';menu.querySelector('button').focus();
  }
  function openDialog(title,html){
    closeMenu();if($('overlay').hidden)dialogFocus=document.activeElement;$('dialog-title').textContent=title;$('dialog-body').innerHTML=html;$('overlay').hidden=false;$('dialog').focus();
  }
  function closeDialog(){$('overlay').hidden=true;if(dialogFocus&&document.contains(dialogFocus))dialogFocus.focus();schedulePoll();}
  function download(name,text){
    const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function choice(key,choices){return '<div class="settings-choice">'+choices.map(([v,label])=>'<button data-pref="'+key+'" data-value="'+v+'" class="'+(prefs[key]===v?'active':'')+'">'+esc(label)+'</button>').join('')+'</div>';}
  function range(key,label){const [min,max]=M.ranges[key];return '<div class="setting-row"><label for="pref-'+key+'">'+label+'</label><div class="range-wrap"><input id="pref-'+key+'" data-range="'+key+'" type="range" min="'+min+'" max="'+max+'" value="'+prefs[key]+'"><output>'+prefs[key]+'</output></div></div>';}
  function toggle(key,label){return '<label class="setting-row"><span>'+label+'</span><input type="checkbox" data-toggle="'+key+'" '+(prefs[key]?'checked':'')+'></label>';}
  function showSettings(){
    openDialog('Настройки','<h3>Внешний вид</h3>'+choice('theme',[['dark','Тёмная'],['light','Светлая'],['host','Как в AE']])+'<h3>Шрифт</h3>'+choice('font',[['system','Системный'],['sans','Arial'],['mono','Моноширинный']])+'<div class="settings-grid">'+range('fontSize','Размер текста')+range('rowHeight','Высота слоя')+range('spacing','Отступ в строке')+range('labelWidth','Ширина имён')+range('radius','Скругление')+'<div class="setting-row"><label for="pref-accent">Акцент</label><input id="pref-accent" type="color" value="'+prefs.accent+'"></div></div><h3>Время</h3>'+choice('units',[['timecode','Таймкод'],['frames','Кадры']])+'<p class="note">Таймкод NDF. Для 23.976 / 29.97 нумерация кадров; bare-число в таймкоде — секунды. Отрицательный Start поддерживается.</p><div class="settings-grid">'+toggle('snap','Привязка')+toggle('compMarkers','Маркеры композиции')+toggle('showKinds','Типы слоёв')+toggle('autoRefresh','Обновлять из AE')+toggle('motion','Анимация окон')+'<label class="setting-row"><span>Повышенный контраст</span><input type="checkbox" data-contrast="true" '+(prefs.contrast==='high'?'checked':'')+'></label>'+'</div><h3>Плотность</h3><div class="settings-choice"><button data-preset="compact">Компактно</button><button data-preset="balanced">Удобно</button><button data-preset="large">Крупнее</button></div><p id="settings-status" class="settings-status">'+esc(saveError||'Вид сохраняется автоматически. Сцена не меняется.')+'</p><div class="settings-actions"><button id="export-settings" class="secondary-button">Экспорт JSON</button><button id="import-settings" class="secondary-button">Импорт</button><button id="reset-appearance" class="quiet-button">Сбросить вид</button></div>');
    const body=$('dialog-body');
    body.querySelectorAll('[data-pref]').forEach(b=>b.onclick=()=>{if(change(b.dataset.pref,b.dataset.value)){body.querySelectorAll('[data-pref="'+b.dataset.pref+'"]').forEach(el=>el.classList.toggle('active',el===b));}});
    body.querySelectorAll('[data-range]').forEach(input=>input.oninput=()=>{if(change(input.dataset.range,Number(input.value)))input.nextElementSibling.textContent=input.value;});
    body.querySelectorAll('[data-toggle]').forEach(input=>input.onchange=()=>change(input.dataset.toggle,input.checked));
    body.querySelector('[data-contrast]').onchange=e=>change('contrast',e.target.checked?'high':'normal');
    $('pref-accent').oninput=e=>change('accent',e.target.value);
    body.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const p={compact:{rowHeight:32,fontSize:11,spacing:2},balanced:{rowHeight:38,fontSize:12,spacing:4},large:{rowHeight:48,fontSize:14,spacing:6}}[b.dataset.preset];prefs=M.validate(Object.assign({},prefs,p));applyAppearance();persist();render();showSettings();});
    $('reset-appearance').onclick=()=>{for(const k of ['theme','font','fontSize','rowHeight','spacing','labelWidth','radius','accent','motion','contrast','showKinds'])prefs[k]=M.defaults[k];applyAppearance();persist();render();showSettings();};
    $('export-settings').onclick=()=>download('FrameFlow-settings-v1.json',JSON.stringify(prefs,null,2));$('import-settings').onclick=()=>$('import-file').click();
  }
  function showReport(autoCopy=false){
    openDialog('Отчёт FrameFlow','<p class="note">Отчёт остаётся на вашем компьютере. Просмотрите текст перед отправкой.</p><textarea id="report-text" class="report-text" readonly aria-label="Текст отчёта"></textarea><div class="settings-actions"><button id="copy-report" class="primary-button">Скопировать</button><button id="export-report" class="secondary-button">Сохранить TXT</button><span id="report-copy-state" class="note" role="status" aria-live="polite"></span></div>');
    $('report-text').value=reportText();
    const field=$('report-text'),copyState=$('report-copy-state');
    function copied(message){if(document.contains(copyState))copyState.textContent=message;}
    async function copy(){
      field.focus();field.select();
      // Synchronous copy preserves the user's click in CEP's older Chromium.
      // navigator.clipboard can exist there but reject with NotAllowedError.
      try{if(document.execCommand('copy')){copied('Скопировано');return;}}catch(e){}
      try{if(!navigator.clipboard||typeof navigator.clipboard.writeText!=='function')throw Error('copy');await navigator.clipboard.writeText(field.value);copied('Скопировано');}
      catch(e){copied('Копирование заблокировано. Текст выделен: Ctrl/Cmd+C.');}
    }
    $('copy-report').onclick=copy;$('export-report').onclick=()=>download('FrameFlow-'+M.VERSION+'-report.txt',field.value);
    if(autoCopy)copy();
  }
  function showHelp(){openDialog('Работа с FrameFlow','<p class="help-text"><strong>Выделите → перенесите → Undo в AE.</strong><br>Щелчок по имени выделяет слой в AE. Ctrl/Cmd добавляет или снимает выделение, Shift выделяет диапазон.</p><p class="help-text">Потяните выбранный блок для переноса. Край блока меняет только In / Out этого слоя. Локальный предпросмотр записывается при отпускании мыши; Escape отменяет жест. Для точного ввода откройте панель значений справа.</p><table class="help-table"><tr><td>Сдвиг на кадр / на шаг</td><td>← → / Shift + ← →</td></tr><tr><td>Разделить по курсору</td><td>S</td></tr><tr><td>In / Out по курсору</td><td>[ / ]</td></tr><tr><td>Вся композиция / обновить</td><td>F / R</td></tr><tr><td>Привязка / временно без неё</td><td>N / Alt</td></tr><tr><td>Панорамирование</td><td>Средняя кнопка / Shift + колесо</td></tr><tr><td>Масштаб</td><td>Ctrl/Cmd + колесо</td></tr></table><p class="help-text">Горячие клавиши действуют при фокусе внутри панели. <strong>Undo / Redo выполняйте в AE</strong>: панель обновится автоматически или по R.</p><p class="help-text">Split не применяется к Parent / Track Matte связям. Time Remap и обратный Stretch допускают укорачивание; расширение проверяется по исходному медиа. Вложенные композиции изнутри не меняются.</p><p class="help-text">Режимы ключей используют выделение ключей в AE. По умолчанию любая недоступная цель блокирует всю операцию; перед записью данные проверяются заново. «Проверить» показывает план последнего направления.</p>');}
  function offset(region,direction,preview){lastDirection=[region,direction];return action({op:'offset',ids:targetIds(),mode:prefs.mode,frames:readFrames(),region,direction,compMarkers:prefs.compMarkers,preview:!!preview}).then(result=>{if(preview&&result)showReport();});}
  function readFrames(){const n=Number($('frames').value);if(!Number.isInteger(n)||n<1||n>1000000)throw Error('Шаг: целое число от 1 до 1000000.');return n;}
  function safe(fn){return (...args)=>{try{const result=fn(...args);if(result&&result.catch)result.catch(e=>status(e.message,true));}catch(e){status(e.message,true);}};}
  function moveStep(direction){const frames=readFrames();return action({op:'move',ids:targetIds(),deltaFrames:direction*frames});}
  function trim(edge,value){return action({op:'trim',ids:M.selected(state).map(l=>l.id),edge,time:value===undefined?state.time:value});}
  function keydown(e){
    if(e.key==='Escape'){if(drag){clearDrag();status('Перетаскивание отменено · сцена не менялась');return;}if(!$('menu').hidden){const owner=menuOwner;closeMenu();owner.focus();return;}if(!$('overlay').hidden){closeDialog();return;}}
    if(drag)return;
    if(!$('overlay').hidden){if(e.key==='Tab'){const focus=[...$('dialog').querySelectorAll('button,input,textarea,[tabindex="0"]')].filter(el=>!el.disabled&&!el.hidden);if(focus.length){if(e.shiftKey&&(document.activeElement===focus[0]||document.activeElement===$('dialog'))){e.preventDefault();focus[focus.length-1].focus();}else if(!e.shiftKey&&document.activeElement===focus[focus.length-1]){e.preventDefault();focus[0].focus();}}}return;}
    if(!$('menu').hidden){if(e.key==='Tab'){closeMenu();return;}const items=[...$('menu').querySelectorAll('button')],index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}return;}
    if(/INPUT|TEXTAREA/.test(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;
    const key=e.key.toLowerCase();
    if(key==='r'){e.preventDefault();refresh();}else if(key==='f'){e.preventDefault();setZoom(0);}else if(key==='n'){e.preventDefault();change('snap',!prefs.snap);}else if(key==='?')showHelp();
    else if(ready()){
      if(key==='s'){e.preventDefault();action({op:'split',ids:M.selected(state).map(l=>l.id),time:state.time});}
      else if(key==='['){e.preventDefault();trim('in');}else if(key===']'){e.preventDefault();trim('out');}
      else if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();action({op:'move',ids:M.selected(state).map(l=>l.id),deltaFrames:(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?readFrames():1)});}
    }
  }
  function setup(){
    try{preferenceStore=M.storage(localStorage);const loaded=preferenceStore.load();prefs=loaded.value;if(loaded.error)saveError=loaded.error;}catch(e){prefs=Object.assign({},M.defaults);saveError='Хранилище недоступно. Настройки действуют в этой сессии.';preferenceStore={save(){throw Error(saveError);}};}
    applyAppearance();
    if(window.__adobe_cep__&&typeof window.__adobe_cep__.evalScript==='function'){bridge=FFBridge.createCEP(window.__adobe_cep__);refresh();}
    else{bridge=FFBridge.create(()=>{throw Error('Откройте FrameFlow через Window → Extensions в After Effects.');});$('empty-title').textContent='Откройте панель в After Effects';$('empty-text').textContent='Этот файл — интерфейс CEP-расширения. Демо позволяет посмотреть управление без AE.';$('demo').hidden=false;status('Нет подключения к AE');renderControls();}
    $('demo').onclick=()=>{bridge.dispose();bridge=FFDemo.create();isDemo=true;connectionFailed=false;readFailures=0;status('Демо · операции не затрагивают AE');refresh();};
    if(!window.__adobe_cep__&&new URLSearchParams(location.search).get('demo')==='1')$('demo').click();
    $('refresh').onclick=()=>refresh();$('open-settings').onclick=showSettings;$('open-help').onclick=showHelp;$('open-report').onclick=()=>showReport(true);
    $('mode').onclick=()=>openMenu($('mode'),Object.keys(modeNames).map(v=>({label:modeNames[v],note:modeNotes[v],active:prefs.mode===v,onClick:()=>change('mode',v)})));
    $('scope').onclick=()=>openMenu($('scope'),[{label:'Выделенные слои',note:'Без выделения действие недоступно',active:prefs.scope==='selected',onClick:()=>change('scope','selected')},{label:'Вся композиция',note:'Включая скрытые и заблокированные слои',active:prefs.scope==='all',onClick:()=>change('scope','all')}]);
    $('minus').onclick=safe(()=>moveStep(-1));$('plus').onclick=safe(()=>moveStep(1));$('frames').onchange=safe(()=>change('frames',readFrames()));
    document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>change('frames',Number(b.dataset.step)));
    document.querySelectorAll('[data-offset]').forEach(b=>b.onclick=safe(()=>{const [region,direction]=b.dataset.offset.split(':');return offset(region,Number(direction));}));
    $('preview-plan').onclick=safe(()=>offset(lastDirection[0],lastDirection[1],true));
    $('trim-in').onclick=safe(()=>trim('in'));$('trim-out').onclick=safe(()=>trim('out'));$('split').onclick=safe(()=>action({op:'split',ids:M.selected(state).map(l=>l.id),time:state.time}));
    $('apply-in').onclick=safe(()=>trim('in',M.parseTime($('in-value').value,state.frameDuration,state.displayStart,prefs.units)));$('apply-out').onclick=safe(()=>trim('out',M.parseTime($('out-value').value,state.frameDuration,state.displayStart,prefs.units)));
    $('apply-shift').onclick=safe(()=>{const n=Number($('exact-shift').value);if(!Number.isFinite(n)||!n||Math.abs(n)>1000000)throw Error('Введите ненулевое число кадров.');return action({op:'move',ids:M.selected(state).map(l=>l.id),deltaFrames:n});});
    $('gap').onclick=safe(()=>action({op:'gap',scope:prefs.scope,compMarkers:prefs.compMarkers}));
    $('inspect').onclick=()=>{$('inspector').hidden=!$('inspector').hidden;$('inspect').setAttribute('aria-pressed',String(!$('inspector').hidden));render();};$('close-inspector').onclick=()=>$('inspect').click();
    $('cti').onkeydown=safe(e=>{if(e.key==='Enter'){const time=M.parseTime(e.target.value,state.frameDuration,state.displayStart,prefs.units);if(time<0||time>state.duration-state.frameDuration)throw Error('Курсор должен быть внутри композиции.');e.target.blur();return action({op:'seek',time});}if(e.key==='Escape'){e.target.blur();renderTime();}});
    $('search').oninput=()=>{timeline.scrollTop=0;render();};$('only-selected').onchange=()=>{timeline.scrollTop=0;render();};
    $('snap').onclick=()=>change('snap',!prefs.snap);$('fit').onclick=()=>setZoom(0);$('zoom').oninput=e=>setZoom(Number(e.target.value));$('zoom-in').onclick=()=>setZoom(zoom+10);$('zoom-out').onclick=()=>setZoom(zoom-10);
    timeline.addEventListener('pointerdown',safe(pointerDown));timeline.addEventListener('pointermove',pointerMove);timeline.addEventListener('pointerup',safe(pointerUp));timeline.addEventListener('pointercancel',clearDrag);timeline.addEventListener('lostpointercapture',()=>{if(drag)clearDrag();});
    timeline.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();if(state)setZoom(zoom+(e.deltaY<0?5:-5));}else if(e.shiftKey){e.preventDefault();timeline.scrollLeft+=e.deltaY+e.deltaX;}},{passive:false});
    timeline.addEventListener('scroll',()=>{if(!rowFrame)rowFrame=requestAnimationFrame(()=>{rowFrame=0;if(drag&&drag.kind!=='pan')return;renderRows();if(state&&scrollX!==timeline.scrollLeft){scrollX=timeline.scrollLeft;renderRuler(Math.ceil(state.duration*pps)+40);}renderTime();});});
    $('ruler').addEventListener('click',e=>{if(e.target.closest('#select-visible'))action({op:'select',ids:viewLayers.map(l=>l.id)});});
    document.addEventListener('keydown',safe(keydown));document.addEventListener('pointerdown',e=>{if(menuOwner&&!$('menu').contains(e.target)&&!menuOwner.contains(e.target))closeMenu();});
    $('close-dialog').onclick=closeDialog;$('overlay').onclick=e=>{if(e.target===$('overlay'))closeDialog();};
    $('import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>20000)throw Error('Файл настроек превышает 20 KB.');const next=M.validate(JSON.parse(await file.text()));prefs=next;applyAppearance();persist();render();showSettings();}catch(error){preferenceError(error.message);}finally{e.target.value='';}};
    window.addEventListener('resize',()=>{closeMenu();if(drag)clearDrag();render();});window.addEventListener('focus',()=>{if(!busy&&!drag&&$('overlay').hidden)refresh(true);});
    window.addEventListener('blur',()=>{if(drag){clearDrag();status('Жест отменён при смене окна.');}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)clearDrag();else schedulePoll();});
    window.addEventListener('beforeunload',()=>{disposed=true;clearTimeout(pollTimer);clearTimeout(saveTimer);try{preferenceStore.save(prefs);}catch(e){}bridge.dispose();});
    new ResizeObserver(()=>{if(!drag)render();}).observe(timeline);
    schedulePoll();if(saveError)status(saveError,true);
  }
  setup();
}());
