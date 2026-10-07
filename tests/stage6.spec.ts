import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveUpdateCommand, manualUpdateCommand, allowLatestInstall } from '../src/updater.ts';
import { dshHome } from '../src/settings-store.ts';
import { resolveComputerName } from '../src/machine-name.ts';

afterEach(() => {
  delete process.env.DSH_REMOTE_ACCESS_UPDATE_CMD;
});

describe('R-022 一键更新的命令按系统选', () => {
  it('Given Windows Web，Then 用 dsh.cmd 并经 shell 启动', () => {
    expect(resolveUpdateCommand('web', '0.1.5', 'win32', undefined)).toEqual({
      cmd: 'dsh.cmd',
      args: ['plugin', '--profile', 'web', 'add', 'dsh-lan-web-access@0.1.5'],
      shell: true,
    });
  });
  it('Given macOS Web，Then 直接启动 dsh，不经 shell', () => {
    const c = resolveUpdateCommand('web', '0.1.5', 'darwin', undefined)!;
    expect(c.cmd).toBe('dsh');
    expect(c.shell).toBeUndefined();
  });
  it('Given Desktop（两个系统都一样），Then 用 Desktop 自带的运行时启动包里的 cli.js', () => {
    for (const platform of ['win32', 'darwin'] as const) {
      const c = resolveUpdateCommand('desktop', '0.1.5', platform, join('R', 'resources'))!;
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
  it('Given 找不到更新命令，Then 给出的手动命令装的是那个确切的新版本', () => {
    expect(manualUpdateCommand('web', '0.1.5')).toBe(
      'dsh plugin --profile web add dsh-lan-web-access@0.1.5',
    );
  });
  it('Given 备用来源，Then 国内镜像带 --registry，GitHub 装同版本的标签', () => {
    expect(resolveUpdateCommand('web', '0.1.6', 'darwin', undefined, 'mirror')!.args).toEqual([
      'plugin',
      '--profile',
      'web',
      'add',
      'dsh-lan-web-access@0.1.6',
      '--registry=https://registry.npmmirror.com',
    ]);
    expect(resolveUpdateCommand('web', '0.1.6', 'darwin', undefined, 'github')!.args.at(-1)).toBe(
      'github:Colin900726/dsh-lan-web-access#v0.1.6',
    );
  });
  it('Given 版本号里有 shell 能解释的字符，Then 不拼进命令行', () => {
    expect(resolveUpdateCommand('web', '0.1.5&calc', 'win32', undefined)).toBeUndefined();
    expect(resolveUpdateCommand('web', '0.2.0-rc.1', 'win32', undefined)).toBeDefined();
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

describe('R-007 只填包名安装总是装最新版：pnpm 冷静期放行名单里本插件只留不带版本号的一条', () => {
  const head = 'packages:\n  - .\n\nnodeLinker: hoisted\n';
  const list = (entries: string[]) =>
    `minimumReleaseAgeExclude:\n${entries.map((e) => `  - ${e}\n`).join('')}`;
  const tmp = (content?: string) => {
    const file = pathToFileURL(
      join(mkdtempSync(join(tmpdir(), 'dsh-allow-')), 'pnpm-workspace.yaml'),
    );
    if (content !== undefined) writeFileSync(file, content);
    return file;
  };
  it('Given 名单是「0.1.4、别的包、0.1.5、0.1.6」，Then 本插件只剩一条不带版本号的，别的包不动；再调一次不改', () => {
    const file = tmp(
      head +
        list([
          'dsh-lan-web-access@0.1.4',
          'other-plugin@1.0.0',
          "'dsh-lan-web-access@0.1.5'",
          'dsh-lan-web-access@0.1.6',
        ]),
    );
    expect(allowLatestInstall(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(
      head + list(['dsh-lan-web-access', 'other-plugin@1.0.0']),
    );
    expect(allowLatestInstall(file)).toBe(false);
  });
  it('Given 还没有名单，Then 加上只有一条不带版本号的名单', () => {
    const file = tmp(head);
    expect(allowLatestInstall(file)).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe(head + list(['dsh-lan-web-access']));
  });
  it('Given 名单是单行写法，Then 不动', () => {
    const file = tmp(head + 'minimumReleaseAgeExclude: [dsh-lan-web-access@0.1.4]\n');
    expect(allowLatestInstall(file)).toBe(false);
  });
  it('Given 设置文件不存在，Then 不报错、不新建', () => {
    expect(allowLatestInstall(tmp())).toBe(false);
  });
});
