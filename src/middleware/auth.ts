import type { FastifyReply, FastifyRequest } from "fastify";
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from "jose";
import jwt from "jsonwebtoken";
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

async function verifyToken(token: string): Promise<string> {
  const { alg } = decodeProtectedHeader(token);

  if (alg === "ES256") {
    const { payload } = await jwtVerify(token, jwks, { algorithms: ["ES256"] });
    if (!payload.sub) {
      throw new Error("Token missing subject");
    }
    return payload.sub;
  }

  // Legacy HS256 fallback during the cutover to asymmetric keys. Remove once
  // all clients issue ES256 tokens (and drop SUPABASE_JWT_SECRET).
  if (alg === "HS256" && env.SUPABASE_JWT_SECRET) {
    const payload = jwt.verify(token, env.SUPABASE_JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof payload === "string" || !payload.sub) {
      throw new Error("Token missing subject");
    }
    return payload.sub;
  }

  throw new Error(`Unsupported token algorithm: ${alg}`);
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid Authorization header");
  }

  try {
    request.user = { id: await verifyToken(token) };
  } catch {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired token");
  }
}
