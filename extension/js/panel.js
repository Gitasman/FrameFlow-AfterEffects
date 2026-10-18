(function(){
  'use strict';
  const M=FFModel,$=id=>document.getElementById(id),icons=id=>'<svg aria-hidden="true"><use href="#i-'+id+'"/></svg>';
  const modeNames={offset:'Слои и ключи',layers:'Слои целиком',keys:'Все ключи на стороне курсора',selectedKeys:'Выделенные ключи'};
  const modeShort={offset:'На стороне — слой целиком; на пересечении — край и ключи.',layers:'Целый слой со всеми ключами; сторона — по началу слоя.',keys:'Только ключи на выбранной стороне; слой остаётся на месте.',selectedKeys:'Только выделенные в AE ключи на выбранной стороне.'};
  const modeNotes={offset:'Слои на выбранной стороне сдвигаются целиком. У пересекающего курсор слоя меняются край и ключи этой стороны.',layers:'Перемещается весь слой вместе со всеми ключами. Сторона определяется по началу слоя (In).',keys:'Переносятся ключи выбранной стороны. Start, In и Out слоя сохраняются.',selectedKeys:'Переносятся только ключи, выделенные в AE и находящиеся на выбранной стороне курсора.'};
  let prefs,preferenceStore,saveTimer=null,saveError='',state=null,bridge=null,isDemo=false,disposed=false,pollTimer=null,busy=false,menuOwner=null,dialogFocus=null,lastDirection=['after',1],lastReport='',history=[],readFailures=0,connectionFailed=false,frameDraft=false,quickDraft=null,previewMode=false,activePreview=null;
  function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function status(text,error,warning){$('status').textContent=text;$('status').title=text;$('status-icon').classList.toggle('error',!!error);$('status-icon').classList.toggle('warning',!!warning&&!error);}
  function log(op,detail){history.push(new Date().toISOString()+' '+op+' '+String(detail||'').slice(0,350));if(history.length>40)history.shift();}
  function reportText(){const d=bridge&&bridge.diagnostics,env=state?state.environment:d&&d.environment;return 'FrameFlow '+M.VERSION+'\n'+(isDemo?'ДЕМО · AE не подключён\n':'')+(env?'AE '+env.ae+' / build '+env.build+'\nOS '+env.os+'\n'+(env.engine?'ExtendScript '+env.engine+'\n':''):'AE: нет подтверждённого соединения\n')+(state?'Comp ID '+state.compId+' / FPS '+Number((1/state.frameDuration).toFixed(3))+' / CTI '+state.time+'\n':'')+'Область: '+prefs.scope+' / режим: '+prefs.mode+' / шаг: '+prefs.frames+' / исходник: '+prefs.mediaPolicy+'\n'+(d?'Загрузчик: '+d.stage+' / ядро: '+(d.hostVersion||'не подтверждено')+'\n':'')+(connectionFailed?'Автообновление приостановлено до «Обновить».\n':'')+'\n'+lastReport+'\n\nПоследние события:\n'+history.join('\n');}
  function preferenceError(message){saveError=message;status(message,true);const node=$('settings-status');if(node)node.textContent=message;}
  function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{preferenceStore.save(prefs);saveError='';if($('settings-status'))$('settings-status').textContent='Настройки сохранены.';}catch(e){preferenceError(e.message);}},220);}
  function change(key,value){try{prefs=M.validate(Object.assign({},prefs,{[key]:value}));applyAppearance();persist();if(key==='quickSteps')renderPresets();render();if(key==='autoRefresh'||key==='poll')schedulePoll();return true;}catch(e){status(e.message,true);return false;}}
  function applyAppearance(){const style=document.documentElement.style;for(const [key,css,unit]of[['fontSize','font-size','px'],['rowHeight','row','px'],['spacing','gap','px'],['radius','radius','px']])style.setProperty('--'+css,prefs[key]+unit);style.setProperty('--font',prefs.font==='mono'?'"SFMono-Regular",Consolas,monospace':prefs.font==='sans'?'Arial,"Helvetica Neue",sans-serif':'system-ui,-apple-system,"Segoe UI",sans-serif');let light=prefs.theme==='light';if(prefs.theme==='host'&&window.__adobe_cep__){try{const c=JSON.parse(window.__adobe_cep__.getHostEnvironment()).appSkinInfo.panelBackgroundColor.color;light=c.red+c.green+c.blue>420;}catch(e){}}const accent=M.accentFor(prefs.accent,light);style.setProperty('--accent',accent);style.setProperty('--selected','rgba('+[1,3,5].map(n=>parseInt(accent.slice(n,n+2),16)).join(',')+',.13)');document.body.classList.toggle('light',light);document.body.classList.toggle('motion',prefs.motion);document.body.classList.toggle('high-contrast',prefs.contrast==='high');}
  function ready(){return !!state&&!busy&&!connectionFailed&&!bridge.uncertain;}
  function validateState(s){if(!s||s.version!==M.VERSION||typeof s.token!=='string'||!s.environment||!Array.isArray(s.layers)||s.layers.length>2000||!Number.isFinite(s.duration)||s.duration<=0||!Number.isFinite(s.frameDuration)||s.frameDuration<=0||!Number.isFinite(s.time))throw Error('Некорректное состояние композиции от AE.');const ids=new Set();s.layers.forEach(l=>{if(!Number.isInteger(l.id)||ids.has(l.id)||typeof l.name!=='string'||![l.start,l.inPoint,l.outPoint,l.stretch].every(Number.isFinite))throw Error('Некорректные данные слоя.');ids.add(l.id);});}
  function accept(s){validateState(s);state=s;}
  function renderPresets(){$('presets').innerHTML=prefs.quickSteps.map(n=>'<button data-step="'+n+'" title="Шаг '+n+' кадров">'+n+'</button>').join('');$('presets').querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>setFrames(Number(b.dataset.step)));}
  function validFrames(){const raw=String($('frames').value).trim(),n=Number(raw);return /^\d+$/.test(raw)&&Number.isInteger(n)&&n>=1&&n<=1000000;}
  function readFrames(){if(!validFrames())throw Error('Шаг: целое число от 1 до 1000000 кадров.');return Number($('frames').value);}
  function setFrames(n){n=Math.max(1,Math.min(1000000,n));frameDraft=false;$('frames').value=String(n);$('frames').setAttribute('aria-invalid','false');change('frames',n);}
  function render(){
    const r=ready(),selected=M.selected(state).length,any=!!state&&(prefs.scope!=='selected'?state.layers.length>0:selected>0),valid=validFrames();
    $('app').setAttribute('aria-busy',String(busy));
    if(!frameDraft&&document.activeElement!==$('frames'))$('frames').value=prefs.frames;
    $('frame-slider').value=Math.min(120,prefs.frames);$('frame-slider').title=prefs.frames>120?'Точный шаг '+prefs.frames+' кадров; быстрый ползунок 1–120':'Быстрый выбор 1–120 кадров';
    document.querySelectorAll('[data-step]').forEach(b=>{b.classList.toggle('active',Number(b.dataset.step)===prefs.frames);b.setAttribute('aria-pressed',String(Number(b.dataset.step)===prefs.frames));});
    document.querySelectorAll('[data-scope]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.scope===prefs.scope));b.disabled=busy;});
    $('scope-hint').textContent=!state?'Авто: выделенные; без выделения — все слои.':prefs.scope==='auto'?(selected?'Авто → выделенные слои: '+selected:'Авто → вся композиция: '+state.layers.length+' слоёв'):prefs.scope==='all'?'Вся композиция: '+state.layers.length+' слоёв.':selected?'Выделенные в AE слои: '+selected:'Нет выделенных слоёв. Выделите их в AE или выберите «Авто».';
    $('mode').innerHTML=esc(modeNames[prefs.mode])+icons('chevron');$('mode').disabled=busy;$('mode-note').textContent=modeShort[prefs.mode];$('mode-note').title=modeNotes[prefs.mode];
    document.querySelectorAll('[data-offset]').forEach(b=>{const [side,d]=b.dataset.offset.split(':');b.disabled=!r||!any||!valid;b.querySelector('.step-value').textContent=prefs.frames;const label=(side==='before'?'До':'После')+' курсора: '+(d==='1'?'вперёд':'назад')+' на '+prefs.frames+' кадров';b.title=(previewMode?'Проверить: ':'')+label;b.setAttribute('aria-label',(previewMode?'Проверить: ':'')+label);});
    $('gap').disabled=!r||!any;$('gap').title=previewMode?'Проверить удаление пустого промежутка под курсором':'Удалить пустой промежуток под курсором';$('preview-toggle').setAttribute('aria-pressed',String(previewMode));$('preview-toggle').disabled=busy;$('action-hint').textContent=previewMode?'Сначала план · без записи':'Один шаг · Undo в AE';if($('apply-preview'))$('apply-preview').disabled=!r||isDemo||!activePreview||activePreview.blocked||activePreview.counts.changes===0;$('preview-plan').disabled=!r||!any||!valid;$('refresh').disabled=busy;
    $('frame-minus').disabled=busy||prefs.frames<=1;$('frame-plus').disabled=busy||prefs.frames>=1000000;$('frame-slider').disabled=busy;$('frames').disabled=busy;
    $('half-second').disabled=!state||busy;$('one-second').disabled=!state||busy;
    $('preview-plan').textContent='План: '+(lastDirection[0]==='before'?'До':'После')+' '+(lastDirection[1]>0?'+':'−');
    const live=!connectionFailed&&(!!state||bridge&&bridge.connected);$('connection').textContent=isDemo?'Демо':connectionFailed?'Сбой связи':live?'AE подключён':'Нет AE';$('connection').className='connection '+(isDemo?'demo':live?'live':'');
    $('comp-name').textContent=state?state.name:'Нет композиции';$('comp-name').title=state?state.name+' · '+Number((1/state.frameDuration).toFixed(3))+' fps':'';
    $('cti-label').textContent=state?'Курсор '+M.timecode(state.time,state.frameDuration,state.displayStart):'Курсор AE —';
    $('step-duration').textContent=state?Number((prefs.frames*state.frameDuration).toFixed(3))+' с':'';
    $('empty-text').hidden=!!state;
  }
  async function request(data,quiet=false){
    if(disposed||busy)return null;
    if(data.op!=='read'&&!ready()){status('Нажмите «Обновить» для подключения к AE.',true);return null;}
    closeMenu();busy=true;clearTimeout(pollTimer);render();if(!quiet)status(data.op==='read'?'Читаем AE…':'Проверяем курсор и выделение AE…');
    let readCompleted=false;
    try{
      // Each command uses a fresh trusted snapshot; never derive target IDs from the old UI.
      const fresh=await bridge.call({op:'read'});if(disposed)return null;accept(fresh.state);readCompleted=true;connectionFailed=false;readFailures=0;
      const result=data.op==='read'?fresh:await bridge.call(Object.assign({},data,{token:state.token}));if(disposed)return null;
      if(result.state)accept(result.state);if(result.report)lastReport=result.report;
      if(result.failure){lastReport=result.report||JSON.stringify(result.failure,null,2);log(data.op,result.message);status(result.message,true);}
      else if(!quiet){status(result.message||(isDemo?'Демо · AE не подключён':'Синхронизировано с AE'),false,result.warning);log(data.op,result.message||'подтверждено');}
      if(data.preview)showPreview(result);return result;
    }catch(e){if(disposed)return null;connectionFailed=!!(bridge.needsReconnect||bridge.uncertain);if(!readCompleted){readFailures++;state=null;}$('empty-text').textContent=e.message;status(e.message,true);log(data.op,(e.code?e.code+' / '+e.stage+' · ':'')+e.message);lastReport=e.message+(e.code?'\nКод: '+e.code+'\nЭтап: '+e.stage+'\nЗапрос: '+data.op:'')+(e.host?'\n'+JSON.stringify(e.host,null,2):'');return null;}
    finally{busy=false;render();schedulePoll();}
  }
  function refresh(quiet=false){if(quiet&&connectionFailed)return Promise.resolve(null);return request({op:'read'},quiet);}
  function offset(region,direction,preview=previewMode){const frames=readFrames();lastDirection=[region,direction];return request({op:'offset',scope:prefs.scope,mode:prefs.mode,frames,region,direction,compMarkers:prefs.compMarkers,mediaPolicy:prefs.mediaPolicy,preview});}
  function schedulePoll(){clearTimeout(pollTimer);if(disposed||connectionFailed||isDemo||!prefs.autoRefresh||!window.__adobe_cep__)return;const delay=Math.min(30000,prefs.poll*Math.pow(2,Math.min(readFailures,5)));pollTimer=setTimeout(()=>{if(!busy&&!document.hidden&&$('overlay').hidden&&!menuOwner&&!document.querySelector('input:focus'))refresh(true);else schedulePoll();},document.hasFocus()?delay:Math.max(3000,delay));}
  function safe(fn){return (...args)=>{try{return Promise.resolve(fn(...args)).catch(e=>status(e.message,true));}catch(e){status(e.message,true);}};}
  function closeMenu(){if(menuOwner){menuOwner.setAttribute('aria-expanded','false');menuOwner=null;}$('menu').hidden=true;}
  function openMenu(owner,items){
    const was=menuOwner===owner;closeMenu();if(was)return;
    menuOwner=owner;owner.setAttribute('aria-expanded','true');const menu=$('menu');menu.innerHTML='';
    items.forEach(item=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked',String(item.active));b.innerHTML='<span class="menu-copy"><span>'+esc(item.label)+'</span>'+(item.note?'<small>'+esc(item.note)+'</small>':'')+'</span>'+(item.active?icons('check'):'');b.onclick=()=>{item.onClick();closeMenu();owner.focus();};menu.append(b);});
    menu.hidden=false;const rect=owner.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(rect.left,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(rect.bottom+5,innerHeight-menu.offsetHeight-8))+'px';menu.querySelector('button').focus();
  }
  function openDialog(title,html){
    closeMenu();activePreview=null;if($('overlay').hidden)dialogFocus=document.activeElement;$('dialog-title').textContent=title;$('dialog-body').innerHTML=html;$('overlay').hidden=false;$('dialog').focus();
  }
  function closeDialog(){$('overlay').hidden=true;activePreview=null;if(dialogFocus&&document.contains(dialogFocus))dialogFocus.focus();schedulePoll();}
  function download(name,text){
    const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
  }
  function choice(key,choices){return '<div class="settings-choice">'+choices.map(([v,label])=>'<button data-pref="'+key+'" data-value="'+v+'" class="'+(prefs[key]===v?'active':'')+'" aria-pressed="'+(prefs[key]===v)+'">'+esc(label)+'</button>').join('')+'</div>';}
  function range(key,label){const [min,max]=M.ranges[key];return '<div class="setting-row"><label for="pref-'+key+'">'+label+'</label><div class="range-wrap"><input id="pref-'+key+'" data-range="'+key+'" type="range" min="'+min+'" max="'+max+'" value="'+prefs[key]+'"><output>'+prefs[key]+'</output></div></div>';}
  function toggle(key,label){return '<label class="setting-row"><span>'+label+'</span><input type="checkbox" data-toggle="'+key+'" '+(prefs[key]?'checked':'')+'></label>';}
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
  function showPreview(result){
    const p=result.preview;
    if(!p){openDialog('Предпросмотр','<p class="plan-message">'+(isDemo?'Демо интерфейса. Для расчёта и применения подключите After Effects.':'AE не вернул план изменений. Повторите проверку.')+'</p>');return;}
    const time=t=>M.timecode(t,p.frameDuration,p.displayStart),delta=(p.delta>0?'+':'−')+Number(Math.abs(p.delta/p.frameDuration).toFixed(3))+' кадр.',kind={layer:'Слой целиком',edge:'Край и ключи',property:'Ключи'};
    const operation=p.operation==='gap'?'Убрать паузу':(p.region==='before'?'До курсора':'После курсора')+' · '+(p.direction>0?'вперёд':'назад')+' на '+Number(p.frames.toFixed(3))+' кадр.';
    const rows=p.targets.map(t=>{
      const layer=state&&state.layers.find(l=>l.id===t.layerId),title=layer?layer.name:'Маркеры композиции';let description=kind[t.kind]+' · '+delta;
      if(t.kind==='edge'){const fields=[['inPoint','In'],['outPoint','Out']].filter(([k])=>Math.abs(t.before[k]-t.after[k])>p.frameDuration*.000001);description=fields.map(([k,label])=>label+' '+time(t.before[k])+' → '+time(t.after[k])).join(' · ');}
      else if(t.kind==='layer')description+=' · In '+time(t.before.inPoint)+' → '+time(t.after.inPoint);
      return '<div class="plan-target"><div class="plan-target-title"><strong>'+esc(title)+'</strong><span>'+(t.index?'#'+t.index+' · ':'')+t.keys+' кл.</span></div><p>'+esc(description)+'</p></div>';
    }).join('');
    const warning=p.counts.mediaSkipped?'Без запаса исходника: '+p.counts.mediaSkipped+'. Эти слои и все их ключи останутся на месте.':'';
    openDialog('План изменений','<p class="plan-context"><strong>'+esc(operation)+'</strong><br>Курсор '+esc(time(p.cti))+' · '+esc(p.scope==='auto'?'Авто':p.scope==='all'?'Все слои':'Выделенные')+'</p><div class="plan-summary"><span><strong>'+p.counts.layers+'</strong> слоёв</span><span><strong>'+p.counts.keys+'</strong> ключей</span><span><strong>'+p.counts.skipped+'</strong> пропусков</span></div>'+
      (p.blocked?'<p class="plan-message error">Запись заблокирована. Причины ниже.</p>':p.counts.changes?'<p class="plan-message">Пока ничего не изменено.</p>':'<p class="plan-message">Подходящих изменений нет. Сцена останется прежней.</p>')+
      (warning?'<p class="plan-message warning">'+esc(warning)+'</p>':'')+
      '<div class="plan-targets">'+rows+'</div>'+(p.targetsOmitted?'<p class="note">Ещё целей: '+p.targetsOmitted+'. Полный расчёт ограничен лимитами операции; подробности — в отчёте.</p>':'')+
      (p.errors.length||p.skips.length?'<h3>Причины и пропуски</h3><ul class="plan-reasons">'+p.errors.concat(p.skips).map(reason=>'<li>'+esc(reason)+'</li>').join('')+'</ul>':'')+
      (p.skipsOmitted?'<p class="note">Ещё пропусков: '+p.skipsOmitted+'.</p>':'')+
      '<div class="plan-actions"><button id="apply-preview" class="primary-button" '+(p.blocked||!p.counts.changes||isDemo?'disabled':'')+'>Применить план</button><button id="plan-report" class="quiet-button">Технический отчёт</button></div><p class="plan-footnote">План действует 2 минуты. Перед записью AE повторно проверит цели. При изменениях потребуется новая проверка.</p>');
    activePreview=p;
    $('apply-preview').onclick=safe(()=>{const id=p.id;closeDialog();return request({op:'applyPreview',previewId:id});});$('plan-report').onclick=()=>showReport(false);
  }
  function showSettings(){
    openDialog('Настройки',
      '<h3>Работа</h3><div class="settings-grid">'+toggle('rememberContext','Запоминать область и режим')+toggle('autoRefresh','Обновлять сведения из AE')+toggle('compMarkers','Переносить маркеры композиции')+'</div><p class="note">Без запоминания панель открывается в Авто · Слои и ключи. Шаг и внешний вид сохраняются всегда.</p>'+
      '<p class="setting-label">Если закончились исходные кадры видео</p>'+choice('mediaPolicy',[['skip','Оставить этот слой'],['stop','Отменить всё']])+'<p class="note">При пропуске весь слой и его ключи остаются на месте. Остальные доступные цели сдвигаются.</p>'+
      '<h3>Внешний вид</h3><p class="setting-label">Тема</p>'+choice('theme',[['dark','Тёмная'],['light','Светлая'],['host','Как в AE']])+'<p class="setting-label">Шрифт</p>'+choice('font',[['system','Системный'],['sans','Arial'],['mono','Моно']])+'<div class="settings-grid">'+range('fontSize','Размер текста')+range('rowHeight','Размер кнопок сдвига')+range('spacing','Интервал кнопок')+range('radius','Скругление')+'<label class="setting-row"><span>Акцент</span><input id="pref-accent" type="color" value="'+prefs.accent+'"></label>'+toggle('motion','Анимация окон')+'<label class="setting-row"><span>Повышенный контраст</span><input type="checkbox" data-contrast="true" '+(prefs.contrast==='high'?'checked':'')+'></label></div>'+
      '<p class="setting-label">Плотность</p><div class="settings-choice"><button data-preset="compact">Компактно</button><button data-preset="balanced">Обычно</button><button data-preset="large">Крупнее</button></div>'+
      '<h3>Быстрые шаги</h3><label class="note" for="quick-step-values">До 8 значений в кадрах, через запятую</label><input id="quick-step-values" class="quick-step-setting" value="'+esc(quickDraft===null?prefs.quickSteps.join(', '):quickDraft)+'"><p id="settings-status" class="settings-status" role="status">'+esc(saveError||'Изменения сохраняются автоматически.')+'</p><div class="settings-actions"><button id="export-settings" class="secondary-button">Экспорт JSON</button><button id="import-settings" class="secondary-button">Импорт</button><button id="reset-appearance" class="quiet-button">Сбросить вид</button></div>');
    const body=$('dialog-body');
    body.querySelectorAll('[data-pref]').forEach(b=>b.onclick=()=>{change(b.dataset.pref,b.dataset.value);body.querySelectorAll('[data-pref]').forEach(el=>{el.classList.toggle('active',prefs[el.dataset.pref]===el.dataset.value);el.setAttribute('aria-pressed',String(prefs[el.dataset.pref]===el.dataset.value));});});
    body.querySelectorAll('[data-range]').forEach(el=>el.oninput=()=>{if(change(el.dataset.range,Number(el.value)))el.nextElementSibling.textContent=el.value;});
    body.querySelectorAll('[data-toggle]').forEach(el=>el.onchange=()=>change(el.dataset.toggle,el.checked));body.querySelector('[data-contrast]').onchange=e=>change('contrast',e.target.checked?'high':'normal');$('pref-accent').oninput=e=>change('accent',e.target.value);
    $('quick-step-values').oninput=e=>{quickDraft=e.target.value;try{const steps=M.parseSteps(e.target.value);change('quickSteps',steps);e.target.setAttribute('aria-invalid','false');}catch(error){e.target.setAttribute('aria-invalid','true');$('settings-status').textContent=error.message;}};
    body.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>{const values={compact:{rowHeight:30,fontSize:11,spacing:2},balanced:{rowHeight:32,fontSize:12,spacing:3},large:{rowHeight:48,fontSize:14,spacing:6}}[b.dataset.preset];prefs=M.validate(Object.assign({},prefs,values));applyAppearance();persist();render();showSettings();});
    $('reset-appearance').onclick=()=>{for(const k of ['theme','font','fontSize','rowHeight','spacing','radius','accent','motion','contrast'])prefs[k]=M.defaults[k];applyAppearance();persist();render();showSettings();};$('export-settings').onclick=()=>download('FrameFlow-settings-v3.json',JSON.stringify(prefs,null,2));$('import-settings').onclick=()=>$('import-file').click();
  }
  function showHelp(){openDialog('Как работает FrameFlow','<p class="help-text"><strong>1. Поставьте курсор в таймлайне AE.</strong><br>Выберите шаг кнопкой, ползунком или кнопками − / + рядом с числом. Shift меняет шаг на 10 кадров. Колесо над активным полем меняет шаг.</p><p class="help-text"><strong>2. Выберите область.</strong><br>Авто использует выделенные в AE слои; если выделения нет — всю композицию. «Выделенные» без выделения не расширяет область. «Все слои» всегда использует все слои.</p><p class="help-text"><strong>3. Нажмите До − / До + / После − / После +.</strong><br>Знак − сдвигает назад по времени, + вперёд. «До» не включает ключ на курсоре; «После» включает. Перед действием курсор и выделение перечитываются из AE.</p><p class="help-text"><strong>Режимы</strong><br>Слои и ключи — прежний Time Offset: слой целиком на нужной стороне, край и часть ключей у пересекающего курсор слоя.<br>Слои целиком — перенос целого слоя со всеми ключами; сторона определяется по его In.<br>Все ключи на стороне курсора — границы слоя сохраняются.<br>Выделенные ключи — дополнительно учитывается выделение ключей в AE.</p><p class="help-text">«Убрать паузу» удаляет пустой промежуток под курсором в выбранной области, независимо от шага и режима. «План» показывает последнее направление без записи. Включите «Сначала проверить», чтобы любая кнопка сдвига или удаления паузы сначала открывала список изменений. «Применить план» выполняет именно проверенные изменения; устаревший план нужно рассчитать заново. Если исходных кадров не хватает, весь этот слой и его ключи остаются на месте, остальные цели сдвигаются. Число таких слоёв видно внизу и в отчёте. В настройках можно выбрать «Отменить всё». Блокировки и коллизии по-прежнему отменяют всю запись.</p><p class="help-text"><strong>Undo / Redo выполняйте в AE.</strong> R обновляет сведения, ? открывает эту справку. Кнопка «Отчёт» открывает и копирует текст.</p>');}
  function keydown(e){
    if(!$('overlay').hidden){if(e.key==='Escape'){e.preventDefault();closeDialog();}if(e.key==='Tab'){const a=[$('close-dialog'),...$('dialog-body').querySelectorAll('button,input,textarea')].filter(el=>!el.disabled);if(a.length){const i=a.indexOf(document.activeElement),next=e.shiftKey?(i<=0?a.length-1:i-1):(i+1)%a.length;e.preventDefault();a[next].focus();}}return;}
    if(menuOwner){const owner=menuOwner,list=[...$('menu').querySelectorAll('button')],i=list.indexOf(document.activeElement);if(e.key==='Escape'){e.preventDefault();closeMenu();owner.focus();}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();list[(i+(e.key==='ArrowDown'?1:-1)+list.length)%list.length].focus();}return;}
    if(e.ctrlKey||e.metaKey||e.altKey||['INPUT','TEXTAREA'].includes(e.target.tagName))return;
    if(e.key.toLowerCase()==='r'){e.preventDefault();refresh();}else if(e.key==='?'){e.preventDefault();showHelp();}
  }
  function setup(){
    try{preferenceStore=M.storage(localStorage);const loaded=preferenceStore.load();prefs=M.startup(loaded.value);if(loaded.error)saveError=loaded.error;}catch(e){prefs=M.validate(M.defaults);saveError='Хранилище недоступно. Настройки действуют в этой сессии.';preferenceStore={save(){throw Error(saveError);}};}
    $('frames').value=prefs.frames;applyAppearance();renderPresets();
    if(window.__adobe_cep__&&typeof window.__adobe_cep__.evalScript==='function'){bridge=FFBridge.createCEP(window.__adobe_cep__);refresh();}
    else{bridge=FFBridge.create(()=>{throw Error('Откройте FrameFlow через Window → Extensions в After Effects.');});$('demo').hidden=false;status('Откройте панель в After Effects');render();}
    $('demo').onclick=()=>{bridge.dispose();bridge=FFDemo.create();isDemo=true;connectionFailed=false;readFailures=0;refresh();};
    if(!window.__adobe_cep__&&new URLSearchParams(location.search).get('demo')==='1')$('demo').click();
    $('preview-toggle').onclick=()=>{previewMode=!previewMode;render();};$('refresh').onclick=()=>refresh();$('open-settings').onclick=showSettings;$('open-help').onclick=showHelp;$('open-report').onclick=()=>showReport(true);
    document.querySelectorAll('[data-scope]').forEach(b=>b.onclick=()=>change('scope',b.dataset.scope));
    $('mode').onclick=()=>openMenu($('mode'),Object.keys(modeNames).map(v=>({label:modeNames[v],note:modeNotes[v],active:prefs.mode===v,onClick:()=>change('mode',v)})));
    $('frames').oninput=()=>{const valid=validFrames();frameDraft=!valid;$('frames').setAttribute('aria-invalid',String(!valid));if(valid)change('frames',readFrames());else{status('Шаг: целое число от 1 до 1000000 кадров.',true);render();}};
    $('frame-minus').onclick=e=>setFrames(prefs.frames-(e.shiftKey?10:1));$('frame-plus').onclick=e=>setFrames(prefs.frames+(e.shiftKey?10:1));$('frame-slider').oninput=e=>setFrames(Number(e.target.value));
    $('frames').addEventListener('wheel',e=>{if(document.activeElement!==$('frames')||busy)return;e.preventDefault();setFrames(prefs.frames+(e.deltaY<0?1:-1)*(e.shiftKey?10:1));},{passive:false});
    $('half-second').onclick=()=>setFrames(Math.max(1,Math.round(.5/state.frameDuration)));$('one-second').onclick=()=>setFrames(Math.max(1,Math.round(1/state.frameDuration)));
    document.querySelectorAll('[data-offset]').forEach(b=>b.onclick=safe(()=>{const [region,direction]=b.dataset.offset.split(':');return offset(region,Number(direction));}));
    $('preview-plan').onclick=safe(()=>offset(lastDirection[0],lastDirection[1],true));$('gap').onclick=()=>request({op:'gap',scope:prefs.scope,compMarkers:prefs.compMarkers,preview:previewMode});
    $('close-dialog').onclick=closeDialog;$('overlay').onclick=e=>{if(e.target===$('overlay'))closeDialog();};
    $('import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>20000)throw Error('Файл настроек превышает 20 KB.');prefs=M.validate(JSON.parse(await file.text()));quickDraft=null;applyAppearance();persist();renderPresets();render();showSettings();}catch(error){preferenceError(error.message);}finally{e.target.value='';}};
    document.addEventListener('keydown',safe(keydown));document.addEventListener('pointerdown',e=>{if(menuOwner&&!$('menu').contains(e.target)&&!menuOwner.contains(e.target))closeMenu();});
    window.addEventListener('resize',closeMenu);window.addEventListener('focus',()=>{if(!busy&&$('overlay').hidden)refresh(true);});document.addEventListener('visibilitychange',schedulePoll);
    window.addEventListener('beforeunload',()=>{disposed=true;clearTimeout(pollTimer);clearTimeout(saveTimer);try{preferenceStore.save(prefs);}catch(e){}bridge.dispose();});render();schedulePoll();if(saveError)status(saveError,true);
  }
  setup();
}());
