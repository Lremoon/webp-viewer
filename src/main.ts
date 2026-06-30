import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

interface ImgEntry {
  path: string;
  w: number;
  h: number;
}
interface ListResult {
  entries: ImgEntry[];
  startIndex: number;
}
type FitMode = "fitHeight" | "original";

// 全局状态
const state = {
  entries: [] as ImgEntry[],
  speed: 50, // px/s，可为负（负=反向滚动）
  maxCached: 10, // UI 显示值；内部偶数化
  fitMode: "fitHeight" as FitMode,
  paused: false,
};

// DOM
let viewport: HTMLElement;
let film: HTMLElement;
let btnOpen: HTMLButtonElement;
let btnToggle: HTMLButtonElement;
let inputSpeed: HTMLInputElement;
let selectFit: HTMLSelectElement;
let inputCache: HTMLInputElement;

// 当前缓存的图（逻辑序号 + 元素）。靠绝对坐标定位，数组无须有序
interface Item {
  logicalIndex: number;
  el: HTMLImageElement;
}
const items: Item[] = [];

let viewportLeft = 0; // 视口左边缘的绝对逻辑坐标（可正可负）
let rafId = 0;
let lastTime = 0;

// 一轮循环的宽度累加（随 fitMode / 视口高度变化而重算）
let prefixSum: number[] = [0];
let totalWidth = 0;

const SPEED_STEP = 10; // 滚轮每次步进 px/s
const DRAG_THRESHOLD = 5; // 拖动判定阈值：水平位移超过此值才算拖动，否则算点击

// 拖动状态
let dragging = false; //鼠标左键处于按下状态
let dragMoved = false; // 本次按下是否已判定为拖动（超过阈值）
let dragStartX = 0; // 按下时的鼠标 clientX
let dragStartLeft = 0; // 按下时的 viewportLeft

function n(): number {
  return state.entries.length;
}
function effectiveMax(): number {
  const m = state.maxCached;
  return m % 2 === 0 ? m : m + 1;
}
function halfBuffer(): number {
  return Math.floor(effectiveMax() / 2);
}
function entryWidth(logicalIndex: number): number {
  const idx = ((logicalIndex % n()) + n()) % n();
  const e = state.entries[idx];
  if (e.w === 0 || e.h === 0) return viewport.clientHeight;
  return state.fitMode === "fitHeight"
    ? Math.round((e.w / e.h) * viewport.clientHeight)
    : e.w;
}

function recomputeLayout(): void {
  prefixSum = [0];
  for (let i = 0; i < n(); i++) prefixSum.push(prefixSum[i] + entryWidth(i));
  totalWidth = prefixSum[n()] || 0;
}

function logicalX(k: number): number {
  const len = n();
  const round = Math.floor(k / len);
  const idx = ((k % len) + len) % len;
  return round * totalWidth + prefixSum[idx];
}

function kAtX(x: number): number {
  const len = n();
  if (len === 0 || totalWidth === 0) return 0;
  const round = Math.floor(x / totalWidth);
  const rem = x - round * totalWidth;
  let lo = 0;
  let hi = len;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (prefixSum[mid] <= rem) lo = mid;
    else hi = mid;
  }
  return round * len + lo;
}

function applyHeight(el: HTMLImageElement): void {
  el.style.height = state.fitMode === "fitHeight" ? `${viewport.clientHeight}px` : "auto";
}

function createItem(k: number): Item {
  const idx = ((k % n()) + n()) % n();
  const e = state.entries[idx];
  const el = document.createElement("img");
  el.src = convertFileSrc(e.path);
  el.style.position = "absolute";
  el.style.left = `${logicalX(k)}px`;
  el.style.width = `${entryWidth(k)}px`;
  applyHeight(el);
  el.draggable = false;
  film.appendChild(el);
  return { logicalIndex: k, el };
}

// 双向同步缓存窗口：卸载窗口外、加载窗口内缺失的
function syncWindow(): void {
  const half = halfBuffer();
  const vw = viewport.clientWidth;
  const winMin = kAtX(viewportLeft) - half;
  const winMax = kAtX(viewportLeft + vw) + half;

  for (let i = items.length - 1; i >= 0; i--) {
    const li = items[i].logicalIndex;
    if (li < winMin || li > winMax) {
      items[i].el.remove();
      items.splice(i, 1);
    }
  }
  for (let k = winMin; k <= winMax; k++) {
    if (!items.some((it) => it.logicalIndex === k)) {
      items.push(createItem(k));
    }
  }
}

function tick(now: number): void {
  if (lastTime === 0) lastTime = now;
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  // 拖动中（dragMoved）或暂停时不自动推进，由鼠标控制
  if (!state.paused && !dragMoved) viewportLeft += state.speed * dt;
  film.style.transform = `translateX(${-viewportLeft}px)`;
  syncWindow();
  rafId = requestAnimationFrame(tick);
}

// 切换尺寸 / 窗口 resize：保持左可见图不变，重排
function relayout(): void {
  const oldLeftVis = kAtX(viewportLeft);
  recomputeLayout();
  viewportLeft = logicalX(oldLeftVis);
  for (const it of items) it.el.remove();
  items.length = 0;
  syncWindow();
}

function startGallery(startIndex: number): void {
  cancelAnimationFrame(rafId);
  for (const it of items) it.el.remove();
  items.length = 0;
  recomputeLayout();
  viewportLeft = logicalX(startIndex);
  state.paused = false;
  dragging = false;
  dragMoved = false;
  updateToggleButton();
  syncWindow();
  film.style.transform = `translateX(${-viewportLeft}px)`;
  lastTime = 0;
  rafId = requestAnimationFrame(tick);
}

function togglePause(): void {
  state.paused = !state.paused;
  updateToggleButton();
}
function updateToggleButton(): void {
  if (btnToggle) btnToggle.textContent = state.paused ? "▶ 继续" : "⏸ 暂停";
}

async function openFile(): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "图片", extensions: ["webp", "jpg", "jpeg", "png"] }],
  });
  if (!selected || typeof selected !== "string") return;
  try {
    const r = await invoke<ListResult>("list_images", { path: selected });
    state.entries = r.entries;
    if (state.entries.length === 0) {
      alert("该目录没有支持的图片文件");
      return;
    }
    startGallery(r.startIndex);
  } catch (e) {
    alert("读取目录失败：" + e);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  viewport = document.getElementById("viewport")!;
  film = document.getElementById("film")!;
  btnOpen = document.getElementById("btn-open") as HTMLButtonElement;
  btnToggle = document.getElementById("btn-toggle") as HTMLButtonElement;
  inputSpeed = document.getElementById("input-speed") as HTMLInputElement;
  selectFit = document.getElementById("select-fit") as HTMLSelectElement;
  inputCache = document.getElementById("input-cache") as HTMLInputElement;

  inputSpeed.value = String(state.speed);
  inputCache.value = String(state.maxCached);
  updateToggleButton();

  btnOpen.addEventListener("click", openFile);
  btnToggle.addEventListener("click", togglePause);

  // 鼠标左键：按下记起点；移动超阈值=拖动跟随；松开未超阈值=点击 toggle 暂停
  viewport.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // 只响应左键
    e.preventDefault();
    dragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartLeft = viewportLeft;
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    if (!dragMoved && Math.abs(dx) > DRAG_THRESHOLD) dragMoved = true;
    if (dragMoved) {
      viewportLeft = dragStartLeft - dx; // 鼠标右拖 → 图右移（viewportLeft 减小）
      film.style.transform = `translateX(${-viewportLeft}px)`;
      syncWindow();
    }
  });
  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    const moved = dragMoved;
    dragMoved = false;
    if (!moved) togglePause(); // 未超阈值 = 点击
  });

  // 滚轮控速：上=加速正方向，下=减速（可过 0 变负即反向）
  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      state.speed += e.deltaY < 0 ? SPEED_STEP : -SPEED_STEP;
      inputSpeed.value = String(state.speed);
    },
    { passive: false }
  );
  inputSpeed.addEventListener("input", () => {
    state.speed = Number(inputSpeed.value) || 0;
  });
  selectFit.addEventListener("change", () => {
    state.fitMode = selectFit.value as FitMode;
    if (n() > 0) relayout();
  });
  inputCache.addEventListener("change", () => {
    state.maxCached = Math.max(2, Number(inputCache.value) || 10);
  });
  window.addEventListener("resize", () => {
    if (n() > 0) relayout();
  });
});
