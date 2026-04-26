import { logger } from "./logger";

export type TwilioCallResult = {
  success: boolean;
  callSid?: string;
  error?: string;
};

export function getTwilioConfig(): {
  accountSid?: string;
  authToken?: string;
  phoneNumber?: string;
} {
  return {
    accountSid: process.env["TWILIO_ACCOUNT_SID"],
    authToken: process.env["TWILIO_AUTH_TOKEN"],
    phoneNumber:
      process.env["TWILIO_PHONE_NUMBER"] ?? process.env["TWILIO_FROM_NUMBER"],
  };
}

export function isTwilioConfigured(): boolean {
  const cfg = getTwilioConfig();
  return Boolean(cfg.accountSid && cfg.authToken && cfg.phoneNumber);
}

function basicAuthHeader(sid: string, token: string): string {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

/**
 * Place an outbound call using the Twilio REST API directly (no SDK).
 * Twilio dials `to`, plays a brief greeting, then keeps the line open
 * (Pause). The agent works the script via the UI and ends the call when done.
 */
export async function placeOutboundCall(opts: {
  to: string;
  agentName?: string;
}): Promise<TwilioCallResult> {
  const cfg = getTwilioConfig();
  if (!cfg.accountSid || !cfg.authToken || !cfg.phoneNumber) {
    return {
      success: false,
      error: "Twilio is not configured",
    };
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting your call.</Say>
  <Pause length="1800"/>
</Response>`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Calls.json`;
  const body = new URLSearchParams({
    To: opts.to,
    From: cfg.phoneNumber,
    Twiml: twiml,
    Timeout: "30",
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(cfg.accountSid, cfg.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const json = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) {
      logger.warn({ status: res.status, json }, "Twilio API error");
      return {
        success: false,
        error: json.message ?? `Twilio responded ${res.status}`,
      };
    }
    return { success: true, callSid: json.sid };
  } catch (err) {
    logger.error({ err }, "Failed to call Twilio API");
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function endTwilioCall(callSid: string): Promise<boolean> {
  const cfg = getTwilioConfig();
  if (!cfg.accountSid || !cfg.authToken) return false;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Calls/${callSid}.json`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(cfg.accountSid, cfg.authToken),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ Status: "completed" }).toString(),
    });
    return res.ok;
  } catch (err) {
    logger.error({ err }, "Failed to end Twilio call");
    return false;
  }
}
