import puppeteer, { Page } from "puppeteer";
import { JSDOM } from "jsdom";
import { join } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { compile } from "handlebars";
import { LLMInterface } from "llm-interface";
import { createHash } from "crypto";
import { z } from "zod";

const cacheDir = "tmp/cache";
const fillableFieldTypes = [
  "email",
  "password",
  "tel",
  "text",
  "textarea",
  "url",
];

const fieldSchema = z.object({ name: z.string(), value: z.string() });
const responseSchema = z.array(fieldSchema);
const responsesSchema = z.array(responseSchema);

function mustEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is unset`);
  return v;
}

async function mustLoadPromptTmpl() {
  const tmplPath = join(__dirname, "..", "resources", "prompt.hbs");
  const raw = await readFile(tmplPath, "utf-8");
  return compile(raw);
}

function parseFormFields(html: string): any[] {
  const dom = new JSDOM(html);
  const formElement = dom.window.document.querySelector("form");
  if (!formElement) throw new Error("No form element found in the parsed HTML");
  return Array.from(formElement.elements).map((element: any) => {
    let label = "";
    if (element.id) {
      const labelElement = formElement.querySelector(
        `label[for="${element.id}"]`
      );
      if (labelElement) {
        label = labelElement.textContent || "";
      }
    }

    const { name, type, value } = element;
    return { name, type, value, label };
  });
}

function fillFields(page: Page, fields: { name: string; value: string }[]) {
  return page.evaluate((fields) => {
    for (const field of fields) {
      const input = document.querySelector(`[name="${field.name}"]`);
      if (input && "value" in input) {
        input.value = field.value;
      }
    }
  }, fields);
}

async function queryLLM(
  llm: string,
  apiKey: string,
  prompt: string
): Promise<string> {
  const hash = createHash("sha256").update(prompt).digest("hex");
  const path = join(cacheDir, `${hash}`);

  try {
    const data = await readFile(path, "utf-8");
    return data;
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;

    const response = await LLMInterface.sendMessage([llm, apiKey], prompt);
    if (!response.success) throw new Error(`LLM returned failure: ${response}`);

    await mkdir(cacheDir, { recursive: true });
    const { results } = response;
    await writeFile(path, results, "utf-8");
    return results;
  }
}

async function submitForm(
  url: string,
  fields: { name: string; value: string }[]
) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  try {
    await page.goto(url);

    console.log("Filling fields with provided data");
    await fillFields(page, fields);

    console.log("Submitting the form");
    await page.$eval("form", (form) => form.submit());

    console.log("Waiting for navigation after form submission");
    await page.waitForNavigation();

    console.log("Taking a screenshot after form submission");
    const unixEpoch = (Date.now() / 1000).toFixed(0);
    await page.screenshot({ path: `tmp/${unixEpoch}.png`, fullPage: true });
  } finally {
    await browser.close();
  }
}

async function main() {
  const promptTmpl = await mustLoadPromptTmpl();
  const url = mustEnv("TARGET_URL");
  const count = mustEnv("COUNT");

  const llmKeyRaw = mustEnv("LLM_API_KEY");
  const [llm, apiKey] = llmKeyRaw.split(":");

  console.log("Launch the browser and open a new blank page");
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  console.log(`Navigate the page to ${url}`);
  await page.goto(url);

  console.log("Parse the first <form> element on the page");
  const form = await page.$("form");
  let formHtml: string;
  if (form) {
    formHtml = await page.evaluate((form) => form.outerHTML, form);
    console.log("Form HTML:", formHtml);
  } else {
    throw new Error("No form found on the page");
  }
  await browser.close();

  console.log("Parse the form fields using jsdom");

  const fields = parseFormFields(formHtml);
  console.log("Form fields:", fields);

  const toFill = fields.filter((field) =>
    fillableFieldTypes.includes(field.type)
  );
  console.log("Fields to fill:", toFill);

  console.log("Build prompt for LLM");
  const prompt = promptTmpl({
    COUNT: count,
    FIELDS: JSON.stringify(toFill, null, 2),
  });
  console.log("Prompt:", prompt);

  console.log("Send message to LLM");
  const response = await queryLLM(llm, apiKey, prompt);
  console.log("Response:", response);

  const rawJSON = response
    .split("\n")
    .filter((line) => !line.startsWith("```"))
    .join("\n");
  const llmResponsesPreValidate = JSON.parse(rawJSON);
  const llmResponses = responsesSchema.parse(llmResponsesPreValidate);

  for (const resp of llmResponses) await submitForm(url, resp);
}

main();
