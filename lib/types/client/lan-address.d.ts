/**
 * 没选网卡时，挑一个别的设备最可能连得上的地址来显示：
 * 内网地址优先，真实网卡加分，虚拟网卡（WSL、Docker、虚拟机、代理工具等）排最后。
 */
/** 100.64.0.0/10：Tailscale 这类异地组网分的地址。 */
export declare function isOverlay(a: string): boolean;
export declare function pickLanAddress(ips: readonly {
    name: string;
    address: string;
}[]): string | undefined;
