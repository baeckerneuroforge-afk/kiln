"use client";

import React from "react";
import { AlertTriangle, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CanvasErrorBoundaryProps {
  children: React.ReactNode;
}

interface CanvasErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  copied: boolean;
}

export class CanvasErrorBoundary extends React.Component<
  CanvasErrorBoundaryProps,
  CanvasErrorBoundaryState
> {
  constructor(props: CanvasErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<CanvasErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[CanvasErrorBoundary] Workflow editor crashed:", error, errorInfo);
  }

  handleCopyError = () => {
    const { error } = this.state;
    if (!error) return;
    const text = `Error: ${error.message}\n\nStack:\n${error.stack || "N/A"}`;
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-card">
          <div className="flex flex-col items-center gap-4 max-w-md text-center p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="h-7 w-7 text-red-400" />
            </div>
            <h3 className="text-base font-medium text-foreground">
              Something went wrong with the workflow editor
            </h3>
            <p className="text-sm text-muted-foreground">
              Your work has been saved. Reload the editor to continue.
            </p>
            {this.state.error && (
              <pre className="w-full text-left text-[11px] text-red-400/70 bg-red-500/5 border border-red-500/10 rounded-lg p-3 max-h-32 overflow-auto font-mono">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                onClick={this.handleReload}
                className="bg-orange-600 text-white hover:bg-orange-500"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Reload Editor
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={this.handleCopyError}
                className="border-border text-muted-foreground hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                {this.state.copied ? "Copied!" : "Copy Error"}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Per-node error boundary — wraps individual workflow node renders.
 * Shows a red placeholder instead of crashing the entire canvas.
 */
interface NodeErrorBoundaryProps {
  nodeType: string;
  children: React.ReactNode;
}

interface NodeErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class NodeErrorBoundary extends React.Component<
  NodeErrorBoundaryProps,
  NodeErrorBoundaryState
> {
  constructor(props: NodeErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<NodeErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error(`[NodeErrorBoundary] Node "${this.props.nodeType}" render error:`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border-2 border-red-500/40 bg-red-500/10 px-4 py-3 min-w-[200px]">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <div>
              <p className="text-xs font-medium text-red-400">{this.props.nodeType}</p>
              <p className="text-[10px] text-red-400/60">Render error — click to see details</p>
            </div>
          </div>
          {this.state.error && (
            <p className="mt-1.5 text-[10px] text-red-400/50 truncate max-w-[200px]">
              {this.state.error.message}
            </p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
