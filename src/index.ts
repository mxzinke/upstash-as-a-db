import type { Redis as UpstashRedis } from "@upstash/redis";
import Tokenizer from "./tokenization";
import isEqual from "lodash/isEqual";

export default class Collection<T extends { id: string | number }> {
  private readonly tokenizer: Tokenizer<T> | undefined;
  private readonly defaultTTL: number | null;
  private indexes: (keyof T)[] = [];
  public readonly keyPrefix: string;

  constructor(
    public readonly redis: UpstashRedis,
    meta?: {
      // The redis key prefix, e.g. id will be `customers:<id>` (default none)
      keyPrefix?: string;

      enableEncryption?: {
        iv: string;
        secret: string;
      };
      // Default TTL of every key set, excl. from `setex` (default none)
      defaultTTL?: number;
    },
  ) {
    this.keyPrefix = meta?.keyPrefix ? `${meta.keyPrefix}:` : "";
    this.defaultTTL = meta?.defaultTTL || null;

    if (meta?.enableEncryption) {
      this.tokenizer = new Tokenizer<T>(
        meta?.enableEncryption?.secret ?? "",
        meta?.enableEncryption?.iv ?? "",
      );
    }
  }

  private decrypt(data: any): T {
    return this.tokenizer
      ? this.tokenizer.fromToken(data as string)
      : (data as T);
  }
  private encrypt(data: T): any {
    return this.tokenizer ? this.tokenizer.toToken(data) : data;
  }

  public addIndex(indexOn: keyof T): CollectionIndex<T> {
    if (this.defaultTTL)
      throw new Error("Cannot add index to a auto-expiring collection.");
    this.indexes.push(indexOn);
    return new CollectionIndex<T>(this, indexOn);
  }

  public async get(id: T["id"]): Promise<T | null> {
    const data = await this.redis.get(`${this.keyPrefix}${id}`);
    if (!data) return null;
    return this.decrypt(data);
  }

  public async getMany(ids: T["id"][]): Promise<(T | null)[]> {
    if (!ids.length) return [];
    const datas = await this.redis.mget(
      ids.map((id) => `${this.keyPrefix}${id}`),
    );
    return datas.map((data: unknown) => {
      if (!data) return null;
      return this.decrypt(data);
    });
  }

  public async set(data: T, _expectedOld?: T): Promise<T> {
    if (this.defaultTTL) {
      return this.setex(data, this.defaultTTL);
    }

    const old = this.decrypt(
      await this.redis.set<T>(
        `${this.keyPrefix}${data.id}`,
        this.encrypt(data),
        {
          get: true,
          keepTtl: true,
        },
      ),
    );
    if (_expectedOld && !isEqual(old, _expectedOld)) {
      throw new Error(
        "Expected old data does not match the actual data. Concurrent update detected.",
      );
    }

    if (!this.indexes.length) return data;

    const pipeline = this.redis.pipeline();
    for (const indexOn of this.indexes) {
      pipeline.sadd(
        `${this.keyPrefix}idx_${indexOn.toString()}:${data[indexOn]}`,
        data.id,
      );
    }

    if (!old) {
      await pipeline.exec();
      return data;
    }

    // Remove old index entries, if needed
    const oldData = this.decrypt(old);
    for (const indexOn of this.indexes) {
      if (oldData[indexOn] !== data[indexOn]) {
        pipeline.srem(
          `${this.keyPrefix}idx_${indexOn.toString()}:${oldData[indexOn]}`,
          data.id,
        );
      }
    }
    if (pipeline.length() > 0) await pipeline.exec();

    return data;
  }

  // Note: This method can not be used, when having indexes installed!
  public async setex(data: T, ttl: number): Promise<T> {
    if (this.indexes.length)
      throw new Error(
        "Can't use Collection.setex when having indexes installed!",
      );

    await this.redis.set(`${this.keyPrefix}${data.id}`, this.encrypt(data), {
      ex: ttl,
      get: true,
    });

    return data;
  }

  public async update(
    id: T["id"],
    dataOrCb: Partial<T> | ((prevData: Omit<T, "id">) => Partial<T>),
    _retry = 0,
  ): Promise<T> {
    const item = await this.get(id);
    if (!item)
      throw new Error(
        `Item in collection ${this.keyPrefix} with id ${id} not found.`,
      );

    const { id: _, ...itemWithOutId } = item;
    const updatedItem =
      typeof dataOrCb === "function"
        ? { ...item, ...dataOrCb(itemWithOutId) }
        : { ...item, ...dataOrCb };

    try {
      const data = await this.set(updatedItem, item);

      return data;
    } catch (err) {
      if (_retry < 3) {
        console.warn(
          `Error while updating item in collection ${this.keyPrefix} with id ${id}. Retrying...`,
          err?.toString(),
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        return this.update(id, dataOrCb, _retry + 1);
      }
      throw new Error(
        `Error while updating item in collection ${this.keyPrefix} with id ${id}. No more retries left.`,
      );
    }
  }

  public async persist(id: T["id"]): Promise<void> {
    await this.redis.persist(`${this.keyPrefix}${id}`);
  }
}

class CollectionIndex<T extends { id: string | number }> {
  constructor(
    private readonly collection: Collection<T>,
    private readonly key: keyof T,
  ) {}

  public async getItems(value: T[keyof T]): Promise<T[]> {
    const members = await this.collection.redis.smembers<T["id"][]>(
      `${this.collection.keyPrefix}idx_${this.key.toString()}:${value}`,
    );
    if (!members.length) return [];
    const items = await this.collection.getMany(members);
    return items.filter((item) => item !== null) as T[];
  }
}
