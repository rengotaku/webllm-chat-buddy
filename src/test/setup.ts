import "@testing-library/jest-dom/vitest";
import { beforeAll, afterEach, afterAll, vi } from "vitest";
import { server } from "./mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Ensure complete localStorage mock and StorageEvent compatibility in test environment (Node.js 22+ / jsdom)
if (typeof window !== "undefined") {
  const store = new Map<string, string>();

  const storageMock: Storage = {
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      store.set(key, String(value));
    },
    removeItem: (key: string): void => {
      store.delete(key);
    },
    clear: (): void => {
      store.clear();
    },
    key: (index: number): string | null => Array.from(store.keys())[index] ?? null,
    get length(): number {
      return store.size;
    },
  };

  vi.stubGlobal("localStorage", storageMock);
  window.localStorage = storageMock;

  class FlexibleStorageEvent extends Event implements StorageEvent {
    readonly key: string | null;
    readonly oldValue: string | null;
    readonly newValue: string | null;
    readonly url: string;
    readonly storageArea: Storage | null;

    constructor(type: string, eventInitDict?: StorageEventInit) {
      super(type, eventInitDict);
      this.key = eventInitDict?.key ?? null;
      this.oldValue = eventInitDict?.oldValue ?? null;
      this.newValue = eventInitDict?.newValue ?? null;
      this.url = eventInitDict?.url ?? "";
      this.storageArea = eventInitDict?.storageArea ?? null;
    }

    initStorageEvent(): void {
      // no-op legacy initializer
    }
  }

  vi.stubGlobal("StorageEvent", FlexibleStorageEvent);
  window.StorageEvent = FlexibleStorageEvent as unknown as typeof StorageEvent;
}
