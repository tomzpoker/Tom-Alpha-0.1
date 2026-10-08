import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

const STORAGE_KEY = 'app_zoom_pct';
const MIN_PCT = 70;
const MAX_PCT = 180;
const STEP = 10;
const DEFAULT_PCT = 100;
const BASE_WIDTH = 420;
const BASE_HEIGHT = 680;

export function getZoomPct(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = raw ? parseInt(raw, 10) : DEFAULT_PCT;
    if (!Number.isFinite(n)) return DEFAULT_PCT;
    return Math.max(MIN_PCT, Math.min(MAX_PCT, n));
  } catch {
    return DEFAULT_PCT;
  }
}

// Debounce : évite de spammer setSize à chaque cran de molette
let resizeTimer: number | undefined;
function scheduleResize(pct: number) {
  if (resizeTimer) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    resizeWindowForZoom(pct);
  }, 150);
}

async function resizeWindowForZoom(pct: number) {
  try {
    const scale = pct / 100;
    let targetW = Math.round(BASE_WIDTH * scale);
    let targetH = Math.round(BASE_HEIGHT * scale);

    // Clamp à la taille d'écran (marge 40px pour éviter le débordement)
    const availW = (window.screen.availWidth || 1920) - 40;
    const availH = (window.screen.availHeight || 1080) - 40;
    if (targetW > availW) targetW = availW;
    if (targetH > availH) targetH = availH;

    const win = getCurrentWindow();
    await win.setSize(new LogicalSize(targetW, targetH));
  } catch (e) {
    console.warn('resize failed:', e);
  }
}

export async function applyZoomPct(pct: number): Promise<number> {
  const clamped = Math.max(MIN_PCT, Math.min(MAX_PCT, pct));
  try {
    localStorage.setItem(STORAGE_KEY, String(clamped));
  } catch {
    /* localStorage indisponible */
  }
  try {
    await getCurrentWebview().setZoom(clamped / 100);
  } catch (e) {
    console.warn('setZoom failed:', e);
  }

  // Auto-resize de la fenêtre
  scheduleResize(clamped);

  // Notifie tous les composants abonnés
  try {
    window.dispatchEvent(
      new CustomEvent('zoom-changed', { detail: clamped })
    );
  } catch {
    /* ignore */
  }

  return clamped;
}

export async function zoomIn(): Promise<number> {
  return applyZoomPct(getZoomPct() + STEP);
}

export async function zoomOut(): Promise<number> {
  return applyZoomPct(getZoomPct() - STEP);
}

export const ZOOM_LIMITS = { MIN_PCT, MAX_PCT, STEP, DEFAULT_PCT };