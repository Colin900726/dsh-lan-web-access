# 贡献指南（开发）

> 面向开发者。用户安装、使用见 [README.md](./README.md)。

## 环境准备

- Node.js ≥ 22。
- pnpm。
- **注意**：DeepSeek Harness 自带的受限 Node（Hardened Runtime）加载不了 rolldown 原生 binding（Team ID 校验失败），请用系统自己装的 Node 跑 vitest / tsdown，例如 macOS 上 Homebrew 的 Node：

```sh
/opt/homebrew/bin/node node_modules/vitest/vitest.mjs run
```

## 常用命令

```sh
pnpm install        # 安装依赖
npm run typecheck   # tsc --noEmit
npm run lint        # eslint（src + tests）
npm run format      # prettier 格式化
npm test            # vitest（146 个用例，不连外网）
npm run build       # tsc + tsdown，产物输出到 lib/
npm run dev         # 构建后启动 dsh web（插件需已用「从源码」方式装进 web profile）
```

### 提交前：重新编译，把 `lib/` 一起提交

`lib/` 是编译产物，但**提交在仓库里**——用户可以 `dsh plugin add github:…` 直接从 GitHub 安装，从 GitHub 装的是仓库原样内容，pnpm 默认不会替用户编译。所以：

```sh
npm run build
git add src lib     # 改了 src，lib 必须一起提交
```

GitHub Actions 每次推送都会重新编译一遍并对比：仓库里的 `lib/` 和 `src/` 编译出来的不一致，检查就会失败（见 `.github/workflows/ci.yml`）。不要手改 `lib/` 里的文件。

## 源码结构

### 顶层结构

```
dsh-lan-web-access/
├── src/                        源码（唯一需要手改的地方）
│   └── client/                 设置页界面（界面部分）
├── lib/                        构建产物（提交在仓库里，供直接从 GitHub 安装；npm 包里也带它）
│   ├── *.js                    tsc 产出 —— 服务端部分
│   ├── types/**                tsc 类型声明
│   └── client.js (+.map)       tsdown 产出 —— 界面部分，注册进 window.__ModuleLoader__
├── tests/                      vitest 单元测试（16 个 spec / 146 个用例）
├── .github/workflows/ci.yml    推送时自动检查：测试、编译、lib/ 与源码一致
├── cordis.patch.yml            宿主把本插件插进 Cordis 树的那一行（运行时必需）
├── tsconfig.json               服务端部分 + 类型声明的编译设置
├── tsdown.config.ts            界面部分的打包设置
├── eslint.config.js            代码检查
├── .prettierrc.json            格式化规则
├── pnpm-workspace.yaml         pnpm 安装设置（禁用若干原生模块的安装脚本）
└── package.json                双入口：main = lib/index.js，exports["./client"] = lib/client.js
```

> 插件代码分两部分，运行在两个地方：
> - **服务端部分**：运行在 dsh 主程序里（Node.js），负责拦请求、补登录凭证、局域网入口、管理接口。由 `tsc` 从 `src/*.ts` 编译成 `lib/*.js`。
> - **界面部分**：运行在浏览器或 Desktop 窗口里，就是设置页「局域网web访问」那一页。由 `tsdown` 从 `src/client/` 打包成 `lib/client.js`。
>
> 两者都由 `npm run build` 生成。`src/shared.ts` 两边共用，所以不能引用任何 Node.js 专有模块。

### 模块职责

| 文件 | 职责 |
| --- | --- |
| **入口与装配** | |
| `index.ts` | 插件入口：装配运行时、安装守卫、注册管理 API、按设置启停局域网入口（串行队列）、启动检查与安全退出、设置变更时重查 |
| `runtime.ts` | 运行时共享依赖聚合 |
| `shared.ts` | 前后端共用：错误码、状态接口类型、登录保持天数、支持的 dsh 版本、允许列表的地址校验 |
| `cordis-raw.ts` | 取 cordis 服务代理背后的原对象（比较、改写方法时用） |
| **信任与认证** | |
| `trust.ts` | 「是否本机」判定 + IP/CIDR 匹配（纯函数，安全核心） |
| `origin-guard.ts` | 局域网入口的来源检查：Origin 与地址栏同源、可疑域名（DNS 重绑定）拒绝 |
| `native-cookie.ts` | 按上游协议逐字节补签 `dsh-auth-*` cookie，绕开 token URL |
| `guard.ts` | 请求拦截：路由包装（会话闸门 + 补签）+ `connection/request` 权威闸门 + index 注入 |
| `session-store.ts` | scrypt 密码散列 + 可吊销会话表（踢单机 / 改密码全下线） |
| `cookies.ts` | 会话 cookie `dsh_sid` 的序列化与解析 |
| `ratelimit.ts` | 登录限速：每 IP 失败锁定 + 全局指数退避（本机豁免） |
| `login.ts` | 登录处理（主服务与局域网入口共用）：限速、校验、发会话、记访问记录 |
| `login-page.ts` | 登录页 HTML 五种状态（自包含、跟随系统明暗偏好） |
| `machine-name.ts` | 电脑名：macOS「关于本机」名称、Windows 计算机名、其他取主机名 |
| **局域网** | |
| `gateway.ts` | 局域网入口：允许列表 → 来源检查 → 会话 / 免密 → 改写 Host 转发到主服务（含 WebSocket 升级转发、断开时两端一起关） |
| `devices.ts` | 设备表：允许列表 × 登录会话 × 最近被拒绝的地址 |
| **管理 API 与设置** | |
| `admin-api.ts` | `/login` 与 `/api/remote-access/*` 全套路由；敏感操作只限本机 |
| `settings.ts` | 设置模型 + 默认值 + 纯校验 |
| `settings-store.ts` | 设置持久化到 `$DSH_HOME/remote-access.json`（临时文件 + 原子 rename，0600） |
| `access-log.ts` | 访问记录环形缓冲（最近 200 条，内存；重复被拒合并计数） |
| **版本与自检** | |
| `selfcheck.ts` | 五项运行检查、版本比较（semver 规则）、前四项判定安全退出 |
| `updater.ts` | 一键更新：查最新版本 + 触发 `dsh plugin update`（Desktop 自举、Windows 用 `dsh.cmd`） |
| **界面部分（`client/`）** | |
| `client/index.tsx` | 设置页外壳：状态头、分段、提示条、「连接」分段 |
| `client/devices-panel.tsx` | 「设备」分段与设备详情、添加设备面板 |
| `client/security-panel.tsx` | 「安全」分段：管理密码、登录保持、访问记录 |
| `client/about-panel.tsx` | 「关于」分段：版本、一键更新、运行检查 |
| `client/ui.tsx` | 共用零件：开关、弹出面板、图标、请求与保存的 hooks |
| `client/strings.ts` | 文案表（界面上每一句话都在这里；英文版补一份同结构的表） |
| `client/styles.ts` | 样式（苹果系统色，深浅两套；颜色、字号、间距、圆角都以变量定义在这里） |
| `client/lan-address.ts` | 没选网卡时挑哪个地址当访问地址（不挑虚拟网卡、代理工具的 utun） |

### 改代码时别破坏这些关键不变量

- **`trust.ts`**：「本机」要求 TCP 对端与 `Host` 头**同时为回环**，且不采信 `X-Forwarded-For` 等可伪造头。
- **`gateway.ts`**：允许列表、来源和会话校验**必须在转发之前**完成，路径先按 URL 规则归一再判断 —— 任何漏转发都等于放进一个本机身份。
- **`guard.ts`**：主服务上只认回环对端；局域网入口转发的请求凭本进程令牌（`x-dsh-remote-gateway`，常量时间比较）认出。公共路由（`/login`、`/api/remote-access/*`）不包装。
- **`native-cookie.ts`**：格式必须与上游**逐字节一致**；读不到签名密钥时**跳过补签**，让请求落回官方 token 认证（安全关闭，而非放开）。
- **敏感操作**（改设置 / 密码 / 允许列表 / 更新 / 踢下线）只认 `isLocalRequest`：回环且不带入口令牌、Origin 完全同源、`Sec-Fetch-Site` 只能是 same-origin / none、请求体必须是 JSON。
- **dsh 宿主的全局样式**：dsh 页面给所有元素设了 `corner-shape: superellipse(1.5)`、给 body 设了 `text-autospace: normal`，插件在 `.dla` 下改回 `round` 和 `no-autospace`，否则圆角变方、中英文之间被加空格。

## 测试

### 单元测试

| 测试文件 | 覆盖 | 用例 |
| --- | --- | --- |
| `trust.spec.ts` | 本机判定、IP/CIDR 匹配 | 11 |
| `guard.spec.ts` | 闸门、补签、主端口只认本机、入口令牌 | 12 |
| `native-cookie.spec.ts` | 原生 cookie 格式 | 6 |
| `session-store.spec.ts` | 密码散列、会话吊销 | 6 |
| `ratelimit.spec.ts` | 登录限速 | 5 |
| `settings.spec.ts` | 设置校验 | 5 |
| `selfcheck.spec.ts` | 版本比较（含预发布版） | 3 |
| `lifecycle.spec.ts` | 停用 / 再启用不残留、不报重复路由 | 9 |
| `stage1.spec.ts` … `stage6.spec.ts` | 各开发阶段的验收条件（用例名就是 Given / When / Then） | 68 |
| `review-fixes.spec.ts`、`review.spec.ts` | 代码复核发现的问题的回归测试（CSRF、路径归一绕过、并发登录、长连接空挂、记录被刷掉等） | 21 |

合计 **146 个用例**，不连外网（版本源、更新命令都用本地假的）。

只跑单个文件：

```sh
/opt/homebrew/bin/node node_modules/vitest/vitest.mjs run tests/trust.spec.ts
```

### 调试用环境变量

演示和测试用的环境变量（正常使用都不设）：`DSH_REMOTE_ACCESS_REGISTRY` 版本源地址、`DSH_REMOTE_ACCESS_UPDATE_CMD` 代替更新命令、`DSH_REMOTE_ACCESS_FAKE_FAIL` 让某几项运行检查按没通过处理、`DSH_REMOTE_ACCESS_FILE` 配置文件位置。

## 界面规范

- 风格：macOS「系统设置」式分组列表，苹果系统色（强调色为 Apple 蓝），深浅两套，跟随 dsh 的明暗主题。
- 设置窗口内容区宽约 564px；分组圆角 12、弹出面板 14、控件 8、小件 6。
- 界面上每一句话都在 `src/client/strings.ts`，组件里不写死文字；登录页文案在 `src/login-page.ts` 的 `TEXT` 表。
- 改了就生效，没有「保存」按钮；能撤销的操作不弹确认，只有「清除密码」弹确认。
- 局域网设备看到的是只读视图：开关换成文字，不放灰掉的控件。
- 改界面后在真 dsh 里深浅两套、正常宽度和最窄窗口各看一遍。

## 许可证

[MIT](./LICENSE) © 2026 Colin
