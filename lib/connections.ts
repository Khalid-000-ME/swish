import { randomBytes } from "node:crypto";
import type { Guardrails } from "./guardrails";

/**
 * A site's grant to use one agent, from one envelope, under stated
 * limits, until a stated time.
 *
 * This is the piece that becomes the extension's connect screen. The
 * shape is deliberately close to a wallet connection — an origin asks,
 * the operator approves, a token is issued — but what's granted is not a
 * key. It's a *bounded agent*: a site can ask this agent to propose
 * payments, and every one still goes through the diff, the screen, the
 * allow-list and the guardrails. A session key hands over signing
 * authority with caps bolted on; this hands over nothing and mediates
 * each request.
 */

export interface Connection {
  id: string;
  /** Opaque bearer token the site presents on each request. */
  token: string;
  origin: string;
  agentId: string;
  subAccountId: string;
  /** Limits for this connection, at most as permissive as the envelope's. */
  guardrails: Partial<Guardrails>;
  createdAt: number;
  expiresAt: number;
  maxActions: number;
  actionsUsed: number;
  revokedAt?: number;
  lastUsedAt?: number;
}

export interface ConnectionRequest {
  id: string;
  origin: string;
  /** What the site says it wants to do — shown to the operator, never trusted. */
  reason?: string;
  requestedAt: number;
  status: "pending" | "approved" | "rejected" | "expired";
  connectionId?: string;
}

interface ConnectionStore {
  requests: Map<string, ConnectionRequest>;
  connections: Map<string, Connection>;
}

const g = globalThis as unknown as { __bindConnections?: ConnectionStore };
function store(): ConnectionStore {
  if (!g.__bindConnections) {
    g.__bindConnections = { requests: new Map(), connections: new Map() };
  }
  return g.__bindConnections;
}

const REQUEST_TTL_MS = 5 * 60_000;

/** Normalises an origin so `https://a.com/path` and `https://a.com` match. */
export function normalizeOrigin(raw: string): string | null {
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function createRequest(origin: string, reason?: string): ConnectionRequest {
  const req: ConnectionRequest = {
    id: `req_${randomBytes(12).toString("hex")}`,
    origin,
    reason: reason?.slice(0, 200),
    requestedAt: Date.now(),
    status: "pending",
  };
  store().requests.set(req.id, req);
  return req;
}

export function getRequest(id: string): ConnectionRequest | undefined {
  const req = store().requests.get(id);
  if (req && req.status === "pending" && Date.now() - req.requestedAt > REQUEST_TTL_MS) {
    req.status = "expired";
  }
  return req;
}

export function pendingRequests(): ConnectionRequest[] {
  return [...store().requests.values()]
    .map((r) => getRequest(r.id)!)
    .filter((r) => r.status === "pending")
    .sort((a, b) => b.requestedAt - a.requestedAt);
}

export function approveRequest(input: {
  requestId: string;
  agentId: string;
  subAccountId: string;
  guardrails: Partial<Guardrails>;
  ttlMs: number;
  maxActions: number;
}): Connection | null {
  const req = getRequest(input.requestId);
  if (!req || req.status !== "pending") return null;

  const connection: Connection = {
    id: `con_${randomBytes(12).toString("hex")}`,
    token: randomBytes(32).toString("hex"),
    origin: req.origin,
    agentId: input.agentId,
    subAccountId: input.subAccountId,
    guardrails: input.guardrails,
    createdAt: Date.now(),
    expiresAt: Date.now() + input.ttlMs,
    maxActions: input.maxActions,
    actionsUsed: 0,
  };

  store().connections.set(connection.token, connection);
  req.status = "approved";
  req.connectionId = connection.id;
  return connection;
}

export function rejectRequest(requestId: string): boolean {
  const req = getRequest(requestId);
  if (!req || req.status !== "pending") return false;
  req.status = "rejected";
  return true;
}

export function listConnections(): Connection[] {
  return [...store().connections.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function revokeConnection(connectionId: string): boolean {
  for (const c of store().connections.values()) {
    if (c.id === connectionId && !c.revokedAt) {
      c.revokedAt = Date.now();
      return true;
    }
  }
  return false;
}

export type ConnectionRejection =
  | "unknown_token"
  | "revoked"
  | "expired"
  | "action_budget_spent"
  | "origin_mismatch";

/**
 * Resolves a bearer token to a live connection. Every reason a
 * connection can be unusable is distinct, because "your connection
 * stopped working" is not a debuggable message.
 */
export function resolveConnection(
  token: string | null,
  origin?: string | null
): { ok: true; connection: Connection } | { ok: false; reason: ConnectionRejection } {
  if (!token) return { ok: false, reason: "unknown_token" };

  const connection = store().connections.get(token);
  if (!connection) return { ok: false, reason: "unknown_token" };
  if (connection.revokedAt) return { ok: false, reason: "revoked" };
  if (Date.now() > connection.expiresAt) return { ok: false, reason: "expired" };
  if (connection.actionsUsed >= connection.maxActions) return { ok: false, reason: "action_budget_spent" };

  // An origin header is advisory — a non-browser caller can set anything —
  // so it's checked when present and not required when absent. The token
  // is what actually authorises.
  if (origin && normalizeOrigin(origin) !== connection.origin) {
    return { ok: false, reason: "origin_mismatch" };
  }

  return { ok: true, connection };
}

export function recordConnectionUse(connection: Connection) {
  connection.actionsUsed += 1;
  connection.lastUsedAt = Date.now();
}
