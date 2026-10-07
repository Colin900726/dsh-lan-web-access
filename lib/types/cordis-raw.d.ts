/** 取 cordis 服务的原对象。经 ctx 拿到的是代理，每次都不一样，比较或改写之前先取原对象。 */
export declare function rawService<T extends object>(service: T): T;
