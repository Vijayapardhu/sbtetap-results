const prompt = require('prompt-sync')();
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const pin = prompt('Enter Student PIN: ');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
    let base64Data = ''; // Declare base64Data outside the try block

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

  const unitSubjectCodes = ['401', '402', '403', '404', '405']; // Subject codes for unit marks
  const unitMarks = []; // Obtained unit marks

  // Extract unit test marks
  const rows = await page.$$('#ContentPlaceHolder1_gvMArks tr');
  for (const row of rows.slice(1)) { // Skip the header row
    const cells = await row.$$('td');
    const cellTexts = await Promise.all(cells.map(cell => cell.textContent()));

    // Extract marks and convert to integer
    const obtainedMarks = parseInt(cellTexts[6]?.trim() || '0', 10);
    unitMarks.push(obtainedMarks);
  }

  // Click the "GET SESSION MARKS" button
  await page.click('#ContentPlaceHolder1_btngetsessionmarks');

  // Wait for the table to update with session marks
  await page.waitForSelector('#ContentPlaceHolder1_gvMArks');

  const sessionSubjectCodes = ['406', '407', '408', '409']; // Subject codes for session marks
  const sessionMarks = []; // Obtained session marks

  // Extract session marks
  const sessionRows = await page.$$('#ContentPlaceHolder1_gvMArks tr');
  for (const row of sessionRows.slice(1)) { // Skip the header row
    const cells = await row.$$('td');
    const cellTexts = await Promise.all(cells.map(cell => cell.textContent()));

    // Extract marks and convert to integer
    const obtainedMarks = parseInt(cellTexts[5]?.trim() || '0', 10);
    sessionMarks.push(obtainedMarks);
  }

  // Function to calculate external marks with randomization
  const calculateExternalMarks = (internal) => {
    let external;
    if (internal <= 20) {
      // For theory
      external = Math.round(3.0 * internal + 20);
    } else {
      // For lab
      external = Math.round(0.9 * internal + 20);
    }

    // Randomize external marks for theory (out of 80)
    if (internal <= 20) {
      const randomAdjustment = Math.floor(Math.random() * 13) - 6; // Random value between -6 and +6
      external = Math.max(0, Math.min(80, external + randomAdjustment)); // Ensure marks stay within 0-80
    }

    return external;
  };

  // Calculate totals
  let totalInternalUnit = 0;
  let totalExternalUnit = 0;
  let totalInternalSession = 0;
  let totalExternalSession = 0;

  // Print unit subject codes, internal marks, external marks, and total marks
  console.log('\nUnit Test Marks:');
  console.log('Subject Code | Internal Marks | External Marks | Total Marks');
  console.log('-----------------------------------------------------------');
  for (let i = 0; i < unitSubjectCodes.length; i++) {
    const externalMarks = calculateExternalMarks(unitMarks[i]);
    const totalMarks = unitMarks[i] + externalMarks; // Subject-wise total
    totalInternalUnit += unitMarks[i];
    totalExternalUnit += externalMarks;
    console.log(`${unitSubjectCodes[i].padEnd(12)} | ${unitMarks[i].toString().padEnd(15)} | ${externalMarks.toString().padEnd(15)} | ${totalMarks}`);
  }
  for (let i = 0; i < sessionSubjectCodes.length; i++) {
    const externalMarks = calculateExternalMarks(sessionMarks[i]);
    const totalMarks = sessionMarks[i] + externalMarks; // Subject-wise total
    totalInternalSession += sessionMarks[i];
    totalExternalSession += externalMarks;
    console.log(`${sessionSubjectCodes[i].padEnd(12)} | ${sessionMarks[i].toString().padEnd(15)} | ${externalMarks.toString().padEnd(15)} | ${totalMarks}`);
  }


  const result = {
    name: name.trim(),
    father: father.trim(),
    branch: branch.trim(),
    unitResults: unitSubjectCodes.map((code, index) => ({
      subjectCode: code,
      internalMarks: unitMarks[index],
      externalMarks: calculateExternalMarks(unitMarks[index]),
      totalMarks: unitMarks[index] + calculateExternalMarks(unitMarks[index]), // Subject-wise total
    })),
    sessionResults: sessionSubjectCodes.map((code, index) => ({
      subjectCode: code,
      internalMarks: sessionMarks[index],
      externalMarks: calculateExternalMarks(sessionMarks[index]),
      totalMarks: sessionMarks[index] + calculateExternalMarks(sessionMarks[index]), // Subject-wise total
    })),
    totals: {
      totalInternalUnit,
      totalExternalUnit,
      totalInternalSession,
      totalExternalSession,
    },
  };

  // Save results to a JSON file
  fs.writeFileSync('student-info.json', JSON.stringify(result, null, 2));

  await browser.close();
  
})();