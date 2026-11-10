import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

describe("macOS CI contract", () => {
  it("sequences swift-packages after macos-build", () => {
    const workflow = readFileSync(".github/workflows/test-macos.yml", "utf8");
    expect(workflow).toMatch(
      /swift-packages:[\s\S]*?needs:\s*\[changes,\s*macos-build\]/,
    );
  });

  it("cancels superseded pull_request runs only", () => {
    const workflow = readFileSync(".github/workflows/test-macos.yml", "utf8");
    expect(workflow).toContain(
      "group: macos-${{ github.event.pull_request.number || github.ref }}",
    );
    expect(workflow).toContain(
      "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
    );
  });

  it("limits strict Mac verification to manual workflow_dispatch", () => {
    const workflow = readFileSync(".github/workflows/test-macos.yml", "utf8");
    expect(workflow).not.toMatch(/^\s+schedule:/m);
    expect(workflow).toContain(
      "github.event_name == 'workflow_dispatch' && inputs.strict_verify",
    );
  });

  it("uses advanced CodeQL with path-gated Swift on macOS", () => {
    const workflow = readFileSync(".github/workflows/codeql.yml", "utf8");
    expect(workflow).toContain(
      "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
    );
    expect(workflow).toContain("runs-on: macos-latest");
    expect(workflow).toContain("push");
    expect(workflow).toMatch(/schedule:[\s\S]*cron:/);
    expect(workflow).toMatch(/analyze-ubuntu:[\s\S]*runs-on: ubuntu-latest/);
  });
});
