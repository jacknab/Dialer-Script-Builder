import { useGetTwilioStatus, useHealthCheck } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Settings() {
  const { data: twilioStatus, isLoading: twilioLoading } = useGetTwilioStatus();
  const { data: health, isLoading: healthLoading } = useHealthCheck();

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl border-b border-border pb-2">SYSTEM SETTINGS</h1>

      <Card className={`border-border rounded-none ${!twilioStatus?.connected ? 'border-secondary shadow-[0_0_15px_rgba(255,153,0,0.1)]' : ''}`}>
        <CardHeader className={`border-b ${!twilioStatus?.connected ? 'border-secondary bg-secondary/10' : 'border-border'}`}>
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg tracking-widest font-mono">TWILIO INTEGRATION</CardTitle>
            {twilioLoading ? (
              <Badge variant="outline" className="rounded-none animate-pulse">CHECKING...</Badge>
            ) : twilioStatus?.connected ? (
              <Badge variant="outline" className="border-primary text-primary bg-primary/10 rounded-none">CONNECTED</Badge>
            ) : (
              <Badge variant="outline" className="border-secondary text-secondary bg-secondary/10 rounded-none">OFFLINE</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {!twilioStatus?.connected ? (
            <div className="p-4 bg-secondary/10 border border-secondary text-secondary font-mono text-sm tracking-widest">
              WARNING: TWILIO CREDENTIALS NOT FOUND IN ENVIRONMENT. 
              <br /><br />
              YOU MUST SET TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, AND TWILIO_PHONE_NUMBER TO PLACE ACTUAL CALLS. 
              <br /><br />
              UNTIL THEN, THE DIALER WILL RUN IN SIMULATION MODE (CALLS LOGGED BUT NOT PLACED).
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="text-xs text-muted-foreground mb-1">OUTBOUND NUMBER</div>
                <div className="font-mono text-lg">{twilioStatus.phoneNumber || "UNKNOWN"}</div>
              </div>
              <div className="text-sm text-primary">
                System is fully connected and ready to place outbound calls.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-background border-border rounded-none">
        <CardHeader className="border-b border-border">
          <CardTitle className="text-lg tracking-widest font-mono">SYSTEM HEALTH</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center space-x-4">
            <div className="text-sm text-muted-foreground w-24">API STATUS:</div>
            {healthLoading ? (
              <span className="animate-pulse">...</span>
            ) : (
              <span className={health?.status === 'ok' ? 'text-primary font-bold' : 'text-destructive font-bold'}>
                {health?.status?.toUpperCase() || 'UNKNOWN'}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
