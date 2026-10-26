# Codex 额度与 Deepseek余额查看的悬浮组件

一个适用于 Windows 的 Codex 额度悬浮组件：迷你模式常驻桌面，展开后显示短周期/长周期额度、重置倒计时和状态。迷你条使用双圆形进度环，可拖动右下角按比例缩放；额度来源可切换为 Codex、DeepSeek 或两者并排。

## 开发

需要 Node.js 与 pnpm。安装依赖并启动：

```powershell
pnpm install
pnpm dev
```

组件会启动本机的 `codex app-server --stdio`，复用 Codex CLI 已有的登录状态，不会把 OAuth token 写入组件配置。

## 构建便携版

```powershell
pnpm package:win
```

产物位于 `release-final/`：`win-unpacked/Codex 额度.exe` 可以直接运行，同时会生成 `Codex-额度-1.0.0-win-x64.zip` 便携压缩包。

## 使用说明

- 点击迷你条可展开额度详情。
- 迷你条始终置顶，右下角缩放热区支持等比调整并在重启后恢复。
- 关闭按钮会隐藏到托盘；从托盘可重新显示、刷新、打开设置或退出。
- 标题栏可以像普通窗口一样拖动，拖动不会改变窗口尺寸。
- 详情页右上角支持最小化到任务栏、固定窗口和关闭到托盘。
- 如果 Codex CLI 未安装、未登录或额度服务暂时不可用，组件保留最近一次成功数据并显示连接状态。
- 在偏好设置中可选择仅 Codex、仅 DeepSeek 或两者并排。DeepSeek Key 只写入本机 `state.json`，不会进入源码、日志或网络错误上报。
