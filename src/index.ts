import puppeteer, { Page } from "puppeteer";
import { JSDOM } from "jsdom";

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

async function main() {
  const url = mustEnv("TARGET_URL");

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

  console.log("Take a screenshot of the whole page and save it to a file");
  await page.screenshot({ path: "tmp/screenshot.png", fullPage: true });

  await browser.close();
}

main();
