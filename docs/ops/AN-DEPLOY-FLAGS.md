# A.N plane feature flags (deploy)

| Variable | Default safe | Meaning |
|----------|--------------|---------|
| AN_ENABLE_AN_LOGIN | 0 | Show/use A.N login path |
| AN_MIGRATE_WRITES | 0 | Allow migrate POST writes |
| AN_INV_PILOT_WRITES | 0 | Allow pilot stock movements |
| AN_ADAPTER_FAIL_CLOSED | 1 | Refuse silent primary on company load errors |
| AN_ALLOW_INMEMORY_FALLBACK | 0 | Allow in-memory only when STRICT_PROD_SECURITY and no DATABASE_URL |
| STRICT_PROD_SECURITY | false in CI | When true, no silent in-memory without allow flag |
| DATABASE_URL | required for real data | Prefer role an_erp_app NOBYPASSRLS |
| JWT_SECRET | required for A.N tokens | Long random secret |
| COOKIE_SECURE | auto | Force Secure cookies behind HTTPS |

Do not enable write flags in production until auth bridge + PG role probe pass.
