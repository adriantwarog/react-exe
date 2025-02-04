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

export interface CodeViewerConfig {
  dependencies?: Record<string, any>;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  errorClassName?: string;
  errorStyle?: React.CSSProperties;
  securityPatterns?: RegExp[];
  onError?: (error: Error) => void;
  tailwind?: boolean;
}

export interface CodeViewerProps {
  code: string;
  config?: CodeViewerConfig;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
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
  } = config;

  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // Security check
      for (const pattern of securityPatterns) {
        if (pattern.test(code)) {
          throw new Error(`Forbidden code pattern detected: ${pattern}`);
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
  }, [code, dependencies]);

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
      </div>
    );
  }

  return (
    <div
      className={cn("code-viewer", containerClassName)}
      style={containerStyle}
    >
      {config?.tailwind ? (
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

export default CodeViewer;
