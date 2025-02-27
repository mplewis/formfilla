import puppeteer, { Page } from "puppeteer";
import { JSDOM } from "jsdom";
import { join } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { compile } from "handlebars";
import { LLMInterface } from "llm-interface";
import { createHash } from "crypto";
import { existsSync } from "fs";

const cacheDir = "tmp/cache";
const fillableFieldTypes = [
  "email",
  "password",
  "tel",
  "text",
  "textarea",
  "url",
];

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

function fillField(page: Page, name: string, value: string) {
  return page.evaluate(
    (name, value) => {
      const input = document.querySelector(`[name="${name}"]`);
      if (input && "value" in input) {
        input.value = value;
      }
    },
    name,
    value
  );
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

  console.log("Parse the form fields using jsdom");

  const fields = parseFormFields(formHtml);
  console.log("Form fields:", fields);

  const toFill = fields.filter((field) =>
    fillableFieldTypes.includes(field.type)
  );
  console.log("Fields to fill:", toFill);

  for (const field of toFill) {
    if (field.type === "text") await fillField(page, field.name, "hello world");
  }

  console.log("Build prompt for LLM");
  const prompt = promptTmpl({
    COUNT: count,
    FIELDS: JSON.stringify(toFill, null, 2),
  });
  console.log("Prompt:", prompt);

  console.log("Send message to LLM");
  const response = await queryLLM(llm, apiKey, prompt);
  console.log("Response:", response);

  console.log("Take a screenshot of the whole page and save it to a file");
  await page.screenshot({ path: "tmp/screenshot.png", fullPage: true });

  await browser.close();
}

main();
