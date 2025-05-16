const prompt = require('prompt-sync')();
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');

(async () => {
  const pin = prompt('Enter Student PIN: ');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Navigate to the student portal
    await page.goto('https://info.aec.edu.in/sripoly/default.aspx');

    // Fill in the username and password
    await page.fill('#txtId3', pin);
    await page.fill('#txtPwd3', 'aditya');

    // Click the login button
    await page.click('#imgBtn3');

    // Wait for the image to appear
    await page.waitForSelector('#imgstudent', { timeout: 10000 });

    // Get image src
    const imageUrl = await page.getAttribute('#imgstudent', 'src');
    const fullImageUrl = new URL(imageUrl, page.url()).toString();

    console.log(`\nStudent photo URL: ${fullImageUrl}`);

    // Download the image
    const imagePath = path.resolve(__dirname, 'student-photo.jpg');
    const file = fs.createWriteStream(imagePath);

    https.get(fullImageUrl, response => {
      if (response.statusCode === 200) {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`Photo saved to ${imagePath}`);
        });
      } else {
        console.error(`Failed to download image. Status code: ${response.statusCode}`);
      }
    }).on('error', err => {
      fs.unlinkSync(imagePath);
      console.error('Error downloading the photo:', err.message);
    });
  } catch (error) {
    console.error('An error occurred:', error.message);
  } finally {
    await browser.close();
  }
})();