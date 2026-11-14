// Compass copy, links and visitor detection for the landing game at /start.
// Edit the pitch and the links here.
// No em-dashes in this file: it is user-facing copy.
(() => {
  // Served by the app itself, so app links are same-origin.
  const APP = "";
  const params = new URLSearchParams(window.location.search);

  // The app records a completed sign-in in localStorage (see
  // auth/compass/state/auth.state.util.ts). On the real origin this tells us
  // the visitor has an account on this browser. Preview override:
  // add ?returning=1 to the URL.
  function hasSignedInBefore() {
    if (params.has("returning")) return true;
    try {
      const stored = JSON.parse(localStorage.getItem("compass.auth"));
      return stored?.hasAuthenticated === true;
    } catch {
      return false;
    }
  }

  // The app itself is desktop-only for now. Preview override: ?mobile=1.
  const isMobile =
    params.has("mobile") ||
    (window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 768);

  window.COMPASS = {
    visitor: { returning: hasSignedInBefore(), mobile: isMobile },
    appUrl: `${APP}/week?utm_source=landing&utm_campaign=retro`,
    signInUrl: `${APP}/week?auth=login&utm_source=landing&utm_campaign=retro`,
    links: {
      docs: "https://docs.compasscalendar.com/docs",
      github: "https://github.com/SwitchbackTech/compass",
      changelog: "https://changelog.compasscalendar.com",
      blog: "https://www.compasscalendar.com/blog",
    },
    // The backend adds the visitor to the Kit subscriber list and emails
    // them the link. The build writes the API base URL to /start/config.js.
    reminderUrl: `${window.COMPASS_API_BASEURL ?? "/api"}/landing/desktop-reminder`,
    // The plain-language answer to "what is this?". Shown before any game.
    intro: {
      name: "COMPASS CALENDAR",
      oneLiner: "A calendar you run from your keyboard.",
      short: [
        "1. Every action has a keyboard shortcut. Press C to create an event, arrows to move it.",
        "2. It syncs with Google Calendar and Microsoft Outlook.",
        "3. It is minimal and open source, and you can try it without an account.",
      ],
    },
    mobileNote: [
      "Compass is built for a desktop keyboard. It does not run on phones yet.",
      "Copy the link and open it on a laptop or desktop.",
    ],
    features: {
      keys: {
        title: "SHORTCUTS FOR EVERYTHING",
        body: [
          "Press C and an event appears where your focus sits.",
          "Alt+Shift+Arrow slides it an hour. Mod+Z takes it back.",
          "Everything has a key. Nothing needs a mouse.",
        ],
      },
      quiet: {
        title: "A MINIMAL CALENDAR",
        body: [
          "No clutter and no upsells. Just your week.",
          "There is no AI automation, so no busy work gets scheduled for you.",
        ],
      },
      life: {
        title: "THE LIFE VIEW",
        body: [
          "Press L and your whole life appears as a grid of dots, one per week.",
          "It may make you pause before booking more busy work.",
        ],
      },
      sync: {
        title: "CALENDAR SYNC",
        body: [
          "Google Calendar and Microsoft Outlook stay in sync, both ways.",
          "iCloud is still under construction.",
        ],
      },
      booking: {
        title: "A BOOKING PAGE",
        body: [
          "Publish a booking page at /meet/your-name.",
          "People pick a slot. You never type 'does Thursday work?' again.",
        ],
      },
    },
    open(name) {
      // A blocked pop-up must not leave the visitor with nothing.
      if (!window.open(this.links[name], "_blank", "noopener")) {
        window.location.href = this.links[name];
      }
    },
    launch(delayMs = 0) {
      setTimeout(() => {
        window.location.href = this.appUrl;
      }, delayMs);
    },
    signIn(delayMs = 0) {
      setTimeout(() => {
        window.location.href = this.signInUrl;
      }, delayMs);
    },
    // Mobile handoff: ask the backend to email the visitor the link.
    async emailMeTheLink(email) {
      try {
        const response = await fetch(this.reminderUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    // Mobile handoff: copy the app link so it can be opened on a computer.
    async copyAppLink() {
      const link = new URL(this.appUrl, window.location.origin).href;
      try {
        await navigator.clipboard.writeText(link);
        return true;
      } catch {
        window.prompt("Copy this link and open it on a computer:", link);
        return false;
      }
    },
  };

  // Header links work without the game, so nobody is ever trapped in it.
  const { visitor, appUrl, signInUrl } = window.COMPASS;
  for (const link of document.querySelectorAll("[data-app]")) {
    link.href = appUrl;
    if (visitor.returning) link.textContent = "My calendar";
  }
  for (const link of document.querySelectorAll("[data-signin]")) {
    link.href = signInUrl;
    link.hidden = visitor.returning;
  }
})();
