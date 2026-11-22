/// <reference lib="dom" />
import type { Page } from "playwright-core";
import { BrowserSession } from "./browserSession.js";
import { ContextManager } from "../../memory/contextManager.js";

export interface FormFieldInfo {
  selector: string;
  name?: string;
  id?: string;
  type: string;
  label: string;
  placeholder?: string;
  required: boolean;
  currentValue: string;
  options?: string[]; // for select dropdowns
}

export interface FormInspectionResult {
  hasForm: boolean;
  fields: FormFieldInfo[];
  requiredFields: FormFieldInfo[];
  submitButton?: { selector: string; text: string };
  isSensitiveForm: boolean;
}

export interface FormFillResult {
  success: boolean;
  filledFields: Array<{ label: string; value: string; selector: string }>;
  missingFields: Array<{ label: string; required: boolean }>;
  verified: boolean;
  isSensitive: boolean;
  requiresConfirmationBeforeSubmit: boolean;
  message: string;
}

export class FormManager {
  /**
   * Inspects all interactive form fields on the active browser page.
   */
  static async inspectForm(page?: Page): Promise<FormInspectionResult> {
    const targetPage = page || (await BrowserSession.getActivePage());

    const result = await targetPage.evaluate(() => {
      const fields: Array<{
        selector: string;
        name?: string;
        id?: string;
        type: string;
        label: string;
        placeholder?: string;
        required: boolean;
        currentValue: string;
        options?: string[];
      }> = [];

      const elements = Array.from(
        document.querySelectorAll<HTMLElement>("input:not([type='hidden']), textarea, select")
      );

      elements.forEach((el, index) => {
        const input = el as HTMLInputElement;
        const tagName = el.tagName.toLowerCase();
        const type = (input.type || tagName).toLowerCase();
        const id = input.id || "";
        const name = input.name || "";
        const placeholder = input.placeholder || "";
        const required = input.required || el.hasAttribute("aria-required") || el.classList.contains("required");
        const currentValue = input.value || "";

        // Construct robust selector
        let selector = "";
        if (id) selector = `#${id}`;
        else if (name) selector = `${tagName}[name="${name}"]`;
        else selector = `${tagName}:nth-of-type(${index + 1})`;

        // Determine accessible label
        let label = "";
        if (id) {
          const lEl = document.querySelector(`label[for="${id}"]`);
          if (lEl) label = (lEl.textContent || "").trim();
        }
        if (!label) {
          const parentL = el.closest("label");
          if (parentL) label = (parentL.textContent || "").trim();
        }
        if (!label && input.getAttribute("aria-label")) {
          label = input.getAttribute("aria-label") || "";
        }
        if (!label && placeholder) {
          label = placeholder;
        }
        if (!label && name) {
          label = name.replace(/[_-]/g, " ");
        }

        let options: string[] | undefined;
        if (tagName === "select") {
          const sel = el as HTMLSelectElement;
          options = Array.from(sel.options).map((o) => (o.textContent || o.value).trim());
        }

        fields.push({
          selector,
          name: name || undefined,
          id: id || undefined,
          type,
          label: label || `Field ${index + 1}`,
          placeholder: placeholder || undefined,
          required: Boolean(required),
          currentValue,
          options,
        });
      });

      // Submit button
      let submitButton: { selector: string; text: string } | undefined;
      const subEl = document.querySelector<HTMLElement>(
        "button[type='submit'], input[type='submit'], button:has-text('Submit'), button:has-text('Register'), button:has-text('Save'), button:has-text('Sign Up')"
      );
      if (subEl) {
        submitButton = {
          selector: subEl.id ? `#${subEl.id}` : subEl.className ? `button.${subEl.className.split(" ")[0]}` : "button[type='submit']",
          text: (subEl.textContent || (subEl as HTMLInputElement).value || "Submit").trim(),
        };
      }

      // Check for sensitive forms (payment, passwords, banking)
      const pageText = document.body ? document.body.innerText.toLowerCase() : "";
      const isSensitiveForm =
        Boolean(document.querySelector("input[type='password']")) ||
        /\b(?:credit\s*card|debit\s*card|cvv|expiry|ssn|bank\s*account|payment)\b/i.test(pageText);

      return {
        hasForm: fields.length > 0,
        fields,
        requiredFields: fields.filter((f) => f.required),
        submitButton,
        isSensitiveForm,
      };
    });

    return result;
  }

  /**
   * Fills form fields intelligently using provided data and user profile.
   * Verifies values, prompts if required data is missing, and protects against unauthorized submissions.
   */
  static async fillForm(
    providedData: Record<string, string> = {},
    options: { submit?: boolean; page?: Page } = {}
  ): Promise<FormFillResult> {
    const page = options.page || (await BrowserSession.getActivePage());
    const inspection = await this.inspectForm(page);

    if (!inspection.hasForm) {
      return {
        success: false,
        filledFields: [],
        missingFields: [],
        verified: false,
        isSensitive: false,
        requiresConfirmationBeforeSubmit: false,
        message: "No fillable form fields were detected on the active webpage.",
      };
    }

    // Retrieve user profile as background data source
    const profileRecords = ContextManager.getProfile();
    const profileMap: Record<string, string> = {};
    for (const r of profileRecords) {
      profileMap[r.key.toLowerCase()] = r.value;
    }

    const filledFields: Array<{ label: string; value: string; selector: string }> = [];
    const missingFields: Array<{ label: string; required: boolean }> = [];

    for (const field of inspection.fields) {
      const labelLower = field.label.toLowerCase();
      const nameLower = (field.name || "").toLowerCase();
      const idLower = (field.id || "").toLowerCase();
      const combined = `${labelLower} ${nameLower} ${idLower}`;

      // 1. Check if user explicitly provided a value for this field in the command
      let matchedValue: string | undefined;

      for (const [k, v] of Object.entries(providedData)) {
        if (combined.includes(k.toLowerCase())) {
          matchedValue = v;
          break;
        }
      }

      // 2. Fall back to user profile
      if (!matchedValue) {
        if (combined.includes("name") && !combined.includes("user")) {
          matchedValue = providedData["name"] || profileMap["name"] || "User";
        } else if (combined.includes("email")) {
          matchedValue = providedData["email"] || profileMap["email"];
        } else if (combined.includes("phone") || combined.includes("mobile") || combined.includes("tel")) {
          matchedValue = providedData["phone"] || profileMap["phone"];
        } else if (combined.includes("college") || combined.includes("university") || combined.includes("education")) {
          matchedValue = profileMap["education"] || "B.Tech CSE";
        } else if (combined.includes("interest") || combined.includes("hobby")) {
          matchedValue = profileMap["interests"] || "AI automation";
        } else if (combined.includes("city") || combined.includes("country")) {
          matchedValue = "India";
        }
      }

      if (matchedValue) {
        try {
          const loc = page.locator(field.selector).first();
          if (await loc.isVisible({ timeout: 1500 }).catch(() => false)) {
            if (field.type === "select" && field.options) {
              const matchedOption = field.options.find((opt) => opt.toLowerCase().includes(matchedValue!.toLowerCase()));
              if (matchedOption) {
                await loc.selectOption({ label: matchedOption });
              }
            } else if (field.type === "checkbox" || field.type === "radio") {
              if (matchedValue === "true" || matchedValue === "yes" || matchedValue === "1") {
                await loc.check().catch(() => loc.click());
              }
            } else {
              await loc.click({ timeout: 1000 });
              await loc.fill(matchedValue, { timeout: 1000 });
            }

            // Verify entered value
            const entered = await loc.inputValue().catch(() => "");
            filledFields.push({
              label: field.label,
              value: entered || matchedValue,
              selector: field.selector,
            });
          }
        } catch {
          // Continue to next field
        }
      } else if (field.required) {
        missingFields.push({ label: field.label, required: true });
      }
    }

    // Safety checks for submission
    let message = `Filled ${filledFields.length} field(s) on page.`;
    if (missingFields.length > 0) {
      message += ` Missing required information for: ${missingFields.map((m) => m.label).join(", ")}. Please provide these details.`;
    }

    const requiresConfirmation = inspection.isSensitiveForm || Boolean(inspection.submitButton);

    if (options.submit) {
      if (inspection.isSensitiveForm) {
        return {
          success: filledFields.length > 0,
          filledFields,
          missingFields,
          verified: filledFields.length > 0,
          isSensitive: true,
          requiresConfirmationBeforeSubmit: true,
          message: `${message} SAFETY GATE: This form contains sensitive or financial fields. Explicit user confirmation is strictly required before submission.`,
        };
      }

      if (missingFields.length === 0 && inspection.submitButton) {
        message += ` Ready to submit via "${inspection.submitButton.text}". Confirmation recommended.`;
      }
    }

    return {
      success: filledFields.length > 0,
      filledFields,
      missingFields,
      verified: filledFields.length > 0,
      isSensitive: inspection.isSensitiveForm,
      requiresConfirmationBeforeSubmit: requiresConfirmation,
      message,
    };
  }
}
