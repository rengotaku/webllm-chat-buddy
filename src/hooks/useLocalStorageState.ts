import { useState, useEffect, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

/**
 * useState 互換の localStorage 永続化フック
 *
 * @param key - localStorage のキー名
 * @param defaultValue - デフォルト値またはデフォルト値を返す関数
 * @returns [state, setState]
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T | (() => T)
): [T, Dispatch<SetStateAction<T>>] {
  const getInitialValue = useCallback((): T => {
    const fallback =
      typeof defaultValue === "function" ? (defaultValue as () => T)() : defaultValue;

    if (typeof window === "undefined") {
      return fallback;
    }

    try {
      const item = window.localStorage.getItem(key);
      if (item === null) {
        return fallback;
      }
      return JSON.parse(item) as T;
    } catch {
      return fallback;
    }
  }, [key, defaultValue]);

  const [state, setState] = useState<T>(getInitialValue);
  const [prevKey, setPrevKey] = useState<string>(key);

  // Synchronize state when key changes during rendering
  if (prevKey !== key) {
    setPrevKey(key);
    setState(getInitialValue());
  }

  const setLocalStorageState: Dispatch<SetStateAction<T>> = useCallback(
    (value: SetStateAction<T>) => {
      setState((prevState) => {
        const nextState =
          typeof value === "function" ? (value as (prev: T) => T)(prevState) : value;

        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(key, JSON.stringify(nextState));
          } catch (error) {
            console.error(`Error setting localStorage key "${key}":`, error);
          }
        }
        return nextState;
      });
    },
    [key]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      // event.key is null when the change came from localStorage.clear();
      // in that case every key (including this one) was wiped, so treat it
      // the same as this key being removed.
      const isClearEvent = event.key === null;
      if (!isClearEvent && event.key !== key) return;

      if (isClearEvent || event.newValue === null) {
        const fallback =
          typeof defaultValue === "function" ? (defaultValue as () => T)() : defaultValue;
        setState(fallback);
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue) as T;
        setState(parsed);
      } catch {
        const fallback =
          typeof defaultValue === "function" ? (defaultValue as () => T)() : defaultValue;
        setState(fallback);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => {
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [key, defaultValue]);

  return [state, setLocalStorageState];
}
