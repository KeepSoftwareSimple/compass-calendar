// THE MONDAY MACHINE: a branching gamebook on top of inkjs
// (https://github.com/y-lohse/inkjs, MIT), the JavaScript port of inkle's ink
// narrative engine. ink owns the story state, branching and variables; this
// file is only a terminal-style renderer with keyboard and touch input.
(() => {
  // If the engine did not load, leave the plain fallback links on screen.
  if (!window.inkjs || !window.COMPASS || !window.GAMEBOOK_STORY) {
    document.documentElement.classList.remove("js");
    return;
  }
  const COMPASS = window.COMPASS;
  const out = document.getElementById("out");
  const choicesEl = document.getElementById("choices");
  const screen = document.getElementById("screen");
  const emailForm = document.getElementById("email-form");
  const emailInput = document.getElementById("email");
  const emailStatus = document.getElementById("email-status");
  const sendButton = document.getElementById("send");
  // Stricter than the browser's own check, which accepts "a@b".
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const emailLooksValid = () => EMAIL_PATTERN.test(emailInput.value.trim());

  const story = new window.inkjs.Compiler(window.GAMEBOOK_STORY).Compile();
  // Tell the story who is reading, so it can offer the right first choice.
  story.variablesState.returning = COMPASS.visitor.returning;
  story.variablesState.mobile = COMPASS.visitor.mobile;
  // Show the visitor's own shortcut key instead of the word "Mod".
  story.variablesState.mod = COMPASS.visitor.mod;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const CHAR_DELAY_MS = 14;
  // With reduced motion there is no typing effect to skip.
  for (const hint of document.querySelectorAll(".typing-hint")) {
    hint.hidden = reduceMotion;
  }
  document.getElementById("hints").hidden = false;
  let typing = false;
  let skip = reduceMotion;
  let selected = 0;
  let wantsEmailForm = false;

  // A sleep that skipTyping() can cut short, so skipping feels instant.
  let wake = () => {};
  const sleep = (ms) =>
    new Promise((resolve) => {
      wake = resolve;
      setTimeout(resolve, ms);
    });
  const skipTyping = () => {
    skip = true;
    wake();
  };

  // Screen readers get the whole line once; the letter-by-letter copy is
  // visual only.
  async function typeLine(text) {
    const p = document.createElement("p");
    const spoken = Object.assign(document.createElement("span"), {
      className: "sr-only",
      textContent: text,
    });
    const typed = document.createElement("span");
    typed.setAttribute("aria-hidden", "true");
    p.append(spoken, typed);
    out.append(p);
    for (const char of text) {
      if (skip) break;
      typed.textContent += char;
      screen.scrollTop = screen.scrollHeight;
      await sleep(CHAR_DELAY_MS);
    }
    typed.textContent = text;
  }

  function applyTags(tags) {
    for (const tag of tags) {
      const [name, value] = tag.split(":").map((part) => part.trim());
      if (name === "CLEAR") out.replaceChildren();
      if (name === "LINK") COMPASS.open(value);
      if (name === "LAUNCH") COMPASS.launch(1200);
      if (name === "SIGNIN") COMPASS.signIn(600);
      if (name === "COPY") COMPASS.copyAppLink();
      if (name === "EMAIL") wantsEmailForm = true;
    }
  }

  function select(next) {
    const buttons = [...choicesEl.children];
    if (buttons.length === 0) return;
    selected = (next + buttons.length) % buttons.length;
    buttons.forEach((button, i) => {
      button.classList.toggle("selected", i === selected);
    });
    buttons[selected].scrollIntoView({ block: "nearest" });
  }

  function choose(index) {
    if (typing || index >= story.currentChoices.length) return;
    out.append(
      Object.assign(document.createElement("p"), {
        className: "dim",
        textContent: `> ${story.currentChoices[index].text}`,
      }),
    );
    story.ChooseChoiceIndex(index);
    advance();
  }

  // Jump to a scene from outside the story (header links, the email form).
  // Waits for any screen that is still typing so two never run at once.
  let screenDone = Promise.resolve();
  function goTo(scene) {
    skipTyping();
    screenDone.then(() => {
      story.ChoosePathString(scene);
      advance();
    });
  }

  function advance() {
    screenDone = renderScreen();
    return screenDone;
  }

  async function renderScreen() {
    typing = true;
    skip = reduceMotion;
    choicesEl.replaceChildren();
    wantsEmailForm = false;
    emailForm.hidden = true;
    while (story.canContinue) {
      const text = story.Continue().trim();
      applyTags(story.currentTags);
      if (text) await typeLine(text);
    }
    typing = false;
    choicesEl.replaceChildren(
      ...story.currentChoices.map((choice, i) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "key";
        // The number is a keyboard shortcut, so touch devices do not show it.
        const number = document.createElement("span");
        number.className = "keys-only";
        number.textContent = `${i + 1}. `;
        button.append(number, choice.text);
        button.addEventListener("click", () => choose(i));
        // Keep the selection bar on whichever choice has keyboard focus.
        button.addEventListener("focus", () => select(i));
        return button;
      }),
    );
    select(0);
    if (wantsEmailForm) {
      emailStatus.textContent = "";
      emailForm.hidden = false;
      updateSendButton();
      emailInput.focus();
    }
    screen.scrollTop = screen.scrollHeight;
  }

  function updateSendButton() {
    sendButton.classList.toggle("ready", emailLooksValid());
  }
  emailInput.addEventListener("input", () => {
    emailStatus.textContent = "";
    updateSendButton();
  });

  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sendButton.disabled) return;
    if (!emailLooksValid()) {
      emailStatus.textContent =
        "Enter a full email address, like you@example.com.";
      emailInput.focus();
      return;
    }
    sendButton.disabled = true;
    sendButton.textContent = "Sending...";
    emailStatus.textContent = "";
    const sent = await COMPASS.emailMeTheLink(emailInput.value.trim());
    sendButton.disabled = false;
    sendButton.textContent = "Send me the link";
    if (!sent) {
      emailStatus.textContent =
        "That did not go through. Check the address and try again.";
      return;
    }
    emailInput.value = "";
    goTo("email_sent");
  });

  // On a phone the header links would drop the visitor into the desktop app.
  // Send them through the same handoff the in-game choices use.
  if (COMPASS.visitor.mobile) {
    for (const link of document.querySelectorAll("[data-app], [data-signin]")) {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        goTo("on_a_phone");
      });
    }
  }

  // Coming back with the browser's Back button restores a finished screen
  // with no choices left. Start over instead.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) window.location.reload();
  });

  document.addEventListener("keydown", (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // Typing an email address must not pick choices.
    if (event.target === emailInput) return;
    if (typing) {
      // Tab, or any other key, shows the rest of this screen at once. Once
      // the text is up, Tab moves focus as usual.
      if (event.key === "Tab") event.preventDefault();
      skipTyping();
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "arrowdown" || key === "j") select(selected + 1);
    else if (key === "arrowup" || key === "k") select(selected - 1);
    else if (key === "enter" || key === " ") {
      // A focused link or button handles Enter and Space itself. Acting
      // here too would pick the highlighted choice on top of it.
      if (event.target.closest?.("a, button, input")) return;
      choose(selected);
    } else if (/^[1-9]$/.test(key)) choose(Number(key) - 1);
    else return;
    event.preventDefault();
  });

  // Tapping the text while it types skips ahead, same as any key.
  screen.addEventListener("pointerdown", () => {
    if (typing) skipTyping();
  });

  advance();
})();
