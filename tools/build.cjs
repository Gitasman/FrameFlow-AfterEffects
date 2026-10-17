'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),version='2.0';
const modules=['FFCore','FFHost','FFUI'].map(n=>fs.readFileSync(path.join(root,'src',n+'.jsxinc'),'utf8').replace(/^\uFEFF/,''));
const source='\uFEFF#target aftereffects\n/* FrameFlow AE '+version+' | Standalone native ScriptUI panel. Independent implementation. */\n(function (thisObj) {\n'+modules.join('\n')+'\nFFUI.create(thisObj);\n}(this));\n';
const out=path.join(root,'dist');fs.mkdirSync(out,{recursive:true});
for(const name of ['FrameFlow_AE.jsx','FrameFlow_AE_'+version+'.jsx'])fs.writeFileSync(path.join(out,name),source);
process.stdout.write('Built FrameFlow AE '+version+'\n');
