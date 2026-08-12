import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useLocalStorageState } from "./useLocalStorageState";

describe("useLocalStorageState", () => {
  const TEST_KEY = "test_key";

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // S1 初期値 — 前提: 対象キーが localStorage に無い。手順: フック初期化。期待: 初期値が返る。観点: 未保存状態の既定動作
  it("S1 初期値: returns default value when key is not in localStorage", () => {
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, "default_value"));
    expect(result.current[0]).toBe("default_value");
    expect(localStorage.getItem(TEST_KEY)).toBeNull();
  });

  it("S1 初期値 (関数初期値): returns default value from lazy function when key is not in localStorage", () => {
    const { result } = renderHook(() =>
      useLocalStorageState(TEST_KEY, () => "lazy_default")
    );
    expect(result.current[0]).toBe("lazy_default");
  });

  it("returns stored value if key exists in localStorage", () => {
    localStorage.setItem(TEST_KEY, JSON.stringify("existing_value"));
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, "default_value"));
    expect(result.current[0]).toBe("existing_value");
  });

  // S2 永続化 — 前提: 初期化済み。手順: setState。期待: state 更新と同時に localStorage に JSON で保存される。観点: 保存漏れ検知
  it("S2 永続化: updates state and saves to localStorage on setState", () => {
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, "initial"));

    act(() => {
      result.current[1]("updated");
    });

    expect(result.current[0]).toBe("updated");
    expect(localStorage.getItem(TEST_KEY)).toBe(JSON.stringify("updated"));
  });

  it("S2 永続化 (関数更新): updates state with updater function and persists", () => {
    const { result } = renderHook(() => useLocalStorageState<number>(TEST_KEY, 10));

    act(() => {
      result.current[1]((prev) => prev + 5);
    });

    expect(result.current[0]).toBe(15);
    expect(localStorage.getItem(TEST_KEY)).toBe(JSON.stringify(15));
  });

  // S3 破損データ耐性 — 前提: 対象キーに不正 JSON を仕込む。手順: フック初期化。期待: throw せず初期値にフォールバック。観点: 破損 storage でのクラッシュ防止
  it("S3 破損データ耐性: falls back to default value without throwing on invalid JSON", () => {
    localStorage.setItem(TEST_KEY, "invalid-json-{");

    let hookResult:
      { current: ReturnType<typeof useLocalStorageState<string>> } | undefined;
    expect(() => {
      const { result } = renderHook(() => useLocalStorageState(TEST_KEY, "fallback"));
      hookResult = result;
    }).not.toThrow();

    expect(hookResult?.current[0]).toBe("fallback");
  });

  // S4 他タブ同期 — 前提: 初期化済み。手順: storage イベントを dispatch。期待: state が新値に追従。観点: マルチタブ整合
  it("S4 他タブ同期: updates state when storage event is dispatched", () => {
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, "initial"));

    act(() => {
      const storageEvent = new StorageEvent("storage", {
        key: TEST_KEY,
        newValue: JSON.stringify("remote_updated"),
        storageArea: window.localStorage,
      });
      window.dispatchEvent(storageEvent);
    });

    expect(result.current[0]).toBe("remote_updated");
  });

  it("S4 他タブ同期 (削除時): falls back to default when storage key is removed", () => {
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, "default_value"));

    act(() => {
      result.current[1]("some_value");
    });
    expect(result.current[0]).toBe("some_value");

    act(() => {
      const storageEvent = new StorageEvent("storage", {
        key: TEST_KEY,
        newValue: null,
        storageArea: window.localStorage,
      });
      window.dispatchEvent(storageEvent);
    });

    expect(result.current[0]).toBe("default_value");
  });

  // 回帰: 別タブの localStorage.clear() は storage イベントの key が null で届く。
  // key 一致条件のみだと同期されず削除済みの値を保持し続けるため、key===null もデフォルト値へ戻す
  it("回帰: falls back to default value when storage event key is null (localStorage.clear())", () => {
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, "default_value"));

    act(() => {
      result.current[1]("some_value");
    });
    expect(result.current[0]).toBe("some_value");

    act(() => {
      const storageEvent = new StorageEvent("storage", {
        key: null,
        newValue: null,
        storageArea: window.localStorage,
      });
      window.dispatchEvent(storageEvent);
    });

    expect(result.current[0]).toBe("default_value");
  });
});
