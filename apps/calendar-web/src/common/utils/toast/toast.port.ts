import {
  type Id,
  toast as productionToast,
  type ToastContent,
  type ToastOptions,
} from "react-toastify";

export type ToastApi = Pick<
  typeof productionToast,
  | "error"
  | "info"
  | "success"
  | "warning"
  | "warn"
  | "loading"
  | "promise"
  | "dark"
  | "done"
  | "onChange"
  | "clearWaitingQueue"
  | "dismiss"
  | "update"
  | "isActive"
> &
  ((content: ToastContent, options?: ToastOptions) => Id);

export interface ToastPort {
  toast: ToastApi;
}

const productionToastPort: ToastPort = { toast: productionToast as ToastApi };

let toastPort: ToastPort = productionToastPort;

export function getToast(): ToastApi {
  return toastPort.toast;
}

export function registerToastPort(port: ToastPort): void {
  toastPort = port;
}

export function resetToastPort(): void {
  toastPort = productionToastPort;
}
