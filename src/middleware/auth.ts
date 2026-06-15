import type { FastifyReply, FastifyRequest } from "fastify";
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

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing or invalid Authorization header");
  }

  try {
    const payload = jwt.verify(token, env.SUPABASE_JWT_SECRET);
    if (typeof payload === "string" || !payload.sub) {
      throw new Error("Token missing subject");
    }
    request.user = { id: payload.sub };
  } catch {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid or expired token");
  }
}
