const api = globalThis.browser ?? chrome;
const toggle = document.querySelector("#toggle");
const order = document.querySelector("#order");
const site = document.querySelector("#site");
const status = document.querySelector("#status");
const test = document.querySelector("#test");
const version = api.runtime.getManifest().version;
document.querySelector("#version").textContent = version;

async function setup() {
  const stored = await api.storage.local.get("dateOrder");
  order.value = stored.dateOrder === "MDY" ? "MDY" : "DMY";
  order.disabled = false;
  order.addEventListener("change", () => {
    api.storage.local.set({dateOrder: order.value}).catch(() => {
      status.textContent = "Could not save the date format.";
    });
  });

  const [tab] = await api.tabs.query({active: true, currentWindow: true});
  const url = tab?.url ? new URL(tab.url) : null;
  const isFunPay = url?.protocol === "https:" && ["funpay.com", "www.funpay.com"].includes(url.hostname);
  const key = "auto:https://funpay.com/*";
  const offsetKey = "offset:https://funpay.com/*";
  const values = await api.storage.local.get([key, offsetKey]);
  let enabled = values[key] !== false;
  let ready = false;
  site.textContent = isFunPay ? url.hostname : "Open FunPay to use the hover timer.";
  const offsetForm = document.querySelector("#site-offset");
  const offset = document.querySelector("#offset");
  const saveOffset = document.querySelector("#save-offset");
  offset.value = values[offsetKey] ?? 0;
  offsetForm.hidden = false;
  offsetForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!offset.reportValidity()) return;
    saveOffset.disabled = true;
    try {
      await api.storage.local.set({[offsetKey]: offset.valueAsNumber});
      status.textContent = "FunPay time offset saved.";
    } catch {
      status.textContent = "Could not save the time offset.";
    } finally {
      saveOffset.disabled = false;
    }
  });

  function render() {
    toggle.disabled = false;
    toggle.textContent = enabled ? "Turn off hover timer" : "Turn on hover timer";
    test.hidden = !isFunPay;
    test.disabled = !ready;
  }

  async function connect() {
    if (!isFunPay) return;
    const reply = await api.tabs.sendMessage(tab.id, {type: "message-age.ping"}, {frameId: 0}).catch(() => null);
    ready = reply?.version === version;
    status.textContent = ready ? (enabled ? "Hover timer on." : "Hover timer off.") : "Refresh FunPay to activate this version.";
    document.querySelector("#hover").textContent = reply?.hover ?? "";
  }

  toggle.addEventListener("click", async () => {
    toggle.disabled = true;
    try {
      await api.storage.local.set({[key]: !enabled});
      enabled = !enabled;
      status.textContent = enabled ? "Hover timer on." : "Hover timer off.";
    } catch {
      status.textContent = "Could not save the hover setting.";
    } finally {
      render();
    }
  });

  test.addEventListener("click", async () => {
    try {
      const result = await api.tabs.sendMessage(tab.id, {type: "message-age.test"}, {frameId: 0});
      if (!result?.shown) throw new Error("The page did not answer. Refresh it and try again.");
      window.close();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  await connect();
  render();
}

setup().catch(error => { status.textContent = error.message || "Could not read this tab."; });

