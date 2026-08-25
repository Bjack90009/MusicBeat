# 新活动：音乐节拍

面向网页和手机玩家的独立发布版。页面只保留标题、计分表、操作区域、开始/再来一次按钮和排行榜；所有玩法数值继续在本地调试器中维护。

## 发布地址

- GitHub 仓库：https://github.com/Bjack90009/MusicBeat
- GitHub Pages（启用后）：https://bjack90009.github.io/MusicBeat/
- 排行榜 API：https://music-beat-api.music-beat.workers.dev

## 当前固化数值

- 对局基础时长 5 秒，最多自动生成 5 拍
- 出现间隔 600–800ms，逻辑操作区 500×500
- 节拍外圈 180–240，目标圈 60，单拍存在 800ms
- 判定：PERFECT 20%/2×、GREAT 40%/1.5×、GOOD 80%/1.2×、EARLY 100%/1×
- 品质：绿 50%/100 分、蓝 30%/150 分、紫 15%/250 分、金 5%/500 分
- 新节拍按最大外圈占位，保证不与场上节拍重叠；新节拍显示在旧节拍下方
- 连续 5 次 PERFECT 进入一次 BONUS：额外 5 拍按 200ms 间隔依次生成，不计入自动生成上限
- BONUS 奖励会把本局结束时间延长到最后一拍完整结束；每局最多触发一次

发布参数集中在 `site/game-config.js`。不要把本地调试器的设置面板复制进 `site/`。

## 目录

- `site/`：GitHub Pages 静态试玩页
- `worker/`：Cloudflare Worker API 与 D1 数据库迁移
- `design/`：本次发布页和上榜弹窗的视觉概念图
- `.github/workflows/pages.yml`：GitHub Pages 自动部署

## 本地联调

需要 Node.js 20+ 和 Python 3。

```powershell
npm install
npm run db:local
npm run dev:api
```

另开终端：

```powershell
python -m http.server 4202 --directory site
```

打开 `http://127.0.0.1:4202/`。本地页面会自动连接 `http://127.0.0.1:8787`。

## 首次线上发布

1. 登录 GitHub 与 Cloudflare：

   ```powershell
   gh auth login -h github.com
   npx wrangler login
   ```

2. 创建 D1：

   ```powershell
   npx wrangler d1 create music-beat-db
   ```

   把命令返回的真实 `database_id` 写入 `worker/wrangler.jsonc`。

3. 写入线上表结构并发布 API：

   ```powershell
   npm run db:remote
   npm run deploy:api
   ```

4. 把 Worker 返回的 `https://...workers.dev` 地址写入 `site/runtime-config.js` 的 `apiBaseUrl`。

5. 创建公开 GitHub 仓库并推送：

   ```powershell
   git init -b main
   git add .
   git commit -m "Publish music beat game"
   gh repo create music-beat-game --public --source . --remote origin --push
   ```

6. 在 GitHub 仓库 Settings → Pages → Build and deployment 中选择 `GitHub Actions`。工作流完成后即可转发 Pages 链接。

## 排行榜规则

- 榜单按分数降序、最高连击降序、完成时间升序排列。
- 一个名称可以多次上榜；页面始终只展示前 10 条记录。
- 对局完成后先计算临时名次；玩家确认名称时会再次计算，避免多人同时提交造成错误名次。
- 玩家选择“不上榜”只会隐藏名称和榜单资格，对局分析记录仍保留。

## 数据记录与分析

`sessions` 会在每次开始时写入，因此中途关闭页面的对局也会留下 `started` 记录；正常结束后写入 `runs` 并把会话标为 `completed`。记录内容包括：

- 配置版本、开始/完成时间、完成状态
- 得分、命中、MISS、最高连击、四档判定数量
- 各品质生成/命中数量、逐次点击的剩余时间比例、鼠标/触屏/笔输入数量
- 粗粒度设备类别、视口大小、语言和时区

默认不采集玩家 IP、完整 User-Agent、邮箱或设备标识。名称只在玩家主动确认上榜时记录。

常用分析导出示例：

```powershell
npx wrangler d1 execute music-beat-db --remote --command "SELECT * FROM sessions ORDER BY started_at DESC LIMIT 100"
npx wrangler d1 execute music-beat-db --remote --command "SELECT * FROM runs ORDER BY completed_at DESC LIMIT 100"
```

## 竞争公平性边界

Worker 会校验时长、数量关系和理论最高分，但纯网页客户端仍可能被修改请求。当前适合试玩和数值分析；如果以后用于发奖，应增加服务端节拍签名、挑战令牌和异常成绩审核。
