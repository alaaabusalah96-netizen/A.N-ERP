# Adapter routing check
1. Company A: isolation Shared, connection_ref=DATABASE_URL
2. Company B: isolation Dedicated, connection_ref=COMPANY_B_DATABASE_URL (env name only)
3. Run: npx tsx scripts/verifyAnAdapterRouteTest1.ts
4. Live (optional): set both env URLs, call GET stock for each companyId with admin session; compare adapterResolution.connectionRef in JSON
