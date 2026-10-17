const PV={OneD:1,TwoD:2,ThreeD:3,TwoD_SPATIAL:4,ThreeD_SPATIAL:5,COLOR:6,LAYER_INDEX:7,MASK_INDEX:8,SHAPE:9,TEXT_DOCUMENT:10,MARKER:11,CUSTOM_VALUE:12};
const PT={PROPERTY:1,NAMED_GROUP:2,INDEXED_GROUP:3};const KI={LINEAR:1,BEZIER:2,HOLD:3};
class Prop{
 constructor(name,times=[],type=PV.OneD){this.matchName=name;this.propertyType=PT.PROPERTY;this.propertyValueType=type;this.canSetExpression=false;this.expression='';this.expressionEnabled=false;this.isSpatial=false;this.keys=times.map((t,i)=>({time:t,value:type===PV.MARKER?{comment:'m'+i,duration:0,protectedRegion:false,getParameters:()=>({})}:i+10,selected:i===0,inType:KI.LINEAR,outType:KI.LINEAR,temporalAuto:false,temporalContinuous:false,inEase:[{speed:0,influence:33}],outEase:[{speed:0,influence:33}]}));}
 get numKeys(){return this.keys.length;}get selectedKeys(){return this.keys.flatMap((k,i)=>k.selected?[i+1]:[]);}
 propertyGroup(){return this.parent;}
 keyTime(i){return this.keys[i-1].time;}keyValue(i){if(this.unreadable)throw Error('custom');return this.keys[i-1].value;}
 keySelected(i){return this.keys[i-1].selected;}keyInInterpolationType(i){return this.keys[i-1].inType;}keyOutInterpolationType(i){return this.keys[i-1].outType;}
 keyInTemporalEase(i){return this.keys[i-1].inEase;}keyOutTemporalEase(i){return this.keys[i-1].outEase;}
 keyTemporalAutoBezier(i){return this.keys[i-1].temporalAuto;}keyTemporalContinuous(i){return this.keys[i-1].temporalContinuous;}
 removeKey(i){this.keys.splice(i-1,1);if(this.matchName==='ADBE Time Remapping'&&!this.keys.length){this.inaccessible=true;}}setValueAtTime(t,v){if(this.inaccessible)throw Error('Time Remap disabled after last key removal');if(this.failOnce){this.failOnce=false;throw Error('injected write failure');}const p=new Prop('',[t],this.propertyValueType).keys[0];p.value=v;p.selected=false;this.keys.push(p);this.keys.sort((a,b)=>a.time-b.time);}
 setInterpolationTypeAtKey(i,a,b){Object.assign(this.keys[i-1],{inType:a,outType:b});}setTemporalAutoBezierAtKey(i,x){this.keys[i-1].temporalAuto=x;}setTemporalContinuousAtKey(i,x){this.keys[i-1].temporalContinuous=x;}setTemporalEaseAtKey(i,a,b){this.keys[i-1].inEase=a;this.keys[i-1].outEase=b;}setSelectedAtKey(i,x){this.keys[i-1].selected=x;}
}
class Layer{
 constructor(a,b,props=[],selected=false){this.index=0;this.id=Math.random();this.name='Layer';this._start=0;this.inPoint=a;this.outPoint=b;this.selected=selected;this.locked=false;this.selectedProperties=[];this.props=props;this.numProperties=props.length;props.forEach((p,i)=>{p.propertyIndex=i+1;p.parent=this;});}
 get startTime(){return this._start;}set startTime(x){const d=x-this._start;this._start=x;this.inPoint+=d;this.outPoint+=d;this.props.forEach(p=>p.keys.forEach(k=>k.time+=d));}
 property(id){return typeof id==='number'?this.props[id-1]:this.props.find(p=>p.matchName===id)||null;}
}
class CompItem{constructor(layers=[]){this.layers=layers;layers.forEach((l,i)=>l.index=i+1);this.numLayers=layers.length;this.time=5;this.duration=10;this.frameDuration=1/24;this.name='Comp';this.id=7;this.markerProperty=new Prop('ADBE Marker',[],PV.MARKER);}layer(i){return this.layers[i-1];}get selectedLayers(){return this.layers.filter(l=>l.selected);}}
function env(layers){const comp=new CompItem(layers),undo={begins:0,ends:0};return{comp,undo,globals:{CompItem,AVLayer:Layer,PropertyValueType:PV,PropertyType:PT,KeyframeInterpolationType:KI,KeyframeEase:class{constructor(speed,influence){Object.assign(this,{speed,influence});}},app:{project:{activeItem:comp},beginUndoGroup:()=>undo.begins++,endUndoGroup:()=>undo.ends++,version:'fake',buildNumber:0,settings:{haveSetting:()=>false,saveSetting:()=>{}}},$:{os:'fake',version:'fake'}}};}
module.exports={Prop,Layer,CompItem,PV,KI,env};
