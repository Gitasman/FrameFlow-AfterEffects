/* Explicit browser-only demo. Never selected automatically after a host failure. */
(function(root){
  'use strict';
  function create(){
    const s={version:'2.0.2',token:'demo:1',compId:1,name:'MOSAIC · Brand film',duration:16,frameDuration:1/24,displayStart:0,time:4,workStart:1,workDuration:12,environment:{ae:'Демо — AE не подключён',build:'—',os:'Browser'},layers:[]};
    const data=[['Logotype','comp',1,6,9],['Make room for ideas','text',2.5,7,1],['Subline · 2026','text',4,9,1],['Shape / Reveal','shape',.5,5.5,11],['Studio footage · 01','media',0,7.5,8],['Studio footage · 02','media',7.5,14,8],['Texture overlay','media',0,16,12],['Light sweep','shape',3,10,11],['Camera 01','camera',0,16,6],['Music · Editorial','audio',0,16,14],['Direction / Null','null',0,16,2],['Background','shape',0,16,4]];
    data.forEach((d,i)=>s.layers.push({id:101+i,index:i+1,name:d[0],kind:d[1],inPoint:d[2],outPoint:d[3],start:0,stretch:100,locked:i===11,selected:i===0||i===1,enabled:true,label:d[4],parentId:null,remap:false,matte:false,audio:d[1]==='audio',sourceId:10+i,sourceDuration:24,still:d[1]==='shape'||d[1]==='text'}));
    let rev=1;
    function state(){return JSON.parse(JSON.stringify(s));}
    return {get busy(){return false;},get uncertain(){return false;},dispose(){},async call(r){
      await new Promise(resolve=>setTimeout(resolve,65));
      if(r.op==='read')return {state:state()};
      if(r.token!==s.token)throw Error('Демо изменилось. Обновите панель.');
      const list=s.layers.filter(l=>(r.ids||[]).includes(l.id));
      if(r.preview)return {state:state(),report:'Демонстрационная проверка.\nAE не подключён; ключи не моделируются.\nЦелей: '+list.length,message:'Демо: проверка без записи'};
      if(!['select','seek'].includes(r.op)&&list.some(l=>l.locked))throw Error('Заблокированный слой.');
      if(r.op==='select')s.layers.forEach(l=>l.selected=r.ids.includes(l.id));
      else if(r.op==='seek')s.time=r.time;
      else if(r.op==='move')list.forEach(l=>{const d=r.deltaFrames*s.frameDuration;l.start+=d;l.inPoint+=d;l.outPoint+=d;});
      else if(r.op==='trim')list.forEach(l=>l[r.edge==='in'?'inPoint':'outPoint']=r.time);
      else if(r.op==='split'){
        if(list.some(l=>r.time<=l.inPoint||r.time>=l.outPoint||l.locked))throw Error('Split: курсор должен быть внутри выбранных слоёв.');
        list.forEach(l=>{const copy=Object.assign({},l,{id:1000+(++rev),inPoint:r.time,selected:false});l.outPoint=r.time;s.layers.splice(s.layers.indexOf(l),0,copy);});s.layers.forEach((l,i)=>l.index=i+1);
      }else if(r.op==='gap')throw Error('В демо под курсором нет пустого промежутка.');
      else throw Error('Этот режим проверяется в AE. Демо не моделирует ключи.');
      s.token='demo:'+(++rev);return {state:state(),result:{ok:true,changed:list.length},message:r.op==='select'?'Демо · выделение обновлено':'Демо · AE не изменён',report:'FrameFlow 2.0.2 · ДЕМО\nОперация: '+r.op+'\nЭто пример интерфейса, без подключения к AE.'};
    }};
  }
  root.FFDemo={create};
}(window));
