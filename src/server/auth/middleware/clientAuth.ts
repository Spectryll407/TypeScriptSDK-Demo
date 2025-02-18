import { z } from "zod";
import { RequestHandler } from "express";
import { OAuthRegisteredClientsStore } from "../clients.js";
import { OAuthClientInformationFull } from "../../../shared/auth.js";
import { InvalidRequestError, InvalidClientError, ServerError, OAuthError } from "../errors.js";

export type ClientAuthenticationMiddlewareOptions = {
  /**
   * A store used to read information about registered OAuth clients.
   */
  clientsStore: OAuthRegisteredClientsStore;
}

const ClientAuthenticatedRequestSchema = z.object({
  client_id: z.string(),
  client_secret: z.string().optional(),
});

declare module "express-serve-static-core" {
  interface Request {
    /**
     * The authenticated client for this request, if the `authenticateClient` middleware was used.
     */
    client?: OAuthClientInformationFull;
  }
}

export function authenticateClient({ clientsStore }: ClientAuthenticationMiddlewareOptions): RequestHandler {
  return async (req, res, next) => {
    try {
      const result = ClientAuthenticatedRequestSchema.safeParse(req.body);
      if (!result.success) {
        throw new InvalidRequestError(String(result.error));
      }

      const { client_id, client_secret } = result.data;
      const client = await clientsStore.getClient(client_id);
      if (!client) {
        throw new InvalidClientError("Invalid client_id");
      }

      if (client.client_secret !== client_secret) {
        throw new InvalidClientError("Invalid client_secret");
      }

      req.client = client;
      next();
    } catch (error) {
      if (error instanceof OAuthError) {
        const status = error instanceof ServerError ? 500 : 400;
        res.status(status).json(error.toResponseObject());
      } else {
        console.error("Unexpected error authenticating client:", error);
        const serverError = new ServerError("Internal Server Error");
        res.status(500).json(serverError.toResponseObject());
      }
    }
  }
}