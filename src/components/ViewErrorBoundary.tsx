import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

type ViewErrorBoundaryProps = {
  children: ReactNode;
  viewName: string;
};

type ViewErrorBoundaryState = {
  hasError: boolean;
};

export default class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
  state: ViewErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ViewErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.viewName} failed to render`, error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-1 items-center justify-center bg-background p-4 sm:p-6">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 text-center shadow-sm">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <TriangleAlert className="h-5 w-5" />
          </div>
          <p className="mt-4 text-base font-semibold text-foreground">This view did not finish loading</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            ITMAP may have updated while this page was open. Reload the app to reconnect and try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" />
            Reload ITMAP
          </button>
        </div>
      </div>
    );
  }
}
