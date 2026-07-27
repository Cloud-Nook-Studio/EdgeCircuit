import { expect, test, type Locator, type Page } from "@playwright/test";
import { generateSequence } from "@brain-training/shared";
import {
  PULSE_PATH_INITIAL_LEAD_IN_MS,
  getPulsePathPresentationDuration,
} from "../src/pulsePathTiming";

async function expectNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));

  expect(
    layout,
    `page should fit ${layout.viewportWidth}px without horizontal overflow`,
  ).toEqual({
    viewportWidth: layout.viewportWidth,
    documentWidth: layout.viewportWidth,
    bodyWidth: layout.viewportWidth,
  });
}

async function dragGameByPointer(
  page: Page,
  source: Locator,
  target: Locator,
  targetXFactor = 0.5,
  targetYFactor = 0.5,
) {
  const sourceBounds = await source.boundingBox();
  const targetBounds = await target.boundingBox();
  expect(sourceBounds).not.toBeNull();
  expect(targetBounds).not.toBeNull();

  const sourceX = sourceBounds!.x + sourceBounds!.width / 2;
  const sourceY = sourceBounds!.y + sourceBounds!.height / 2;
  await page.mouse.move(sourceX, sourceY);
  await page.mouse.down();
  await page.mouse.move(sourceX + 12, sourceY + 12, { steps: 3 });
  await expect(page.locator(".circuit-drag-ghost")).toBeVisible();
  const activeTargetBounds = await target.boundingBox();
  expect(activeTargetBounds).not.toBeNull();
  await page.mouse.move(
    activeTargetBounds!.x + activeTargetBounds!.width * targetXFactor,
    activeTargetBounds!.y + activeTargetBounds!.height * targetYFactor,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(page.locator(".circuit-drag-ghost")).toHaveCount(0);
}

async function finishRoundWithGuaranteedMiss(page: Page) {
  const identity = await page.evaluate(() => {
    const stored = localStorage.getItem("brain-training:pulse-path:v2");
    if (!stored) return null;
    const parsed = JSON.parse(stored) as {
      activeSession?: {
        currentLevel: number;
        rounds: unknown[];
        seed: string;
      } | null;
    };
    return parsed.activeSession
      ? {
          level: parsed.activeSession.currentLevel,
          roundIndex: parsed.activeSession.rounds.length,
          seed: parsed.activeSession.seed,
        }
      : null;
  });
  expect(identity).not.toBeNull();
  const sequence = generateSequence(
    identity!.seed,
    identity!.roundIndex,
    identity!.level,
  );
  const wrongTile = (sequence[0] + 1) % 9;
  await page.locator(".path-tile").nth(wrongTile).click({ force: true });

  const confirmation = page.getByRole("status", { name: "Round incorrect" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toHaveClass(/is-miss/);
  await expect(confirmation.locator("span")).toHaveText("\u00d7");
  await expect(page.locator(".network-resolution line")).toHaveCount(0);
}

async function constellationSignature(page: Page) {
  return page.locator(".path-grid").evaluate((grid) => {
    const targets = [...grid.querySelectorAll(".path-tile")].map((tile) => ({
      slot:
        [...tile.classList].find((name) => name.startsWith("slot-")) ??
        "slot-missing",
      shape:
        [
          ...(tile.querySelector(".target-shape")?.classList ?? []),
        ].find((name) => name.startsWith("shape-")) ?? "shape-missing",
    }));

    return {
      layout:
        [...grid.classList].find((name) => name.startsWith("layout-")) ??
        "layout-missing",
      shapeToSlot: targets
        .map((target) => `${target.shape}:${target.slot}`)
        .sort(),
      silhouettes: [...new Set(targets.map((target) => target.shape))].sort(),
      targets,
    };
  });
}

async function startPulsePath(page: Page, steps = 3) {
  await openOrbitGame(page, /Spatial memory Pulse Path/i);
  await expect(
    page.getByRole("heading", { name: "Choose your path length" }),
  ).toBeVisible();

  const selectedLength = page.locator(".digit-span-stepper output strong");
  await expect(selectedLength).toHaveText("3");
  const delta = steps - 3;
  const adjustment = page.getByRole("button", {
    name: delta > 0 ? "Increase path length" : "Decrease path length",
  });
  for (let index = 0; index < Math.abs(delta); index += 1) {
    await adjustment.click();
  }
  await expect(selectedLength).toHaveText(String(steps));
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();
}

async function openOrbitGame(page: Page, name: RegExp) {
  const game = page.getByRole("button", { name });
  await expect(game).toBeVisible();
  await game.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("Daily Circuit hub initiates and advances the saved game sequence", async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem(
      "brain-training:circuit-games:v1",
      JSON.stringify({ games: ["rule-shift", "signal-sweep"] }),
    );
  });
  await page.reload();

  const initiate = page.getByRole("button", {
    name: /Initiate Circuit\. Play 2 games in sequence/i,
  });
  await expect(initiate).toBeVisible();
  await expect(initiate).toContainText("Initiate");
  await expect(initiate).not.toContainText("0/2");
  await initiate.click();

  await expect(
    page.getByRole("heading", { name: /Choose by (position|direction)/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start 3 rounds/i }),
  ).toHaveCount(0);

  const leftChoice = page.getByRole("button", { name: /Left/i });
  for (let round = 0; round < 3; round += 1) {
    await expect(leftChoice).toBeEnabled();
    await leftChoice.click();
    if (round < 2) {
      await expect(leftChoice).toBeEnabled({ timeout: 3_000 });
    }
  }

  await expect(
    page.getByRole("heading", { name: "Find this signal" }),
  ).toBeVisible({ timeout: 3_000 });
  await expect(
    page.getByRole("button", { name: /Start 3 rounds/i }),
  ).toHaveCount(0);
});

test("home screen fits its viewport and exposes theme and sound preferences", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "The phone home screen has its own compact visual contract.",
  );
  await expect(
    page.getByRole("heading", { name: "Sharpen your edge." }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Daily circuit" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: /Spatial memory Pulse Path/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Number memory Digit Hold/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Executive control Rule Shift/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Selective attention Signal Sweep/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Spatial rotation Vector Match/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Relational matching Trace Pair/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Associative memory Name Recall/i }),
  ).toBeVisible();
  await expect(page.locator(".brand strong")).toHaveText("EdgeCircuit");
  await expect(page.locator(".brand small")).toHaveText(
    "Cognitive fitness for serious work",
  );
  await expect(page).toHaveTitle(
    "EdgeCircuit | Cognitive fitness for serious work",
  );
  await expect(page.locator(".brand-glyph")).toBeVisible();
  await expect(page.locator(".brand-glyph-body")).toHaveCount(1);
  await expect(page.locator(".brand-glyph-offset")).toHaveCount(1);
  await expect(page.locator(".brand-glyph-brace")).toHaveCount(1);
  await expect(page.locator(".brand-glyph-guide")).toHaveCount(1);
  await expect(page.locator(".brand-glyph-node")).toHaveCount(1);
  await expect(page.locator(".library-space-field")).toHaveCount(0);
  await expect(page.locator(".home-orbit-scan")).toHaveCount(0);
  await expect(page.locator(".home-orbit-ring")).toHaveCount(0);
  await expect(page.locator(".home-pulse-fragment")).toHaveCount(0);
  await expect(page.locator(".home-signal-dot")).toHaveCount(12);
  await expect(page.locator(".home-micro-object")).toHaveCount(0);
  await expect(page.locator(".home-circuit-background")).toBeVisible();
  await expect(
    page.locator(".background-circuit-scaffold path"),
  ).toHaveCount(5);
  await expect(page.locator(".background-circuit-loops path")).toHaveCount(3);
  await expect(page.locator(".background-circuit-nodes circle")).toHaveCount(8);
  await expect(page.locator(".background-circuit-fragments path")).toHaveCount(
    6,
  );
  await expect(
    page.getByRole("status", {
      name: "Today's practice charge: 0 out of 100. 0 of 7 circuit games complete; 0 of 21 planned rounds.",
    }),
  ).toBeVisible();
  await expect(page.locator(".practice-battery-fill")).toHaveAttribute(
    "width",
    "0",
  );
  await expect(page.locator(".practice-charge-reps")).toHaveText(
    "7 games · 0/21 rounds",
  );
  await expect(page.locator(".practice-charge")).toHaveCSS(
    "min-height",
    "42px",
  );
  await expect(page.locator(".practice-battery")).toHaveCSS("width", "50px");
  await expect(page.locator(".utility-button").first()).toHaveCSS(
    "min-height",
    "42px",
  );
  await expect(page.locator(".utility-button").first()).toHaveCSS(
    "min-width",
    "88px",
  );
  await expect(page.locator(".game-map-network")).toBeVisible();
  await expect(page.locator(".orbit-game-selector")).toHaveCSS(
    "width",
    "730px",
  );
  await expect(page.locator(".orbit-game-selector")).toHaveCSS(
    "min-height",
    "520px",
  );
  await expect(page.locator(".daily-orbit-ring")).toHaveCount(1);
  await expect(page.locator("ellipse.daily-orbit-ring")).toHaveCount(0);
  await expect(page.locator(".daily-orbit-ring")).toHaveAttribute("d", /^M.*Z$/);
  expect(
    await page.locator(".daily-orbit-ring").getAttribute("d"),
  ).not.toContain("Q");
  await expect(page.locator(".daily-orbit-mid-trace")).toHaveCount(1);
  await expect(page.locator(".daily-orbit-inner-trace")).toHaveCount(1);
  await expect(page.locator(".daily-circuit-spokes path")).toHaveCount(7);
  await expect(page.locator(".daily-circuit-junctions circle")).toHaveCount(7);
  await expect(page.locator(".daily-route-runner")).toHaveCount(3);
  await expect(page.locator(".daily-route-runner animateMotion")).toHaveCount(
    3,
  );
  await expect(
    page.locator(".daily-route-runner-steel animateMotion"),
  ).toHaveAttribute("keyPoints", "1;0");
  await expect(page.locator(".dyson-orbit")).toHaveCount(4);
  await expect(page.locator(".dyson-orbit-wide")).toHaveCSS(
    "animation-name",
    "dyson-wide-turn",
  );
  await expect(page.locator(".dyson-orbit-tall")).toHaveCSS(
    "animation-name",
    "dyson-tall-turn",
  );
  await expect(page.locator(".dyson-orbit-inner")).toHaveCSS(
    "animation-name",
    "dyson-inner-turn",
  );
  await expect(page.locator(".dyson-orbit-angular")).toHaveCSS(
    "animation-name",
    "dyson-angular-turn",
  );
  await expect(page.locator(".daily-orbit-signal")).toHaveCSS(
    "animation-direction",
    "reverse",
  );
  await expect(page.locator(".daily-orbit-counter")).toHaveCSS(
    "animation-direction",
    "normal",
  );
  await expect(page.locator(".dyson-orbit-wide")).toHaveCSS(
    "animation-direction",
    "reverse",
  );
  await expect(page.locator(".dyson-orbit-tall")).toHaveCSS(
    "animation-direction",
    "normal",
  );
  await expect(page.locator(".dyson-orbit-inner")).toHaveCSS(
    "animation-direction",
    "reverse",
  );
  await expect(page.locator(".daily-core-orbits")).toBeVisible();
  await expect(page.locator(".core-orbit-plane")).toHaveCount(3);
  await expect(page.locator(".core-atom-plane")).toHaveCount(3);
  await expect(page.locator(".core-atom-plane animateMotion")).toHaveCount(0);
  await expect(page.locator(".core-atom-plane-gold")).toHaveCSS(
    "animation-duration",
    "14s",
  );
  await expect(page.locator(".core-atom-plane-white")).toHaveCSS(
    "animation-duration",
    "18s",
  );
  await expect(page.locator(".core-atom-plane-white")).toHaveCSS(
    "animation-name",
    "core-halo-sketch-turn-reverse",
  );
  await expect(page.locator(".core-atom-plane-blue")).toHaveCSS(
    "animation-duration",
    "23s",
  );
  await expect(page.locator(".daily-core-circuitry")).toHaveCSS(
    "display",
    "none",
  );
  await expect(page.locator(".daily-core-frame")).toHaveCount(1);
  await expect(page.locator(".daily-core-frame-offset")).toHaveCount(1);
  await expect(page.locator(".daily-core-brace")).toHaveCount(1);
  await expect(page.locator(".daily-core-guide")).toHaveCount(1);
  await expect(page.locator(".daily-core-accretion")).toHaveCount(2);
  await expect(page.locator(".daily-core-event-horizon")).toHaveCount(1);
  await expect(page.locator(".daily-circuit-core")).toHaveCSS(
    "border-radius",
    "50%",
  );
  await expect(page.locator(".daily-core-signal")).toHaveCSS(
    "animation-name",
    "daily-core-signal-flow",
  );
  await expect(page.locator(".game-map-structure path")).toHaveCount(0);
  await expect(page.locator(".future-map-structure path")).toHaveCount(0);
  await expect(page.locator(".game-node-blueprint")).toHaveCount(7);
  await expect(page.locator(".game-chip-body")).toHaveCount(7);
  await expect(page.locator(".orbit-game-glyph")).toHaveCount(7);
  await expect(page.locator(".orbit-game-glyph-path")).toHaveCount(1);
  await expect(page.locator(".orbit-game-glyph-number")).toHaveCount(1);
  await expect(page.locator(".orbit-game-glyph-rule")).toHaveCount(1);
  await expect(page.locator(".orbit-game-glyph-sweep")).toHaveCount(1);
  await expect(page.locator(".orbit-game-glyph-vector")).toHaveCount(1);
  await expect(page.locator(".orbit-game-glyph-trace")).toHaveCount(1);
  await expect(page.locator(".orbit-game-glyph-name")).toHaveCount(1);
  await expect(page.locator(".game-node-session-row")).toHaveCount(7);
  await expect(
    page.locator(".game-node-session-row").first(),
  ).toHaveText("0plays");
  await expect(page.locator(".game-node-success")).toHaveCount(7);
  await expect(page.locator(".game-node-success").first()).toHaveText(
    /^—%\s*success$/,
  );
  await expect(page.locator(".game-node-session-count").first()).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".game-node-session-count").first()).toHaveCSS(
    "font-size",
    "16px",
  );
  await expect(page.locator(".game-node-success b").first()).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await expect(page.locator(".game-node-success b").first()).toHaveCSS(
    "font-size",
    "13.5px",
  );
  await expect(page.locator(".orbit-game-icon i")).toHaveCount(0);
  await expect(page.locator(".orbit-game-icon").first()).toHaveCSS(
    "width",
    "44px",
  );
  await expect(page.locator(".orbit-game-icon").first()).toHaveCSS(
    "height",
    "43px",
  );
  const signalTitleBounds = await page
    .locator(".game-choice-signal")
    .evaluate((node) => {
      const card = node.getBoundingClientRect();
      const title = node.querySelector("strong")?.getBoundingClientRect();
      return {
        cardLeft: card.left,
        cardRight: card.right,
        titleLeft: title?.left ?? null,
        titleRight: title?.right ?? null,
      };
    });
  expect(signalTitleBounds.titleLeft).toBeGreaterThan(
    signalTitleBounds.cardLeft + 4,
  );
  expect(signalTitleBounds.titleRight).toBeLessThan(
    signalTitleBounds.cardRight - 8,
  );
  const digitMetricSeparation = await page
    .locator(".game-choice-number")
    .evaluate((node) => {
      const card = node.getBoundingClientRect();
      const icon = node
        .querySelector(".orbit-game-glyph")
        ?.getBoundingClientRect();
      const plays = node
        .querySelector(".game-node-session-row")
        ?.getBoundingClientRect();
      return {
        cardRight: card.right,
        iconRight: icon?.right ?? null,
        playsLeft: plays?.left ?? null,
        playsRight: plays?.right ?? null,
      };
    });
  expect(digitMetricSeparation.playsLeft).toBeGreaterThan(
    digitMetricSeparation.iconRight ?? 0,
  );
  expect(digitMetricSeparation.playsRight).toBeLessThan(
    digitMetricSeparation.cardRight,
  );
  await expect(page.locator(".orbit-glyph-digit")).toHaveCount(3);
  await expect(page.locator(".orbit-glyph-rule-arrow")).toHaveCount(2);
  await expect(page.locator(".orbit-placeholder")).toHaveCount(0);
  await expect(page.locator(".future-station")).toHaveCount(0);
  await expect(page.getByText("TBD", { exact: true })).toHaveCount(0);
  const circuitHub = page.getByRole("button", {
    name: /Initiate Circuit\. Play 7 games in sequence/i,
  });
  await expect(circuitHub).toBeVisible();
  await expect(circuitHub).not.toContainText("0/7");

  const pathNode = page.locator(".game-choice-path");
  const nodeBefore = await pathNode.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return { height: bounds.height, x: bounds.x, y: bounds.y };
  });
  expect(nodeBefore.height).toBeGreaterThanOrEqual(105);
  expect(nodeBefore.height).toBeLessThanOrEqual(107);
  await expect(pathNode).toHaveCSS("animation-name", "circuit-node-lap");
  await expect(pathNode).toHaveCSS("animation-duration", "116s");
  await expect(page.locator(".game-choice-number")).toHaveCSS(
    "animation-name",
    "circuit-node-lap",
  );
  await expect(page.locator(".game-choice-rule")).toHaveCSS(
    "animation-name",
    "circuit-node-lap",
  );
  await expect(page.locator(".game-choice-signal")).toHaveCSS(
    "animation-name",
    "circuit-node-lap",
  );
  await expect(page.locator(".game-choice-vector")).toHaveCSS(
    "animation-name",
    "circuit-node-lap",
  );
  await expect(page.locator(".game-choice-trace")).toHaveCSS(
    "animation-name",
    "circuit-node-lap",
  );
  await expect(page.locator(".game-choice-name")).toHaveCSS(
    "animation-name",
    "circuit-node-lap",
  );
  await expect(page.locator(".game-choice-path")).toHaveCSS(
    "animation-delay",
    "0s",
  );
  await expect(page.locator(".game-choice-number")).toHaveCSS(
    "animation-delay",
    "-16.5714s",
  );
  await expect(page.locator(".game-choice-rule")).toHaveCSS(
    "animation-delay",
    "-33.1429s",
  );
  await expect(page.locator(".game-choice-signal")).toHaveCSS(
    "animation-delay",
    "-49.7143s",
  );
  await expect(page.locator(".game-choice-vector")).toHaveCSS(
    "animation-delay",
    "-66.2857s",
  );
  await expect(page.locator(".game-choice-trace")).toHaveCSS(
    "animation-delay",
    "-82.8571s",
  );
  await expect(page.locator(".game-choice-name")).toHaveCSS(
    "animation-delay",
    "-99.4286s",
  );
  await expect(page.locator(".orbit-game-copy strong")).toHaveCount(7);
  await expect(page.locator(".game-title-accent")).toHaveText([
    "Path",
    "Hold",
    "Shift",
    "Sweep",
    "Match",
    "Pair",
    "Recall",
  ]);
  await expect(page.locator(".orbit-game-copy strong").first()).toHaveCSS(
    "writing-mode",
    "horizontal-tb",
  );
  const titleColor = await page
    .locator(".game-title-accent")
    .first()
    .evaluate((node) => getComputedStyle(node).color);
  expect(titleColor).not.toBe(
    await page
      .locator(".orbit-game-copy strong")
      .first()
      .evaluate((node) => getComputedStyle(node).color),
  );
  await page.waitForTimeout(900);
  const nodeAfter = await pathNode.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y };
  });
  expect(
    Math.hypot(nodeAfter.x - nodeBefore.x, nodeAfter.y - nodeBefore.y),
  ).toBeGreaterThan(5);
  const driftingSurface = pathNode.locator(".game-node-drift");
  const surfaceBefore = await driftingSurface.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y };
  });
  await page.waitForTimeout(900);
  const surfaceAfter = await driftingSurface.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y };
  });
  expect(
    Math.hypot(
      surfaceAfter.x - surfaceBefore.x,
      surfaceAfter.y - surfaceBefore.y,
    ),
  ).toBeGreaterThan(0.5);
  await pathNode.hover({ force: true });
  await expect(driftingSurface).toHaveCSS("scale", "1");
  await expect(pathNode.locator(".orbit-game-glyph")).toHaveCSS(
    "transform",
    "none",
  );
  expect(
    await page.locator("body").evaluate((node) => getComputedStyle(node).backgroundImage),
  ).toContain("151, 178, 199");
  await expect(page.locator(".daily-circuit-core")).toHaveCSS(
    "width",
    "126px",
  );
  const hubClipPath = await page
    .locator(".daily-circuit-core")
    .evaluate((node) => getComputedStyle(node).clipPath);
  expect(hubClipPath.match(/,/g)).toHaveLength(15);

  const theme = page.getByRole("button", { name: "Theme" });
  const sound = page.getByRole("button", { name: "Sound" });
  await expect(theme).toHaveAttribute("aria-pressed", "false");
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  await theme.click();
  await sound.click();
  await expect(theme).toHaveAttribute("aria-pressed", "true");
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "full");
  await expect(driftingSurface).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(driftingSurface).toHaveCSS("box-shadow", "none");
  await expect(pathNode.locator(".game-node-launch")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(pathNode.locator(".game-node-content")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(pathNode).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  expect(
    await page.locator("body").evaluate((node) => getComputedStyle(node).backgroundImage),
  ).toContain("44, 79, 102");

  await expectNoHorizontalOverflow(page);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Theme" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Sound" }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("phone home keeps the full circuit and controls inside the viewport", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "This is the phone home-screen visual contract.",
  );

  await expectNoHorizontalOverflow(page);
  await expect(page.getByRole("button", { name: "Theme" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sound" })).toBeVisible();
  await expect(page.locator(".orbit-game-selector [data-game-id]")).toHaveCount(
    7,
  );

  const layout = await page.evaluate(() => {
    const viewportWidth = window.innerWidth;
    const headerControls = [
      ...document.querySelectorAll<HTMLElement>(
        ".site-header .brand, .site-header .practice-charge, .site-header .utility-button",
      ),
    ].map((element) => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top };
    });
    const nodes = [
      ...document.querySelectorAll<HTMLElement>(
        ".orbit-game-selector > .game-choice",
      ),
    ].map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        game: element.dataset.gameId,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
      };
    });
    return { headerControls, nodes, viewportWidth };
  });

  for (const control of layout.headerControls) {
    expect(control.left).toBeGreaterThanOrEqual(0);
    expect(control.right).toBeLessThanOrEqual(layout.viewportWidth);
    expect(control.top).toBeGreaterThanOrEqual(0);
  }
  for (let first = 0; first < layout.nodes.length; first += 1) {
    for (let second = first + 1; second < layout.nodes.length; second += 1) {
      const horizontalOverlap =
        Math.min(layout.nodes[first]!.right, layout.nodes[second]!.right) -
        Math.max(layout.nodes[first]!.left, layout.nodes[second]!.left);
      const verticalOverlap =
        Math.min(layout.nodes[first]!.bottom, layout.nodes[second]!.bottom) -
        Math.max(layout.nodes[first]!.top, layout.nodes[second]!.top);
      expect(
        horizontalOverlap <= 2 || verticalOverlap <= 2,
        `${layout.nodes[first]!.game} and ${layout.nodes[second]!.game} overlap`,
      ).toBe(true);
    }
  }

  const placementBounds = await page
    .getByRole("button", {
      name: "Remove Digit Hold from daily circuit",
    })
    .boundingBox();
  expect(placementBounds).not.toBeNull();
  expect(placementBounds!.width).toBeGreaterThanOrEqual(29);
  expect(placementBounds!.height).toBeGreaterThanOrEqual(27);
});

test("hover keeps home game text registered inside its blueprint node", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "Hover registration is a desktop interaction.",
  );
  await page.goto("/");
  const signalNode = page.locator(".game-choice-signal");
  const copy = signalNode.locator(".orbit-game-copy");
  const surface = signalNode.locator(".game-node-drift");

  const relativePosition = async () => {
    const copyBox = await copy.boundingBox();
    const surfaceBox = await surface.boundingBox();
    if (!copyBox || !surfaceBox) return null;
    return {
      rightInset: surfaceBox.x + surfaceBox.width - (copyBox.x + copyBox.width),
      x: copyBox.x - surfaceBox.x,
      y: copyBox.y - surfaceBox.y,
    };
  };

  const before = await relativePosition();
  await signalNode.hover({ force: true });
  await page.waitForTimeout(220);
  const after = await relativePosition();

  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(1.25);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(1.25);
  expect(after!.rightInset).toBeGreaterThanOrEqual(8);
});

test("daily diagnostics form a compact instrument around the circuit hub", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "Desktop diagnostic dimensions differ from the phone orbit.",
  );
  await page.evaluate(() => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(now.getDate()).padStart(2, "0")}`;
    localStorage.setItem(
      "brain-training:practice-charge:v2",
      JSON.stringify({
        accuracyReps: 6,
        accuracyTotal: 5.5,
        date,
        earnedBadges: [],
        lastAward: null,
        paceMsPerItemTotal: 12_600,
        paceReps: 9,
        recallAccuracyReps: 3,
        recallAccuracyTotal: 2.5,
        reps: 9,
        value: 76,
      }),
    );
  });
  await page.reload();

  const diagnostics = page.getByRole("list", {
    name: "Today's task diagnostics",
  });
  await expect(diagnostics).toBeVisible();
  await expect(diagnostics.getByRole("listitem")).toHaveCount(4);
  await expect(diagnostics.locator(".daily-diagnostic").first()).toHaveCSS(
    "width",
    "56px",
  );
  await expect(
    diagnostics.locator('[data-diagnostic-id="pace"]'),
  ).toHaveCSS("width", "62px");
  await expect(
    diagnostics.locator('[data-diagnostic-id="accuracy"]'),
  ).toHaveText("Accuracy92%");
  await expect(
    diagnostics.locator('[data-diagnostic-id="pace"]'),
  ).toHaveText("Pace1.4s/item");
  await expect(
    diagnostics.locator('[data-diagnostic-id="recall"]'),
  ).toHaveText("Recall83%");
  await expect(
    diagnostics.locator('[data-diagnostic-id="rounds"]'),
  ).toHaveText("Rounds9");
  await expect(page.locator(".daily-achievement-count")).toHaveCount(0);

  const hub = await page.locator(".daily-circuit-core").boundingBox();
  const diagnosticBoxes = await diagnostics
    .locator(".daily-diagnostic")
    .evaluateAll(
    (elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          bottom: bounds.bottom,
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
        };
      }),
  );
  expect(hub).not.toBeNull();
  for (const diagnostic of diagnosticBoxes) {
    const overlapsHub =
      diagnostic.left < hub!.x + hub!.width &&
      diagnostic.right > hub!.x &&
      diagnostic.top < hub!.y + hub!.height &&
      diagnostic.bottom > hub!.y;
    expect(overlapsHub).toBe(false);
  }
});

test("compact browser panes keep completed game nodes separate", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "This test resizes the desktop visual contract.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(now.getDate()).padStart(2, "0")}`;
    localStorage.setItem(
      "brain-training:daily-clears:v2",
      JSON.stringify({
        date,
        games: [
          "pulse-path",
          "number-memory",
          "rule-shift",
          "signal-sweep",
          "vector-match",
          "trace-pair",
          "name-recall",
        ],
      }),
    );
  });
  await page.reload();

  const nodes = page.locator(".orbit-game-selector .game-choice");
  await expect(nodes).toHaveCount(7);
  await expect(nodes.first()).toHaveCSS("width", "104px");
  await expect(nodes.first()).toHaveCSS("height", "78px");

  const bounds = await nodes.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect();
      return {
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        top: box.top,
      };
    }),
  );

  for (let first = 0; first < bounds.length; first += 1) {
    for (let second = first + 1; second < bounds.length; second += 1) {
      const horizontalOverlap =
        Math.min(bounds[first]!.right, bounds[second]!.right) -
        Math.max(bounds[first]!.left, bounds[second]!.left);
      const verticalOverlap =
        Math.min(bounds[first]!.bottom, bounds[second]!.bottom) -
        Math.max(bounds[first]!.top, bounds[second]!.top);
      expect(horizontalOverlap <= 0 || verticalOverlap <= 0).toBe(true);
    }
  }

  await expectNoHorizontalOverflow(page);
});

test("sound cues resume audio and play answer feedback", async ({ page }) => {
  await page.addInitScript(() => {
    const audioState = window as typeof window & {
      __audioResumeCalls: number;
      __frequencyStarts: number[];
      __frequencySweeps: Array<{ end: number; start: number }>;
      __toneStarts: number;
    };
    audioState.__audioResumeCalls = 0;
    audioState.__frequencyStarts = [];
    audioState.__frequencySweeps = [];
    audioState.__toneStarts = 0;

    class FakeAudioParam {
      private startValue: number | null = null;

      constructor(private readonly recordsSweep = false) {}

      exponentialRampToValueAtTime(value: number) {
        if (this.recordsSweep && this.startValue !== null) {
          audioState.__frequencySweeps.push({
            end: value,
            start: this.startValue,
          });
          this.startValue = null;
        }
      }

      setValueAtTime(value: number) {
        if (this.recordsSweep) {
          this.startValue = value;
          audioState.__frequencyStarts.push(value);
        }
      }
    }

    class FakeAudioNode {
      connect() {
        return this;
      }
    }

    class FakeGainNode extends FakeAudioNode {
      gain = new FakeAudioParam();
    }

    class FakeOscillatorNode extends FakeAudioNode {
      frequency = new FakeAudioParam(true);
      type = "sine";

      start() {
        audioState.__toneStarts += 1;
      }

      stop() {}
    }

    class FakeAudioContext {
      currentTime = 0;
      destination = new FakeAudioNode();
      state: AudioContextState = "suspended";

      close() {
        this.state = "closed";
        return Promise.resolve();
      }

      createGain() {
        return new FakeGainNode();
      }

      createOscillator() {
        return new FakeOscillatorNode();
      }

      resume() {
        audioState.__audioResumeCalls += 1;
        this.state = "running";
        return Promise.resolve();
      }
    }

    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: FakeAudioContext,
    });
  });
  await page.reload();

  const sound = page.getByRole("button", { name: "Sound" });
  await sound.click();
  await sound.click();
  await expect.poll(() =>
    page.evaluate(() => {
      const audioState = window as typeof window & {
        __audioResumeCalls: number;
        __toneStarts: number;
      };
      return {
        resumes: audioState.__audioResumeCalls,
        starts: audioState.__toneStarts,
      };
    }),
  ).toEqual({ resumes: 1, starts: 4 });

  await openOrbitGame(page, /Number memory Digit Hold/i);
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();
  await expect.poll(() =>
    page.evaluate(() => {
      const audioState = window as typeof window & { __toneStarts: number };
      return audioState.__toneStarts;
    }),
  ).toBeGreaterThanOrEqual(6);
  const value = (await page.locator(".memory-number").innerText()).trim();
  const input = page.getByLabel("Enter the digits in the same order");
  await expect(input).toBeVisible();
  const correctBaseline = await page.evaluate(() => {
    const audioState = window as typeof window & { __toneStarts: number };
    return audioState.__toneStarts;
  });
  await input.fill(value);

  await expect(page.getByRole("heading", { name: "Correct" })).toBeVisible();
  await expect.poll(() =>
    page.evaluate(() => {
      const audioState = window as typeof window & { __toneStarts: number };
      return audioState.__toneStarts;
    }),
  ).toBeGreaterThanOrEqual(correctBaseline + 4);
  const correctSweeps = await page.evaluate(() => {
    const audioState = window as typeof window & {
      __frequencySweeps: Array<{ end: number; start: number }>;
    };
    return audioState.__frequencySweeps.slice(-4);
  });
  expect(correctSweeps).toHaveLength(4);
  expect(correctSweeps.every((sweep) => sweep.end > sweep.start)).toBe(true);

  await page.waitForTimeout(850);
  const secondNumber = page.locator(".memory-number");
  await expect(secondNumber).toBeVisible();
  const secondValue = (await secondNumber.innerText()).trim();
  const wrongFirstDigit = secondValue[0] === "9" ? "8" : "9";
  const wrongValue = `${wrongFirstDigit}${secondValue.slice(1)}`;
  await expect(input).toBeVisible();
  const incorrectBaseline = await page.evaluate(() => {
    const audioState = window as typeof window & { __toneStarts: number };
    return audioState.__toneStarts;
  });
  await input.fill(wrongValue);

  await expect(page.getByRole("heading", { name: "Not quite" })).toBeVisible();
  await expect.poll(() =>
    page.evaluate(() => {
      const audioState = window as typeof window & { __toneStarts: number };
      return audioState.__toneStarts;
    }),
  ).toBeGreaterThanOrEqual(incorrectBaseline + 3);
  const incorrectSweeps = await page.evaluate(() => {
    const audioState = window as typeof window & {
      __frequencySweeps: Array<{ end: number; start: number }>;
    };
    return audioState.__frequencySweeps.slice(-3);
  });
  expect(incorrectSweeps).toHaveLength(3);
  expect(incorrectSweeps.every((sweep) => sweep.end < sweep.start)).toBe(true);

  await page.getByRole("button", { name: "Exit to home" }).click();
  await openOrbitGame(page, /Spatial memory Pulse Path/i);
  const pulseFrequencyBaseline = await page.evaluate(() => {
    const audioState = window as typeof window & {
      __frequencyStarts: number[];
    };
    return audioState.__frequencyStarts.length;
  });
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();
  await expect(page.getByText("Your turn", { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  const presentationFrequencies = await page.evaluate((baseline) => {
    const audioState = window as typeof window & {
      __frequencyStarts: number[];
    };
    return audioState.__frequencyStarts.slice(baseline);
  }, pulseFrequencyBaseline);
  expect(presentationFrequencies).toHaveLength(6);

  const pulseSession = await page.evaluate(() => {
    const stored = localStorage.getItem("brain-training:pulse-path:v2");
    if (!stored) return null;
    return (JSON.parse(stored) as {
      activeSession?: { currentLevel: number; seed: string } | null;
    }).activeSession;
  });
  expect(pulseSession).not.toBeNull();
  const firstTarget = generateSequence(
    pulseSession!.seed,
    0,
    pulseSession!.currentLevel,
  )[0]!;
  const recallFrequencyBaseline = await page.evaluate(() => {
    const audioState = window as typeof window & {
      __frequencyStarts: number[];
    };
    return audioState.__frequencyStarts.length;
  });
  await page.locator(".path-tile").nth(firstTarget).click({ force: true });
  await expect.poll(() =>
    page.evaluate(() => {
      const audioState = window as typeof window & {
        __frequencyStarts: number[];
      };
      return audioState.__frequencyStarts.length;
    }),
  ).toBe(recallFrequencyBaseline + 2);
  const recallFrequencies = await page.evaluate((baseline) => {
    const audioState = window as typeof window & {
      __frequencyStarts: number[];
    };
    return audioState.__frequencyStarts.slice(baseline);
  }, recallFrequencyBaseline);
  expect(recallFrequencies).toEqual(presentationFrequencies.slice(0, 2));
});

test("exiting Pulse Path discards the active session without a save or resume flow", async ({
  page,
}) => {
  await startPulsePath(page);
  await expect(page.getByText("Watch the path", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Exit to home" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /save|resume/i }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Exit to home" }).click();
  await expect(
    page.getByRole("button", { name: /Spatial memory Pulse Path/i }),
  ).toBeVisible();
  await expect(page.locator(".game-choice-path")).not.toContainText("Saved");

  const activeSession = await page.evaluate(() => {
    const stored = localStorage.getItem("brain-training:pulse-path:v2");
    if (!stored) return undefined;
    return (JSON.parse(stored) as { activeSession?: unknown }).activeSession;
  });
  expect(activeSession).toBeNull();

  await page.reload();
  await expect(
    page.getByRole("button", { name: /Spatial memory Pulse Path/i }),
  ).toBeVisible();
  await openOrbitGame(page, /Spatial memory Pulse Path/i);
  await expect(
    page.getByRole("heading", { name: "Choose your path length" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /save|resume/i }),
  ).toHaveCount(0);
  await expect(page.locator(".digit-span-stepper output strong")).toHaveText(
    "3",
  );

  await expectNoHorizontalOverflow(page);
});

test("exiting Digit Hold discards the active session without a save flow", async ({
  page,
}) => {
  await openOrbitGame(page, /Number memory Digit Hold/i);
  await expect(
    page.getByRole("heading", { name: "Choose your span" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Increase digit span" }).click();
  await expect(page.locator(".digit-span-stepper output strong")).toHaveText(
    "6",
  );
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();
  await expect(
    page.getByRole("button", { name: "Exit to home" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /save|resume/i }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Exit to home" }).click();
  await expect(
    page.getByRole("button", { name: /Number memory Digit Hold/i }),
  ).toBeVisible();

  await page.reload();
  await openOrbitGame(page, /Number memory Digit Hold/i);
  await expect(
    page.getByRole("heading", { name: "Choose your span" }),
  ).toBeVisible();
  await expect(page.locator(".digit-span-stepper output strong")).toHaveText(
    "5",
  );
  await expect(
    page.getByRole("button", { name: /save|resume/i }),
  ).toHaveCount(0);

  await expectNoHorizontalOverflow(page);
});

test("games can be dragged off and back onto the Daily Circuit with persistence", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "Phone drag persistence is covered with real touch input.",
  );
  const circuit = page.getByRole("region", { name: "Daily circuit" });
  const reserve = page.getByRole("region", { name: "Available games" });
  const digitGame = circuit.locator('[data-game-id="number-memory"]');

  await expect(circuit.locator("[data-game-id]")).toHaveCount(7);
  await expect(reserve.locator("[data-game-id]")).toHaveCount(0);
  await dragGameByPointer(page, digitGame, reserve, 0.04, 0.5);

  await expect(circuit.locator("[data-game-id]")).toHaveCount(6);
  await expect(
    reserve.locator('[data-game-id="number-memory"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("status", {
      name: "0 of 6 daily circuit games complete",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Daily circuit" }),
  ).toBeVisible();
  await expect(page.locator(".practice-charge")).toHaveAttribute(
    "title",
    "6 games on circuit; 0 complete. 0 circuit + 0 reps + 0 accuracy + 0 pace. Resets daily.",
  );

  expect(
    await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem("brain-training:circuit-games:v1") ?? "null",
      ),
    ),
  ).toEqual({
    games: [
      "pulse-path",
      "rule-shift",
      "signal-sweep",
      "vector-match",
      "trace-pair",
      "name-recall",
    ],
  });
  const freePlacement = await page.evaluate(() => {
    const stored = JSON.parse(
      localStorage.getItem("brain-training:circuit-positions:v1") ?? "{}",
    ) as Record<string, { freeX?: number; freeY?: number }>;
    return stored["number-memory"];
  });
  expect(freePlacement?.freeX).toBeCloseTo(4, 0);
  expect(freePlacement?.freeY).toBeCloseTo(50, 0);

  await page.reload();
  const floatingDigit = page
    .getByRole("region", { name: "Available games" })
    .locator('[data-game-id="number-memory"]');
  await expect(floatingDigit).toBeVisible();
  const floatingSurface = floatingDigit.locator(".game-node-drift");
  await expect(floatingSurface).toHaveCSS(
    "animation-name",
    "reserve-game-float",
  );
  await expect(floatingSurface).toHaveCSS("animation-duration", "10.4s");
  const reserveDrift = await floatingDigit.evaluate((game) => {
    const surface = game.querySelector<HTMLElement>(".game-node-drift");
    const animation = surface?.getAnimations()[0];
    if (!surface || !animation) return null;

    animation.pause();
    animation.currentTime = 0;
    const gameStart = game.getBoundingClientRect();
    const surfaceStart = surface.getBoundingClientRect();
    animation.currentTime = 3_536;
    const gameDrift = game.getBoundingClientRect();
    const surfaceDrift = surface.getBoundingClientRect();
    animation.play();

    return {
      gameDistance: Math.hypot(
        gameDrift.x - gameStart.x,
        gameDrift.y - gameStart.y,
      ),
      surfaceDistance: Math.hypot(
        surfaceDrift.x - surfaceStart.x,
        surfaceDrift.y - surfaceStart.y,
      ),
    };
  });
  expect(reserveDrift).not.toBeNull();
  expect(reserveDrift!.surfaceDistance).toBeGreaterThan(2);
  expect(reserveDrift!.surfaceDistance).toBeLessThan(10);
  expect(reserveDrift!.gameDistance).toBeLessThan(0.1);
  await dragGameByPointer(
    page,
    floatingDigit,
    page.getByRole("region", { name: "Available games" }),
    0.72,
    0.92,
  );
  const movedFreePlacement = await page.evaluate(() => {
    const stored = JSON.parse(
      localStorage.getItem("brain-training:circuit-positions:v1") ?? "{}",
    ) as Record<string, { freeX?: number; freeY?: number }>;
    return stored["number-memory"];
  });
  expect(movedFreePlacement?.freeX).toBeCloseTo(72, 0);
  expect(movedFreePlacement?.freeY).toBeCloseTo(92, 0);

  await dragGameByPointer(
    page,
    floatingDigit,
    page.getByRole("region", { name: "Daily circuit" }),
    0.88,
    0.5,
  );

  await expect(
    page
      .getByRole("region", { name: "Daily circuit" })
      .locator('[data-game-id="number-memory"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("status", {
      name: "0 of 7 daily circuit games complete",
    }),
  ).toBeVisible();
  await expect(page.locator(".practice-charge")).toHaveAttribute(
    "title",
    "7 games on circuit; 0 complete. 0 circuit + 0 reps + 0 accuracy + 0 pace. Resets daily.",
  );
  const circuitPlacement = await page.evaluate(() => {
    const stored = JSON.parse(
      localStorage.getItem("brain-training:circuit-positions:v1") ?? "{}",
    ) as Record<string, { orbitPhase: number }>;
    const animationTime = document
      .querySelector<HTMLElement>(
        '.orbit-game-selector [data-game-id="number-memory"]',
      )
      ?.getAnimations()[0]?.currentTime;
    const orbitProgress =
      typeof animationTime === "number" ? animationTime / 116_000 : 0;
    const phases = Object.fromEntries(
      Object.entries(stored).map(([game, placement]) => [
        game,
        ((placement.orbitPhase % 1) + 1) % 1,
      ]),
    );
    return {
      phases,
      visibleDigitPhase:
        (((stored["number-memory"]!.orbitPhase + orbitProgress) % 1) + 1) % 1,
    };
  });
  expect(circuitPlacement.visibleDigitPhase).toBeCloseTo(0.25, 1);
  const storedPhases = Object.values(circuitPlacement.phases) as number[];
  for (let first = 0; first < storedPhases.length; first += 1) {
    for (let second = first + 1; second < storedPhases.length; second += 1) {
      const directGap = Math.abs(
        storedPhases[first]! - storedPhases[second]!,
      );
      expect(Math.min(directGap, 1 - directGap)).toBeGreaterThanOrEqual(0.141);
    }
  }
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Daily circuit" })
      .locator("[data-game-id]"),
  ).toHaveCount(7);
});

test("phone touch dragging moves a game off the circuit", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "This regression covers the phone touch path.",
  );

  const source = page
    .getByRole("region", { name: "Daily circuit" })
    .locator('[data-game-id="number-memory"]');
  const reserve = page.getByRole("region", { name: "Available games" });
  const sourceBounds = await source.boundingBox();
  const reserveBounds = await reserve.boundingBox();
  expect(sourceBounds).not.toBeNull();
  expect(reserveBounds).not.toBeNull();

  const start = {
    x: sourceBounds!.x + sourceBounds!.width / 2,
    y: sourceBounds!.y + sourceBounds!.height / 2,
  };
  const end = {
    x: reserveBounds!.x + reserveBounds!.width / 2,
    y: reserveBounds!.y + reserveBounds!.height / 2,
  };
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [start],
  });
  for (let step = 1; step <= 12; step += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: start.x + ((end.x - start.x) * step) / 12,
          y: start.y + ((end.y - start.y) * step) / 12,
        },
      ],
    });
  }
  await expect(page.locator(".circuit-drag-ghost")).toBeVisible();
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });

  await expect(
    reserve.locator('[data-game-id="number-memory"]'),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Add Digit Hold to daily circuit",
    }),
  ).toBeVisible();

  const floatingBounds = await reserve
    .locator('[data-game-id="number-memory"]')
    .boundingBox();
  const circuitBounds = await page
    .getByRole("region", { name: "Daily circuit" })
    .boundingBox();
  expect(floatingBounds).not.toBeNull();
  expect(circuitBounds).not.toBeNull();
  const returnStart = {
    x: floatingBounds!.x + floatingBounds!.width / 2,
    y: floatingBounds!.y + floatingBounds!.height / 2,
  };
  const returnEnd = {
    x: circuitBounds!.x + circuitBounds!.width * 0.82,
    y: circuitBounds!.y + circuitBounds!.height * 0.5,
  };
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [returnStart],
  });
  for (let step = 1; step <= 12; step += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x:
            returnStart.x +
            ((returnEnd.x - returnStart.x) * step) / 12,
          y:
            returnStart.y +
            ((returnEnd.y - returnStart.y) * step) / 12,
        },
      ],
    });
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(
    page
      .getByRole("region", { name: "Daily circuit" })
      .locator('[data-game-id="number-memory"]'),
  ).toBeVisible();
});

test("the broad circuit band accepts flexible drops and keeps neighboring nodes clear", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "This exercises the desktop circuit geometry.",
  );
  const circuit = page.getByRole("region", { name: "Daily circuit" });
  const pulsePath = circuit.locator('[data-game-id="pulse-path"]');

  // This point sits on an inner construction trace. The earlier narrow band
  // rejected it even though it visibly belongs to the circuit.
  await dragGameByPointer(page, pulsePath, circuit, 0.5, 0.66);

  await expect(circuit.locator("[data-game-id]")).toHaveCount(7);
  await expect(
    circuit.locator('[data-game-id="pulse-path"]'),
  ).toBeVisible();

  const visiblePulsePhase = await page.evaluate(() => {
    const stored = JSON.parse(
      localStorage.getItem("brain-training:circuit-positions:v1") ?? "{}",
    ) as Record<string, { orbitPhase: number }>;
    const animationTime = document
      .querySelector<HTMLElement>(
        '.orbit-game-selector [data-game-id="pulse-path"]',
      )
      ?.getAnimations()[0]?.currentTime;
    const orbitProgress =
      typeof animationTime === "number" ? animationTime / 116_000 : 0;
    return (
      (((stored["pulse-path"]!.orbitPhase + orbitProgress) % 1) + 1) % 1
    );
  });
  expect(visiblePulsePhase).toBeCloseTo(0.5, 1);

  const nodeBounds = await circuit.locator("[data-game-id]").evaluateAll(
    (elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return {
          bottom: box.bottom,
          game: element.getAttribute("data-game-id"),
          left: box.left,
          right: box.right,
          top: box.top,
        };
      }),
  );
  for (let first = 0; first < nodeBounds.length; first += 1) {
    for (let second = first + 1; second < nodeBounds.length; second += 1) {
      const horizontalOverlap =
        Math.min(nodeBounds[first]!.right, nodeBounds[second]!.right) -
        Math.max(nodeBounds[first]!.left, nodeBounds[second]!.left);
      const verticalOverlap =
        Math.min(nodeBounds[first]!.bottom, nodeBounds[second]!.bottom) -
        Math.max(nodeBounds[first]!.top, nodeBounds[second]!.top);
      expect(
        horizontalOverlap <= 2 || verticalOverlap <= 2,
        `${nodeBounds[first]!.game} and ${nodeBounds[second]!.game} overlap by ${horizontalOverlap.toFixed(1)} x ${verticalOverlap.toFixed(1)} pixels`,
      ).toBe(true);
    }
  }
});

test("the complete game shape stays under the pointer while it is dragged", async ({
  page,
}) => {
  const source = page
    .getByRole("region", { name: "Daily circuit" })
    .locator('[data-game-id="pulse-path"]');
  const sourceBounds = await source.boundingBox();
  expect(sourceBounds).not.toBeNull();

  const startX = sourceBounds!.x + sourceBounds!.width * 0.42;
  const startY = sourceBounds!.y + sourceBounds!.height * 0.58;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 18, startY + 14, { steps: 3 });

  const ghost = page.locator(".circuit-drag-ghost");
  await expect(ghost).toBeVisible();
  await expect(ghost.locator(".game-node-blueprint")).toBeVisible();
  await expect(ghost.locator(".orbit-game-glyph")).toBeVisible();
  await expect(ghost).toHaveCSS("pointer-events", "none");
  await expect(page.locator(".circuit-drag-line")).toHaveCount(0);
  await expect(page.locator(".circuit-drag-preview")).toHaveCount(0);

  const firstGhostBounds = await ghost.boundingBox();
  expect(firstGhostBounds).not.toBeNull();
  expect(firstGhostBounds!.width).toBeCloseTo(sourceBounds!.width, 0);
  expect(firstGhostBounds!.height).toBeCloseTo(sourceBounds!.height, 0);

  await page.mouse.move(startX + 96, startY + 62, { steps: 5 });
  const movedGhostBounds = await ghost.boundingBox();
  expect(movedGhostBounds).not.toBeNull();
  expect(movedGhostBounds!.x - firstGhostBounds!.x).toBeCloseTo(78, 0);
  expect(movedGhostBounds!.y - firstGhostBounds!.y).toBeCloseTo(48, 0);

  await page.mouse.up();
  await expect(ghost).toHaveCount(0);
});

test("circuit placement controls provide a keyboard equivalent and preserve game launch", async ({
  page,
}) => {
  const removeDigit = page.getByRole("button", {
    name: "Remove Digit Hold from daily circuit",
  });
  await removeDigit.focus();
  await page.keyboard.press("Enter");

  const addDigit = page.getByRole("button", {
    name: "Add Digit Hold to daily circuit",
  });
  await expect(addDigit).toBeVisible();
  await expect(addDigit).toBeFocused();
  await expect(page.locator(".circuit-placement-announcement")).toHaveText(
    "Digit Hold moved to reserve.",
  );

  await page.getByRole("button", {
    name: "Play Number memory Digit Hold",
  }).click();
  await expect(
    page.getByRole("heading", { name: "Choose your span" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Exit to home" }).click();

  await page.getByRole("button", {
    name: "Add Digit Hold to daily circuit",
  }).focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", {
      name: "Remove Digit Hold from daily circuit",
    }),
  ).toBeFocused();
  await expect(page.locator(".circuit-placement-announcement")).toHaveText(
    "Digit Hold moved to the daily circuit.",
  );
});

test("only games on the circuit contribute to its completion count", async ({
  page,
}) => {
  await page.getByRole("button", {
    name: "Remove Digit Hold from daily circuit",
  }).focus();
  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(now.getDate()).padStart(2, "0")}`;
    localStorage.setItem(
      "brain-training:daily-clears:v2",
      JSON.stringify({
        date,
        games: ["pulse-path", "number-memory"],
      }),
    );
  });
  await page.reload();

  await expect(
    page.getByRole("status", {
      name: "1 of 6 daily circuit games complete",
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Available games" })
      .locator('[data-game-id="number-memory"]'),
  ).not.toHaveClass(/is-complete/);

  await page.getByRole("button", {
    name: "Add Digit Hold to daily circuit",
  }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("status", {
      name: "2 of 7 daily circuit games complete",
    }),
  ).toBeVisible();
});

test("a qualifying reserve session stays blue until returned to the circuit", async ({
  page,
}) => {
  await page.clock.install();
  await page.getByRole("button", {
    name: "Remove Vector Match from daily circuit",
  }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", {
    name: "Play Spatial rotation Vector Match",
  }).click();
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();

  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    const candidateIsMirrored = await page
      .locator(
        ".vector-match-candidate-panel .vector-match-shape-reflection",
      )
      .getAttribute("transform");
    await page
      .getByRole("button", {
        name: candidateIsMirrored ? "Mirror image" : "Same shape",
      })
      .click();
    await page.clock.runFor(900);
  }

  await page.getByRole("button", { name: "Return home" }).click();
  const reservedVector = page
    .getByRole("region", { name: "Available games" })
    .locator('[data-game-id="vector-match"]');
  await expect(reservedVector).not.toHaveClass(/is-complete/);

  const playedGames = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("brain-training:daily-clears:v2") ?? "null",
    ),
  );
  expect(playedGames?.games ?? []).toContain("vector-match");

  await page.getByRole("button", {
    name: "Add Vector Match to daily circuit",
  }).click();
  await expect(
    page
      .getByRole("region", { name: "Daily circuit" })
      .locator('[data-game-id="vector-match"]'),
  ).toHaveClass(/is-complete/);
  await expect(
    page.getByRole("status", {
      name: "1 of 7 daily circuit games complete",
    }),
  ).toBeVisible();
});

test("Rule Shift completes three alternating decisions and updates the daily orbit", async ({
  page,
}) => {
  await page.clock.install();
  await openOrbitGame(page, /Executive control Rule Shift/i);
  await expect(
    page.getByRole("heading", { name: "Follow the active rule" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();
  await expect(
    page.getByRole("timer", { name: "Five-second pace bonus window" }),
  ).toBeVisible();

  const rules: string[] = [];
  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    const field = page.locator(".rule-shift-field");
    await expect(field).toBeVisible();
    const rule = await field.getAttribute("data-rule");
    const answer =
      rule === "direction"
        ? await field.getAttribute("data-direction")
        : await field.getAttribute("data-position");
    expect(rule).toMatch(/direction|position/);
    expect(answer).toMatch(/left|right/);
    rules.push(rule!);

    await page.getByRole("button", {
      name: new RegExp(answer!, "i"),
      exact: false,
    }).last().click();
    await expect(
      page.getByRole("status", { name: "Round correct" }),
    ).toBeVisible();
    await page.clock.runFor(900);
  }

  expect(rules[1]).not.toBe(rules[0]);
  expect(rules[2]).toBe(rules[0]);
  await expect(
    page.getByRole("heading", { name: "Control held." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return home" }).click();

  const ruleNode = page.locator(".game-choice-rule");
  await expect(ruleNode).toHaveClass(/is-complete/);
  await expect(ruleNode.locator(".game-node-success")).toHaveText(
    /^100%\s*success$/,
  );
  await expect(ruleNode.locator(".game-node-blueprint")).toHaveCSS(
    "animation-name",
    "orbit-node-complete-shell-turn",
  );
  await expect(ruleNode.locator(".game-chip-body")).toHaveCSS(
    "fill",
    "rgb(47, 107, 87)",
  );
  await expect(ruleNode.locator(".game-chip-offset")).toHaveCSS(
    "fill",
    "rgba(70, 137, 108, 0.48)",
  );
  await page.clock.runFor(1_000);
  await expect(ruleNode.locator(".game-node-blueprint")).toHaveCSS(
    "rotate",
    "9deg",
  );
  await expect(
    page.getByRole("status", {
      name: "1 of 7 daily circuit games complete",
    }),
  ).toBeVisible();
  const playedGames = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("brain-training:daily-clears:v2") ?? "null",
    ),
  );
  expect(playedGames?.games).toContain("rule-shift");
  await expectNoHorizontalOverflow(page);
});

test("a completed game stays ungreen below the daily clearance threshold", async ({
  page,
}) => {
  await page.clock.install();
  await openOrbitGame(page, /Executive control Rule Shift/i);
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();

  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    const field = page.locator(".rule-shift-field");
    const rule = await field.getAttribute("data-rule");
    const correctAnswer =
      rule === "direction"
        ? await field.getAttribute("data-direction")
        : await field.getAttribute("data-position");
    const wrongAnswer = correctAnswer === "left" ? "right" : "left";

    await page
      .getByRole("button", {
        name: new RegExp(wrongAnswer, "i"),
        exact: false,
      })
      .last()
      .click();
    await expect(
      page.getByRole("status", { name: "Round incorrect" }),
    ).toBeVisible();
    await page.clock.runFor(900);
  }

  await page.getByRole("button", { name: "Return home" }).click();
  const ruleNode = page.locator(".game-choice-rule");
  await expect(ruleNode).not.toHaveClass(/is-complete/);
  await expect(ruleNode.locator(".game-node-session-count")).toHaveText("1");
  await expect(ruleNode.locator(".game-node-success")).toHaveText(
    /^0%\s*success$/,
  );
  await expect(
    page.getByRole("status", {
      name: "0 of 7 daily circuit games complete",
    }),
  ).toBeVisible();
});

test("the five-second pace window closes without ending an untimed choice", async ({
  page,
}) => {
  await page.clock.install();
  await openOrbitGame(page, /Executive control Rule Shift/i);
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();
  await page.clock.runFor(5_050);
  await expect(
    page.getByRole("status", {
      name: "Pace bonus window elapsed; answer remains open",
    }),
  ).toBeVisible();

  const field = page.locator(".rule-shift-field");
  const rule = await field.getAttribute("data-rule");
  const answer =
    rule === "direction"
      ? await field.getAttribute("data-direction")
      : await field.getAttribute("data-position");
  await expect(
    page
      .getByRole("button", {
        name: new RegExp(answer!, "i"),
        exact: false,
      })
      .last(),
  ).toBeEnabled();
});

test("Signal Sweep completes three exact-match decisions and updates the daily orbit", async ({
  page,
}) => {
  await page.clock.install();
  await openOrbitGame(page, /Selective attention Signal Sweep/i);
  await expect(
    page.getByRole("heading", { name: "Find the exact signal" }),
  ).toBeVisible();
  const signalCount = page.locator(".signal-sweep-count-stepper output");
  await expect(signalCount).toContainText("6");
  await expect(signalCount).toContainText("signals");
  await page.getByRole("button", { name: "Increase signals" }).click();
  await expect(signalCount).toContainText("8");
  await page.getByRole("button", { name: "Decrease signals" }).click();
  await expect(signalCount).toContainText("6");
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();
  await expect(
    page.getByRole("timer", { name: "Five-second pace bonus window" }),
  ).toBeVisible();

  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    await expect(
      page.getByRole("button", { name: /^Signal option \d+$/ }),
    ).toHaveCount(6);
    await expect(
      page.getByRole("button", { name: "Signal option 1", exact: true }),
    ).toBeVisible();
    const exactMatchIndex = await page.evaluate(() => {
      const signature = (glyph: Element | null) => {
        const rotation = glyph
          ?.querySelector("g")
          ?.getAttribute("transform");
        const body = glyph
          ?.querySelector(".signal-sweep-glyph-body")
          ?.getAttribute("d");
        const indexLine = glyph
          ?.querySelector(".signal-sweep-glyph-index-line")
          ?.getAttribute("d");
        return `${rotation}|${body}|${indexLine}`;
      };
      const cue = signature(
        document.querySelector(".signal-sweep-cue .signal-sweep-glyph"),
      );
      return [
        ...document.querySelectorAll(
          ".signal-sweep-option .signal-sweep-glyph",
        ),
      ].findIndex((option) => signature(option) === cue);
    });
    expect(exactMatchIndex).toBeGreaterThanOrEqual(0);
    await page
      .getByRole("button", {
        name: `Signal option ${exactMatchIndex + 1}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("status", { name: "Correct" }),
    ).toBeVisible();
    await page.clock.runFor(900);
  }

  await expect(
    page.getByRole("heading", { name: "Sweep complete." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return home" }).click();

  const signalNode = page.locator(".game-choice-signal");
  await expect(signalNode).toHaveClass(/is-complete/);
  await expect(signalNode.locator(".game-node-success")).toHaveText(
    /^\d+%\s*success$/,
  );
  await expect(
    page.getByRole("status", {
      name: "1 of 7 daily circuit games complete",
    }),
  ).toBeVisible();
  const playedGames = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("brain-training:daily-clears:v2") ?? "null",
    ),
  );
  expect(playedGames?.games).toContain("signal-sweep");
  await expectNoHorizontalOverflow(page);
});

test("Vector Match completes three spatial comparisons and updates the daily orbit", async ({
  page,
}) => {
  await page.clock.install();
  await openOrbitGame(page, /Spatial rotation Vector Match/i);
  await expect(
    page.getByRole("heading", { name: "Match the construction" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();
  await expect(
    page.getByRole("timer", { name: "Five-second pace bonus window" }),
  ).toBeVisible();

  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    const candidateIsMirrored = await page
      .locator(
        ".vector-match-candidate-panel .vector-match-shape-reflection",
      )
      .getAttribute("transform");
    await page
      .getByRole("button", {
        name: candidateIsMirrored ? "Mirror image" : "Same shape",
      })
      .click();
    await expect(
      page.getByRole("status", { name: "Round correct" }),
    ).toBeVisible();
    await page.clock.runFor(900);
  }

  await expect(
    page.getByRole("heading", { name: "Construction resolved." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return home" }).click();

  const vectorNode = page.locator(".game-choice-vector");
  await expect(vectorNode).toHaveClass(/is-complete/);
  await expect(vectorNode.locator(".game-node-success")).toHaveText(
    /^\d+%\s*success$/,
  );
  await expect(
    page.getByRole("status", {
      name: "1 of 7 daily circuit games complete",
    }),
  ).toBeVisible();
  const playedGames = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("brain-training:daily-clears:v2") ?? "null",
    ),
  );
  expect(playedGames?.games).toContain("vector-match");
  await expectNoHorizontalOverflow(page);
});

test("Vector Match stays blue when its completed session misses the clearance score", async ({
  page,
}) => {
  await page.clock.install();
  await openOrbitGame(page, /Spatial rotation Vector Match/i);
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();

  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    const candidateIsMirrored = await page
      .locator(
        ".vector-match-candidate-panel .vector-match-shape-reflection",
      )
      .getAttribute("transform");
    await page
      .getByRole("button", {
        name: candidateIsMirrored ? "Same shape" : "Mirror image",
      })
      .click();
    await expect(
      page.getByRole("status", { name: "Round incorrect" }),
    ).toBeVisible();
    await page.clock.runFor(900);
  }

  await page.getByRole("button", { name: "Return home" }).click();
  const vectorNode = page.locator(".game-choice-vector");
  await expect(vectorNode).not.toHaveClass(/is-complete/);
  await expect(vectorNode.locator(".game-chip-body")).not.toHaveCSS(
    "fill",
    "rgb(47, 107, 87)",
  );
  await expect(vectorNode.locator(".game-node-session-count")).toHaveText("1");
  await expect(vectorNode.locator(".game-node-success")).toHaveText(
    /^0%\s*success$/,
  );
  await expect(
    page.getByRole("status", {
      name: "0 of 7 daily circuit games complete",
    }),
  ).toBeVisible();

  const dailyClears = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("brain-training:daily-clears:v2") ?? "null",
    ),
  );
  expect(dailyClears?.games ?? []).not.toContain("vector-match");
});

test("Name Recall completes three identity associations and clears its circuit card", async ({
  page,
}) => {
  await page.clock.install();
  await openOrbitGame(page, /Associative memory Name Recall/i);
  await expect(
    page.getByRole("heading", { name: "Connect names to faces" }),
  ).toBeVisible();
  await expect(page.locator(".name-recall-setup-array img")).toHaveCount(3);
  await expect
    .poll(() =>
      page
        .locator(".name-recall-setup-array img")
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();

  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    await expect(
      page.getByRole("heading", { name: "Meet the contacts" }),
    ).toBeVisible();
    const identityNames = await page
      .locator(".name-recall-contact")
      .evaluateAll((contacts) =>
        Object.fromEntries(
          contacts.map((contact) => [
            contact
              .querySelector(".name-recall-identity")
              ?.getAttribute("data-profile-index"),
            contact.querySelector("strong")?.textContent,
          ]),
        ),
      );

    await page.clock.runFor(4_500);
    await expect(
      page.getByRole("heading", { name: "Keep the links" }),
    ).toBeVisible();
    await expect(page.locator(".name-recall-hold-hourglass")).toBeVisible();
    await page.clock.runFor(650);

    await expect(
      page.getByRole("heading", { name: "What was this name?" }),
    ).toBeVisible();
    await expect(
      page.getByRole("timer", { name: "Five-second pace bonus window" }),
    ).toBeVisible();
    const targetProfile = await page
      .locator(".name-recall-target .name-recall-identity")
      .getAttribute("data-profile-index");
    const answer = identityNames[targetProfile ?? ""];
    expect(answer).toBeTruthy();
    await page.getByRole("button", { name: answer!, exact: true }).click();
    await expect(
      page.getByRole("status", { name: "Round correct" }),
    ).toBeVisible();
    await page.clock.runFor(800);
  }

  await expect(
    page.getByRole("heading", { name: "Connections resolved." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return home" }).click();

  const nameNode = page.locator(".game-choice-name");
  await expect(nameNode).toHaveClass(/is-complete/);
  await expect(nameNode.locator(".game-chip-body")).toHaveCSS(
    "fill",
    "rgb(47, 107, 87)",
  );
  await expect(nameNode.locator(".game-node-drift")).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(nameNode.locator(".game-node-session-count")).toHaveText("1");
  await expect(nameNode.locator(".game-node-session-count")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await expect(nameNode.locator(".game-node-session-label")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await expect(nameNode.locator(".game-node-success")).toHaveText(
    /^100%\s*success$/,
  );
  const successBounds = await nameNode.evaluate((node) => {
    const card = node.getBoundingClientRect();
    const success = node
      .querySelector(".game-node-success")
      ?.getBoundingClientRect();
    return {
      cardLeft: card.left,
      cardRight: card.right,
      successLeft: success?.left ?? null,
      successRight: success?.right ?? null,
    };
  });
  expect(successBounds.successLeft).toBeGreaterThanOrEqual(
    successBounds.cardLeft,
  );
  expect(successBounds.successRight).toBeLessThanOrEqual(
    successBounds.cardRight,
  );
  await expect(
    page.getByRole("status", {
      name: "1 of 7 daily circuit games complete",
    }),
  ).toBeVisible();

  const dailyClears = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("brain-training:daily-clears:v2") ?? "null",
    ),
  );
  expect(dailyClears?.games).toContain("name-recall");
});

test("Trace Pair completes three structural matches and updates the daily orbit", async ({
  page,
}) => {
  await page.clock.install();
  await openOrbitGame(page, /Relational matching Trace Pair/i);
  await expect(
    page.getByRole("heading", { name: "Link the shared trace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();
  await expect(
    page.getByRole("timer", { name: "Five-second pace bonus window" }),
  ).toBeVisible();
  await expect(page.locator(".pace-bonus-marker")).toHaveCSS(
    "animation-duration",
    "5s",
  );
  const assemblies = page.locator(".trace-pair-assembly");
  await expect(assemblies).toHaveCount(6);
  await expect(page.locator(".trace-pair-radial")).toHaveCount(6);
  const ringGeometry = await page.locator(".trace-pair-field").evaluate(
    (field) => {
      const fieldRect = field.getBoundingClientRect();
      const points = Array.from(
        field.querySelectorAll<HTMLElement>(".trace-pair-option"),
      ).map((option) => {
        const rect = option.getBoundingClientRect();
        return {
          x: (rect.left + rect.width / 2 - fieldRect.left) / fieldRect.width,
          y: (rect.top + rect.height / 2 - fieldRect.top) / fieldRect.height,
        };
      });

      return {
        aspectRatio: fieldRect.width / fieldRect.height,
        points,
      };
    },
  );
  expect(ringGeometry.aspectRatio).toBeLessThan(1.35);
  expect(ringGeometry.points[0]!.x).toBeGreaterThan(0.45);
  expect(ringGeometry.points[0]!.x).toBeLessThan(0.55);
  expect(ringGeometry.points[0]!.y).toBeLessThan(0.2);
  expect(ringGeometry.points[3]!.x).toBeGreaterThan(0.45);
  expect(ringGeometry.points[3]!.x).toBeLessThan(0.55);
  expect(ringGeometry.points[3]!.y).toBeGreaterThan(0.8);
  await expect(assemblies.first()).toHaveCSS(
    "animation-name",
    "trace-pair-float",
  );
  await expect(assemblies.first()).toHaveCSS("animation-duration", "8.6s");
  await expect(assemblies.nth(1)).toHaveCSS("animation-duration", "9.4s");
  const drift = await assemblies.first().evaluate((assembly) => {
    const option = assembly.closest(".trace-pair-option");
    const animation = assembly.getAnimations()[0];
    if (!option || !animation) return null;

    animation.pause();
    animation.currentTime = 0;
    const assemblyStart = assembly.getBoundingClientRect();
    const optionStart = option.getBoundingClientRect();
    animation.currentTime = 4_300;
    const assemblyMidpoint = assembly.getBoundingClientRect();
    const optionMidpoint = option.getBoundingClientRect();
    animation.play();

    return {
      assemblyX: assemblyMidpoint.x - assemblyStart.x,
      assemblyY: assemblyMidpoint.y - assemblyStart.y,
      optionX: optionMidpoint.x - optionStart.x,
      optionY: optionMidpoint.y - optionStart.y,
    };
  });
  expect(drift).not.toBeNull();
  expect(Math.hypot(drift!.assemblyX, drift!.assemblyY)).toBeGreaterThan(5);
  expect(Math.hypot(drift!.optionX, drift!.optionY)).toBeLessThan(0.1);

  for (let roundIndex = 0; roundIndex < 3; roundIndex += 1) {
    const routePaths = await page
      .locator(".trace-pair-option .trace-pair-route")
      .evaluateAll((routes) => routes.map((route) => route.getAttribute("d")));
    const matchingIndices = routePaths
      .map((path, index) => ({ index, path }))
      .filter(
        ({ path }, _, entries) =>
          entries.filter((entry) => entry.path === path).length === 2,
      )
      .map(({ index }) => index);
    expect(matchingIndices).toHaveLength(2);
    await page
      .getByRole("button", {
        name: `Trace assembly ${matchingIndices[0]! + 1}`,
      })
      .click();
    await page
      .getByRole("button", {
        name: `Trace assembly ${matchingIndices[1]! + 1}`,
      })
      .click();
    await expect(page.locator(".trace-pair-inline-feedback")).toBeVisible();
    await expect(
      page.locator(".trace-pair-radial.is-correct"),
    ).toHaveCount(2);
    await expect(
      page.getByRole("status", { name: "Pace bonus earned" }),
    ).toBeVisible();
    await page.clock.runFor(900);
  }

  await expect(
    page.getByRole("heading", { name: "Links resolved." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Return home" }).click();

  const traceNode = page.locator(".game-choice-trace");
  await expect(traceNode).toHaveClass(/is-complete/);
  await expect(traceNode.locator(".game-node-success")).toHaveText(
    /^100%\s*success$/,
  );
  await expect(
    traceNode.locator(".game-node-session-count"),
  ).toHaveText("1");
  await expect(
    page.getByRole("status", {
      name: "1 of 7 daily circuit games complete",
    }),
  ).toBeVisible();
  const playedGames = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("brain-training:daily-clears:v2") ?? "null",
    ),
  );
  expect(playedGames?.games).toContain("trace-pair");
  const tracePerformance = await page.evaluate(() => {
    const stored = JSON.parse(
      localStorage.getItem("brain-training:game-performance:v1") ?? "{}",
    ) as Record<string, { accuracyTotal?: number; sessions?: number }>;
    return stored["trace-pair"];
  });
  expect(tracePerformance?.sessions).toBe(1);
  expect(tracePerformance?.accuracyTotal).toBeGreaterThanOrEqual(0);
  expect(tracePerformance?.accuracyTotal).toBeLessThanOrEqual(1);
  await page.reload();
  await expect(
    page.locator(
      '[data-game-id="trace-pair"] .game-node-session-count',
    ),
  ).toHaveText("1");
  await expectNoHorizontalOverflow(page);
});

test("the daily circuit reports completion when all seven games are stored", async ({
  page,
}) => {
  await page.evaluate(() => {
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0",
    )}-${String(now.getDate()).padStart(2, "0")}`;
    localStorage.setItem(
      "brain-training:daily-clears:v2",
      JSON.stringify({
        date,
        games: [
          "pulse-path",
          "number-memory",
          "rule-shift",
          "signal-sweep",
          "vector-match",
          "trace-pair",
          "name-recall",
        ],
      }),
    );
  });
  await page.reload();

  await expect(
    page.getByRole("status", {
      name: "7 of 7 daily circuit games complete",
    }),
  ).toBeAttached();
  await expect(page.locator(".daily-circuit-core")).toHaveClass(/is-complete/);
  await expect(page.locator(".daily-circuit-core strong")).toHaveText(
    "Initiate",
  );
  await expect(
    page.locator(".daily-circuit-initiate-label"),
  ).toHaveText("Circuit");
  await expect(page.locator(".daily-circuit-core")).not.toContainText("7/7");
  await expect(page.locator(".orbit-game-selector .game-choice.is-complete")).toHaveCount(7);
});

test("pulse path distinguishes an exact path from an incorrect one", async ({
  page,
}) => {
  await page.clock.install();
  await startPulsePath(page);

  const sessionIdentity = await page.evaluate(() => {
    const stored = localStorage.getItem("brain-training:pulse-path:v2");
    if (!stored) return null;
    const parsed = JSON.parse(stored) as {
      activeSession?: { currentLevel?: number; seed?: string } | null;
    };
    return parsed.activeSession
      ? {
          level: parsed.activeSession.currentLevel,
          seed: parsed.activeSession.seed,
        }
      : null;
  });
  expect(sessionIdentity?.seed).toBeTruthy();
  expect(sessionIdentity?.level).toBe(3);
  const recalledTiles = generateSequence(
    sessionIdentity!.seed!,
    0,
    sessionIdentity!.level!,
  );
  const resolvedSlots = await page
    .locator(".path-tile")
    .evaluateAll((tiles, recalled) => {
      return [
        ...new Set(
          (recalled as number[]).map((tileIndex) => {
            const slotClass = [...tiles[tileIndex]!.classList].find((name) =>
              name.startsWith("slot-"),
            );
            return Number(slotClass?.replace("slot-", ""));
          }),
        ),
      ].filter((slot) => Number.isInteger(slot) && slot >= 0 && slot < 8);
    }, recalledTiles);

  await expect(page.locator(".path-tile.is-active")).toHaveCount(0);
  expect(PULSE_PATH_INITIAL_LEAD_IN_MS).toBe(1_450);
  await page.clock.runFor(PULSE_PATH_INITIAL_LEAD_IN_MS - 1);
  await expect(page.locator(".path-tile.is-active")).toHaveCount(0);
  await page.clock.runFor(1);
  await expect(page.locator(".path-tile.is-active")).toHaveCount(1);
  await page.clock.runFor(
    getPulsePathPresentationDuration(sessionIdentity!.level!) -
      PULSE_PATH_INITIAL_LEAD_IN_MS +
      100,
  );
  await expect(page.getByText("Your turn", { exact: true })).toBeVisible();
  for (const tile of recalledTiles) {
    await page.locator(".path-tile").nth(tile).click({ force: true });
  }

  const confirmation = page.getByRole("status", { name: "Round correct" });
  await expect(confirmation).toBeVisible();
  await expect(confirmation).toHaveClass(/is-exact/);
  await expect(confirmation.locator("span")).toHaveText("\u2713");
  await expect(page.locator(".network-resolution line")).toHaveCount(
    resolvedSlots.length,
  );
  await expect(page.locator(".network-resolution line").first()).toHaveCSS(
    "animation-name",
    "pulse-path-radial-confirm",
  );
  await expect(
    page.getByRole("heading", { name: "Correct" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", {
      name: /Today's practice charge: (5|6) out of 100\. 0 of 7 circuit games complete; 1 of 21 planned rounds\./,
    }),
  ).toBeVisible();
  await expect(page.locator(".practice-charge")).toHaveAttribute(
    "title",
    /7 games on circuit; 0 complete\. 0 circuit \+ 1 reps \+ 3 accuracy \+ (1|2) pace\. Resets daily\./,
  );
  const practiceCharge = await page.evaluate(() => {
    const saved = localStorage.getItem("brain-training:practice-charge:v2");
    return saved ? JSON.parse(saved) : null;
  });
  expect(practiceCharge).toMatchObject({
    accuracyReps: 1,
    accuracyTotal: 1,
    earnedBadges: [],
    paceReps: 1,
    recallAccuracyReps: 1,
    recallAccuracyTotal: 1,
    reps: 1,
    lastAward: {
      repetition: 8,
      accuracy: 8,
    },
  });
  expect([3, 4]).toContain(practiceCharge.lastAward.pace);
  expect(practiceCharge.lastAward.total).toBe(
    16 + practiceCharge.lastAward.pace,
  );
  expect(practiceCharge.paceMsPerItemTotal).toBeGreaterThan(0);
  expect([5, 6]).toContain(practiceCharge.value);
});

test("pulse path forms drift from fixed radial anchors", async ({ page }) => {
  await startPulsePath(page);

  const firstShape = page.locator(".tethered-shape-drift").first();
  const firstSurface = page.locator(".target-shape").first();
  await expect(page.locator(".network-anchor")).toHaveCount(9);
  const material = await firstSurface.evaluate((shape) => ({
    afterDisplay: getComputedStyle(shape, "::after").display,
    backgroundImage: getComputedStyle(shape).backgroundImage,
    beforeDisplay: getComputedStyle(shape, "::before").display,
  }));
  expect(material).toEqual({
    afterDisplay: "none",
    backgroundImage: "none",
    beforeDisplay: "none",
  });
  await expect(page.locator(".blueprint-shape")).toHaveCount(9);
  await expect(page.locator(".blueprint-body")).toHaveCount(9);
  await expect(page.locator(".blueprint-offset")).toHaveCount(9);
  await expect(page.locator(".blueprint-brace")).toHaveCount(9);
  await expect(page.locator(".blueprint-guide")).toHaveCount(9);
  const blueprintGeometry = await page
    .locator(".blueprint-shape")
    .evaluateAll((shapes) => ({
      dashPatterns: [
        getComputedStyle(shapes[0]!.querySelector(".blueprint-offset")!)
          .strokeDasharray,
        getComputedStyle(shapes[0]!.querySelector(".blueprint-brace")!)
          .strokeDasharray,
        getComputedStyle(shapes[0]!.querySelector(".blueprint-guide")!)
          .strokeDasharray,
      ],
      outlines: shapes.map(
        (shape) =>
          shape.querySelector(".blueprint-body")?.getAttribute("points") ?? "",
      ),
    }));
  expect(new Set(blueprintGeometry.dashPatterns).size).toBe(3);
  expect(new Set(blueprintGeometry.outlines).size).toBe(9);
  const positionBefore = await firstShape.evaluate(
    (rock) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(rock).transform);
      return { x: matrix.m41, y: matrix.m42 };
    },
  );
  await page.waitForTimeout(900);
  const positionAfter = await firstShape.evaluate(
    (rock) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(rock).transform);
      return { x: matrix.m41, y: matrix.m42 };
    },
  );
  expect(
    Math.hypot(
      positionAfter.x - positionBefore.x,
      positionAfter.y - positionBefore.y,
    ),
  ).toBeGreaterThan(2);
});

test("a completed fixed-length session is durable and setup defaults to three", async ({
  page,
}) => {
  await page.clock.install();
  await startPulsePath(page, 5);

  for (let round = 1; round <= 3; round += 1) {
    await expect(page.getByText("Watch the path", { exact: true })).toBeVisible();
    await page.clock.runFor(8_000);
    await expect(page.getByText("Your turn", { exact: true })).toBeVisible();
    await finishRoundWithGuaranteedMiss(page);

    await page.clock.runFor(1_000);
  }

  const savedResult = await page.evaluate(() => {
    const stored = localStorage.getItem("brain-training:pulse-path:v2");
    if (!stored) return null;
    const parsed = JSON.parse(stored) as {
      activeSession?: unknown;
      completedSummaries?: Array<{ endingLevel?: number }>;
    };
    return {
      activeSession: parsed.activeSession,
      endingLevel: parsed.completedSummaries?.[0]?.endingLevel,
      summaries: parsed.completedSummaries?.length,
    };
  });
  expect(savedResult).toEqual({
    activeSession: null,
    endingLevel: 5,
    summaries: 1,
  });

  await expect(page.getByRole("heading", { name: "Nice focus." })).toBeVisible();
  await page.getByRole("button", { name: "Return home" }).click();
  await page.reload();
  await expect(page.getByText("Last Pulse Path session")).toBeVisible();
  await openOrbitGame(page, /Spatial memory Pulse Path/i);
  await expect(
    page.getByRole("heading", { name: "Choose your path length" }),
  ).toBeVisible();
  await expect(page.locator(".digit-span-stepper output strong")).toHaveText(
    "3",
  );
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();

  const nextSession = await page.evaluate(() => {
    const stored = localStorage.getItem("brain-training:pulse-path:v2");
    if (!stored) return null;
    const parsed = JSON.parse(stored) as {
      activeSession?: { adaptive?: boolean; startingLevel?: number } | null;
    };
    return parsed.activeSession
      ? {
          adaptive: parsed.activeSession.adaptive,
          startingLevel: parsed.activeSession.startingLevel,
        }
      : null;
  });
  expect(nextSession).toEqual({ adaptive: false, startingLevel: 3 });
});

test("the constellation stays stable within a round and fully remaps between rounds", async ({
  page,
}) => {
  await page.clock.install();
  await startPulsePath(page);

  const roundSignatures: Awaited<
    ReturnType<typeof constellationSignature>
  >[] = [];
  for (let round = 1; round <= 3; round += 1) {
    await expect(page.getByText("Watch the path", { exact: true })).toBeVisible();
    const watchSignature = await constellationSignature(page);
    roundSignatures.push(watchSignature);

    await page.clock.runFor(7_000);
    await expect(page.getByText("Your turn", { exact: true })).toBeVisible();
    expect(await constellationSignature(page)).toEqual(watchSignature);

    await finishRoundWithGuaranteedMiss(page);
    expect(await constellationSignature(page)).toEqual(watchSignature);

    await page.clock.runFor(1_000);
    if (round < 3) {
      const nextRoundSignature = await constellationSignature(page);
      expect(nextRoundSignature.layout).not.toBe(watchSignature.layout);
      expect(nextRoundSignature.silhouettes).not.toEqual(
        watchSignature.silhouettes,
      );
      expect(nextRoundSignature.shapeToSlot).not.toEqual(
        watchSignature.shapeToSlot,
      );
    }
  }

  await expect(page.getByRole("heading", { name: "Nice focus." })).toBeVisible();
  await page.getByRole("button", { name: /Train again/i }).click();
  expect(await constellationSignature(page)).not.toEqual(roundSignatures[0]);
});

test("number memory completes three rounds at the selected digit span", async ({
  page,
}) => {
  await page.clock.install();
  await openOrbitGame(page, /Number memory Digit Hold/i);

  await expect(
    page.getByRole("heading", { name: "Choose your span" }),
  ).toBeVisible();
  const selectedSpan = page.locator(".digit-span-stepper output strong");
  await expect(selectedSpan).toHaveText("5");
  await page.getByRole("button", { name: "Decrease digit span" }).click();
  await expect(selectedSpan).toHaveText("4");
  await page.getByRole("button", { name: "Increase digit span" }).click();
  await page.getByRole("button", { name: "Increase digit span" }).click();
  await expect(selectedSpan).toHaveText("6");
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();

  for (let round = 1; round <= 3; round += 1) {
    const length = 6;
    await expect(page.getByText("Hold this number", { exact: true })).toBeVisible();
    await expect(
      page.getByText(`${length} digits`, { exact: true }),
    ).toBeVisible();
    const number = page.locator(".memory-number");
    await expect(number).toHaveText(new RegExp(`^\\d{${length}}$`));
    const value = (await number.innerText()).trim();

    await expect(page.getByRole("timer")).toBeVisible();
    if (round === 1) {
      await page.clock.runFor(500);
      await expect(number).toBeVisible();
      await page.clock.runFor(800);
      await expect(number).toHaveCount(0);
      await expect(
        page.getByRole("status", {
          name: "Number hidden. Hold it in memory.",
        }),
      ).toBeVisible();
      await expect(
        page.getByLabel("Enter the digits in the same order"),
      ).toHaveCount(0);
      await page.clock.runFor(500);
    } else {
      await page.clock.runFor(1_800);
    }

    const input = page.getByLabel("Enter the digits in the same order");
    await expect(input).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Check recall" }),
    ).toHaveCount(0);
    if (round === 1) {
      await input.fill(value.slice(0, -1));
      await expect(
        page.getByRole("heading", { name: "What was the number?" }),
      ).toBeVisible();
      await input.pressSequentially(value.slice(-1));
    } else {
      await input.fill(value);
    }
    await expect(page.getByRole("status", { name: "Correct" })).toBeVisible();
    await expect(
      page.locator(".number-round-confirmation span"),
    ).toHaveText("✓");
    await expect(
      page.getByRole("heading", { name: "Correct" }),
    ).toBeVisible();
    await page.clock.runFor(800);
  }

  await expect(
    page.getByRole("heading", { name: "Digits held." }),
  ).toBeVisible();
  await expect(page.getByText(/Three rounds at 6 digits/)).toBeVisible();
  await expect(page.getByText("3/3")).toBeVisible();
  await expect(
    page.getByRole("status", {
      name: /Today's practice charge: (24|25) out of 100\. 1 of 7 circuit games complete; 3 of 21 planned rounds\./,
    }),
  ).toBeVisible();
  await expect(page.locator(".practice-charge-reps")).toHaveText(
    "7 games · 3/21 rounds",
  );
  await expectNoHorizontalOverflow(page);
});

test("Digit Hold primes and retains numeric input focus on a phone", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "Soft-keyboard focus is a phone-web behavior.",
  );
  await page.clock.install();
  await openOrbitGame(page, /Number memory Digit Hold/i);
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();

  await expect(page.getByLabel("Digit keypad ready")).toBeFocused();
  await page.clock.runFor(1_800);
  await expect(
    page.getByLabel("Enter the digits in the same order"),
  ).toBeFocused();
});

test("enabling sound produces an audible game cue", async ({ page }) => {
  await page.addInitScript(() => {
    const audioContext =
      window.AudioContext ??
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;
    if (!audioContext) return;

    (
      window as typeof window & {
        __edgeCircuitOscillatorStarts?: number;
      }
    ).__edgeCircuitOscillatorStarts = 0;
    const originalCreateOscillator =
      audioContext.prototype.createOscillator;
    audioContext.prototype.createOscillator = function createOscillator() {
      const oscillator = originalCreateOscillator.call(this);
      const originalStart = oscillator.start.bind(oscillator);
      oscillator.start = (...args: Parameters<OscillatorNode["start"]>) => {
        (
          window as typeof window & {
            __edgeCircuitOscillatorStarts?: number;
          }
        ).__edgeCircuitOscillatorStarts =
          ((
            window as typeof window & {
              __edgeCircuitOscillatorStarts?: number;
            }
          ).__edgeCircuitOscillatorStarts ?? 0) + 1;
        return originalStart(...args);
      };
      return oscillator;
    };
  });
  await page.reload();

  const sound = page.getByRole("button", { name: "Sound" });
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await sound.click();
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __edgeCircuitOscillatorStarts?: number;
            }
          ).__edgeCircuitOscillatorStarts ?? 0,
      ),
    )
    .toBeGreaterThan(0);
});

test("number memory shows an inline miss without replacing recall", async ({
  page,
}) => {
  await page.clock.install();
  await openOrbitGame(page, /Number memory Digit Hold/i);
  await page.getByRole("button", { name: /Start 3 rounds/i }).click();

  const number = page.locator(".memory-number");
  await expect(number).toHaveText(/^\d{5}$/);
  const value = (await number.innerText()).trim();
  const replacement = value[0] === "9" ? "8" : "9";
  const wrongValue = `${replacement}${value.slice(1)}`;

  await page.clock.runFor(1_800);
  const input = page.getByLabel("Enter the digits in the same order");
  await input.fill(wrongValue);

  await expect(
    page.getByRole("status", { name: "Not quite" }),
  ).toBeVisible();
  await expect(page.locator(".inline-feedback-mark")).toHaveText("×");
  await expect(input).toHaveValue(wrongValue);
  await expect(
    page.getByRole("heading", { name: "Not quite" }),
  ).toBeVisible();
});
