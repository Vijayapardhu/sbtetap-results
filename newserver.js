const express = require('express');
const { chromium } = require('playwright');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'main.html'));
});

// Function to generate a consistent random number based on a seed
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Function to calculate external marks for each subject
const calculateExternalMarksForSubject = (internal, pin, subjectCode, isSessional = false) => {
  const seed = parseInt(`${pin}${subjectCode}`, 36); // Combine PIN and subject code as a string and convert to base-36
  const randomAdjustment = Math.floor(seededRandom(seed) * 13) - 6; // Random value between -6 and +6

  const baseMultiplier = 2.5; // Base multiplier for external marks
  const subjectMultiplier = baseMultiplier + (parseInt(subjectCode) % 10) * 0.3; // Increment multiplier by 0.3 for each subject

  let externalMarks;

  switch (subjectCode) {
    case '402':
      externalMarks = Math.round(subjectMultiplier * internal + 5 + randomAdjustment);
      break;
    case '403':
      externalMarks = Math.round(subjectMultiplier * internal + 13 + randomAdjustment);
      break;
    case '404':
      externalMarks = Math.round(subjectMultiplier * internal + 2 + randomAdjustment);
      break;
    case '405':
      externalMarks = Math.round(subjectMultiplier * internal + 5 + randomAdjustment);
      break;
    default:
      externalMarks = Math.round(subjectMultiplier * internal + 10 + randomAdjustment);
      break;
  }

  internal = Math.min(internal, 80);

  if (isSessional) {
    externalMarks = Math.max(0, Math.min(60, externalMarks)); // Sessional exams: max 60
  } else {
    externalMarks = Math.max(0, Math.min(80, externalMarks)); // Unit exams: max 80
  }

  return externalMarks;
};

// Function to generate subject codes based on PIN
const generateSubjectCodes = (pin, startCode, count) => {
  const subjectCodes = [];
  for (let i = 0; i < count; i++) {
    subjectCodes.push(startCode + i); // Generate sequential subject codes
  }
  return subjectCodes;
};

// Function to calculate the average of two test marks for each subject
const calculateAverageMarks = (marks) => {
  const averagedMarks = [];
  for (let i = 0; i < marks.length; i += 2) {
    const test1 = marks[i] || 0;
    const test2 = marks[i + 1] || 0;
    const average = Math.round((test1 + test2) / 2);
    averagedMarks.push(average);
  }
  return averagedMarks;
};

// Function to calculate the average of unit test marks dynamically based on PIN prefix
const calculateDynamicAverageMarks = (marks, pin) => {
  const averagedMarks = [];
  const testsPerSubject = pin.startsWith('24') ? 3 : 2; // Determine if there are 3 or 2 tests per subject

  for (let i = 0; i < marks.length; i++) {
    const test1 = marks[i][0] || 0;
    const test2 = marks[i][1] || 0;
    const test3 = testsPerSubject === 3 ? (marks[i][2] || 0) : 0; // Include the 3rd test if applicable
    const average = Math.round((test1 + test2 + test3) / testsPerSubject); // Calculate average
    averagedMarks.push(average);
  }

  return averagedMarks;
};

// Function to calculate grade points, grade, and status
const calculateGradeDetails = (totalMarks) => {
  let gradePoints, grade, status;

  if (totalMarks >= 90) {
    gradePoints = 10;
    grade = 'A+';
  } else if (totalMarks >= 80) {
    gradePoints = 9;
    grade = 'A';
  } else if (totalMarks >= 70) {
    gradePoints = 8;
    grade = 'B+';
  } else if (totalMarks >= 60) {
    gradePoints = 7;
    grade = 'B';
  } else if (totalMarks >= 50) {
    gradePoints = 6;
    grade = 'C';
  } else if (totalMarks >= 28) {
    gradePoints = 5;
    grade = 'D';
  } else {
    gradePoints = 0;
    grade = 'F';
  }

  status = totalMarks >= 28 ? 'P' : 'F';

  return { gradePoints, grade, status };
};

// Endpoint to fetch student info
app.post('/fetch-student-info', async (req, res) => {
  const { pin } = req.body;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Fetch student details and marks
    await page.goto('https://apsbtet.net/studentportal/screens/MainStudentInfo.aspx');

    await page.fill('#ContentPlaceHolder1_txtpinno', pin);
    await page.click('#ContentPlaceHolder1_btngetunitmarks');
    await page.waitForSelector('#ContentPlaceHolder1_gvMArks');

    const name = await page.textContent('#ContentPlaceHolder1_lblName');
    const father = await page.textContent('#ContentPlaceHolder1_lblFather');
    //const branch = await page.textContent('#ContentPlaceHolder1_lblbranch');
    // Extract unit marks
    const unitRows = await page.$$('#ContentPlaceHolder1_gvMArks tr');
    const unitMarks = [];
    const testsPerSubject = pin.startsWith('24') ? 3 : 2; // Determine if there are 3 or 2 tests per subject
    const rowsPerTest = Math.floor(unitRows.length / testsPerSubject); // Calculate rows per test

    for (let i = 0; i < rowsPerTest; i++) {
      const test1 = parseInt((await unitRows[i].$$eval('td', cells => cells[6]?.textContent?.trim())) || '0', 10);
      const test2 = parseInt((await unitRows[i + rowsPerTest].$$eval('td', cells => cells[6]?.textContent?.trim())) || '0', 10);
      const test3 = testsPerSubject === 3
        ? parseInt((await unitRows[i + 2 * rowsPerTest].$$eval('td', cells => cells[6]?.textContent?.trim())) || '0', 10)
        : 0;

      unitMarks.push([test1, test2, test3]);
    }

    // Calculate dynamic averages based on PIN prefix
    const averagedUnitMarks = calculateDynamicAverageMarks(unitMarks, pin);

    await page.click('#ContentPlaceHolder1_btngetsessionmarks');
    await page.waitForSelector('#ContentPlaceHolder1_gvMArks');

    const sessionRows = await page.$$('#ContentPlaceHolder1_gvMArks tr');
    const sessionMarks = [];
    for (const row of sessionRows.slice(1)) {
      const cells = await row.$$('td');
      const cellTexts = await Promise.all(cells.map(cell => cell.textContent()));
      const obtainedMarks = parseInt(cellTexts[5]?.trim() || '0', 10);
      sessionMarks.push(obtainedMarks);
    }

    const totalUnitSubjects = averagedUnitMarks.length;
    const totalSessionSubjects = sessionMarks.length;

    const unitSubjectCodes = generateSubjectCodes(pin, pin.startsWith('24') ? 101 : 401, totalUnitSubjects);
    const sessionSubjectCodes = generateSubjectCodes(pin, unitSubjectCodes[unitSubjectCodes.length - 1] + 1, totalSessionSubjects);

    let totalInternalUnit = 0;
    let totalExternalUnit = 0;

    for (let i = 0; i < unitSubjectCodes.length; i++) {
      averagedUnitMarks[i] = Math.min(averagedUnitMarks[i], 80);
      const externalMarks = calculateExternalMarksForSubject(averagedUnitMarks[i], pin, unitSubjectCodes[i]);
      totalInternalUnit += averagedUnitMarks[i];
      totalExternalUnit += externalMarks;
    }

    let totalInternalSession = 0;
    let totalExternalSession = 0;

    for (let i = 0; i < sessionSubjectCodes.length; i++) {
      sessionMarks[i] = Math.min(sessionMarks[i], 80);
      const externalMarks = calculateExternalMarksForSubject(sessionMarks[i], pin, sessionSubjectCodes[i], true);
      totalInternalSession += sessionMarks[i];
      totalExternalSession += externalMarks;
    }

    const GrandTotal = totalInternalUnit + totalExternalUnit + totalInternalSession + totalExternalSession;

    // Fetch photo
    await page.goto('https://sbtet.ap.gov.in/APSBTET/registerInstant.do');
    await page.fill('#aadhar1', pin);
    await page.click('input[type="button"][value="GO"]');
    await page.waitForSelector('input.form-control-plaintext');

// Locate the label with the text "Branch" and find the associated input field
const branch = await page.getAttribute('label:has-text("Branch") + div > input', 'value');
    const images = await page.$$('img');
    let photoBase64 = null;

    if (images.length >= 3) {
      const thirdImage = images[2];
      const imgSrc = await thirdImage.getAttribute('src');
      if (imgSrc) {
        photoBase64 = imgSrc.replace('data:image/jpg;base64,', '');
      }
    }

    const result = {
      name: name.trim(),
      pin: pin.toUpperCase().trim(),
      branch: branch.trim(),
      photoBase64,
      unitResults: unitSubjectCodes.map((code, index) => {
        const internalMarks = averagedUnitMarks[index];
        const externalMarks = calculateExternalMarksForSubject(internalMarks, pin, code);
        const totalMarks = internalMarks + externalMarks;
        const { gradePoints, grade, status } = calculateGradeDetails(totalMarks);

        return {
          subjectCode: code,
          internalMarks,
          externalMarks,
          totalMarks,
          gradePoints,
          credits: 2.5,
          grade,
          status,
        };
      }),
      sessionResults: sessionSubjectCodes.map((code, index) => {
        const internalMarks = sessionMarks[index];
        const externalMarks = calculateExternalMarksForSubject(internalMarks, pin, code, true);
        const totalMarks = internalMarks + externalMarks;
        const { gradePoints, grade, status } = calculateGradeDetails(totalMarks);

        return {
          subjectCode: code,
          internalMarks,
          externalMarks,
          totalMarks,
          gradePoints,
          credits: 1.0,
          grade,
          status,
        };
      }),
      totals: {
        totalInternalUnit,
        totalExternalUnit,
        totalInternalSession,
        totalExternalSession,
        GrandTotal,
      },
    };

    fs.writeFileSync('student-info.json', JSON.stringify(result, null, 2));
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch student info' });
  } finally {
    await browser.close();
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});