import { describe, it, expect, afterEach } from 'vitest';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveUpdateCommand, manualUpdateCommand } from '../src/updater.ts';
import { dshHome } from '../src/settings-store.ts';
import { resolveComputerName } from '../src/machine-name.ts';

afterEach(() => {
  delete process.env.DSH_REMOTE_ACCESS_UPDATE_CMD;
});

describe('R-022 一键更新的命令按系统选', () => {
  it('Given Windows 网页版，Then 用 dsh.cmd 并经 shell 启动', () => {
    expect(resolveUpdateCommand('web', 'win32', undefined)).toEqual({
      cmd: 'dsh.cmd',
      args: ['plugin', '--profile', 'web', 'update', 'dsh-lan-web-access'],
      shell: true,
    });
  });
  it('Given macOS 网页版，Then 直接启动 dsh，不经 shell', () => {
    const c = resolveUpdateCommand('web', 'darwin', undefined);
    expect(c.cmd).toBe('dsh');
    expect(c.shell).toBeUndefined();
  });
  it('Given 桌面版（两个系统都一样），Then 用桌面版自带的运行时启动包里的 cli.js', () => {
    for (const platform of ['win32', 'darwin'] as const) {
      const c = resolveUpdateCommand('desktop', platform, join('R', 'resources'));
      expect(c.cmd).toBe(process.execPath);
      expect(c.args[1]).toBe(
        join(
          'R',
          'resources',
          'app.asar',
          'dsh',
          'node_modules',
          '@deepseek-ai',
          'dsh-desktop-host',
          'lib',
          'cli.js',
        ),
      );
      expect(c.env?.ELECTRON_RUN_AS_NODE).toBe('1');
    }
  });
  it('Given 找不到更新命令，Then 给出的手动命令带当前版本身份', () => {
    expect(manualUpdateCommand('web')).toBe('dsh plugin --profile web update dsh-lan-web-access');
  });
});

describe('R-022 数据目录与 dsh 自己的规则一致', () => {
  it('Given 没设 DSH_HOME 或设成空白，Then 用户目录/.dsh', () => {
    expect(dshHome({})).toBe(join(homedir(), '.dsh'));
    expect(dshHome({ DSH_HOME: '  ' })).toBe(join(homedir(), '.dsh'));
  });
  it('Given DSH_HOME 以 ~/ 或 ~\\ 开头，Then 展开到用户目录', () => {
    expect(dshHome({ DSH_HOME: '~/dsh-data' })).toBe(join(homedir(), 'dsh-data'));
    expect(dshHome({ DSH_HOME: '~\\dsh-data' })).toBe(join(homedir(), 'dsh-data'));
    expect(dshHome({ DSH_HOME: '~' })).toBe(homedir());
  });
  it('Given DSH_HOME 是相对路径，Then 转成绝对路径（和 dsh 一样）', () => {
    expect(dshHome({ DSH_HOME: 'rel/dir' })).toBe(resolve('rel/dir'));
  });
});

describe('R-022 / R-021 电脑名', () => {
  it('Given Windows，Then 取计算机名', () => {
    expect(resolveComputerName('win32', { COMPUTERNAME: 'OFFICE-PC' }, () => '', 'x')).toBe(
      'OFFICE-PC',
    );
  });
  it('Given macOS，Then 取「关于本机」里的名称', () => {
    expect(resolveComputerName('darwin', {}, () => 'Mac mini\n', 'mac-mini.local')).toBe(
      'Mac mini',
    );
  });
  it('Given 取不到，Then 用主机名并去掉 .local', () => {
    expect(resolveComputerName('win32', {}, () => '', 'desk')).toBe('desk');
    expect(
      resolveComputerName(
        'darwin',
        {},
        () => {
          throw new Error('no scutil');
        },
        'mac-mini.local',
      ),
    ).toBe('mac-mini');
  });
});

describe('R-022 / R-009 访问地址挑哪块网卡', () => {
  it('Given Windows 上有 WSL 虚拟网卡和 Wi-Fi，Then 显示 Wi-Fi 的地址', async () => {
    const { pickLanAddress } = await import('../src/client/lan-address.ts');
    expect(
      pickLanAddress([
        { name: 'vEthernet (WSL)', address: '172.20.48.1' },
        { name: 'Wi-Fi', address: '192.168.1.20' },
      ]),
    ).toBe('192.168.1.20');
  });
  it('Given macOS 上有代理工具的 utun 和 en0，Then 显示 en0 的地址', async () => {
    const { pickLanAddress } = await import('../src/client/lan-address.ts');
    expect(
      pickLanAddress([
        { name: 'en0', address: '192.168.1.20' },
        { name: 'utun6', address: '198.18.0.1' },
      ]),
    ).toBe('192.168.1.20');
  });
  it('Given 只有 Tailscale，Then 显示 Tailscale 的地址；没有网卡，Then 不显示', async () => {
    const { pickLanAddress } = await import('../src/client/lan-address.ts');
    expect(pickLanAddress([{ name: 'Tailscale', address: '100.101.1.2' }])).toBe('100.101.1.2');
    expect(pickLanAddress([])).toBeUndefined();
  });
});
