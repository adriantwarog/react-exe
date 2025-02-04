import * as Babel from "@babel/standalone";

export const transform = (code: string, options = {}) => {
  return Babel.transform(code, {
    presets: ["env", "react"],
    ...options,
  });
};

export const transformAsync = async (code: string, options = {}) => {
  return (Babel as any).transformAsync(code, {
    presets: ["env", "react"],
    ...options,
  });
};
