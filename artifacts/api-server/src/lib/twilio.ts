import twilio, { type Twilio } from "twilio";
import { logger } from "./logger";

const HOLD_MUSIC_URL =
  process.env["TWILIO_HOLD_MUSIC_URL"] ??
  "http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-Borghestral.mp3";

export type TwilioCallResult = {
  success: boolean;
  callSid?: string;
  error?: string;
};

export function getTwilioConfig(): {
  accountSid?: string;
  authToken?: string;
  phoneNumber?: string;
  apiKeySid?: string;
  apiKeySecret?: string;
  twimlAppSid?: string;
} {
  return {
    accountSid: process.env["TWILIO_ACCOUNT_SID"],
    authToken: process.env["TWILIO_AUTH_TOKEN"],
    phoneNumber:
      process.env["TWILIO_PHONE_NUMBER"] ?? process.env["TWILIO_FROM_NUMBER"],
    apiKeySid: process.env["TWILIO_API_KEY_SID"],
    apiKeySecret: process.env["TWILIO_API_KEY_SECRET"],
    twimlAppSid: process.env["TWILIO_TWIML_APP_SID"],
  };
}

export function isTwilioConfigured(): boolean {
  const cfg = getTwilioConfig();
  return Boolean(cfg.accountSid && cfg.authToken && cfg.phoneNumber);
}

export function isVoiceConfigured(): boolean {
  const cfg = getTwilioConfig();
  return Boolean(
    cfg.accountSid && cfg.apiKeySid && cfg.apiKeySecret && cfg.twimlAppSid,
  );
}

let _client: Twilio | null = null;
export function getTwilioClient(): Twilio | null {
  const cfg = getTwilioConfig();
  if (!cfg.accountSid || !cfg.authToken) return null;
  if (_client) return _client;
  _client = twilio(cfg.accountSid, cfg.authToken);
  return _client;
}

/**
 * Mint a short-lived Voice Access Token for the browser SDK.
 * The token grants the holder the ability to register as `identity`
 * on the Twilio Voice network and to make outgoing calls into the
 * configured TwiML app (which routes to /api/voice/twiml on this server).
 */
export function mintVoiceToken(identity: string): {
  token: string;
  identity: string;
  ttlSeconds: number;
} | null {
  const cfg = getTwilioConfig();
  if (
    !cfg.accountSid ||
    !cfg.apiKeySid ||
    !cfg.apiKeySecret ||
    !cfg.twimlAppSid
  ) {
    return null;
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const ttlSeconds = 3600; // 1h

  const token = new AccessToken(
    cfg.accountSid,
    cfg.apiKeySid,
    cfg.apiKeySecret,
    { identity, ttl: ttlSeconds },
  );

  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: cfg.twimlAppSid,
      incomingAllow: true,
    }),
  );

  return { token: token.toJwt(), identity, ttlSeconds };
}

/**
 * Build the TwiML response for an outgoing call from the browser.
 * Drops the agent into a unique conference, then we separately dial
 * the lead into the same conference using the REST API.
 */
export function buildAgentConferenceTwiml(opts: {
  conferenceName: string;
  endOnAgentExit?: boolean;
}): string {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const r = new VoiceResponse();
  const dial = r.dial({});
  dial.conference(
    {
      startConferenceOnEnter: true,
      endConferenceOnExit: opts.endOnAgentExit ?? false,
      waitUrl: "",
      beep: "false",
    },
    opts.conferenceName,
  );
  return r.toString();
}

export function buildLeadConferenceTwiml(conferenceName: string): string {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const r = new VoiceResponse();
  const dial = r.dial({});
  dial.conference(
    {
      startConferenceOnEnter: true,
      endConferenceOnExit: false,
      waitUrl: "",
      beep: "false",
    },
    conferenceName,
  );
  return r.toString();
}

/**
 * Place an outbound call to a lead and put them into the named conference.
 * Returns the lead leg's CallSid.
 */
export async function placeLeadIntoConference(opts: {
  to: string;
  conferenceName: string;
}): Promise<TwilioCallResult> {
  const client = getTwilioClient();
  const cfg = getTwilioConfig();
  if (!client || !cfg.phoneNumber) {
    return { success: false, error: "Twilio is not configured" };
  }

  try {
    const call = await client.calls.create({
      to: opts.to,
      from: cfg.phoneNumber,
      twiml: buildLeadConferenceTwiml(opts.conferenceName),
      timeout: 30,
    });
    return { success: true, callSid: call.sid };
  } catch (err) {
    logger.error({ err }, "Failed to place lead into conference");
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Dial another agent's browser softphone (`client:identity`) into the
 * named conference for warm/blind transfer.
 */
export async function placeAgentIntoConference(opts: {
  targetIdentity: string;
  conferenceName: string;
}): Promise<TwilioCallResult> {
  const client = getTwilioClient();
  const cfg = getTwilioConfig();
  if (!client || !cfg.phoneNumber) {
    return { success: false, error: "Twilio is not configured" };
  }

  try {
    const call = await client.calls.create({
      to: `client:${opts.targetIdentity}`,
      from: cfg.phoneNumber,
      twiml: buildLeadConferenceTwiml(opts.conferenceName),
      timeout: 30,
    });
    return { success: true, callSid: call.sid };
  } catch (err) {
    logger.error({ err }, "Failed to add agent to conference");
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function holdParticipant(opts: {
  conferenceName: string;
  callSid: string;
  hold: boolean;
}): Promise<boolean> {
  const client = getTwilioClient();
  if (!client) return false;
  try {
    await client
      .conferences(opts.conferenceName)
      .participants(opts.callSid)
      .update(
        opts.hold
          ? { hold: true, holdUrl: HOLD_MUSIC_URL, holdMethod: "GET" }
          : { hold: false },
      );
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to update participant hold state");
    return false;
  }
}

export async function endCallSid(callSid: string): Promise<boolean> {
  const client = getTwilioClient();
  if (!client) return false;
  try {
    await client.calls(callSid).update({ status: "completed" });
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to end call");
    return false;
  }
}

/**
 * Legacy: place a direct outbound call (no conference, no browser audio).
 * Kept for backwards compat with the previous "test call" flow.
 */
export async function placeOutboundCall(opts: {
  to: string;
  agentName?: string;
}): Promise<TwilioCallResult> {
  const client = getTwilioClient();
  const cfg = getTwilioConfig();
  if (!client || !cfg.phoneNumber) {
    return { success: false, error: "Twilio is not configured" };
  }

  const VoiceResponse = twilio.twiml.VoiceResponse;
  const r = new VoiceResponse();
  r.say({ voice: "alice" }, "Connecting your call.");
  r.pause({ length: 1800 });

  try {
    const call = await client.calls.create({
      to: opts.to,
      from: cfg.phoneNumber,
      twiml: r.toString(),
      timeout: 30,
    });
    return { success: true, callSid: call.sid };
  } catch (err) {
    logger.error({ err }, "Failed to place outbound call");
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function endTwilioCall(callSid: string): Promise<boolean> {
  return endCallSid(callSid);
}
