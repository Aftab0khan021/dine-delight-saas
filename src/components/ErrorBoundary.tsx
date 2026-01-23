import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ErrorBoundaryProps {
    children: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary Component
 * Catches React component errors and displays a fallback UI instead of crashing the entire app.
 * This prevents white screen errors and provides a better user experience.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        // Update state so the next render will show the fallback UI
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        // Log error details for debugging
        console.error('Error Boundary caught an error:', error, errorInfo);

        // Update state with error details
        this.setState({
            error,
            errorInfo,
        });

        // TODO: Send error to monitoring service (e.g., Sentry)
        // if (window.Sentry) {
        //   window.Sentry.captureException(error, { extra: errorInfo });
        // }
    }

    handleReset = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-background p-4">
                    <Card className="max-w-lg w-full">
                        <CardHeader>
                            <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                                    <AlertTriangle className="h-6 w-6 text-destructive" />
                                </div>
                                <div>
                                    <CardTitle>Something went wrong</CardTitle>
                                    <CardDescription>
                                        An unexpected error occurred. Please try again.
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Error Details (only in development) */}
                            {import.meta.env.DEV && this.state.error && (
                                <div className="rounded-md bg-muted p-4 text-sm font-mono overflow-auto max-h-48">
                                    <div className="font-bold text-destructive mb-2">
                                        {this.state.error.name}: {this.state.error.message}
                                    </div>
                                    {this.state.errorInfo && (
                                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                                            {this.state.errorInfo.componentStack}
                                        </pre>
                                    )}
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-3">
                                <Button
                                    onClick={this.handleReset}
                                    variant="outline"
                                    className="flex-1"
                                >
                                    Try Again
                                </Button>
                                <Button
                                    onClick={() => window.location.href = '/'}
                                    className="flex-1"
                                >
                                    Go to Home
                                </Button>
                            </div>

                            {/* Reload Option */}
                            <Button
                                onClick={() => window.location.reload()}
                                variant="ghost"
                                className="w-full"
                            >
                                Reload Page
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
