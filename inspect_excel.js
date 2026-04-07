import * as XLSX from 'xlsx';
import fs from 'fs';

const filePath = 'c:/Users/angaj/repos/foottfallBackend/Inventory for app (1).xlsx';
const data = fs.readFileSync(filePath);
const workbook = XLSX.read(data);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const jsonData = XLSX.utils.sheet_to_json(worksheet);

if (jsonData.length > 0) {
  console.log("Headers found:", Object.keys(jsonData[0]));
  console.log("Sample row:", JSON.stringify(jsonData[0], null, 2));
} else {
  console.log("No data found in the Excel file.");
}
