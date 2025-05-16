const express = require('express');
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

// Serve the index.html file
app.use(express.static(path.join(__dirname)));

// Function to generate a consistent random number based on a seed
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

// Function to calculate external marks for each subject
const calculateExternalMarksForSubject = (internal, pin, subjectCode, isSessional = false) => {
  // Generate a unique seed using PIN and subject code
  const seed = parseInt(`${pin}${subjectCode}`, 36); // Combine PIN and subject code as a string and convert to base-36
  const randomAdjustment = Math.floor(seededRandom(seed) * 13) - 6; // Random value between -6 and +6

  // Calculate a multiplier based on the subject code
  const baseMultiplier = 2.5; // Base multiplier for external marks
  const subjectMultiplier = baseMultiplier + (parseInt(subjectCode) % 10) * 0.3; // Increment multiplier by 0.3 for each subject

  let externalMarks;

  switch (subjectCode) {
    case '401': // Subject-specific logic for 401
      externalMarks = Math.round(subjectMultiplier * internal + 1 + randomAdjustment);
      break;

    case '402': // Subject-specific logic for 402
      externalMarks = Math.round(subjectMultiplier * internal + 4 + randomAdjustment);
      break;

    case '403': // Subject-specific logic for 403
      externalMarks = Math.round(subjectMultiplier * internal + 13 + randomAdjustment);
      break;

    case '404': // Subject-specific logic for 404
      externalMarks = Math.round(subjectMultiplier * internal + 2 + randomAdjustment);
      break;

    case '405': // Subject-specific logic for 405
      externalMarks = Math.round(subjectMultiplier * internal + 5 + randomAdjustment);
      break;

    default: // Default logic for other subjects
      externalMarks = Math.round(subjectMultiplier * internal + 6 + randomAdjustment);
      break;
  }

  // Ensure internal marks are less than 80
  internal = Math.min(internal, 80);

  // Clamp external marks based on whether it's a sessional or unit exam
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
    const test1 = marks[i] || 0; // First test marks
    const test2 = marks[i + 1] || 0; // Second test marks
    const average = Math.round((test1 + test2) / 2); // Calculate average
    averagedMarks.push(average);
  }
  return averagedMarks;
};

// Function to calculate grade points, grade, and status
const calculateGradeDetails = (totalMarks) => {
  let gradePoints, grade, status;

  // Determine grade points and grade based on total marks
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
  } else if (totalMarks >= 40) {
    gradePoints = 5;
    grade = 'D';
  } else {
    gradePoints = 0;
    grade = 'F';
  }

  // Determine status (Pass/Fail)
  status = totalMarks >= 40 ? 'P' : 'F';

  return { gradePoints, grade, status };
};

// Endpoint to fetch student info
app.post('/fetch-student-info', async (req, res) => {
  const { pin } = req.body;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // Navigate to the student portal
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

    // Extract unit test marks
    const unitRows = await page.$$('#ContentPlaceHolder1_gvMArks tr');
    const unitMarks = [];
    for (const row of unitRows.slice(1)) { // Skip the header row
      const cells = await row.$$('td');
      const cellTexts = await Promise.all(cells.map(cell => cell.textContent()));

      // Extract marks and convert to integer
      const obtainedMarks = parseInt(cellTexts[6]?.trim() || '0', 10);
      unitMarks.push(obtainedMarks);
    }

    // Calculate average marks for unit tests
    const averagedUnitMarks = calculateAverageMarks(unitMarks);

    // Click the "GET SESSION MARKS" button
    await page.click('#ContentPlaceHolder1_btngetsessionmarks');

    // Wait for the table to update with session marks
    await page.waitForSelector('#ContentPlaceHolder1_gvMArks');

    // Extract session marks
    const sessionRows = await page.$$('#ContentPlaceHolder1_gvMArks tr');
    const sessionMarks = [];
    for (const row of sessionRows.slice(1)) { // Skip the header row
      const cells = await row.$$('td');
      const cellTexts = await Promise.all(cells.map(cell => cell.textContent()));

      // Extract marks and convert to integer
      const obtainedMarks = parseInt(cellTexts[5]?.trim() || '0', 10);
      sessionMarks.push(obtainedMarks);
    }

    // Dynamically determine the total number of subjects
    const totalUnitSubjects = averagedUnitMarks.length; // Use averaged marks for unit subjects
    const totalSessionSubjects = sessionMarks.length;

    // Generate subject codes dynamically
    const unitSubjectCodes = generateSubjectCodes(pin, pin.startsWith('24') ? 101 : 401, totalUnitSubjects);
    const sessionSubjectCodes = generateSubjectCodes(pin, unitSubjectCodes[unitSubjectCodes.length - 1] + 1, totalSessionSubjects);

    // Calculate totals for unit marks
    let totalInternalUnit = 0;
    let totalExternalUnit = 0;

    for (let i = 0; i < unitSubjectCodes.length; i++) {
      // Clamp internal marks to a maximum of 80
      averagedUnitMarks[i] = Math.min(averagedUnitMarks[i], 80);

      const externalMarks = calculateExternalMarksForSubject(averagedUnitMarks[i], pin, unitSubjectCodes[i]);
      totalInternalUnit += averagedUnitMarks[i];
      totalExternalUnit += externalMarks;
    }

    // Calculate totals for session marks
    let totalInternalSession = 0;
    let totalExternalSession = 0;

    for (let i = 0; i < sessionSubjectCodes.length; i++) {
      // Clamp internal marks to a maximum of 80
      sessionMarks[i] = Math.min(sessionMarks[i], 80);

      const externalMarks = calculateExternalMarksForSubject(sessionMarks[i], pin, sessionSubjectCodes[i], true);
      totalInternalSession += sessionMarks[i];
      totalExternalSession += externalMarks;
    }

    const GrandTotal = totalInternalUnit + totalExternalUnit + totalInternalSession + totalExternalSession;

    // Prepare the result object
    const result = {
      name: name.trim(),
      father: father.trim(),
      branch: branch.trim(),
      unitResults: unitSubjectCodes.map((code, index) => {
        const internalMarks = averagedUnitMarks[index];
        const externalMarks = calculateExternalMarksForSubject(internalMarks, pin, code);
        const totalMarks = internalMarks + externalMarks;

        // Calculate grade details
        const { gradePoints, grade, status } = calculateGradeDetails(totalMarks);

        return {
          subjectCode: code,
          internalMarks,
          externalMarks,
          totalMarks,
          gradePoints,
          credits: 2.5, // Example: Assign 3 credits for each unit subject
          grade,
          status,
        };
      }),
      sessionResults: sessionSubjectCodes.map((code, index) => {
        const internalMarks = sessionMarks[index];
        const externalMarks = calculateExternalMarksForSubject(internalMarks, pin, code, true);
        const totalMarks = internalMarks + externalMarks;

        // Calculate grade details
        const { gradePoints, grade, status } = calculateGradeDetails(totalMarks);

        return {
          subjectCode: code,
          internalMarks,
          externalMarks,
          totalMarks,
          gradePoints,
          credits: 1.0, // Example: Assign 2 credits for each sessional subject
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

    // Save the result to a JSON file
    fs.writeFileSync('student-info.json', JSON.stringify(result, null, 2));

    // Send the result as a response
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch student info' });
  } finally {
    await browser.close();
  }
});

// Start the server
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});