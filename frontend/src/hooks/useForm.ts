import { useState, useCallback } from "react";

export function useForm<T extends Record<string, any>>(initialState: T) {
  const [values, setValues] = useState(initialState);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }));
      if (errors[key as string]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[key as string];
          return next;
        });
      }
    },
    [errors]
  );

  const setMultiple = useCallback((updates: Partial<T>) => {
    setValues((prev) => ({ ...prev, ...updates }));
  }, []);

  const reset = useCallback(() => setValues(initialState), [initialState]);

  const setError = useCallback((key: keyof T, message: string) => {
    setErrors((prev) => ({ ...prev, [key]: message }));
  }, []);

  const clearErrors = useCallback(() => setErrors({}), []);

  return { values, set, setMultiple, reset, errors, setError, clearErrors };
}
