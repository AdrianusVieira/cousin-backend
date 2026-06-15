import type { FastifyInstance } from "fastify";
import {
  createWalletSchema,
  patchWalletSchema,
  walletDetailQuerySchema,
  walletListQuerySchema,
} from "./wallets.schema.js";
import {
  createWallet,
  getWalletDetail,
  listWallets,
  patchWallet,
  setWalletArchiveStatus,
} from "./wallets.service.js";

export async function registerWalletRoutes(app: FastifyInstance) {
  app.get("/wallets", async (request) => {
    const query = walletListQuerySchema.parse(request.query);
    return listWallets(query);
  });

  app.post("/wallets", async (request, reply) => {
    const body = createWalletSchema.parse(request.body);
    const wallet = await createWallet(body);
    reply.status(201);
    return wallet;
  });

  app.get<{ Params: { id: string } }>("/wallets/:id", async (request) => {
    const query = walletDetailQuerySchema.parse(request.query);
    return getWalletDetail(request.params.id, query);
  });

  app.patch<{ Params: { id: string } }>("/wallets/:id", async (request) => {
    const body = patchWalletSchema.parse(request.body);
    return patchWallet(request.params.id, body);
  });

  app.post<{ Params: { id: string } }>("/wallets/:id/archive", async (request) => {
    return setWalletArchiveStatus(request.params.id, true);
  });

  app.post<{ Params: { id: string } }>("/wallets/:id/unarchive", async (request) => {
    return setWalletArchiveStatus(request.params.id, false);
  });
}
