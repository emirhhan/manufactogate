import type { HealthResult, MarketId, SessionState } from "@manufactogate/core";
import type { ExtractFailure, ExtractRequest, ExtractResult } from "./runner";

/**
 * Messages between the web app and the extension.
 * Web → content script: window.postMessage({ source: "manufactogate-web", id, ...WebToExt })
 * Content script → web: window.postMessage({ source: "manufactogate-ext", replyTo: id, ...ExtToWeb })
 * The content script relays to the background worker over a runtime port named "mg".
 */

export const WEB_SOURCE = "manufactogate-web";
export const EXT_SOURCE = "manufactogate-ext";
export const EXT_MARKER_ATTR = "data-manufactogate-ext";
export const PORT_NAME = "mg";

export type WebToExt =
  | { type: "ping" }
  | { type: "sessions" }
  | { type: "health"; market?: MarketId }
  | { type: "run"; req: ExtractRequest }
  | { type: "capture" };

export type ExtToWeb =
  | { type: "pong"; version: string }
  | { type: "sessions"; sessions: Partial<Record<MarketId, SessionState>> }
  | { type: "health"; health: Partial<Record<MarketId, HealthResult>> }
  | { type: "run:result"; result: ExtractResult | ExtractFailure }
  | { type: "capture:result"; html: string; url: string; market: MarketId | null }
  | { type: "error"; message: string };

export interface Envelope<T> {
  source: typeof WEB_SOURCE | typeof EXT_SOURCE;
  id?: string;
  replyTo?: string;
  payload: T;
}
