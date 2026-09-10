import { type StripeBillingGateway } from "@backend/billing/services/stripe.client";

function unused<K extends keyof StripeBillingGateway>(
  name: K,
): StripeBillingGateway[K] {
  return ((..._args: never[]) => {
    throw new Error(`StripeBillingGateway.${name} is not stubbed`);
  }) as StripeBillingGateway[K];
}

export function stubBillingGateway(
  overrides: Record<string, unknown> = {},
): StripeBillingGateway {
  return {
    createCustomer: unused("createCustomer"),
    deleteCustomer: unused("deleteCustomer"),
    retrieveCustomer: unused("retrieveCustomer"),
    updateCustomer: unused("updateCustomer"),
    createCheckoutSession: unused("createCheckoutSession"),
    retrieveCheckoutSession: unused("retrieveCheckoutSession"),
    updateSubscription: unused("updateSubscription"),
    retrieveSubscription: unused("retrieveSubscription"),
    listInvoices: unused("listInvoices"),
    constructWebhookEvent: unused("constructWebhookEvent"),
    ...overrides,
  } as StripeBillingGateway;
}
