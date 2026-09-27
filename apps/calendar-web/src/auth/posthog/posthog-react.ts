import { type PostHog } from "posthog-js";
import {
  createContext,
  createElement,
  type PropsWithChildren,
  useContext,
} from "react";

const PostHogContext = createContext<PostHog | undefined>(undefined);

export const PostHogProvider = ({
  children,
  client,
}: PropsWithChildren<{ client: PostHog }>) =>
  createElement(PostHogContext.Provider, { value: client }, children);

export const usePostHog = () => useContext(PostHogContext);
