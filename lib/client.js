window.__ModuleLoader__.load({
	id: "dsh-lan-web-access",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/shared.ts
		/** 管理接口返回给前端的错误码。 */
		const ERROR_CODES = {
			/** 需要先设管理密码（关本机免登录、开局域网）。 */
			passwordRequired: "password-required",
			/** 本机免登录关着、本机还没登录时做管理操作。 */
			loginRequired: "login-required",
			/** 只能在本机做的操作，从局域网发来的。 */
			localOnly: "local-only",
			/** 请求体不是合法 JSON。 */
			invalidBody: "invalid-body",
			/** 端口不在 1–65535，或和 dsh 主端口相同。 */
			invalidPort: "invalid-port",
			/** 其他设置值不合法（白名单条目、登录保持天数、网卡）。 */
			invalidSetting: "invalid-setting",
			/** 局域网入口的端口被别的程序占用了。 */
			portInUse: "port-in-use",
			/** 选中的网卡地址现在不在这台电脑上（断网、组网软件退出）。 */
			hostUnavailable: "host-unavailable",
			/** 允许列表里已经有这个地址。 */
			duplicate: "duplicate",
			/** 局域网入口拒绝了别的网站借浏览器发来的请求。 */
			crossSite: "cross-site",
			/** 密码不对（带 remaining：还能错几次）。 */
			wrongPassword: "wrong-password",
			/** 错太多次，要等（带 retryAfter：还要等几秒）。 */
			locked: "locked",
			/** 新密码不够 MIN_PASSWORD_LENGTH 位。 */
			tooShort: "too-short"
		};
		/** 登录保持可选的天数。 */
		const SESSION_MAX_AGE_CHOICES = [
			1,
			7,
			14,
			30
		];
		const COMPAT_LABEL = "0.1.7 – 0.2.x";
		/** IPv4 字符串 → 无符号 32 位整数；非法返回 undefined。 */
		function parseIpv4(ip) {
			const parts = ip.split(".");
			if (parts.length !== 4) return void 0;
			let n = 0;
			for (const p of parts) {
				if (!/^\d{1,3}$/.test(p)) return void 0;
				const v = Number(p);
				if (v > 255) return void 0;
				n = n * 256 + v;
			}
			return n >>> 0;
		}
		/** 判断一个字符串是否为合法 IPv6 字面量（精确匹配用）。 */
		function isIpv6(ip) {
			if (typeof ip !== "string" || ip === "") return false;
			if (!ip.includes(":")) return false;
			try {
				const u = new URL(`http://[${ip}]`);
				return u.hostname.startsWith("[") || u.hostname.includes(":");
			} catch {
				return false;
			}
		}
		/** 解析 CIDR 为 { base, mask }（32 位，IPv4）。非法返回 undefined。 */
		function parseCidr(cidr) {
			const s = cidr.trim();
			const slash = s.indexOf("/");
			let ipPart;
			let bits;
			if (slash === -1) {
				ipPart = s;
				bits = 32;
			} else {
				ipPart = s.slice(0, slash);
				const raw = s.slice(slash + 1);
				if (!/^\d{1,2}$/.test(raw)) return void 0;
				const b = Number(raw);
				if (b > 32) return void 0;
				bits = b;
			}
			const base = parseIpv4(ipPart);
			if (base === void 0) return void 0;
			const mask = bits === 0 ? 0 : 4294967295 << 32 - bits >>> 0;
			return {
				base: (base & mask) >>> 0,
				mask
			};
		}
		/** 一条允许列表的值是什么：单台设备（IPv4 / IPv6）、一个网段（IPv4 CIDR），或不合法。 */
		function whitelistValueKind(value) {
			const s = value.trim();
			if (s === "") return "invalid";
			if (s.includes("/")) return parseCidr(s) !== void 0 ? "range" : "invalid";
			if (s.includes(":")) return isIpv6(s) ? "single" : "invalid";
			return parseIpv4(s) !== void 0 ? "single" : "invalid";
		}
		//#endregion
		//#region src/client/strings.ts
		/** 设置页的全部文字（目前只有中文；加英文就补一份同结构的表）。 */
		const zh = {
			sectionLabel: "局域网web访问",
			title: "局域网web访问",
			hero: {
				switchLabel: "启用插件（关闭后恢复 dsh 官方的登录方式）",
				running: "正在运行",
				localOnly: "仅本机和 SSH 隧道",
				lanOpen: "局域网已开放",
				loggedIn: (n) => `${n} 个浏览器已登录`,
				disabled: "已停用 · 现在用 dsh 官方的 token 方式登录",
				loading: "正在读取状态…",
				unreachable: "读不到插件状态，请刷新重试",
				/** 总开关关着时，分组下方的说明（设计稿「插件已停用」）。 */
				keptWhileOff: "下面的设置都保留着，打开总开关后原样恢复。",
				/** 运行检查没通过、已安全退出。 */
				fault: "已暂停 · 已退回 dsh 官方登录方式",
				checking: "正在做运行检查…"
			},
			/** 安全退出时状态头下方的红条：标题写第一项没通过的，正文说影响和怎么办。 */
			fault: {
				title: {
					webServer: "没能接入 dsh 的网页服务",
					signing: "读不到 dsh 的登录签名",
					sessionKey: "局域网登录密钥没准备好",
					dshVersion: "dsh 版本超出插件支持的范围"
				},
				body: "免 token 和局域网入口已关闭，Desktop 不受影响。等插件更新后到「关于」点「重新检查」。",
				more: "查看运行检查"
			},
			tabs: {
				aria: "设置分类",
				conn: "连接",
				dev: "设备",
				sec: "安全",
				about: "关于"
			},
			conn: {
				localLabel: "本机免登录",
				localDesc: "在这台电脑或经 SSH 隧道打开时直接进入，不用 token",
				copyLocal: "复制本机访问地址",
				copied: "已复制本机访问地址",
				copyFailed: "没能复制，请手动选中地址复制",
				/** 没设密码时去关「本机免登录」的提示。 */
				needPassword: "先在「安全」里设置管理密码",
				lanLabel: "局域网访问",
				lanDesc: "同一网络里的其他设备用浏览器打开，需要密码",
				lanPortInUse: (port) => `没能打开：端口 ${port} 被别的程序占用了，换一个端口再试`,
				lanHostUnavailable: "没能打开：选中的网卡现在不在这台电脑上，换一块网卡再试",
				lanGroup: "局域网入口",
				firewallTitle: "系统可能会弹窗询问",
				firewallBody: "如果系统询问是否允许 dsh 接受连接，请点「允许」，否则其他设备连不上。",
				addrLabel: "访问地址",
				copyLan: "复制访问地址",
				copiedLan: "已复制访问地址",
				nicLabel: "监听网卡",
				nicDesc: "选「所有网卡」时，Wi-Fi、有线、Tailscale 都能连进来",
				nicAll: "所有网卡",
				/** 100.64.0.0/10 网段的网卡（Tailscale 这类异地组网）。 */
				nicOverlay: "组网",
				nicMissing: "选中的网卡现在不在这台电脑上（断网或组网软件已退出），换一块网卡",
				nicNoNetwork: "没有检测到可用网络",
				portLabel: "端口",
				portDesc: "改完按回车生效，不用重启",
				portSaved: "已保存，局域网入口已在新端口重开",
				portInvalid: "端口要在 1 到 65535 之间",
				portIsMain: (port) => `${port} 是 dsh 自己的端口，换一个`,
				portInUse: (port) => `端口 ${port} 被别的程序占用了，换一个端口再试`,
				insecure: "局域网连接没有加密，同一网络里的人可能截到密码。只在家里、公司内网或 Tailscale 这类组网里打开。"
			},
			dev: {
				groupTitle: "允许的设备",
				signOutAll: "全部退出登录",
				signedOutAll: "所有浏览器已退出登录",
				loggedIn: "已登录",
				notLoggedIn: "未登录",
				manyLoggedIn: (n) => `${n} 个浏览器已登录`,
				bypass: "免密码",
				neverSeen: "还没来访过",
				active: (ago) => `${ago}活跃`,
				add: "添加设备…",
				addShort: "添加设备",
				foot: "不在列表里的设备，连登录页都打不开。点一行可以让它退出登录，或把它移出列表。",
				emptyText: "还没有允许的设备。加进来的设备才能打开登录页。",
				emptyFoot: (mode) => `列表为空时：${mode}。`,
				emptyModeLabel: "列表为空时",
				emptyMode: {
					"deny-all": "拒绝所有设备",
					"private-only": "允许所有私有网段"
				},
				bypassLabel: "列表里的设备免密码",
				bypassDesc: "同一网络里的人可以冒用 IP，只在完全可信的网络里打开",
				othersTitle: "其他已登录的浏览器",
				othersDesc: "不在允许列表里，是「列表为空时允许所有私有网段」放进来的",
				detailLead: "允许这台设备打开登录页。",
				nameLabel: "名称",
				namePlaceholder: "例如：客厅的 iPad",
				valueLabel: "IP 或网段",
				valuePlaceholder: "192.168.1.23",
				loginState: "登录状态",
				signOut: "退出登录",
				signedOut: (who) => `${who} 已退出登录`,
				/** 退出登录提示里「谁的哪个浏览器」。 */
				whoBrowser: (who, browser) => `${who} 的 ${browser}`,
				loadFailed: "没能读到设备列表",
				retry: "重试",
				signOutNote: "退出登录后，它下次打开要重新输入密码；设备仍在允许列表里。",
				bypassNote: "开着「列表里的设备免密码」，这台设备不用登录，没有可退出的登录。",
				noSessions: "现在没有登录着的浏览器。",
				loginSince: (date) => `${date}登录`,
				remove: "移出列表",
				removed: (name) => `已把 ${name} 移出列表，它的登录也已失效`,
				undoFailed: "没能撤销，可以在「添加设备」里重新加上",
				cancel: "取消",
				done: "完成",
				addTitle: "添加设备",
				addLead: "加进来的设备才能打开登录页，登录仍需要密码。",
				addLeadBypass: "加进来的设备开着免密码时直接进入，不用输密码。",
				addConfirm: "添加",
				added: (name) => `已添加 ${name}`,
				valueHint: "一台设备填 IP，如 192.168.1.23；一整个网段填 192.168.1.0/24",
				valueSingle: "单台设备",
				valueRange: "网段：这一段里的所有设备都允许",
				valueInvalid: "格式不对：应为 192.168.1.23 或 192.168.1.0/24",
				valueDuplicate: "这个地址已经在列表里了",
				recentTitle: "最近被拒绝的地址，点一下填入",
				recentMeta: (count, when) => `${count} 次 · ${when}`,
				date: (d) => `${d.getMonth() + 1} 月 ${d.getDate()} 日`
			},
			sec: {
				groupPassword: "密码与登录",
				passwordLabel: "管理密码",
				passwordSet: (ago) => `已设置 · ${ago}修改`,
				passwordSetNoTime: "已设置",
				passwordUnset: "未设置",
				change: "更改",
				newPassword: "新密码",
				showPassword: "显示密码",
				cancel: "取消",
				save: "保存",
				setFirst: "设置",
				hint: `至少 12 位，保存后所有已登录的设备都要重新登录`,
				hintFirst: `至少 12 位，设好后才能打开局域网访问`,
				short: (n) => `还差 ${n} 位`,
				enough: "长度够了",
				changed: "密码已更新，其他设备需要重新登录",
				setDone: "管理密码已设置",
				keepLabel: "登录保持",
				keepDesc: "过期后要重新输入密码",
				days: (n) => `${n} 天`,
				clear: "清除密码…",
				clearTitle: "清除管理密码？",
				clearBody: "清除后会同时：关闭局域网访问、让所有局域网设备退出登录。本机和 SSH 隧道不受影响。之后要用局域网，需要重新设置密码。",
				clearReopenLocal: "同时会重新打开「本机免登录」，否则浏览器将无法进入。",
				clearConfirm: "清除密码",
				cleared: "密码已清除，局域网访问已关闭",
				groupLog: "访问记录",
				logAll: (n) => `全部 ${n} 条`,
				logTitle: "访问记录",
				logFoot: `只保存最近 200 条；dsh 重启后清空。`,
				logEmpty: "还没有记录。局域网设备登录、被拒绝时会记在这里。",
				logLoadFailed: "没能读到访问记录，稍后会自动再试",
				times: (n) => `${n} 次`,
				filterAria: "筛选",
				filter: {
					all: "全部",
					deny: "拒绝",
					login: "登录"
				},
				done: "完成",
				kind: {
					"whitelist-deny": "不在列表里，已拒绝",
					unauthorized: "没登录，已拒绝",
					"cross-site": "别的网站发来的请求，已拒绝",
					"login-failed": "密码错误",
					login: "登录成功",
					logout: "退出登录",
					kick: "被踢下线",
					removed: "移出列表",
					update: "插件更新",
					"selfcheck-fail": "运行检查没通过"
				},
				today: "今天",
				yesterday: "昨天"
			},
			about: {
				groupVersion: "版本",
				plugin: "插件",
				dsh: "dsh",
				runtime: "运行环境",
				edition: {
					desktop: "Desktop",
					web: "Web",
					unknown: "未知"
				},
				port: (p) => `主端口 ${p}`,
				unknownVersion: "未知",
				dshInRange: (v) => `${v} · 在支持范围内`,
				dshOutOfRange: (v) => `${v} · 超出支持范围`,
				update: {
					checking: "正在查询最新版本",
					latest: (v) => `${v} 是最新版本`,
					available: (cur, next) => [`当前 ${cur} · `, `有新版本 ${next}`],
					unavailable: (cur) => `当前 ${cur} · 暂时查不到新版本`,
					running: "通常不到 1 分钟；网络不好时会自动换下载来源，最长几分钟，别关 dsh",
					done: (v) => `已更新到 ${v}，重启 dsh 后生效`,
					failed: {
						network: "连不上更新服务器，检查网络后点「重试」，设置不受影响。",
						"no-command": "找不到 dsh 命令，没能自动更新，设置不受影响。",
						"bad-arg": "这个 dsh 配置的名字里有特殊字符，没法自动更新，设置不受影响。",
						failed: "更新没成功，可以点「重试」，设置不受影响。"
					},
					/** 失败时附在原因后面的手动办法：Web 给终端命令，Desktop 指引去「插件」页。 */
					manual: (cmd) => `也可以在终端运行：${cmd}`,
					manualDesktop: (v) => `也可以到 dsh 的「插件」页面更新，或在「添加插件」里填 dsh-lan-web-access@${v}`,
					check: "检查更新",
					to: (v) => `更新到 ${v}`,
					busy: "更新中…",
					retry: "重试",
					dot: "有新版本"
				},
				groupChecks: "运行检查",
				allPassed: (n) => `· ${n} 项全部通过`,
				passedSomeUnset: (ok, idle) => `· ${ok} 项通过 · ${idle} 项未设置`,
				someFailed: (n) => `· ${n} 项没通过`,
				pending: "· 正在检查",
				recheck: "重新检查",
				rechecking: "检查中…",
				toastPassed: (n) => `${n} 项检查全部通过`,
				toastPassedUnset: (ok) => `${ok} 项检查通过，管理密码未设置`,
				toastFailed: (n) => `有 ${n} 项没通过`,
				checksFoot: "前四项任何一项不通过，插件会自动退回 dsh 官方的登录方式并关闭局域网入口，这里会写明原因。",
				check: {
					webServer: {
						label: "接入 dsh 网页服务",
						ok: (port) => `插件已挂到 dsh 的网页服务上，主端口 ${port}`,
						bad: "没能挂到 dsh 的网页服务上"
					},
					signing: {
						label: "读取 dsh 登录签名",
						ok: "能读到 dsh 的签名密钥，所以本机和 SSH 隧道可以免 token 进入",
						bad: "读不到 dsh 的签名密钥，dsh 升级后格式可能变了"
					},
					sessionKey: {
						label: "局域网登录密钥",
						ok: "已生成，局域网设备登录后能保持登录",
						bad: "没能生成，局域网设备登录后保持不住"
					},
					dshVersion: {
						label: "dsh 版本",
						ok: (v) => `${v}，在插件支持的 ${COMPAT_LABEL} 之内`,
						unknown: "读不到 dsh 的版本号，按支持处理",
						warn: (v) => `${v}，超出插件支持的 ${COMPAT_LABEL}`
					},
					password: {
						label: "管理密码",
						ok: "已设置，局域网访问可以打开",
						idle: "未设置，设好后才能打开局域网访问"
					}
				},
				stateLabel: {
					ok: "通过",
					bad: "没通过",
					warn: "需要注意",
					idle: "未设置"
				}
			},
			readOnly: {
				title: "只能查看",
				thisDevice: "这台设备",
				body: (ip, machine) => `你正在从 ${ip} 访问。要修改设置，请在 ${machine} 本机或通过 SSH 隧道打开。`,
				/** 取不到电脑名时的说法。 */
				thisMachine: "装 dsh 的电脑",
				on: "开",
				off: "关"
			},
			time: {
				justNow: "刚刚",
				minutes: (n) => `${n} 分钟前`,
				hours: (n) => `${n} 小时前`,
				days: (n) => `${n} 天前`
			},
			undo: "撤销",
			errors: {
				/** 请求根本没送到（网络断了、dsh 没在跑）。 */
				noResponse: "没能保存，dsh 没有响应，稍后再试",
				/** dsh 收到了但拒绝了，又没有更具体的原因。 */
				rejected: "没能保存，请刷新页面后再试",
				localOnly: "只能在装 dsh 的电脑本机上修改",
				/** 本机免登录关着、这个浏览器还没登录。 */
				loginRequired: "需要先登录：刷新页面，输入管理密码后再改",
				/** 保存成功后重新读取状态失败（页面保留原来的内容）。 */
				refreshFailed: "已保存，但没能刷新状态，请稍后刷新页面",
				/** 定时刷新读不到状态（dsh 停了、断网）：只提示一次，恢复后不再提示。 */
				pollFailed: "连不上 dsh，页面上显示的可能不是最新的",
				/** 允许列表的条目不合法、或已经有这个地址。 */
				invalidSetting: "这个值 dsh 不接受，检查一下再试",
				duplicate: "列表里已经有这个地址了"
			}
		};
		//#endregion
		//#region src/client/ui.tsx
		/** 保存不到这么久就不显示「进行中」。 */
		const BUSY_DELAY_MS = 1e3;
		/** 「关不掉」红字提示停留时长。 */
		const INLINE_ERROR_MS = 3e3;
		/** 底部提示条停留时长。 */
		const TOAST_MS = 3e3;
		function getStatus() {
			return getJson("status");
		}
		const API = "/api/remote-access";
		/** 读一个本机接口的 JSON；失败返回 undefined。 */
		async function getJson(path) {
			try {
				const res = await fetch(`${API}/${path}`, { cache: "no-store" });
				if (!res.ok) return void 0;
				return await res.json();
			} catch {
				return;
			}
		}
		/** 往本机接口 POST 一段 JSON，按「没送到 / 被拒（带错误码）/ 成功」返回。 */
		async function postJson(path, body) {
			let res;
			try {
				res = await fetch(`${API}/${path}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body)
				});
			} catch {
				return {
					ok: false,
					kind: "network"
				};
			}
			if (res.ok) return {
				ok: true,
				data: await res.json().catch(() => void 0)
			};
			const data = await res.json().catch(() => ({}));
			return {
				ok: false,
				kind: "rejected",
				code: data.code,
				port: data.port
			};
		}
		/** 保存失败时给用户看的那句话：按原因分，不一律说「没有响应」。 */
		function failureText(failure) {
			if (failure.kind === "network") return zh.errors.noResponse;
			switch (failure.code) {
				case ERROR_CODES.localOnly: return zh.errors.localOnly;
				case ERROR_CODES.loginRequired: return zh.errors.loginRequired;
				case ERROR_CODES.passwordRequired: return zh.conn.needPassword;
				case ERROR_CODES.invalidSetting: return zh.errors.invalidSetting;
				case ERROR_CODES.duplicate: return zh.errors.duplicate;
				default: return zh.errors.rejected;
			}
		}
		async function copyText(text) {
			try {
				await navigator.clipboard.writeText(text);
				return true;
			} catch {
				const el = document.createElement("textarea");
				el.value = text;
				el.style.position = "fixed";
				el.style.opacity = "0";
				const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
				document.body.append(el);
				el.select();
				const ok = document.execCommand("copy");
				el.remove();
				back?.focus();
				return ok;
			}
		}
		/** 组件是否还挂着；异步回来后据此决定还要不要更新状态、开定时器。 */
		function useMounted() {
			const mounted = (0, react.useRef)(true);
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
				};
			}, []);
			return mounted;
		}
		const WifiIcon = () => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: "26",
			height: "26",
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "1.6",
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": "true",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M5 12.5a10 10 0 0 1 14 0" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8.5 16a5 5 0 0 1 7 0" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M1.5 9a15 15 0 0 1 21 0" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "12",
					cy: "19.5",
					r: "1"
				})
			]
		});
		const CopyIcon = () => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: "13",
			height: "13",
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "1.6",
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": "true",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "9",
				y: "9",
				width: "12",
				height: "12",
				rx: "2"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M5 15V5a2 2 0 0 1 2-2h10" })]
		});
		const InfoIcon = () => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: "16",
			height: "16",
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "1.8",
			strokeLinecap: "round",
			"aria-hidden": "true",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "12",
				cy: "12",
				r: "9"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 11v5M12 8h.01" })]
		});
		const WarnIcon = () => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: "13",
			height: "13",
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2",
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": "true",
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 3 2 20h20L12 3z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 10v4M12 17h.01" })]
		});
		const CheckIcon$1 = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			width: "14",
			height: "14",
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2.4",
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": "true",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m5 12 5 5 9-10" })
		});
		const BangIcon = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			width: "14",
			height: "14",
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: "2.4",
			strokeLinecap: "round",
			"aria-hidden": "true",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 7v6M12 17h.01" })
		});
		/**
		* 一个开关的保存：同一时刻只允许一次（连点时后面的点击直接忽略），超过 1 秒才显示
		* 「进行中」，组件卸载后不再更新状态。
		*/
		function useSave(onSaved, path = "settings") {
			const [busy, setBusy] = (0, react.useState)(false);
			const saving = (0, react.useRef)(false);
			const mounted = useMounted();
			return [
				busy,
				(0, react.useCallback)(async (patch) => {
					if (saving.current) return void 0;
					saving.current = true;
					const timer = setTimeout(() => {
						if (mounted.current) setBusy(true);
					}, BUSY_DELAY_MS);
					const result = await postJson(path, patch);
					clearTimeout(timer);
					saving.current = false;
					if (!mounted.current) return void 0;
					setBusy(false);
					if (result.ok) onSaved();
					return result;
				}, [
					onSaved,
					mounted,
					path
				]),
				(0, react.useCallback)(() => saving.current, [])
			];
		}
		/** 下拉选择的保存：以最后一次选的为准，上一次还在保存时排队；失败弹回并提示。 */
		function useSelectSetting(serverValue, key, onSaved, showToast, onFailed) {
			const [shown, setShown] = (0, react.useState)();
			const [, save, isSaving] = useSave(onSaved);
			const queued = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => {
				if (shown !== void 0 && shown === serverValue && !isSaving() && queued.current === void 0) setShown(void 0);
			}, [
				serverValue,
				shown,
				isSaving
			]);
			const send = async (value) => {
				const result = await save({ [key]: value });
				const next = queued.current;
				if (next !== void 0) {
					queued.current = void 0;
					await send(next);
					return;
				}
				if (result !== void 0 && !result.ok) {
					setShown(void 0);
					if (onFailed?.(result) !== true) showToast({
						kind: "bad",
						text: failureText(result)
					});
				}
			};
			const change = (next) => {
				setShown(next);
				if (isSaving()) queued.current = next;
				else send(next);
			};
			return [shown ?? serverValue, change];
		}
		/** 开关。保存中用 aria-disabled 而不是原生 disabled，键盘焦点不会丢。 */
		function Switch({ checked, label, busy, onToggle }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "switch",
				role: "switch",
				"aria-checked": checked,
				"aria-label": label,
				"aria-busy": busy || void 0,
				"aria-disabled": busy || void 0,
				onClick: () => {
					if (!busy) onToggle(!checked);
				}
			});
		}
		function useGuardedSwitch(value, key, onChanged, showToast, inlineFor) {
			const [optimistic, setOptimistic] = (0, react.useState)();
			const [inlineError, setInlineError] = (0, react.useState)();
			const errorTimer = (0, react.useRef)(void 0);
			const mounted = useMounted();
			const [busy, save, isSaving] = useSave(onChanged);
			(0, react.useEffect)(() => setOptimistic(void 0), [value]);
			(0, react.useEffect)(() => () => clearTimeout(errorTimer.current), []);
			const toggle = (next) => {
				if (isSaving()) return;
				setOptimistic(next);
				save({ [key]: next }).then((result) => {
					if (result === void 0 || result.ok || !mounted.current) return;
					setOptimistic(void 0);
					const inline = inlineFor(result);
					if (inline === void 0) {
						showToast({
							kind: "bad",
							text: failureText(result)
						});
						return;
					}
					clearTimeout(errorTimer.current);
					setInlineError(inline);
					errorTimer.current = setTimeout(() => {
						if (mounted.current) setInlineError(void 0);
					}, INLINE_ERROR_MS);
				});
			};
			return {
				checked: optimistic ?? value,
				busy,
				inlineError,
				toggle
			};
		}
		/** 设置行的说明：常驻 aria-live 区，有提示时换成提示文字（红 / 绿），读屏软件会念出来。 */
		function RowDesc({ text, alert }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: `row-desc${alert ? ` ${alert.kind}` : ""}`,
				"aria-live": "polite",
				children: alert?.text ?? text
			});
		}
		const svg = {
			fill: "none",
			stroke: "currentColor",
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": true
		};
		const ChevronIcon = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			className: "chev",
			width: "8",
			height: "13",
			viewBox: "0 0 8 13",
			strokeWidth: "1.8",
			...svg,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m1.5 1.5 5 5-5 5" })
		});
		const PlusIcon = ({ size = 16 }) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			width: size,
			height: size,
			viewBox: "0 0 24 24",
			strokeWidth: "2",
			...svg,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 5v14M5 12h14" })
		});
		const EyeIcon = () => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			width: "16",
			height: "16",
			viewBox: "0 0 24 24",
			strokeWidth: "1.6",
			...svg,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "12",
				cy: "12",
				r: "3"
			})]
		});
		const XSmallIcon = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			width: "10",
			height: "10",
			viewBox: "0 0 24 24",
			strokeWidth: "3",
			...svg,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6 6l12 12M18 6 6 18" })
		});
		const BangSmallIcon = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			width: "10",
			height: "10",
			viewBox: "0 0 24 24",
			strokeWidth: "3",
			...svg,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 6v8M12 18h.01" })
		});
		const CheckSmallIcon = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			width: "11",
			height: "11",
			viewBox: "0 0 24 24",
			strokeWidth: "2.6",
			...svg,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m5 12 5 5 9-10" })
		});
		const DashSmallIcon = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			width: "10",
			height: "10",
			viewBox: "0 0 24 24",
			strokeWidth: "3",
			...svg,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M7 12h10" })
		});
		const Spinner = () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
			className: "spin",
			"aria-hidden": "true"
		});
		/** 「多久前」：刚刚 / N 分钟前 / N 小时前 / N 天前。 */
		function ago(ts, now = Date.now()) {
			const s = Math.max(0, Math.round((now - ts) / 1e3));
			if (s < 60) return zh.time.justNow;
			if (s < 3600) return zh.time.minutes(Math.floor(s / 60));
			if (s < 86400) return zh.time.hours(Math.floor(s / 3600));
			return zh.time.days(Math.floor(s / 86400));
		}
		/** 弹出面板：Esc 或点空白关闭（不会连带关掉 dsh 设置窗口），Tab 只在面板里转，关掉后焦点回到原按钮。 */
		function Sheet({ title, lead, role = "dialog", onClose, children, wide = false }) {
			const ref = (0, react.useRef)(null);
			const titleId = (0, react.useId)();
			const leadId = (0, react.useId)();
			const closeRef = (0, react.useRef)(onClose);
			closeRef.current = onClose;
			(0, react.useEffect)(() => {
				const opener = document.activeElement;
				(ref.current?.querySelector("[data-autofocus], input, button"))?.focus();
				const onEsc = (e) => {
					if (e.key !== "Escape") return;
					e.preventDefault();
					e.stopImmediatePropagation();
					closeRef.current();
				};
				document.addEventListener("keydown", onEsc, true);
				const observer = new MutationObserver(() => {
					if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus();
				});
				if (ref.current) observer.observe(ref.current, {
					childList: true,
					subtree: true
				});
				return () => {
					document.removeEventListener("keydown", onEsc, true);
					observer.disconnect();
					opener?.focus?.();
				};
			}, []);
			const onKeyDown = (e) => {
				if (e.key !== "Tab" || ref.current === null) return;
				const items = [...ref.current.querySelectorAll("button:not([tabindex=\"-1\"]), input:not([tabindex=\"-1\"]), select:not([tabindex=\"-1\"]), [tabindex=\"0\"]")].filter((el) => !el.hasAttribute("disabled"));
				if (items.length === 0) return;
				const first = items[0];
				const last = items[items.length - 1];
				if (e.shiftKey && document.activeElement === first) {
					e.preventDefault();
					last.focus();
				} else if (!e.shiftKey && document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "scrim",
				onMouseDown: (e) => {
					if (e.target === e.currentTarget) onClose();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref,
					className: `sheet${wide ? " wide" : ""}`,
					tabIndex: -1,
					role,
					"aria-modal": "true",
					"aria-labelledby": titleId,
					"aria-describedby": lead ? leadId : void 0,
					onKeyDown,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						id: titleId,
						children: title
					}), lead && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "lead",
						id: leadId,
						children: lead
					})] }), children]
				})
			});
		}
		//#endregion
		//#region src/client/devices-panel.tsx
		/** 设置页开着时多久刷新一次设备表（登录状态、多久前活跃）。 */
		const DEVICES_POLL_MS = 5e3;
		/** 和后端 isValidWhitelistValue 同一套规则：IPv4、IPv4/前缀、IPv6 单个地址。 */
		function checkValue(raw, taken) {
			const v = raw.trim();
			if (v === "") return { kind: "empty" };
			const kind = whitelistValueKind(v);
			if (kind !== "invalid" && taken.includes(v)) return { kind: "duplicate" };
			return { kind };
		}
		function valueMessage(check) {
			switch (check.kind) {
				case "empty": return {
					text: zh.dev.valueHint,
					bad: false
				};
				case "single": return {
					text: zh.dev.valueSingle,
					bad: false
				};
				case "range": return {
					text: zh.dev.valueRange,
					bad: false
				};
				case "duplicate": return {
					text: zh.dev.valueDuplicate,
					bad: true
				};
				default: return {
					text: zh.dev.valueInvalid,
					bad: true
				};
			}
		}
		const label = (e) => e.name || e.value;
		/** 一行的状态句：已登录 · 浏览器 · 多久前活跃 / N 个浏览器已登录 / 免密码 / 未登录。 */
		function statusLine(entry, bypass) {
			const n = entry.sessions.length;
			if (n === 1) {
				const s = entry.sessions[0];
				return {
					dot: "ok",
					text: `${zh.dev.loggedIn} · ${s.browser} · ${zh.dev.active(ago(s.lastSeenAt))}`
				};
			}
			if (n > 1) {
				const browsers = [...new Set(entry.sessions.map((s) => s.browser))].join("、");
				return {
					dot: "ok",
					text: `${zh.dev.manyLoggedIn(n)} · ${browsers}`
				};
			}
			if (bypass) return {
				dot: entry.lastSeenAt !== null ? "ok" : "idle",
				text: entry.lastSeenAt !== null ? `${zh.dev.bypass} · ${zh.dev.active(ago(entry.lastSeenAt))}` : `${zh.dev.bypass} · ${zh.dev.neverSeen}`
			};
			return {
				dot: "idle",
				text: zh.dev.notLoggedIn
			};
		}
		function DevicesPanel({ local, showToast, onChanged, active }) {
			const [view, setView] = (0, react.useState)();
			const [loadFailed, setLoadFailed] = (0, react.useState)(false);
			/** 退出登录正在发：连点不重复发。 */
			const kicking = (0, react.useRef)(false);
			const [openId, setOpenId] = (0, react.useState)();
			const [adding, setAdding] = (0, react.useState)(false);
			const mounted = useMounted();
			const seq = (0, react.useRef)(0);
			const load = (0, react.useCallback)(async () => {
				if (!local) return;
				const n = ++seq.current;
				const v = await getJson("devices");
				if (!mounted.current || n !== seq.current) return;
				if (v === void 0) {
					setLoadFailed(true);
					return;
				}
				setLoadFailed(false);
				setView(v);
			}, [local, mounted]);
			(0, react.useEffect)(() => {
				if (!active) return;
				load();
				const timer = setInterval(() => void load(), DEVICES_POLL_MS);
				return () => clearInterval(timer);
			}, [load, active]);
			const refresh = (0, react.useCallback)(() => {
				load();
				onChanged();
			}, [load, onChanged]);
			/** 打开「添加设备」时重读一次：刚被拒的设备马上出现在「最近被拒绝的地址」里，不等下一轮刷新。 */
			const openAdd = () => {
				setAdding(true);
				load();
			};
			const [, saveList] = useSave(refresh);
			/** 写回整张允许列表；失败给提示。 */
			const writeList = async (list) => {
				const result = await saveList({ whitelist: list });
				if (result === void 0) return false;
				if (!result.ok) showToast({
					kind: "bad",
					text: failureText(result)
				});
				return result.ok;
			};
			const signOut = async (session, who) => {
				if (kicking.current) return;
				kicking.current = true;
				const result = await postJson("kick", { sid: session.sid });
				kicking.current = false;
				if (!mounted.current) return;
				if (result.ok) {
					showToast({
						kind: "ok",
						text: zh.dev.signedOut(zh.dev.whoBrowser(who, session.browser))
					});
					refresh();
				} else showToast({
					kind: "bad",
					text: failureText(result)
				});
			};
			const signOutAll = async () => {
				if (kicking.current) return;
				kicking.current = true;
				const result = await postJson("kick-all", {});
				kicking.current = false;
				if (!mounted.current) return;
				if (result.ok) {
					showToast({
						kind: "ok",
						text: zh.dev.signedOutAll
					});
					refresh();
				} else showToast({
					kind: "bad",
					text: failureText(result)
				});
			};
			const [emptyMode, setEmptyMode] = useSelectSetting(view?.emptyMode ?? "deny-all", "whitelistEmptyMode", refresh, showToast);
			if (!local) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, {});
			if (view === void 0) return loadFailed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "group-wrap",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "group",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "empty",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: zh.dev.loadFailed }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "btn sm",
							onClick: () => void load(),
							children: zh.dev.retry
						})]
					})
				})
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, {});
			const entries = view.entries;
			const list = entries.map(({ id, name, value }) => ({
				id,
				name,
				value
			}));
			const anyLoggedIn = entries.some((e) => e.sessions.length > 0) || view.others.length > 0;
			const open = entries.find((e) => e.id === openId);
			const remove = async (entry) => {
				setOpenId(void 0);
				const index = list.findIndex((e) => e.id === entry.id);
				const next = list.filter((e) => e.id !== entry.id);
				if (!await writeList(next)) return;
				requestAnimationFrame(() => document.querySelector(".dla #dla-panel-dev .row.add, .dla #dla-panel-dev .empty .btn")?.focus());
				showToast({
					kind: "plain",
					text: zh.dev.removed(label(entry)),
					undo: () => {
						(async () => {
							const fresh = await getJson("devices");
							if (!mounted.current) return;
							if (fresh === void 0) {
								showToast({
									kind: "bad",
									text: zh.dev.undoFailed
								});
								return;
							}
							const current = fresh.entries.map(({ id, name, value }) => ({
								id,
								name,
								value
							}));
							if (current.some((e) => e.value === entry.value)) return;
							const restored = [...current];
							restored.splice(Math.min(index, restored.length), 0, {
								id: entry.id,
								name: entry.name,
								value: entry.value
							});
							const result = await saveList({ whitelist: restored });
							if (!mounted.current) return;
							if (result === void 0) showToast({
								kind: "bad",
								text: zh.dev.undoFailed
							});
							else if (!result.ok) showToast({
								kind: "bad",
								text: failureText(result)
							});
						})();
					}
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "group-wrap",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
							className: "group-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								zh.dev.groupTitle,
								" ",
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "count",
									children: entries.length
								})
							] }), entries.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "btn plain sm",
								disabled: !anyLoggedIn,
								onClick: () => void signOutAll(),
								children: zh.dev.signOutAll
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "group",
							children: entries.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "empty",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: zh.dev.emptyText }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "btn primary sm",
									onClick: openAdd,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlusIcon, { size: 12 }), zh.dev.addShort]
								})]
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [entries.map((entry) => {
								const line = statusLine(entry, view.bypassPassword);
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "row",
									onClick: () => setOpenId(entry.id),
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "row-main",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "row-label",
											children: label(entry)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											className: "row-desc inline",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "mono",
													children: entry.value
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "·" }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `dot${line.dot === "ok" ? " ok" : ""}` }),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: line.text })
											]
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronIcon, {})]
								}, entry.id);
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "row add",
								onClick: openAdd,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "plus",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlusIcon, {})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "row-main",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "row-label",
										children: zh.dev.add
									})
								})]
							})] })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "group-foot",
							children: entries.length === 0 ? zh.dev.emptyFoot(zh.dev.emptyMode[view.emptyMode]) : zh.dev.foot
						})
					]
				}),
				view.others.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "group-wrap",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: "group-head",
							children: zh.dev.othersTitle
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "group",
							children: view.others.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "row-main",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: "row-label",
										children: [
											s.browser,
											" · ",
											s.os
										]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
										className: "row-desc inline",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "mono",
												children: s.ip
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "·" }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dot ok" }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: zh.dev.active(ago(s.lastSeenAt)) })
										]
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "btn sm",
									onClick: () => void signOut(s, s.ip),
									children: zh.dev.signOut
								})]
							}, s.sid))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "group-foot",
							children: zh.dev.othersDesc
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "group-wrap",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "group",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "row-main",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "row-label",
									children: zh.dev.emptyModeLabel
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: "select",
								"aria-label": zh.dev.emptyModeLabel,
								value: emptyMode,
								onChange: (e) => setEmptyMode(e.target.value),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "deny-all",
									children: zh.dev.emptyMode["deny-all"]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "private-only",
									children: zh.dev.emptyMode["private-only"]
								})]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BypassRow, {
							value: view.bypassPassword,
							onChanged: refresh,
							showToast
						})]
					})
				}),
				open !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DeviceSheet, {
					entry: open,
					bypass: view.bypassPassword,
					taken: list.filter((e) => e.id !== open.id).map((e) => e.value),
					onClose: () => setOpenId(void 0),
					onSave: async (name, value) => {
						if (await writeList(list.map((e) => e.id === open.id ? {
							...e,
							name: name.trim(),
							value: value.trim()
						} : e))) setOpenId(void 0);
					},
					onRemove: () => void remove(open),
					onSignOut: (s) => void signOut(s, label(open))
				}),
				adding && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AddSheet, {
					bypass: view.bypassPassword,
					taken: list.map((e) => e.value),
					recent: view.recentDenied,
					onClose: () => setAdding(false),
					onAdd: async (name, value) => {
						const entry = {
							id: `wl-${Date.now().toString(36)}`,
							name: name.trim(),
							value: value.trim()
						};
						if (await writeList([...list, entry])) {
							setAdding(false);
							showToast({
								kind: "ok",
								text: zh.dev.added(label(entry))
							});
						}
					}
				})
			] });
		}
		function BypassRow({ value, onChanged, showToast }) {
			const [optimistic, setOptimistic] = (0, react.useState)();
			const [busy, save, isSaving] = useSave(onChanged);
			(0, react.useEffect)(() => setOptimistic(void 0), [value]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "row-main",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "row-label",
						children: zh.dev.bypassLabel
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RowDesc, { text: zh.dev.bypassDesc })]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
					checked: optimistic ?? value,
					label: zh.dev.bypassLabel,
					busy,
					onToggle: (next) => {
						if (isSaving()) return;
						setOptimistic(next);
						save({ whitelistBypassPassword: next }).then((r) => {
							if (r === void 0 || r.ok) return;
							setOptimistic(void 0);
							showToast({
								kind: "bad",
								text: failureText(r)
							});
						});
					}
				})]
			});
		}
		function DeviceSheet({ entry, bypass, taken, onClose, onSave, onRemove, onSignOut }) {
			const [name, setName] = (0, react.useState)(entry.name);
			const [value, setValue] = (0, react.useState)(entry.value);
			const check = checkValue(value, taken);
			const valid = check.kind === "single" || check.kind === "range";
			const changed = name.trim() !== entry.name || value.trim() !== entry.value;
			const msg = valueMessage(check);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Sheet, {
				title: label(entry),
				lead: zh.dev.detailLead,
				onClose,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "f",
						children: [zh.dev.nameLabel, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "field",
							value: name,
							placeholder: zh.dev.namePlaceholder,
							onChange: (e) => setName(e.target.value),
							"data-autofocus": ""
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "f",
						children: [zh.dev.valueLabel, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "field mono",
							value,
							"aria-invalid": msg.bad || void 0,
							onChange: (e) => setValue(e.target.value)
						})]
					}),
					(msg.bad || value.trim() !== entry.value) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: `msg${msg.bad ? " bad" : ""}`,
						role: "status",
						children: msg.text
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "group-wrap",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "sub",
								children: zh.dev.loginState
							}),
							entry.sessions.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "group",
								children: entry.sessions.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "row",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "row-main",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
											className: "row-label",
											children: [
												s.browser,
												" · ",
												s.os
											]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
											className: "row-desc inline",
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dot ok" }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
												zh.dev.loggedIn,
												" · ",
												zh.dev.active(ago(s.lastSeenAt)),
												" ·",
												" ",
												zh.dev.loginSince(zh.dev.date(new Date(s.createdAt)))
											] })]
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "btn sm",
										onClick: () => onSignOut(s),
										children: zh.dev.signOut
									})]
								}, s.sid))
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "msg",
								children: entry.sessions.length > 0 ? zh.dev.signOutNote : bypass ? zh.dev.bypassNote : zh.dev.noSessions
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sheet-actions",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "btn danger left",
								onClick: onRemove,
								children: zh.dev.remove
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "btn",
								onClick: onClose,
								children: zh.dev.cancel
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "btn primary",
								disabled: changed && !valid,
								onClick: () => changed ? void onSave(name, value) : onClose(),
								children: zh.dev.done
							})
						]
					})
				]
			});
		}
		function AddSheet({ bypass, taken, recent, onClose, onAdd }) {
			const [name, setName] = (0, react.useState)("");
			const [value, setValue] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const check = checkValue(value, taken);
			const valid = check.kind === "single" || check.kind === "range";
			const msg = valueMessage(check);
			const usable = recent.filter((d) => !taken.includes(d.ip));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Sheet, {
				title: zh.dev.addTitle,
				lead: bypass ? zh.dev.addLeadBypass : zh.dev.addLead,
				onClose,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "f",
						children: [zh.dev.nameLabel, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "field",
							value: name,
							placeholder: zh.dev.namePlaceholder,
							onChange: (e) => setName(e.target.value),
							"data-autofocus": ""
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "f",
						children: [zh.dev.valueLabel, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: "field mono",
							value,
							placeholder: zh.dev.valuePlaceholder,
							"aria-invalid": msg.bad || void 0,
							onChange: (e) => setValue(e.target.value),
							onKeyDown: (e) => {
								if (e.key === "Enter" && valid && !busy) {
									setBusy(true);
									onAdd(name, value).finally(() => setBusy(false));
								}
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: `msg${msg.bad ? " bad" : ""}`,
						role: "status",
						children: msg.text
					}),
					usable.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "group-wrap",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "sub",
							children: zh.dev.recentTitle
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "chips",
							children: usable.map((d) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "chip",
								"aria-pressed": value.trim() === d.ip,
								onClick: () => setValue(d.ip),
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "mono",
									children: d.ip
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "t3",
									children: zh.dev.recentMeta(d.count, ago(d.lastAt))
								})]
							}, d.ip))
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "sheet-actions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "btn",
							onClick: onClose,
							children: zh.dev.cancel
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "btn primary",
							disabled: !valid || busy,
							onClick: () => {
								setBusy(true);
								onAdd(name, value).finally(() => setBusy(false));
							},
							children: zh.dev.addConfirm
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/security-panel.tsx
		const RECENT = 3;
		/** 访问记录多久刷新一次。 */
		const LOG_POLL_MS = 5e3;
		const FILTERS = [
			"all",
			"deny",
			"login"
		];
		const DENY_KINDS = /* @__PURE__ */ new Set([
			"whitelist-deny",
			"unauthorized",
			"cross-site"
		]);
		const LOGIN_KINDS = /* @__PURE__ */ new Set([
			"login",
			"login-failed",
			"logout",
			"kick"
		]);
		function kindLabel(e) {
			return zh.sec.kind[e.kind] ?? e.kind;
		}
		function KindIcon({ e }) {
			if (DENY_KINDS.has(e.kind) || e.kind === "selfcheck-fail") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "chk bad",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(XSmallIcon, {})
			});
			if (e.kind === "login-failed") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "chk warn",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BangSmallIcon, {})
			});
			if (e.kind === "login" || e.kind === "update") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "chk ok",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckSmallIcon, {})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: "chk idle",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DashSmallIcon, {})
			});
		}
		const pad = (n) => String(n).padStart(2, "0");
		/** 记录时间：今天写「10:42」，昨天写「昨天 10:42」，更早写「9 月 30 日 10:42」；full 时今天也写「今天」。 */
		function when(ts, full, now = /* @__PURE__ */ new Date()) {
			const d = new Date(ts);
			const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
			const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
			const diff = Math.round((day(now) - day(d)) / 864e5);
			if (diff === 0) return full ? `${zh.sec.today} ${hm}` : hm;
			if (diff === 1) return `${zh.sec.yesterday} ${hm}`;
			return `${zh.dev.date(d)} ${hm}`;
		}
		function LogRow({ e, full }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "row",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(KindIcon, { e }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "row-main",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "row-label",
							children: kindLabel(e)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "row-desc inline",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "mono",
									children: e.ip
								}),
								e.name && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["· ", e.name] }),
								(e.count ?? 1) > 1 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: ["· ", zh.sec.times(e.count ?? 1)] })
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "row-value mono",
						children: when(e.ts, full)
					})
				]
			});
		}
		function SecurityPanel({ status, onChanged, showToast, active }) {
			const [logs, setLogs] = (0, react.useState)([]);
			const [logsFailed, setLogsFailed] = (0, react.useState)(false);
			const [showAll, setShowAll] = (0, react.useState)(false);
			const [clearing, setClearing] = (0, react.useState)(false);
			const mounted = useMounted();
			const seq = (0, react.useRef)(0);
			const loadLogs = (0, react.useCallback)(async () => {
				const n = ++seq.current;
				const data = await getJson("logs");
				if (!mounted.current || n !== seq.current) return;
				setLogsFailed(data === void 0);
				if (data === void 0) return;
				setLogs([...data.logs].sort((a, b) => b.ts - a.ts));
			}, [mounted]);
			(0, react.useEffect)(() => {
				if (!active) return;
				loadLogs();
				const timer = setInterval(() => void loadLogs(), LOG_POLL_MS);
				return () => clearInterval(timer);
			}, [loadLogs, active]);
			const refresh = (0, react.useCallback)(() => {
				onChanged();
				loadLogs();
			}, [onChanged, loadLogs]);
			const [keepDays, setKeepDays] = useSelectSetting(status.sessionMaxAgeDays, "sessionMaxAgeDays", refresh, showToast);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "group-wrap",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: "group-head",
						children: zh.sec.groupPassword
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "group",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PasswordRows, {
								status,
								onChanged: refresh,
								showToast
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "row-main",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "row-label",
										children: zh.sec.keepLabel
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RowDesc, { text: zh.sec.keepDesc })]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									className: "select",
									"aria-label": zh.sec.keepLabel,
									value: keepDays,
									onChange: (e) => setKeepDays(Number(e.target.value)),
									children: SESSION_MAX_AGE_CHOICES.map((d) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: d,
										children: zh.sec.days(d)
									}, d))
								})]
							}),
							status.registered && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "row danger",
								onClick: () => setClearing(true),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "row-main",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "row-label",
										children: zh.sec.clear
									})
								})
							})
						]
					})]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "group-wrap",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
							className: "group-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: zh.sec.groupLog }), logs.length > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "btn plain sm",
								onClick: () => setShowAll(true),
								children: zh.sec.logAll(logs.length)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "group",
							children: logs.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "empty",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: logsFailed ? zh.sec.logLoadFailed : zh.sec.logEmpty })
							}) : logs.slice(0, RECENT).map((e, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LogRow, {
								e,
								full: false
							}, `${e.ts}-${i}`))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "group-foot",
							children: zh.sec.logFoot
						})
					]
				}),
				showAll && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LogSheet, {
					logs,
					onClose: () => setShowAll(false)
				}),
				clearing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ClearSheet, {
					reopenLocal: !status.allowLoopback,
					onClose: () => setClearing(false),
					onCleared: () => {
						setClearing(false);
						showToast({
							kind: "ok",
							text: zh.sec.cleared
						});
						refresh();
					},
					showToast
				})
			] });
		}
		function PasswordRows({ status, onChanged, showToast }) {
			const first = !status.registered;
			const [editing, setEditing] = (0, react.useState)(first);
			const [value, setValue] = (0, react.useState)("");
			const [visible, setVisible] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const inputRef = (0, react.useRef)(null);
			const mounted = useMounted();
			(0, react.useEffect)(() => {
				setEditing(first);
				setValue("");
			}, [first]);
			(0, react.useEffect)(() => {
				if (editing && !first) inputRef.current?.focus();
			}, [editing, first]);
			const left = 12 - value.length;
			const hintText = value.length === 0 ? first ? zh.sec.hintFirst : zh.sec.hint : left > 0 ? zh.sec.short(left) : zh.sec.enough;
			const submit = async () => {
				if (left > 0 || busy) return;
				setBusy(true);
				const result = await postJson("password", { password: value });
				if (!mounted.current) return;
				setBusy(false);
				if (result.ok) {
					setValue("");
					setVisible(false);
					setEditing(false);
					showToast({
						kind: "ok",
						text: first ? zh.sec.setDone : zh.sec.changed
					});
					onChanged();
					return;
				}
				if (result.kind === "rejected" && result.code === ERROR_CODES.tooShort) return;
				showToast({
					kind: "bad",
					text: failureText(result)
				});
			};
			const stateLine = status.registered ? status.passwordSetAt !== null ? zh.sec.passwordSet(ago(status.passwordSetAt)) : zh.sec.passwordSetNoTime : zh.sec.passwordUnset;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "row-main",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "row-label",
						children: zh.sec.passwordLabel
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "row-desc inline",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: `dot${status.registered ? " ok" : ""}` }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: stateLine })]
					})]
				}), !first && !editing && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "btn sm",
					"aria-expanded": false,
					onClick: () => setEditing(true),
					children: zh.sec.change
				})]
			}), editing && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "row-expand",
				id: "dla-pw-edit",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "line",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "reveal",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								ref: inputRef,
								className: "field",
								type: visible ? "text" : "password",
								placeholder: zh.sec.newPassword,
								autoComplete: "new-password",
								"aria-label": zh.sec.newPassword,
								"aria-describedby": "dla-pw-msg",
								value,
								onChange: (e) => setValue(e.target.value),
								onKeyDown: (e) => {
									if (e.key === "Enter") submit();
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "icon-btn eye",
								"aria-label": zh.sec.showPassword,
								"aria-pressed": visible,
								onClick: () => setVisible((v) => !v),
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EyeIcon, {})
							})]
						}),
						!first && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "btn sm",
							onClick: () => {
								setEditing(false);
								setValue("");
							},
							children: zh.sec.cancel
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "btn primary sm",
							disabled: left > 0,
							"aria-busy": busy || void 0,
							onClick: () => void submit(),
							children: [busy && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}), first ? zh.sec.setFirst : zh.sec.save]
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
					className: `msg${value.length > 0 && left <= 0 ? " ok" : ""}`,
					id: "dla-pw-msg",
					"aria-live": "polite",
					children: [value.length > 0 && left <= 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						"aria-hidden": "true",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckSmallIcon, {}), " "]
					}), hintText]
				})]
			})] });
		}
		function ClearSheet({ reopenLocal, onClose, onCleared, showToast }) {
			const [busy, setBusy] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Sheet, {
				title: zh.sec.clearTitle,
				lead: reopenLocal ? `${zh.sec.clearBody}${zh.sec.clearReopenLocal}` : zh.sec.clearBody,
				role: "alertdialog",
				onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "sheet-actions",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "btn",
						onClick: onClose,
						"data-autofocus": "",
						children: zh.sec.cancel
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "btn danger-solid",
						disabled: busy,
						onClick: () => {
							setBusy(true);
							postJson("password/clear", {}).then((r) => {
								setBusy(false);
								if (r.ok) onCleared();
								else showToast({
									kind: "bad",
									text: failureText(r)
								});
							});
						},
						children: zh.sec.clearConfirm
					})]
				})
			});
		}
		function LogSheet({ logs, onClose }) {
			const [filter, setFilter] = (0, react.useState)("all");
			const shown = logs.filter((e) => filter === "all" || (filter === "deny" ? DENY_KINDS.has(e.kind) : LOGIN_KINDS.has(e.kind)));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Sheet, {
				title: zh.sec.logTitle,
				onClose,
				wide: true,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "seg",
						role: "tablist",
						"aria-label": zh.sec.filterAria,
						children: FILTERS.map((f) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							id: `dla-log-filter-${f}`,
							"aria-selected": filter === f,
							tabIndex: filter === f ? 0 : -1,
							onClick: () => setFilter(f),
							onKeyDown: (e) => {
								const i = FILTERS.indexOf(filter);
								const next = e.key === "ArrowRight" ? FILTERS[(i + 1) % FILTERS.length] : e.key === "ArrowLeft" ? FILTERS[(i - 1 + FILTERS.length) % FILTERS.length] : e.key === "Home" ? FILTERS[0] : e.key === "End" ? FILTERS[FILTERS.length - 1] : void 0;
								if (next === void 0) return;
								e.preventDefault();
								setFilter(next);
								document.getElementById(`dla-log-filter-${next}`)?.focus();
							},
							children: zh.sec.filter[f]
						}, f))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "group log-list",
						children: shown.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "empty",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: zh.sec.logEmpty })
						}) : shown.map((e, i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LogRow, {
							e,
							full: true
						}, `${e.ts}-${i}`))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "sheet-actions",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "btn primary",
							onClick: onClose,
							children: zh.sec.done
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/about-panel.tsx
		function checkDesc(c) {
			const s = zh.about.check;
			switch (c.id) {
				case "webServer": return c.state === "ok" ? s.webServer.ok(c.port ?? 0) : s.webServer.bad;
				case "signing": return c.state === "ok" ? s.signing.ok : s.signing.bad;
				case "sessionKey": return c.state === "ok" ? s.sessionKey.ok : s.sessionKey.bad;
				case "dshVersion":
					if (c.version == null) return s.dshVersion.unknown;
					return c.state === "ok" ? s.dshVersion.ok(c.version) : s.dshVersion.warn(c.version);
				case "password": return c.state === "ok" ? s.password.ok : s.password.idle;
			}
		}
		function CheckIcon({ state }) {
			const icon = state === "ok" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckSmallIcon, {}) : state === "bad" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(XSmallIcon, {}) : state === "warn" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BangSmallIcon, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DashSmallIcon, {});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: `chk ${state}`,
				role: "img",
				"aria-label": zh.about.stateLabel[state],
				children: icon
			});
		}
		/** 没通过（含版本超范围）/ 通过 / 中性各几项。 */
		function tally(checks) {
			const n = (f) => checks.filter(f).length;
			return {
				failed: n((c) => c.state === "bad" || c.state === "warn"),
				ok: n((c) => c.state === "ok"),
				idle: n((c) => c.state === "idle")
			};
		}
		function CheckRow({ c }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckIcon, { state: c.state }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "row-main",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "row-label",
						children: zh.about.check[c.id].label
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: `row-desc${c.state === "bad" ? " bad" : ""}`,
						children: checkDesc(c)
					})]
				})]
			});
		}
		/** 插件这一行：说明 + 按钮随更新状态变。 */
		function UpdateRow({ update, onCheck, onUpdate }) {
			const u = zh.about.update;
			let desc;
			let action = null;
			switch (update.state) {
				case "idle":
				case "checking":
					desc = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}), u.checking] });
					break;
				case "latest":
					desc = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dot ok" }), u.latest(update.current)] });
					action = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "btn sm",
						onClick: onCheck,
						children: u.check
					});
					break;
				case "unavailable":
					desc = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: u.unavailable(update.current) });
					action = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "btn sm",
						onClick: onCheck,
						children: u.check
					});
					break;
				case "available": {
					const [head, tail] = u.available(update.current, update.latest ?? "");
					desc = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [head, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "acc-text",
						children: tail
					})] });
					action = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "btn primary sm",
						onClick: onUpdate,
						children: u.to(update.latest ?? "")
					});
					break;
				}
				case "running":
					desc = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: u.running });
					action = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "btn primary sm",
						"aria-busy": "true",
						disabled: true,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}), u.busy]
					});
					break;
				case "done":
					desc = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dot ok" }), u.done(update.latest ?? "")] });
					break;
				case "failed":
					desc = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						u.failed[update.reason ?? "failed"],
						" ",
						update.command !== void 0 ? u.manual(update.command) : u.manualDesktop(update.latest ?? "")
					] });
					action = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "btn sm",
						onClick: onUpdate,
						children: u.retry
					});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "row-main",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "row-label",
						children: zh.about.plugin
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: `row-desc inline${update.state === "failed" ? " bad" : ""}`,
						"aria-live": "polite",
						children: desc
					})]
				}), action]
			});
		}
		function AboutPanel({ status, active, onChanged, showToast }) {
			const local = status.local;
			const [update, setUpdate] = (0, react.useState)(status.update);
			const [rechecking, setRechecking] = (0, react.useState)(false);
			const mounted = useMounted();
			/** 查版本和点更新各用各的序号：更新进行中切走再切回来查一次，不能把更新的结果作废。 */
			const checkSeq = (0, react.useRef)(0);
			/** 点更新的请求没送到（或中途断了）：服务端可能其实在更新，之后以轮询到的结果为准。 */
			const postLost = (0, react.useRef)(false);
			const serverUpdate = status.update;
			(0, react.useEffect)(() => {
				if (serverUpdate === void 0) return;
				if (serverUpdate.state === "done" || serverUpdate.state === "failed") setUpdate((u) => {
					if (u?.state === "running") return serverUpdate;
					if (postLost.current && u?.state === "failed") {
						postLost.current = false;
						return serverUpdate;
					}
					return u;
				});
			}, [serverUpdate]);
			const check = async () => {
				const n = ++checkSeq.current;
				setUpdate({
					state: "checking",
					current: status.version
				});
				const next = await getJson("update");
				if (!mounted.current || n !== checkSeq.current) return;
				setUpdate(next ?? {
					state: "unavailable",
					current: status.version
				});
				onChanged();
			};
			(0, react.useEffect)(() => {
				if (active && local) check();
			}, [active, local]);
			const runUpdate = async () => {
				checkSeq.current += 1;
				setUpdate((u) => ({
					...u ?? { current: status.version },
					state: "running"
				}));
				postLost.current = false;
				const result = await postJson("update", {});
				if (!mounted.current) return;
				if (result.ok) setUpdate(result.data);
				else {
					postLost.current = result.kind === "network";
					setUpdate((u) => ({
						...u ?? { current: status.version },
						state: "failed",
						reason: result.kind === "network" ? "network" : "failed"
					}));
				}
				onChanged();
			};
			const recheck = async () => {
				if (rechecking) return;
				setRechecking(true);
				const result = await postJson("selfcheck", {});
				if (!mounted.current) return;
				setRechecking(false);
				onChanged();
				if (!result.ok) {
					showToast({
						kind: "bad",
						text: failureText(result)
					});
					return;
				}
				const checks = result.data.checks;
				const { failed, ok, idle } = tally(checks);
				showToast(failed > 0 ? {
					kind: "bad",
					text: zh.about.toastFailed(failed)
				} : {
					kind: "ok",
					text: idle > 0 ? zh.about.toastPassedUnset(ok) : zh.about.toastPassed(ok)
				});
			};
			const checks = status.checks;
			const { failed, ok, idle } = tally(checks);
			const versionCheck = checks.find((c) => c.id === "dshVersion");
			const summary = failed > 0 ? zh.about.someFailed(failed) : idle > 0 ? zh.about.passedSomeUnset(ok, idle) : zh.about.allPassed(ok);
			const count = status.checkedAt === null ? zh.about.pending : `${summary} · ${ago(status.checkedAt)}`;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "group-wrap",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
					className: "group-head",
					children: zh.about.groupVersion
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "group",
					children: [
						local ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UpdateRow, {
							update: update ?? {
								state: "checking",
								current: status.version
							},
							onCheck: () => void check(),
							onUpdate: () => void runUpdate()
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "row-main",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "row-label",
									children: zh.about.plugin
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "row-value mono",
								children: status.version
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "row-main",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "row-label",
									children: zh.about.dsh
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "row-value",
								children: status.dshVersion === null ? zh.about.unknownVersion : versionCheck?.state === "warn" ? zh.about.dshOutOfRange(status.dshVersion) : zh.about.dshInRange(status.dshVersion)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "row-main",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "row-label",
									children: zh.about.runtime
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "row-value",
								children: [
									zh.about.edition[status.edition],
									" · ",
									zh.about.port(status.port)
								]
							})]
						})
					]
				})]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "group-wrap",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
						className: "group-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							zh.about.groupChecks,
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "count",
								children: count
							})
						] }), local && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "btn plain sm",
							"aria-busy": rechecking || void 0,
							disabled: rechecking,
							onClick: () => void recheck(),
							children: [rechecking && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Spinner, {}), rechecking ? zh.about.rechecking : zh.about.recheck]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "group",
						children: checks.map((c) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckRow, { c }, c.id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "group-foot",
						children: zh.about.checksFoot
					})
				]
			})] });
		}
		//#endregion
		//#region src/client/lan-address.ts
		/**
		* 没选网卡时，挑一个别的设备最可能连得上的地址来显示：
		* 内网地址优先，真实网卡加分，虚拟网卡（WSL、Docker、虚拟机、代理工具等）排最后。
		*/
		const VIRTUAL = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|vmnet|docker|^br-|bridge|^utun|^tun|^tap|Npcap|Loopback/i;
		const PHYSICAL = /^(en|eth|wlan|wl)\d|^Wi-?Fi|^WLAN|^Ethernet|以太网|无线/i;
		function isPrivate(a) {
			const [x = 0, y = 0] = a.split(".").map(Number);
			return x === 10 || x === 192 && y === 168 || x === 172 && y >= 16 && y <= 31;
		}
		/** 100.64.0.0/10：Tailscale 这类异地组网分的地址。 */
		function isOverlay(a) {
			const [x = 0, y = 0] = a.split(".").map(Number);
			return x === 100 && y >= 64 && y <= 127;
		}
		function score(nic) {
			let s = 0;
			if (isPrivate(nic.address)) s += 4;
			else if (isOverlay(nic.address)) s += 2;
			if (PHYSICAL.test(nic.name)) s += 2;
			if (VIRTUAL.test(nic.name)) s -= 8;
			return s;
		}
		function pickLanAddress(ips) {
			let best;
			for (const nic of ips) if (best === void 0 || score(nic) > score(best)) best = nic;
			return best?.address;
		}
		//#endregion
		//#region src/client/styles.ts
		const css = `
.dla {
  --bg: transparent;
  --group: #F2F2F7;
  --hover: rgba(0, 0, 0, 0.04);
  --press: rgba(0, 0, 0, 0.08);
  --fill: rgba(118, 118, 128, 0.12);
  --fill-hover: rgba(118, 118, 128, 0.18);
  --fill-press: rgba(118, 118, 128, 0.26);
  --sep: rgba(60, 60, 67, 0.18);
  --text: #1D1D1F;
  --t2: #3C3C43;
  --t3: #6E6E73;
  --acc: #007AFF;
  --acc-strong: #0071E3;
  --acc-strong-hover: #006EDB;
  --acc-strong-press: #0062C4;
  --acc-text: #0066CC;
  --acc-soft: rgba(0, 122, 255, 0.12);
  --focus: rgba(0, 122, 255, 0.40);
  --ok-dot: #34C759;
  --ok: #1E7A34;
  --warn: #C93400;
  --warn-soft: rgba(255, 149, 0, 0.15);
  --chevron: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%236E6E73' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
  --bad: #D70015;
  --bad-dot: #FF3B30;
  --idle-dot: #8E8E93;
  --switch-off: rgba(120, 120, 128, 0.20);
  --seg-on: #FFFFFF;
  --toast-bg: #1D1D1F;
  --toast-fg: #FFFFFF;
  --sheet-bg: #FFFFFF;
  --scrim: rgba(0, 0, 0, 0.28);
  --bad-soft: rgba(255, 59, 48, 0.12);
  --warn-dot: #FF9500;
  --shadow-knob: 0 0 0 0.5px rgba(0, 0, 0, 0.04), 0 2px 4px rgba(0, 0, 0, 0.18);
  --shadow-seg: 0 0 0 0.5px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.10);
  --shadow-pop: 0 0 0 0.5px rgba(0, 0, 0, 0.12), 0 20px 50px rgba(0, 0, 0, 0.18);
  --mono: "SF Mono", ui-monospace, Menlo, Consolas, monospace;
  --dur: 220ms; --dur-press: 100ms; --spring: cubic-bezier(0.25, 1, 0.5, 1);
  display: flex; flex-direction: column; gap: 24px;
  width: 100%; color: var(--text);
  font: 14px/20px -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  /* dsh 页面打开了中英文自动加空格（text-autospace: normal），会把「局域网web访问」排成「局域网 web 访问」、
     行也跟着变长；设计稿是不加的，插件区域里关掉。 */
  text-autospace: no-autospace;
}
body[data-ds-dark-theme] .dla {
  --group: #3A3A3C;
  --hover: rgba(255, 255, 255, 0.05);
  --press: rgba(255, 255, 255, 0.10);
  --fill: rgba(118, 118, 128, 0.24);
  --fill-hover: rgba(118, 118, 128, 0.32);
  --fill-press: rgba(118, 118, 128, 0.44);
  --sep: rgba(84, 84, 88, 0.65);
  --text: #F5F5F7; --t2: #EBEBF5; --t3: #AEAEB2;
  --acc: #0A84FF; --acc-text: #6CB4FF;
  --acc-soft: rgba(10, 132, 255, 0.22); --focus: rgba(10, 132, 255, 0.50);
  --ok-dot: #30D158; --ok: #30D158; --warn: #FFB340; --warn-soft: rgba(255, 159, 10, 0.18);
  --chevron: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23AEAEB2' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>");
  --bad: #FF8A80; --bad-dot: #FF453A; --idle-dot: #636366;
  --switch-off: rgba(120, 120, 128, 0.36); --seg-on: #636366;
  --toast-bg: #F5F5F7; --toast-fg: #1D1D1F;
  --sheet-bg: #2C2C2E; --scrim: rgba(0, 0, 0, 0.5); --bad-soft: rgba(255, 69, 58, 0.18); --warn-dot: #FF9F0A;
  --shadow-knob: 0 2px 4px rgba(0, 0, 0, 0.4);
  --shadow-seg: 0 0 0 0.5px rgba(255, 255, 255, 0.06), 0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-pop: 0 0 0 0.5px rgba(255, 255, 255, 0.10), 0 20px 50px rgba(0, 0, 0, 0.55);
}
.dla *, .dla *::before, .dla *::after { box-sizing: border-box; }
/* dsh 给所有元素设了 corner-shape: superellipse(1.5)（圆角画成偏方的超椭圆），圆形图标会变成圆角方块、
   按钮和卡片的圆角也变方；设计稿是普通圆角，插件区域里改回 round。 */
.dla, .dla *, .dla *::before, .dla *::after { corner-shape: round; }
/* 自己的 display 规则优先级高于浏览器默认的 [hidden]，这里压回去，不依赖宿主。 */
.dla [hidden] { display: none !important; }
.dla p { margin: 0; }
.dla button { font: inherit; color: inherit; }
.dla :where(button, a, input, select):focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }
.dla .mono { font-family: var(--mono); font-variant-numeric: tabular-nums; }

.dla .hero { display: flex; align-items: center; gap: 16px; padding: 20px 16px; background: var(--group); border-radius: 12px; }
.dla .hero-icon { width: 48px; height: 48px; border-radius: 12px; background: var(--acc); color: #fff; display: grid; place-items: center; flex-shrink: 0; transition: background var(--dur) var(--spring); }
.dla .hero.off .hero-icon { background: var(--idle-dot); }
.dla .hero.fault .hero-icon { background: var(--bad-dot); }
.dla .hero-body { flex: 1; min-width: 0; }
.dla .hero-title { margin: 0; font-size: 22px; line-height: 28px; font-weight: 600; letter-spacing: -0.01em; }
.dla .hero-sub { margin-top: 2px; font-size: 13px; line-height: 18px; color: var(--t2); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
/* 窗口很窄时，圆点留在第一行文字旁边。 */
.dla .hero-sub { flex-wrap: nowrap; align-items: flex-start; }
.dla .hero-sub > .dot { margin-top: 5px; }

.dla .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex-shrink: 0; background: var(--idle-dot); }
.dla .dot.ok { background: var(--ok-dot); }
.dla .dot.bad { background: var(--bad-dot); }
.dla .dot.acc { background: var(--acc); }

.dla .seg { display: flex; padding: 2px; gap: 2px; border-radius: 8px; background: var(--fill); }
.dla .seg button { flex: 1; height: 28px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; border-radius: 6px; background: none; font-size: 13px; color: var(--t2); cursor: pointer; transition: background var(--dur) var(--spring), color var(--dur); }
.dla .seg button:hover:not([aria-selected="true"]) { background: var(--hover); color: var(--text); }
.dla .seg button:active:not([aria-selected="true"]) { background: var(--press); }
.dla .seg button[aria-selected="true"] { background: var(--seg-on); color: var(--text); font-weight: 600; box-shadow: var(--shadow-seg); }

.dla .panel { display: flex; flex-direction: column; gap: 24px; }
.dla .group-wrap { display: flex; flex-direction: column; gap: 8px; }
.dla .group-head { margin: 0; padding: 0 16px; font-size: 13px; line-height: 18px; font-weight: 600; color: var(--t2); }
.dla .t3 { color: var(--t3); }
.dla .group { background: var(--group); border-radius: 12px; overflow: hidden; transition: opacity var(--dur) var(--spring); }
.dla .group.dim { opacity: 0.45; pointer-events: none; }
.dla .group-foot { margin: 0; padding: 0 16px; font-size: 12px; line-height: 16px; color: var(--t3); }
.dla .row { position: relative; display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 8px 16px; }
.dla .row + .row::before { content: ""; position: absolute; top: 0; left: 16px; right: 0; height: 0.5px; background: var(--sep); }
.dla .row-main { flex: 1; min-width: 0; }
.dla .row-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dla .row-desc { margin-top: 2px; font-size: 12px; line-height: 16px; color: var(--t3); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dla .row-desc.bad { color: var(--bad); }
.dla .row-value { color: var(--t3); font-size: 13px; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.dla .row-addr { margin-top: 2px; display: flex; align-items: center; gap: 2px; }
.dla .row-addr .mono { font-size: 12px; color: var(--text); }

.dla .switch { position: relative; width: 38px; height: 22px; flex-shrink: 0; border: 0; padding: 0; border-radius: 999px; background: var(--switch-off); cursor: pointer; transition: background var(--dur) var(--spring), filter var(--dur-press); }
.dla .switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 999px; background: #fff; box-shadow: var(--shadow-knob); transition: transform var(--dur) var(--spring), width var(--dur-press) ease-out; }
.dla .switch::before { content: ""; position: absolute; inset: -11px 0; }
.dla .switch:hover { filter: brightness(0.96); }
.dla .switch[aria-checked="true"] { background: var(--acc); }
.dla .switch[aria-checked="true"]::after { transform: translateX(16px); }
.dla .switch:active::after { width: 22px; }
.dla .switch[aria-checked="true"]:active::after { transform: translateX(12px); }
.dla .switch:disabled { opacity: 0.4; cursor: default; filter: none; }
.dla .switch[aria-busy="true"] { cursor: progress; }
.dla .switch[aria-busy="true"]::after { animation: dla-pulse 900ms ease-in-out infinite; }
@keyframes dla-pulse { 50% { opacity: 0.6; } }

.dla .row-end { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.dla .row-end.addr { gap: 4px; margin-right: -4px; }
.dla .row-end.addr .mono { font-size: 13px; color: var(--text); }
.dla .row-desc.ok { color: var(--ok); }
.dla .field { height: 32px; border: 0; border-radius: 8px; background: var(--fill); padding: 0 12px; font: inherit; font-size: 13px; color: var(--text); outline: none; transition: box-shadow var(--dur-press), background var(--dur-press); min-width: 0; }
.dla .field:hover { background: var(--fill-hover); }
.dla .field:focus { background: var(--fill); box-shadow: 0 0 0 1px var(--acc), 0 0 0 4px var(--focus); }
.dla .field[aria-invalid="true"] { box-shadow: 0 0 0 1px var(--bad), 0 0 0 4px rgba(255, 59, 48, 0.12); }
.dla .field.num { width: 88px; text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }
.dla .select { appearance: none; -webkit-appearance: none; height: 32px; max-width: 60%; border: 0; border-radius: 8px; padding: 0 18px 0 8px; margin-right: -2px; font: inherit; font-size: 13px; color: var(--t2); text-align: right; text-align-last: right; cursor: pointer; outline: none; background: transparent var(--chevron) no-repeat right 2px center; transition: background-color var(--dur-press); }
.dla .select:hover { background-color: var(--fill); }
.dla .select:focus-visible { box-shadow: 0 0 0 3px var(--focus); }
.dla .notice.warn { background: var(--warn-soft); }
.dla .notice.bad { background: var(--bad-soft); }
.dla .notice.bad > svg { color: var(--bad); }
.dla .notice-body { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.dla .notice-link { margin: 4px 0 0 -8px; }
.dla .acc-text { color: var(--acc-text); }
.dla .seg .dot { width: 6px; height: 6px; }
.dla .notice.warn > svg { color: var(--warn); }
.dla .group-foot.warn { display: flex; gap: 6px; align-items: flex-start; }
.dla .group-foot.warn > svg { color: var(--warn); flex-shrink: 0; margin-top: 1px; }
.dla .icon-btn { width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: none; color: var(--t3); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; transition: background var(--dur-press); }
.dla .icon-btn:hover { background: var(--fill); color: var(--text); }
.dla .icon-btn:active { background: var(--fill-press); }

.dla .notice { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-radius: 12px; background: var(--acc-soft); font-size: 13px; line-height: 18px; }
.dla .notice > svg { color: var(--acc); flex-shrink: 0; margin-top: 1px; }
.dla .notice b { font-weight: 600; display: block; }

.dla .toast-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.dla .toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2000; display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 16px; border-radius: 999px; background: var(--toast-bg); color: var(--toast-fg); font-size: 13px; box-shadow: var(--shadow-pop); white-space: nowrap; animation: dla-rise var(--dur) var(--spring); }
.dla .toast .ico { display: inline-flex; color: var(--ok-dot); }
.dla .toast.bad .ico { color: var(--bad-dot); }
@keyframes dla-rise { from { opacity: 0; transform: translate(-50%, 12px); } to { opacity: 1; transform: translateX(-50%); } }

.dla .group-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 26px; }
.dla .group-head .count { font-weight: 400; color: var(--t3); }
/* 整行是按钮时，里面只能放 span；按块级排，和普通行一样。 */
.dla button.row .row-main, .dla button.row .row-label { display: block; }
.dla button.row { width: 100%; border: 0; background: none; text-align: left; cursor: pointer; color: inherit; font: inherit; transition: background var(--dur-press) ease-out; }
.dla button.row:hover { background: var(--hover); }
.dla button.row:active { background: var(--press); }
.dla button.row:focus-visible { box-shadow: inset 0 0 0 2px var(--acc); }
.dla .row .chev { color: var(--t3); flex-shrink: 0; }
.dla .row.add .row-label, .dla .row.add .plus { color: var(--acc-text); }
.dla .row.danger .row-label { color: var(--bad); }
.dla .row-desc .mono { font-size: inherit; }
.dla .row-desc.inline { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

.dla .btn { position: relative; height: 32px; padding: 0 16px; border: 0; border-radius: 8px; background: var(--fill); color: var(--text); font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; justify-content: center; gap: 6px; transition: transform var(--dur-press) ease-out, background var(--dur-press) ease-out; }
.dla .btn:hover { background: var(--fill-hover); }
.dla .btn:active { background: var(--fill-press); transform: scale(0.97); }
.dla .btn.primary { background: var(--acc-strong); color: #fff; }
.dla .btn.primary:hover { background: var(--acc-strong-hover); }
.dla .btn.primary:active { background: var(--acc-strong-press); }
.dla .btn.danger { color: var(--bad); }
.dla .btn.danger:hover { background: var(--bad-soft); }
.dla .btn.danger-solid { background: var(--bad-dot); color: #fff; }
.dla .btn.danger-solid:hover { filter: brightness(0.94); }
.dla .btn.plain { background: none; color: var(--acc-text); padding: 0 8px; }
.dla .btn.plain:hover { background: var(--acc-soft); }
.dla .btn.sm { height: 26px; padding: 0 12px; font-size: 12px; border-radius: 6px; }
.dla .btn.sm.plain { padding: 0 8px; }
.dla .btn:disabled, .dla .btn[aria-disabled="true"] { opacity: 0.4; cursor: default; transform: none; }
.dla .btn:disabled:hover { background: var(--fill); }
.dla .btn.plain:disabled:hover, .dla .btn.danger:disabled:hover { background: none; }
.dla .group-head .btn.plain { margin-right: -6px; }
.dla .spin { display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid currentColor; border-right-color: transparent; animation: dla-spin 700ms linear infinite; flex-shrink: 0; }
@keyframes dla-spin { to { transform: rotate(360deg); } }

.dla .chk { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; color: #fff; }
.dla .chk.ok { background: var(--ok-dot); } .dla .chk.warn { background: var(--warn-dot); } .dla .chk.bad { background: var(--bad-dot); } .dla .chk.idle { background: var(--fill); color: var(--t3); }
.dla .badge { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 8px; border-radius: 999px; font-size: 12px; font-weight: 500; background: var(--fill); color: var(--t2); white-space: nowrap; }
.dla .empty { padding: 24px 16px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.dla .empty p { color: var(--t3); font-size: 13px; line-height: 18px; }
.dla .msg { font-size: 12px; line-height: 16px; color: var(--t3); }
.dla .msg.bad { color: var(--bad); } .dla .msg.ok { color: var(--ok); }

.dla .scrim { position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; padding: 16px; background: var(--scrim); animation: dla-fade var(--dur) var(--spring); }
.dla .sheet { width: 100%; max-width: 400px; max-height: calc(100vh - 48px); overflow: auto; background: var(--sheet-bg); border-radius: 14px; box-shadow: var(--shadow-pop); padding: 24px; display: flex; flex-direction: column; gap: 16px; animation: dla-pop var(--dur) var(--spring); }
.dla .sheet.wide { max-width: 480px; }
.dla .sheet:focus { outline: none; }
.dla .sheet h3 { margin: 0; font-size: 15px; line-height: 20px; font-weight: 600; }
.dla .sheet .lead { margin-top: 4px; font-size: 13px; line-height: 18px; color: var(--t2); }
.dla .sheet label.f { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--t2); }
.dla .sheet .field { width: 100%; }
.dla .sheet .sub { font-size: 12px; color: var(--t2); }
.dla .sheet .chips { display: flex; flex-wrap: wrap; gap: 8px; }
.dla .sheet-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.dla .sheet-actions .left { margin-right: auto; }
.dla .chip { height: 26px; padding: 0 12px; border: 0; border-radius: 999px; background: var(--fill); color: var(--text); font: inherit; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; transition: background var(--dur-press), transform var(--dur-press); }
.dla .chip:hover { background: var(--fill-hover); }
.dla .chip:active { transform: scale(0.97); background: var(--fill-press); }
.dla .chip[aria-pressed="true"] { background: var(--acc-soft); color: var(--acc-text); }
.dla .chip .mono { font-size: inherit; }
.dla .chip .t3 { color: var(--t3); }
.dla .toast .btn.plain { color: var(--toast-fg); font-weight: 600; }
.dla .toast .btn.plain:hover { background: rgba(127, 127, 127, 0.25); }
.dla .toast.has-undo { padding-right: 6px; }
@keyframes dla-pop { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: none; } }
@keyframes dla-fade { from { opacity: 0; } to { opacity: 1; } }

.dla .row-expand { position: relative; padding: 12px 16px 16px; display: flex; flex-direction: column; gap: 8px; animation: dla-unfold var(--dur) var(--spring); }
.dla .row + .row-expand::before, .dla .row-expand + .row::before { content: ""; position: absolute; top: 0; left: 16px; right: 0; height: 0.5px; background: var(--sep); }
.dla .row-expand .line { display: flex; gap: 8px; align-items: center; }
.dla .reveal { position: relative; flex: 1; display: flex; min-width: 0; }
.dla .reveal .field { flex: 1; padding-right: 36px; }
.dla .reveal .eye { position: absolute; right: 4px; top: 4px; }
.dla .msg.ok svg { vertical-align: -1px; }
.dla .log-list { max-height: 300px; overflow: auto; }
.dla .sheet .seg button { height: 28px; }
@keyframes dla-unfold { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .dla *, .dla *::before, .dla *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
}
@media (hover: none) { .dla .icon-btn { color: var(--t2); } }
`;
		//#endregion
		//#region src/client/index.tsx
		const inject = ["slots"];
		const SECTION_ID = "remote-access";
		/** 带「撤销」的提示条停留更久，来得及点。 */
		const UNDO_TOAST_MS = 5e3;
		/** 端口「已保存」绿字停留时长。 */
		const PORT_SAVED_MS = 2500;
		/** 设置页开着时多久刷新一次状态（已登录数、第一台设备连上后收起防火墙提示）。 */
		const POLL_MS = 5e3;
		/** 本机看到全部四段；局域网设备只读，「设备」「安全」两段不出现（那里没有它能看的东西）。 */
		const LOCAL_TABS = [
			"conn",
			"dev",
			"sec",
			"about"
		];
		const REMOTE_TABS = ["conn", "about"];
		function RemoteAccessSection(_props) {
			const [status, setStatus] = (0, react.useState)();
			const [firstLoadFailed, setFirstLoadFailed] = (0, react.useState)(false);
			const [tab, setTab] = (0, react.useState)("conn");
			const [toast, setToast] = (0, react.useState)();
			/** 总开关点下去、还没从服务端读回来时的值（让下方立即变暗或恢复）。 */
			const [pendingEnabled, setPendingEnabled] = (0, react.useState)();
			const toastTimer = (0, react.useRef)(void 0);
			const loadSeq = (0, react.useRef)(0);
			const hasStatus = (0, react.useRef)(false);
			/** 定时刷新失败已经提示过了（恢复后清掉），免得每 5 秒弹一次。 */
			const pollWarned = (0, react.useRef)(false);
			/** 总开关正在保存：这期间读回来的状态是保存之前的，不用它覆盖刚翻过去的开关。 */
			const masterInFlight = (0, react.useRef)(false);
			const mounted = useMounted();
			const showToast = (0, react.useCallback)((next) => {
				if (!mounted.current) return;
				clearTimeout(toastTimer.current);
				setToast(next);
				toastTimer.current = setTimeout(() => setToast(void 0), next.undo ? UNDO_TOAST_MS : TOAST_MS);
			}, [mounted]);
			/** 读状态，只用最新一次的结果。读失败时保留旧内容并提示（定时刷新失败只提示一次）。 */
			const read = (0, react.useCallback)(async (poll) => {
				const seq = ++loadSeq.current;
				const st = await getStatus();
				if (!mounted.current || seq !== loadSeq.current || masterInFlight.current) return;
				if (st !== void 0) {
					hasStatus.current = true;
					pollWarned.current = false;
					setStatus(st);
					setPendingEnabled(void 0);
					setFirstLoadFailed(false);
				} else if (!hasStatus.current) setFirstLoadFailed(true);
				else if (!poll) showToast({
					kind: "bad",
					text: zh.errors.refreshFailed
				});
				else if (!pollWarned.current) {
					pollWarned.current = true;
					showToast({
						kind: "bad",
						text: zh.errors.pollFailed
					});
				}
			}, [mounted, showToast]);
			const load = (0, react.useCallback)(() => read(false), [read]);
			(0, react.useEffect)(() => {
				load();
				const timer = setInterval(() => void read(true), POLL_MS);
				return () => clearInterval(timer);
			}, [load, read]);
			(0, react.useEffect)(() => () => clearTimeout(toastTimer.current), []);
			const [masterBusy, saveMaster, masterSaving] = useSave(load);
			const enabled = pendingEnabled ?? status?.enabled ?? false;
			const toggleMaster = async (next) => {
				if (masterSaving()) return;
				setPendingEnabled(next);
				masterInFlight.current = true;
				loadSeq.current += 1;
				const result = await saveMaster({ enabled: next });
				masterInFlight.current = false;
				if (!mounted.current) return;
				if (result === void 0 || result.ok) {
					load();
					return;
				}
				setPendingEnabled(void 0);
				showToast({
					kind: "bad",
					text: failureText(result)
				});
			};
			const tabs = status?.local === true ? LOCAL_TABS : REMOTE_TABS;
			const onTabKey = (e) => {
				const i = tabs.indexOf(tab);
				let next;
				if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
				else if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
				else if (e.key === "Home") next = tabs[0];
				else if (e.key === "End") next = tabs[tabs.length - 1];
				if (next === void 0) return;
				e.preventDefault();
				setTab(next);
				document.getElementById(`dla-tab-${next}`)?.focus();
			};
			const local = status?.local === true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dla",
				"data-dla-root": "",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("style", { children: css }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hero, {
						status,
						enabled,
						firstLoadFailed,
						busy: masterBusy,
						onToggle: (v) => void toggleMaster(v)
					}),
					status?.fault === true && enabled && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "notice bad",
						role: "alert",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WarnIcon, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "notice-body",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: faultTitle(status) }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: zh.fault.body }),
								tab !== "about" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "btn plain sm notice-link",
									onClick: () => {
										setTab("about");
										requestAnimationFrame(() => document.getElementById("dla-tab-about")?.focus());
									},
									children: zh.fault.more
								})
							]
						})]
					}),
					status !== void 0 && !local && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "notice",
						role: "note",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoIcon, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: zh.readOnly.title }), zh.readOnly.body(status.clientIp ?? zh.readOnly.thisDevice, status.machineName || zh.readOnly.thisMachine)] })]
					}),
					status !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "seg",
							role: "tablist",
							"aria-label": zh.tabs.aria,
							children: tabs.map((id) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "tab",
								id: `dla-tab-${id}`,
								"aria-selected": tab === id,
								"aria-controls": `dla-panel-${id}`,
								tabIndex: tab === id ? 0 : -1,
								onClick: () => setTab(id),
								onKeyDown: onTabKey,
								children: [zh.tabs[id], id === "about" && status.update?.state === "available" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "dot acc",
									role: "img",
									"aria-label": zh.about.update.dot
								})]
							}, id))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TabPanel, {
							id: "conn",
							current: tab,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConnPanel, {
								status,
								enabled,
								onChanged: load,
								showToast
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TabPanel, {
							id: "dev",
							current: tab,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DevicesPanel, {
								local,
								showToast,
								onChanged: load,
								active: tab === "dev"
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TabPanel, {
							id: "sec",
							current: tab,
							children: local && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SecurityPanel, {
								status,
								onChanged: load,
								showToast,
								active: tab === "sec"
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TabPanel, {
							id: "about",
							current: tab,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AboutPanel, {
								status,
								active: tab === "about",
								onChanged: load,
								showToast
							})
						})
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "toast-live",
						role: "status",
						"aria-live": "polite",
						children: toast?.text ?? ""
					}),
					toast !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `toast ${toast.kind}${toast.undo ? " has-undo" : ""}`,
						children: [
							toast.kind !== "plain" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "ico",
								children: toast.kind === "ok" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CheckIcon$1, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BangIcon, {})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: toast.text }),
							toast.undo && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "btn plain sm",
								onClick: () => {
									toast.undo?.();
									clearTimeout(toastTimer.current);
									setToast(void 0);
								},
								children: zh.undo
							})
						]
					})
				]
			});
		}
		/** 分段面板一直挂着，不是当前段就 hidden：切换分段不会打断保存中的操作，aria-controls 也总指向真元素。 */
		function TabPanel({ id, current, children }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "panel",
				role: "tabpanel",
				id: `dla-panel-${id}`,
				"aria-labelledby": `dla-tab-${id}`,
				hidden: current !== id,
				children
			});
		}
		/** 红条标题：第一项没通过的检查。 */
		function faultTitle(status) {
			const first = status.checks.find((c) => c.state === "bad" || c.state === "warn");
			return (first && zh.fault.title[first.id]) ?? zh.fault.title.signing;
		}
		function Hero({ status, enabled, firstLoadFailed, busy, onToggle }) {
			let sub;
			if (status === void 0) sub = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: firstLoadFailed ? zh.hero.unreachable : zh.hero.loading });
			else if (!enabled) sub = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dot" }), zh.hero.disabled] });
			else if (status.fault) sub = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dot bad" }), zh.hero.fault] });
			else if (status.checkedAt === null) sub = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: zh.hero.checking });
			else {
				const parts = [zh.hero.running];
				if (status.lanEnabled) {
					parts.push(zh.hero.lanOpen);
					if (status.loggedIn !== void 0) parts.push(zh.hero.loggedIn(status.loggedIn));
				} else parts.push(zh.hero.localOnly);
				sub = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "dot ok" }), parts.join(" · ")] });
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: `hero${status !== void 0 && !enabled ? " off" : status?.fault === true ? " fault" : ""}`,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "hero-icon",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WifiIcon, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "hero-body",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
							className: "hero-title",
							children: zh.title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "hero-sub",
							children: sub
						})]
					}),
					status?.local === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
						checked: enabled,
						label: zh.hero.switchLabel,
						busy,
						onToggle
					})
				]
			});
		}
		/** 局域网访问地址里用哪个 IP：选了网卡就用它，否则自动挑一个。 */
		function preferredAddress(status) {
			if (status.lan.host !== "") return status.lan.host;
			return pickLanAddress(status.lanIps ?? []);
		}
		function ConnPanel({ status, enabled, onChanged, showToast }) {
			const groupRef = (0, react.useRef)(null);
			const lanGroupRef = (0, react.useRef)(null);
			const dim = !enabled;
			const localUrl = `http://127.0.0.1:${status.port}`;
			const local = useGuardedSwitch(status.allowLoopback, "allowLoopback", onChanged, showToast, (f) => f.kind === "rejected" && f.code === ERROR_CODES.passwordRequired ? zh.conn.needPassword : void 0);
			const lan = useGuardedSwitch(status.lanEnabled, "lanEnabled", onChanged, showToast, (f) => {
				if (f.kind !== "rejected") return void 0;
				if (f.code === ERROR_CODES.passwordRequired) return zh.conn.needPassword;
				if (f.code === ERROR_CODES.portInUse) return zh.conn.lanPortInUse(f.port ?? status.lan.port);
				if (f.code === ERROR_CODES.hostUnavailable) return zh.conn.lanHostUnavailable;
			});
			(0, react.useEffect)(() => {
				if (groupRef.current) groupRef.current.inert = dim;
				if (lanGroupRef.current) lanGroupRef.current.inert = dim;
			}, [dim, lan.checked]);
			const copy = async (url, done) => {
				showToast(await copyText(url) ? {
					kind: "ok",
					text: done
				} : {
					kind: "bad",
					text: zh.conn.copyFailed
				});
			};
			const showLanEntry = status.lanEnabled && lan.checked;
			if (!status.local) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "group-wrap",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "group",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "row-main",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "row-label",
									children: zh.conn.localLabel
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "row-value",
								children: status.allowLoopback ? zh.readOnly.on : zh.readOnly.off
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "row-main",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "row-label",
									children: zh.conn.lanLabel
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "row-value",
								children: status.lanEnabled ? zh.readOnly.on : zh.readOnly.off
							})]
						}),
						status.lanEnabled && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "row-main",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "row-label",
									children: zh.conn.portLabel
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "row-value mono",
								children: status.lan.port
							})]
						})
					]
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "group-wrap",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: groupRef,
					className: `group${dim ? " dim" : ""}`,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "row-main",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "row-label",
									children: zh.conn.localLabel
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RowDesc, {
									text: zh.conn.localDesc,
									alert: local.inlineError ? {
										kind: "bad",
										text: local.inlineError
									} : void 0
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: "row-addr",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "mono",
										children: localUrl
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "icon-btn",
										"aria-label": zh.conn.copyLocal,
										title: zh.conn.copyLocal,
										onClick: () => void copy(localUrl, zh.conn.copied),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CopyIcon, {})
									})]
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
							checked: local.checked,
							label: zh.conn.localLabel,
							busy: local.busy,
							onToggle: local.toggle
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "row-main",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "row-label",
								children: zh.conn.lanLabel
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RowDesc, {
								text: zh.conn.lanDesc,
								alert: lan.inlineError ? {
									kind: "bad",
									text: lan.inlineError
								} : void 0
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
							checked: lan.checked,
							label: zh.conn.lanLabel,
							busy: lan.busy,
							onToggle: lan.toggle
						})]
					})]
				}), dim && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "group-foot",
					children: zh.hero.keptWhileOff
				})]
			}), showLanEntry && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: lanGroupRef,
				className: "panel",
				children: [status.lan.listening && !status.lan.hintDone && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "notice",
					role: "note",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(InfoIcon, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: zh.conn.firewallTitle }), zh.conn.firewallBody] })]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LanEntry, {
					status,
					dim,
					onChanged,
					showToast,
					copy
				})]
			})] });
		}
		function LanEntry({ status, dim, onChanged, showToast, copy }) {
			const [portText, setPortText] = (0, react.useState)(String(status.lan.port));
			const [portAlert, setPortAlert] = (0, react.useState)();
			const [nicAlert, setNicAlert] = (0, react.useState)();
			const alertTimer = (0, react.useRef)(void 0);
			const mounted = useMounted();
			const [, savePort, portSaving] = useSave(onChanged);
			(0, react.useEffect)(() => setPortText(String(status.lan.port)), [status.lan.port]);
			(0, react.useEffect)(() => () => clearTimeout(alertTimer.current), []);
			const address = preferredAddress(status);
			const lanUrl = address ? `http://${address}:${status.lan.port}` : void 0;
			const flashPort = (alert, ms) => {
				clearTimeout(alertTimer.current);
				setPortAlert(alert);
				alertTimer.current = setTimeout(() => {
					if (mounted.current) setPortAlert(void 0);
				}, ms);
			};
			/** 端口：回车或离开输入框时生效；不合法原地报错，不发请求。 */
			const commitPort = async () => {
				const text = portText.trim();
				if (text === String(status.lan.port) || portSaving()) return;
				const port = Number(text);
				if (!/^\d+$/.test(text) || port < 1 || port > 65535) {
					setPortAlert({
						kind: "bad",
						text: zh.conn.portInvalid
					});
					return;
				}
				if (port === status.port) {
					setPortAlert({
						kind: "bad",
						text: zh.conn.portIsMain(port)
					});
					return;
				}
				const result = await savePort({ lanPort: port });
				if (result === void 0 || !mounted.current) return;
				if (result.ok) {
					flashPort({
						kind: "ok",
						text: zh.conn.portSaved
					}, PORT_SAVED_MS);
					return;
				}
				if (result.kind === "rejected" && result.code === ERROR_CODES.portInUse) setPortAlert({
					kind: "bad",
					text: zh.conn.portInUse(port)
				});
				else if (result.kind === "rejected" && result.code === ERROR_CODES.invalidPort) setPortAlert({
					kind: "bad",
					text: zh.conn.portIsMain(port)
				});
				else showToast({
					kind: "bad",
					text: failureText(result)
				});
			};
			const [nicValue, changeNic] = useSelectSetting(status.lan.host, "lanHost", onChanged, showToast, (f) => {
				if (f.kind === "rejected" && f.code === ERROR_CODES.portInUse) {
					setNicAlert(zh.conn.portInUse(status.lan.port));
					return true;
				}
				if (f.kind === "rejected" && f.code === ERROR_CODES.hostUnavailable) {
					setNicAlert(zh.conn.nicMissing);
					return true;
				}
				return false;
			});
			const ips = status.lanIps ?? [];
			const nicMissingNow = status.lan.hostMissing || status.lan.error === "host-unavailable";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "group-wrap",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: "group-head",
						children: zh.conn.lanGroup
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: `group${dim ? " dim" : ""}`,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "row-main",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "row-label",
										children: zh.conn.addrLabel
									})
								}), lanUrl !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "row-end addr",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "mono",
										children: lanUrl
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "icon-btn",
										"aria-label": zh.conn.copyLan,
										title: zh.conn.copyLan,
										onClick: () => void copy(lanUrl, zh.conn.copiedLan),
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CopyIcon, {})
									})]
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "row-value",
									children: zh.conn.nicNoNetwork
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "row-main",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "row-label",
										children: zh.conn.nicLabel
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RowDesc, {
										text: zh.conn.nicDesc,
										alert: nicAlert !== void 0 ? {
											kind: "bad",
											text: nicAlert
										} : nicMissingNow ? {
											kind: "bad",
											text: zh.conn.nicMissing
										} : void 0
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									className: "select",
									"aria-label": zh.conn.nicLabel,
									value: nicValue,
									onChange: (e) => {
										setNicAlert(void 0);
										changeNic(e.target.value);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "",
											children: zh.conn.nicAll
										}),
										ips.map((i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: i.address,
											children: isOverlay(i.address) ? `${i.name} · ${zh.conn.nicOverlay} · ${i.address}` : `${i.name} · ${i.address}`
										}, `${i.name}-${i.address}`)),
										status.lan.host !== "" && !ips.some((i) => i.address === status.lan.host) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: status.lan.host,
											children: status.lan.host
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "row",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "row-main",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "row-label",
										children: zh.conn.portLabel
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RowDesc, {
										text: zh.conn.portDesc,
										alert: portAlert ?? (status.lan.error === "port-in-use" ? {
											kind: "bad",
											text: zh.conn.portInUse(status.lan.port)
										} : void 0)
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "field num",
									inputMode: "numeric",
									"aria-label": zh.conn.portLabel,
									"aria-invalid": portAlert?.kind === "bad" || void 0,
									value: portText,
									onChange: (e) => {
										setPortText(e.target.value);
										if (portAlert?.kind === "bad") setPortAlert(void 0);
									},
									onKeyDown: (e) => {
										if (e.key === "Enter") commitPort();
										if (e.key === "Escape" && (portText !== String(status.lan.port) || portAlert)) {
											e.preventDefault();
											e.stopPropagation();
											e.nativeEvent.stopImmediatePropagation();
											setPortText(String(status.lan.port));
											setPortAlert(void 0);
										}
									},
									onBlur: () => void commitPort()
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "group-foot warn",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(WarnIcon, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: zh.conn.insecure })]
					})
				]
			});
		}
		function apply(ctx) {
			const slots = ctx.slots;
			slots?.inject("settings.section", () => slots.register({
				name: "settings.section",
				id: SECTION_ID,
				order: 100,
				label: () => zh.sectionLabel
			}, RemoteAccessSection));
		}
		//#endregion
		exports.RemoteAccessSection = RemoteAccessSection;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map