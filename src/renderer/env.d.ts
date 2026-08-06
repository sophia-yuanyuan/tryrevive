/// <reference types="vite/client" />

import type { DesktopBridge } from "@/shared/platform/contracts";

declare global {
  interface Window {
    tryRevive?: DesktopBridge;
  }
}

export {};
