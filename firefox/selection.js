(() => {
  if (globalThis.messageAgeSelectionInstalled) return;
  globalThis.messageAgeSelectionInstalled = true;

  if (location.protocol !== "https:" || !["funpay.com", "www.funpay.com"].includes(location.hostname)) return;
  const api = globalThis.browser ?? chrome;
  const sitePattern = "https://funpay.com/*";
  const setting = "auto:" + sitePattern;
  const offsetSetting = "offset:" + sitePattern;
  let enabled = false;
  let dateOrder = "DMY";
  let offsetMinutes = 0;
  let revision = 0;
  let bubble = null;
  let timer = null;
  let selectionTimeout = null;
  let lastPointer = null;
  let testTimeout = null;

  const preferences = api.storage.local.get([setting, "dateOrder", offsetSetting]).then(values => {
    enabled = values[setting] !== false;
    dateOrder = values.dateOrder === "MDY" ? "MDY" : "DMY";
    offsetMinutes = values[offsetSetting] ?? 0;
  }).catch(() => {});

  function hide() {
    clearInterval(timer);
    clearTimeout(testTimeout);
    timer = null;
    bubble?.remove();
    bubble = null;
  }

  function readSelection() {
    const field = document.activeElement;
    if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
      if (field.type === "password") return null;
      if (typeof field.selectionStart === "number" && field.selectionEnd > field.selectionStart) {
        return {text: field.value.slice(field.selectionStart, field.selectionEnd), rect: field.getBoundingClientRect()};
      }
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    const rects = range.getClientRects();
    const rect = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    return {text: selection.toString(), rect};
  }

  function show(text, rect, explicit) {
    hide();
    const timestamp = MessageAge.parseForSite(text, {label: "", order: dateOrder, offsetMinutes});
    if (!timestamp && !explicit) return;

    bubble = document.createElement("div");
    bubble.style.cssText = "all:initial!important;position:fixed!important;inset:auto!important;z-index:2147483647!important;display:block!important;pointer-events:none!important;width:max-content!important;";
    const shadow = bubble.attachShadow({mode: "closed"});
    const style = document.createElement("style");
    style.textContent = [
      ".box{box-sizing:border-box;max-width:min(340px,calc(100vw - 20px));padding:10px 13px;",
      "background:#201937;color:#fff;border:1px solid #7b68ac;border-radius:10px;",
      "box-shadow:0 8px 24px #1b112b48;font:600 15px/1.35 system-ui,sans-serif;}",
      ".detail{display:block;color:#ded4f6;margin-top:3px;font:400 12px/1.4 system-ui,sans-serif;}",
      ".value{font-variant-numeric:tabular-nums;}"
    ].join("");
    const box = document.createElement("div");
    box.className = "box";
    box.setAttribute("role", "status");
    const value = document.createElement("div");
    value.className = "value";
    const detail = document.createElement("span");
    detail.className = "detail";
    box.append(value, detail);
    shadow.append(style, box);

    if (timestamp) {
      const update = () => { value.textContent = MessageAge.elapsed(timestamp.stamp); };
      update();
      timer = setInterval(update, 1000);
      const format = new Intl.DateTimeFormat(undefined, {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", second: "2-digit"
      });
      detail.textContent = format.format(timestamp.stamp) + (timestamp.hasSeconds ? "" : " · assumed :00 seconds");
    } else {
      value.textContent = "Timestamp not recognized";
      detail.textContent = "Select a time like 14:35 or 19/11/2026 2:35 PM.";
    }

    (document.fullscreenElement ?? document.documentElement).append(bubble);
    const {width, height} = bubble.getBoundingClientRect();
    const x = rect?.left ?? lastPointer?.x ?? window.innerWidth - width - 16;
    const below = (rect?.bottom ?? lastPointer?.y ?? 12) + 8;
    const above = (rect?.top ?? lastPointer?.y ?? 12) - height - 8;
    const y = below + height <= window.innerHeight - 8 ? below : above;
    bubble.style.setProperty("left", Math.max(8, Math.min(x, window.innerWidth - width - 8)) + "px", "important");
    bubble.style.setProperty("top", Math.max(8, y) + "px", "important");
  }

  function schedule() {
    const token = ++revision;
    clearTimeout(selectionTimeout);
    selectionTimeout = setTimeout(async () => {
      await preferences;
      if (token !== revision || !enabled) return;
      const selection = readSelection();
      if (selection) show(selection.text, selection.rect, false);
      else hide();
    }, 100);
  }

  function dismiss() {
    revision++;
    clearTimeout(selectionTimeout);
    hide();
  }

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[setting]) {
      enabled = changes[setting].newValue !== false;
      if (!enabled) dismiss();
    }
    if (changes.dateOrder) {
      dateOrder = changes.dateOrder.newValue === "MDY" ? "MDY" : "DMY";
      dismiss();
    }
    if (changes[offsetSetting]) {
      offsetMinutes = changes[offsetSetting].newValue ?? 0;
      dismiss();
    }
  });

  api.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message.type === "message-age.ping") {
      respond({version: api.runtime.getManifest().version, hover: globalThis.messageAgeHoverStatus ?? "Hover handler did not start."});
      return;
    }
    if (message.type === "message-age.test") {
      const sent = new Date(Date.now() - 300000).toISOString().replace(/\.\d{3}Z$/, "Z");
      show(sent, {left: Math.max(8, window.innerWidth - 280), bottom: 72, top: 72}, true);
      testTimeout = setTimeout(hide, 8000);
      respond({shown: true});
      return;
    }
    if (message.type !== "message-age.show") return;
    dismiss();
    void preferences.then(() => {
      const selection = readSelection();
      const rect = selection?.text.trim() === message.text.trim() ? selection.rect : null;
      show(message.text, rect, true);
    });
  });

  document.addEventListener("pointerdown", dismiss, true);
  document.addEventListener("pointerup", event => {
    lastPointer = {x: event.clientX, y: event.clientY};
    if (event.button === 0) schedule();
  }, true);
  document.addEventListener("keyup", event => {
    if (event.key === "Escape") dismiss();
    else if (event.shiftKey || event.key === "Shift") schedule();
  }, true);
  window.addEventListener("scroll", dismiss, true);
  window.addEventListener("resize", dismiss);
  window.addEventListener("pagehide", dismiss);
})();


(() => {
  if (globalThis.messageAgeHoverInstalled) return;
  globalThis.messageAgeHoverInstalled = true;

  if (location.protocol !== "https:" || !["funpay.com", "www.funpay.com"].includes(location.hostname)) return;
  const api = globalThis.browser ?? chrome;
  const sitePattern = "https://funpay.com/*";
  const setting = "auto:" + sitePattern;
  const offsetSetting = "offset:" + sitePattern;
  let enabled;
  let order = "DMY";
  let offsetMinutes = 0;
  let active = null;
  let popup = null;
  let pulse = null;
  let suppressedTitle = null;
  let pendingFunPayPointer = null;

  function report(text) {
    globalThis.messageAgeHoverStatus = text;
  }
  report("Hover handler is ready. No timestamp has been processed yet.");

  api.storage.local.get([setting, "dateOrder", offsetSetting]).then(values => {
    enabled = values[setting] !== false;
    order = values.dateOrder === "MDY" ? "MDY" : "DMY";
    offsetMinutes = values[offsetSetting] ?? 0;
    if (pendingFunPayPointer) onFunPayHover(pendingFunPayPointer);
    pendingFunPayPointer = null;
  }).catch(() => { pendingFunPayPointer = null; });

  function parseTimestamp(text, label = "", now = new Date()) {
    return MessageAge.parseForSite(text, {label, now, order, offsetMinutes});
  }

  function compact(text) {
    if (!text || text.length > 160) return "";
    return text.replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
  }

  function restoreTitle() {
    if (!suppressedTitle) return;
    const {owner, text} = suppressedTitle;
    if (owner.getAttribute("title") === "") owner.setAttribute("title", text);
    suppressedTitle = null;
  }

  function dismiss() {
    pendingFunPayPointer = null;
    clearInterval(pulse);
    pulse = null;
    active = null;
    popup?.host.remove();
    popup = null;
    restoreTitle();
  }

  function mount() {
    const host = document.createElement("div");
    host.style.cssText = "all:initial!important;position:fixed!important;z-index:2147483647!important;display:block!important;pointer-events:none!important;width:max-content!important;";
    const shadow = host.attachShadow({mode: "closed"});
    const style = document.createElement("style");
    style.textContent = [
      ":host{color-scheme:dark}",
      ".original,.elapsed{box-sizing:border-box;max-width:calc(100vw - 16px);padding:5px 9px;",
      "background:#202020;color:#f1f1f1;font:13px/1.35 Arial,sans-serif;}",
      ".original{border:1px solid #4d4d4d}",
      ".elapsed{margin-top:3px;border-radius:4px;background:#252333;color:#f7f4ff;",
      "box-shadow:0 2px 7px #0004;font-weight:700;font-variant-numeric:tabular-nums}",
      "[hidden]{display:none!important}"
    ].join("");
    const original = document.createElement("div");
    original.className = "original";
    const timer = document.createElement("div");
    timer.className = "elapsed";
    shadow.append(style, original, timer);
    (document.fullscreenElement ?? document.documentElement).append(host);
    return {host, original, timer};
  }

  function render(candidate, timestamp, original) {
    if (!popup) popup = mount();
    if (popup.original.textContent !== original) popup.original.textContent = original;
    popup.original.hidden = !original;
    const elapsed = MessageAge.elapsed(timestamp.stamp) + (timestamp.hasSeconds ? "" : " · :00 assumed");
    if (popup.timer.textContent !== elapsed) popup.timer.textContent = elapsed;

    const rect = candidate.element.getBoundingClientRect();
    const {width, height} = popup.host.getBoundingClientRect();
    const x = Math.max(8, Math.min(rect.left, innerWidth - width - 8));
    const below = rect.bottom + 3;
    const y = below + height <= innerHeight - 4
      ? below
      : Math.max(4, rect.top - height - 4);
    popup.host.style.setProperty("left", x + "px", "important");
    popup.host.style.setProperty("top", y + "px", "important");
  }

  function showTimestamp(candidate, stamp, hint) {
    if (!suppressedTitle && hint?.attr === "title" && hint.owner.getAttribute("title") === hint.raw) {
      suppressedTitle = {owner: hint.owner, text: hint.raw};
      hint.owner.setAttribute("title", "");
    }
    render(candidate, stamp, hint?.attr === "title" ? hint.text : "");
    report("Elapsed timer drawn from the timestamp label.");
  }

  function onFunPayHover(event) {
    if (event.pointerType === "touch" || event.buttons || !(event.target instanceof Element)) return;
    if (!enabled) {
      if (enabled === undefined) pendingFunPayPointer = event;
      return;
    }

    let timestamp = event.target.closest(".chat-msg-date");
    // Give the small timestamp extra room inside its message header.
    let header = event.target;
    for (let depth = 0; !timestamp && header && depth < 3; depth++, header = header.parentElement) {
      const nearby = header.querySelector(":scope > .chat-msg-date");
      if (!nearby) continue;
      const rect = nearby.getBoundingClientRect();
      if (rect.width && rect.height && event.clientX >= rect.left - 32 && event.clientX <= rect.right + 12 &&
          event.clientY >= rect.top - 8 && event.clientY <= rect.bottom + 8) timestamp = nearby;
    }
    if (timestamp && active?.element === timestamp) return;
    if (active) dismiss();
    if (!timestamp) return;

    const raw = timestamp.getAttribute("title");
    const label = compact(timestamp.textContent);
    const text = compact(raw);
    const value = parseTimestamp(text, label) ?? parseTimestamp(label);
    if (!value) return;

    const candidate = {element: timestamp};
    const hint = text ? {owner: timestamp, attr: "title", raw, text} : null;
    active = candidate;
    showTimestamp(candidate, value, hint);
    pulse = setInterval(() => {
      if (!timestamp.isConnected) dismiss();
      else render(candidate, value, hint?.text ?? "");
    }, 1000);
  }

  window.addEventListener("pointerover", onFunPayHover, true);
  window.addEventListener("pointermove", onFunPayHover, true);
  document.addEventListener("pointerout", event => {
    if (!event.relatedTarget) dismiss();
  }, true);
  document.addEventListener("pointerdown", dismiss, true);
  document.addEventListener("keyup", event => { if (event.key === "Escape") dismiss(); }, true);
  window.addEventListener("scroll", dismiss, true);
  window.addEventListener("resize", dismiss);
  window.addEventListener("pagehide", dismiss);
  document.addEventListener("visibilitychange", () => { if (document.hidden) dismiss(); });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[setting]) {
      enabled = changes[setting].newValue !== false;
      if (!enabled) dismiss();
    }
    if (changes.dateOrder) {
      order = changes.dateOrder.newValue === "MDY" ? "MDY" : "DMY";
      dismiss();
    }
    if (changes[offsetSetting]) {
      offsetMinutes = changes[offsetSetting].newValue ?? 0;
      dismiss();
    }
  });
})();


