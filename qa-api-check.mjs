const apiBase = "http://localhost:5000/api";
const tokens = {
  admin: "eyJhbGciOiJFZERTQSIsImtpZCI6IjZhZmVjZjk5Nzg5ZDgyMmRiMDQwYzg3OCJ9.eyJpYXQiOjE3OTUxMDIzMTgsIm5hbWUiOiJRQSBBZG1pbiIsImVtYWlsIjoicWEtYWRtaW5AcmVudHN5LnRlc3QiLCJlbWFpbFZlcmlmaWVkIjpmYWxzZSwiY3JlYXRlZEF0IjoiMjAyNi0xMS0xOVQxNTozMDo0OS40OTJaIiwidXBkYXRlZEF0IjoiMjAyNi0xMS0xOVQxNTozMDo0OS40OTJaIiwiaWQiOiI2YWZmMTYyOTJhOTg3MzQ2OTMwNTExYzAiLCJzdWIiOiI2YWZmMTYyOTJhOTg3MzQ2OTMwNTExYzAiLCJleHAiOjE3OTUxMDMyMTgsImlzcyI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMCIsImF1ZCI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMCJ9.pLfdto8p7SbMHAcujq9Ty-uxa60q1NEPRSUPuGchnUR7uopfZCY7ePni655k47EWLxWRJSHN7uJr6Tk-a_4MAA",
  owner: "eyJhbGciOiJFZERTQSIsImtpZCI6IjZhZmVjZjk5Nzg5ZDgyMmRiMDQwYzg3OCJ9.eyJpYXQiOjE3OTUxMDIzMTgsIm5hbWUiOiJRQSBPd25lciIsImVtYWlsIjoicWEtb3duZXJAcmVudHN5LnRlc3QiLCJlbWFpbFZlcmlmaWVkIjpmYWxzZSwiY3JlYXRlZEF0IjoiMjAyNi0xMS0xOVQxNTozMDo1MC4wMDRaIiwidXBkYXRlZEF0IjoiMjAyNi0xMS0xOVQxNTozMDo1MC4wMDRaIiwiaWQiOiI2YWZmMTYyYTJhOTg3MzQ2OTMwNTExYzMiLCJzdWIiOiI2YWZmMTYyYTJhOTg3MzQ2OTMwNTExYzMiLCJleHAiOjE3OTUxMDMyMTgsImlzcyI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMCIsImF1ZCI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMCJ9.erLRkBOcPlCq1FUapH_GWw_5pV14TOmKfMSP_BdAxlyh02hiNgoLlsP5PRTq_mzs3Jra2yjhg57CGvj7PHhRCQ",
  customer: "eyJhbGciOiJFZERTQSIsImtpZCI6IjZhZmVjZjk5Nzg5ZDgyMmRiMDQwYzg3OCJ9.eyJpYXQiOjE3OTUxMDIzMTksIm5hbWUiOiJRQSBDdXN0b21lciIsImVtYWlsIjoicWEtY3VzdG9tZXJAcmVudHN5LnRlc3QiLCJlbWFpbFZlcmlmaWVkIjpmYWxzZSwiY3JlYXRlZEF0IjoiMjAyNi0xMS0xOVQxNTozMDo1MC40ODNaIiwidXBkYXRlZEF0IjoiMjAyNi0xMS0xOVQxNTozMDo1MC40ODNaIiwiaWQiOiI2YWZmMTYyYTJhOTg3MzQ2OTMwNTExYzYiLCJzdWIiOiI2YWZmMTYyYTJhOTg3MzQ2OTMwNTExYzYiLCJleHAiOjE3OTUxMDMyMTksImlzcyI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMCIsImF1ZCI6Imh0dHA6Ly9sb2NhbGhvc3Q6MzAwMCJ9.nbBSwj9zboQMc_02V2cm34-0N8EZJJEnP6rdKseMEQ_kSbgBXYMsEfg8wgVMsKpkHmy68LVrpi1rbWNTY67nAg",
};

const checks = [
  ["admin", "/analytics/admin"],
  ["admin", "/users"],
  ["admin", "/bookings"],
  ["owner", "/analytics/owner"],
  ["owner", "/equipment/manage"],
  ["owner", "/bookings/owner"],
  ["customer", "/analytics/customer"],
  ["customer", "/bookings/my"],
  ["customer", "/favorites"],
];

for (const [role, path] of checks) {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { authorization: `Bearer ${tokens[role]}` },
  });
  const body = await res.json().catch(() => null);
  console.log(role, path, res.status, body?.success, body?.message ?? "");
}
