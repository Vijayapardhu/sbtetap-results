const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs'); // Import fs to save the image and JSON data

// Setup console input for PIN
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter Student PIN: ', async (pin) => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Fetch student information
    await page.goto('https://apsbtet.net/studentportal/screens/MainStudentInfo.aspx');

    // Fill PIN input using its ID
    await page.fill('#ContentPlaceHolder1_txtpinno', pin);

    // Click the "GET UNIT MARKS" button using its ID
    await page.click('#ContentPlaceHolder1_btngetunitmarks');

    // Wait for the table to load
    await page.waitForSelector('#ContentPlaceHolder1_gvMArks');

    const name = await page.textContent('#ContentPlaceHolder1_lblName');
    const father = await page.textContent('#ContentPlaceHolder1_lblFather');
    const branch = await page.textContent('#ContentPlaceHolder1_lblbranch');

    console.log(`\nStudent Details for PIN: ${pin}`);
    console.log(`Name      : ${name.trim()}`);
    console.log(`Father    : ${father.trim()}`);
    console.log(`Branch    : ${branch.trim()}`);

    // Fetch and calculate marks
    const unitSubjectCodes = ['401', '402', '403', '404', '405'];
    const unitMarks = [];
    const rows = await page.$$('#ContentPlaceHolder1_gvMArks tr');
    for (const row of rows.slice(1)) {
      const cells = await row.$$('td');
      const cellTexts = await Promise.all(cells.map(cell => cell.textContent()));
      const obtainedMarks = parseInt(cellTexts[6]?.trim() || '0', 10);
      unitMarks.push(obtainedMarks);
    }

    // Click the "GET SESSION MARKS" button
    await page.click('#ContentPlaceHolder1_btngetsessionmarks');
    await page.waitForSelector('#ContentPlaceHolder1_gvMArks');

    const sessionSubjectCodes = ['406', '407', '408', '409'];
    const sessionMarks = [];
    const sessionRows = await page.$$('#ContentPlaceHolder1_gvMArks tr');
    for (const row of sessionRows.slice(1)) {
      const cells = await row.$$('td');
      const cellTexts = await Promise.all(cells.map(cell => cell.textContent()));
      const obtainedMarks = parseInt(cellTexts[5]?.trim() || '0', 10);
      sessionMarks.push(obtainedMarks);
    }

    const calculateExternalMarks = (internal) => {
      let external;
      if (internal <= 20) {
        external = Math.round(3.0 * internal + 20);
        const randomAdjustment = Math.floor(Math.random() * 13) - 6;
        external = Math.max(0, Math.min(80, external + randomAdjustment));
      } else {
        external = Math.round(0.9 * internal + 20);
      }
      return external;
    };

    const result = {
      name: name.trim(),
      father: father.trim(),
      branch: branch.trim(),
      unitResults: unitSubjectCodes.map((code, index) => ({
        subjectCode: code,
        internalMarks: unitMarks[index],
        externalMarks: calculateExternalMarks(unitMarks[index]),
        totalMarks: unitMarks[index] + calculateExternalMarks(unitMarks[index]),
      })),
      sessionResults: sessionSubjectCodes.map((code, index) => ({
        subjectCode: code,
        internalMarks: sessionMarks[index],
        externalMarks: calculateExternalMarks(sessionMarks[index]),
        totalMarks: sessionMarks[index] + calculateExternalMarks(sessionMarks[index]),
      })),
    };

    // Fetch and save student photo
    await page.goto('https://sbtet.ap.gov.in/APSBTET/registerInstant.do');

    // Fill the PIN
    await page.fill('#aadhar1', pin);

    // Click the GO button
    await page.click('input[type="button"][value="GO"]');

    // Wait for images to load
    await page.waitForSelector('input.form-control-plaintext');

    const images = await page.$$('img');
    if (images.length >= 3) {
      const thirdImage = images[2]; // Get the third image
      const imgSrc = await thirdImage.getAttribute('src'); // Extract the 'src' attribute

      if (imgSrc) {
        // Remove the "data:image/jpg;base64," prefix to get the Base64 data
        const base64Data = imgSrc.replace('data:image/jpg;base64,', '');

        // Add the Base64 data to the JSON result
        result.photoBase64 = base64Data;

        // Save the image as a file
        fs.writeFileSync('student-photo.jpg', Buffer.from(base64Data, 'base64'));
        console.log('Student photo saved as "student-photo.jpg".');
      } else {
        console.log('Third image found, but src attribute is missing.');
      }
    } else {
      console.log('Less than 3 images found on the page.');
    }

    // Save the JSON result to a file
    fs.writeFileSync('student-info.json', JSON.stringify(result, null, 2));
    console.log('Student information saved to "student-info.json".');
  } catch (error) {
    console.error('An error occurred:', error.message);
  } finally {
    await browser.close();
    rl.close();
  }
});