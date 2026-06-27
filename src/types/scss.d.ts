/**
 * Ambient module declaration for SCSS files.
 * esbuild sass-plugin compiles .scss to a CSS string, which is injected
 * into the document via addStyle() at runtime.
 */
declare module "*.scss" {
  const css: string;
  export default css;
}