'use strict';
// Real Chromium layout/interaction checks with a simulated AE transport, not an AE execution test.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{fixture}=require('../tests/host-fixture.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'artifacts');fs.mkdirSync(output,{recursive:true});
const results={version:require('../package.json').version,sourceRef:process.env.GITHUB_SHA||'local',engine:'Chromium',host:'simulated AE/CEP fixture; no actual Adobe connection',checks:[],screenshots:[],sourceHashes:{}};
const errors=[];
function hash(file){return crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');}
for(const file of ['extension/index.html','extension/css/panel.css',...fs.readdirSync(path.join(root,'extension/js')).map(f=>'extension/js/'+f),'extension/jsx/host.jsx','src/core.jsxinc','src/panel-host.jsxinc','tests/host-fixture.cjs','tools/browser-check.cjs'])results.sourceHashes[file]=hash(file);
async function check(name,fn){try{await fn();results.checks.push({name,status:'pass'});}catch(e){results.checks.push({name,status:'fail',message:e.message});errors.push(name+': '+e.message);}}
async function screenshot(page,name){const file=path.join(output,name+'.png');await page.screenshot({path:file});results.screenshots.push(name+'.png');}
function logScreenshot(name){const data=fs.readFileSync(path.join(output,name)).toString('base64');for(let i=0;i<data.length;i+=8000)console.log('FF_SCREENSHOT '+name+' '+Math.floor(i/8000)+' '+data.slice(i,i+8000));}
(async()=>{
  const browser=await chromium.launch({headless:true});results.browserVersion=browser.version();
  try{
    const context=await browser.newContext({viewport:{width:400,height:420},reducedMotion:'reduce'}),page=await context.newPage(),pageErrors=[];
    page.on('pageerror',e=>pageErrors.push(e.message));
    const host=fixture();host.comp.name='Монтаж · основной вариант с длинным названием';host.comp.items[0].name='Заставка / текст';host.comp.items[1].name='Сцена 02 · анимация';host.comp.items[0].inPoint=0;host.comp.items[0].outPoint=2;host.comp.items[1].inPoint=6;host.comp.items[1].outPoint=8;
    await page.exposeFunction('__ffHostEval',script=>vm.runInContext(script,host.ctx));
    await page.addInitScript(()=>{window.__adobe_cep__={getSystemPath:()=>'/test/FrameFlow',evalScript(script,cb){window.__ffHostEval(script).then(cb);},getHostEnvironment:()=>JSON.stringify({appSkinInfo:{panelBackgroundColor:{color:{red:24,green:24,blue:26}}}})};});
    await page.goto('file://'+path.join(root,'extension/index.html'));await page.waitForFunction(()=>document.getElementById('connection').textContent==='AE подключён');
    await screenshot(page,'main-dark');
    await check('all main commands fit the default 400x420 panel',async()=>{const fit=await page.evaluate(()=>{const box=document.querySelector('.content').getBoundingClientRect(),gap=document.getElementById('gap').getBoundingClientRect();return {bottom:gap.bottom,limit:box.bottom,scroll:document.querySelector('.content').scrollHeight,client:document.querySelector('.content').clientHeight};});assert.ok(fit.bottom<=fit.limit+1,JSON.stringify(fit));});
    for(const width of [320,400,650]){
      await page.setViewportSize({width,height:420});
      await check('no horizontal overflow at '+width,async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.content').scrollWidth<=document.querySelector('.content').clientWidth),true);});
    }
    await page.setViewportSize({width:400,height:420});
    await page.locator('#preview-toggle').click();await page.locator('#after-plus').click();await page.waitForSelector('#apply-preview');
    await screenshot(page,'plan-dark');
    await check('preview leaves scene untouched and Apply executes the captured plan',async()=>{assert.equal(host.groups(),0);assert.equal(await page.locator('#apply-preview').isEnabled(),true);await page.locator('#apply-preview').click();await page.waitForFunction(()=>document.getElementById('overlay').hidden&&document.getElementById('status').textContent.includes('Готово'));assert.equal(host.groups(),1);assert.equal(host.comp.items[1].inPoint,6.5);});
    await page.locator('#preview-plan').click();await page.waitForSelector('#apply-preview');host.comp.time=9;
    await check('changing AE CTI while preview is open rejects application',async()=>{await page.locator('#apply-preview').click();await page.waitForFunction(()=>/устарел|изменил/.test(document.getElementById('status').textContent));assert.equal(host.groups(),1);});
    await page.locator('#open-settings').click();await page.locator('[data-pref="theme"][data-value="light"]').click();
    await screenshot(page,'settings-light');
    await check('large text and settings fit the narrow panel without horizontal overflow',async()=>{await page.setViewportSize({width:320,height:280});await page.locator('#pref-fontSize').evaluate(el=>{el.value='16';el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await page.evaluate(()=>{const d=document.getElementById('dialog'),b=document.getElementById('dialog-body'),r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&b.scrollWidth<=b.clientWidth;}),true);});
    await page.locator('#reset-appearance').click();await page.locator('#close-dialog').click();
    await check('long labels and maximum frame step do not create horizontal overflow',async()=>{await page.locator('#frames').fill('1000000');await page.locator('#frames').dispatchEvent('input');await page.locator('#mode').click();await page.getByRole('menuitemradio').filter({hasText:'Все ключи на стороне курсора'}).click();assert.equal(await page.evaluate(()=>document.querySelector('.content').scrollWidth<=document.querySelector('.content').clientWidth),true);});
    await check('open mode menu stays inside a 320x280 viewport',async()=>{await page.locator('#mode').click();const b=await page.locator('#menu').boundingBox();assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=320&&b.y+b.height<=280);await page.keyboard.press('Escape');});
    await check('theme text contrast meets 4.5 to 1',async()=>{for(const theme of ['dark','light']){await page.locator('#open-settings').click();await page.locator('[data-pref="theme"][data-value="'+theme+'"]').click();const ratio=await page.evaluate(()=>{const style=getComputedStyle(document.body),bg=style.getPropertyValue('--bg').trim(),fg=style.getPropertyValue('--muted').trim();return FFModel.contrast(bg,fg);});assert.ok(ratio>=4.5,theme+' contrast '+ratio);await page.locator('#close-dialog').click();}});
    await check('no unhandled browser errors',async()=>assert.deepEqual(pageErrors,[]));
    await context.close();
  }finally{await browser.close();}
  results.status=errors.length?'fail':'pass';results.passed=results.checks.filter(x=>x.status==='pass').length;results.failed=errors.length;
  fs.writeFileSync(path.join(output,'browser-result.json'),JSON.stringify(results,null,2)+'\n');
  console.log('FF_BROWSER_RESULT '+JSON.stringify(results));
  for(const name of ['main-dark.png','plan-dark.png','settings-light.png'])if(fs.existsSync(path.join(output,name)))logScreenshot(name);
  if(errors.length)throw Error(errors.join('\n'));
})().catch(e=>{console.error(e);process.exitCode=1;});
