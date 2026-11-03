(() => {
  if (window.__zcjTranslateLoaded) return;
  window.__zcjTranslateLoaded = true;
  let card;
  let lastSelection = "";
  let hoverTimer;
  let hoverEnabled = true;
  let lastHoverText = "";
  let lastAnchor = { x: 12, y: 12 };

  safeStorageGet({ preloadOfflineResources: true }).then((settings) => {
    if (!settings.preloadOfflineResources) return;
    const prewarm = () => safeSendMessage({ type: "PREWARM_OFFLINE_RESOURCES" }).catch(() => {});
    if (window.requestIdleCallback) window.requestIdleCallback(prewarm, { timeout: 3000 });
    else setTimeout(prewarm, 1500);
  });

  safeStorageGet({ hoverTranslation: true }).then((settings) => {
    hoverEnabled = settings.hoverTranslation;
  });
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === "sync" && changes.hoverTranslation) hoverEnabled = changes.hoverTranslation.newValue;
  });

  document.addEventListener("mousemove", (event) => {
    clearTimeout(hoverTimer);
    if (!hoverEnabled || document.body.classList.contains("box-select-mode") || event.target?.closest?.("#zcj-translate-card")) return;
    if (card?.dataset.triggerMode === "hover") closeCard();
    const { clientX: x, clientY: y } = event;
    hoverTimer = setTimeout(() => translateHoveredWord(x, y), 500);
  }, { passive: true });
  document.addEventListener("scroll", cancelHover, true);

  document.addEventListener("mouseup", async (event) => {
    if (event.target?.closest?.("#zcj-translate-card")) return;
    const settings = await safeStorageGet({ trigger: "selection" });
    if (settings.trigger === "manual") return;
    setTimeout(() => {
      const text = selectedText();
      if (text && text !== lastSelection && looksSupported(text)) {
        lastSelection = text;
        const position = selectionPosition(event.clientX, event.clientY);
        showLoading(position.x, position.y, text);
        requestLookup(text);
      }
    }, 20);
  });

  document.addEventListener("dblclick", (event) => {
    const text = selectedText();
    if (!text || !looksSupported(text)) return;
    lastSelection = text;
    const position = selectionPosition(event.clientX, event.clientY);
    showLoading(position.x, position.y, text);
    requestLookup(text);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeCard();
  });
  document.addEventListener("mousedown", (event) => {
    cancelHover();
    if (card && !card.contains(event.target)) closeCard();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "TRANSLATE_SELECTION") translateCurrentSelection();
    if (message.type === "TRANSLATE_TEXT") translateText(message.text);
  });
  document.addEventListener("zcj-document-translate", (event) => {
    if (location.protocol !== "chrome-extension:") return;
    const text = String(event.detail?.text || "").trim();
    if (!text || !looksSupported(text)) return;
    lastSelection = text;
    showLoading(Number(event.detail?.x) || innerWidth / 2, Number(event.detail?.y) || innerHeight / 2, text);
    requestLookup(text);
  });

  function translateCurrentSelection() { translateText(selectedText()); }
  function translateText(text) {
    text = String(text || "").trim();
    if (!text) return;
    const position = selectionPosition(innerWidth / 2, innerHeight / 2);
    showLoading(position.x, position.y, text);
    requestLookup(text);
  }

  function selectedText() { return String(window.getSelection()?.toString() || "").trim(); }
  function cancelHover() { clearTimeout(hoverTimer); hoverTimer = undefined; }
  function translateHoveredWord(x, y) {
    if (!hoverEnabled || selectedText()) return;
    const hovered = wordAtPoint(x, y);
    if (!hovered || !looksSupported(hovered.text)) return;
    if (hovered.text === lastHoverText && card) return;
    lastHoverText = hovered.text;
    lastSelection = "";
    showLoading(hovered.left, hovered.bottom, hovered.text, "hover");
    requestLookup(hovered.text);
  }

  function wordAtPoint(x, y) {
    let node;
    let offset;
    if (document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y);
      node = position?.offsetNode; offset = position?.offset;
    } else if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      node = range?.startContainer; offset = range?.startOffset;
    }
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const value = node.nodeValue || "";
    const candidates = [];
    for (const match of value.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)) {
      candidates.push({ text: match[0], start: match.index, end: match.index + match[0].length });
    }
    if (/[^\x00-\x7f]/u.test(value)) {
      try {
        const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
        for (const segment of segmenter.segment(value)) {
          if (segment.isWordLike && /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶー]/u.test(segment.segment)) {
            candidates.push({ text: segment.segment, start: segment.index, end: segment.index + segment.segment.length });
          }
        }
      } catch (_error) { /* Older Chromium: selection translation remains available. */ }
    }
    const candidate = candidates.find((item) => offset >= item.start && offset <= item.end)
      || candidates.find((item) => offset > 0 && offset - 1 >= item.start && offset - 1 < item.end);
    if (!candidate) return null;
    const range = document.createRange();
    range.setStart(node, candidate.start); range.setEnd(node, candidate.end);
    const rect = range.getBoundingClientRect();
    if (!rect.width || x < rect.left - 2 || x > rect.right + 2 || y < rect.top - 2 || y > rect.bottom + 2) return null;
    return { text: candidate.text.replace(/’/g, "'"), left: rect.left, bottom: rect.bottom };
  }
  function selectionPosition(fallbackX, fallbackY) {
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect && (rect.width || rect.height)) return { x: rect.left, y: rect.bottom };
    }
    return { x: fallbackX, y: fallbackY };
  }
  function looksEnglish(text) {
    const letters = (text.match(/[A-Za-z]/g) || []).length;
    return letters >= 1 && letters / Math.max(text.replace(/\s/g, "").length, 1) >= 0.5;
  }
  function looksSupported(text) {
    const hasKana = /[\u3040-\u30ffー]/u.test(text);
    const japanesePage = /^ja(?:-|$)/i.test(document.documentElement.lang || "");
    return looksEnglish(text) || hasKana || (japanesePage && /[\u3400-\u9fff々〆ヵヶ]/u.test(text));
  }

  async function requestLookup(text) {
    try {
      const result = await safeSendMessage({
        type: "LOOKUP",
        text,
        pageLanguage: document.documentElement.lang || navigator.language || ""
      });
      if (!result?.ok) throw new Error(result?.error || "翻译失败");
      renderResult(result);
      if (result.canOfflineModel) requestOfflineModel(result);
      const settings = await safeStorageGet({ autoSpeak: false });
      if (settings.autoSpeak) speak(spokenText(result), result.source);
    } catch (error) { renderError(error.message); }
  }

  async function requestOfflineModel(result) {
    try {
      const response = await safeSendMessage({ type: "LOCAL_MODEL_TRANSLATE", text: result.text });
      if (!card || card.dataset.requestText !== result.text) return;
      const slot = card.querySelector(".zcj-model-slot");
      if (!response?.ok || !response.translation) {
        if (slot) {
          slot.classList.remove("zcj-model-pending");
          slot.innerHTML = `<div class="zcj-section-label zcj-model-error-label">本地 OPUS-MT 未生效</div><div class="zcj-model-error"></div>`;
          slot.querySelector(".zcj-model-error").textContent = response?.error || "模型没有返回译文";
        }
        repositionCard();
        return;
      }
      slot.classList.remove("zcj-model-pending");
      slot.innerHTML = `<div class="zcj-translation zcj-model-translation"></div>`;
      slot.querySelector(".zcj-model-translation").textContent = response.translation;
      repositionCard();
    } catch (error) {
      if (card?.dataset.requestText === result.text) {
        const slot = card.querySelector(".zcj-model-slot");
        if (slot) slot.innerHTML = `<div class="zcj-section-label zcj-model-error-label">本地 OPUS-MT 未生效</div><div class="zcj-model-error"></div>`;
        const detail = slot?.querySelector(".zcj-model-error");
        if (detail) detail.textContent = error.message || "模型调用失败";
        repositionCard();
      }
    }
  }

  function showLoading(x, y, text, triggerMode = "selection") {
    ensureCard();
    card.dataset.triggerMode = triggerMode;
    card.innerHTML = `<div class="zcj-head"><span>指译</span><button data-close aria-label="关闭">×</button></div><div class="zcj-word"></div><div class="zcj-loading">正在翻译…</div>`;
    card.querySelector(".zcj-word").textContent = text;
    bindClose();
    positionCard(x, y);
  }

  function renderResult(result) {
    ensureCard();
    card.dataset.requestText = result.text;
    const isParagraph = result.kind === "paragraph" || result.levels?.includes("WORD-BY-WORD");
    card.innerHTML = `
      <div class="zcj-head"><span>指译 · 离线词库</span><button data-close aria-label="关闭">×</button></div>
      ${isParagraph ? "" : `<div class="zcj-source"><strong class="zcj-word"></strong><button class="zcj-speak" title="播放读音" aria-label="播放读音">🔊</button></div>`}
      ${result.phonetic ? `<div class="zcj-phonetic"></div>` : ""}
      ${result.partOfSpeech ? `<div class="zcj-part"></div>` : ""}
      ${result.levels?.some((level) => level !== "WORD-BY-WORD") ? `<div class="zcj-levels"></div>` : ""}
      ${isParagraph && result.canOfflineModel ? `<div class="zcj-model-slot zcj-model-pending"><div class="zcj-loading">正在加载本地 OPUS-MT 整句翻译…（首次较慢）</div></div>` : ""}
      <div class="zcj-translation"></div>
      ${result.meanings.length > 1 ? `<details><summary>全部中文释义</summary><ul class="zcj-meanings"></ul></details>` : ""}`;
    const word = card.querySelector(".zcj-word");
    if (word) word.textContent = result.text;
    card.querySelector(".zcj-translation").textContent = result.translation;
    const phonetic = card.querySelector(".zcj-phonetic");
    if (phonetic) phonetic.textContent = result.source === "ja" ? `读音：${result.phonetic}` : result.phonetic;
    const part = card.querySelector(".zcj-part");
    if (part) part.textContent = `词性：${result.partOfSpeech}`;
    const levels = card.querySelector(".zcj-levels");
    if (levels) result.levels.filter((level) => level !== "WORD-BY-WORD").forEach((level) => {
      const badge = document.createElement("span");
      badge.textContent = level === "JA-COMMON" ? "常用日语" : level === "COMMON" ? "常用词" : level === "ECDICT" ? "通用词典" : level === "JUNIOR_HIGH" ? "初中" : level === "SENIOR_HIGH" ? "高中" : level === "TEM8" ? "专八" : level === "CET6" ? "六级" : "四级";
      levels.appendChild(badge);
    });
    const list = card.querySelector(".zcj-meanings");
    if (list) result.meanings.forEach((meaning) => {
      const li = document.createElement("li");
      li.textContent = `${meaning.partOfSpeech ? meaning.partOfSpeech + ". " : ""}${meaning.definition}`;
      list.appendChild(li);
    });
    card.querySelector(".zcj-speak")?.addEventListener("click", () => speak(spokenText(result), result.source));
    bindClose();
    repositionCard();
  }

  function renderError(message) {
    ensureCard();
    card.innerHTML = `<div class="zcj-head"><span>指译</span><button data-close aria-label="关闭">×</button></div><div class="zcj-error"></div>`;
    card.querySelector(".zcj-error").textContent = message;
    bindClose();
    repositionCard();
  }

  function ensureCard() {
    if (!card) {
      card = document.createElement("aside");
      card.id = "zcj-translate-card";
      card.setAttribute("role", "dialog");
      document.documentElement.appendChild(card);
    }
  }
  function bindClose() { card.querySelector("[data-close]")?.addEventListener("click", closeCard); }
  function closeCard() { card?.remove(); card = null; lastSelection = ""; lastHoverText = ""; }
  function positionCard(x, y) {
    const margin = 12;
    lastAnchor = { x, y };
    const top = Math.min(Math.max(margin, y + 10), Math.max(margin, innerHeight - margin - 24));
    const availableHeight = Math.max(24, innerHeight - top - margin);
    const availableWidth = Math.max(80, innerWidth - margin * 2);
    card.style.setProperty("--zcj-base-size", "14px");
    card.style.maxHeight = `${availableHeight}px`;
    card.style.width = `${availableWidth}px`;
    card.style.left = `${margin}px`;
    card.style.top = `${top}px`;
    const naturalHeight = card.scrollHeight;
    if (naturalHeight > availableHeight) {
      const scaledSize = Math.max(10, Math.min(14, Math.floor(14 * availableHeight / naturalHeight * 10) / 10));
      card.style.setProperty("--zcj-base-size", `${scaledSize}px`);
    }
  }
  function repositionCard() {
    if (!card) return;
    requestAnimationFrame(() => {
      if (card) positionCard(lastAnchor.x, lastAnchor.y);
    });
  }
  async function speak(text, language = "en") {
    try {
      const result = await safeSendMessage({ type: "SPEAK", text, language });
      if (!result?.ok) throw new Error(result?.error || "播放失败");
    } catch (error) {
      renderError(`无法播放：${error.message}`);
    }
  }
  function spokenText(result) {
    return result.source === "ja" ? (result.phonetic || result.text) : result.text;
  }
  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function safeStorageGet(defaults) {
    try {
      if (!chrome.runtime?.id) return defaults;
      return await chrome.storage.sync.get(defaults);
    } catch (error) {
      if (isInvalidatedContext(error)) return defaults;
      throw error;
    }
  }

  async function safeSendMessage(message) {
    try {
      if (!chrome.runtime?.id) return { ok: false, error: "扩展已更新，请刷新当前网页后重试" };
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (isInvalidatedContext(error)) return { ok: false, error: "扩展已更新，请刷新当前网页后重试" };
      throw error;
    }
  }

  function isInvalidatedContext(error) {
    return /Extension context invalidated|message port closed|Receiving end does not exist/i.test(String(error?.message || error));
  }
})();
