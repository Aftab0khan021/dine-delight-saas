import { useState } from "react";
import * as Sentry from "@sentry/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Test component for Sentry error tracking
 * This component is only for testing - remove from production
 */
export function SentryTest() {
    const [count, setCount] = useState(0);

    const throwError = () => {
        throw new Error("Test error from Sentry Test Component");
    };

    const captureMessage = () => {
        Sentry.captureMessage("Test message from Sentry", "info");
        alert("Message sent to Sentry!");
    };

    const captureException = () => {
        try {
            throw new Error("Test exception captured manually");
        } catch (error) {
            Sentry.captureException(error);
            alert("Exception sent to Sentry!");
        }
    };

    return (
        <Card className="max-w-md mx-auto mt-8">
            <CardHeader>
                <CardTitle>Sentry Error Tracking Test</CardTitle>
                <CardDescription>
                    Test Sentry integration (remove this component in production)
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">
                    Counter: {count}
                </div>

                <Button onClick={() => setCount(count + 1)} variant="outline" className="w-full">
                    Increment (Normal Operation)
                </Button>

                <Button onClick={captureMessage} variant="secondary" className="w-full">
                    Send Test Message
                </Button>

                <Button onClick={captureException} variant="secondary" className="w-full">
                    Send Test Exception
                </Button>

                <Button onClick={throwError} variant="destructive" className="w-full">
                    Throw Uncaught Error
                </Button>

                <div className="text-xs text-muted-foreground pt-2">
                    Check your Sentry dashboard to see captured errors
                </div>
            </CardContent>
        </Card>
    );
}
