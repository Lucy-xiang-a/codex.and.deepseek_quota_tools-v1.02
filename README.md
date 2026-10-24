# Codex 额度悬浮组件

一个适用于 Windows 的 Codex 额度悬浮组件：迷你模式常驻桌面，展开后显示短周期/长周期额度、重置倒计时和状态。

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
- 关闭按钮会隐藏到托盘；从托盘可重新显示、刷新、打开设置或退出。
- 标题栏可以像普通窗口一样拖动，拖动不会改变窗口尺寸。
- 详情页右上角支持最小化到任务栏、固定窗口和关闭到托盘。
- 如果 Codex CLI 未安装、未登录或额度服务暂时不可用，组件保留最近一次成功数据并显示连接状态。
