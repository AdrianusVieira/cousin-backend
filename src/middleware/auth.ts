import type { FastifyReply, FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env.js";
import { ApiError } from "../lib/errors.js";

export interface AuthenticatedUser {
  id: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

// Supabase's asymmetric (ES256) signing keys, fetched and cached from the
// project's JWKS endpoint. Key rotation is handled transparently.
const jwks = createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL));

const allowedUserIds = new Set(env.ALLOWED_USER_IDS);

/**
 * A signature alone is not authorization. Supabase will happily issue a valid
 * ES256 token to anyone who can create an account in the project, and no table
 * here is scoped per user - so every endpoint would be readable and writable by
 * any registered account. The allowlist is what makes a token mean "the owner".
 */
export function isAllowedUser(sub: string): boolean {
  return allowedUserIds.has(sub);
}

async function verifySubject(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, jwks, { algorithms: ["ES256"] });

  if (!payload.sub) {
    throw new Error("Token missing subject");
  }

  return payload.sub;
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid Authorization header");
  }

  let sub: string;
  try {
    sub = await verifySubject(token);
  } catch {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired token");
  }

  if (!isAllowedUser(sub)) {
    request.log.warn({ sub }, "rejected token for non-allowlisted user");
    throw new ApiError(403, "FORBIDDEN", "This account is not permitted to use this API");
  }

  request.user = { id: sub };
}
