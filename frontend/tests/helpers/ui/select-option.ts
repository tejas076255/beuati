// QA-1G — generic shadcn/Radix Select interaction, extracted because it is
// genuinely common: every FormField-wrapped Select in this app's admin
// forms (Services' Category/Price type, Packages' Price type, ...) uses the
// same FormControl id-forwarding pattern, so a label click + option click
// works identically regardless of which form it's in.
import type { Page } from "@playwright/test";

export async function selectOption(
  page: Page,
  labelText: string,
  optionText: string,
): Promise<void> {
  await page.getByLabel(labelText).click();
  await page.getByRole("option", { name: optionText, exact: true }).click();
}
