import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { transform } from "./babel-transformer";
import type { CodeFile } from "../index";

const moduleCache = new Map<string, string>();

export const transformMultipleFiles = (
  files: CodeFile[],
  dependencies: Record<string, any>
) => {
  moduleCache.clear();

  // Transform all files
  files.forEach((file) => {
    const { modifiedInput, exportedName } = removeDefaultExport(file.content);

    const dependencyVarMap = new Map<string, string>();
    Object.keys(dependencies).forEach((dep) => {
      const safeName = dep.replace(/[^a-zA-Z0-9_]/g, "_");
      dependencyVarMap.set(dep, safeName);
    });

    const transpiledCode = transform(modifiedInput, {
      presets: [
        ["typescript", { isTSX: true, allExtensions: true }],
        ["react"],
      ],
      plugins: [
        createImportTransformerPlugin(
          Object.keys(dependencies),
          dependencyVarMap,
          files
        ),
      ],
    }).code;

    moduleCache.set(file.name, {
      code: transpiledCode,
      exportedName,
    } as any);
  });

  const entryFile = files.find((f) => f.isEntry) || files[0];
  const entryModule = moduleCache.get(entryFile.name);

  if (!entryModule) {
    throw new Error("Entry module not found");
  }

  const dependencyVars = Object.keys(dependencies)
    .map((dep) => {
      const safeName = dep.replace(/[^a-zA-Z0-9_]/g, "_");
      return `const ${safeName} = dependencies['${dep}'];`;
    })
    .join("\n      ");

  // Create the module registry
  const moduleRegistryCode = `
    const moduleCache = new Map();
    const moduleDefinitions = new Map();
  `;

  // Create module definitions
  const moduleDefinitions = Array.from(moduleCache.entries())
    .map(([name, module]: [string, any]) => {
      const normalizedName = normalizeFilename(name);
      return `
        moduleDefinitions.set("${normalizedName}", function() {
          const module = { exports: {} };
          (function(module, exports) {
            ${module.code}
            ${
              module.exportedName
                ? `exports.default = ${module.exportedName};
               module.exports = ${module.exportedName};`
                : ""
            }
          })(module, module.exports);
          return module.exports;
        });
      `;
    })
    .join("\n\n");

  // Create module getter
  const moduleGetterCode = `
    function getModule(name) {
      if (!moduleCache.has(name)) {
        const moduleFactory = moduleDefinitions.get(name);
        if (!moduleFactory) {
          throw new Error(\`Module "\${name}" not found\`);
        }
        moduleCache.set(name, moduleFactory());
      }
      return moduleCache.get(name);
    }
  `;

  const entryModuleName = normalizeFilename(entryFile.name);

  return `
    return function(React, dependencies) {
      ${dependencyVars}
      
      ${moduleRegistryCode}
      
      ${moduleDefinitions}
      
      ${moduleGetterCode}

      const entryModule = getModule("${entryModuleName}");
      return entryModule.default || entryModule;
    }
  `;
};

const normalizeFilename = (filename: string) => {
  return filename.replace(/\.js$/, "").replace(/^\.\//, "");
};

const createImportTransformerPlugin = (
  allowedDependencies: string[],
  dependencyVarMap: Map<string, string>,
  localModules: CodeFile[]
) => {
  return () => ({
    name: "import-transformer",
    visitor: {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        const source = path.node.source.value;
        const specifiers = path.node.specifiers;

        if (specifiers.length === 0) return;

        const normalizedSource = normalizeFilename(source);
        const isLocalModule = localModules.some(
          (module) => normalizeFilename(module.name) === normalizedSource
        );

        if (
          !isLocalModule &&
          !allowedDependencies.includes(source) &&
          source !== "react"
        ) {
          throw new Error(`Module not found: ${source}`);
        }

        let newNodes: t.Statement[] = [];

        if (isLocalModule) {
          specifiers.forEach((specifier) => {
            if (t.isImportDefaultSpecifier(specifier)) {
              // For default imports, get the module and use its default export or the module itself
              newNodes.push(
                t.variableDeclaration("const", [
                  t.variableDeclarator(
                    t.identifier(specifier.local.name),
                    t.logicalExpression(
                      "||",
                      t.memberExpression(
                        t.callExpression(t.identifier("getModule"), [
                          t.stringLiteral(normalizedSource),
                        ]),
                        t.identifier("default")
                      ),
                      t.callExpression(t.identifier("getModule"), [
                        t.stringLiteral(normalizedSource),
                      ])
                    )
                  ),
                ])
              );
            } else if (t.isImportSpecifier(specifier)) {
              const imported = specifier.imported;
              const importedName = t.isIdentifier(imported)
                ? imported.name
                : t.isStringLiteral(imported)
                ? imported.value
                : null;

              if (importedName !== null) {
                newNodes.push(
                  t.variableDeclaration("const", [
                    t.variableDeclarator(
                      t.identifier(specifier.local.name),
                      t.memberExpression(
                        t.callExpression(t.identifier("getModule"), [
                          t.stringLiteral(normalizedSource),
                        ]),
                        t.identifier(importedName)
                      )
                    ),
                  ])
                );
              }
            }
          });
        } else {
          const sourceVarName =
            source === "react"
              ? "React"
              : dependencyVarMap.get(source) || source;

          specifiers.forEach((specifier) => {
            if (t.isImportDefaultSpecifier(specifier)) {
              newNodes.push(
                t.variableDeclaration("const", [
                  t.variableDeclarator(
                    t.identifier(specifier.local.name),
                    t.identifier(sourceVarName)
                  ),
                ])
              );
            } else if (t.isImportSpecifier(specifier)) {
              const imported = specifier.imported;
              const importedName = t.isIdentifier(imported)
                ? imported.name
                : t.isStringLiteral(imported)
                ? imported.value
                : null;

              if (importedName !== null) {
                newNodes.push(
                  t.variableDeclaration("const", [
                    t.variableDeclarator(
                      t.identifier(specifier.local.name),
                      t.memberExpression(
                        t.identifier(sourceVarName),
                        t.identifier(importedName)
                      )
                    ),
                  ])
                );
              }
            }
          });
        }

        path.replaceWithMultiple(newNodes);
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
