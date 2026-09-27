export interface BrowserKeyValueStore {
  isAvailable(): boolean;
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): boolean;
  keys(): string[];
}

class NativeBrowserKeyValueStore implements BrowserKeyValueStore {
  constructor(private readonly getStorage: () => Storage) {}

  private withStorage<T>(operation: (storage: Storage) => T, fallback: T): T {
    try {
      return operation(this.getStorage());
    } catch {
      return fallback;
    }
  }

  isAvailable(): boolean {
    return this.withStorage((storage) => {
      void storage.length;
      return true;
    }, false);
  }

  get(key: string): string | null {
    return this.withStorage((storage) => storage.getItem(key), null);
  }

  set(key: string, value: string): boolean {
    return this.withStorage((storage) => {
      storage.setItem(key, value);
      return true;
    }, false);
  }

  remove(key: string): boolean {
    return this.withStorage((storage) => {
      storage.removeItem(key);
      return true;
    }, false);
  }

  keys(): string[] {
    return this.withStorage(
      (storage) =>
        Array.from({ length: storage.length }, (_, index) =>
          storage.key(index),
        ).filter((key): key is string => key !== null),
      [],
    );
  }
}

export const createBrowserKeyValueStore = (
  getStorage: () => Storage,
): BrowserKeyValueStore => new NativeBrowserKeyValueStore(getStorage);

export const persistentBrowserStore = createBrowserKeyValueStore(
  () => localStorage,
);

export const sessionBrowserStore = createBrowserKeyValueStore(
  () => sessionStorage,
);
