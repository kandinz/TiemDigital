const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{spawn}=require('node:child_process'),{pathToFileURL}=require('node:url');
const base=__dirname,name='tiemdigital-checkout-wireframe';
const html=fs.readFileSync(path.join(base,name+'.html'),'utf8');new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
if(html.includes('\\"'))throw Error('Escaped markup');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const profile=fs.mkdtempSync(path.join(base,'td-preview-chrome-'));
const browser=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;
(async()=>{
let port;for(let n=0;n<100&&!port;n++){await delay(100);try{const p=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0].trim();if(/^\d+$/.test(p))port=p;}catch{}}
if(!port)throw Error('No Chrome port');
const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
let seq=0;const pending=new Map(),errors=[];
socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));const t=setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('Timeout '+method));}},12000);t.unref();});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
await send('Page.enable');await send('Runtime.enable');
await send('Page.navigate',{url:pathToFileURL(path.join(base,name+'.test.html')).href});await delay(450);
const results=[];
const exercise=async function(){
const app=document.getElementById('td-co-app'),click=a=>{const el=app.querySelector('[data-action="'+a+'"]');if(!el)throw Error('Missing '+a);el.click();},wait=ms=>new Promise(r=>setTimeout(r,ms));
const scene=v=>{const select=app.querySelector('[data-scenario]');select.value=v;select.dispatchEvent(new Event('change',{bubbles:true}));};
const assert=(ok,label)=>{if(!ok)throw Error(label);};
const fits=()=>{assert(app.scrollWidth<=app.clientWidth+2,'App overflow');assert(document.documentElement.scrollWidth<=innerWidth+2,'Page overflow');};
scene('guest');const qty=app.querySelector('[data-qty]');qty.value='2';qty.dispatchEvent(new Event('input',{bubbles:true}));click('login');assert(app.textContent.includes('2 × Trợ lý AI Pro'),'Login lost quantity');fits();
click('close');assert(app.querySelector('[data-qty]').value==='2','Closing login lost quantity');click('login');app.querySelector('[data-tab=password]').click();const form=app.querySelector('[data-auth-form]');form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));assert(app.querySelector('[data-qty]').value==='2','Purchase lost quantity');assert(app.querySelector('[name=payment]:checked').value==='wallet','Wallet default');
const switchMethod=v=>{const el=app.querySelector('[name=payment][value='+v+']');el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));};switchMethod('qr');assert(app.querySelector('[data-action=confirm]').textContent.includes('QR'),'Method switch failed');switchMethod('wallet');
click('confirm');assert(app.querySelector('[data-action=noop]').disabled,'Busy not locked');await wait(750);assert(app.textContent.includes('Đã thanh toán'),'Wallet payment failed');fits();click('delivered');assert(app.querySelector('.co-data').textContent.split('\n').length===2,'Missing delivered data');fits();click('history');assert(!!app.querySelector('.co-order'),'History missing');click('order');assert(!!app.querySelector('.co-data'),'History detail missing');
scene('qr');assert(app.querySelector('[name=payment]:checked').value==='qr','QR default');assert(app.querySelector('[name=payment][value=wallet]').disabled,'Insufficient wallet enabled');click('confirm');await wait(750);assert(!!app.querySelector('.co-qr'),'QR missing');fits();click('bank-paid');click('delivered');assert(!!app.querySelector('.co-data'),'QR delivered missing');
scene('partial');click('confirm');await wait(750);click('delivered');assert(app.textContent.includes('Đã giao 1/2'),'Partial count');assert(!!app.querySelector('.co-data'),'Partial data missing');fits();
scene('handling');click('confirm');await wait(750);click('delivered');assert(app.textContent.includes('Shop đang xử lý'),'Handling missing');assert(!app.querySelector('.co-data'),'Handling unexpected data');fits();
scene('review');click('confirm');await wait(750);assert(app.textContent.includes('Chờ đối soát'),'Review missing');assert(!app.querySelector('[data-action=confirm]'),'Review allows pay again');click('refresh-review');fits();
scene('error');click('confirm');assert(app.textContent.includes('Chưa tạo đơn hoặc trừ tiền'),'Load error unclear');click('retry-load');assert(!!app.querySelector('[data-action=confirm]'),'Retry failed');
scene('expired');click('confirm');await wait(750);assert(app.textContent.includes('Mã QR đã hết hạn'),'Expiry missing');click('check-expired');assert(app.textContent.includes('Chờ đối soát'),'Expiry check missing');fits();
click('theme');assert(app.dataset.theme==='dark','Dark failed');fits();click('theme');
scene('guest');click('login');app.querySelector('[data-tab=email]').click();click('send-otp');assert(!!app.querySelector('[data-auth-form]'),'OTP missing');
return {pass:true,appWidth:app.scrollWidth,clientWidth:app.clientWidth};
};
for(const width of [1024,736,390,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:1200,deviceScaleFactor:1,mobile:false});const result=await evaluate('('+exercise.toString()+')()');results.push({width,...result});}
const screenshot=async(file,width,expr)=>{await send('Emulation.setDeviceMetricsOverride',{width,height:1050,deviceScaleFactor:1,mobile:false});await evaluate(expr);await delay(100);const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(base,file),Buffer.from(shot.data,'base64'));};
await screenshot('checkout-wallet-desktop.png',1024,'(()=>{const x=document.querySelector("[data-scenario]");x.value="wallet";x.dispatchEvent(new Event("change",{bubbles:true}));return true;})()');
await screenshot('checkout-qr-mobile.png',390,'(async()=>{const x=document.querySelector("[data-scenario]");x.value="qr";x.dispatchEvent(new Event("change",{bubbles:true}));document.querySelector("[data-action=confirm]").click();await new Promise(r=>setTimeout(r,750));return true;})()');
await screenshot('checkout-partial-desktop.png',1024,'(async()=>{const x=document.querySelector("[data-scenario]");x.value="partial";x.dispatchEvent(new Event("change",{bubbles:true}));document.querySelector("[data-action=confirm]").click();await new Promise(r=>setTimeout(r,750));document.querySelector("[data-action=delivered]").click();return true;})()');
if(errors.length)throw Error(JSON.stringify(errors));
fs.writeFileSync(path.join(base,'checkout-check.json'),JSON.stringify({bytes:Buffer.byteLength(html),results,errors},null,2));console.log(JSON.stringify({results,errors}));await send('Browser.close').catch(()=>{});
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>{socket?.close();browser.kill();});
