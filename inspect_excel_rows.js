import * as XLSX from 'xlsx';
import fs from 'fs';

const filePath = 'c:/Users/angaj/repos/foottfallBackend/Inventory for app (1).xlsx';
const data = fs.readFileSync(filePath);
const workbook = XLSX.read(data);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log("First 5 rows:");
rows.slice(0, 5).forEach((row, i) => {
  console.log(`Row ${i}:`, JSON.stringify(row));
});
