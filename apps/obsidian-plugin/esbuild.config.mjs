import builtins from "builtin-modules";
import esbuild from "esbuild";

const production = process.argv.includes("--production");

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  // `obsidian` is injected by the host and node builtins are provided by
  // Electron, so neither may be bundled.
  external: ["obsidian", "electron", ...builtins],
  format: "cjs",
  target: "es2022",
  platform: "node",
  sourcemap: production ? false : "inline",
  minify: production,
  treeShaking: true,
  outfile: "main.js",
  logLevel: "info",
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
