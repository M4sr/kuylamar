import assert from "node:assert/strict";
import { test } from "node:test";
import { isJobstreetUrl, parseJobPage } from "./extract.ts";

// Bentuk halaman JobStreet: window.SK_DL + payload internal berisi content2 (HTML ter-escape).
const PAGE = `<html><head>
<meta property="og:title" content="Front End Next JS Developer Job in Jakarta Raya - Jobstreet"/>
<meta property="og:description" content="Ringkasan singkat lowongan."/>
</head><body><script>
window.SK_DL = {"brand":"jobstreet","jobId":"95332609","jobTitle":"Front End Next JS Developer","advertiserName":"Steradian Data Optima","companyName":"Steradian Data Optima","jobSalary":"Rp 7.000.000 \\u2013 Rp 9.000.000 per month","jobStatus":"active"};
window.X = {"id":"95332609","title":"Front End Next JS Developer","abstract":"Ringkasan singkat lowongan.","content2":"\\u003Cp\\u003E\\u003Cstrong\\u003EFrontend Developer\\u003C\\u002Fstrong\\u003E\\u003C\\u002Fp\\u003E\\u003Cp\\u003EJob Description\\u003C\\u002Fp\\u003E\\u003Cul\\u003E\\u003Cli\\u003E\\u003Cp\\u003EBuild UI with Next.js and TypeScript\\u003C\\u002Fp\\u003E\\u003C\\u002Fli\\u003E\\u003Cli\\u003E\\u003Cp\\u003EUse TailwindCSS &amp; Git\\u003C\\u002Fp\\u003E\\u003C\\u002Fli\\u003E\\u003C\\u002Ful\\u003E"};
</script></body></html>`;

test("ambil posisi, perusahaan, deskripsi dari halaman lowongan", () => {
  const j = parseJobPage(PAGE, "https://id.jobstreet.com/id/job/95332609");
  assert.equal(j.position, "Front End Next JS Developer");
  assert.equal(j.company, "Steradian Data Optima");
  assert.equal(j.source, "JobStreet");
  assert.ok(j.description?.includes("Build UI with Next.js and TypeScript"));
  assert.ok(j.description?.includes("• Use TailwindCSS & Git"), "bullet & entity harus rapi");
  assert.ok(j.description?.includes("Rp 7.000.000"), "gaji ikut terbawa");
  assert.ok(!j.description?.includes("<"), "tidak boleh menyisakan tag HTML");
});

test("halaman tanpa data internal jatuh ke meta tag", () => {
  const j = parseJobPage(
    `<meta property="og:title" content="Backend Engineer Job in Bandung - Jobstreet"/><meta name="description" content="Butuh Go &amp; Postgres."/>`,
  );
  assert.equal(j.position, "Backend Engineer");
  assert.equal(j.description, "Butuh Go & Postgres.");
});

test("halaman kosong tidak error, hasilnya kosong", () => {
  assert.deepEqual(parseJobPage("<html></html>"), {
    position: undefined,
    company: undefined,
    description: undefined,
    source: "JobStreet",
    url: undefined,
  });
});

test("hanya URL JobStreet yang diterima", () => {
  assert.ok(isJobstreetUrl("https://id.jobstreet.com/id/job/95332609"));
  assert.ok(isJobstreetUrl("https://www.jobstreet.co.id/lowongan/abc"));
  assert.ok(!isJobstreetUrl("https://example.com/job/1"));
  assert.ok(!isJobstreetUrl("not a url"));
});
