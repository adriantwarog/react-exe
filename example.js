"use client"

import { observer } from 'mobx-react-lite';
import { evaluate } from '@mdx-js/mdx'
import { MDXProvider, useMDXComponents } from '@mdx-js/react'
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';


const runtime = { jsx, jsxs, Fragment };

// Module mapping for transforming imports
const moduleMap = {
	"react": "https://esm.sh/react@19.0.0",
	"react-dom": "https://esm.sh/react-dom@19.0.0",
	"@mdx-js/react": "https://esm.sh/@mdx-js/react@3.1.0",
	"lucide-react": "https://esm.sh/lucide-react@0.513.0",
	"clsx": "https://esm.sh/clsx@2.1.1",
	"class-variance-authority": "https://esm.sh/class-variance-authority@0.7.1",
};

// Map of module paths to their dynamic imports
const moduleComponentMap = {
	'@/components/ui/button': () => import('@/components/ui/button'),
	// Add more components here as needed:
	'@/components/ui/card': () => import('@/components/ui/card'),
	'@/components/ui/input': () => import('@/components/ui/input'),
	'@/components/ui/label': () => import('@/components/ui/label'),
	'@/components/ui/avatar': () => import('@/components/ui/avatar'),

};

// Extract which local components are imported from the code
async function extractImportedComponents(code) {
	const importedComponents = {};
	const localImportRegex = /import\s+\{([^}]+)\}\s+from\s+['"](@\/[^'"]+)['"];?\s*$/gm;
	
	let match;
	const importPromises = [];
	
	while ((match = localImportRegex.exec(code)) !== null) {
		const [, importClause, modulePath] = match;
		const componentNames = importClause.split(',').map(name => name.trim());
		
		// Get the import function for this module path
		const importFunction = moduleComponentMap[modulePath];
		if (importFunction) {
			// Create a promise to import the module and extract needed components
			const importPromise = importFunction().then(moduleComponents => {
				componentNames.forEach(componentName => {
					if (moduleComponents[componentName]) {
						importedComponents[componentName] = moduleComponents[componentName];
					}
				});
			});
			importPromises.push(importPromise);
		}
	}
	
	// Wait for all imports to complete
	await Promise.all(importPromises);
	return importedComponents;
}

// Transform import statements to use CDN URLs or remove local imports
function transformImports(code) {
	return code.replace(
		/import\s+[\s\S]*?\s+from\s+['"]([^'"]+)['"];?\s*/g,
		(match, moduleName) => {
			// Handle local imports by removing them completely
			if (moduleName.startsWith('@/')) {
				return ''; // Remove the line entirely
			}
			
			// Handle external imports with CDN URLs
			const cdnUrl = moduleMap[moduleName];
			if (cdnUrl) {
				// Extract the import clause (everything between 'import' and 'from')
				const importClauseMatch = match.match(/import\s+([\s\S]*?)\s+from/);
				if (importClauseMatch) {
					const importClause = importClauseMatch[1];
					return `import ${importClause} from '${cdnUrl}';`;
				}
			}
			
			return match; // Return unchanged if module not in map
		}
	);
}

const MdxComponent = observer(({ code }) => {
	const [Content, setContent] = useState(null);
	const [errorBoundaryKey, setErrorBoundaryKey] = useState(0);
	const [importedComponents, setImportedComponents] = useState({});

	useEffect(() => {
		if (!code) return;
		
		// Extract which local components are imported (async)
		extractImportedComponents(code).then(components => {
			setImportedComponents(components);
			
			// Transform imports before evaluation
			const transformedCode = transformImports(code);
			
			// Create enhanced runtime with only imported local components
			const enhancedRuntime = { 
				...runtime, 
				baseUrl: import.meta.url,
				// Provide only imported components
				...components,
				// Provide useMDXComponents function that returns only imported components
				useMDXComponents: () => components,
			};
			
			evaluate(transformedCode, enhancedRuntime)
			.then(mdxModule => {
				setContent(() => mdxModule.default);
				setErrorBoundaryKey(prev => prev + 1);
			})
			.catch(error => {
				console.log('MDX evaluation error:', error);
				console.log('Transformed code that failed:', transformedCode);
			});
		}).catch(error => {
			console.log('Component import error:', error);
		});
	}, [code]);

	if(!Content){
		return false;
	}

	return (
		<MDXProvider components={importedComponents}>
			<ErrorBoundary
				key={errorBoundaryKey}
				onError={(error, errorInfo) => { console.log('MDX rendering error:', error, errorInfo) }}
				FallbackComponent={MDXErrorFallback}
				onReset={() => { setErrorBoundaryKey(prev => prev + 1); }}
			>
				<Content />
			</ErrorBoundary>
		</MDXProvider>
	);
});



// Modern error fallback component
function MDXErrorFallback({ error, resetErrorBoundary }) {
	return (
		<div className="p-4 bg-red-50 border border-red-200 rounded-md">
			<div className="flex items-start">
				<div className="flex-shrink-0">
					<svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
						<path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
					</svg>
				</div>
				<div className="ml-3 flex-1">
					<h3 className="text-sm font-medium text-red-800">
						MDX Rendering Error
					</h3>
					<div className="mt-2 text-sm text-red-700">
						<pre className="whitespace-pre-wrap font-mono text-xs bg-red-100 p-2 rounded border overflow-auto max-h-32">
							{error.message}
						</pre>
						{error.stack && (
							<details className="mt-2">
								<summary className="cursor-pointer text-red-600 hover:text-red-800">
									Stack trace
								</summary>
								<pre className="mt-1 whitespace-pre-wrap font-mono text-xs bg-red-100 p-2 rounded border overflow-auto max-h-32">
									{error.stack}
								</pre>
							</details>
						)}
					</div>
					<div className="mt-3">
						<button
							onClick={resetErrorBoundary}
							className="inline-flex items-center px-3 py-1 text-xs font-medium text-red-700 bg-red-100 border border-red-300 rounded-md hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
						>
							Try again
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
export default MdxComponent;
