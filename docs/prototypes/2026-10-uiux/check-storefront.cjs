const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {spawn} = require("node:child_process");
const {pathToFileURL} = require("node:url");
const base = __dirname;
const fragment = fs.readFileSync(path.join(base,"tiemdigital-storefront-wireframe.html"),"utf8");
new vm.Script(fragment.match(/<script>([\s\S]*?)<\/script>/)[1]);
if (fragment.includes('\\"')) throw new Error("Escaped literal HTML");
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const profile=fs.mkdtempSync(path.join(base,"td-preview-chrome-"));
const browser=spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",[
  "--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check",
  "--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"
],{windowsHide:true,stdio:"ignore"});
let socket;
const main=async()=>{
  const portFile=path.join(profile,"DevToolsActivePort");
  let port;
  for(let n=0;n<80&&!port;n++){
    await delay(100);
    try{const first=fs.readFileSync(portFile,"utf8").split("\n")[0].trim();if(/^\d+$/.test(first))port=first;}catch{}
  }
  if(!port)throw new Error("Chrome did not expose a debugging port");
  const targets=await (await fetch("http://127.0.0.1:"+port+"/json/list")).json();
  const target=targets.find(x=>x.type==="page");
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let sequence=0;
  const pending=new Map(), contexts=new Map(), errors=[];
  socket.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.id){const c=pending.get(m.id);if(c){pending.delete(m.id);m.error?c.reject(new Error(JSON.stringify(m.error))):c.resolve(m.result);}}
    if(m.method==="Runtime.executionContextCreated")contexts.set(m.params.context.id,m.params.context);
    if(m.method==="Runtime.executionContextDestroyed")contexts.delete(m.params.executionContextId);
    if(m.method==="Runtime.executionContextsCleared")contexts.clear();
    if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  };
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
    const timer=setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(new Error("CDP timeout "+method));}},12000);timer.unref();
  });
  await send("Page.enable");await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1024,height:1000,deviceScaleFactor:1,mobile:false});
  await send("Page.navigate",{url:pathToFileURL(path.join(base,"tiemdigital-storefront-wireframe.test.html")).href});
  await delay(300);
  let contextId;
  for(let n=0;n<80&&!contextId;n++){
    await delay(100);
    for(const [id,c]of contexts){
      if(!c.auxData?.isDefault)continue;
      let r;
      try{r=await send("Runtime.evaluate",{expression:'!!document.getElementById("td-storefront") && !!document.querySelector(".sf-products")',contextId:id,returnByValue:true});}
      catch{continue;}
      if(r.result?.value){contextId=id;break;}
    }
  }
  if(!contextId){
    const diagnostics=[];
    for(const [id,c]of contexts){
      const r=await send("Runtime.evaluate",{expression:'({url:location.href,html:document.documentElement.outerHTML.slice(0,500),root:!!document.getElementById("td-directions")})',contextId:id,returnByValue:true});
      diagnostics.push({context:c,result:r.result?.value,exception:r.exceptionDetails});
    }
    const shot=await send("Page.captureScreenshot",{format:"png"});
    fs.writeFileSync(path.join(base,"direction-debug.png"),Buffer.from(shot.data,"base64"));
    throw new Error("Prototype did not render "+JSON.stringify({diagnostics,errors}));
  }
  const evaluate=async expression=>{
    const r=await send("Runtime.evaluate",{expression,contextId,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
    return r.result.value;
  };
  const exercise=function(key){
    const app=document.getElementById("td-sf-app");
    const click=sel=>app.querySelector(sel).click();
    click('[data-action="catalog"]');
    const input=app.querySelector('input[type="search"]');
    input.value="Trợ lý";input.dispatchEvent(new Event("input",{bubbles:true}));
    const found=[...app.querySelectorAll("[data-item]")].filter(x=>!x.hidden).length;
    click('[data-action="detail"][data-id="1"]');
    const fullPage=!!app.querySelector(".sf-detail")&&!app.querySelector('[role="dialog"]');
    const pageQty=app.querySelector("[data-quantity]");pageQty.value="2";pageQty.dispatchEvent(new Event("input",{bubbles:true}));
    click('[data-action="buy"][data-id="1"]');
    const dialog=!!app.querySelector('[role="dialog"]');
    const qty=app.querySelector(".sf-drawer [data-quantity]");
    const carriedQuantity=qty.value==="2";
    const total=app.querySelector("[data-total]").textContent;
    click('[data-action="close"]');
    click('[data-action="catalog"]');
    const preservedQuery=app.querySelector('input[type="search"]').value==="Trợ lý";
    const newInput=app.querySelector('input[type="search"]');newInput.value="";newInput.dispatchEvent(new Event("input",{bubbles:true}));
    const sort=app.querySelector("[data-sort]");sort.value="asc";sort.dispatchEvent(new Event("change",{bubbles:true}));
    const sorted=app.querySelector(".sf-products").firstElementChild.dataset.item==="3";
    const storeWidth=app.scrollWidth,available=app.clientWidth;
    click('[data-action="theme"]');
    const dark=app.dataset.theme==="dark";click('[data-action="theme"]');
    return {found,dialog,total,fullPage,carriedQuantity,preservedQuery,sorted,dark,storeWidth,available,bodyWidth:document.documentElement.scrollWidth,windowWidth:innerWidth};
  };
  const results=[];
  for(const key of ["storefront"]){
    for(const width of [1024,736,390,320]){
      await send("Emulation.setDeviceMetricsOverride",{width,height:1200,deviceScaleFactor:1,mobile:false});
      await delay(100);
      const test=await evaluate("("+exercise.toString()+")("+JSON.stringify(key)+")");
      if(test.found!==1||!test.dialog||test.total!=="258.000 ₫"||!test.fullPage||!test.carriedQuantity||!test.preservedQuery||!test.sorted||!test.dark)throw new Error("Interaction failed "+key+" "+width+" "+JSON.stringify(test));
      if(test.storeWidth>test.available+2||test.bodyWidth>test.windowWidth+2){
        const details=await evaluate("("+function(key){
          const app=document.getElementById("td-"+key);app.querySelector('[data-action="view"][data-view="admin"]').click();
          const bound=app.getBoundingClientRect();
          return [...app.querySelectorAll("*")].map(el=>({el,rect:el.getBoundingClientRect()})).filter(x=>x.rect.width>0&&(x.rect.right>bound.right+1||x.el.scrollWidth>x.el.clientWidth+2)).slice(0,20).map(x=>({tag:x.el.tagName,cls:x.el.className,text:x.el.textContent.slice(0,80),width:x.rect.width,scroll:x.el.scrollWidth,client:x.el.clientWidth,font:getComputedStyle(x.el).fontSize,right:x.rect.right,bound:bound.right}));
        }.toString()+")("+JSON.stringify(key)+")");
        const shot=await send("Page.captureScreenshot",{format:"png"});
        fs.writeFileSync(path.join(base,"direction-overflow.png"),Buffer.from(shot.data,"base64"));
        throw new Error("Overflow "+key+" "+width+" "+JSON.stringify({test,details}));
      }
      results.push({direction:key,width,pass:true});
    }
    await send("Emulation.setDeviceMetricsOverride",{width:1024,height:900,deviceScaleFactor:1,mobile:false});
    await evaluate('document.getElementById("td-sf-app").querySelector(\'[data-action="catalog"]\').click();true');
    await delay(150);
    const shot=await send("Page.captureScreenshot",{format:"png"});
    fs.writeFileSync(path.join(base,"wireframe-storefront-desktop.png"),Buffer.from(shot.data,"base64"));
    await evaluate('document.getElementById("td-sf-app").querySelector(\'[data-action="detail"][data-id="1"]\').click();true');
    const detailShot=await send("Page.captureScreenshot",{format:"png"});
    fs.writeFileSync(path.join(base,"wireframe-storefront-detail.png"),Buffer.from(detailShot.data,"base64"));
  }
  await evaluate('document.getElementById("td-sf-app").querySelector(\'[data-action="catalog"]\').click();true');
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:1000,deviceScaleFactor:1,mobile:false});
  await delay(150);
  const mobile=await send("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(base,"wireframe-storefront-mobile.png"),Buffer.from(mobile.data,"base64"));
  if(errors.length)throw new Error("Browser errors: "+JSON.stringify(errors));
  fs.writeFileSync(path.join(base,"storefront-check.json"),JSON.stringify({bytes:Buffer.byteLength(fragment),results,errors},null,2));
  console.log(JSON.stringify({bytes:Buffer.byteLength(fragment),checks:results.length,results,errors}));
  await send("Browser.close").catch(()=>{});
};
main().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>{if(socket)socket.close();browser.kill();});
