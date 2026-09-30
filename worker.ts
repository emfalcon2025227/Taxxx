import http from "node:http";
import { httpServerHandler } from "cloudflare:node";
import { app } from "./server";

const server = http.createServer(app);
const expressHandler = httpServerHandler(server);

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    // Populate process.env from Cloudflare worker environment/secrets bindings
    if (env) {
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === "string") {
          process.env[key] = value;
        }
      }
    }

    const url = new URL(request.url);

    // If request is for an API route, dispatch to Express
    if (url.pathname.startsWith("/api/") || url.pathname === "/api") {
      return expressHandler.fetch(request, env, ctx);
    }

    // Serve static assets from Cloudflare Workers Assets binding
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status !== 404) {
        return assetRes;
      }
      // SPA route fallbacks
      if (url.pathname === "/admin" || url.pathname === "/admin.html") {
        return env.ASSETS.fetch(new Request(new URL("/admin.html", request.url), request));
      }
      if (url.pathname === "/login" || url.pathname === "/login.html") {
        return env.ASSETS.fetch(new Request(new URL("/login.html", request.url), request));
      }
      return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    }

    // Fallback to Express
    return expressHandler.fetch(request, env, ctx);
  }
};
