import * as fs from "fs/promises";
import * as path from "path";

export class FileStore {
  constructor(private readonly cacheDir: string) {}

  async read(hash: string): Promise<unknown | null> {
    const filePath = path.join(this.cacheDir, `${hash}.json`);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async write(hash: string, data: unknown): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    const filePath = path.join(this.cacheDir, `${hash}.json`);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }
}
