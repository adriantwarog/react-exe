# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

React-EXE is a powerful React component executor that renders code with external dependencies and custom styling. It allows executing React components from string code or multiple files with support for external libraries, TypeScript, and Tailwind CSS.

## Development Commands

- `npm run build` - Clean and build the project using Rollup
- `npm run clean` - Remove the dist directory
- `npm run prepare` - Runs automatically before publishing (builds the project)

## Architecture

### Core Components

- **CodeExecutor** (`src/index.tsx`) - Main component that executes and renders React code
  - Handles both single file (string) and multi-file (CodeFile[]) inputs
  - Includes security patterns to block potentially harmful code
  - Uses ErrorBoundary for safe component rendering
  - Manages dependencies and module resolution

- **ErrorBoundary** (`src/components/ErrorBoundary.tsx`) - React error boundary for catching and displaying component errors with detailed stack traces

- **Code Transformation System** (`src/utils/index.ts`) - Complex system for transforming and executing code:
  - `transformMultipleFiles()` - Main transformation function
  - `removeDefaultExport()` - Extracts default exports from code
  - Babel-based AST transformation with custom import/export handling
  - Module caching and dependency injection system

### Build System

- Uses Rollup for bundling with TypeScript, CommonJS, and terser plugins
- Outputs ESM format with type declarations
- External dependencies: React and React-DOM (peer dependencies)
- Includes @babel/standalone for runtime code transformation

### Key Features

1. **Multi-file Support** - Import/export between multiple code files
2. **Security** - Built-in patterns to block dangerous code (eval, document.cookie, etc.)
3. **Dependency Injection** - External libraries can be provided via config
4. **TypeScript Support** - Full TS/TSX compilation via Babel
5. **Error Handling** - Comprehensive error boundaries and fallbacks
6. **Component Auto-detection** - Automatically finds and exports React components

### Code Execution Flow

1. Input validation and security scanning
2. Code transformation using Babel with custom plugins
3. Module registry creation for multi-file support
4. Runtime execution in isolated scope with injected dependencies
5. Component resolution (default export or first detected component)
6. Error boundary protection during rendering

### Important Implementation Details

- The transformation system handles complex import/export scenarios including named exports, default exports, and cross-file imports
- Uses a module cache system to handle circular dependencies and optimize performance
- Automatically detects React components even when not explicitly exported
- Provides detailed error messages for debugging code execution issues