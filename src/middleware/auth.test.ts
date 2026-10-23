import Fastify from "fastify";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { ApiError } from "../lib/errors.js";
import { requireAuth } from "./auth.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
async function access(subject?: string) {
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) => {
    reply
      .code(error instanceof ApiError ? error.status : 500)
      .send({ message: error instanceof Error ? error.message : "Unknown error" });
  });
  app.addHook("onRequest", requireAuth);
  app.get("/private", () => ({ ok: true }));
  const token =
    subject && jwt.sign({ sub: subject }, "test-secret", { algorithm: "HS256", expiresIn: "1m" });
  try {
    return await app.inject({
      url: "/private",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  } finally {
    await app.close();
  }
}
describe("owner access", () => {
  it("accepts the configured owner", async () => {
    expect((await access(OWNER)).statusCode).toBe(200);
  });
  it("rejects another authenticated account", async () => {
    expect((await access("22222222-2222-4222-8222-222222222222")).statusCode).toBe(403);
  });
  it("rejects an unauthenticated request", async () => {
    expect((await access()).statusCode).toBe(401);
  });
});
