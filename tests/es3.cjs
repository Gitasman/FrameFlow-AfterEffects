'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {analyze,analyzeFile}=require('../tools/es3-check.cjs');
for(const source of ['var x = { protected: true }; x.protected;','var protected = 1;',
  'var const = 1;','debugger;','var x = { class: 1 };','let n=1;','const n=1;',
  'var f = () => 1;','var x = `text`;']) {
  test('strict ES3 rejects '+source,()=>assert.equal(analyze(source).status,'fail'));
}
test('quoted required keys, bracket access and protectedRegion pass',()=>{
  assert.equal(analyze('var x = {"protected":true, protectedRegion:true}; x["protected"]; x.protectedRegion;').status,'pass');
});
test('directives are position-masked and errors keep original line numbers',()=>{
  const r=analyze('\uFEFF#target aftereffects\n#targetengine "ff"\nvar ok = 1;\nvar protected = 2;');
  assert.equal(r.status,'fail');assert.equal(r.error.line,4);assert.equal(r.directives.length,2);
});
test('unresolved includes remain blocked',()=>assert.equal(analyze('#include "not-resolved.jsxinc"\nvar x=1;').status,'blocked'));
test('unknown directives remain blocked',()=>assert.equal(analyze('#unknown abc\nvar x=1;').status,'blocked'));
test('a missing input cannot pass',()=>assert.equal(analyzeFile('/nonexistent/frameflow-no-file.jsx').status,'blocked'));
test('analysis never executes scene mutations',()=>{
  globalThis.__frameflowSyntaxSentinel=0;
  assert.equal(analyze('globalThis.__frameflowSyntaxSentinel = 1; app.project.close();').status,'pass');
  assert.equal(globalThis.__frameflowSyntaxSentinel,0);delete globalThis.__frameflowSyntaxSentinel;
});
