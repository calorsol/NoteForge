# NoteForge 伪装主题 · CSDN 皮肤 + 全局配置表 实施手册

> 本手册面向执行本任务的 AI/开发者，**自包含**：不依赖任何对话上下文即可实施。
> 全程用中文沟通与注释（见仓库 `AGENTS.md`）。

---

## 0. 给执行者的前置说明

- 工作目录即本仓库根（`package.json` 里 name 为 `noteforge`）。
- **只做本手册范围内的改动**，不要顺手重构无关代码。
- **绝对不要触碰用户真实资料数据**：`materials` 表、资料的真实 `title/content` 一律不动。本任务新增的是「伪装/掩人耳目」的**覆盖层**，与真实数据解耦。
- 改完要**本地验证**（见第 8 节），但**不要部署、不要 push 到远端**——交回给用户决定。
- 数据库迁移必须**幂等且无损**（`CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE`），不得覆盖用户已改过的配置值。

---

## 1. 背景与目标

NoteForge 是一个「每日资料收集 + 写作」应用。有一个「**伪装（阅读）模式**」：一键把界面伪装成枯燥的工作文档，降低上班看资料被同事发现的概率。

**目前已实现「内部文档 / Wiki」一种伪装皮肤**（详见第 3 节现状）。

**本次任务**：在此基础上做三件事：

1. **新增第二种伪装皮肤「CSDN 风」**——伪装成一篇 CSDN 技术博客（保留大标题、彩色，走「看技术博客本身就很正常」的合理化伪装，与 Wiki 的「压小字藏标题」是不同哲学）。
2. **新增一张通用全局配置表 `sys_config`**（KV 结构），把伪装用到的「掩人耳目文字」存到后端，跨设备同步。
3. **让伪装文字可由用户就地编辑**：Wiki 的顶栏品牌名、CSDN 的大标题/博客名，都能点击改成用户自定义的假文字；这些假文字**与资料真实标题无关**。

---

## 2. 技术栈与关键文件地图

- **前端**：React 18 + React Router 6 + Vite，TypeScript。目录 `src/client/src/`。
- **后端**：Express 4 + better-sqlite3，TypeScript（`tsx` 运行）。目录 `src/server/`。
- **构建/脚本**（`package.json`）：
  - `npm run dev`：并发起后端(4000)+前端(5173，`/api` 代理到 4000)。
  - `npm test`：`tsx --test src/server/__tests__/*.test.ts`。
  - `npm run build:client`：`vite build`（同时做类型检查）。

关键文件：

| 文件 | 作用 |
|---|---|
| `src/server/db.ts` | SQLite 初始化，所有建表在 `initialize()` 内，用 `CREATE TABLE IF NOT EXISTS` |
| `src/server/app.ts` | Express 应用装配，`app.use("/api/xxx", createXxxRouter(database))` |
| `src/server/middleware/requireAuth.ts` | 鉴权中间件（JWT） |
| `src/server/routes/*.routes.ts` | 各资源路由（参考 `materials.routes.ts` 的写法） |
| `src/server/__tests__/*.test.ts` | 后端测试（node:test 风格，`tsx --test`） |
| `src/client/src/api.ts` | 前端 `api<T>()` 封装，token 存 localStorage 键 `noteforge_token` |
| `src/client/src/auth/AuthContext.tsx` | 鉴权 Context，可作为新 Context 的写法参考 |
| `src/client/src/appearance.ts` | 外观偏好 + **现有伪装开关** `loadStealth/saveStealth` |
| `src/client/src/components/Layout.tsx` | 顶栏 + 路由出口，**现有伪装状态与老板键在此** |
| `src/client/src/pages/MaterialsPage.tsx` | 资料页；阅读态组件 `MaterialReadViewV2`，大标题 `.mat-read-title` |
| `src/client/src/markdown.ts` | 极简 Markdown 渲染器 |
| `src/client/src/styles/index.css` | 全局样式，**现有 Wiki 皮肤 CSS 在文件末尾** |

**Markdown 渲染器要点**（影响 CSDN 代码块/目录实现）：`renderMarkdown()` 输出的是**裸 `<pre><code>…</code></pre>`（无语言 class）**、**`<h1..6>` 无 id**。因此「代码块语言条」只能用 CSS 伪造，「文章目录跳转」若要真跳转需另行给标题注入 id（本手册列为可选二期）。

---

## 3. 现状：Wiki 伪装模式如何工作（必须理解，复用而非推翻）

现有实现由一个**布尔开关**驱动：

- `src/client/src/appearance.ts`：
  - `loadStealth(): boolean` / `saveStealth(on)`，localStorage 键 **`nf_stealth`**，值 `"on"`/`"off"`。
- `src/client/src/components/Layout.tsx`：
  - `stealth` 布尔 state；`useEffect` 里设 `document.documentElement.dataset.stealth = stealth ? "on" : "off"`，并把 `document.title` 在 `"NoteForge"` ↔ `"内部文档中心"` 间切换；`saveStealth`。
  - 老板键：监听 `keydown`，`Ctrl + \`` (`event.ctrlKey && event.code === "Backquote"`) 切换。
  - 顶栏：伪装时品牌名显示「内部文档中心」（**当前写死**）、隐藏「写作中心」入口/用户名/登出，仅保留一个 `.stealth-toggle` 按钮。
- `src/client/src/styles/index.css` 末尾：`:root[data-stealth="on"] { … }` 一大块，覆盖 CSS 变量（改成灰白蓝调）、隐藏大标题 `.mat-read-title`、压小正文字号、抹掉橙色高亮等。

**本任务会把这个「布尔开关」升级为「皮肤枚举」**（见第 5 节），Wiki 皮肤的视觉规则基本保留，只是：①选择器从 `[data-stealth="on"]` 改为 `[data-stealth-skin="wiki"]`；②写死的「内部文档中心」改为读取用户配置。

---

## 4. 已锁定的决策（不要再就这些提问，直接照做）

1. **CSDN 大标题：全局共用一个**。所有资料在 CSDN 皮肤下显示同一个用户自定义假标题，不做每份资料各异。
2. **存储：后端通用配置表 `sys_config`（全局，无 `user_id`）**。单人自用，全局即等价于个人配置。表结构照第 6.1 节。
3. **「当前用哪种皮肤」仍存 localStorage**（此刻此设备的 UI 状态）；**只有「伪装文字」走后端**同步。
4. **CSDN 皮肤保留大标题 + 彩色**（可读的技术博客观感），**不**沿用 Wiki 的「隐藏大标题/压小字」。
5. **切换 UX**：顶栏一个下拉「关闭 / 内部文档 / CSDN」；`Ctrl + \`` 仍是「正常 ↔ 上次使用的皮肤」一键切换。
6. **CSDN 作者统计条里的阅读/点赞/收藏数：写死一组稳定假数**（如 阅读 1,234 / 点赞 56 / 收藏 23），不要每次刷新随机，免得跳动反而显眼。
7. **就地编辑**：伪装文字点击变输入框，失焦或回车保存，**防抖**后 `PUT` 到后端，乐观更新。

---

## 5. 前端架构变更：布尔开关 → 皮肤枚举

新增皮肤类型：

```ts
export type StealthSkin = "off" | "wiki" | "csdn";
```

- **`appearance.ts`**：新增 `loadSkin(): StealthSkin` / `saveSkin(skin)`，复用 localStorage 键 `nf_stealth`。**向后兼容**：读到旧值 `"on"` 视为 `"wiki"`，`"off"`/空视为 `"off"`。可保留旧的 `loadStealth/saveStealth` 或删除（若删，确认无其它引用）。
- **DOM 标记**：`document.documentElement.dataset.stealthSkin`：
  - `off` → **移除**该 data 属性（`delete dataset.stealthSkin`）。
  - `wiki` / `csdn` → 设为对应值。
  - （原来的 `data-stealth` 不再使用。）
- **`document.title`**：
  - `off` → `"NoteForge"`
  - `wiki` → `config["disguise.wiki_brand"]`
  - `csdn` → `config["disguise.csdn_title"]` 后缀 `"_CSDN博客"`（如「技术笔记_CSDN博客」）
- 需要一个能被顶栏与资料页共享的状态源——**新增 `DisguiseContext`**（见 5.1）。

### 5.1 新增 `DisguiseContext`（仿 `AuthContext` 写法）

文件：`src/client/src/disguise/DisguiseContext.tsx`（新建目录）。职责：

- state：`skin`（来自 `loadSkin()`）、`config`（`Record<string,string>`，来自后端）。
- 用户已登录时，`useEffect` 拉一次 `GET /api/config` 填充 `config`；失败静默（用默认值兜底，见下）。
- 默认兜底常量（后端不可达时也能显示）：
  ```ts
  const DEFAULT_CONFIG = {
    "disguise.wiki_brand": "内部文档中心",
    "disguise.csdn_title": "技术笔记",
    "disguise.csdn_brand": "技术博客_CSDN",
  };
  ```
- 暴露：`{ skin, setSkin, config, getConfig(key), updateConfig(key, value) }`。
  - `setSkin`：更新 state + `saveSkin` + 同步 `dataset.stealthSkin` + `document.title`（也可把这套副作用放 Provider 的 `useEffect` 里，随 `skin`/`config` 变化）。
  - `updateConfig(key, value)`：**乐观更新** local `config`，再**防抖**（~400ms）`PUT /api/config/:key`。
- 在 `App.tsx` 里，用 `DisguiseProvider` 包住「已登录区域」（`RequireAuth`/`Layout` 外层均可）。登录页无需伪装。

---

## 6. 后端实施

### 6.1 新表 `sys_config`（在 `db.ts` 的 `initialize()` 内追加）

结构（对齐用户提供的 `sys_config` 截图；SQLite 不强制 TEXT 长度，故不写长度）：

```sql
CREATE TABLE IF NOT EXISTS sys_config (
  id            TEXT PRIMARY KEY,
  config_key    TEXT NOT NULL UNIQUE,
  config_value  TEXT NOT NULL DEFAULT '',
  config_name   TEXT NOT NULL DEFAULT '',
  config_desc   TEXT NOT NULL DEFAULT ''
);
```

**幂等种子数据**（同样在 `initialize()` 内，建表后执行；用 `INSERT OR IGNORE` 按 `config_key` 去重，`id` 用 `crypto.randomUUID()`）：

| config_key | config_value | config_name | config_desc |
|---|---|---|---|
| `disguise.wiki_brand` | `内部文档中心` | `Wiki 品牌名` | `Wiki 皮肤顶栏与浏览器标签页显示的伪装名称` |
| `disguise.csdn_title` | `技术笔记` | `CSDN 大标题` | `CSDN 皮肤下全局显示的伪装文章标题` |
| `disguise.csdn_brand` | `技术博客_CSDN` | `CSDN 品牌名` | `CSDN 皮肤顶栏显示的伪装博客名` |

> 实现提示：种子可写成一个数组循环 `INSERT OR IGNORE INTO sys_config (id, config_key, config_value, config_name, config_desc) VALUES (?, ?, ?, ?, ?)`。因 `config_key` 有 UNIQUE，重复启动不会插入第二次，也不会覆盖用户已改的值。

### 6.2 新路由 `src/server/routes/config.routes.ts`

参考 `materials.routes.ts` 的结构（`createXxxRouter(database)` 返回 `express.Router()`，挂 `requireAuth`）。接口契约：

**`GET /api/config`** —— 需鉴权
- 返回全部配置为映射：
  ```json
  { "config": { "disguise.wiki_brand": "内部文档中心", "disguise.csdn_title": "技术笔记", "disguise.csdn_brand": "技术博客_CSDN" } }
  ```

**`PUT /api/config/:key`** —— 需鉴权
- 请求体：`{ "value": "用户自定义文字" }`
- 用 `zod` 校验：`value` 为 string，`trim` 后长度 `1..64`（禁止空串，防止把标题清空）。
- **仅允许更新已存在于 `sys_config` 的 key**（即种子里的 key）；未知 key 返回 `404`（防止任意键注入）。
- 更新 `config_value`，返回 `{ "key": "...", "value": "..." }`。

**装配**：在 `app.ts` 增加 `app.use("/api/config", createConfigRouter(database))`。

### 6.3 后端测试 `src/server/__tests__/config.routes.test.ts`

沿用现有测试风格（`node:test` + `tsx --test`，为每个用例建内存/临时库并注册用户拿 token；可参考现有 `*.test.ts`）。至少覆盖：

- 未带 token 访问 `GET/PUT /api/config` → `401`。
- 首次 `GET /api/config` 返回三个 `disguise.*` 默认值。
- `PUT /api/config/disguise.csdn_title` 改值后，再 `GET` 能读到新值。
- `PUT` 未知 key → `404`；空 `value` → `400`。

---

## 7. 前端实施细节

### 7.1 `api.ts` / 调用

用现有 `api<T>()` 直接调用即可：
- `api<{ config: Record<string,string> }>("/config")`
- `api<{ key: string; value: string }>("/config/" + encodeURIComponent(key), { method: "PUT", body: { value } })`

### 7.2 顶栏（`Layout.tsx`）改造

- 移除单一 `.stealth-toggle` 按钮逻辑，改为**皮肤下拉**（`<select>` 或自定义小菜单）：选项「关闭 / 内部文档 / CSDN」，对应 `off/wiki/csdn`，`onChange` 调 `setSkin`。样式要低调（伪装时不显眼）。
- 保留 `Ctrl + \`` 老板键：在 `off` 与「上次非 off 皮肤」间切换（记住 lastSkin，默认 `wiki`）。
- 品牌名：
  - `off` → `"NoteForge"`（原样）。
  - `wiki` → 显示 `config["disguise.wiki_brand"]`，且**可就地编辑**（见 7.4）。
  - `csdn` → 显示 `config["disguise.csdn_brand"]`，可就地编辑。
- 伪装时仍隐藏「写作中心」入口/用户名/登出（保持现有行为）。

### 7.3 CSDN 大标题（`MaterialsPage.tsx` 的 `MaterialReadViewV2`）

- 现有大标题 `.mat-read-title` 显示的是**真实资料标题**。在 `wiki` 与 `csdn` 皮肤下都通过 CSS 隐藏它（Wiki 已隐藏，CSDN 也隐藏）。
- CSDN 皮肤下，在文章区顶部**额外渲染一个伪装大标题元素**（如 `<h1 class="csdn-decoy-title">`），内容取 `config["disguise.csdn_title"]`，**可就地编辑**。仅在 `skin === "csdn"` 渲染。
- 其下渲染 CSDN 作者统计条（见 7.5）。
- 正文容器沿用现有 `.mat-read.prose`，靠 CSS 皮肤类改观感。

### 7.4 就地编辑组件（复用）

建一个小组件 `InlineEditable`（`span`/`h1` 点击后变 `input`，失焦/回车提交、Esc 取消），props：`value`、`onCommit(next)`、可选 `as`/`className`。用于：Wiki 品牌名、CSDN 品牌名、CSDN 大标题。`onCommit` → `disguise.updateConfig(key, next)`（乐观 + 防抖 PUT）。**仅在对应伪装皮肤下可编辑**；正常模式不触发。

### 7.5 CSDN 皮肤 CSS（`styles/index.css`）

先把现有 `:root[data-stealth="on"] { … }` 整块：
- 选择器改名 `:root[data-stealth-skin="wiki"]`。
- 其中「与皮肤无关的共性」（隐藏写作入口、隐藏真实 `.mat-read-title` 等两皮肤都要的）抽成共同选择器 `:root[data-stealth-skin="wiki"], :root[data-stealth-skin="csdn"]`。

再新增 `:root[data-stealth-skin="csdn"] { … }` 块，实现 CSDN 观感：

- 变量：`--bg:#f5f6f7; --surface:#fff; --text:#222; --accent:#fc5531`(CSDN 红)；链接色 `#1e6bb8`；正文 `--serif: var(--sans)`，字号 15–16px、行距 1.7–1.8。
- 顶栏白底、品牌红色。
- `.csdn-decoy-title`：大号（22–26px）黑体粗体、深色。
- 作者统计条：把 `.material-meta` 或新元素排成一行：头像圆点(红) + 品牌名 + 时间 + `阅读 1,234`/`点赞 56`/`收藏 23`(写死) + 标签 chips。
- 代码块 `.prose pre`：改浅色主题（浅灰底、深色字、圆角、内边距）；`::before` 造一条语言标签栏（固定文案如「代码」）。
- 文章底部 `::after` 注入「版权声明：本文为博主原创文章，遵循 CC 4.0 BY-SA 版权协议，转载请附上原文出处链接及本声明。」样式做成 CSDN 那种浅底小字块。
- 引用/高亮等彩色元素统一到 CSDN 配色，别残留原橙色。

### 7.6（可选 · 二期，不阻塞验收）

- 代码块「复制」按钮真正可点：加一个渲染后增强脚本，给每个 `.prose pre` 注入按钮 + `navigator.clipboard.writeText`。
- 右侧「文章目录」真跳转：需给 `<h1..6>` 注入 id（小改 `markdown.ts` 或渲染后 DOM 处理），复用标注栏位置展示目录。
- CSDN favicon：伪装时换成内嵌红色 data-URI favicon，正常时还原。

---

## 8. 验收标准与本地验证

**功能验收（必须全过）：**

1. `off/wiki/csdn` 三种皮肤可通过顶栏下拉与 `Ctrl+\`` 切换；刷新后皮肤保持（localStorage）。
2. Wiki 皮肤：观感与改造前一致；顶栏品牌名显示的是 `disguise.wiki_brand`，点击可改、保存后刷新仍在（后端）。
3. CSDN 皮肤：保留大标题但显示的是 `disguise.csdn_title`（**不是**资料真实标题）；有作者统计条、CSDN 配色、代码块语言条、版权声明块。大标题与品牌名均可就地编辑并持久化。
4. 切换资料时，CSDN 大标题始终是同一个全局假标题。
5. 关闭伪装（`off`）后，一切恢复真实：真实资料标题、正常配色、写作入口回归；`document.title` 回 `"NoteForge"`。
6. 真实资料的编辑/保存/标注等原有功能不受影响。

**验证步骤：**

- `npm test` —— 全绿（含新增 `config.routes.test.ts`）。
- `npm run build:client` —— 通过（顺带类型检查）。
- 起 `npm run dev`（后端 4000 / 前端 5173），注册/登录一个测试账号，造 1–2 条含 Markdown（标题、代码块、列表）的资料，逐一走查上面 6 条功能验收。
  - 注意：若用工具起服务器时 `PORT` 被外部注入导致后端错绑端口，请确保后端实际监听 4000（前端 `/api` 代理指向 4000）。

**不要做**：不要 `git push`，不要部署到生产服务器。改完把变更、验证结果、以及「建议的提交信息」交回给用户。

---

## 9. 约束清单（复述，务必遵守）

- 迁移幂等无损：`CREATE TABLE IF NOT EXISTS` + `INSERT OR IGNORE`，不覆盖用户改过的配置。
- 伪装文字是覆盖层，**与真实 `materials.title` 完全解耦**，不得读写真实标题来当伪装标题。
- `sys_config` 是**通用全局 KV 表**，未来可放其它全局配置；本次只用 `disguise.*` 三个键。
- 就地编辑要有长度上限（1..64）与防抖，避免频繁请求与空标题。
- 全程中文注释/沟通。

---

## 10. 参考：提交与部署（交回用户执行，AI 不自行操作）

- 建议分两个提交：①后端（表+`/api/config`+测试）②前端（Context+皮肤重构+CSDN 皮肤+就地编辑）。
- 部署流程见仓库 `AGENTS.md`（打包 tar → scp → `docker compose up -d --build`）。`sys_config` 靠 `IF NOT EXISTS` 随启动自动建，无需手工迁移。
