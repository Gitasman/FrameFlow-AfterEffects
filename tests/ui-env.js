const {load}=require('./harness'),{env}=require('./ae');
function uiEnv(layers=[],prefs={},options={}){
 const e=env(layers),windows=[],writes=[],stored={...prefs};
 class Control{
  constructor(type,text){this.type=type;this.text=typeof text==='string'?text:'';this.children=[];this.items=[];this.minimumSize={};this.preferredSize={};this.maximumSize={};this.size={width:options.width||324,height:300};this.enabled=true;this.visible=true;this.active=false;this.layout={layout(){},resize(){}};this.graphics={font:{family:'Dialog',name:'Dialog',style:0,size:12},measureString:t=>({width:String(t).length*7,height:14})};this._selection=null;this._listeners={};}
  add(type,bounds,text,props){const c=new Control(type,text);c.parent=this;if(type==='item'){c.index=this.items.length;c.text=bounds;this.items.push(c);}else{this.children.push(c);if(type==='dropdownlist'&&Array.isArray(text))text.forEach(t=>c.add('item',t));}return c;}
  set selection(v){this._selection=typeof v==='number'?this.items[v]:v;}get selection(){return this._selection;}remove(c){const i=this.children.indexOf(c);if(i<0)throw Error('child missing');this.children.splice(i,1);}removeAll(){this.items=[];this.children=[];}addEventListener(n,f){this._listeners[n]=f;}center(){}show(){}close(){this.closed=true;}
 }
 class Window extends Control{constructor(type,title){super(type,title);windows.push(this);}}class Panel extends Control{constructor(){super('panel','');}}
 e.globals.app.settings={haveSetting:(ns,k)=>Object.hasOwn(stored,k),getSetting:(ns,k)=>stored[k],saveSetting:(ns,k,v)=>{if(options.saveError)throw Error('write denied');writes.push({key:k,value:v});stored[k]=v;}};
 Object.assign(e.globals,{Window,Panel,File:{saveDialog:()=>null},ScriptUI:{FontStyle:{BOLD:1,REGULAR:0},newFont:(family,style,size)=>({family,name:family,style,size})}});
 const box=load(e.globals),ui=box.FFUI.create(new Panel());return{...e,ui,box,windows,writes,stored};
}
function find(w,text){if(w.text===text)return w;for(const c of w.children){const x=find(c,text);if(x)return x;}return null;}
module.exports={uiEnv,find};
