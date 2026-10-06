/**
 * 设置页显示哪个「访问地址」：没选网卡时，从本机网卡里挑一个别的设备最可能连得上的（R-009 / R-022）。
 * 网卡名 macOS 是 en0 / en1，Windows 是「Wi-Fi」「以太网」「Ethernet」，所以不只看名字，按分数挑：
 * 家庭 / 公司内网地址优先，真实网卡加分，虚拟网卡（WSL、Hyper-V、Docker、虚拟机、代理工具的 utun）排最后。
 */
/** 100.64.0.0/10：Tailscale 这类异地组网分的地址。 */
export declare function isOverlay(a: string): boolean;
export declare function pickLanAddress(ips: readonly {
    name: string;
    address: string;
}[]): string | undefined;
