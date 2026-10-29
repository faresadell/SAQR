export interface FormState {
  error?: string;
  message?: string;
  fieldErrors?: Partial<Record<string, string>>;
}
