import {
  BARREL_ALLOWLIST,
  duplicateEventSchemaHits,
  EM_DASH_ALLOWLIST,
  emDashHits,
  formatHit,
  isBarrelSource,
  KEYDOWN_LISTENER_ALLOWLIST,
  keydownListenerHits,
  locatorHits,
  MONGO_SERVICE_TEST_ALLOWLIST,
  matchesConstraintAllow,
  matchGlob,
  mongoServiceImportHits,
  ovenBunVersion,
  RULE_HELP,
  scanBunDockerfilePins,
  scanConstraints,
  WEB_LOCATOR_ALLOWLIST,
  ZOD_V3_ALLOWLIST,
  zodV3ImportHits,
} from "./check-agent-constraints";
import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("isBarrelSource", () => {
  it("treats export-from index modules as barrels", () => {
    expect(isBarrelSource('export { Foo } from "./Foo";\n')).toBe(true);
    expect(isBarrelSource('export * from "./widgets";\n')).toBe(true);
  });

  it("treats import-then-named-export as a barrel", () => {
    expect(
      isBarrelSource('import { Foo } from "./Foo";\nexport { Foo };\n'),
    ).toBe(true);
  });

  it("does not treat the web app entry as a barrel", () => {
    expect(
      isBarrelSource(`
import { initPosthog } from "@web/auth/posthog/posthog.bootstrap";
initPosthog();
void import("./app.bootstrap");
`),
    ).toBe(false);
  });

  it("does not treat router config that defines its own exports as a barrel", () => {
    expect(
      isBarrelSource(`
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "@web/routers/router.routes";
export const router = createRouter({ routeTree });
`),
    ).toBe(false);
  });
});

describe("locatorHits", () => {
  it("flags RTL getByTestId and querySelector", () => {
    expect(locatorHits('screen.getByTestId("x");\n')).toEqual([1]);
    expect(locatorHits('container.querySelector(".foo");\n')).toEqual([1]);
  });

  it("does not flag production data-* attributes", () => {
    expect(locatorHits('<div data-state="open" />\n')).toEqual([]);
  });
});

describe("mongoServiceImportHits", () => {
  it("flags backend mongoService imports", () => {
    expect(
      mongoServiceImportHits(
        'import mongoService from "@backend/common/services/mongo.service";\n',
      ),
    ).toEqual([1]);
  });

  it("does not flag sync-mongo.service", () => {
    expect(
      mongoServiceImportHits(
        'import { type SyncMongoService } from "@sync/storage/sync-mongo.service";\n',
      ),
    ).toEqual([]);
  });
});

describe("duplicateEventSchemaHits", () => {
  it("flags a local EventSchema zod object", () => {
    expect(
      duplicateEventSchemaHits(
        "const EventSchema = z.object({\n  title: z.string(),\n});\n",
      ),
    ).toEqual([1]);
  });

  it("does not flag CompassEventSchema from core", () => {
    expect(
      duplicateEventSchemaHits(
        'import { CompassEventSchema } from "@compass/core/types/compass-event.contracts";\n',
      ),
    ).toEqual([]);
  });
});

describe("emDashHits", () => {
  it("flags em-dashes in strings and JSX text but not comments", () => {
    const source = [
      "// a comment \u2014 with a dash",
      "/* block \u2014 comment */ const ok = 1;",
      'const label = "Save \u2014 later";',
      "  {/* jsx \u2014 comment */}",
      "<p>Ready \u2014 go</p>",
      'const url = "https://x.test/a\u2014b";',
    ].join("\n");
    expect(emDashHits(source)).toEqual([3, 5, 6]);
  });
});

describe("zodV3ImportHits", () => {
  it("flags the bare zod path and zod/v3, not zod/v4 or zod/v4-mini", () => {
    expect(zodV3ImportHits('import { z } from "zod";\n')).toEqual([1]);
    expect(zodV3ImportHits('import { z } from "zod/v3";\n')).toEqual([1]);
    expect(zodV3ImportHits('import { z } from "zod/v4";\n')).toEqual([]);
    expect(zodV3ImportHits('import { z } from "zod/v4-mini";\n')).toEqual([]);
  });
});

describe("keydownListenerHits", () => {
  it("flags raw keydown listeners", () => {
    expect(
      keydownListenerHits('document.addEventListener("keydown", onKey);\n'),
    ).toEqual([1]);
    expect(
      keydownListenerHits('window.addEventListener("resize", onResize);\n'),
    ).toEqual([]);
  });
});

describe("formatHit", () => {
  it("prints the path, rule, detail, and how to fix it", () => {
    const text = formatHit({
      path: "self-host/Dockerfile.backend",
      rule: "bun-pin",
      line: 1,
      detail: "oven/bun:1.2.18 but CI pins 1.3.14",
    });
    expect(text).toContain("self-host/Dockerfile.backend:1 bun-pin");
    expect(text).toContain("oven/bun:1.2.18 but CI pins 1.3.14");
    expect(text).toContain(RULE_HELP["bun-pin"]!);
  });

  it("documents every rule the scanner can emit", () => {
    for (const rule of [
      "barrel",
      "web-locator",
      "mongoService-import",
      "duplicate-event-schema",
      "bun-pin",
      "zod-import",
      "em-dash",
      "keydown-listener",
    ]) {
      expect(RULE_HELP[rule]?.length ?? 0).toBeGreaterThan(20);
    }
  });
});

describe("scanConstraints", () => {
  it("fails a v3 zod import, an em-dash string, and a raw keydown listener", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-constraints-new-"));
    writeTree(root, {
      "packages/web/src/index.tsx":
        'import { init } from "@web/auth/posthog/posthog.bootstrap";\nvoid import("./app.bootstrap");\n',
      "packages/core/src/types/new.contracts.ts": 'import { z } from "zod";\n',
      "packages/web/src/toast.ts":
        '// fine \u2014 in a comment\nexport const msg = "Saved \u2014 finally";\n',
      "packages/web/src/toast.test.ts":
        'expect("a \u2014 b").toBe("a \u2014 b");\n',
      "packages/web/src/Widget.tsx":
        'document.addEventListener("keydown", () => {});\n',
      "packages/web/src/shortcuts/engine.ts":
        'document.addEventListener("keydown", () => {});\n',
    });

    const hits = scanConstraints(root).map(
      (hit) => `${hit.rule}:${hit.path}:${hit.line}`,
    );
    expect(hits).toContain(
      "zod-import:packages/core/src/types/new.contracts.ts:1",
    );
    expect(hits).toContain("em-dash:packages/web/src/toast.ts:2");
    expect(hits).toContain("keydown-listener:packages/web/src/Widget.tsx:1");
    expect(hits.some((hit) => hit.includes("toast.test.ts"))).toBe(false);
    expect(hits.some((hit) => hit.includes("shortcuts/engine.ts"))).toBe(false);
  });

  it("fails a new barrel, locator, mongoService import, and duplicate schema", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-constraints-"));
    writeTree(root, {
      "packages/web/src/foo/index.ts": 'export { Foo } from "./Foo";\n',
      "packages/web/src/index.tsx":
        'import { init } from "@web/auth/posthog/posthog.bootstrap";\nvoid import("./app.bootstrap");\n',
      "packages/web/src/Widget.test.tsx": 'screen.getByTestId("x");\n',
      "packages/web/src/Widget.tsx": '<div data-state="open" />\n',
      "packages/backend/src/new.service.test.ts":
        'import mongoService from "@backend/common/services/mongo.service";\n',
      "packages/web/src/dup.ts":
        "const EventSchema = z.object({ title: z.string() });\n",
    });

    const hits = scanConstraints(root).map((hit) => `${hit.rule}:${hit.path}`);
    expect(hits).toContain("barrel:packages/web/src/foo/index.ts");
    expect(hits).toContain("web-locator:packages/web/src/Widget.test.tsx");
    expect(hits).toContain(
      "mongoService-import:packages/backend/src/new.service.test.ts",
    );
    expect(hits).toContain("duplicate-event-schema:packages/web/src/dup.ts");
    expect(hits.some((hit) => hit.includes("packages/web/src/index.tsx"))).toBe(
      false,
    );
    expect(
      hits.some((hit) => hit.includes("packages/web/src/Widget.tsx")),
    ).toBe(false);
  });

  it("does not require checker edits for new provider test files", () => {
    const root = mkdtempSync(join(tmpdir(), "provider-tests-"));
    writeTree(root, {
      "packages/web/src/index.tsx":
        'import { init } from "@web/auth/posthog/posthog.bootstrap";\nvoid import("./app.bootstrap");\n',
      "packages/sync/src/providers/microsoft/x.test.ts":
        'describe("x", () => {\n  it("ok", () => {\n    expect(true).toBe(true);\n  });\n});\n',
      "packages/web/src/auth/providers/y.test.tsx":
        'it("renders a named control", () => {\n  expect("Save").toBe("Save");\n});\n',
    });

    const hits = scanConstraints(root);
    expect(
      hits.filter(
        (hit) =>
          hit.path.includes("providers/microsoft") ||
          hit.path.includes("auth/providers"),
      ),
    ).toEqual([]);
  });

  it("still flags locators in new web tests outside documented globs", () => {
    const root = mkdtempSync(join(tmpdir(), "locator-new-"));
    writeTree(root, {
      "packages/web/src/index.tsx":
        'import { init } from "@web/auth/posthog/posthog.bootstrap";\nvoid import("./app.bootstrap");\n',
      "packages/web/src/auth/providers/y.test.tsx":
        'screen.getByTestId("provider-row");\n',
    });

    expect(
      scanConstraints(root).map((hit) => `${hit.rule}:${hit.path}`),
    ).toContain("web-locator:packages/web/src/auth/providers/y.test.tsx");
  });
});

describe("constraint allowlist globs", () => {
  it("matches nested shortcut tests and not auth provider tests", () => {
    expect(
      matchGlob(
        "packages/web/src/shortcuts/edit-sequence/EditSequenceMenu.test.tsx",
        "packages/web/src/shortcuts/**/*.test.tsx",
      ),
    ).toBe(true);
    expect(
      matchesConstraintAllow(
        "packages/web/src/auth/providers/y.test.tsx",
        WEB_LOCATOR_ALLOWLIST,
      ),
    ).toBe(false);
    expect(
      matchesConstraintAllow(
        "packages/web/src/views/Forms/EventForm/EventForm.readOnly.test.tsx",
        WEB_LOCATOR_ALLOWLIST,
      ),
    ).toBe(true);
    expect(
      matchesConstraintAllow(
        "packages/web/src/views/Forms/EventForm/DateControlsSection/RecurrenceSection/RecurrenceSection.test.tsx",
        WEB_LOCATOR_ALLOWLIST,
      ),
    ).toBe(true);
  });

  it("covers backend db tests and the mongoService unit test", () => {
    expect(
      matchesConstraintAllow(
        "packages/backend/src/billing/billing.guard.db.test.ts",
        MONGO_SERVICE_TEST_ALLOWLIST,
      ),
    ).toBe(true);
    expect(
      matchesConstraintAllow(
        "packages/backend/src/common/services/mongo.service.test.ts",
        MONGO_SERVICE_TEST_ALLOWLIST,
      ),
    ).toBe(true);
    expect(
      matchesConstraintAllow(
        "packages/backend/src/new.service.test.ts",
        MONGO_SERVICE_TEST_ALLOWLIST,
      ),
    ).toBe(false);
  });

  it("keeps allowlists empty or glob entries with a reason", () => {
    expect(BARREL_ALLOWLIST).toEqual([]);
    for (const entry of [
      ...WEB_LOCATOR_ALLOWLIST,
      ...MONGO_SERVICE_TEST_ALLOWLIST,
      ...ZOD_V3_ALLOWLIST,
      ...EM_DASH_ALLOWLIST,
      ...KEYDOWN_LISTENER_ALLOWLIST,
    ]) {
      expect(entry.glob.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("scanBunDockerfilePins", () => {
  it("strips the slim suffix when comparing oven/bun tags", () => {
    expect(ovenBunVersion("1.3.14")).toBe("1.3.14");
    expect(ovenBunVersion("1.3.14-slim")).toBe("1.3.14");
  });

  it("accepts the repo Dockerfiles against test-unit.yml", () => {
    expect(scanBunDockerfilePins()).toEqual([]);
  });

  it("fails when the e2e npm bun@ install differs from CI", () => {
    const root = mkdtempSync(join(tmpdir(), "bun-pin-"));
    writeTree(root, {
      ".github/workflows/test-unit.yml": "bun-version: 1.3.14\n",
      ".github/workflows/test-e2e.yml":
        "run: |\n  npm install --global --no-audit --no-fund bun@1.2.18\n",
    });

    const hits = scanBunDockerfilePins(root);
    expect(hits.map((hit) => `${hit.rule}:${hit.path}:${hit.detail}`)).toEqual([
      "bun-pin:.github/workflows/test-e2e.yml:bun@1.2.18 but CI pins 1.3.14",
    ]);
  });

  it("fails when the e2e workflow has no npm bun@ install", () => {
    const root = mkdtempSync(join(tmpdir(), "bun-pin-"));
    writeTree(root, {
      ".github/workflows/test-unit.yml": "bun-version: 1.3.14\n",
      ".github/workflows/test-e2e.yml": "uses: oven-sh/setup-bun@v2\n",
    });

    expect(scanBunDockerfilePins(root).map((hit) => hit.path)).toEqual([
      ".github/workflows/test-e2e.yml",
    ]);
  });

  it("fails when one Dockerfile oven/bun tag differs from CI", () => {
    const root = mkdtempSync(join(tmpdir(), "bun-pin-"));
    writeTree(root, {
      ".github/workflows/test-unit.yml": "bun-version: 1.3.14\n",
      "self-host/Dockerfile.backend": "FROM oven/bun:1.2.18 AS build\n",
      ".github/docker/Dockerfile.web":
        "FROM oven/bun:1.3.14 AS build\nFROM oven/bun:1.3.14-slim AS runtime\n",
    });

    const hits = scanBunDockerfilePins(root);
    expect(hits.map((hit) => `${hit.rule}:${hit.path}`)).toEqual([
      "bun-pin:self-host/Dockerfile.backend",
    ]);
  });
});

function writeTree(root: string, files: Record<string, string>): void {
  for (const [rel, source] of Object.entries(files)) {
    const path = join(root, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, source);
  }
}
