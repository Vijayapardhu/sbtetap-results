const { chromium } = require('playwright');
const readline = require('readline');
const clipboardy = require('clipboardy'); // Import clipboardy
const fs = require('fs'); // Import fs to save the JSON file

// Setup console input for PIN
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter your PIN: ', async (pin) => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  let base64Data = ''; // Declare base64Data outside the try block

  try {
    await page.goto('https://sbtet.ap.gov.in/APSBTET/registerInstant.do');

    // Fill the PIN
    await page.fill('#aadhar1', pin);

    // Click the GO button
    await page.click('input[type="button"][value="GO"]');

    // Wait for images to load
    await page.waitForSelector('input.form-control-plaintext');

    // Get all image elements
    const images = await page.$$('img');

    // Check if the third image exists
    if (images.length >= 3) {
      const thirdImage = images[2]; // Index 2 corresponds to the third image
      const imgSrc = await thirdImage.getAttribute('src');

      if (imgSrc) {
        // Remove the "data:image/jpg;base64," prefix
        base64Data = imgSrc.replace('data:image/jpg;base64,', '');
        console.log('Base64 data:', base64Data);

        // Copy the Base64 data to the clipboard
        clipboardy.writeSync(base64Data);
        console.log('Base64 data has been copied to the clipboard.');

        // Save the Base64 data to a JSON file
        const result = {
          pin: pin,
          photoBase64: base64Data,
        };
        fs.writeFileSync('student-info.json', JSON.stringify(result, null, 2));
        console.log('Base64 data has been saved to "student-info.json".');
      } else {
        console.log('Third image found, but src attribute is missing.');
      }
    } else {
      console.log('Less than 3 images found on the page.');
    }
  } catch (error) {
    console.error('An error occurred:', error.message);
  } finally {
    await browser.close();
    rl.close();
  }
});