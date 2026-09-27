import {
  type BillingCheckoutResponse,
  BillingCheckoutResponseSchema,
  type BillingStatusResponse,
  BillingStatusResponseSchema,
  type BillingSubscriptionResponse,
  BillingSubscriptionResponseSchema,
} from "@core/types/billing.types";
import { BaseApi } from "@web/api/base/base.api";

const BillingApi = {
  async getStatus(): Promise<BillingStatusResponse> {
    const response =
      await BaseApi.get<BillingStatusResponse>(`/billing/status`);
    return BillingStatusResponseSchema.parse(response.data);
  },

  async getSubscription(): Promise<BillingSubscriptionResponse> {
    const response = await BaseApi.get<BillingSubscriptionResponse>(
      `/billing/subscription`,
    );
    return BillingSubscriptionResponseSchema.parse(response.data);
  },

  async createCheckoutSession(): Promise<BillingCheckoutResponse> {
    const response = await BaseApi.post<BillingCheckoutResponse>(
      `/billing/checkout/session`,
    );
    return BillingCheckoutResponseSchema.parse(response.data);
  },

  /** Ends the Stripe trial now, charging the card on file today. */
  async endTrial(): Promise<BillingStatusResponse> {
    const response =
      await BaseApi.post<BillingStatusResponse>(`/billing/trial/end`);
    return BillingStatusResponseSchema.parse(response.data);
  },

  async cancelSubscription(): Promise<BillingStatusResponse> {
    const response = await BaseApi.post<BillingStatusResponse>(
      `/billing/subscription/cancel`,
    );
    return BillingStatusResponseSchema.parse(response.data);
  },

  async resumeSubscription(): Promise<BillingStatusResponse> {
    const response = await BaseApi.post<BillingStatusResponse>(
      `/billing/subscription/resume`,
    );
    return BillingStatusResponseSchema.parse(response.data);
  },

  async createPaymentMethodSession(): Promise<BillingCheckoutResponse> {
    const response = await BaseApi.post<BillingCheckoutResponse>(
      `/billing/payment-method/session`,
    );
    return BillingCheckoutResponseSchema.parse(response.data);
  },
};

export { BillingApi };
