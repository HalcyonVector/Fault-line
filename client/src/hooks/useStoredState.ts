import { useEffect, useState } from 'react';

/** useState persisted to localStorage under `key`, falling back to `initial` on missing or corrupt values. */
export function useStoredState<T>(key: string, initial: T, validate?: (v: unknown) => v is T): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      const parsed = JSON.parse(raw);
      return !validate || validate(parsed) ? (parsed as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Private mode or full storage: the setting just won't persist.
    }
  }, [key, value]);
  return [value, setValue];
}
