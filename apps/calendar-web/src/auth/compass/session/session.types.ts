export interface CompassSession {
  authenticated: boolean;
  setAuthenticated: (value: boolean) => void;
}
