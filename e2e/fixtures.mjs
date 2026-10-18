import {test as base,expect} from '@playwright/test';

const loopback=new Set(['127.0.0.1','localhost','[::1]']);
const fontHosts=new Set(['fonts.googleapis.com','fonts.gstatic.com']);

// Page-level API fixtures take precedence over these context-level boundaries.
// Unmocked requests must never reach the deployed game/API during local tests.
export const test=base.extend({
  serviceWorkers:'block',
  context:async({context},use,testInfo)=>{
    const blocked=[];
    await context.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(loopback.has(url.hostname)||(url.protocol==='https:'&&request.method()==='GET'&&fontHosts.has(url.hostname)))return route.continue();
      blocked.push({transport:'http',method:request.method(),origin:url.origin,path:url.pathname});
      return route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*',socket=>{
      const url=new URL(socket.url());
      if(loopback.has(url.hostname))return void socket.connectToServer();
      blocked.push({transport:'websocket',origin:url.origin,path:url.pathname});
      socket.close({code:1008,reason:'External connection blocked by local test boundary'});
    });
    await use(context);
    if(blocked.length)await testInfo.attach('blocked-external-requests',{body:JSON.stringify(blocked,null,2),contentType:'application/json'});
  }
});

export {expect};
