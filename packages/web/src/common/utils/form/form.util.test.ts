import { ID_EVENT_FORM } from "../../constants/web.constants";
import {
  focusEventFormField,
  focusEventFormTitle,
  getEventFormFieldAnchor,
  getEventFormFieldElement,
  isComboboxInteraction,
  isEditableKeyboardTarget,
  isEventFormKeyboardTarget,
  shouldDeferEnterToTarget,
} from "./form.util";
import { afterEach, describe, expect, it } from "bun:test";

describe("form.util", () => {
  describe("isComboboxInteraction", () => {
    const createEvent = (element: HTMLElement | null) =>
      ({ target: element }) as unknown as KeyboardEvent;

    it("returns true when role is combobox", () => {
      const element = document.createElement("div");
      element.setAttribute("role", "combobox");

      expect(isComboboxInteraction(createEvent(element))).toBe(true);
    });

    it("returns true when inside freq-select control", () => {
      const wrapper = document.createElement("div");
      wrapper.className = "freq-select__control";
      const child = document.createElement("span");
      wrapper.appendChild(child);

      expect(isComboboxInteraction(createEvent(child))).toBe(true);
    });

    it("returns false when no combobox context is present", () => {
      const element = document.createElement("div");

      expect(isComboboxInteraction(createEvent(element))).toBe(false);
    });

    it("returns false when target is null", () => {
      expect(isComboboxInteraction(createEvent(null))).toBe(false);
    });
  });

  describe("isEditableKeyboardTarget", () => {
    const createEvent = (element: HTMLElement | null) =>
      ({ target: element }) as unknown as KeyboardEvent;

    it("does not treat checkboxes as editable", () => {
      const input = document.createElement("input");
      input.type = "checkbox";

      expect(isEditableKeyboardTarget(createEvent(input))).toBe(false);
    });

    it("treats textareas as editable", () => {
      const textarea = document.createElement("textarea");

      expect(isEditableKeyboardTarget(createEvent(textarea))).toBe(true);
    });

    it("treats selects as editable", () => {
      const select = document.createElement("select");

      expect(isEditableKeyboardTarget(createEvent(select))).toBe(true);
    });
  });

  describe("shouldDeferEnterToTarget", () => {
    const createEvent = (element: HTMLElement | null) =>
      ({ target: element }) as unknown as KeyboardEvent;

    it("defers Enter for contenteditable targets", () => {
      const editable = document.createElement("div");
      // Set the attribute explicitly: jsdom often leaves isContentEditable
      // undefined even after assigning the contentEditable property.
      editable.setAttribute("contenteditable", "true");

      expect(shouldDeferEnterToTarget(createEvent(editable))).toBe(true);
    });

    it("defers Enter for descendants of a contenteditable host", () => {
      const editable = document.createElement("div");
      editable.setAttribute("contenteditable", "true");
      const paragraph = document.createElement("p");
      editable.appendChild(paragraph);

      expect(shouldDeferEnterToTarget(createEvent(paragraph))).toBe(true);
    });

    it("defers Enter for textareas", () => {
      const textarea = document.createElement("textarea");

      expect(shouldDeferEnterToTarget(createEvent(textarea))).toBe(true);
    });

    it("defers Enter for buttons", () => {
      const button = document.createElement("button");

      expect(shouldDeferEnterToTarget(createEvent(button))).toBe(true);
    });

    it("defers Enter for role=button and links", () => {
      const roleButton = document.createElement("div");
      roleButton.setAttribute("role", "button");
      const link = document.createElement("a");
      link.setAttribute("href", "https://example.com");

      expect(shouldDeferEnterToTarget(createEvent(roleButton))).toBe(true);
      expect(shouldDeferEnterToTarget(createEvent(link))).toBe(true);
    });

    it("does not defer Enter for single-line inputs", () => {
      const input = document.createElement("input");

      expect(shouldDeferEnterToTarget(createEvent(input))).toBe(false);
    });
  });

  describe("isEventFormKeyboardTarget", () => {
    const createEvent = (element: HTMLElement | null) =>
      ({ target: element }) as unknown as KeyboardEvent;

    it("returns true when the target is inside the event form", () => {
      const form = document.createElement("form");
      form.setAttribute("name", ID_EVENT_FORM);
      const button = document.createElement("button");
      form.appendChild(button);
      document.body.appendChild(form);

      expect(isEventFormKeyboardTarget(createEvent(button))).toBe(true);
    });

    it("returns false when the target is outside event forms", () => {
      const button = document.createElement("button");
      document.body.appendChild(button);

      expect(isEventFormKeyboardTarget(createEvent(button))).toBe(false);
    });
  });

  describe("focusEventFormField", () => {
    afterEach(() => {
      document.body.innerHTML = "";
    });

    const mountForm = () => {
      const form = document.createElement("form");
      form.setAttribute("name", ID_EVENT_FORM);
      const title = document.createElement("input");
      title.name = "Event Title";
      const location = document.createElement("input");
      location.id = "event-form-location";
      location.name = "Event Location";
      const description = document.createElement("div");
      description.id = "event-form-description";
      description.setAttribute("contenteditable", "true");
      description.tabIndex = 0;
      const start = document.createElement("input");
      start.id = "startTimePicker";
      const end = document.createElement("input");
      end.id = "endTimePicker";
      const recurrence = document.createElement("div");
      recurrence.id = "event-form-recurrence";
      const repeat = document.createElement("button");
      repeat.setAttribute("aria-label", "Edit recurrence");
      recurrence.appendChild(repeat);
      const calendar = document.createElement("button");
      calendar.id = "event-form-calendar";
      const color = document.createElement("fieldset");
      color.id = "event-form-color";
      const colorSelected = document.createElement("input");
      colorSelected.type = "radio";
      colorSelected.name = "event-color";
      colorSelected.checked = true;
      const colorOther = document.createElement("input");
      colorOther.type = "radio";
      colorOther.name = "event-color";
      color.append(colorSelected, colorOther);
      const attendees = document.createElement("div");
      attendees.id = "event-form-attendees";
      const attendeesInput = document.createElement("input");
      attendeesInput.setAttribute("role", "combobox");
      attendees.append(attendeesInput);
      const rsvp = document.createElement("div");
      rsvp.id = "event-form-rsvp";
      const rsvpSelected = document.createElement("input");
      rsvpSelected.type = "radio";
      rsvpSelected.name = "event-rsvp";
      rsvpSelected.checked = true;
      const rsvpOther = document.createElement("input");
      rsvpOther.type = "radio";
      rsvpOther.name = "event-rsvp";
      rsvp.append(rsvpSelected, rsvpOther);
      form.append(
        title,
        location,
        description,
        start,
        end,
        recurrence,
        calendar,
        color,
        attendees,
        rsvp,
      );
      document.body.appendChild(form);
      return {
        title,
        location,
        description,
        start,
        end,
        repeat,
        calendar,
        colorSelected,
        attendees,
        attendeesInput,
        rsvp,
        rsvpSelected,
      };
    };

    it("focuses each shipped form field", () => {
      const fields = mountForm();

      expect(focusEventFormField("title")).toBe(true);
      expect(document.activeElement).toBe(fields.title);

      expect(focusEventFormField("location")).toBe(true);
      expect(document.activeElement).toBe(fields.location);

      expect(focusEventFormField("description")).toBe(true);
      expect(document.activeElement).toBe(fields.description);

      expect(focusEventFormField("start")).toBe(true);
      expect(document.activeElement).toBe(fields.start);

      expect(focusEventFormField("end")).toBe(true);
      expect(document.activeElement).toBe(fields.end);

      expect(focusEventFormField("recurrence")).toBe(true);
      expect(document.activeElement).toBe(fields.repeat);

      expect(focusEventFormField("calendar")).toBe(true);
      expect(document.activeElement).toBe(fields.calendar);

      expect(focusEventFormField("color")).toBe(true);
      expect(document.activeElement).toBe(fields.colorSelected);

      expect(focusEventFormField("attendees")).toBe(true);
      expect(document.activeElement).toBe(fields.attendeesInput);

      expect(focusEventFormField("rsvp")).toBe(true);
      expect(document.activeElement).toBe(fields.rsvpSelected);
    });

    it("anchors guests, color, and RSVP chips on the visible wrapper, not the inner control", () => {
      const fields = mountForm();

      expect(getEventFormFieldAnchor("attendees")).toBe(fields.attendees);
      expect(getEventFormFieldElement("attendees")).toBe(fields.attendeesInput);

      expect(getEventFormFieldAnchor("color")?.id).toBe("event-form-color");
      expect(getEventFormFieldElement("color")).toBe(fields.colorSelected);

      expect(getEventFormFieldAnchor("rsvp")).toBe(fields.rsvp);
      expect(getEventFormFieldElement("rsvp")).toBe(fields.rsvpSelected);
    });

    it("focuses the selected color swatch even when it is not first in the group", () => {
      const form = document.createElement("form");
      form.setAttribute("name", ID_EVENT_FORM);
      const color = document.createElement("fieldset");
      color.id = "event-form-color";
      const first = document.createElement("input");
      first.type = "radio";
      first.name = "event-color";
      const selected = document.createElement("input");
      selected.type = "radio";
      selected.name = "event-color";
      selected.checked = true;
      color.append(first, selected);
      form.append(color);
      document.body.appendChild(form);

      expect(focusEventFormField("color")).toBe(true);
      expect(document.activeElement).toBe(selected);
    });

    it("focuses the selected RSVP answer even when it is not first in the group", () => {
      const form = document.createElement("form");
      form.setAttribute("name", ID_EVENT_FORM);
      const rsvp = document.createElement("div");
      rsvp.id = "event-form-rsvp";
      const first = document.createElement("input");
      first.type = "radio";
      first.name = "event-rsvp";
      const selected = document.createElement("input");
      selected.type = "radio";
      selected.name = "event-rsvp";
      selected.checked = true;
      rsvp.append(first, selected);
      form.append(rsvp);
      document.body.appendChild(form);

      expect(focusEventFormField("rsvp")).toBe(true);
      expect(document.activeElement).toBe(selected);
    });

    it("falls back to start/end date inputs when time pickers are absent", () => {
      const form = document.createElement("form");
      form.setAttribute("name", ID_EVENT_FORM);
      const start = document.createElement("input");
      start.title = "Pick Start Date";
      const end = document.createElement("input");
      end.title = "Pick End Date";
      form.append(start, end);
      document.body.appendChild(form);

      expect(focusEventFormField("start")).toBe(true);
      expect(document.activeElement).toBe(start);
      expect(focusEventFormField("end")).toBe(true);
      expect(document.activeElement).toBe(end);
    });

    it("falls back to the location input's name when no id is present", () => {
      const form = document.createElement("form");
      form.setAttribute("name", ID_EVENT_FORM);
      const location = document.createElement("input");
      location.name = "Event Location";
      form.append(location);
      document.body.appendChild(form);

      expect(focusEventFormField("location")).toBe(true);
      expect(document.activeElement).toBe(location);
    });

    it("returns false when a field is absent from the form", () => {
      const form = document.createElement("form");
      form.setAttribute("name", ID_EVENT_FORM);
      document.body.appendChild(form);

      expect(focusEventFormField("location")).toBe(false);
    });

    it("falls back to the read-only guest list when the combobox is absent", () => {
      const form = document.createElement("form");
      form.setAttribute("name", ID_EVENT_FORM);
      const guestList = document.createElement("div");
      guestList.id = "event-form-guest-list";
      guestList.tabIndex = -1;
      form.append(guestList);
      document.body.appendChild(form);

      expect(focusEventFormField("attendees")).toBe(true);
      expect(document.activeElement).toBe(guestList);
    });

    it("keeps focusEventFormTitle as a title helper", () => {
      const { title } = mountForm();
      focusEventFormTitle();
      expect(document.activeElement).toBe(title);
    });
  });
});
