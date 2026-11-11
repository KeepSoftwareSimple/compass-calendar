import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { act, useState } from "react";
import { server } from "@web/__tests__/__mocks__/server/mock.server";
import { renderWithStore } from "@web/__tests__/render-with-store";
import { STABLE_LOADING_SHOW_DELAY_MS } from "@web/common/hooks/useStableLoadingVisible";
import { LocationField } from "@web/views/Forms/EventForm/LocationField/LocationField";
import { PLACES_AUTOCOMPLETE_URL } from "@web/views/Forms/EventForm/LocationField/places.client";
import { PLACE_SUGGESTION_DEBOUNCE_MS } from "@web/views/Forms/EventForm/LocationField/usePlaceSuggestions";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const SUGGESTIONS = [
  "1600 Amphitheatre Pkwy, Mountain View, CA, USA",
  "1600 Amphitheatre Parkway, Mountain View, CA, USA",
];

let requests: { input: string; apiKey: string | null }[] = [];

// Negative assertions ("no Places call was made") have to outlast the
// suggestion debounce, so derive the wait from it rather than hard-coding a
// number that would quietly stop waiting long enough if the debounce grows.
const settleDebounce = () =>
  act(
    () =>
      new Promise((resolve) =>
        setTimeout(resolve, PLACE_SUGGESTION_DEBOUNCE_MS + 150),
      ),
  );

const waitForLoadingRow = () =>
  act(
    () =>
      new Promise((resolve) =>
        setTimeout(
          resolve,
          PLACE_SUGGESTION_DEBOUNCE_MS + STABLE_LOADING_SHOW_DELAY_MS + 100,
        ),
      ),
  );

const usePlacesResponse = (respond: () => Response) => {
  server.use(
    http.post(PLACES_AUTOCOMPLETE_URL, async ({ request }) => {
      const body = (await request.json()) as { input: string };
      requests.push({
        input: body.input,
        apiKey: request.headers.get("X-Goog-Api-Key"),
      });
      return respond();
    }),
  );
};

const placesOk = () =>
  HttpResponse.json({
    suggestions: SUGGESTIONS.map((text) => ({
      placePrediction: { text: { text } },
    })),
  });

const placesEmpty = () => HttpResponse.json({ suggestions: [] });

function Harness({
  apiKey = "test-key",
  onParentKeyDown = () => {},
}: {
  apiKey?: string;
  onParentKeyDown?: (key: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: test probe for key propagation.
    <div onKeyDown={(event) => onParentKeyDown(event.key)}>
      <LocationField
        id="event-form-location"
        apiKey={apiKey}
        onChange={setValue}
        value={value}
      />
    </div>
  );
}

describe("LocationField", () => {
  beforeEach(() => {
    requests = [];
  });

  it("shows Places suggestions while typing", async () => {
    usePlacesResponse(placesOk);
    const user = userEvent.setup();
    renderWithStore(<Harness />);

    await user.type(
      screen.getByRole("combobox", { name: "Location" }),
      "1600 amph",
    );

    expect(
      await screen.findByRole("option", { name: SUGGESTIONS[0] }),
    ).toBeInTheDocument();
    expect(screen.getByText("Google Maps")).toBeInTheDocument();
    expect(requests.at(-1)).toEqual({ input: "1600 amph", apiKey: "test-key" });
  });

  it("shows a loading row while suggestions are pending", async () => {
    let resolveSearch: () => void = () => {};
    server.use(
      http.post(PLACES_AUTOCOMPLETE_URL, async () => {
        return new Promise((resolve) => {
          resolveSearch = () => resolve(placesOk());
        });
      }),
    );
    const user = userEvent.setup();
    renderWithStore(<Harness />);

    await user.type(screen.getByRole("combobox", { name: "Location" }), "160");
    await waitForLoadingRow();

    expect(screen.getByText("Searching…")).toBeInTheDocument();
    expect(screen.getByText("Google Maps")).toBeInTheDocument();

    await act(async () => {
      resolveSearch();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      await screen.findByRole("option", { name: SUGGESTIONS[0] }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
  });

  it("shows an empty state when Places returns no matches", async () => {
    usePlacesResponse(placesEmpty);
    const user = userEvent.setup();
    renderWithStore(<Harness />);

    await user.type(screen.getByRole("combobox", { name: "Location" }), "zzz");
    expect(await screen.findByText("No places found")).toBeInTheDocument();
  });

  it("fills the field with a clicked suggestion and closes the list", async () => {
    usePlacesResponse(placesOk);
    const user = userEvent.setup();
    renderWithStore(<Harness />);
    const input = screen.getByRole("combobox", { name: "Location" });

    await user.type(input, "1600 amph");
    await user.click(
      await screen.findByRole("option", { name: SUGGESTIONS[1] }),
    );

    expect(input).toHaveValue(SUGGESTIONS[1]);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it("picks the arrowed suggestion with Enter without letting Enter reach the form", async () => {
    usePlacesResponse(placesOk);
    const onParentKeyDown = mock();
    const user = userEvent.setup();
    renderWithStore(<Harness onParentKeyDown={onParentKeyDown} />);
    const input = screen.getByRole("combobox", { name: "Location" });

    await user.type(input, "1600 amph");
    await screen.findByRole("option", { name: SUGGESTIONS[0] });
    onParentKeyDown.mockClear();
    await user.keyboard("{ArrowDown}{Enter}");

    expect(input).toHaveValue(SUGGESTIONS[0]);
    expect(onParentKeyDown).not.toHaveBeenCalledWith("Enter");
  });

  it("closes the list on Escape and keeps the typed text", async () => {
    usePlacesResponse(placesOk);
    const onParentKeyDown = mock();
    const user = userEvent.setup();
    renderWithStore(<Harness onParentKeyDown={onParentKeyDown} />);
    const input = screen.getByRole("combobox", { name: "Location" });

    await user.type(input, "1600 amph");
    await screen.findByRole("listbox");
    onParentKeyDown.mockClear();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveValue("1600 amph");
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(onParentKeyDown).not.toHaveBeenCalledWith("Escape");

    // With the list closed, keys reach the form again (Enter-to-save).
    await user.keyboard("{Enter}");
    expect(onParentKeyDown).toHaveBeenCalledWith("Enter");
  });

  it("does not call Places for fewer than three characters", async () => {
    usePlacesResponse(placesOk);
    const user = userEvent.setup();
    renderWithStore(<Harness />);

    await user.type(screen.getByRole("combobox", { name: "Location" }), "16");
    await settleDebounce();

    expect(requests).toHaveLength(0);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("is a plain input with no Places calls when no key is configured", async () => {
    usePlacesResponse(placesOk);
    const user = userEvent.setup();
    renderWithStore(<Harness apiKey="" />);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Location" });
    await user.type(input, "1600 amph");
    await settleDebounce();

    expect(input).toHaveValue("1600 amph");
    expect(requests).toHaveLength(0);
  });

  it("shows a calm error state and keeps free typing when Places fails", async () => {
    usePlacesResponse(() => new HttpResponse(null, { status: 500 }));
    const user = userEvent.setup();
    renderWithStore(<Harness />);
    const input = screen.getByRole("combobox", { name: "Location" });

    await user.type(input, "1600 amph");
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(
      await screen.findByText("Could not load suggestions"),
    ).toBeInTheDocument();

    await user.type(input, "itheatre");

    expect(input).toHaveValue("1600 amphitheatre");
    await waitFor(() => {
      expect(
        screen.getByText("Could not load suggestions"),
      ).toBeInTheDocument();
    });
  });
});
