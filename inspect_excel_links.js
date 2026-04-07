import * as XLSX from 'xlsx';
import fs from 'fs';

const filePath = 'c:/Users/angaj/repos/foottfallBackend/Inventory for app (1).xlsx';
const data = fs.readFileSync(filePath);
const workbook = XLSX.read(data);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];

// Check cell B3 for a link as an example (adjust based on previous inspection)
// Row 2 (jsonData[0]) had "Retail shop" in column A (A3 if range 1 skip row 0,1)
// Wait, my JSON row 2 search showed Row 2 is the first data row.
// Let's check A3, B3, H3 etc.
const cellAddress = 'A3'; 
const cell = worksheet[cellAddress];
console.log(`Cell ${cellAddress}:`, JSON.stringify(cell, null, 2));

if (cell && cell.l) {
  console.log("Hyperlink found:", cell.l.Target);
} else {
  console.log("No hyperlink found in this cell.");
}

// Search for ANY cell with a link in the first few data rows
for (let r = 1; r < 5; r++) {
  for (let c = 0; c < 10; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cl = worksheet[addr];
    if (cl && cl.l) {
      console.log(`Link found at ${addr}:`, cl.l.Target, "(Text:", cl.v, ")");
    }
  }
}
