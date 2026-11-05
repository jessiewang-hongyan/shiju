// App-owned modal keeps keyboard focus and works consistently on mobile browsers.
export function confirmDialog(message) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "confirm-work";
    dialog.setAttribute("aria-label", "确认操作");
    const text = document.createElement("p");
    text.textContent = message;
    const cancel = document.createElement("button");
    cancel.textContent = "取消";
    const accept = document.createElement("button");
    accept.textContent = "确认";
    let accepted = false;
    cancel.onclick = () => dialog.close();
    accept.onclick = () => {
      accepted = true;
      dialog.close();
    };
    dialog.onclose = () => {
      dialog.remove();
      resolve(accepted);
    };
    dialog.append(text, cancel, accept);
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
