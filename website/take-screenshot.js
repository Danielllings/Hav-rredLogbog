const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1629, height: 1075, deviceScaleFactor: 1 });
  await page.goto('file:///D:/sea-trout-log/website/fisk-og-fri-banner.html', { waitUntil: 'networkidle0' });

  const banner = await page.$('.banner');
  await banner.screenshot({ path: 'D:/sea-trout-log/website/fisk-og-fri-banner.png', type: 'png' });

  await browser.close();
  console.log('Done: fisk-og-fri-banner.png');
})();
