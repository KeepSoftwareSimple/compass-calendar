import {
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useMemo,
  useState,
} from "react";
import { type z } from "zod/v4";

/**
 * Extracts field errors from a ZodError as Record<field, firstMessage>
 */
function getFieldErrors(error: z.ZodError): Record<string, string> {
  const flat = error.flatten();
  const result: Record<string, string> = {};
  for (const [field, messages] of Object.entries(flat.fieldErrors)) {
    const msg = Array.isArray(messages) ? messages[0] : undefined;
    if (msg) result[field] = msg;
  }
  return result;
}

export interface UseZodFormConfig<TValues extends Record<string, string>> {
  /** Zod schema - output type must match TValues */
  schema: z.ZodType<TValues, unknown>;
  initialValues: TValues;
  onSubmit: (data: TValues) => void | Promise<void>;
}

export interface UseZodFormReturn<TValues extends Record<string, string>> {
  values: TValues;
  errors: Partial<Record<keyof TValues & string, string>>;
  touched: Partial<Record<keyof TValues & string, boolean>>;
  handleChange: (
    field: keyof TValues & string,
  ) => (e: ChangeEvent<HTMLInputElement>) => void;
  handleBlur: (field: keyof TValues & string) => () => void;
  handleSubmit: (e: FormEvent) => void;
  isValid: boolean;
}

/**
 * Form hook that uses zod for validation.
 *
 * - Validates on blur only (errors shown after user leaves field)
 * - Clears field error when user types
 * - Full validation on submit
 */
export function useZodForm<TValues extends Record<string, string>>({
  schema,
  initialValues,
  onSubmit,
}: UseZodFormConfig<TValues>): UseZodFormReturn<TValues> {
  const [values, setValues] = useState<TValues>(initialValues);
  const [touched, setTouched] = useState<
    Partial<Record<keyof TValues & string, boolean>>
  >({});
  const [errors, setErrors] = useState<
    Partial<Record<keyof TValues & string, string>>
  >({});

  const validateField = useCallback(
    (field: keyof TValues & string, value: string): string | undefined => {
      const testData = { ...values, [field]: value };
      const result = schema.safeParse(testData);
      if (!result.success) {
        const fieldErrors = getFieldErrors(result.error);
        return fieldErrors[field];
      }
      return undefined;
    },
    [schema, values],
  );

  const handleChange = useCallback(
    (field: keyof TValues & string) => (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setValues((prev) => ({ ...prev, [field]: value }));

      if (touched[field]) {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [touched],
  );

  const handleBlur = useCallback(
    (field: keyof TValues & string) => () => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      const value = values[field];
      if (value.trim() !== "") {
        const error = validateField(field, value);
        setErrors((prev) => ({ ...prev, [field]: error }));
      } else {
        setErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    },
    [values, validateField],
  );

  const isValid = useMemo(
    () => schema.safeParse(values).success,
    [schema, values],
  );

  const handleSubmit = useCallback(
    (e: FormEvent): void => {
      e.preventDefault();

      const allTouched = Object.fromEntries(
        Object.keys(initialValues).map((key) => [key, true]),
      ) as Partial<Record<keyof TValues & string, boolean>>;
      setTouched(allTouched);

      const result = schema.safeParse(values);
      if (result.success) {
        void (async () => {
          try {
            await onSubmit(result.data);
          } catch (error) {
            // Error is handled by the onSubmit callback
            // Swallow the error to prevent unhandled promise rejection
            // since React form handlers don't await the returned promise
            if (process.env.NODE_ENV === "development") {
              console.error(error);
            }
          }
        })();
      } else {
        setErrors(
          getFieldErrors(result.error) as Partial<
            Record<keyof TValues & string, string>
          >,
        );
      }
    },
    [schema, values, onSubmit, initialValues],
  );

  return {
    values,
    errors,
    touched,
    handleChange,
    handleBlur,
    handleSubmit,
    isValid,
  };
}
