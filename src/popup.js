const trigger = document.querySelector("#trigger");
const hoverTranslation = document.querySelector("#hoverTranslation");
const preloadOfflineResources = document.querySelector("#preloadOfflineResources");
const autoSpeak = document.querySelector("#autoSpeak");
chrome.storage.sync.get({ trigger: "selection", hoverTranslation: true, preloadOfflineResources: true, autoSpeak: false }).then((v) => {
  trigger.value = v.trigger; autoSpeak.checked = v.autoSpeak;
  hoverTranslation.checked = v.hoverTranslation;
  preloadOfflineResources.checked = v.preloadOfflineResources;
});
trigger.addEventListener("change", () => chrome.storage.sync.set({ trigger: trigger.value }));
hoverTranslation.addEventListener("change", () => chrome.storage.sync.set({ hoverTranslation: hoverTranslation.checked }));
preloadOfflineResources.addEventListener("change", () => chrome.storage.sync.set({ preloadOfflineResources: preloadOfflineResources.checked }));
autoSpeak.addEventListener("change", () => chrome.storage.sync.set({ autoSpeak: autoSpeak.checked }));
document.querySelector("#openDocument").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/reader.html") });
});
document.querySelector("#options").addEventListener("click", () => chrome.runtime.openOptionsPage());
