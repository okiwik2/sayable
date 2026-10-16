/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;

declare module 'opencc-js' {
  export function Converter(opts: { from: string; to: string }): (text: string) => string;
}
