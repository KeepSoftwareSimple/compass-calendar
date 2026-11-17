// The story, written in ink (https://github.com/inkle/ink). This is the only
// file a copywriter needs to touch. gamebook.js compiles it in the browser.
//
// Shape: one start screen with three paths (returning, new, just looking),
// a short guided tour, and exits to the app from every screen.
//
// Ink cheat sheet: "=== name ===" starts a scene, "+ [text]" is a choice,
// "-> name" jumps to a scene, and "# TAG" sends a signal to the page:
//   # CLEAR         wipe the screen
//   # LAUNCH        open the Compass app as a guest
//   # SIGNIN        open the Compass sign-in
//   # COPY          copy the app link (mobile handoff)
//   # EMAIL         show the "email me the link" form (mobile handoff)
//   # LINK: docs    open a link from journey.js
// gamebook.js sets "returning", "mobile" and "mod" (the visitor's own
// shortcut key: the Command symbol on a Mac, Ctrl elsewhere) before the
// story starts.
// Wrap key names in [[ ]] to show them as keycaps: "press [[{mod}+K]]".
// Avoid "//" inside story text (ink reads it as a comment) and em-dashes.
window.GAMEBOOK_STORY = `
VAR returning = false
VAR mobile = false
VAR mod = "Ctrl"

-> boot

=== boot ===
# CLEAR
COMPASS CALENDAR
A calendar you run from your keyboard.
{returning: Welcome back. This browser has signed in to Compass before.}
Where do you want to start?
+ {returning} [Continue to my calendar] -> signin
+ [I am new. What is Compass?] -> what
+ [Try the calendar now (no signup required)] -> try
+ {not returning} [I have an account. Sign in.] -> signin

=== what ===
# CLEAR
THE SHORT VERSION
Compass is a calendar app for people who would rather type than click.
1. Every action has a keyboard shortcut.
2. It syncs with Google Calendar and Microsoft Outlook.
3. It is minimal and open source, and you can try it without an account.
+ [Show me, one thing at a time (1 minute)] -> tour_1
+ [Try the calendar now (no signup required)] -> try
+ [Back to the start] -> boot

=== look ===
# CLEAR
LOOK AROUND
None of this needs an account.
+ [Take the 4-stop tour (1 minute)] -> tour_1
+ {not mobile} [Open the real calendar as a guest] -> try
+ [Read the blog, docs and source] -> manual
+ [Back to the start] -> boot

=== tour_1 ===
# CLEAR
STOP 1 OF 4: THE KEYS
MONDAY. 8:59 AM. A double booking lunges out of Tuesday.
What do you do?
+ [Reach for the mouse] -> tour_1_mouse
+ [Press a key] -> tour_1_key

=== tour_1_mouse ===
No. Throw away your mouse, you don't need it here. Everything has a shortcut. No more clicking.
-> tour_1_next

=== tour_1_key ===
In Compass, everything has a key. Nothing needs a click.
-> tour_1_next

=== tour_1_next ===
+ [Next stop] -> tour_2
+ [That is enough. Try the calendar.] -> try
+ [Back to the start] -> boot

=== tour_2 ===
# CLEAR
STOP 2 OF 4: THE QUIET
The UI is simple and clean. There is no AI assistant to nag you. Making changes is so intuitive that you actually like tweaking your schedule.
+ [Next stop] -> tour_3
+ [Try the calendar] -> try
+ [Back to the start] -> boot

=== tour_3 ===
# CLEAR
STOP 3 OF 4: THE PALETTE
You forget a shortcut. It happens.
You press [[{mod}+K]] and type what you want, like "create event" or "go to today". The palette finds it, runs it, and shows you its key for next time.
You never have to memorize the list up front.
+ [Next stop] -> tour_4
+ [Try the calendar] -> try
+ [Back to the start] -> boot

=== tour_4 ===
# CLEAR
STOP 4 OF 4: THE BRIDGE
Your Google Calendar and Microsoft Outlook sync both ways. You get your own meeting link and cancel your Calendly subscription.
+ [Finish the tour] -> tour_end

=== tour_end ===
# CLEAR
THAT IS COMPASS
A keyboard calendar.
What next?
+ [Try the calendar now (no signup required)] -> try
+ [Sign in or create an account] -> signin
+ [Read the blog, docs and source] -> manual
+ [Back to the start] -> boot

=== manual ===
# CLEAR
READ MORE
Compass is open source under the MIT license. Run it locally or self-host it.
Each page opens in a new tab.
+ [blog] -> manual_blog
+ [docs] -> manual_docs
+ [src] -> manual_github
+ [changelog] -> manual_changelog
+ [Back] -> look

=== manual_docs ===
Opening the docs. # LINK: docs
-> manual_again

=== manual_github ===
Opening GitHub. # LINK: github
-> manual_again

=== manual_blog ===
Opening the blog. # LINK: blog
-> manual_again

=== manual_changelog ===
Opening the changelog. # LINK: changelog
-> manual_again

=== manual_again ===
+ [Read something else] -> manual
+ [Try the calendar] -> try
+ [Back to the start] -> boot

=== try ===
{mobile: -> on_a_phone}
# CLEAR
Opening Compass as a guest. Nothing to sign up for.
Your events stay in this browser until you create an account.
LOADING YOUR WEEK... # LAUNCH
-> END

=== signin ===
{mobile: -> on_a_phone}
# CLEAR
OPENING SIGN IN... # SIGNIN
-> END

=== on_a_phone ===
# CLEAR
ONE THING FIRST
Compass is designed for the web on a desktop or laptop, where you have a keyboard. It does not work on phones yet.
We can email you a link, so it is waiting the next time you sit down at your computer.
+ [Email me the link] -> email_me
+ [Copy the link instead] -> copy_link
+ [Keep looking around here] -> look

=== email_me ===
# CLEAR
EMAIL ME THE LINK
Where should we send it? # EMAIL
+ [Nvm, go back] -> on_a_phone

=== email_sent ===
# CLEAR
SENT
Check your inbox for a link to compasscalendar.com. Open it on your computer and press C.
-> phone_again

=== copy_link ===
Link copied. Open it on a laptop or desktop. # COPY
-> phone_again

=== phone_again ===
+ [Take the 4-stop tour] -> tour_1
+ [Back to the start] -> boot
`;
