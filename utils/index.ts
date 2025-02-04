import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import * as Babel from "@babel/standalone";

export const transformCode = (
  code: string,
  dependencies: Record<string, any>
) => {
  const { modifiedInput, exportedName } = removeDefaultExport(code);

  const transpiledCode = Babel.transform(modifiedInput, {
    presets: [["typescript", { isTSX: true, allExtensions: true }], ["react"]],
    plugins: [createImportTransformerPlugin(Object.keys(dependencies))],
  }).code;

  return `
    return function(React, dependencies) {
      const { ${Object.keys(dependencies).join(", ")} } = dependencies;
      ${transpiledCode}
      return ${exportedName};
    }
  `;
};

const createImportTransformerPlugin = (allowedDependencies: string[]) => {
  return () => ({
    name: "import-transformer",
    visitor: {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        const source = path.node.source.value;
        const specifiers = path.node.specifiers;

        if (specifiers.length === 0) return;

        if (!allowedDependencies.includes(source) && source !== "react") {
          throw new Error(`Unauthorized import: ${source}`);
        }

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

        const newDeclaration = t.variableDeclaration("const", [
          t.variableDeclarator(
            t.objectPattern(properties),
            source === "react" ? t.identifier("React") : t.identifier(source)
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
