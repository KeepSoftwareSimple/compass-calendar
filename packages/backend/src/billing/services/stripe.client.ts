import Stripe from "stripe";
import { CONFIG } from "@backend/common/constants/config.constants";
import { isStripeConfigured } from "@backend/common/constants/config.util";

/** Stripe API version supported by the installed SDK. */
export const STRIPE_API_VERSION = "2026-08-26.dahlia" as const;

let client: Stripe | undefined;

function getStripe(): Stripe {
  if (!isStripeConfigured(CONFIG) || !CONFIG.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured");
  }
  if (!client) {
    client = new Stripe(CONFIG.STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION,
    });
  }
  return client;
}

// Compass-owned Stripe surface. Only the operations billing actually calls;
// production delegates to the same SDK methods, tests stub just those.
export interface StripeBillingGateway {
  createCustomer(
    params: Stripe.CustomerCreateParams,
    options?: Stripe.RequestOptions,
  ): Promise<{ id: string }>;
  deleteCustomer(id: string, options?: Stripe.RequestOptions): Promise<void>;
  retrieveCustomer(
    id: string,
    params?: Stripe.CustomerRetrieveParams,
  ): Promise<Stripe.Customer | Stripe.DeletedCustomer>;
  updateCustomer(
    id: string,
    params: Stripe.CustomerUpdateParams,
  ): Promise<Stripe.Customer>;
  createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
    options?: Stripe.RequestOptions,
  ): Promise<{ client_secret?: string | null }>;
  retrieveCheckoutSession(
    id: string,
    params?: Stripe.Checkout.SessionRetrieveParams,
  ): Promise<Stripe.Checkout.Session>;
  updateSubscription(
    id: string,
    params: Stripe.SubscriptionUpdateParams,
    options?: Stripe.RequestOptions,
  ): Promise<Stripe.Subscription>;
  retrieveSubscription(
    id: string,
    params?: Stripe.SubscriptionRetrieveParams,
  ): Promise<Stripe.Subscription>;
  listInvoices(
    params?: Stripe.InvoiceListParams,
  ): Promise<{ data: Stripe.Invoice[] }>;
  constructWebhookEvent(
    payload: string | Buffer,
    header: string,
    secret: string,
  ): Promise<Stripe.Event>;
}

function createStripeBillingGateway(): StripeBillingGateway {
  return {
    createCustomer: (params, options) =>
      getStripe().customers.create(params, options),
    deleteCustomer: async (id, options) => {
      await getStripe().customers.del(id, options);
    },
    retrieveCustomer: (id, params) =>
      getStripe().customers.retrieve(id, params),
    updateCustomer: (id, params) => getStripe().customers.update(id, params),
    createCheckoutSession: (params, options) =>
      getStripe().checkout.sessions.create(params, options),
    retrieveCheckoutSession: (id, params) =>
      getStripe().checkout.sessions.retrieve(id, params),
    updateSubscription: (id, params, options) =>
      getStripe().subscriptions.update(id, params, options),
    retrieveSubscription: (id, params) =>
      getStripe().subscriptions.retrieve(id, params),
    listInvoices: (params) => getStripe().invoices.list(params),
    constructWebhookEvent: (payload, header, secret) =>
      getStripe().webhooks.constructEventAsync(payload, header, secret),
  };
}

export const stripeBillingGateway: StripeBillingGateway =
  createStripeBillingGateway();
