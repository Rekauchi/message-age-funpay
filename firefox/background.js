const api = globalThis.browser ?? chrome;
const menuId = "message-age";
const funPayPages = ["https://funpay.com/*", "https://www.funpay.com/*"];

api.runtime.onInstalled.addListener(async () => {
  if (globalThis.browser) {
    await api.contextMenus.removeAll();
  } else {
    await new Promise(resolve => api.contextMenus.removeAll(resolve));
  }
  api.contextMenus.create({
    id: menuId,
    title: "Show elapsed time",
    contexts: ["selection"],
    documentUrlPatterns: funPayPages
  });
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== menuId || tab?.id === undefined || !info.selectionText) return;
  const url = new URL(info.frameUrl ?? info.pageUrl ?? "about:blank");
  if (url.protocol !== "https:" || !["funpay.com", "www.funpay.com"].includes(url.hostname)) return;
  await api.tabs.sendMessage(tab.id, {type: "message-age.show", text: info.selectionText},
    {frameId: info.frameId ?? 0}).catch(() => {});
});
