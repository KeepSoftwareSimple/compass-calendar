import express, { type Application } from "express";
import helmet from "helmet";
import {
  errorHandler as supertokensErrorHandler,
  middleware as supertokensMiddleware,
} from "supertokens-node/framework/express";
import {
  configureHttpServer,
  HTTP_JSON_BODY_LIMIT,
} from "@core/server/http-server";
import { AuthRoutes } from "@backend/auth/auth.routes.config";
import {
  BillingRoutes,
  mountStripeWebhook,
} from "@backend/billing/billing.routes.config";
import { BookingRoutes } from "@backend/booking/booking.routes.config";
import { CalendarRoutes } from "@backend/calendar/calendar.routes.config";
import { type CommonRoutesConfig } from "@backend/common/common.routes.config";
import corsWhitelist from "@backend/common/middleware/cors.middleware";
import { httpLoggingMiddleware } from "@backend/common/middleware/http.logger.middleware";
import { requestMiddleware } from "@backend/common/middleware/promise.middleware";
import {
  initSupertokens,
  supertokensCors,
} from "@backend/common/middleware/supertokens.middleware";
import { ConfigRoutes } from "@backend/config/config.routes.config";
import { ContactsRoutes } from "@backend/contacts/contacts.routes.config";
import {
  EmailRoutes,
  mountResendEmailWebhook,
} from "@backend/email/email.routes.config";
import { EventRoutes } from "@backend/event/event.routes.config";
import { HealthRoutes } from "@backend/health/health.routes.config";
import { EventsRoutes } from "@backend/servers/sse/events-stream.routes.config";
import { UserRoutes } from "@backend/user/user.routes.config";
import { createServer } from "node:http";

export const initExpressServer = () => {
  /* Express Configuration */
  const app: Application = express();
  // Caddy terminates TLS and proxies `/api/*` with X-Forwarded-For. One hop
  // of trust keeps express-rate-limit from treating every visitor as Caddy.
  app.set("trust proxy", 1);
  // All supported query parameters are flat. The simple parser preserves
  // repeated keys as arrays without qs's nesting work or array-size quirks,
  // which also makes native-client encodings behave consistently with sync.
  app.set("query parser", "simple");

  initSupertokens();

  // initialize middleware before routes, because
  // some routes depend on them
  app.use(requestMiddleware());
  app.use(supertokensCors());
  app.use(corsWhitelist);
  app.use(helmet());
  app.use(httpLoggingMiddleware);
  // Stripe HMAC is over the exact request bytes. SuperTokens and
  // express.json() both parse JSON and would make every signature check
  // 400, so this route is handled before either of them.
  mountStripeWebhook(app);
  mountResendEmailWebhook(app);
  app.use(supertokensMiddleware());
  app.use(express.json({ limit: HTTP_JSON_BODY_LIMIT }));

  const routes: Array<CommonRoutesConfig> = [];
  routes.push(new HealthRoutes(app));
  routes.push(new ConfigRoutes(app));
  routes.push(new AuthRoutes(app));
  routes.push(new UserRoutes(app));
  routes.push(new BillingRoutes(app));
  routes.push(new EmailRoutes(app));
  routes.push(new EventRoutes(app));
  routes.push(new EventsRoutes(app));
  routes.push(new CalendarRoutes(app));
  routes.push(new ContactsRoutes(app));
  routes.push(new BookingRoutes(app));

  app.use(supertokensErrorHandler()); // Keep this after routes

  return app;
};

export const createBackendHttpServer = () =>
  configureHttpServer(createServer(initExpressServer()));
