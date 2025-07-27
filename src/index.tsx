import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { cn, transformMultipleFiles } from "./utils";
import ErrorBoundary from "./components/ErrorBoundary";

const defaultSecurityPatterns = [
  /document\.cookie/i,
  /window\.document\.cookie/i,
  /eval\(/i,
  /Function\(/i,
  /document\.write/i,
  /document\.location/i,
];

export interface CodeFile {
  name: string;
  content: string;
  isEntry?: boolean;
}

export interface CodeExecutorConfig {
  dependencies?: Record<string, any>;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  errorClassName?: string;
  errorStyle?: React.CSSProperties;
  securityPatterns?: RegExp[];
  onError?: (error: Error) => void;
  enableTailwind?: boolean;
  componentMap?: Record<string, any>; // Map component paths to actual components
}

export interface CodeExecutorProps {
  code: string | CodeFile[];
  config?: CodeExecutorConfig;
}

interface ExecutionResult {
  Component: React.ComponentType | null;
  error: string | null;
  forbiddenPatterns: boolean;
}

const initialExecutionResult: ExecutionResult = {
  Component: null,
  error: null,
  forbiddenPatterns: false,
};

// Helper function to compare code content
const isCodeDifferent = (
  prevCode: string | CodeFile[] | undefined,
  newCode: string | CodeFile[]
): boolean => {
  if (!prevCode) return true;

  if (typeof prevCode === "string" && typeof newCode === "string") {
    return prevCode !== newCode;
  }

  if (Array.isArray(prevCode) && Array.isArray(newCode)) {
    if (prevCode.length !== newCode.length) return true;

    return prevCode.some((file, index) => {
      const newFile = newCode[index];
      return (
        file.name !== newFile.name ||
        file.content !== newFile.content ||
        file.isEntry !== newFile.isEntry
      );
    });
  }

  return true;
};

// Helper function to compare dependencies
const isDependenciesDifferent = (
  prevDeps: Record<string, any> = {},
  newDeps: Record<string, any> = {}
): boolean => {
  const prevKeys = Object.keys(prevDeps);
  const newKeys = Object.keys(newDeps);

  if (prevKeys.length !== newKeys.length) return true;

  return prevKeys.some((key) => {
    const prevValue = prevDeps[key];
    const newValue = newDeps[key];

    // Compare only the reference for functions and objects
    if (typeof prevValue === "function" || typeof newValue === "function") {
      return prevValue !== newValue;
    }

    // For primitive values, compare the value
    return prevValue !== newValue;
  });
};

function executeCode(
  code: string | CodeFile[],
  dependencies: Record<string, any>,
  securityPatterns: RegExp[],
  bypassSecurity: boolean,
  componentMap: Record<string, any> = {}
): ExecutionResult {
  try {
    const codeFiles = Array.isArray(code)
      ? code
      : [{ name: "index.tsx", content: code, isEntry: true }];

    // Security check
    if (!bypassSecurity) {
      for (const file of codeFiles) {
        for (const pattern of securityPatterns) {
          if (pattern.test(file.content)) {
            return {
              Component: null,
              error: `Forbidden code pattern detected in ${file.name}: ${pattern}`,
              forbiddenPatterns: true,
            };
          }
        }
      }
    }

    // Transform the code using our new system
    const transformedCode = transformMultipleFiles(codeFiles, dependencies, componentMap);

    // For debugging
    // console.log("Transformed code:", transformedCode);

    // Create the factory function and execute it
    const factoryFunction = new Function(transformedCode)();
    const Component = factoryFunction(React, dependencies);

    return {
      Component,
      error: null,
      forbiddenPatterns: false,
    };
  } catch (err) {
    console.error("Error executing code:", err);
    return {
      Component: null,
      error: err instanceof Error ? err.message : "An unknown error occurred",
      forbiddenPatterns: false,
    };
  }
}

export const CodeExecutor: React.FC<CodeExecutorProps> = ({
  code,
  config = {},
}) => {
  const {
    dependencies = {},
    containerClassName,
    containerStyle,
    errorClassName,
    errorStyle,
    securityPatterns = defaultSecurityPatterns,
    onError,
    enableTailwind = false,
    componentMap = {},
  } = config;

  const [executionResult, setExecutionResult] = useState<ExecutionResult>(
    initialExecutionResult
  );

  const { Component, error, forbiddenPatterns } = executionResult;
  const prevCodeRef = useRef<string | CodeFile[]>();
  const prevDependenciesRef = useRef<Record<string, any>>();

  // Check if code or dependencies have changed
  const hasChanges = useMemo(() => {
    const codeChanged = isCodeDifferent(prevCodeRef.current, code);
    const dependenciesChanged = isDependenciesDifferent(
      prevDependenciesRef.current,
      dependencies
    );

    return codeChanged || dependenciesChanged;
  }, [code, dependencies]);

 

  // Execute code on changes
  useEffect(() => {
    if (hasChanges) {
      try {
        const result = executeCode(code, dependencies, securityPatterns, false, componentMap);
        setExecutionResult(result);
        prevCodeRef.current = code;
        prevDependenciesRef.current = dependencies;
      } catch (err) {
        // Handle any synchronous errors during execution
        const errorMessage = err instanceof Error ? err.message : String(err);
        setExecutionResult({
          Component: null,
          error: errorMessage,
          forbiddenPatterns: false,
        });
        if (onError && err instanceof Error) {
          onError(err);
        }
      }
    }
  }, [code, dependencies, securityPatterns, hasChanges, onError, componentMap]);

  const handleBypassSecurity = useCallback(() => {
    try {
      const result = executeCode(code, dependencies, securityPatterns, true, componentMap);
      setExecutionResult(result);
      prevCodeRef.current = code;
      prevDependenciesRef.current = dependencies;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setExecutionResult({
        Component: null,
        error: errorMessage,
        forbiddenPatterns: false,
      });
      if (onError && err instanceof Error) {
        onError(err);
      }
    }
  }, [code, dependencies, securityPatterns, onError, componentMap]);

  const handleExecutionError = useCallback(
    (error: Error) => {
      setExecutionResult((prev) => ({
        ...prev,
        error: error.message,
        Component: null,
      }));
      if (onError) {
        onError(error);
      }
    },
    [onError]
  );

  if (error) {
    return (
      <div
        className={cn("code-viewer-error", errorClassName)}
        style={{
          padding: "16px",
        //   backgroundColor: "#fef2f2",
          border: "1px solid #fee2e2",
          borderRadius: "4px",
          color: "#dc2626",
          ...errorStyle,
        }}
      >
        <p style={{ margin: 0, fontWeight: 500 }}>Error:</p>
        <p style={{ margin: "8px 0 0 0", fontSize: "14px" }}>{error}</p>
        {forbiddenPatterns && (
          <div style={{ marginTop: "12px" }}>
            <button
              onClick={handleBypassSecurity}
              style={{
                padding: "8px 16px",
                backgroundColor: "#dc2626",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "14px",
              }}
              title="Warning: Proceeding may expose you to security risks"
            >
              Continue Anyway (Not Recommended)
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <ErrorBoundary
        onError={handleExecutionError}
        fallback={
          <div
            className={cn("code-viewer-error", errorClassName)}
            style={{
              padding: "16px",
              backgroundColor: "#fef2f2",
              border: "1px solid #fee2e2",
              borderRadius: "4px",
              color: "#dc2626",
              ...errorStyle,
            }}
          >
            <p style={{ margin: 0, fontWeight: 500 }}>Rendering Error:</p>
            <p style={{ margin: "8px 0 0 0", fontSize: "14px" }}>
              The component failed to render. Check the console for more
              details.
            </p>
          </div>
        }
      >
        {Component ? <Component /> : null}
      </ErrorBoundary>
    </>
  );
};

export default React.memo(CodeExecutor);
