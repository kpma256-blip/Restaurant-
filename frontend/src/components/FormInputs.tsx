import { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export function FormField({ label, required, error, hint, children }: FormFieldProps) {
  return (
    <div>
      <label className="label">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextInput({ label, error, hint, ...props }: TextInputProps) {
  return (
    <FormField label={label} required={props.required} error={error} hint={hint}>
      <input className={`input w-full ${error ? "border-rose-300" : ""}`} {...props} />
    </FormField>
  );
}

interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export function SelectInput({ label, error, hint, options, placeholder, ...props }: SelectInputProps) {
  return (
    <FormField label={label} required={props.required} error={error} hint={hint}>
      <select className={`input w-full ${error ? "border-rose-300" : ""}`} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FormField>
  );
}

interface NumberInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function NumberInput({ label, error, hint, ...props }: NumberInputProps) {
  return (
    <FormField label={label} required={props.required} error={error} hint={hint}>
      <input className={`input w-full ${error ? "border-rose-300" : ""}`} type="number" {...props} />
    </FormField>
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextArea({ label, error, hint, ...props }: TextAreaProps) {
  return (
    <FormField label={label} required={props.required} error={error} hint={hint}>
      <textarea className={`input w-full resize-none ${error ? "border-rose-300" : ""}`} rows={4} {...props} />
    </FormField>
  );
}
