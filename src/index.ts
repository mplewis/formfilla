import puppeteer from "puppeteer";

async function main() {
	console.log("Launch the browser and open a new blank page");
	const browser = await puppeteer.launch();
	const page = await browser.newPage();

	console.log("Navigate the page to a URL.");
	await page.goto("https://developer.chrome.com/");

	console.log("Set screen size.");
	await page.setViewport({ width: 1080, height: 1024 });

	console.log("Type into search box.");
	await page.locator(".devsite-search-field").fill("automate beyond recorder");

	console.log(" and click on first result.");
	await page.locator(".devsite-result-item-link").click();

	console.log("Locate the full title with a unique string.");
	const textSelector = await page
		.locator("text/Customize and automate")
		.waitHandle();
	const fullTitle = await textSelector?.evaluate((el) => el.textContent);

	console.log("Print the full title.");
	console.log('The title of this blog post is "%s".', fullTitle);

	console.log("Take a screenshot and save it to a file.");
	await page.screenshot({ path: "tmp/screenshot.png" });

	await browser.close();
}

main();
