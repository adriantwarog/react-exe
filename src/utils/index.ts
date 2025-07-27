import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { transform } from "./babel-transformer";
import type { CodeFile } from "../index";

const moduleCache = new Map<string, string>();

// Registry of popular dependencies that can be auto-loaded
const POPULAR_DEPENDENCIES: Record<string, string> = {
  "lucide-react": "https://esm.sh/lucide-react@0.513.0",
  "framer-motion": "https://esm.sh/framer-motion@11.0.8",
  "react-router-dom": "https://esm.sh/react-router-dom@6.22.0",
  "date-fns": "https://esm.sh/date-fns@3.6.0",
  "lodash": "https://esm.sh/lodash@4.17.21",
  "axios": "https://esm.sh/axios@1.6.7",
  "clsx": "https://esm.sh/clsx@2.1.0",
  "react-hook-form": "https://esm.sh/react-hook-form@7.50.1",
  "zod": "https://esm.sh/zod@3.22.4",
  "recharts": "https://esm.sh/recharts@2.12.2",
  "react-query": "https://esm.sh/@tanstack/react-query@5.25.0",
  "@tanstack/react-query": "https://esm.sh/@tanstack/react-query@5.25.0",
  "react-icons": "https://esm.sh/react-icons@5.0.1",
  "react-hot-toast": "https://esm.sh/react-hot-toast@2.4.1",
  "zustand": "https://esm.sh/zustand@4.5.2",
};

// Module loader for URL-based dependencies
class ModuleLoader {
  private static cache = new Map<string, any>();
  private static loadingPromises = new Map<string, Promise<any>>();

  static async loadModule(
    url: string, 
    allowedDomains: string[] = ['esm.sh', 'cdn.skypack.dev', 'unpkg.com', 'jspm.dev'],
    externalCache?: Map<string, any>
  ): Promise<any> {
    // Check external cache first
    if (externalCache?.has(url)) {
      return externalCache.get(url);
    }

    // Check internal cache
    if (this.cache.has(url)) {
      return this.cache.get(url);
    }

    // Check if already loading
    if (this.loadingPromises.has(url)) {
      return this.loadingPromises.get(url);
    }

    // Validate URL domain
    try {
      const urlObj = new URL(url);
      const isAllowed = allowedDomains.some(domain => 
        urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
      );
      
      if (!isAllowed) {
        throw new Error(`Domain ${urlObj.hostname} is not in the allowed domains list: ${allowedDomains.join(', ')}`);
      }
    } catch (error) {
      throw new Error(`Invalid URL or domain not allowed: ${url}`);
    }

    // Start loading
    const loadingPromise = this.loadModuleInternal(url, externalCache);
    this.loadingPromises.set(url, loadingPromise);

    try {
      const module = await loadingPromise;
      this.cache.set(url, module);
      if (externalCache) {
        externalCache.set(url, module);
      }
      return module;
    } finally {
      this.loadingPromises.delete(url);
    }
  }

  private static async loadModuleInternal(url: string, externalCache?: Map<string, any>): Promise<any> {
    try {
      // First try dynamic import
      console.log(`🔄 Attempting dynamic import for: ${url}`);
      const module = await import(/* webpackIgnore: true */ url);
      console.log(`✅ Dynamic import successful for: ${url}`);
      return module;
    } catch (dynamicImportError) {
      console.warn(`❌ Dynamic import failed for ${url}:`, dynamicImportError);
      
      // Fallback: Try loading via script tag (for iframe environments)
      try {
        console.log(`🔄 Attempting script tag fallback for: ${url}`);
        const module = await this.loadViaScriptTag(url);
        console.log(`✅ Script tag fallback successful for: ${url}`);
        return module;
      } catch (scriptError) {
        console.warn(`❌ Script tag fallback failed for ${url}:`, scriptError);
        
        // Last resort: Try fetch + eval (for very restrictive environments)
        try {
          console.log(`🔄 Attempting fetch + eval fallback for: ${url}`);
          const module = await this.loadViaFetchEval(url);
          console.log(`✅ Fetch + eval fallback successful for: ${url}`);
          return module;
        } catch (fetchError) {
          console.error(`❌ All loading methods failed for ${url}:`, {
            dynamicImportError: dynamicImportError.message,
            scriptError: scriptError.message,
            fetchError: fetchError.message
          });
          throw new Error(`Failed to load module from ${url}. All methods failed. Last error: ${fetchError.message}`);
        }
      }
    }
  }

  private static async loadViaScriptTag(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      // Create a unique global variable name
      const globalVarName = `__esm_module_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create script element
      const script = document.createElement('script');
      script.type = 'module';
      
      // Create a wrapper that assigns the module to a global variable
      const moduleCode = `
        import * as module from '${url}';
        window.${globalVarName} = module;
        window.dispatchEvent(new CustomEvent('${globalVarName}_loaded'));
      `;
      
      script.textContent = moduleCode;
      
      // Set up event listeners
      const cleanup = () => {
        document.head.removeChild(script);
        delete (window as any)[globalVarName];
      };
      
      // Listen for successful load
      window.addEventListener(`${globalVarName}_loaded`, () => {
        const module = (window as any)[globalVarName];
        cleanup();
        resolve(module);
      }, { once: true });
      
      // Handle errors
      script.onerror = () => {
        cleanup();
        reject(new Error(`Failed to load module via script tag: ${url}`));
      };
      
      // Set timeout
      setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout loading module via script tag: ${url}`));
      }, 10000);
      
      // Add to document
      document.head.appendChild(script);
    });
  }

  private static async loadViaFetchEval(url: string): Promise<any> {
    try {
      // Fetch the module code
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const moduleCode = await response.text();
      
      // Create a module-like environment
      const moduleExports: any = {};
      const moduleScope = {
        exports: moduleExports,
        module: { exports: moduleExports },
        require: (id: string) => {
          throw new Error(`require('${id}') not supported in fetch+eval fallback`);
        },
        import: (id: string) => {
          throw new Error(`import('${id}') not supported in fetch+eval fallback`);
        },
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
      };
      
      // Transform ESM syntax to CommonJS-like for eval
      let transformedCode = moduleCode;
      
      // Simple ESM to CommonJS transformation
      transformedCode = transformedCode.replace(
        /export\s+default\s+(.*?)(?:;|$)/gm,
        'module.exports.default = $1;'
      );
      
      transformedCode = transformedCode.replace(
        /export\s+(?:const|let|var|function|class)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm,
        (match, name) => {
          return match.replace('export ', '') + `\nmodule.exports.${name} = ${name};`;
        }
      );
      
      transformedCode = transformedCode.replace(
        /export\s*\{([^}]+)\}/gm,
        (match, exports) => {
          const exportList = exports.split(',').map((e: string) => e.trim());
          return exportList.map((exp: string) => `module.exports.${exp} = ${exp};`).join('\n');
        }
      );
      
      // Remove import statements (they won't work in this context)
      transformedCode = transformedCode.replace(/import\s+.*?from\s+['"][^'"]*['"];?\s*/gm, '');
      
      // Create function and execute
      const func = new Function(...Object.keys(moduleScope), transformedCode);
      func(...Object.values(moduleScope));
      
      // Return the exports
      return moduleExports.default || moduleExports;
      
    } catch (error) {
      throw new Error(`Fetch+eval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static clearCache(): void {
    this.cache.clear();
    this.loadingPromises.clear();
  }

  static getCacheSize(): number {
    return this.cache.size;
  }
}

// Function to detect imports in code
export function detectImports(codeFiles: CodeFile[]): Set<string> {
  const detectedImports = new Set<string>();
  
  console.log('🔍 Detecting imports in files:', codeFiles.map(f => ({ name: f.name, contentLength: f.content.length })));
  
  codeFiles.forEach(file => {
    const content = file.content;
    console.log(`📄 Analyzing file: ${file.name}`);
    console.log(`📝 Content preview:`, content.substring(0, 200) + '...');
    
    // Match various import patterns
    const importPatterns = [
      // import ... from 'module'
      /import\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/g,
      // import('module')
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      // require('module')
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    
    importPatterns.forEach((pattern, index) => {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const moduleName = match[1];
        console.log(`🎯 Found import with pattern ${index}: "${moduleName}"`);
        
        // Skip relative imports (starting with . or /)
        if (!moduleName.startsWith('.') && !moduleName.startsWith('/')) {
          detectedImports.add(moduleName);
          console.log(`✅ Added to detected imports: "${moduleName}"`);
        } else {
          console.log(`⏭️ Skipped relative import: "${moduleName}"`);
        }
      }
    });
  });
  
  console.log('🎯 Final detected imports:', Array.from(detectedImports));
  return detectedImports;
}

// Function to resolve auto-loadable dependencies
export async function resolveAutoDependencies(
  detectedImports: Set<string>,
  customDependencyRegistry: Record<string, string> = {},
  allowedDomains?: string[],
  externalCache?: Map<string, any>
): Promise<Record<string, any>> {
  const autoDependencies: Record<string, any> = {};
  const loadPromises: Promise<void>[] = [];
  
  // Merge custom registry with popular dependencies (custom takes precedence)
  const dependencyRegistry = { ...POPULAR_DEPENDENCIES, ...customDependencyRegistry };
  
  console.log('🔍 Resolving auto-dependencies for imports:', Array.from(detectedImports));
  console.log('📚 Available dependency registry:', Object.keys(dependencyRegistry));
  
  // Convert Set to Array for iteration compatibility
  const importsArray = Array.from(detectedImports);
  
  for (const importName of importsArray) {
    const url = dependencyRegistry[importName];
    
    console.log(`🔎 Checking import "${importName}": ${url ? `found URL ${url}` : 'not in registry'}`);
    
    if (url) {
      const loadPromise = ModuleLoader.loadModule(url, allowedDomains, externalCache)
        .then(module => {
          autoDependencies[importName] = module;
          console.log(`✅ Auto-loaded dependency: ${importName} from ${url}`);
        })
        .catch(error => {
          console.warn(`❌ Failed to auto-load dependency '${importName}' from ${url}:`, error.message);
          // Don't throw here - just skip this dependency and let the import transformer handle the error
        });
      
      loadPromises.push(loadPromise);
    } else {
      console.log(`⏭️ Skipping "${importName}" - not in auto-dependency registry`);
    }
  }
  
  // Wait for all auto-dependencies to load
  if (loadPromises.length > 0) {
    console.log(`⏳ Waiting for ${loadPromises.length} dependencies to load...`);
    await Promise.all(loadPromises);
  }
  
  console.log('🎉 Auto-dependencies resolved:', Object.keys(autoDependencies));
  return autoDependencies;
}

// Enhanced dependency processing function
export async function processDependencies(
  codeFiles: CodeFile[],
  manualDependencies: Record<string, any | string> = {},
  config: {
    enableAutoDependencies?: boolean;
    customDependencyRegistry?: Record<string, string>;
    allowedDomains?: string[];
    externalCache?: Map<string, any>;
  } = {}
): Promise<Record<string, any>> {
  const {
    enableAutoDependencies = true,
    customDependencyRegistry = {},
    allowedDomains,
    externalCache
  } = config;
  
  let processedDependencies: Record<string, any> = {};
  
  // Process manual dependencies first (URLs and objects)
  const manualLoadPromises: Promise<void>[] = [];
  
  for (const [key, value] of Object.entries(manualDependencies)) {
    if (typeof value === 'string' && value.startsWith('http')) {
      // This is a URL dependency
      const loadPromise = ModuleLoader.loadModule(value, allowedDomains, externalCache)
        .then(module => {
          processedDependencies[key] = module;
        })
        .catch(error => {
          throw new Error(`Failed to load manual dependency '${key}' from ${value}: ${error.message}`);
        });
      
      manualLoadPromises.push(loadPromise);
    } else {
      // This is a regular object dependency
      processedDependencies[key] = value;
    }
  }
  
  // Wait for manual dependencies to load
  if (manualLoadPromises.length > 0) {
    await Promise.all(manualLoadPromises);
  }
  
  // Auto-detect and load dependencies if enabled
  if (enableAutoDependencies) {
    console.log('🚀 Auto-dependency detection enabled');
    const detectedImports = detectImports(codeFiles);
    console.log('📦 Detected imports:', Array.from(detectedImports));
    
    const autoDependencies = await resolveAutoDependencies(
      detectedImports,
      customDependencyRegistry,
      allowedDomains,
      externalCache
    );
    
    console.log('🔗 Auto-loaded dependencies:', Object.keys(autoDependencies));
    
    // Merge auto-dependencies with manual ones (manual takes precedence)
    processedDependencies = { ...autoDependencies, ...processedDependencies };
    console.log('✅ Final processed dependencies:', Object.keys(processedDependencies));
  } else {
    console.log('❌ Auto-dependency detection disabled');
  }
  
  return processedDependencies;
}

export const transformMultipleFiles = (
  files: CodeFile[],
  dependencies: Record<string, any>
) => {
  moduleCache.clear();

  // First pass: preprocess files to extract export information
  const exportInfo = new Map<
    string,
    {
      hasDefaultExport: boolean;
      namedExports: Set<string>;
      exportedName: string | null;
    }
  >();

  files.forEach((file) => {
    const { modifiedInput, exportedName } = removeDefaultExport(file.content);

    // Find named exports - more comprehensive approach
    const namedExports = new Set<string>();

    // Match regular named exports
    const exportRegex =
      /export\s+(const|let|var|function|class)\s+([A-Za-z0-9_$]+)/g;
    let match;

    while ((match = exportRegex.exec(modifiedInput)) !== null) {
      namedExports.add(match[2]);
    }

    // Match "export { x, y, z }" style exports
    const exportBraceRegex = /export\s+{([^}]+)}/g;
    while ((match = exportBraceRegex.exec(modifiedInput)) !== null) {
      const exportsList = match[1].split(",");
      for (const exportItem of exportsList) {
        // Handle "originalName as exportName" syntax
        const nameParts = exportItem.trim().split(/\s+as\s+/);
        const exportName =
          nameParts.length > 1 ? nameParts[1].trim() : nameParts[0].trim();
        if (exportName) namedExports.add(exportName);
      }
    }

    exportInfo.set(file.name, {
      hasDefaultExport: exportedName !== null,
      namedExports,
      exportedName,
    });
  });

  // Transform all files
  files.forEach((file) => {
    const fileExportInfo = exportInfo.get(file.name);
    const { modifiedInput, exportedName } = removeDefaultExport(file.content);

    const dependencyVarMap = new Map<string, string>();
    Object.keys(dependencies).forEach((dep) => {
      const safeName = dep.replace(/[^a-zA-Z0-9_]/g, "_");
      dependencyVarMap.set(dep, safeName);
    });

    // Pre-process to handle various exports
    let processedInput = modifiedInput;

    // Replace "export const/function" with plain declarations
    processedInput = processedInput.replace(
      /export\s+(const|let|var|function|class)\s+([A-Za-z0-9_$]+)/g,
      "$1 $2"
    );

    // Handle "export { x, y, z }" syntax - remove these lines
    processedInput = processedInput.replace(/export\s+{[^}]+};?/g, "");

    // Remove type exports
    processedInput = processedInput.replace(/export\s+type\s+[^;]+;/g, "");
    processedInput = processedInput.replace(
      /export\s+interface\s+[^{]+{[^}]+}/g,
      ""
    );

    // Remove React imports since we're injecting React globally
    if (
      processedInput.includes("import React from") ||
      processedInput.includes("import * as React from")
    ) {
      processedInput = processedInput.replace(
        /import\s+(\*\s+as\s+)?React\s+from\s+['"]react['"];?/g,
        ""
      );
    }

    // Detect potential React components even if not exported
    const componentDetectionRegex = /(?:const|let|var|function)\s+([A-Z][A-Za-z0-9_]*)\s*(?:=|:|\()/g;
    const potentialComponents = new Set<string>();
    let match;
    
    while ((match = componentDetectionRegex.exec(processedInput)) !== null) {
      const componentName = match[1];
      // Only track if it wasn't already tracked as an export
      if (!fileExportInfo?.namedExports.has(componentName)) {
        potentialComponents.add(componentName);
      }
    }

    const transpiledCode = transform(processedInput, {
      presets: [
        ["typescript", { isTSX: true, allExtensions: true }],
        ["react"],
      ],
      plugins: [
        createImportTransformerPlugin(
          Object.keys(dependencies),
          dependencyVarMap,
          files,
          exportInfo
        ),
      ],
    }).code;

    // Store both the transpiled code and export information
    moduleCache.set(file.name, {
      code: transpiledCode,
      exportedName,
      exportInfo: fileExportInfo,
      potentialComponents: Array.from(potentialComponents),
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

  // Create module definitions with improved exports handling
  const moduleDefinitions = Array.from(moduleCache.entries())
    .map(([name, module]: [string, any]) => {
      const normalizedName = normalizeFilename(name);

      // Get export info
      const info = module.exportInfo || {
        hasDefaultExport: module.exportedName !== null,
        namedExports: new Set(),
        exportedName: module.exportedName,
      };

      // Use the named exports we detected in the first pass
      const namedExports = info.namedExports || new Set();

      // Also check for any additional exports directly from the original code (fallback)
      const exportConstRegex =
        /export\s+(const|let|var|function|class)\s+([A-Za-z0-9_$]+)/g;

      let hookName = null;

      // Look for direct named exports in the original code as fallback
      const originalCode = files.find((f) => f.name === name)?.content || "";
      let exportMatch;
      while ((exportMatch = exportConstRegex.exec(originalCode)) !== null) {
        namedExports.add(exportMatch[2]);
        if (name.includes("use")) {
          hookName = exportMatch[2];
          // console.log("Found named export:", exportMatch[2]);
        }
      }

      // Prepare exports handling code
      let exportsSetup = "";

      // For default exports
      if (info.hasDefaultExport && info.exportedName) {
        exportsSetup += `
        // Handle default export
        exports.default = ${info.exportedName};
        // For CommonJS compatibility
        module.exports = Object.assign({}, module.exports, typeof ${info.exportedName} === 'function' 
          ? { default: ${info.exportedName} } 
          : ${info.exportedName});
      `;
      }

      // Explicitly handle named exports we found
      for (const exportName of Array.from(namedExports)) {
        exportsSetup += `
        // Handle named export: ${exportName}
        if (typeof ${exportName} !== 'undefined') {
          exports.${exportName} = ${exportName};
        }
      `;
      }

      // For hooks add explicit export handling
      if (hookName && name.includes(hookName)) {
        exportsSetup += `
        if (typeof ${hookName} !== 'undefined') {
          exports.${hookName} = ${hookName};
        }
      `;
      }

      // Auto-export potential components if no exports exist
      const hasAnyExports = info.hasDefaultExport || namedExports.size > 0;
      if (!hasAnyExports && module.potentialComponents && module.potentialComponents.length > 0) {
        exportsSetup += `
        // Auto-exporting detected components since no exports were defined
      `;
        for (const componentName of module.potentialComponents) {
          exportsSetup += `
        if (typeof ${componentName} !== 'undefined') {
          exports.${componentName} = ${componentName};
          exports.__autoExported = true; // Mark that these were auto-exported
        }
      `;
        }
      }

      return `
      moduleDefinitions.set("${normalizedName}", function(React) {
        const module = { exports: {} };
        const exports = module.exports;
        
        try {
          (function(module, exports) {
            ${module.code}
            
            ${exportsSetup}
          })(module, exports);
        } catch (error) {
          console.error("Error in module ${normalizedName}:", error);
          throw error;
        }
        
        return module.exports;
      });
    `;
    })
    .join("\n\n");

  // Create module getter with better caching
  const moduleGetterCode = `
    function getModule(name) {
      if (!moduleCache.has(name)) {
        const moduleFactory = moduleDefinitions.get(name);
        if (!moduleFactory) {
          throw new Error(\`Module "\${name}" not found\`);
        }
        try {
          const moduleExports = moduleFactory(React);
          // Ensure we're getting a proper object with exports
          if (typeof moduleExports !== 'object' && typeof moduleExports !== 'function') {
            throw new Error(\`Module "\${name}" did not return a valid exports object\`);
          }
          moduleCache.set(name, moduleExports);
        } catch (error) {
          console.error(\`Error initializing module "\${name}"\`, error);
          throw error;
        }
      }
      return moduleCache.get(name);
    }
  `;

  const entryModuleName = normalizeFilename(entryFile.name);

  return `
    return function(React, dependencies) {
      // Verify that React has all the necessary hooks and components
      if (!React.useState || !React.useEffect || !React.useMemo || !React.useCallback || !React.useRef) {
        console.warn("React object is missing hooks. This may cause issues with hook usage in components.");
      }
      
      ${dependencyVars}
      
      ${moduleRegistryCode}
      
      ${moduleDefinitions}
      
      ${moduleGetterCode}

      try {
        const entryModule = getModule("${entryModuleName}");
        
        // Helper function to check if something looks like a React component
        function isReactComponent(value) {
          if (typeof value !== 'function') return false;
          
          // Check if it's a function with uppercase first letter
          const name = value.name || '';
          if (name && name[0] === name[0].toUpperCase()) {
            return true;
          }
          
          // Check if it returns JSX (has createElement calls or JSX in toString)
          const fnString = value.toString();
          return fnString.includes('React.createElement') || 
                 fnString.includes('jsx') || 
                 fnString.includes('return React.') ||
                 fnString.includes('return <');
        }
        
        // Helper function to find the first component in exports
        function findFirstComponent(exports) {
          // If exports is a function itself and looks like a component
          if (isReactComponent(exports)) {
            return exports;
          }
          
          // Check all exported properties
          if (typeof exports === 'object' && exports !== null) {
            // Use the order they were exported (no sorting)
            const keys = Object.keys(exports);
            
            for (const key of keys) {
              const value = exports[key];
              if (isReactComponent(value)) {
                console.log(\`Found component: \${key}\`);
                return value;
              }
            }
          }
          
          return null;
        }
        
        // Try to get the component in order of preference:
        // 1. Default export
        // 2. First component found in exports
        let Component = entryModule.default;
        
        if (!Component || typeof Component !== 'function') {
          console.log('No default export found, searching for components...');
          Component = findFirstComponent(entryModule);
        }
        
        // Validate that we found a valid component
        if (!Component || typeof Component !== 'function') {
          // Provide helpful error message
          const exportedKeys = Object.keys(entryModule).filter(k => k !== '__esModule' && k !== '__autoExported');
          const wasAutoExported = entryModule.__autoExported;
          
          let errorMessage = \`No React component found in module. Expected either:
            1. A default export: export default MyComponent
            2. A named export with uppercase name: export const MyComponent = () => ...
            3. A component declaration with uppercase name: const MyComponent = () => ...\`;
            
          if (wasAutoExported) {
            errorMessage += \`
            
            Note: Components were auto-detected but none were valid React components.\`;
          }
          
          errorMessage += \`
            
            Found exports: \${exportedKeys.length > 0 ? exportedKeys.join(', ') : 'none'}
            Module type: \${typeof entryModule}\`;
            
          throw new Error(errorMessage);
        }
        
        return Component;
      } catch (err) {
        console.error("Error loading component:", err);
        // Return a fallback component that displays the error
        return function ErrorComponent() {
          return React.createElement('div', {
            style: {
              color: 'red',
              padding: '1rem',
              border: '1px solid red',
              borderRadius: '0.25rem'
            }
          }, [
            React.createElement('h3', { key: 'title' }, 'Error Loading Component'),
            React.createElement('pre', { key: 'error' }, String(err.message || err)),
            React.createElement('div', { key: 'stack', style: { marginTop: '1rem' } }, 
              React.createElement('details', {}, [
                React.createElement('summary', { key: 'summary' }, 'Stack Trace'),
                React.createElement('pre', { key: 'trace', style: { fontSize: '0.8rem', whiteSpace: 'pre-wrap' } }, err.stack || 'No stack trace available')
              ])
            )
          ]);
        };
      }
    }
  `;
};

const normalizeFilename = (filename: string) => {
  // Remove all file extensions (.js, .jsx, .ts, .tsx)
  return filename.replace(/\.(js|jsx|ts|tsx)$/, "").replace(/^\.\//, "");
};

const createImportTransformerPlugin = (
  allowedDependencies: string[],
  dependencyVarMap: Map<string, string>,
  localModules: CodeFile[],
  exportInfo: Map<
    string,
    {
      hasDefaultExport: boolean;
      namedExports: Set<string>;
      exportedName: string | null;
    }
  > = new Map()
) => {
  // Normalize paths for easier lookup
  const normalizedModulePaths = new Map<string, string>();

  localModules.forEach((module) => {
    const normalizedPath = normalizeFilename(module.name);
    normalizedModulePaths.set(normalizedPath, module.name);
  });

  return () => ({
    name: "import-transformer",
    visitor: {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        const source = path.node.source.value;
        const specifiers = path.node.specifiers;

        if (specifiers.length === 0) return;

        // Special case for React imports
        if (source === "react") {
          const newNodes: t.Statement[] = [];

          // Process each React import specifier
          specifiers.forEach((specifier) => {
            // Skip the default import (React itself) as it's already available
            if (t.isImportDefaultSpecifier(specifier)) {
              // No need to do anything as React is already in scope
            } else if (t.isImportSpecifier(specifier)) {
              // For named imports like useState, useEffect, etc.
              const imported = specifier.imported;
              const importedName = t.isIdentifier(imported)
                ? imported.name
                : t.isStringLiteral(imported)
                ? imported.value
                : null;

              if (importedName !== null) {
                // Create a variable declaration to pull the named export from React
                newNodes.push(
                  t.variableDeclaration("const", [
                    t.variableDeclarator(
                      t.identifier(specifier.local.name),
                      t.memberExpression(
                        t.identifier("React"),
                        t.identifier(importedName)
                      )
                    ),
                  ])
                );
              }
            }
          });

          // Replace the import declaration with our new variable declarations
          if (newNodes.length > 0) {
            path.replaceWithMultiple(newNodes);
          } else {
            path.remove();
          }
          return;
        }

        const normalizedSource = normalizeFilename(source);
        const isLocalModule = normalizedModulePaths.has(normalizedSource);

        if (
          !isLocalModule &&
          !allowedDependencies.includes(source) &&
          source !== "react"
        ) {
          throw new Error(`Module not found: ${source}`);
        }

        let newNodes: t.Statement[] = [];

        if (isLocalModule) {
          const originalModuleName =
            normalizedModulePaths.get(normalizedSource) || "";
          const moduleExportInfo = exportInfo.get(originalModuleName);

          specifiers.forEach((specifier) => {
            if (t.isImportDefaultSpecifier(specifier)) {
              // For default imports, get the module and use its default export
              newNodes.push(
                t.variableDeclaration("const", [
                  t.variableDeclarator(
                    t.identifier(specifier.local.name),
                    t.memberExpression(
                      t.callExpression(t.identifier("getModule"), [
                        t.stringLiteral(normalizedSource),
                      ]),
                      t.identifier("default")
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
                // Check if this is a named export from the module
                const isNamedExport =
                  moduleExportInfo &&
                  moduleExportInfo.namedExports.has(importedName);

                // Create appropriate access to the module export
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

                // Add debug comment for easier troubleshooting
                if (!isNamedExport) {
                  console.warn(
                    `Warning: Importing '${importedName}' from '${source}' but it may not be exported`
                  );
                }
              }
            }
          });
        } else {
          const sourceVarName = dependencyVarMap.get(source) || source;

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

      // Handle TypeScript import types (remove them)
      TSImportType(path: { remove: () => void }) {
        path.remove();
      },

      // Handle TypeScript export declarations
      ExportNamedDeclaration(path: {
        node: { declaration: any; specifiers: string | any[] };
        replaceWith: (arg0: any) => void;
        remove: () => void;
      }) {
        // For named exports, we need to keep the declaration but remove the export
        const declaration = path.node.declaration;

        if (declaration) {
          // Replace the export declaration with just the declaration
          path.replaceWith(declaration);
        } else if (path.node.specifiers.length > 0) {
          // For export { name } from 'module' style exports
          path.remove();
        }
      },

      ExportDefaultDeclaration(path: {
        node: { declaration: any };
        remove: () => void;
        replaceWith: (arg0: t.FunctionDeclaration) => void;
      }) {
        const declaration = path.node.declaration;

        if (t.isIdentifier(declaration)) {
          // For: export default ComponentName;
          path.remove();
        } else if (t.isFunctionDeclaration(declaration) && declaration.id) {
          // For: export default function ComponentName() {}
          path.replaceWith(declaration);
        } else {
          // For anonymous declarations: export default function() {}
          // Convert to a variable declaration
          path.remove();
        }
      },

      // Remove all type-only exports
      TSTypeAliasDeclaration(path: {
        parent: t.Node | null | undefined;
        parentPath: { remove: () => void };
      }) {
        if (path.parent && t.isExportNamedDeclaration(path.parent)) {
          path.parentPath.remove();
        }
      },

      TSInterfaceDeclaration(path: {
        parent: t.Node | null | undefined;
        parentPath: { remove: () => void };
      }) {
        if (path.parent && t.isExportNamedDeclaration(path.parent)) {
          path.parentPath.remove();
        }
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
  const interfaceExportRegex = /export\s+interface\s+[^{]+{[^}]+}/g;

  let match = input.match(defaultExportWithDeclarationRegex);
  let exportedName: string | null = null;
  let modifiedInput = input
    .replace(typeExportRegex, "")
    .replace(interfaceExportRegex, "");

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
