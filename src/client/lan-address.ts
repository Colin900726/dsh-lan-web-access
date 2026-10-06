/**
 * 设置页显示哪个「访问地址」：没选网卡时，从本机网卡里挑一个别的设备最可能连得上的（R-009 / R-022）。
 * 网卡名 macOS 是 en0 / en1，Windows 是「Wi-Fi」「以太网」「Ethernet」，所以不只看名字，按分数挑：
 * 家庭 / 公司内网地址优先，真实网卡加分，虚拟网卡（WSL、Hyper-V、Docker、虚拟机、代理工具的 utun）排最后。
 */

const VIRTUAL =
  /vEthernet|WSL|Hyper-V|VirtualBox|VMware|vmnet|docker|^br-|bridge|^utun|^tun|^tap|Npcap|Loopback/i;
const PHYSICAL = /^(en|eth|wlan|wl)\d|^Wi-?Fi|^WLAN|^Ethernet|以太网|无线/i;

function isPrivate(a: string): boolean {
  const [x = 0, y = 0] = a.split('.').map(Number);
  return x === 10 || (x === 192 && y === 168) || (x === 172 && y >= 16 && y <= 31);
}

/** 100.64.0.0/10：Tailscale 这类异地组网分的地址。 */
export function isOverlay(a: string): boolean {
  const [x = 0, y = 0] = a.split('.').map(Number);
  return x === 100 && y >= 64 && y <= 127;
}

function score(nic: { name: string; address: string }): number {
  let s = 0;
  if (isPrivate(nic.address)) s += 4;
  else if (isOverlay(nic.address)) s += 2;
  if (PHYSICAL.test(nic.name)) s += 2;
  if (VIRTUAL.test(nic.name)) s -= 8;
  return s;
}

export function pickLanAddress(
  ips: readonly { name: string; address: string }[],
): string | undefined {
  let best: { name: string; address: string } | undefined;
  for (const nic of ips) if (best === undefined || score(nic) > score(best)) best = nic;
  return best?.address;
}
