import { useEffect, useRef, useState } from "react";
import { Device, type Call } from "@twilio/voice-sdk";
import { getVoiceToken } from "@workspace/api-client-react";

export type DeviceStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "registering"
  | "connecting"
  | "in_call"
  | "error"
  | "unsupported";

export type TwilioDeviceState = {
  status: DeviceStatus;
  error: string | null;
  device: Device | null;
  call: Call | null;
};

export function useTwilioDevice(identity: string) {
  const [state, setState] = useState<TwilioDeviceState>({
    status: "idle",
    error: null,
    device: null,
    call: null,
  });
  const deviceRef = useRef<Device | null>(null);
  const callRef = useRef<Call | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    if (typeof window === "undefined") return;
    initialized.current = true;

    let cancelled = false;

    const init = async () => {
      setState((s) => ({ ...s, status: "initializing", error: null }));
      try {
        const tokenRes = await getVoiceToken({ identity });
        if (cancelled) return;
        const device = new Device(tokenRes.token, {
          logLevel: 1,
          codecPreferences: ["opus" as any, "pcmu" as any],
        });

        device.on("registered", () => {
          setState((s) => ({ ...s, status: "ready", device }));
        });
        device.on("unregistered", () => {
          setState((s) => ({ ...s, status: "registering" }));
        });
        device.on("error", (err: Error) => {
          setState((s) => ({ ...s, status: "error", error: err.message }));
        });
        device.on("incoming", (incoming: Call) => {
          // Auto-accept inbound (e.g. transfers) — they ring the agent's
          // browser and we want to be in the conference immediately.
          callRef.current = incoming;
          incoming.accept();
          attachCallHandlers(incoming);
          setState((s) => ({ ...s, status: "in_call", call: incoming }));
        });
        device.on("tokenWillExpire", async () => {
          try {
            const next = await getVoiceToken({ identity });
            device.updateToken(next.token);
          } catch {
            // ignore — device will surface an error if it fully expires
          }
        });

        deviceRef.current = device;
        await device.register();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setState({
          status: "error",
          error: msg,
          device: null,
          call: null,
        });
      }
    };

    function attachCallHandlers(call: Call) {
      call.on("disconnect", () => {
        callRef.current = null;
        setState((s) => ({ ...s, status: "ready", call: null }));
      });
      call.on("cancel", () => {
        callRef.current = null;
        setState((s) => ({ ...s, status: "ready", call: null }));
      });
      call.on("reject", () => {
        callRef.current = null;
        setState((s) => ({ ...s, status: "ready", call: null }));
      });
      call.on("error", (err: Error) => {
        setState((s) => ({ ...s, error: err.message }));
      });
    }

    init();

    return () => {
      cancelled = true;
      if (callRef.current) {
        try {
          callRef.current.disconnect();
        } catch {
          /* noop */
        }
      }
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  const connect = async (params: Record<string, string>) => {
    const device = deviceRef.current;
    if (!device) throw new Error("Device not ready");
    setState((s) => ({ ...s, status: "connecting", error: null }));
    const call = await device.connect({ params });
    callRef.current = call;
    call.on("accept", () => {
      setState((s) => ({ ...s, status: "in_call", call }));
    });
    call.on("disconnect", () => {
      callRef.current = null;
      setState((s) => ({ ...s, status: "ready", call: null }));
    });
    call.on("cancel", () => {
      callRef.current = null;
      setState((s) => ({ ...s, status: "ready", call: null }));
    });
    call.on("error", (err: Error) => {
      setState((s) => ({ ...s, error: err.message }));
    });
    setState((s) => ({ ...s, call }));
    return call;
  };

  const disconnect = () => {
    if (callRef.current) {
      callRef.current.disconnect();
    }
    deviceRef.current?.disconnectAll();
  };

  const sendDigits = (digits: string) => {
    callRef.current?.sendDigits(digits);
  };

  const muteSelf = (muted: boolean) => {
    callRef.current?.mute(muted);
  };

  return { ...state, connect, disconnect, sendDigits, muteSelf };
}
