// Installed by the release builder. Never reload or change saved work automatically.
export function initReleaseUpdate({store, document: doc = document, window: win = window,
  fetcher = (...args) => fetch(...args), currentRuntime = import.meta.url.match(/modules-([a-f0-9]+)\//)?.[1],
  manifestURL = new URL('../../release.json', import.meta.url), reload = () => win.location.reload(),
  intervalMs = 60000}) {
  if (!currentRuntime) return {check: async () => {}, dispose() {}};
  let pending = false, shown = false, stopped = false;
  const panel = doc.createElement('aside'); panel.hidden = true; panel.setAttribute('aria-label','页面更新');
  panel.style.cssText='position:fixed;bottom:16px;left:16px;right:16px;z-index:10000;padding:14px 18px;background:var(--paper,#fff);color:var(--ink,#333);border:1px solid var(--line,#aaa);border-radius:8px;box-shadow:0 3px 16px #0002;display:flex;gap:12px;align-items:center;flex-wrap:wrap';
  // Inline display must not override hidden.
  panel.style.display='none';
  const message=doc.createElement('span');message.setAttribute('role','status');
  message.textContent='页面有新版本，保存当前创作后可更新。';
  const refresh=doc.createElement('button');refresh.textContent='保存并更新';
  refresh.style.cssText='padding:8px 12px;border:1px solid var(--ink,#333);border-radius:5px;font-weight:600';
  const later=doc.createElement('button');later.textContent='稍后';
  refresh.onclick=()=>{
    try {store.checkpoint();} catch {
      message.textContent='未能确认作品已保存，请先导出图片或备份作品，再重试更新。'; return;
    }
    reload();
  };
  later.onclick=()=>{panel.hidden=true;panel.style.display='none';shown=false;};
  panel.append(message,refresh,later);doc.body.append(panel);
  async function check() {
    if(stopped || pending || doc.visibilityState==='hidden') return;
    const host=doc.querySelector('dialog[open]') || doc.body;
    if(panel.parentElement!==host) host.append(panel);
    if(shown)return;
    pending=true;
    const controller=new AbortController(),timeout=win.setTimeout(()=>controller.abort(),8000);
    try {
      const response=await fetcher(manifestURL,{cache:'no-store',signal:controller.signal});
      if(!response.ok)return;
      const release=await response.json();
      if(!stopped && /^[a-f0-9]{16}$/.test(release.runtime) && release.runtime!==currentRuntime){
        panel.hidden=false;panel.style.display='flex';shown=true;
      }
    } catch { /* Offline and transient failures are not evidence of an update. */ }
    finally {pending=false;win.clearTimeout(timeout);}
  }
  win.addEventListener('focus',check);
  win.addEventListener('shiju-search-error',check);
  doc.addEventListener('visibilitychange',check);
  doc.addEventListener('close',check,true);
  const timer=win.setInterval(check,intervalMs);
  void check();
  return {check,dispose(){stopped=true;win.clearInterval(timer);win.removeEventListener('focus',check);win.removeEventListener('shiju-search-error',check);doc.removeEventListener('visibilitychange',check);doc.removeEventListener('close',check,true);panel.remove();}};
}
