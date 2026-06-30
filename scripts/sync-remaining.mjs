/**
 * Headless-browser trigger for the Dashboard's "↑ Sync คงเหลือ" button.
 *
 * Runs the exact same client code path as a manual click (no business logic
 * duplicated here) by loading the live GitHub Pages site and clicking the
 * real button. Used by .github/workflows/sync-remaining.yml on a schedule.
 */
import { chromium } from "playwright";

const DASHBOARD_URL = "https://spysmall.github.io/Credit-Addsign/dashboard";

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.goto(DASHBOARD_URL, { waitUntil: "networkidle" });

  const button = page.getByRole("button", { name: "↑ Sync คงเหลือ" });
  await button.waitFor({ state: "visible", timeout: 30000 });
  await button.click();

  const success = page.getByText("บันทึกลง Sheet แล้ว");
  const failure = page.getByText("บันทึกไม่สำเร็จ");

  const result = await Promise.race([
    success.waitFor({ state: "visible", timeout: 30000 }).then(() => "success"),
    failure.waitFor({ state: "visible", timeout: 30000 }).then(() => "failure"),
  ]);

  if (result !== "success") {
    throw new Error("Dashboard reported sync failure (บันทึกไม่สำเร็จ)");
  }
  console.log("Remaining-credit sync succeeded");
} finally {
  await browser.close();
}
