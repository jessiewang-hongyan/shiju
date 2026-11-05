const frame = document.querySelector("#editor"),
  report = document.querySelector("#report");
const f = () => frame.contentDocument,
  $ = (s) => f()?.querySelector(s),
  text = (s) => $(s)?.textContent || "";
const wait = async (fn, label, ms = 20000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 65));
  }
  throw Error("等待超时：" + label);
};
const network = async (mode) =>
  (await fetch("/__network", { method: "POST", body: mode })).json();
const input = (s, v, event) => {
  const el = $(s);
  el.value = v;
  el.dispatchEvent(new Event(event, { bubbles: true }));
};
const tabs = () =>
  [...f().querySelectorAll("#source-tabs [role=tab]")].map(
    (el) => el.textContent,
  );
const tokens = () =>
  [...f().querySelectorAll("#new-poem [data-part]")].map(
    (el) => el.textContent,
  );
document.querySelector("#run").onclick = async (e) => {
  e.target.disabled = true;
  const rows = [];
  let step = "初始化";
  const ok = (name, details) => {
    rows.push({ name, details });
    report.textContent = JSON.stringify(rows, null, 2);
  };
  const interrupt = async (pattern, action) => {
    const n = (await network("slow")).trace.length;
    action();
    await wait(
      async () =>
        (await network("trace")).trace
          .slice(n)
          .some((r) => pattern.test(r.path) && r.result === "pending"),
      "请求已发出 " + pattern,
    );
    await network("offline");
    await wait(
      async () =>
        (await network("trace")).trace
          .slice(n)
          .some((r) => pattern.test(r.path) && r.result === "disconnected"),
      "连接实际中断",
    );
  };
  try {
    await wait(() => text("#save-status").includes("已保存"), "工作区");
    if (tabs().length !== 1 || tokens().length !== 0)
      throw Error("需要新端口的空测试工作区");
    $("#source-poem button").click();
    input("#poem-title", "网络回归作品", "input");
    $("#choose").click();
    step = "搜索中断";
    await interrupt(/\/static-data\//, () => {
      input("#search", "关雎", "input");
      input("#library-scope", "shijing", "change");
    });
    await wait(() => !$("#library-retry").hidden, "搜索重试");
    if (tabs().length !== 1) throw Error("多出原文");
    ok(step, text("#library-status"));
    step = "搜索重试";
    await network("online");
    $("#library-retry").click();
    await wait(
      () => $("#poem-list .poem-choice") && $("#library-retry").hidden,
      "搜索恢复",
    );
    ok(step, text("#poem-list .poem-choice b"));
    step = "选段前正文中断";
    await interrupt(/\/__bodies\//, () => $("#poem-list .poem-choice").click());
    await wait(() => !$("#library-retry").hidden, "正文错误");
    if ($("#poem-preview").open || tabs().length !== 1)
      throw Error("失败后改变原文");
    ok(step, text("#library-status"));
    step = "正文恢复和离线选段";
    await network("online");
    $("#poem-list .poem-choice").click();
    await wait(() => $("#poem-preview").open, "原文预览");
    if (Number($("#excerpt-end").max) < 2) throw Error("测试原文不足两行");
    await network("offline");
    $("#excerpt-enabled").checked = true;
    $("#excerpt-enabled").dispatchEvent(new Event("change"));
    input("#excerpt-end", "1", "change");
    $("#preview-use").click();
    await wait(() => tabs().length === 2, "离线添加");
    ok(step, tabs());
    $("#source-poem button").click();
    await wait(() => text("#save-status").includes("已保存"), "草稿自动保存");
    const original = tabs(),
      picked = tokens();
    if (picked.length !== 2) throw Error("混合集句不是两字");
    step = "字体分片中断";
    await network("online");
    $("#colors-open").click();
    await interrupt(/\/fonts\/.*\.woff2$/, () =>
      input("#export-font", "wenkai", "change"),
    );
    await wait(() => text("#font-preview-status").includes("重试"), "字体错误");
    ok(step, text("#font-preview-status"));
    step = "字体重试";
    await network("online");
    $("#font-preview-status").click();
    await wait(
      () =>
        !text("#font-preview-status") &&
        [...f().fonts].some(
          (font) => font.family === "LXGWWenKai" && font.status === "loaded",
        ) &&
        text("#multi-preview-status").includes("最多预览"),
      "实际字体加载恢复",
    );
    ok(step, "FontFace 已加载；图片预览恢复");
    $("#colors-dialog").close();
    await network("offline");
    step = "离线修改草稿";
    input("#poem-title", "离线修改", "input");
    await wait(() => text("#save-status").includes("已保存"), "离线保存");
    ok(step, { original, picked });
    step = "断网重新访问网址";
    const n = (await network("trace")).trace.length;
    frame.src = "/shiju/?network-test=cold";
    await wait(
      async () =>
        (await network("trace")).trace
          .slice(n)
          .some((r) => r.path === "/shiju/" && r.result === "disconnected"),
      "页面请求被阻断",
    );
    ok(step, "HTML 请求被阻断；当前版本不能保证离线从网址启动");
    step = "网络恢复后重开作品";
    await network("online");
    frame.src = "/shiju/?network-test=recovered";
    await wait(
      () =>
        text("#save-status").includes("已保存") &&
        $("#poem-title").value === "离线修改" &&
        JSON.stringify(tabs()) === JSON.stringify(original) &&
        JSON.stringify(tokens()) === JSON.stringify(picked),
      "重开并读回 IndexedDB",
    );
    ok(step, "离线修改的草稿、两篇原文和两个字块均恢复");
  } catch (err) {
    ok("未通过：" + step, String(err));
  } finally {
    const { trace } = await network("online");
    report.textContent = JSON.stringify(
      { rows, trace, finished: true },
      null,
      2,
    );
  }
};
document.querySelector('#materials').onclick=async()=>{
 const output=document.querySelector('#material-report'),rows=[];
 const record=(r)=>{rows.push(r);output.textContent=JSON.stringify({rows},null,2)};
 try{
 await wait(()=>text('#save-status').includes('已保存'),'ready');
 $('#colors-open').click();
 await network('slow');
 const fonts={wenkai:'LXGWWenKai',kangxi:'Kangxi',chenyu:'ShijuThinHand',bakudai:'ShijuBrush',huiwen:'Huiwen'};
 for(const [key,family] of Object.entries(fonts)){
  const start=Date.now();input('#export-font',key,'change');
  await wait(()=>!text('#font-preview-status')&&[...f().fonts].some(x=>x.family===family&&x.status==='loaded')&&text('#multi-preview-status').includes('最多预览'),'font '+key,90000);
  record({font:key,ms:Date.now()-start,loadedFaces:[...f().fonts].filter(x=>x.family===family&&x.status==='loaded').length,pass:true});
 }
 input('#source-paper','none','change');input('#poem-paper','none','change');await new Promise(r=>setTimeout(r,500));
 for(const key of ['ten-bamboo','lokta','gold','cloud','cloud-dark','newsprint','kraft']){
  const start=Date.now(),old=$('#image-preview').toDataURL();input('#source-paper',key,'change');input('#poem-paper',key,'change');
  await wait(()=>$('#image-preview').toDataURL()!==old&&text('#multi-preview-status').includes('最多预览'),'paper '+key,120000);

  record({paper:key,ms:Date.now()-start,width:$('#image-preview').width,pass:$('#image-preview').width>0});
 }
 record({viewport:frame.contentWindow.innerWidth,bodyWidth:f().documentElement.scrollWidth,dialogWidth:$('#colors-dialog').getBoundingClientRect().width});
 }catch(e){record({error:String(e)})}
 const {trace}=await network('online');output.textContent=JSON.stringify({rows,trace,finished:true},null,2)
};
