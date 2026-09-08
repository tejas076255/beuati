import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// createCsrfMiddleware guard — imported separately so a missing/undefined
// export (e.g. older bundle on Vercel) doesn't crash the entire server.
let csrfMiddleware: ReturnType<typeof createMiddleware> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const startPkg = require("@tanstack/react-start");
  if (typeof startPkg.createCsrfMiddleware === "function") {
    csrfMiddleware = startPkg.createCsrfMiddleware({
      filter: (ctx: { handlerType: string }) => ctx.handlerType === "serverFn",
    });
  }
} catch {
  // package not available in this environment — skip CSRF middleware
}

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: csrfMiddleware
    ? [errorMiddleware, csrfMiddleware]
    : [errorMiddleware],
}));
