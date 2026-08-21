/// <reference types="vite/client" />

// Vite `?url` imports resolve to a string asset URL at build time.
declare module "*.wasm?url" {
  const url: string;
  export default url;
}
