export declare const zh: {
    readonly sectionLabel: "局域网web访问";
    readonly title: "局域网web访问";
    readonly hero: {
        readonly switchLabel: "启用插件（关闭后恢复 dsh 官方的登录方式）";
        readonly running: "正在运行";
        readonly localOnly: "仅本机和 SSH 隧道";
        readonly lanOpen: "局域网已开放";
        readonly loggedIn: (n: number) => string;
        readonly disabled: "已停用 · 现在用 dsh 官方的 token 方式登录";
        readonly loading: "正在读取状态…";
        readonly unreachable: "读不到插件状态，请刷新重试";
        /** 总开关关着时，分组下方的说明（设计稿「插件已停用」）。 */
        readonly keptWhileOff: "下面的设置都保留着，打开总开关后原样恢复。";
        /** 运行检查没通过、已安全退出。 */
        readonly fault: "已暂停 · 已退回 dsh 官方登录方式";
        readonly checking: "正在做运行检查…";
    };
    /** 安全退出时状态头下方的红条：标题写第一项没通过的，正文说影响和怎么办。 */
    readonly fault: {
        readonly title: Record<string, string>;
        readonly body: "免 token 和局域网入口已关闭，Desktop 不受影响。等插件更新后到「关于」点「重新检查」。";
        readonly more: "查看运行检查";
    };
    readonly tabs: {
        readonly aria: "设置分类";
        readonly conn: "连接";
        readonly dev: "设备";
        readonly sec: "安全";
        readonly about: "关于";
    };
    readonly conn: {
        readonly localLabel: "本机免登录";
        readonly localDesc: "在这台电脑或经 SSH 隧道打开时直接进入，不用 token";
        readonly copyLocal: "复制本机访问地址";
        readonly copied: "已复制本机访问地址";
        readonly copyFailed: "没能复制，请手动选中地址复制";
        /** 没设密码时去关「本机免登录」的提示。 */
        readonly needPassword: "先在「安全」里设置管理密码";
        readonly lanLabel: "局域网访问";
        readonly lanDesc: "同一网络里的其他设备用浏览器打开，需要密码";
        readonly lanPortInUse: (port: number) => string;
        readonly lanHostUnavailable: "没能打开：选中的网卡现在不在这台电脑上，换一块网卡再试";
        readonly lanGroup: "局域网入口";
        readonly firewallTitle: "系统可能会弹窗询问";
        readonly firewallBody: "如果系统询问是否允许 dsh 接受连接，请点「允许」，否则其他设备连不上。";
        readonly addrLabel: "访问地址";
        readonly copyLan: "复制访问地址";
        readonly copiedLan: "已复制访问地址";
        readonly nicLabel: "监听网卡";
        readonly nicDesc: "选「所有网卡」时，Wi-Fi、有线、Tailscale 都能连进来";
        readonly nicAll: "所有网卡";
        /** 100.64.0.0/10 网段的网卡（Tailscale 这类异地组网）。 */
        readonly nicOverlay: "组网";
        readonly nicMissing: "选中的网卡现在不在这台电脑上（断网或组网软件已退出），换一块网卡";
        readonly nicNoNetwork: "没有检测到可用网络";
        readonly portLabel: "端口";
        readonly portDesc: "改完按回车生效，不用重启";
        readonly portSaved: "已保存，局域网入口已在新端口重开";
        readonly portInvalid: "端口要在 1 到 65535 之间";
        readonly portIsMain: (port: number) => string;
        readonly portInUse: (port: number) => string;
        readonly insecure: "局域网连接没有加密，同一网络里的人可能截到密码。只在家里、公司内网或 Tailscale 这类组网里打开。";
    };
    readonly dev: {
        readonly groupTitle: "允许的设备";
        readonly signOutAll: "全部退出登录";
        readonly signedOutAll: "所有浏览器已退出登录";
        readonly loggedIn: "已登录";
        readonly notLoggedIn: "未登录";
        readonly manyLoggedIn: (n: number) => string;
        readonly bypass: "免密码";
        readonly neverSeen: "还没来访过";
        readonly active: (ago: string) => string;
        readonly add: "添加设备…";
        readonly addShort: "添加设备";
        readonly foot: "不在列表里的设备，连登录页都打不开。点一行可以让它退出登录，或把它移出列表。";
        readonly emptyText: "还没有允许的设备。加进来的设备才能打开登录页。";
        readonly emptyFoot: (mode: string) => string;
        readonly emptyModeLabel: "列表为空时";
        readonly emptyMode: {
            readonly 'deny-all': "拒绝所有设备";
            readonly 'private-only': "允许所有私有网段";
        };
        readonly bypassLabel: "列表里的设备免密码";
        readonly bypassDesc: "同一网络里的人可以冒用 IP，只在完全可信的网络里打开";
        readonly othersTitle: "其他已登录的浏览器";
        readonly othersDesc: "不在允许列表里，是「列表为空时允许所有私有网段」放进来的";
        readonly detailLead: "允许这台设备打开登录页。";
        readonly nameLabel: "名称";
        readonly namePlaceholder: "例如：客厅的 iPad";
        readonly valueLabel: "IP 或网段";
        readonly valuePlaceholder: "192.168.1.23";
        readonly loginState: "登录状态";
        readonly signOut: "退出登录";
        readonly signedOut: (who: string) => string;
        /** 退出登录提示里「谁的哪个浏览器」。 */
        readonly whoBrowser: (who: string, browser: string) => string;
        readonly loadFailed: "没能读到设备列表";
        readonly retry: "重试";
        readonly signOutNote: "退出登录后，它下次打开要重新输入密码；设备仍在允许列表里。";
        readonly bypassNote: "开着「列表里的设备免密码」，这台设备不用登录，没有可退出的登录。";
        readonly noSessions: "现在没有登录着的浏览器。";
        readonly loginSince: (date: string) => string;
        readonly remove: "移出列表";
        readonly removed: (name: string) => string;
        readonly cancel: "取消";
        readonly done: "完成";
        readonly addTitle: "添加设备";
        readonly addLead: "加进来的设备才能打开登录页，登录仍需要密码。";
        readonly addLeadBypass: "加进来的设备开着免密码时直接进入，不用输密码。";
        readonly addConfirm: "添加";
        readonly added: (name: string) => string;
        readonly valueHint: "一台设备填 IP，如 192.168.1.23；一整个网段填 192.168.1.0/24";
        readonly valueSingle: "单台设备";
        readonly valueRange: "网段：这一段里的所有设备都允许";
        readonly valueInvalid: "格式不对：应为 192.168.1.23 或 192.168.1.0/24";
        readonly valueDuplicate: "这个地址已经在列表里了";
        readonly recentTitle: "最近被拒绝的地址，点一下填入";
        readonly recentMeta: (count: number, when: string) => string;
        readonly date: (d: Date) => string;
    };
    readonly sec: {
        readonly groupPassword: "密码与登录";
        readonly passwordLabel: "管理密码";
        readonly passwordSet: (ago: string) => string;
        readonly passwordSetNoTime: "已设置";
        readonly passwordUnset: "未设置";
        readonly change: "更改";
        readonly newPassword: "新密码";
        readonly showPassword: "显示密码";
        readonly cancel: "取消";
        readonly save: "保存";
        readonly setFirst: "设置";
        readonly hint: "至少 12 位，保存后所有已登录的设备都要重新登录";
        readonly hintFirst: "至少 12 位，设好后才能打开局域网访问";
        readonly short: (n: number) => string;
        readonly enough: "长度够了";
        readonly changed: "密码已更新，其他设备需要重新登录";
        readonly setDone: "管理密码已设置";
        readonly keepLabel: "登录保持";
        readonly keepDesc: "过期后要重新输入密码";
        readonly days: (n: number) => string;
        readonly clear: "清除密码…";
        readonly clearTitle: "清除管理密码？";
        readonly clearBody: "清除后会同时：关闭局域网访问、让所有局域网设备退出登录。本机和 SSH 隧道不受影响。之后要用局域网，需要重新设置密码。";
        readonly clearReopenLocal: "同时会重新打开「本机免登录」，否则浏览器将无法进入。";
        readonly clearConfirm: "清除密码";
        readonly cleared: "密码已清除，局域网访问已关闭";
        readonly groupLog: "访问记录";
        readonly logAll: (n: number) => string;
        readonly logTitle: "访问记录";
        readonly logFoot: "只保存最近 200 条；dsh 重启后清空。";
        readonly logEmpty: "还没有记录。局域网设备登录、被拒绝时会记在这里。";
        readonly logLoadFailed: "没能读到访问记录，稍后会自动再试";
        readonly times: (n: number) => string;
        readonly filterAria: "筛选";
        readonly filter: {
            readonly all: "全部";
            readonly deny: "拒绝";
            readonly login: "登录";
        };
        readonly done: "完成";
        readonly kind: {
            readonly 'whitelist-deny': "不在列表里，已拒绝";
            readonly unauthorized: "没登录，已拒绝";
            readonly 'cross-site': "别的网站发来的请求，已拒绝";
            readonly 'login-failed': "密码错误";
            readonly login: "登录成功";
            readonly logout: "退出登录";
            readonly kick: "被踢下线";
            readonly removed: "移出列表";
            readonly update: "插件更新";
            readonly 'selfcheck-fail': "运行检查没通过";
        };
        readonly today: "今天";
        readonly yesterday: "昨天";
    };
    readonly about: {
        readonly groupVersion: "版本";
        readonly plugin: "插件";
        readonly dsh: "dsh";
        readonly runtime: "运行环境";
        readonly edition: {
            readonly desktop: "Desktop";
            readonly web: "Web";
            readonly unknown: "未知";
        };
        readonly port: (p: number) => string;
        readonly unknownVersion: "未知";
        readonly dshInRange: (v: string) => string;
        readonly dshOutOfRange: (v: string) => string;
        readonly update: {
            readonly checking: "正在查询最新版本";
            readonly latest: (v: string) => string;
            readonly available: (cur: string, next: string) => readonly [`\u5F53\u524D ${string} \u00B7 `, `\u6709\u65B0\u7248\u672C ${string}`];
            readonly unavailable: (cur: string) => string;
            readonly running: "大约需要 30 秒，别关 dsh";
            readonly done: (v: string) => string;
            readonly failed: {
                readonly network: "连不上更新服务器。检查网络后重试，设置不受影响";
                readonly 'no-command': (cmd: string) => string;
                readonly failed: "更新没成功，设置不受影响。可以重试";
            };
            readonly check: "检查更新";
            readonly to: (v: string) => string;
            readonly busy: "更新中…";
            readonly retry: "重试";
            readonly dot: "有新版本";
        };
        readonly groupChecks: "运行检查";
        readonly allPassed: (n: number) => string;
        readonly passedSomeUnset: (ok: number, idle: number) => string;
        readonly someFailed: (n: number) => string;
        readonly pending: "· 正在检查";
        readonly recheck: "重新检查";
        readonly rechecking: "检查中…";
        readonly toastPassed: (n: number) => string;
        readonly toastPassedUnset: (ok: number) => string;
        readonly toastFailed: (n: number) => string;
        readonly checksFoot: "前四项任何一项不通过，插件会自动退回 dsh 官方的登录方式并关闭局域网入口，这里会写明原因。";
        readonly check: {
            readonly webServer: {
                readonly label: "接入 dsh 网页服务";
                readonly ok: (port: number) => string;
                readonly bad: "没能挂到 dsh 的网页服务上";
            };
            readonly signing: {
                readonly label: "读取 dsh 登录签名";
                readonly ok: "能读到 dsh 的签名密钥，所以本机和 SSH 隧道可以免 token 进入";
                readonly bad: "读不到 dsh 的签名密钥，dsh 升级后格式可能变了";
            };
            readonly sessionKey: {
                readonly label: "局域网登录密钥";
                readonly ok: "已生成，局域网设备登录后能保持登录";
                readonly bad: "没能生成，局域网设备登录后保持不住";
            };
            readonly dshVersion: {
                readonly label: "dsh 版本";
                readonly ok: (v: string) => string;
                readonly unknown: "读不到 dsh 的版本号，按支持处理";
                readonly warn: (v: string) => string;
            };
            readonly password: {
                readonly label: "管理密码";
                readonly ok: "已设置，局域网访问可以打开";
                readonly idle: "未设置，设好后才能打开局域网访问";
            };
        };
        readonly stateLabel: {
            readonly ok: "通过";
            readonly bad: "没通过";
            readonly warn: "需要注意";
            readonly idle: "未设置";
        };
    };
    readonly readOnly: {
        readonly title: "只能查看";
        readonly thisDevice: "这台设备";
        readonly body: (ip: string, machine: string) => string;
        /** 取不到电脑名时的说法。 */
        readonly thisMachine: "装 dsh 的电脑";
        readonly on: "开";
        readonly off: "关";
    };
    readonly time: {
        readonly justNow: "刚刚";
        readonly minutes: (n: number) => string;
        readonly hours: (n: number) => string;
        readonly days: (n: number) => string;
    };
    readonly undo: "撤销";
    readonly errors: {
        /** 请求根本没送到（网络断了、dsh 没在跑）。 */
        readonly noResponse: "没能保存，dsh 没有响应，稍后再试";
        /** dsh 收到了但拒绝了，又没有更具体的原因。 */
        readonly rejected: "没能保存，请刷新页面后再试";
        readonly localOnly: "只能在装 dsh 的电脑本机上修改";
        /** 保存成功后重新读取状态失败（页面保留原来的内容）。 */
        readonly refreshFailed: "已保存，但没能刷新状态，请稍后刷新页面";
        /** 定时刷新读不到状态（dsh 停了、断网）：只提示一次，恢复后不再提示。 */
        readonly pollFailed: "连不上 dsh，页面上显示的可能不是最新的";
        /** 允许列表的条目不合法、或已经有这个地址。 */
        readonly invalidSetting: "这个值 dsh 不接受，检查一下再试";
        readonly duplicate: "列表里已经有这个地址了";
    };
};
export type Strings = typeof zh;
