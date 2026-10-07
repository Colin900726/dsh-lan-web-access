/** 取 cordis 服务的原对象。经 ctx 拿到的是代理，每次都不一样，比较或改写之前先取原对象。 */
export function rawService<T extends object>(service: T): T {
  const original = (service as Record<symbol, unknown>)[Symbol.for('cordis.original')];
  return (original as T | undefined) ?? service;
}
