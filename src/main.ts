import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface ImgEntry {
  path: string;
  w: number;
  h: number;
}

type FitMode = "fitHeight" | "original";

// 全局状态
const state = {
  entries: [] as ImgEntry[],
  speed: 50, // px/s
  maxCached: 10,
  fitMode: "fitHeight" as FitMode,
};

// DOM 引用
let viewport: HTMLElement;
let film: HTMLElement;
let btnOpen: HTMLButtonElement;
let inputSpeed: HTMLInputElement;
let selectFit: HTMLSelectElement;
let inputCache: HTMLInputElement;

// 当前在 DOM 里的缓存图（按逻辑顺序排列）
interface Item {
  logicalIndex: number; // 逻辑序号，无限递增；取模得 entries 索引，从而循环
  el: HTMLImageElement;
  logicalX: number; // 左边缘逻辑坐标
  width: number;
}
const items: Item[] = [];

let viewportLeft = 0; // 视口左边缘的逻辑坐标（随滚动递增）
let nextLogicalIndex = 0; // 下一张待加载的逻辑序号
let nextLogicalX = 0; // 下一张将占据的 logicalX（= 已加载内容的最右边缘）

let rafId = 0;
let lastTime = 0;

function entryAt(logicalIndex: number): ImgEntry {
  return state.entries[logicalIndex % state.entries.length];
}

function computeWidth(e: ImgEntry): number {
  if (e.w === 0 || e.h === 0) return viewport.clientHeight; // 尺寸未知时兜底
  if (state.fitMode === "fitHeight") {
    return Math.round((e.w / e.h) * viewport.clientHeight);
  }
  return e.w; // original
}

function applyHeight(el: HTMLImageElement, height: number) {
  el.style.height = state.fitMode === "fitHeight" ? `${height}px` : "auto";
}

// 追加下一张到右侧
function appendNext() {
  if (state.entries.length === 0) return;
  const logicalIndex = nextLogicalIndex;
  const entry = entryAt(logicalIndex);
  const width = computeWidth(entry);
  const el = document.createElement("img");
  el.src = convertFileSrc(entry.path);
  el.style.position = "absolute";
  el.style.left = `${nextLogicalX}px`;
  el.style.width = `${width}px`;
  applyHeight(el, viewport.clientHeight);
  el.draggable = false;
  film.appendChild(el);
  items.push({ logicalIndex, el, logicalX: nextLogicalX, width });
  nextLogicalIndex++;
  nextLogicalX += width;
}

// 右侧不足时继续加载
function ensureLoaded() {
  const vw = viewport.clientWidth;
  const threshold = vw; // 预留约一屏
  const guard = state.maxCached + 5; // 单帧追加上限，防止极端情况失控
  while (nextLogicalX < viewportLeft + vw + threshold && items.length < guard) {
    appendNext();
  }
}

// 移除已滚出视口左侧的图（延迟到超过缓存上限才卸）
function unloadLeft() {
  while (items.length > state.maxCached) {
    const first = items[0];
    if (first.logicalX + first.width <= viewportLeft) {
      first.el.remove();
      items.shift();
    } else {
      break;
    }
  }
}

function tick(now: number) {
  if (lastTime === 0) lastTime = now;
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  viewportLeft += state.speed * dt;
  film.style.transform = `translateX(${-viewportLeft}px)`;
  ensureLoaded();
  unloadLeft();
  rafId = requestAnimationFrame(tick);
}

// 切换尺寸模式 / 窗口尺寸变化时，重排现有图
function relayout() {
  let x = 0;
  const h = viewport.clientHeight;
  for (const it of items) {
    const e = entryAt(it.logicalIndex);
    it.width = computeWidth(e);
    it.logicalX = x;
    it.el.style.left = `${x}px`;
    it.el.style.width = `${it.width}px`;
    applyHeight(it.el, h);
    x += it.width;
  }
  nextLogicalX = x;
}

function startGallery() {
  cancelAnimationFrame(rafId);
  items.forEach((it) => it.el.remove());
  items.length = 0;
  viewportLeft = 0;
  nextLogicalIndex = 0;
  nextLogicalX = 0;
  lastTime = 0;
  for (let i = 0; i < 5; i++) appendNext(); // 预加载首张 + 后 4 张
  film.style.transform = "translateX(0px)";
  rafId = requestAnimationFrame(tick);
}

async function openFile() {
  const selected = await open({
    multiple: false,
    filters: [{ name: "图片", extensions: ["webp", "jpg", "jpeg", "png"] }],
  });
  if (!selected || typeof selected !== "string") return;
  try {
    state.entries = await invoke<ImgEntry[]>("list_images", { path: selected });
  } catch (e) {
    alert("读取目录失败：" + e);
    return;
  }
  if (state.entries.length === 0) {
    alert("该目录没有支持的图片文件");
    return;
  }
  startGallery();
}

window.addEventListener("DOMContentLoaded", () => {
  viewport = document.getElementById("viewport")!;
  film = document.getElementById("film")!;
  btnOpen = document.getElementById("btn-open") as HTMLButtonElement;
  inputSpeed = document.getElementById("input-speed") as HTMLInputElement;
  selectFit = document.getElementById("select-fit") as HTMLSelectElement;
  inputCache = document.getElementById("input-cache") as HTMLInputElement;

  inputSpeed.value = String(state.speed);
  inputCache.value = String(state.maxCached);

  btnOpen.addEventListener("click", openFile);
  inputSpeed.addEventListener("input", () => {
    state.speed = Number(inputSpeed.value) || 0;
  });
  selectFit.addEventListener("change", () => {
    state.fitMode = selectFit.value as FitMode;
    relayout();
  });
  inputCache.addEventListener("change", () => {
    state.maxCached = Math.max(2, Number(inputCache.value) || 10);
  });
  window.addEventListener("resize", () => {
    if (items.length > 0) relayout();
  });
});
