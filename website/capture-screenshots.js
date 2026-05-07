const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setViewport({ width: 1400, height: 3000, deviceScaleFactor: 1 });

  const filePath = 'file:///' + path.resolve('appstore-screenshots.html').replace(/\\/g, '/');
  await page.goto(filePath, { waitUntil: 'networkidle0' });

  const names = [
    '01-Galleri',
    '02-Tracking',
    '03-Fangstrate',
    '04-Spot-analyse',
    '05-Fiskemonster',
    '06-Vejrradar',
    '07-Vejrforhold',
    '08-Live-grafer'
  ];

  const elements = await page.$$('.screenshot');

  for (let i = 0; i < elements.length; i++) {
    const box = await elements[i].boundingBox();
    const outputPath = path.resolve('assets', 'Screenshots', `appstore-${names[i]}.png`);

    await page.screenshot({
      path: outputPath,
      type: 'png',
      clip: {
        x: box.x,
        y: box.y,
        width: 1284,
        height: 2778
      }
    });

    console.log(`Saved: appstore-${names[i]}.png (${Math.round(box.x)}, ${Math.round(box.y)})`);
  }

  await browser.close();
  console.log('Done! 8 screenshots saved.');
})();
