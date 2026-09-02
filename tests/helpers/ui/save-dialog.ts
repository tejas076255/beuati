// QA-1F — generic dialog-save success/failure detector, extracted from the
// QA-1E FAQ pilot because it is genuinely common: any shadcn Dialog-based
// admin form in this app only closes on its mutation's onSuccess, and every
// one of them renders its server error as toast text. Toast TEXT presence
// alone is not a reliable success signal — a still-visible toast from a
// PRIOR successful action can outlive this one's failure and make a naive
// text-presence check pass when the actual save just errored (diagnosed
// during QA-1E). This races the dialog actually closing against an error
// toast appearing, and throws with the real server message on failure.
import type { Page } from "@playwright/test";

export async function saveAndExpectSuccess(page: Page, buttonName = "Save"): Promise<void> {
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const dialogClosed = page
    .getByRole("dialog")
    .waitFor({ state: "hidden", timeout: 10_000 })
    .then(() => "closed" as const);
  const errorToast = page
    .getByText(/Failed to|does not belong/)
    .first()
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => "error" as const);
  const outcome = await Promise.race([dialogClosed, errorToast]);
  if (outcome === "error") {
    const msg = await page
      .getByText(/Failed to|does not belong/)
      .first()
      .textContent();
    throw new Error(`Save failed: ${msg}`);
  }
}
