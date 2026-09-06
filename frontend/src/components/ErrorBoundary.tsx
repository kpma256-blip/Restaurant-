import { ReactNode, Component, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <h2 className="font-semibold text-rose-900">Something went wrong</h2>
          <p className="mt-1 text-sm text-rose-700">{this.state.error?.message || "An unexpected error occurred"}</p>
        </div>
      );
    }

    return this.props.children;
  }
}
