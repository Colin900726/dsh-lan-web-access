/**
 * 取 cordis 服务原对象。
 *
 * 经 ctx 拿到的服务是 cordis 代理：每次读函数属性都会得到新包一层的函数，拿它比较
 * 「现在装着的是不是我那个」永远不相等，还原就会被跳过。要比较或改写服务内部时，
 * 一律先用这个取原对象。
 */
export function rawService(service) {
    const original = service[Symbol.for('cordis.original')];
    return original ?? service;
}
