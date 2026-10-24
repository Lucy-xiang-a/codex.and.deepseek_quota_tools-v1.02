const api = window.codexQuota;
const $ = (id) => document.getElementById(id);
let settings;
let snapshot;
let currentView = 'compact';

const compactView = $('compact-view');
const expandedView = $('expanded-view');
const settingsView = $('settings-view');

async function showView(view) {
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
function setProgress(id, value) { $(id).style.width = `${value == null ? 0 : value}%`; }
function stateText(state) {
  if (state === 'connected') return snapshot?.updatedAt ? `${Math.max(0, Math.floor((Date.now() - snapshot.updatedAt) / 60000))} 分钟前更新` : '刚刚更新';
  if (state === 'refreshing') return '正在刷新';
  if (state === 'unauthenticated') return '请先登录 Codex';
  if (state === 'cli_missing') return '未找到 Codex CLI，请确认已安装并登录';
  return snapshot?.updatedAt ? `连接异常 · ${new Date(snapshot.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '等待连接';
}
function applyTheme(theme) {
  document.body.classList.toggle('theme-light', theme === 'light');
  document.body.classList.toggle('theme-dark', theme === 'dark');
}
function render(next) {
  snapshot = next;
  const primary = next.primary;
  const secondary = next.secondary;
  $('compact-primary').innerHTML = `${primary?.label ?? '5小时'} <strong>${percent(primary)}</strong>`;
  $('compact-secondary').innerHTML = `${secondary?.label ?? '1周'} <strong>${percent(secondary)}</strong>`;
  $('primary-label').textContent = primary?.label ?? '5小时';
  $('secondary-label').textContent = secondary?.label ?? '1周';
  $('primary-percent').textContent = percent(primary);
  $('secondary-percent').textContent = percent(secondary);
  setProgress('primary-progress', primary?.remainingPercent);
  setProgress('secondary-progress', secondary?.remainingPercent);
  $('primary-reset').textContent = resetText(primary);
  $('secondary-reset').textContent = resetText(secondary);
  $('reset-count').textContent = next.availableResets == null ? '暂无可用重置' : `${next.availableResets} 次可用重置`;
  $('updated-line').textContent = stateText(next.state);
  $('compact-status').dataset.state = next.state;
  $('footer-status').dataset.state = next.state;
  $('account-line').textContent = `${next.planType ? next.planType[0].toUpperCase() + next.planType.slice(1) : 'Codex'} · 剩余用量`;
  $('settings-account').textContent = next.accountEmail ?? '未连接 Codex';
}
function renderSettings(next) {
  settings = next;
  $('startup-toggle').checked = next.launchAtStartup;
  $('compact-toggle').checked = next.compact;
  $('interval-select').value = String(next.refreshIntervalSec);
  $('theme-select').value = next.theme;
  const pinned = next.pinMode === 'always';
  for (const id of ['pin-button', 'settings-pin-button']) {
    const button = $(id);
    button.classList.toggle('active', pinned);
    button.setAttribute('aria-pressed', String(pinned));
    button.title = pinned ? '取消固定窗口' : '固定窗口';
  }
  applyTheme(next.theme);
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

$('expand-button').onclick = () => { void showView('expanded'); };
$('expanded-compact-button').onclick = () => { void returnToCompact(); };
$('minimize-button').onclick = () => api.minimize();
$('close-button').onclick = () => api.hide();
$('settings-close-button').onclick = () => api.hide();
$('settings-minimize-button').onclick = () => api.minimize();
$('settings-compact-button').onclick = () => { void returnToCompact(); };
$('settings-button').onclick = () => { void showView('settings'); };
$('back-button').onclick = () => { void returnToCompact(); };
$('refresh-button').onclick = () => api.refresh();
$('quit-button').onclick = () => api.quit();
$('pin-button').onclick = async () => { const next = settings.pinMode === 'always' ? 'off' : 'always'; await save({ pinMode: next }); };
$('settings-pin-button').onclick = async () => { const next = settings.pinMode === 'always' ? 'off' : 'always'; await save({ pinMode: next }); };
$('startup-toggle').onchange = (e) => save({ launchAtStartup: e.target.checked });
$('compact-toggle').onchange = async (e) => {
  const next = await save({ compact: e.target.checked });
  await showView(next.compact ? 'compact' : 'expanded');
};
$('interval-select').onchange = (e) => save({ refreshIntervalSec: Number(e.target.value) });
$('theme-select').onchange = (e) => save({ theme: e.target.value });

api.onSnapshot(render);
api.onSettings(renderSettings);
api.onViewRequest(showView);
Promise.all([api.getSnapshot(), api.getSettings()]).then(async ([initial, initialSettings]) => { render(initial); renderSettings(initialSettings); await showView(initialSettings.compact ? 'compact' : 'expanded'); });
setInterval(() => { if (snapshot) render(snapshot); }, 30_000);
