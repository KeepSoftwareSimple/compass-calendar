# Compass Calendar

A keyboard calendar that makes scheduling a breeze.

## Why try compass?

### You'll get more done

- The **first-class shortcuts** make updating your calendar a joy.
- The **minimal UI** will help you focus on what matters: your events.

### You'll get less done

- The [life view](https://www.compasscalendar.com/life?utm_source=github&utm_medium=referral&utm_campaign=readme) shows your existance as a grid of dots. Seeing how few you have left may make you pause before scheduling more busy work.
- The absense of AI automation will keep unnecessary work out of your schedule.

## Features

Cool things you can do with in Compass

- Move your focus to perfect spot (no more TABing endlessly)
- Find the perfect slot for an event with your keyboard
- Do everything from the keyboard
- Google Calendar and Microsoft (Outlook) calendar sync
- Create a public booking page at `/book/:username`

Things you can't do in Compass Calendar:

- Click
- Connect iCloud Calendars (WIP).

## Tech stack

- **Frontend**: React, Zustand, TanStack, Tailwind
- **Backend**: Node, Express, MongoDB
- **Testing**: Bun, React Testing Library, Playwright

## Getting started

| Option | Description | Instructions |
| --- | --- | --- |
| **1. Try Compass web** | Use Compass now (no signup required). | [compasscalendar.com](https://www.compasscalendar.com?utm_source=github&utm_medium=referral&utm_campaign=readme) |
| **2. Run Compass locally** | Run Compass on your machine. | `bun install`<br><br>`cp compass.example.yaml compass.yaml` <br><br>`bun run dev:web`<br><br>`bun run dev:backend`<br><br>Open [http://localhost:9080](http://localhost:9080). |
| **3. Self-host Compass** | Run Compass on your server. | See [the self-hosting guide](./docs/self-hosting/README.md). |

## Resources

- **Docsite**: [docs.compasscalendar.com](https://docs.compasscalendar.com/docs)
- **Changelog**: [compasscalendar.com](https://changelog.compasscalendar.com)
- **Twitter**: [@CompassCalendar](https://x.com/CompassCalendar)
- **LinkedIn**: [Compass Calendar](https://www.linkedin.com/company/compass-calendar)
