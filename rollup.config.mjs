import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import peerDepsExternal from "rollup-plugin-peer-deps-external";

export default {
  input: "src/index.tsx",
  output: [
    {
      file: "dist/index.js",
      format: "cjs",
      sourcemap: true,
      exports: "named",
      interop: "auto",
    },
    {
      file: "dist/index.esm.js",
      format: "esm",
      sourcemap: true,
      exports: "named",
      interop: "auto",
    },
  ],
  plugins: [
    peerDepsExternal(),
    resolve({
      browser: true,
      preferBuiltins: false,
      exportConditions: ["node"],
    }),
    commonjs({
      requireReturnsDefault: "auto",
      dynamicRequireTargets: [
        "node_modules/@babel/standalone/**/*.js",
        "node_modules/@babel/core/**/*.js",
        "node_modules/@babel/preset-env/**/*.js",
        "node_modules/@babel/preset-react/**/*.js",
      ],
      ignoreDynamicRequires: false,
    }),
    typescript({
      tsconfig: "./tsconfig.json",
      declaration: true,
      declarationDir: "dist",
    }),
  ],
  external: ["react", "react-dom"],
};
