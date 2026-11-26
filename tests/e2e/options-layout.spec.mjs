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

    // Check column layout and vertical gaps
    const layoutMetrics = await page.evaluate(() => {
      const leftColumn = document.querySelector(".column-left");
      const rightColumn = document.querySelector(".column-right");
      const brand = document.querySelector(".brand");
      const serverSection = Array.from(document.querySelectorAll("section")).find(s =>
        s.querySelector("h2")?.textContent.includes("Server selection")
      );
      const detectedSection = Array.from(document.querySelectorAll("section")).find(s => 
        s.querySelector("h2")?.textContent.includes("Detected instance")
      );
      const aboutSection = Array.from(document.querySelectorAll("section")).find(s => 
        s.querySelector("h2")?.textContent.includes("About Password Pusher")
      );

      const leftColumnStyles = window.getComputedStyle(leftColumn);
      const rightColumnStyles = window.getComputedStyle(rightColumn);
      
      const brandRect = brand.getBoundingClientRect();
      const serverRect = serverSection.getBoundingClientRect();
      const detectedRect = detectedSection.getBoundingClientRect();
      const aboutRect = aboutSection.getBoundingClientRect();

      return {
        leftColumn: {
          display: leftColumnStyles.display,
          flexDirection: leftColumnStyles.flexDirection,
          gap: leftColumnStyles.gap,
          x: leftColumn.getBoundingClientRect().x
        },
        rightColumn: {
          display: rightColumnStyles.display,
          flexDirection: rightColumnStyles.flexDirection,
          gap: rightColumnStyles.gap,
          x: rightColumn.getBoundingClientRect().x
        },
        brand: { x: brandRect.x, y: brandRect.y, bottom: brandRect.bottom },
        server: { x: serverRect.x, y: serverRect.y, bottom: serverRect.bottom },
        detected: { x: detectedRect.x, y: detectedRect.y, bottom: detectedRect.bottom },
        about: { x: aboutRect.x, y: aboutRect.y, bottom: aboutRect.bottom },
        // Calculate gaps
        gapBrandToServer: serverRect.y - brandRect.bottom,
        gapDetectedToAbout: aboutRect.y - detectedRect.bottom
      };
    });

    // Check columns are flex column
    expect(layoutMetrics.leftColumn.display).toBe("flex");
    expect(layoutMetrics.leftColumn.flexDirection).toBe("column");
    expect(layoutMetrics.leftColumn.gap).toBe("24px");
    
    expect(layoutMetrics.rightColumn.display).toBe("flex");
    expect(layoutMetrics.rightColumn.flexDirection).toBe("column");
    expect(layoutMetrics.rightColumn.gap).toBe("24px");

    // Check columns are side by side
    expect(layoutMetrics.rightColumn.x).toBeGreaterThan(layoutMetrics.leftColumn.x);

    // Check vertical gaps are consistent (24px gap from flex)
    expect(layoutMetrics.gapBrandToServer).toBeCloseTo(24, 0);
    expect(layoutMetrics.gapDetectedToAbout).toBeCloseTo(24, 0);

    console.log("Wide layout metrics:", layoutMetrics);

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
    
    // Check if single column
    const columnCount = containerDisplay.gridTemplateColumns.split(/\s+/).length;
    expect(columnCount).toBe(1);
    console.log("Narrow layout - gridTemplateColumns:", containerDisplay.gridTemplateColumns);
    
    // Check columns stack vertically and gaps remain consistent
    const layoutMetrics = await page.evaluate(() => {
      const leftColumn = document.querySelector(".column-left");
      const rightColumn = document.querySelector(".column-right");
      const brand = document.querySelector(".brand");
      const serverSection = Array.from(document.querySelectorAll("section")).find(s =>
        s.querySelector("h2")?.textContent.includes("Server selection")
      );
      const detectedSection = Array.from(document.querySelectorAll("section")).find(s => 
        s.querySelector("h2")?.textContent.includes("Detected instance")
      );
      const aboutSection = Array.from(document.querySelectorAll("section")).find(s => 
        s.querySelector("h2")?.textContent.includes("About Password Pusher")
      );

      const leftColumnStyles = window.getComputedStyle(leftColumn);
      
      const brandRect = brand.getBoundingClientRect();
      const serverRect = serverSection.getBoundingClientRect();
      const detectedRect = detectedSection.getBoundingClientRect();
      const aboutRect = aboutSection.getBoundingClientRect();
      const leftColumnRect = leftColumn.getBoundingClientRect();
      const rightColumnRect = rightColumn.getBoundingClientRect();

      return {
        leftColumn: {
          gap: leftColumnStyles.gap,
          x: leftColumnRect.x,
          y: leftColumnRect.y,
          width: leftColumnRect.width
        },
        rightColumn: {
          x: rightColumnRect.x,
          y: rightColumnRect.y,
          width: rightColumnRect.width
        },
        gapBrandToServer: serverRect.y - brandRect.bottom,
        gapDetectedToAbout: aboutRect.y - detectedRect.bottom,
        // Check vertical stacking: right column should be below left column
        leftColumnBottom: leftColumnRect.bottom,
        rightColumnTop: rightColumnRect.y
      };
    });

    // Gaps should still be 24px within each column
    expect(layoutMetrics.leftColumn.gap).toBe("24px");
    expect(layoutMetrics.gapBrandToServer).toBeCloseTo(24, 0);
    expect(layoutMetrics.gapDetectedToAbout).toBeCloseTo(24, 0);

    // Right column should be below left column (stacked)
    expect(layoutMetrics.rightColumnTop).toBeGreaterThanOrEqual(layoutMetrics.leftColumnBottom);

    console.log("Narrow layout metrics:", layoutMetrics);

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
        // Find parent section and column
        let section = el.closest("section, header");
        let column = el.closest(".column-left, .column-right");
        let sectionName = "unknown";
        let columnName = "unknown";
        
        if (column) {
          columnName = column.classList.contains("column-left") ? "left" : "right";
        }
        
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
          section: sectionName,
          column: columnName
        };
      });
    });

    console.log("Tab order (first 10):", focusableElements.slice(0, 10));

    // Check that left column sections appear before right column sections
    const leftColumnElements = focusableElements.filter(el => el.column === "left");
    const rightColumnElements = focusableElements.filter(el => el.column === "right");
    
    // Find indices of first element in each column
    const firstLeftIndex = focusableElements.findIndex(el => el.column === "left");
    const firstRightIndex = focusableElements.findIndex(el => el.column === "right");

    // Left column should come first in tab order
    if (firstLeftIndex !== -1 && firstRightIndex !== -1) {
      expect(firstLeftIndex).toBeLessThan(firstRightIndex);
    }

    console.log("Left column elements:", leftColumnElements.length);
    console.log("Right column elements:", rightColumnElements.length);

    await context.close();
  });
});
