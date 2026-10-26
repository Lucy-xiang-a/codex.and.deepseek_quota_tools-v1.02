const api = window.codexQuota;
const $ = (id) => document.getElementById(id);
let settings;
let snapshot;
let currentView = 'compact';
let resizeState = null;
let viewTouched = false;

const compactView = $('compact-view');
const expandedView = $('expanded-view');
const settingsView = $('settings-view');
const RING_CIRCUMFERENCE = 2 * Math.PI * 18;

async function showView(view, userInitiated = true) {
  if (userInitiated) viewTouched = true;
  currentView = view;
  compactView.classList.toggle('hidden', view !== 'compact');
  expandedView.classList.toggle('hidden', view !== 'expanded');
  settingsView.classList.toggle('hidden', view !== 'settings');
  await api.setView(view);
}

function percent(window) { return window?.remainingPercent == null ? '--' : `${window.remainingPercent}%`; }

function resetText(window) {
  if (!window?.resetsAt) return '重置时间未知';
  const seconds = Math.max(0, Math.floor(window.resetsAt - Date.now() / 1000));
  if (!seconds) return '即将重置';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}小时${minutes}分后重置` : `${Math.max(1, minutes)}分后重置`;
}

function setProgress(id, value) {
  const node = $(id);
  const pct = value == null ? null : Math.max(0, Math.min(100, Math.round(value)));
  node.style.width = `${pct ?? 0}%`;
  node.dataset.level = ringLevel(pct);
}

function ringLevel(value) {
  if (value == null) return 'empty';
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  if (pct === 0) return 'empty';
  if (pct >= 51) return 'green';
  if (pct >= 11) return 'yellow';
  return 'red';
}

function renderRing(ringId, valueId, labelId, window) {
  const ring = $(ringId);
  const valueNode = $(valueId);
  const pct = window?.remainingPercent == null ? null : Math.max(0, Math.min(100, Math.round(window.remainingPercent)));
  valueNode.textContent = pct == null ? '--' : `${pct}%`;
  ring.dataset.level = ringLevel(pct);
  ring.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
  ring.style.strokeDashoffset = `${pct == null || pct === 0 ? RING_CIRCUMFERENCE : RING_CIRCUMFERENCE * (1 - pct / 100)}`;
  $(labelId).textContent = window?.label ?? (labelId.includes('secondary') ? '1周' : '5小时');
}

function stateText(state) {
  if (settings?.quotaSource === 'deepseek') return deepSeekText(snapshot?.deepseek);
  if (state === 'connected') return snapshot?.updatedAt ? `${Math.max(0, Math.floor((Date.now() - snapshot.updatedAt) / 60000))} 分钟前更新` : '刚刚更新';
  if (state === 'refreshing') return '正在刷新';
  if (state === 'unauthenticated') return '请先登录 Codex';
  if (state === 'cli_missing') return '未找到 Codex CLI，请确认已安装并登录';
  return snapshot?.error || (snapshot?.updatedAt ? `连接异常 · ${new Date(snapshot.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '等待连接');
}

function deepSeekText(balance) {
  if (!balance) return '未配置 DeepSeek API Key';
  if (balance.state === 'missing_key') return '请在偏好设置中填写 API Key';
  if (balance.state === 'unavailable') return balance.error || '余额不可用';
  if (balance.state === 'error') return balance.error || '连接异常，保留最近数据';
  return balance.updatedAt ? `${Math.max(0, Math.floor((Date.now() - balance.updatedAt) / 60000))} 分钟前更新` : '刚刚更新';
}

function deepSeekAmount(balance) {
  if (!balance || balance.totalBalance == null) return '¥ --';
  return `¥ ${balance.totalBalance.toFixed(2)}`;
}

function effectiveState(next) {
  const source = settings?.quotaSource ?? 'codex';
  if (source === 'deepseek') {
    return next?.deepseek?.state === 'connected' ? 'connected' : 'error';
  }
  if (source === 'both' && next?.state !== 'connected' && next?.deepseek?.state === 'connected') return 'connected';
  return next?.state;
}

function applyTheme(theme) {
  document.body.classList.toggle('theme-light', theme === 'light');
  document.body.classList.toggle('theme-dark', theme === 'dark');
}

function applyQuotaSource() {
  const source = settings?.quotaSource ?? 'codex';
  const showCodex = source === 'codex' || source === 'both';
  const showDeepSeek = source === 'deepseek' || source === 'both';
  $('compact-codex').classList.toggle('hidden', !showCodex);
  $('compact-deepseek').classList.toggle('hidden', !showDeepSeek);
  $('expanded-codex-content').classList.toggle('hidden', !showCodex);
  $('expanded-deepseek-card').classList.toggle('hidden', !showDeepSeek);
}

function render(next) {
  snapshot = next;
  const primary = next?.primary;
  const secondary = next?.secondary;
  const deepseek = next?.deepseek;
  renderRing('compact-primary-ring', 'compact-primary-value', 'compact-primary-label', primary);
  renderRing('compact-secondary-ring', 'compact-secondary-value', 'compact-secondary-label', secondary);
  $('primary-label').textContent = primary?.label ?? '5小时';
  $('secondary-label').textContent = secondary?.label ?? '1周';
  $('primary-percent').textContent = percent(primary);
  $('secondary-percent').textContent = percent(secondary);
  setProgress('primary-progress', primary?.remainingPercent);
  setProgress('secondary-progress', secondary?.remainingPercent);
  $('primary-reset').textContent = resetText(primary);
  $('secondary-reset').textContent = resetText(secondary);
  $('reset-count').textContent = next?.availableResets == null ? '暂无可用重置' : `${next.availableResets} 次可用重置`;
  $('updated-line').textContent = stateText(effectiveState(next));
  $('compact-status').dataset.state = effectiveState(next) || 'error';
  $('footer-status').dataset.state = effectiveState(next) || 'error';
  $('account-line').textContent = `${next?.planType ? next.planType[0].toUpperCase() + next.planType.slice(1) : 'Codex'} · 剩余用量`;
  $('settings-account').textContent = next?.accountEmail ?? '未连接 Codex';
  $('compact-deepseek-balance').textContent = deepSeekAmount(deepseek);
  $('deepseek-balance').textContent = deepSeekAmount(deepseek);
  $('deepseek-status').textContent = deepSeekText(deepseek);
  applyQuotaSource();
}

function renderSettings(next) {
  settings = next;
  $('startup-toggle').checked = next.launchAtStartup;
  $('compact-toggle').checked = next.compact;
  $('interval-select').value = String(next.refreshIntervalSec);
  $('theme-select').value = next.theme;
  $('quota-source-select').value = next.quotaSource || 'codex';
  $('deepseek-key-status').textContent = next.deepseekApiKeySet ? '已保存到本机' : '未设置';
  $('pin-toggle').checked = next.pinMode === 'always';
  applyTheme(next.theme);
  applyQuotaSource();
}

async function save(patch) {
  const next = await api.updateSettings(patch);
  renderSettings(next);
  return next;
}

async function returnToCompact() {
  if (settings?.compact === false) await save({ compact: true });
  await showView('compact');
}

function beginResize(event) {
  if (currentView !== 'compact') return;
  event.preventDefault();
  resizeState = { startX: event.screenX, startWidth: window.outerWidth || 360, lastWidth: window.outerWidth || 360 };
  window.addEventListener('mousemove', resizeMove);
  window.addEventListener('mouseup', endResize, { once: true });
}

function resizeMove(event) {
  if (!resizeState) return;
  const requestedWidth = resizeState.startWidth + (event.screenX - resizeState.startX);
  resizeState.lastWidth = requestedWidth;
  void api.resizeCompact(requestedWidth, false);
}

function endResize() {
  if (!resizeState) return;
  const width = resizeState.lastWidth || window.outerWidth || resizeState.startWidth;
  resizeState = null;
  window.removeEventListener('mousemove', resizeMove);
  void api.resizeCompact(width, true);
}

$('expand-button').onclick = () => { void showView('expanded'); };
$('expanded-compact-button').onclick = () => { void returnToCompact(); };
$('minimize-button').onclick = () => api.minimize();
$('close-button').onclick = () => api.hide();
$('settings-close-button').onclick = () => api.hide();
$('settings-minimize-button').onclick = () => api.minimize();
$('settings-compact-button').onclick = () => { void returnToCompact(); };
$('expanded-settings-button').onclick = () => { void showView('settings'); };
$('back-button').onclick = () => { void returnToCompact(); };
$('refresh-button').onclick = () => api.refresh();
$('quit-button').onclick = () => api.quit();
$('startup-toggle').onchange = (event) => save({ launchAtStartup: event.target.checked });
$('compact-toggle').onchange = async (event) => {
  const next = await save({ compact: event.target.checked });
  await showView(next.compact ? 'compact' : 'expanded');
};
$('pin-toggle').onchange = (event) => save({ pinMode: event.target.checked ? 'always' : 'off' });
$('interval-select').onchange = (event) => save({ refreshIntervalSec: Number(event.target.value) });
$('theme-select').onchange = (event) => save({ theme: event.target.value });
$('quota-source-select').onchange = (event) => save({ quotaSource: event.target.value });
$('deepseek-save-button').onclick = async () => {
  const key = $('deepseek-key-input').value.trim();
  if (!key) return;
  const saved = await api.setDeepSeekApiKey(key);
  $('deepseek-key-input').value = '';
  $('deepseek-key-status').textContent = saved ? '已保存到本机' : '未设置';
};
$('deepseek-clear-button').onclick = async () => {
  await api.clearDeepSeekApiKey();
  $('deepseek-key-input').value = '';
  $('deepseek-key-status').textContent = '未设置';
};
$('compact-resize-handle').addEventListener('mousedown', beginResize);

api.onSnapshot(render);
api.onSettings(renderSettings);
api.onViewRequest(showView);
Promise.all([api.getSnapshot(), api.getSettings(), api.getDeepSeekKeyStatus()]).then(async ([initial, initialSettings]) => {
  render(initial);
  renderSettings(initialSettings);
  if (!viewTouched) await showView(initialSettings.compact ? 'compact' : 'expanded', false);
});
setInterval(() => { if (snapshot) render(snapshot); }, 30_000);
