/**
 * QA Deck — Action Converter
 *
 * Converts raw recorded actions into:
 *  1. Human-readable test steps  (for the test case editor)
 *  2. Selenium Python code
 *  3. Selenium Java code
 *  4. Playwright Python code
 *  5. Playwright TypeScript code
 */

// ─── Human-readable steps ─────────────────────────────────────────────────────

function actionsToSteps(actions) {
  const steps = [];
  let stepNum = 1;

  for (const action of actions) {
    const step = actionToStep(action, stepNum);
    if (step) {
      steps.push({ num: stepNum++, text: step, action });
    }
  }

  return steps;
}

function actionToStep(action, num) {
  switch (action.type) {
    case "navigate":
      return `Navigate to ${action.url}`;
    case "click":
      return `Click ${describeElement(action)}`;
    case "fill":
      return `Enter "${action.value}" in ${describeField(action, "field")}`;
    case "select":
      return `Select "${action.optionText || action.value}" from ${describeField(action, "dropdown")}`;
    case "check":
      return `${action.checked ? "Check" : "Uncheck"} ${describeField(action, "checkbox")}`;
    case "radio":
      return `Select "${action.label || action.value}" radio option`;
    case "press":
      return `Press ${action.key} key${action.context ? ` (${action.context})` : ""}`;
    case "hover":
      return `Hover over ${describeElement(action)}`;
    case "upload":
      return `Upload a file using ${describeField(action, "upload input")}`;
    case "submit":
      return getActionLocator(action) ? `Submit ${describeField(action, "form")}` : `Submit the form`;
    case "dialog":
      return `Handle ${action.dialogType} dialog: "${action.message?.slice(0, 60) || ""}"`;
    default:
      return null;
  }
}

function describeElement(action) {
  if (action.text) return `"${action.text}"`;
  if (action.label) return `the ${action.label} ${action.tag || "element"}`;
  if (action.name) return `the ${action.name} ${action.tag || "element"}`;
  const locator = getActionLocator(action);
  return locator ? `element (${locator})` : (action.tag || "element");
}

function describeField(action, kind) {
  if (action.label) return `the ${action.label} ${kind}`;
  if (action.name) return `the ${action.name} ${kind}`;
  if (action.placeholder) return `the "${action.placeholder}" ${kind}`;
  const locator = getActionLocator(action);
  return locator ? `the ${kind} (${locator})` : `the ${kind}`;
}

function getActionLocator(action) {
  return action?.locator || action?.selector || "";
}

// ─── Code generators ──────────────────────────────────────────────────────────

function actionsToCode(actions, framework, pageClassName = "RecordedPage") {
  const generators = {
    "selenium-python":     seleniumPython,
    "selenium-java":       seleniumJava,
    "playwright-python":   playwrightPython,
    "playwright-typescript": playwrightTypeScript,
  };
  const gen = generators[framework] || generators["selenium-python"];
  return gen(actions, pageClassName);
}

// ── Selenium Python ───────────────────────────────────────────────────────────

function seleniumPython(actions, className) {
  const pageType = inferPageType(actions);
  const lines = [];

  lines.push(`from selenium.webdriver.common.by import By`);
  lines.push(`from selenium.webdriver.support.ui import WebDriverWait, Select`);
  lines.push(`from selenium.webdriver.support import expected_conditions as EC`);
  lines.push(`from selenium.webdriver.common.keys import Keys`);
  lines.push(``);
  lines.push(`# ── Page Object ──────────────────────────────────────────────`);
  lines.push(`class ${className}:`);
  lines.push(``);

  // Collect unique locators
  const locators = extractLocators(actions);
  locators.forEach(({ name, strategy, value }) => {
    lines.push(`    ${name.toUpperCase()} = (By.${strategy}, "${value}")`);
  });
  lines.push(``);
  lines.push(`    def __init__(self, driver):`);
  lines.push(`        self.driver = driver`);
  lines.push(`        self.wait = WebDriverWait(driver, 10)`);
  lines.push(``);

  // Action methods
  const methods = buildSeleniumPythonMethods(actions, locators);
  methods.forEach(m => lines.push(...m.split("\n").map(l => "    " + l)));
  lines.push(``);

  // Test method
  lines.push(`# ── Recorded test ────────────────────────────────────────────`);
  lines.push(`def test_recorded_flow(driver):`);
  lines.push(`    """Auto-generated from recorded session"""`)
  lines.push(`    page = ${className}(driver)`);
  lines.push(``);

  actions.forEach((action, i) => {
    const code = actionToSeleniumPython(action, locators);
    if (code) {
      lines.push(`    # Step ${i + 1}: ${actionToStep(action, i + 1) || action.type}`);
      lines.push(`    ${code}`);
    }
  });

  return lines.join("\n");
}

function buildSeleniumPythonMethods(actions, locators) {
  const methods = [];
  const fills = actions.filter(a => a.type === "fill");
  const clicks = actions.filter(a => a.type === "click");

  if (fills.length > 0 || clicks.some(c => c.locator?.includes("submit") || c.text?.toLowerCase().includes("submit") || c.text?.toLowerCase().includes("login") || c.text?.toLowerCase().includes("save"))) {
    const params = fills.map(f => {
      const name = locatorToVarName(getActionLocator(f));
      return `${name}="${f.value}"`;
    }).join(", ");

    methods.push(`def perform_actions(self, ${params || "**kwargs"}):\n    """Execute the recorded user flow"""\n${fills.map(f => {
      const name = locatorToVarName(getActionLocator(f));
      const upper = name.toUpperCase();
      return `    el = self.wait.until(EC.element_to_be_clickable(self.${upper}))\n    el.clear()\n    el.send_keys(${name})`;
    }).join("\n")}`);
  }

  return methods;
}

function actionToSeleniumPython(action, locators) {
  const locator = getActionLocator(action);
  const locInfo = findLocatorInfo(locator, locators);
  const locRef = locInfo ? `self.${locInfo.name.toUpperCase()}` : `(By.CSS_SELECTOR, "${locator}")`;

  switch (action.type) {
    case "navigate":
      return `driver.get("${action.url}")`;
    case "click":
      return `page.wait.until(EC.element_to_be_clickable(${locRef})).click()`;
    case "fill":
      return `el = page.wait.until(EC.presence_of_element_located(${locRef}))\nel.clear()\nel.send_keys("${escStr(action.value)}")`;
    case "select":
      return `Select(driver.find_element(*${locRef})).select_by_visible_text("${escStr(action.optionText || action.value)}")`;
    case "check":
      return `cb = driver.find_element(*${locRef})\nif cb.is_selected() != ${action.checked}: cb.click()`;
    case "press":
      return `driver.switch_to.active_element.send_keys(Keys.${action.key.toUpperCase()})`;
    case "submit":
      return `driver.find_element(*${locRef}).submit()`;
    case "hover":
      return `ActionChains(driver).move_to_element(driver.find_element(*${locRef})).perform()`;
    default:
      return null;
  }
}

// ── Selenium Java ─────────────────────────────────────────────────────────────

function seleniumJava(actions, className) {
  const lines = [];
  lines.push(`import org.openqa.selenium.*;`);
  lines.push(`import org.openqa.selenium.support.ui.*;`);
  lines.push(`import org.openqa.selenium.interactions.Actions;`);
  lines.push(`import java.time.Duration;`);
  lines.push(``);
  lines.push(`public class ${className} {`);
  lines.push(``);

  const locators = extractLocators(actions);
  locators.forEach(({ name, strategy, value }) => {
    lines.push(`    private final By ${camelCase(name)} = By.${javaStrategy(strategy)}("${value}");`);
  });

  lines.push(``);
  lines.push(`    private final WebDriver driver;`);
  lines.push(`    private final WebDriverWait wait;`);
  lines.push(``);
  lines.push(`    public ${className}(WebDriver driver) {`);
  lines.push(`        this.driver = driver;`);
  lines.push(`        this.wait = new WebDriverWait(driver, Duration.ofSeconds(10));`);
  lines.push(`    }`);
  lines.push(``);
  lines.push(`    /** Auto-generated from recorded session */`);
  lines.push(`    public void performRecordedFlow() {`);

  actions.forEach((action, i) => {
    const code = actionToSeleniumJava(action, locators);
    if (code) {
      lines.push(`        // Step ${i + 1}: ${actionToStep(action, i + 1) || action.type}`);
      lines.push(`        ${code}`);
    }
  });

  lines.push(`    }`);
  lines.push(`}`);

  return lines.join("\n");
}

function actionToSeleniumJava(action, locators) {
  const locator = getActionLocator(action);
  const locInfo = findLocatorInfo(locator, locators);
  const locRef = locInfo ? camelCase(locInfo.name) : `By.cssSelector("${locator}")`;

  switch (action.type) {
    case "navigate": return `driver.get("${action.url}");`;
    case "click": return `wait.until(ExpectedConditions.elementToBeClickable(${locRef})).click();`;
    case "fill": return `WebElement el${sanitize(locator)} = wait.until(ExpectedConditions.presenceOfElementLocated(${locRef}));\nel${sanitize(locator)}.clear();\nel${sanitize(locator)}.sendKeys("${escStr(action.value)}");`;
    case "select": return `new Select(driver.findElement(${locRef})).selectByVisibleText("${escStr(action.optionText || action.value)}");`;
    case "press": return `driver.switchTo().activeElement().sendKeys(Keys.${action.key.toUpperCase()});`;
    case "submit": return `driver.findElement(${locRef}).submit();`;
    default: return null;
  }
}

// ── Playwright Python ─────────────────────────────────────────────────────────

function playwrightPython(actions, className) {
  const lines = [];
  lines.push(`from playwright.sync_api import Page, expect`);
  lines.push(``);
  lines.push(`class ${className}:`);
  lines.push(`    def __init__(self, page: Page):`);
  lines.push(`        self.page = page`);
  lines.push(``);

  const locators = extractLocators(actions);
  locators.forEach(({ name, locator }) => {
    lines.push(`    @property`);
    lines.push(`    def ${name}(self):`);
    lines.push(`        return self.page.locator('${locator}')`);
    lines.push(``);
  });

  lines.push(`    def perform_recorded_flow(self):`);
  lines.push(`        """Auto-generated from recorded session"""`);

  actions.forEach((action, i) => {
    const code = actionToPlaywrightPython(action);
    if (code) {
      lines.push(`        # Step ${i + 1}: ${actionToStep(action, i + 1) || action.type}`);
      code.split("\n").forEach(l => lines.push(`        ${l}`));
    }
  });

  lines.push(``);
  lines.push(`# ── Test ──────────────────────────────────────────────────────`);
  lines.push(`def test_recorded_flow(page: Page):`);
  lines.push(`    """Auto-generated test from recording"""`)
  lines.push(`    po = ${className}(page)`);
  lines.push(`    po.perform_recorded_flow()`);

  return lines.join("\n");
}

function actionToPlaywrightPython(action) {
  const loc = pwLocator(getActionLocator(action));
  switch (action.type) {
    case "navigate": return `self.page.goto("${action.url}")`;
    case "click": return `self.page.${loc}.click()`;
    case "fill": return `self.page.${loc}.fill("${escStr(action.value)}")`;
    case "select": return `self.page.${loc}.select_option("${escStr(action.value)}")`;
    case "check": return `self.page.${loc}.${action.checked ? "check" : "uncheck"}()`;
    case "press": return `self.page.keyboard.press("${action.key}")`;
    case "hover": return `self.page.${loc}.hover()`;
    case "upload": return `self.page.${loc}.set_input_files("path/to/file")  # TODO: specify file`;
    case "submit": return `self.page.${loc}.press("Enter")`;
    default: return null;
  }
}

// ── Playwright TypeScript ─────────────────────────────────────────────────────

function playwrightTypeScript(actions, className) {
  const lines = [];
  lines.push(`import { Page, Locator, expect } from '@playwright/test';`);
  lines.push(``);
  lines.push(`export class ${className} {`);
  lines.push(`  private page: Page;`);
  lines.push(``);

  const locators = extractLocators(actions);
  locators.forEach(({ name, locator }) => {
    lines.push(`  readonly ${camelCase(name)}: Locator;`);
  });

  lines.push(``);
  lines.push(`  constructor(page: Page) {`);
  lines.push(`    this.page = page;`);
  locators.forEach(({ name, locator }) => {
    lines.push(`    this.${camelCase(name)} = page.locator('${locator}');`);
  });
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  /** Auto-generated from recorded session */`);
  lines.push(`  async performRecordedFlow(): Promise<void> {`);

  actions.forEach((action, i) => {
    const code = actionToPlaywrightTS(action, locators);
    if (code) {
      lines.push(`    // Step ${i + 1}: ${actionToStep(action, i + 1) || action.type}`);
      lines.push(`    ${code}`);
    }
  });

  lines.push(`  }`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`// ── Test ──────────────────────────────────────────────────────`);
  lines.push(`import { test } from '@playwright/test';`);
  lines.push(``);
  lines.push(`test('recorded flow', async ({ page }) => {`);
  lines.push(`  const po = new ${className}(page);`);
  lines.push(`  await po.performRecordedFlow();`);
  lines.push(`});`);

  return lines.join("\n");
}

function actionToPlaywrightTS(action, locators) {
  const locator = getActionLocator(action);
  const locInfo = findLocatorInfo(locator, locators);
  const locRef = locInfo ? `this.${camelCase(locInfo.name)}` : `this.page.locator('${locator}')`;

  switch (action.type) {
    case "navigate": return `await this.page.goto('${action.url}');`;
    case "click": return `await ${locRef}.click();`;
    case "fill": return `await ${locRef}.fill('${escStr(action.value)}');`;
    case "select": return `await ${locRef}.selectOption('${escStr(action.value)}');`;
    case "check": return `await ${locRef}.${action.checked ? "check" : "uncheck"}();`;
    case "press": return `await this.page.keyboard.press('${action.key}');`;
    case "hover": return `await ${locRef}.hover();`;
    case "upload": return `await ${locRef}.setInputFiles('path/to/file'); // TODO: specify file`;
    case "submit": return `await ${locRef}.press('Enter');`;
    default: return null;
  }
}

// ─── Locator helpers ──────────────────────────────────────────────────────────

function extractLocators(actions) {
  const seen = new Map();
  const locators = [];

  for (const action of actions) {
    const locator = getActionLocator(action);
    if (!locator || action.type === "navigate" || action.type === "press" || action.type === "dialog") continue;
    if (seen.has(locator)) continue;
    seen.set(locator, true);

    const name = locatorToVarName(locator);
    const { strategy, value } = parseLocatorForSelenium(locator);

    locators.push({ name, locator, strategy, value });
  }

  return locators;
}

function locatorToVarName(locator) {
  if (!locator) return "element";
  return locator
    .replace(/[#\[\]"'=.*:()>+~@-]/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .replace(/^(\d)/, "_$1")
    .toLowerCase()
    .slice(0, 40) || "element";
}

function parseLocatorForSelenium(locator) {
  if (!locator) return { strategy: "CSS_SELECTOR", value: "*" };
  if (locator.startsWith("#")) return { strategy: "ID", value: locator.slice(1) };
  if (locator.startsWith("[name=")) {
    const m = locator.match(/\[name="?([^"\]]+)"?\]/);
    return { strategy: "NAME", value: m?.[1] || locator };
  }
  if (locator.startsWith("[data-testid=")) {
    const m = locator.match(/\[data-testid="?([^"\]]+)"?\]/);
    return { strategy: "CSS_SELECTOR", value: `[data-testid="${m?.[1] || ""}"]` };
  }
  if (locator.includes(":has-text(")) {
    const m = locator.match(/:has-text\("([^"]+)"\)/);
    if (m) return { strategy: "XPATH", value: `//*[contains(text(), '${m[1]}')]` };
  }
  if (locator.startsWith("[aria-label=")) {
    return { strategy: "XPATH", value: `//*[@aria-label="${locator.match(/\[aria-label="([^"]+)"/)?.[1] || ""}"]` };
  }
  return { strategy: "CSS_SELECTOR", value: locator };
}

function pwLocator(locator) {
  if (!locator) return `locator("*")`;
  if (locator.startsWith("#")) return `locator("${locator}")`;
  if (locator.includes(":has-text(")) return `locator("${locator}")`;
  if (locator.startsWith("[aria-label=")) {
    const m = locator.match(/\[aria-label="([^"]+)"/);
    return m ? `get_by_label("${m[1]}")` : `locator("${locator}")`;
  }
  return `locator("${locator}")`;
}

function findLocatorInfo(locator, locators) {
  return locators.find(l => l.locator === locator) || null;
}

function javaStrategy(strategy) {
  const map = { ID: "id", NAME: "name", CSS_SELECTOR: "cssSelector", XPATH: "xpath" };
  return map[strategy] || "cssSelector";
}

function inferPageType(actions) {
  const urls = actions.filter(a => a.type === "navigate").map(a => a.url || "");
  const combined = urls.join(" ").toLowerCase();
  if (/login|signin/.test(combined)) return "login";
  if (/checkout|payment/.test(combined)) return "checkout";
  if (/register|signup/.test(combined)) return "registration";
  if (/search|results/.test(combined)) return "search";
  if (/dashboard/.test(combined)) return "dashboard";
  if (/refund|return/.test(combined)) return "refund";
  if (/admin|manage/.test(combined)) return "admin";
  return "page";
}

function actionsToJourneySegments(actions = []) {
  const segments = [];
  let current = null;

  for (const action of actions || []) {
    if (action.type === "navigate") {
      if (current?.actions?.length) segments.push(finalizeJourneySegment(current, segments.length));
      current = {
        url: action.url || "about:blank",
        actions: [action],
      };
      continue;
    }

    if (!current) {
      current = {
        url: action.url || "about:blank",
        actions: [],
      };
    }

    current.actions.push(action);
  }

  if (current?.actions?.length) segments.push(finalizeJourneySegment(current, segments.length));
  return segments;
}

function finalizeJourneySegment(segment, index) {
  const url = segment.url || segment.actions.find((action) => action.type === "navigate")?.url || "about:blank";
  const path = getPathFromUrl(url);
  const recordedSteps = actionsToSteps(segment.actions).map((step) => step.text);
  const pageType = inferPageType([{ type: "navigate", url }, ...segment.actions]);

  return {
    id: `segment_${index + 1}`,
    order: index + 1,
    title: buildJourneySegmentTitle(url, path, index + 1),
    url,
    path,
    pageType,
    source: "recording",
    actions: segment.actions,
    recordedSteps,
    transitionStatus: index === 0 ? "start" : "recorded",
  };
}

function buildJourneySegmentTitle(url, path, order) {
  const cleanPath = (path || "").replace(/\/+$/, "");
  const lastPart = cleanPath.split("/").filter(Boolean).pop();
  if (lastPart) {
    return lastPart
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  try {
    return new URL(url).hostname;
  } catch (_) {
    return `Step ${order}`;
  }
}

function getPathFromUrl(url) {
  try {
    return new URL(url).pathname || "/";
  } catch (_) {
    return "/";
  }
}

function camelCase(str) {
  return str.replace(/_([a-z])/g, (_, l) => l.toUpperCase());
}

function sanitize(str) {
  return str.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "El";
}

function escStr(s) {
  return (s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "\\'");
}

module.exports = { actionsToSteps, actionsToCode, actionToStep, actionsToJourneySegments };
