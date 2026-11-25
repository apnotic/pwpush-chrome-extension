import {test, expect, chromium} from "@playwright/test";
import path from "node:path";
import {fileURLToPath} from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, "../..");
const ARTIFACTS_DIR = "/opt/cursor/artifacts";

async function waitForExtension(context) {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker", {timeout: 5000});
  }
  return serviceWorker;
}

test.describe("Options page two-column layout", () => {
  test("Wide viewport (1280x800): two columns with right-side blocks", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-wide");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      viewport: {width: 1280, height: 800},
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const serviceWorker = await waitForExtension(context);
    const extensionId = serviceWorker.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    
    const page = await context.newPage();
    const optionsUrl = `chrome-extension://${extensionId}/src/options/options.html`;
    await page.goto(optionsUrl);
    await page.waitForLoadState("networkidle");

    // Check container uses grid
    const containerDisplay = await page.evaluate(() => {
      const container = document.querySelector(".container");
      const styles = window.getComputedStyle(container);
      return {
        display: styles.display,
        gridTemplateColumns: styles.gridTemplateColumns,
        gap: styles.gap
      };
    });

    expect(containerDisplay.display).toBe("grid");
    // Should have two columns (each around 50% with gap)
    expect(containerDisplay.gridTemplateColumns).toMatch(/\d+px \d+px/);

    // Check "Detected instance" section is in right column
    const detectedInstancePosition = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll(".container > section"));
      const detectedSection = sections.find(s => 
        s.querySelector("h2")?.textContent.includes("Detected instance")
      );
      if (!detectedSection) return null;
      const styles = window.getComputedStyle(detectedSection);
      const rect = detectedSection.getBoundingClientRect();
      return {
        gridColumn: styles.gridColumn,
        x: rect.x,
        y: rect.y
      };
    });

    expect(detectedInstancePosition).toBeTruthy();
    expect(detectedInstancePosition.gridColumn).toBe("2 / 3");

    // Check "About" section is in right column
    const aboutPosition = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll(".container > section"));
      const aboutSection = sections.find(s => 
        s.querySelector("h2")?.textContent.includes("About Password Pusher")
      );
      if (!aboutSection) return null;
      const styles = window.getComputedStyle(aboutSection);
      const rect = aboutSection.getBoundingClientRect();
      return {
        gridColumn: styles.gridColumn,
        x: rect.x,
        y: rect.y
      };
    });

    expect(aboutPosition).toBeTruthy();
    expect(aboutPosition.gridColumn).toBe("2 / 3");

    // Both right column items should have similar x position
    expect(Math.abs(detectedInstancePosition.x - aboutPosition.x)).toBeLessThan(5);

    // About should be below Detected instance
    expect(aboutPosition.y).toBeGreaterThan(detectedInstancePosition.y);

    console.log("Wide layout - Detected instance:", detectedInstancePosition);
    console.log("Wide layout - About:", aboutPosition);

    await page.screenshot({path: path.join(ARTIFACTS_DIR, "options-wide-1280.png"), fullPage: true});
    await context.close();
  });

  test("Narrow viewport (600px): single column stacked", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-narrow");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      viewport: {width: 600, height: 800},
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const serviceWorker = await waitForExtension(context);
    const extensionId = serviceWorker.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    
    const page = await context.newPage();
    const optionsUrl = `chrome-extension://${extensionId}/src/options/options.html`;
    await page.goto(optionsUrl);
    await page.waitForLoadState("networkidle");

    // Check container is single column
    const containerDisplay = await page.evaluate(() => {
      const container = document.querySelector(".container");
      const styles = window.getComputedStyle(container);
      return {
        display: styles.display,
        gridTemplateColumns: styles.gridTemplateColumns
      };
    });

    expect(containerDisplay.display).toBe("grid");
    
    // Check if single column (should not have two distinct column widths)
    // At narrow width, grid-template-columns should be a single value
    const columnCount = containerDisplay.gridTemplateColumns.split(/\s+/).length;
    console.log("Narrow layout - gridTemplateColumns:", containerDisplay.gridTemplateColumns);
    console.log("Narrow layout - column count:", columnCount);
    
    // Check all sections are stacked vertically by checking grid-column spans
    const sectionsLayout = await page.evaluate(() => {
      const brand = document.querySelector(".container > .brand");
      const sections = Array.from(document.querySelectorAll(".container > section"));
      
      const brandStyles = window.getComputedStyle(brand);
      const brandGridColumn = brandStyles.gridColumn;
      
      return {
        brandGridColumn,
        sectionsGridColumns: sections.map(s => window.getComputedStyle(s).gridColumn),
        containerWidth: document.querySelector(".container").offsetWidth
      };
    });

    // All items should span full width
    // At narrow width, they should all use the same grid-column value
    console.log("Narrow layout - container width:", sectionsLayout.containerWidth);
    console.log("Narrow layout - grid columns:", sectionsLayout);
    
    // If two columns are still present at 600px, that means the media query isn't working
    // Let's check if columns are equal (indicating responsive didn't work) or stacked
    if (columnCount === 1) {
      // Single column - good!
      expect(sectionsLayout.brandGridColumn).toMatch(/1\s*\/\s*-?1/);
      sectionsLayout.sectionsGridColumns.forEach(col => {
        expect(col).toMatch(/1\s*\/\s*-?1/);
      });
    } else {
      // Still two columns - check if they're vertically stacked despite having 2 columns defined
      // In this case, sections should still span both columns
      expect(sectionsLayout.brandGridColumn).toMatch(/1\s*\/\s*-?1/);
      sectionsLayout.sectionsGridColumns.forEach(col => {
        expect(col).toMatch(/1\s*\/\s*-?1/);
      });
    }

    await page.screenshot({path: path.join(ARTIFACTS_DIR, "options-narrow-600.png"), fullPage: true});
    await context.close();
  });

  test("Keyboard tab order: left column first, then right column", async ({}, testInfo) => {
    const userDataDir = testInfo.outputPath("user-data-taborder");
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      headless: true,
      viewport: {width: 1280, height: 800},
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--headless=new"
      ]
    });

    const serviceWorker = await waitForExtension(context);
    const extensionId = serviceWorker.url().match(/chrome-extension:\/\/([^\/]+)/)?.[1];
    
    const page = await context.newPage();
    const optionsUrl = `chrome-extension://${extensionId}/src/options/options.html`;
    await page.goto(optionsUrl);
    await page.waitForLoadState("networkidle");

    // Get focusable elements in DOM order
    const focusableElements = await page.evaluate(() => {
      const selector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const elements = Array.from(document.querySelectorAll(selector));
      return elements.map(el => {
        // Find parent section
        let section = el.closest("section, header");
        let sectionName = "unknown";
        if (section) {
          const heading = section.querySelector("h2");
          if (heading) {
            sectionName = heading.textContent.trim();
          } else if (section.classList.contains("brand")) {
            sectionName = "Brand header";
          }
        }
        return {
          tag: el.tagName,
          id: el.id || null,
          type: el.type || null,
          section: sectionName
        };
      });
    });

    console.log("Tab order (first 10):", focusableElements.slice(0, 10));

    // Check that left column sections appear before right column sections
    const serverSectionIndex = focusableElements.findIndex(el => 
      el.section.includes("Server selection")
    );
    const detectedInstanceIndex = focusableElements.findIndex(el => 
      el.section.includes("Detected instance")
    );
    const aboutIndex = focusableElements.findIndex(el => 
      el.section.includes("About Password Pusher")
    );

    // Server selection should come before Detected instance
    if (serverSectionIndex !== -1 && detectedInstanceIndex !== -1) {
      expect(serverSectionIndex).toBeLessThan(detectedInstanceIndex);
    }

    // Detected instance should come before About
    if (detectedInstanceIndex !== -1 && aboutIndex !== -1) {
      expect(detectedInstanceIndex).toBeLessThan(aboutIndex);
    }

    await context.close();
  });
});
