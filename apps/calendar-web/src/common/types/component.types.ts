export interface ClassNamedComponent {
  className?: string;
}

export interface UnderlinedInput {
  underlineColor?: string;
  withUnderline?: boolean;
}

export interface SelectOption<T> {
  value: T;
  label: string;
}
