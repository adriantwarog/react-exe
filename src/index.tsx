import React, { useState, useEffect } from "react";
import { cn, transformCode } from "./utils";
import ErrorBoundary from "./components/ErrorBoundary";

const defaultSecurityPatterns = [
  /document\.cookie/i,
  /window\.document\.cookie/i,
  /eval\(/i,
  /Function\(/i,
  /document\.write/i,
  /document\.location/i,
];

export interface CodeExecutorConfig {
  dependencies?: Record<string, any>;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  errorClassName?: string;
  errorStyle?: React.CSSProperties;
  securityPatterns?: RegExp[];
  onError?: (error: Error) => void;
  enableTailwind?: boolean;
}

export interface CodeExecutorProps {
  code: string;
  config?: CodeExecutorConfig;
}

export const CodeExecutor = ({ code, config = {} }: CodeExecutorProps) => {
  const {
    dependencies = {},
    containerClassName,
    containerStyle,
    errorClassName,
    errorStyle,
    securityPatterns = defaultSecurityPatterns,
    onError,
  } = config;

  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bypassSecurity, setBypassSecurity] = useState(false);

  useEffect(() => {
    try {
      if (!bypassSecurity) {
        for (const pattern of securityPatterns) {
          if (pattern.test(code)) {
            setBypassSecurity(true);
            throw new Error(`Forbidden code pattern detected: ${pattern}`);
          }
        }
      }

      const transformedCode = transformCode(code, dependencies);
      const factoryFunction = new Function(transformedCode)();
      const component = factoryFunction(React, dependencies);

      setComponent(() => component);
      setError(null);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An unknown error occurred";
      setError(errorMessage);
      if (onError && err instanceof Error) {
        onError(err);
      }
    }
  }, [code, dependencies, bypassSecurity]);

  if (error) {
    return (
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
        <p style={{ margin: 0, fontWeight: 500 }}>Error:</p>
        <p style={{ margin: "8px 0 0 0", fontSize: "14px" }}>{error}</p>
        {bypassSecurity ? (
          <div style={{ marginTop: "12px" }}>
            <button
              onClick={() => setBypassSecurity(true)}
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
        ) : (
          <></>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn("code-viewer", containerClassName)}
      style={containerStyle}
    >
      {config?.enableTailwind ? (
        <script src="https://cdn.tailwindcss.com" async />
      ) : (
        <></>
      )}
      <ErrorBoundary onError={onError}>
        {Component && <Component />}
      </ErrorBoundary>
    </div>
  );
};

export default CodeExecutor;
