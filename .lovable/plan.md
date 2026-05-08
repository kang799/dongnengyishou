现在计数稳定了，剩下"摄像头卡退"的问题。我观察到几个具体原因：

## 卡退的真实原因

1. **每次 Vite 热更新都会重启 MediaPipe**：日志里反复出现 `Graph successfully started running`，说明模型在反复重建，每次重建会瞬时占用大量内存/GPU，移动端浏览器最容易在这一刻崩。
2. **WebGL/WASM 在 iOS Safari、低端安卓上不稳**：`gl_context.cc` 一直在初始化新的 GL context，长时间运行会被系统回收。
3. **detectForVideo 在某些帧抛错后没有真正捕获**：`busy` 锁释放了，但 MediaPipe 内部的 wasm 异常会让后续帧全部静默失败，看起来像"摄像头黑了"。
4. **Tab 切到后台后回来**：video element 被浏览器暂停，`readyState` 不再变化，rAF 还在跑但没新帧。
5. **手机熄屏/转屏**：摄像头 track 被系统 ended，但代码没监听 `track.onended`，UI 不会提示。

## 本次要做的修复

### 1. 把模型生命周期与会话解耦
- 进入训练页不再重建模型，hook 卸载时也不销毁 landmarker，只停摄像头和 rAF。
- 已经在用模块级缓存，但要补一个"模型损坏自动重建"：当 `detectForVideo` 连续 5 帧抛错，丢弃旧 landmarker、清空 promise 缓存、重新创建一次。

### 2. 摄像头 track 健康监控
- `getUserMedia` 拿到 stream 后，给每个 track 挂 `onended` 和 `onmute`。
- 一旦触发：UI 显示"摄像头已断开，点击恢复"，并提供一键恢复按钮（重新 `getUserMedia` + 重新 attach 到 video）。

### 3. 页面可见性 / 焦点恢复
- 监听 `document.visibilitychange`：切到后台时主动 `pause()` 视频、停 rAF；切回前台时若 stream 还活着就 `play()` 并恢复 rAF；若 stream 已死走 (2) 的恢复流程。
- 这样不会出现"切回来画面卡住但计数不动"的情况。

### 4. 检测循环硬化
- 给 `detectForVideo` 包一层"超时保护"：单帧超过 1.5 秒还没返回视为卡死，重建 landmarker。
- 错误计数器：连续错误 ≥3 帧时降级——把识别频率从 10 FPS 降到 5 FPS，并显示"识别已降速以保持稳定"。
- 不再每帧画 38 个点；改为只画肩 + 鼻 + 髋这几个用到的点，减少 canvas 开销。

### 5. 启动流程更轻
- `startCamera` 失败时给出明确原因（权限、设备占用、HTTPS 缺失）并停在错误界面，不再进入"加载中"死循环。
- 摄像头分辨率再降一档兜底：`ideal 480x360, max 640x480`，并允许 `frameRate { ideal: 15, max: 20 }`，移动端发热明显减少。

### 6. UI 反馈
- 顶部多一个状态徽章：摄像头 = ●在线 / ●已暂停 / ●已断开。
- "重新校准"按钮旁边加"重启摄像头"按钮，遇到卡死用户能自救，不必整页刷新。

## 不动的部分
- 计数逻辑、校准流程保持不变。
- 数据库、训练记录、UI 主体布局不变。

## 涉及文件
- `src/hooks/use-pose-counter.ts`：生命周期、错误恢复、可见性监听、track 监控、单帧超时。
- `src/routes/train.tsx`：摄像头状态徽章、重启摄像头按钮、错误界面文案。

实施大概会改 80–120 行，不引入新依赖。