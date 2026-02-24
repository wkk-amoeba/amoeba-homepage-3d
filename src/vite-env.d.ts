/// <reference types="vite/client" />

declare const __DEBUG_PANEL__: boolean;

declare module '*.css' {
  const content: string;
  export default content;
}
