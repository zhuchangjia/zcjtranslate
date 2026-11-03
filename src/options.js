const defaults = { sourceLanguage: "auto", targetLanguage: "auto" };
chrome.storage.sync.get(defaults).then((v) => Object.keys(defaults).forEach((key) => document.querySelector(`#${key}`).value = v[key]));
document.querySelector("#save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    sourceLanguage: document.querySelector("#sourceLanguage").value,
    targetLanguage: document.querySelector("#targetLanguage").value
  });
  const saved = document.querySelector("#saved"); saved.textContent = "已保存";
  setTimeout(() => saved.textContent = "", 1500);
});
