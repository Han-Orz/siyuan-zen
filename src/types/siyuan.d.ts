/**
 * Ambient type augmentation for SiYuan global Window object.
 * Dedicated .d.ts so TypeScript treats it as ambient regardless of
 * whether src/types/index.ts exists as a module.
 */
declare global {
  interface Window {
    siyuan?: {
      ws?: {
        ws?: WebSocket;
      };
      zIndex?: number;
    };
  }
}

export {};
