import { readFile } from "node:fs/promises";
import { LRUCache } from "lru-cache";

export class ArtifactCache {
  private cache: LRUCache<string, string>;

  constructor(
    options: { max?: number; maxSize?: number; ttl?: number } = {}
  ) {
    this.cache = new LRUCache<string, string>({
      max: options.max ?? 100,
      maxSize: options.maxSize ?? 50_000_000,
      sizeCalculation: (value) => Buffer.byteLength(value),
      ttl: options.ttl ?? 1000 * 60 * 30,
    });
  }

  async loadArtifact(path: string): Promise<string> {
    const cached = this.cache.get(path);
    if (cached !== undefined) return cached;

    try {
      const content = await readFile(path, "utf-8");
      this.cache.set(path, content);
      return content;
    } catch {
      return "";
    }
  }

  clear(): void {
    this.cache.clear();
  }

  stats(): { size: number; items: number } {
    return {
      size: this.cache.calculatedSize,
      items: this.cache.size,
    };
  }
}
