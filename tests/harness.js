const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),parser=require('acorn');
const output=path.resolve(__dirname,'../dist/FrameFlow_AE_2.0.jsx');
function source(){return fs.readFileSync(output,'utf8').replace(/^\uFEFF/,'').replace(/^#target[^\n]*\n/gm,'\n');}
function load(globals={}){const s=source(),ast=parser.parse(s,{ecmaVersion:3,allowReserved:'never'});const statements=ast.body[0].expression.callee.body.body;const code=statements.filter(n=>n.type==='VariableDeclaration'&&/^FF(Core|Host|UI)$/.test(n.declarations[0].id.name)).map(n=>s.slice(n.start,n.end)).join('\n');const box={...globals};vm.runInNewContext(code,box);return box;}
module.exports={load,source,parser,output};
