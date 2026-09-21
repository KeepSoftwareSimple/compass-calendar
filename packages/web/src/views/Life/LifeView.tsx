import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsTrialing } from "@web/billing/useIsTrialing";
import { ROOT_ROUTES, ROUTE_IDS } from "@web/common/constants/routes";
import { ID_MAIN } from "@web/common/constants/web.constants";
import { useResponsiveLayout } from "@web/components/AuthenticatedLayout/useResponsiveLayout";
import { CalendarHeader } from "@web/components/CalendarHeader/CalendarHeader";
import { LifeCommandPalette } from "@web/components/CommandPalette/LifeCommandPalette";
import { COMMAND_PALETTE_PLACEHOLDER } from "@web/components/CommandPalette/more.cmd.constants";
import { ResizableSidebarPanel } from "@web/components/Sidebar/ResizableSidebarPanel";
import { SidebarShell } from "@web/components/Sidebar/SidebarShell";
import { useSidebarShortcuts } from "@web/components/Sidebar/useSidebarShortcuts";
import {
  selectIsSidebarOpen,
  useViewStore,
} from "@web/events/stores/view.store";
import { APP_SHORTCUT_BINDINGS } from "@web/shortcuts/app-shortcut-bindings";
import { PageJumpHints } from "@web/shortcuts/page-jump/PageJumpHints";
import {
  LIFE_PAGE_JUMP_TARGETS,
  pageJumpAttrs,
} from "@web/shortcuts/page-jump/page-jump.targets";
import { getShortcutMenuSections } from "@web/shortcuts/shortcuts.registry";
import { shortcutHintProgressActions } from "@web/shortcuts/tips/shortcut-tips.progress.store";
import { useAppShortcutUp } from "@web/shortcuts/useAppShortcut";
import { LifeGrid } from "./LifeGrid";
import { LifeSidebarContent } from "./LifeSidebarContent";
import {
  getAgeInYears,
  getCurrentWeekLabel,
  getRandomLifespan,
  getTotalLifeDots,
  getWeekLivedCount,
  LIFE_VARIATION_ORDER,
  LIFE_VARIATIONS,
  parseLifeDate,
} from "./life.utils";
import {
  hasLifePreferences,
  type LifePreferences,
  readLifePreferences,
  writeLifePreferences,
} from "./life-preferences.storage";
import { applyLifeSearch } from "./life-search";

interface LifeViewProps {
  today?: Date;
}

function formatWeeks(value: number) {
  return new Intl.NumberFormat().format(value);
}

export function LifeView({ today }: LifeViewProps) {
  const currentDate = useMemo(() => today ?? new Date(), [today]);
  const navigate = useNavigate();
  const search = useSearch({ from: ROUTE_IDS.LIFE });
  const isSidebarOpen = useViewStore(selectIsSidebarOpen);
  const currentWeekRef = useRef<HTMLButtonElement>(null);
  const isNewLifeUser = useRef(!hasLifePreferences()).current;
  const [preferences, setPreferences] = useState(() =>
    applyLifeSearch(readLifePreferences(), search, currentDate),
  );
  const totalDots = useMemo(
    () => getTotalLifeDots(preferences.lifespan),
    [preferences.lifespan],
  );
  const weeksLived = useMemo(
    () => getWeekLivedCount(preferences.birthDate, totalDots, currentDate),
    [preferences.birthDate, totalDots, currentDate],
  );
  const hasBirthDate = parseLifeDate(preferences.birthDate) !== null;
  const yearsLived = hasBirthDate
    ? getAgeInYears(preferences.birthDate, currentDate)
    : null;
  const summary = hasBirthDate
    ? `${formatWeeks(weeksLived)} weeks lived - ${yearsLived} years - ${Math.round((weeksLived / totalDots) * 100)}%`
    : "Birth date not set";
  const currentWeekLabel = hasBirthDate
    ? getCurrentWeekLabel(currentDate, weeksLived, totalDots)
    : undefined;

  useResponsiveLayout();

  useEffect(() => {
    writeLifePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    setPreferences((current) => {
      const next = applyLifeSearch(current, search, currentDate);
      return current.variation === next.variation &&
        current.lifespan === next.lifespan
        ? current
        : next;
    });
  }, [currentDate, search]);

  useEffect(() => {
    navigate({
      to: ROOT_ROUTES.LIFE,
      replace: true,
      search: (currentSearch) => ({
        ...currentSearch,
        age: preferences.lifespan,
        variation: preferences.variation,
      }),
    });
  }, [navigate, preferences.lifespan, preferences.variation]);

  useSidebarShortcuts();
  const isTrialing = useIsTrialing();
  const shortcutSections = useMemo(
    () =>
      getShortcutMenuSections({
        view: "life",
        isViewingCurrentPeriod: true,
        isTrialing,
      }),
    [isTrialing],
  );
  const onPreferencesChange = useCallback(
    (update: (current: LifePreferences) => LifePreferences) => {
      setPreferences(update);
    },
    [],
  );
  const focusCurrentWeek = useCallback(() => {
    const currentWeek = currentWeekRef.current;
    if (!currentWeek) return;

    currentWeek.scrollIntoView({ behavior: "smooth", block: "center" });
    currentWeek.focus();
    shortcutHintProgressActions.demonstrate("life-this-week");
  }, []);
  const cycleVariation = useCallback(
    (direction: -1 | 1) => {
      setPreferences((current) => {
        const currentIndex = LIFE_VARIATION_ORDER.indexOf(current.variation);
        const nextIndex =
          (currentIndex + direction + LIFE_VARIATION_ORDER.length) %
          LIFE_VARIATION_ORDER.length;
        const variation = LIFE_VARIATION_ORDER[nextIndex];
        const lifespan =
          variation === "random"
            ? getRandomLifespan(current.birthDate, currentDate)
            : LIFE_VARIATIONS[variation].defaultLifespan;

        return { ...current, lifespan, variation };
      });
    },
    [currentDate],
  );
  const shuffleAge = useCallback(() => {
    setPreferences((current) => ({
      ...current,
      lifespan: getRandomLifespan(current.birthDate, currentDate),
      variation: "random",
    }));
  }, [currentDate]);

  const lifeNav = APP_SHORTCUT_BINDINGS;
  useAppShortcutUp(lifeNav.navLifeCurrent.hotkey, focusCurrentWeek, {
    shortcutId: "nav-life-current",
  });
  useAppShortcutUp(lifeNav.navLifePrevious.hotkey, () => cycleVariation(-1), {
    shortcutId: "nav-life-prev",
  });
  useAppShortcutUp(lifeNav.navLifeNext.hotkey, () => cycleVariation(1), {
    shortcutId: "nav-life-next",
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <LifeCommandPalette placeholder={COMMAND_PALETTE_PLACEHOLDER} />
      <PageJumpHints targets={LIFE_PAGE_JUMP_TARGETS} />

      <main
        className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden bg-background pt-5 pl-8 transition-[width] duration-200 ease-out motion-reduce:transition-none"
        id={ID_MAIN}
      >
        <CalendarHeader
          label="Life"
          nextLabel="Next life variation"
          onNext={() => cycleVariation(1)}
          onPrev={() => cycleVariation(-1)}
          onToday={focusCurrentWeek}
          prevLabel="Previous life variation"
        />
        <section
          aria-label={`Life visualization: ${summary}`}
          className="min-h-0 flex-1 overflow-auto pr-5 pb-6"
          {...pageJumpAttrs("life-grid")}
        >
          <LifeGrid
            currentWeekLabel={currentWeekLabel}
            currentWeekRef={currentWeekRef}
            showCurrentWeek={hasBirthDate}
            totalDots={totalDots}
            weeksLived={weeksLived}
          />
        </section>
      </main>

      <ResizableSidebarPanel isOpen={isSidebarOpen}>
        <SidebarShell
          shortcutSections={shortcutSections}
          shortcutsViewLabel="Life"
        >
          <LifeSidebarContent
            autoFocusBirthDate={isNewLifeUser}
            onCycleVariation={cycleVariation}
            preferences={preferences}
            onShuffleAge={shuffleAge}
            summary={summary}
            today={currentDate}
            onPreferencesChange={onPreferencesChange}
          />
        </SidebarShell>
      </ResizableSidebarPanel>
    </div>
  );
}

export default LifeView;
