import { Request, Response, NextFunction } from "express";
import config from "../config";
import logger from "../logger/logger";

/**
 * Simple API key middleware.
 * - If config.apiKey is "changeme" or empty, middleware is a no-op (allows all).
 * - Otherwise expects header `x-api-key: <key>` or `Authorization: Bearer <key>`
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const key = config.apiKey;
  if (!key || key === "changeme") {
    return next();
  }

  const header = (req.headers["x-api-key"] as string) || (req.headers["authorization"] as string) || "";
  if (!header) {
    logger.warn("auth: missing api key");
    return res.status(401).json({ success: false, error: "unauthorized" });
  }

  const provided = header.startsWith("Bearer ") ? header.slice(7) : header;
  if (provided !== key) {
    logger.warn("auth: invalid api key attempt");
    return res.status(401).json({ success: false, error: "unauthorized" });
  }

  // passed
  return next();
}
