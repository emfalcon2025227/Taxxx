process.env.NODE_ENV = "test";

import dotenv from "dotenv";
import crypto from "crypto";
import { app } from "./server";
dotenv.config({ path: "./.env", override: true });

const AUTH_SECRET_KEY = process.env.AUTH_SECRET_KEY || process.env.JWT_SECRET || "uae_tax_accounting_system_secure_secret_2026_jwt";

function makeToken(payload: object, secret: string = AUTH_SECRET_KEY): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("hex");
  return `${payloadB64}.${sig}`;
}

async function runTests() {
  const PORT = 3001;
  const server = app.listen(PORT);
  const BASE_URL = `http://localhost:${PORT}`;

  try {
    console.log("=======================================================");
    console.log("RUNNING REAL DATABASE PURCHASE EXPORT END-TO-END TESTS");
    console.log("=======================================================\n");

    const ownerToken = makeToken({
      username: "admin",
      role: "Owner",
      exp: Date.now() + 86400000
    });

    const authHeaders = { Authorization: `Bearer ${ownerToken}` };

    // TEST 1: Date Range with Both Taxable and Non-Taxable Purchases (2026-05-01 to 2026-06-30)
    console.log("🔍 TEST 1: ALL PURCHASES (Date Range: 2026-05-01 to 2026-06-30)");
    const res1 = await fetch(`${BASE_URL}/api/export/purchases?from=2026-05-01&to=2026-06-30&tax_status=all`, {
      headers: authHeaders
    });
    const data1 = await res1.json();
    console.log(`Status: ${res1.status}, Success: ${data1.success}, Total Count: ${data1.count}`);
    console.log("Summary:", JSON.stringify(data1.summary, null, 2));

    if (!data1.success || !data1.summary) {
      console.error("❌ TEST 1 FAILED: Expected success=true and summary totals");
      process.exit(1);
    }

    const { taxable, non_taxable, grand_total } = data1.summary;

    // Verify Taxable + Non-Taxable = Grand Total
    const countMatch = (taxable.count + non_taxable.count) === grand_total.count;
    const netMatch = Math.abs((taxable.net + non_taxable.net) - grand_total.net) < 0.05;
    const vatMatch = Math.abs((taxable.vat + non_taxable.vat) - grand_total.vat) < 0.05;
    const grossMatch = Math.abs((taxable.gross + non_taxable.gross) - grand_total.gross) < 0.05;

    console.log(`✓ Count Equation (Taxable + Non-Taxable == All): ${countMatch} (${taxable.count} + ${non_taxable.count} == ${grand_total.count})`);
    console.log(`✓ Net Total Equation: ${netMatch} (${taxable.net} + ${non_taxable.net} == ${grand_total.net})`);
    console.log(`✓ VAT Total Equation: ${vatMatch} (${taxable.vat} + ${non_taxable.vat} == ${grand_total.vat})`);
    console.log(`✓ Gross Total Equation: ${grossMatch} (${taxable.gross} + ${non_taxable.gross} == ${grand_total.gross})`);

    if (!countMatch || !netMatch || !vatMatch || !grossMatch) {
      console.error("❌ MATHEMATICAL EQUATION FAILURE!");
      process.exit(1);
    }

    // TEST 2: TAX-APPLIED PURCHASES ONLY
    console.log("\n🔍 TEST 2: TAX-APPLIED PURCHASES ONLY (2026-05-01 to 2026-06-30)");
    const res2 = await fetch(`${BASE_URL}/api/export/purchases?from=2026-05-01&to=2026-06-30&tax_status=taxable`, {
      headers: authHeaders
    });
    const data2 = await res2.json();
    console.log(`Status: ${res2.status}, Taxable Count: ${data2.count}`);
    const hasZeroVatInTaxable = data2.records.some((r: any) => r.vat_amount === 0 && r.tax_mode === "exempt");
    console.log(`✓ No exempt/zero-VAT records inside Tax-Applied filter: ${!hasZeroVatInTaxable}`);

    if (hasZeroVatInTaxable || data2.count !== taxable.count) {
      console.error("❌ TEST 2 FAILED: Tax-Applied filter returned incorrect records!");
      process.exit(1);
    }

    // TEST 3: NON-TAXABLE / NO-VAT PURCHASES ONLY
    console.log("\n🔍 TEST 3: NON-TAXABLE / NO-VAT PURCHASES ONLY (2026-05-01 to 2026-06-30)");
    const res3 = await fetch(`${BASE_URL}/api/export/purchases?from=2026-05-01&to=2026-06-30&tax_status=non_taxable`, {
      headers: authHeaders
    });
    const data3 = await res3.json();
    console.log(`Status: ${res3.status}, Non-Taxable Count: ${data3.count}`);
    const allZeroVatInNonTaxable = data3.records.every((r: any) => Number(r.vat_amount || 0) === 0 || r.tax_mode === "exempt");
    console.log(`✓ All records in Non-Taxable report have zero VAT: ${allZeroVatInNonTaxable}`);

    if (!allZeroVatInNonTaxable || data3.count !== non_taxable.count) {
      console.error("❌ TEST 3 FAILED: Non-Taxable filter returned incorrect records!");
      process.exit(1);
    }

    // TEST 4: Verify Sales are strictly excluded from Purchase Export
    console.log("\n🔍 TEST 4: EXCLUDE SALES VERIFICATION");
    const containsSales = data1.records.some((r: any) => r.transaction_type === "sales");
    console.log(`✓ Zero sales transactions in purchase export: ${!containsSales}`);
    if (containsSales) {
      console.error("❌ TEST 4 FAILED: Sales records detected inside purchase export!");
      process.exit(1);
    }

    // TEST 5: Date Range with No Purchases (e.g., 2010-01-01 to 2010-01-02)
    console.log("\n🔍 TEST 5: NO PURCHASES FOUND (Empty State)");
    const res5 = await fetch(`${BASE_URL}/api/export/purchases?from=2010-01-01&to=2010-01-02&tax_status=all`, {
      headers: authHeaders
    });
    const data5 = await res5.json();
    console.log(`Status: ${res5.status}, Success: ${data5.success}, Count: ${data5.count}, Message: "${data5.message}"`);
    if (data5.success !== false || data5.count !== 0) {
      console.error("❌ TEST 5 FAILED: Expected success=false and count=0 for empty date range");
      process.exit(1);
    }

    // TEST 6: Invalid Date Range (from > to)
    console.log("\n🔍 TEST 6: INVALID DATE RANGE (from > to)");
    const res6 = await fetch(`${BASE_URL}/api/export/purchases?from=2026-06-30&to=2026-05-01&tax_status=all`, {
      headers: authHeaders
    });
    const data6 = await res6.json();
    console.log(`Status: ${res6.status}, Error: "${data6.error}"`);
    if (res6.status !== 400 || !data6.error) {
      console.error("❌ TEST 6 FAILED: Expected 400 Bad Request for invalid date range");
      process.exit(1);
    }

    // TEST 7: Filename Naming Pattern Verification
    console.log("\n🔍 TEST 7: FILENAME PATTERN VERIFICATION");
    console.log(`✓ Tax-Applied Filename  : ${data2.filename}`);
    console.log(`✓ Non-Taxable Filename : ${data3.filename}`);
    console.log(`✓ All Purchases Filename: ${data1.filename}`);

    const f2Valid = data2.filename.startsWith("Purchases_TaxApplied_");
    const f3Valid = data3.filename.startsWith("Purchases_NonTaxable_");
    const f1Valid = data1.filename.startsWith("Purchases_All_");

    if (!f2Valid || !f3Valid || !f1Valid) {
      console.error("❌ TEST 7 FAILED: Filename pattern invalid!");
      process.exit(1);
    }

    console.log("\n=======================================================");
    console.log("ALL REAL DATABASE PURCHASE EXPORT TESTS PASSED PERFECTLY!");
    console.log("=======================================================");

  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
