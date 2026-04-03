"use client";

import { useCallback, useEffect, useState } from "react";

const WEBSITE_BRIDGE_SOURCE = "qadeck-website";
const EXTENSION_BRIDGE_SOURCE = "qadeck-extension";
const BRIDGE_REQUEST_TYPE = "QADECK_BRIDGE_REQUEST";
const BRIDGE_RESPONSE_TYPE = "QADECK_BRIDGE_RESPONSE";
const BRIDGE_BOOTSTRAP_TYPE = "QADECK_BRIDGE_BOOTSTRAP";

let bootstrapState: ExtensionConnectionResponse | null = null;

export type ExtensionInstallState =
  | "checking"
  | "extension_not_detected"
  | "extension_detected_not_connected"
  | "connected";

export interface ExtensionConnectionState {
  ready: boolean;
  installed: boolean;
  connected: boolean;
  email: string | null;
  version: string | null;
  state: ExtensionInstallState;
}

interface ExtensionConnectionResponse {
  installed?: boolean;
  connected?: boolean;
  email?: string | null;
  version?: string | null;
  success?: boolean;
  opened?: boolean;
  error?: string;
}

const DEFAULT_STATE: ExtensionConnectionState = {
  ready: false,
  installed: false,
  connected: false,
  email: null,
  version: null,
  state: "checking",
};

function normalizeConnectionState(
  response: ExtensionConnectionResponse | null
): ExtensionConnectionState {
  if (!response?.installed) {
    return {
      ready: true,
      installed: false,
      connected: false,
      email: null,
      version: null,
      state: "extension_not_detected",
    };
  }

  if (response.connected) {
    return {
      ready: true,
      installed: true,
      connected: true,
      email: response.email || null,
      version: response.version || null,
      state: "connected",
    };
  }

  return {
    ready: true,
    installed: true,
    connected: false,
    email: response.email || null,
    version: response.version || null,
    state: "extension_detected_not_connected",
  };
}

function hasBridgePresenceMarker() {
  if (typeof document === "undefined") return false;
  return document.documentElement?.getAttribute("data-qadeck-extension") === "installed";
}

function readBootstrapState() {
  if (bootstrapState?.installed) return bootstrapState;
  if (hasBridgePresenceMarker()) {
    return { installed: true, connected: false } satisfies ExtensionConnectionResponse;
  }
  return null;
}

if (typeof window !== "undefined") {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const payload = event.data;
    if (!payload || payload.source !== EXTENSION_BRIDGE_SOURCE) return;
    if (payload.type !== BRIDGE_BOOTSTRAP_TYPE) return;
    bootstrapState = payload.response || { installed: true, connected: false };
  });
}

function makeBridgeId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `bridge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function sendExtensionBridgeMessage<T>(
  message: Record<string, unknown>,
  timeoutMs = 2500
): Promise<T | null> {
  if (typeof window === "undefined") return null;

  const attempt = () =>
    new Promise<T | null>((resolve) => {
      const bridgeId = makeBridgeId();
      let settled = false;

      const cleanup = () => {
        settled = true;
        window.removeEventListener("message", onMessage);
        window.clearTimeout(timer);
      };

      const onMessage = (event: MessageEvent) => {
        if (event.source !== window) return;
        const payload = event.data;
        if (!payload || payload.source !== EXTENSION_BRIDGE_SOURCE) return;
        if (payload.type !== BRIDGE_RESPONSE_TYPE || payload.bridgeId !== bridgeId) return;
        cleanup();
        resolve((payload.response || null) as T | null);
      };

      const timer = window.setTimeout(() => {
        if (settled) return;
        cleanup();
        resolve(null);
      }, timeoutMs);

      window.addEventListener("message", onMessage);
      window.postMessage(
        {
          source: WEBSITE_BRIDGE_SOURCE,
          type: BRIDGE_REQUEST_TYPE,
          bridgeId,
          message,
        },
        window.location.origin
      );
    });

  let response = await attempt();
  if (response) return response;

  await new Promise((resolve) => window.setTimeout(resolve, 250));
  response = await attempt();
  if (response) return response;

  await new Promise((resolve) => window.setTimeout(resolve, 500));
  return attempt();
}

export async function getExtensionConnectionState() {
  const response = await sendExtensionBridgeMessage<ExtensionConnectionResponse>({
    type: "QADECK_GET_CONNECTION_STATE",
  });
  return normalizeConnectionState(response || readBootstrapState());
}

export async function openExtensionSidePanel() {
  const response = await sendExtensionBridgeMessage<ExtensionConnectionResponse>({
    type: "QADECK_OPEN_SIDEPANEL",
  });
  return !!response?.success;
}

export async function openProjectInExtension(payload: {
  projectId: string;
  projectName?: string;
  sourceUrl?: string | null;
  requestedTab?: "scan" | "journey" | "testcases" | "script" | "cicd" | "selectors" | "record";
}) {
  const response = await sendExtensionBridgeMessage<ExtensionConnectionResponse>({
    type: "QADECK_OPEN_PROJECT_CONTEXT",
    projectId: payload.projectId,
    projectName: payload.projectName || null,
    sourceUrl: payload.sourceUrl || null,
    requestedTab: payload.requestedTab || "scan",
  }, 15000);

  if (!response) {
    return { success: false, error: "Extension not responding or timed out" };
  }

  return {
    success: !!response.success,
    opened: !!response.opened,
    error: response.error,
  };
}

export async function getExtensionApiKey(): Promise<{ success: boolean; apiKey?: string; error?: string }> {
  const response = await sendExtensionBridgeMessage<{ success: boolean; apiKey?: string; error?: string }>({
    type: "QADECK_GET_API_KEY",
  }, 3000);
  if (!response) return { success: false, error: "Extension not responding" };
  return response;
}

export async function rescanProjectViaExtension(payload: {
  projectId: string;
  sourceUrl: string;
}): Promise<{ success: boolean; scanData?: Record<string, unknown>; error?: string }> {
  const response = await sendExtensionBridgeMessage<{ success: boolean; scanData?: Record<string, unknown>; error?: string }>({
    type: "QADECK_RESCAN_PROJECT",
    projectId: payload.projectId,
    sourceUrl: payload.sourceUrl,
  }, 45000); // needs to focus the app tab, wait for load, and complete DOM extraction
  if (!response) return { success: false, error: "Extension not responding or timed out" };
  return response;
}

export async function getCurrentPageFromExtension(): Promise<{ pageLabel: string; pageKey: string; url: string } | null> {
  const response = await sendExtensionBridgeMessage<{ pageLabel?: string; pageKey?: string; url?: string }>({
    type: "QADECK_GET_CURRENT_PAGE",
  }, 3000); // quick check - 3 second timeout

  if (!response) return null;
  return {
    pageLabel: response.pageLabel || "unknown",
    pageKey: response.pageKey || "",
    url: response.url || "",
  };
}

export async function disconnectExtensionSession() {
  await sendExtensionBridgeMessage<ExtensionConnectionResponse>({
    type: "QADECK_DISCONNECT_SESSION",
  });
}

async function requestExtensionSession(idToken: string) {
  const response = await fetch("/api/extension/session", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Unable to create an extension session.");
  }

  return data as {
    uid: string;
    email: string;
    displayName: string;
    photoURL: string | null;
    customToken: string;
    dashboardProjectsUrl: string;
  };
}

export async function connectExtensionToWebsiteUser(idToken: string) {
  const session = await requestExtensionSession(idToken);
  const queued = await sendExtensionBridgeMessage<ExtensionConnectionResponse>({
    type: "QADECK_CONNECT_SESSION",
    customToken: session.customToken,
    profile: {
      uid: session.uid,
      email: session.email,
      displayName: session.displayName,
      photoURL: session.photoURL,
    },
    websiteOrigin: window.location.origin,
  });

  if (!queued?.success) {
    throw new Error(queued?.error || "QA Deck is installed but could not queue the connection.");
  }

  await openExtensionSidePanel();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const state = await getExtensionConnectionState();
    if (state.connected) return state;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }

  return getExtensionConnectionState();
}

export function useExtensionConnection(options?: { enabled?: boolean; pollMs?: number }) {
  const enabled = options?.enabled ?? true;
  const pollMs = options?.pollMs ?? 0;
  const [state, setState] = useState<ExtensionConnectionState>(DEFAULT_STATE);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setState(DEFAULT_STATE);
      return DEFAULT_STATE;
    }

    const nextState = await getExtensionConnectionState();
    setState(nextState);
    return nextState;
  }, [enabled]);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    if (!enabled) {
      setState(DEFAULT_STATE);
      return undefined;
    }

    refresh().then((nextState) => {
      if (!cancelled) setState(nextState);
    });

    if (pollMs > 0) {
      intervalId = window.setInterval(() => {
        refresh().then((nextState) => {
          if (!cancelled) setState(nextState);
        });
      }, pollMs);
    }

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [enabled, pollMs, refresh]);

  return { state, refresh };
}
