export const $ = (s) => document.querySelector(s);
let toastTimer;
function toast(s) {
  $("#toast").textContent = s;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3000);
}

export { toast };
export function initUI() {
  $("#today").textContent = new Date()
    .toLocaleDateString("zh-CN")
    .replaceAll("/", ".");
  document
    .querySelectorAll("dialog .close")
    .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
  document.querySelectorAll("dialog").forEach((d) =>
    d.addEventListener("click", (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          d.close();
      }
    }),
  );
  $("#help").onclick = () => $("#help-dialog").showModal();
}
