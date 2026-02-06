// src/features/proposal-grid/utils.js
// Small pure helpers (CommonJS)

const decoderElement = typeof document !== 'undefined' ? document.createElement('textarea') : null;
const htmlEscapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
const htmlEscapeRegex = /[&<>"']/g;

function escapeHtml(str) {
  return String(str ?? '').replace(htmlEscapeRegex, (char) => htmlEscapeMap[char]);
}

function decodeEntities(str) {
  if (!decoderElement) return str;
  decoderElement.innerHTML = String(str);
  return decoderElement.value;
}

function norm(s) {
  return String(s || '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
}

const normKeyCache = new Map();
function normKey(s) {
  const key = String(s);
  if (normKeyCache.has(key)) return normKeyCache.get(key);
  const result = norm(s).toLowerCase();
  normKeyCache.set(key, result);
  return result;
}

function isBlankish(v) {
  const t = norm(v);
  return !t || t === '-' || t === '—' || t === '–';
}

function formatMoney(n) {
  const num = Number(n || 0);
  return '$' + Knack.formatNumberWithCommas(num.toFixed(2));
}

function formatMoneyAbs(n) {
  const num = Math.abs(Number(n || 0));
  return '$' + Knack.formatNumberWithCommas(num.toFixed(2));
}

function log(ctx, ...args) {
  // Prefer explicit ctx.debug; fallback to global flag
  if (!(ctx && ctx.debug) && !globalThis?.SCW_DEBUG) return;
  // eslint-disable-next-line no-console
  console.log(`[SCW totals][${ctx?.viewId || 'unknown'}]`, ...args);
}

function clearNormKeyCache() {
  normKeyCache.clear();
}

module.exports = {
  escapeHtml,
  decodeEntities,
  norm,
  normKey,
  isBlankish,
  formatMoney,
  formatMoneyAbs,
  log,
  clearNormKeyCache,
};