import { create } from "zustand";
import { type ViewName } from "@web/shortcuts/shortcuts.constants";

export interface FeedbackRequest {
  view: ViewName;
}

interface FeedbackState {
  request: FeedbackRequest | null;
}

export const useFeedbackStore = create<FeedbackState>()(() => ({
  request: null,
}));

export const feedbackActions = {
  open: (view: ViewName) => useFeedbackStore.setState({ request: { view } }),
  close: () => useFeedbackStore.setState({ request: null }),
};

export const selectFeedbackRequest = (state: FeedbackState) => state.request;
