import { Agent, fetch as request } from 'undici';
import { publicAddresses } from './collection-web.mjs';
let usageObserver;
export function setUsageObserver(observer) { usageObserver=observer; }

export function validateServerProvider(url) {
  if (process.env.JUAI_SERVER_MODE !== '1') return;
  const allowed = (process.env.JUAI_PROVIDER_HOSTS || 'api.deepseek.com,api.openai.com').split(',');
  if (url.protocol !== 'https:' || url.port && url.port !== '443' || !allowed.includes(url.hostname))
    throw new Error('服务器仅允许管理员启用的公网 HTTPS 模型服务商。');
}
export async function providerFetch(raw, options = {}) {
  if (process.env.JUAI_SERVER_MODE !== '1') return fetch(raw, options);
  const url = new URL(raw); validateServerProvider(url);
  const addresses = await publicAddresses(url.toString());
  let model='';try{model=JSON.parse(options.body||'{}').model||'';}catch{}
  const report=usageObserver?.({provider:url.hostname,model,at:Date.now()});
  let usage=null,tail='',reported=false;
  const finish=error=>{if(!reported){reported=true;report?.({usage,error:error||'',at:Date.now()});}};
  const consume=bytes=>{tail+=new TextDecoder().decode(bytes);if(tail.length>1048576)tail=tail.slice(-1048576);for(const line of tail.split('\n'))try{const data=JSON.parse(line.replace(/^data:\s*/,''));if(data.usage)usage=data.usage;}catch{};try{const data=JSON.parse(tail);if(data.usage)usage=data.usage;}catch{}};
  const dispatcher = new Agent({ connect: { lookup(_host, config, callback) {
    config?.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family);
  } } });
  try {
    const response = await request(url, {...options, dispatcher, redirect:'error'});
    // The dispatcher must stay alive while the streaming response is consumed.
    const reader = response.body?.getReader();
    if (!reader) { finish();await dispatcher.close(); return response; }
    const body = new ReadableStream({
      async pull(controller) { try { const next = await reader.read(); if(next.done) { finish();controller.close(); void dispatcher.close(); } else {consume(next.value);controller.enqueue(next.value);} } catch(e) { finish('读取中断');controller.error(e); void dispatcher.close(); } },
      async cancel(reason) { finish('取消');await reader.cancel(reason); await dispatcher.close(); },
    });
    return new Response(body,{status:response.status,statusText:response.statusText,headers:response.headers});
  } catch(e) { finish('请求失败');await dispatcher.close(); throw e; }
}
