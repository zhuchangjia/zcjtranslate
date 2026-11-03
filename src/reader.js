import * as pdfjsLib from "../vendor/pdfjs/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.mjs", import.meta.url).href;

const fileInput = document.querySelector("#fileInput");
const fileName = document.querySelector("#fileName");
const status = document.querySelector("#status");
const documentRoot = document.querySelector("#document");
const boxSelectButton = document.querySelector("#boxSelect");
let boxSelectEnabled = false;
let dragState;

boxSelectButton.addEventListener("click", () => setBoxSelectEnabled(!boxSelectEnabled));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && boxSelectEnabled) setBoxSelectEnabled(false);
});
document.addEventListener("pointerdown", beginBoxSelection, true);
document.addEventListener("pointermove", updateBoxSelection, true);
document.addEventListener("pointerup", finishBoxSelection, true);
document.addEventListener("pointercancel", cancelBoxSelection, true);

fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  fileName.textContent = file.name;
  documentRoot.replaceChildren();
  documentRoot.classList.remove("pdf-document");
  setStatus("正在本机解析文档……");
  try {
    const buffer = await file.arrayBuffer();
    let hasSelectableText = true;
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") hasSelectableText = await renderPdf(buffer);
    else if (/\.docx$/i.test(file.name)) await renderDocx(buffer);
    else throw new Error("目前只支持 PDF 和 DOCX 文件");
    const text = documentRoot.textContent || "";
    document.documentElement.lang = /[\u3040-\u30ffー]/u.test(text) ? "ja" : "en";
    if (hasSelectableText) {
      setStatus("解析完成。可以选择文字、双击单词，或将鼠标停在单词上 1 秒进行翻译。");
    } else {
      setStatus("PDF 页面已按原样显示，但该文件没有可选择的文字，可能是扫描图片版；需要 OCR 后才能翻译。", true);
    }
  } catch (error) {
    setStatus(`无法打开文档：${error.message || error}`, true);
  } finally {
    fileInput.value = "";
  }
});

async function renderPdf(buffer) {
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  documentRoot.classList.add("pdf-document");
  let selectableCharacters = 0;
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    setStatus(`正在还原 PDF 原始页面：第 ${pageNumber} / ${pdf.numPages} 页……`);
    const page = await pdf.getPage(pageNumber);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max(320, Math.min(window.innerWidth - 40, 1200));
    const scale = Math.min(1.5, availableWidth / unscaledViewport.width);
    const viewport = page.getViewport({ scale });
    const outputScale = Math.min(window.devicePixelRatio || 1, 2);
    const content = await page.getTextContent();
    selectableCharacters += content.items.reduce((total, item) => total + String(item.str || "").length, 0);
    const section = document.createElement("section");
    section.className = "reader-page pdf-page";
    section.setAttribute("aria-label", `第 ${pageNumber} 页`);
    section.style.width = `${viewport.width}px`;
    section.style.height = `${viewport.height}px`;
    const canvas = document.createElement("canvas");
    canvas.className = "pdf-canvas";
    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    const textLayer = document.createElement("div");
    textLayer.className = "textLayer";
    section.append(canvas, textLayer);
    documentRoot.appendChild(section);
    await page.render({
      canvasContext: canvas.getContext("2d", { alpha: false }),
      viewport,
      transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0]
    }).promise;
    await new pdfjsLib.TextLayer({
      textContentSource: content,
      container: textLayer,
      viewport
    }).render();
    page.cleanup();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return selectableCharacters > 0;
}

async function renderDocx(buffer) {
  if (!globalThis.mammoth) throw new Error("Word 解析组件未加载");
  const result = await globalThis.mammoth.extractRawText({ arrayBuffer: buffer });
  const paragraphs = String(result.value || "").split(/\n{2,}/u).map((value) => value.trim()).filter(Boolean);
  if (!paragraphs.length) throw new Error("文档中没有可提取文字");
  for (const value of paragraphs) {
    const paragraph = document.createElement("p");
    paragraph.className = "reader-paragraph";
    paragraph.textContent = value;
    documentRoot.appendChild(paragraph);
  }
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle("error", isError);
}

function setBoxSelectEnabled(enabled) {
  boxSelectEnabled = Boolean(enabled);
  boxSelectButton.setAttribute("aria-pressed", String(boxSelectEnabled));
  document.body.classList.toggle("box-select-mode", boxSelectEnabled);
  if (boxSelectEnabled) setStatus("框选模式已开启：请在同一页 PDF 上按住鼠标并拖出矩形，松开后自动翻译框内文字。");
  else if (!dragState) setStatus("框选模式已关闭，可继续使用普通选词和悬停翻译。");
}

function beginBoxSelection(event) {
  if (!boxSelectEnabled || event.button !== 0) return;
  const page = event.target.closest?.(".pdf-page");
  if (!page || event.target.closest?.("#zcj-translate-card")) return;
  event.preventDefault();
  event.stopPropagation();
  window.getSelection()?.removeAllRanges();
  const pageRect = page.getBoundingClientRect();
  const startX = clamp(event.clientX - pageRect.left, 0, pageRect.width);
  const startY = clamp(event.clientY - pageRect.top, 0, pageRect.height);
  const overlay = document.createElement("div");
  overlay.className = "box-selection";
  page.appendChild(overlay);
  dragState = { page, pageRect, startX, startY, currentX: startX, currentY: startY, overlay, pointerId: event.pointerId };
  page.setPointerCapture?.(event.pointerId);
  drawSelectionBox();
}

function updateBoxSelection(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  event.preventDefault();
  dragState.currentX = clamp(event.clientX - dragState.pageRect.left, 0, dragState.pageRect.width);
  dragState.currentY = clamp(event.clientY - dragState.pageRect.top, 0, dragState.pageRect.height);
  drawSelectionBox();
}

function finishBoxSelection(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  event.preventDefault();
  event.stopPropagation();
  updateBoxSelection(event);
  const state = dragState;
  dragState = undefined;
  state.page.releasePointerCapture?.(event.pointerId);
  const bounds = selectionBounds(state);
  const text = bounds.width >= 5 && bounds.height >= 5 ? textInsideBox(state.page, bounds) : "";
  setTimeout(() => state.overlay.remove(), 180);
  if (!text) {
    setStatus("框内没有检测到可翻译文字，请覆盖文字中部后重试。", true);
    return;
  }
  setStatus(`已提取框内文字（${text.length} 个字符），正在翻译……`);
  document.dispatchEvent(new CustomEvent("zcj-document-translate", {
    detail: {
      text,
      x: state.pageRect.left + bounds.left,
      y: state.pageRect.top + bounds.top + bounds.height
    }
  }));
}

function cancelBoxSelection(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  dragState.overlay.remove();
  dragState = undefined;
}

function drawSelectionBox() {
  const bounds = selectionBounds(dragState);
  Object.assign(dragState.overlay.style, {
    left: `${bounds.left}px`, top: `${bounds.top}px`,
    width: `${bounds.width}px`, height: `${bounds.height}px`
  });
}

function selectionBounds(state) {
  const left = Math.min(state.startX, state.currentX);
  const top = Math.min(state.startY, state.currentY);
  return {
    left, top,
    width: Math.abs(state.currentX - state.startX),
    height: Math.abs(state.currentY - state.startY)
  };
}

function textInsideBox(page, bounds) {
  const pageRect = page.getBoundingClientRect();
  const selection = {
    left: pageRect.left + bounds.left,
    right: pageRect.left + bounds.left + bounds.width,
    top: pageRect.top + bounds.top,
    bottom: pageRect.top + bounds.top + bounds.height
  };
  const fragments = [...page.querySelectorAll(".textLayer span")]
    .filter((span) => !span.querySelector("span") && span.textContent.trim())
    .map((span, order) => ({ span, order, rect: span.getBoundingClientRect(), text: span.textContent }))
    .filter(({ rect }) => rectangleOverlapRatio(rect, selection) >= 0.2);
  return joinTextFragments(fragments);
}

function rectangleOverlapRatio(rect, selection) {
  const width = Math.max(0, Math.min(rect.right, selection.right) - Math.max(rect.left, selection.left));
  const height = Math.max(0, Math.min(rect.bottom, selection.bottom) - Math.max(rect.top, selection.top));
  const area = Math.max(1, rect.width * rect.height);
  return width * height / area;
}

function joinTextFragments(fragments) {
  if (!fragments.length) return "";
  fragments.sort((a, b) => a.order - b.order);
  let output = "";
  let previous;
  for (const fragment of fragments) {
    const value = fragment.text.trim();
    if (!value) continue;
    const newLine = previous && Math.abs(fragment.rect.top - previous.rect.top) > Math.max(5, previous.rect.height * 0.65);
    if (output) {
      if (newLine) output += "\n";
      else if (!/[-\s]$/u.test(output) && !/^[,.;:!?%)\]}、。！？]/u.test(value)) output += " ";
    }
    output += value;
    previous = fragment;
  }
  return output.trim();
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
