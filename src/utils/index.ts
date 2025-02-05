import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { transform } from "../utils/babel-transformer";

export const transformCode = (
  code: string,
  dependencies: Record<string, any>
) => {
  const { modifiedInput, exportedName } = removeDefaultExport(code);

  // Create a map of safe variable names
  const dependencyVarMap = new Map<string, string>();
  Object.keys(dependencies).map((dep) => {
    const safeName = dep.replace(/[^a-zA-Z0-9_]/g, "_");
    dependencyVarMap.set(dep, safeName);
    return safeName;
  });

  const transpiledCode = transform(modifiedInput, {
    presets: [["typescript", { isTSX: true, allExtensions: true }], ["react"]],
    plugins: [
      createImportTransformerPlugin(
        Object.keys(dependencies),
        dependencyVarMap
      ),
    ],
  }).code;

  // Create individual variable declarations for each dependency
  const dependencyVars = Array.from(dependencyVarMap.entries())
    .map(([original, safe]) => `const ${safe} = dependencies['${original}'];`)
    .join("\n      ");

  return `
    return function(React, dependencies) {
      ${dependencyVars}
      ${transpiledCode}
      return ${exportedName};
    }
  `;
};

const createImportTransformerPlugin = (
  allowedDependencies: string[],
  dependencyVarMap: Map<string, string>
) => {
  return () => ({
    name: "import-transformer",
    visitor: {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        const source = path.node.source.value;
        const specifiers = path.node.specifiers;

        if (specifiers.length === 0) return;

        // Check if the import source exactly matches any allowed dependency
        const isExactMatch = allowedDependencies.some((dep) => {
          // Handle both exact matches and subpath matches
          if (dep.endsWith("/*")) {
            const basePathPattern = dep.slice(0, -2);
            return source.startsWith(basePathPattern);
          }
          return dep === source;
        });

        if (!isExactMatch && source !== "react") {
          throw new Error(`Module not found: ${source}`);
        }

        // Get the base package name for mapping
        const basePackage = allowedDependencies.find((dep) => {
          if (dep.endsWith("/*")) {
            console.log({ dep, source });
            return source.startsWith(dep.slice(0, -2));
          }
          return source === dep;
        });

        const properties = specifiers
          .map((specifier) => {
            if (t.isImportSpecifier(specifier)) {
              const imported = specifier.imported;
              const importedName = t.isIdentifier(imported)
                ? imported.name
                : t.isStringLiteral(imported)
                ? imported.value
                : null;

              if (importedName === null) return null;

              return t.objectProperty(
                t.identifier(importedName),
                t.identifier(specifier.local.name),
                false,
                importedName === specifier.local.name
              );
            }
            return null;
          })
          .filter((prop): prop is t.ObjectProperty => prop !== null);

        const sourceVarName =
          (source === "react"
            ? "React"
            : basePackage
            ? dependencyVarMap.get(basePackage)
            : dependencyVarMap.get(source) || source) || source;

        const newDeclaration = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.objectPattern(properties),
            t.identifier(sourceVarName)
          ),
        ]);

        path.replaceWith(newDeclaration);
      },
    },
  });
};

export const removeDefaultExport = (
  input: string
): { modifiedInput: string; exportedName: string | null } => {
  const defaultExportWithDeclarationRegex =
    /export\s+default\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{]*\s*)?\s*{[^}]*}/;
  const defaultExportRegex = /export\s+default\s+([A-Za-z0-9_]+)(?:<[^>]*>)?;?/;
  const typeExportRegex = /export\s+type\s+[^;]+;/g;

  let match = input.match(defaultExportWithDeclarationRegex);
  let exportedName: string | null = null;
  let modifiedInput = input.replace(typeExportRegex, "");

  if (match) {
    exportedName = match[1];
    modifiedInput = modifiedInput
      .replace(/export\s+default\s+(?:async\s+)?function/, "function")
      .trim();
  } else {
    match = input.match(defaultExportRegex);
    if (match) {
      exportedName = match[1];
      modifiedInput = modifiedInput.replace(defaultExportRegex, "").trim();
    }
  }

  return { modifiedInput, exportedName };
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
