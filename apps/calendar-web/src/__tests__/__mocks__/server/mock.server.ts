import { setupServer } from "msw/node";
import { globalHandlers } from "./mock.handlers";

// This configures a request mocking server with the given request handlers.
export const server = setupServer(...globalHandlers);
