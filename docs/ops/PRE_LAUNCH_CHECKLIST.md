# قائمة ما قبل الإطلاق — OPS-PROD-LAUNCH-1

## 1) دور PostgreSQL بلا BYPASSRLS
1. شغّل `scripts/ops/create_an_erp_app_role.sql` كمسؤول قاعدة البيانات (غيّر كلمة المرور واسم القاعدة).
2. اضبط `DATABASE_URL` على مستخدم `an_erp_app` وليس `postgres`.
3. في الإنتاج: `export AN_ENFORCE_PROD_ROLE=1`.
4. تحقق:
   - `AN_ENFORCE_PROD_ROLE=1 npx tsx scripts/verifySec4ProdRole.ts` → Failed: 0
   - `AN_ENFORCE_PROD_ROLE=1 npx tsx scripts/verifySecProdRole.ts`
5. راجع `docs/ops/PROD-PG-ROLE.md`.

## 2) نسخة احتياطية يدوية
1. `export DATABASE_URL=...`
2. `chmod +x scripts/ops/backup_before_launch.sh`
3. `./scripts/ops/backup_before_launch.sh`
4. انقل ملف `.dump` إلى تخزين خارج الخادم ووثّق المسار والتاريخ.

## 3) بوابة الإنتاج
- `GET /api/platform/gate-prod` أو `npx tsx scripts/verifyGateProd1.ts`
- الحكم المتوقع مع CONFIG موثّق: **CONDITIONAL_GO** حتى يُطبَّق دور PG في البيئة الفعلية.

## 4) بعد تطبيق الدور في الإنتاج
- أعد تشغيل الخادم مع `AN_ENFORCE_PROD_ROLE=1`.
- إن نجح الإقلاع وفحوصات SEC4: يمكن اعتبار `PROD-ROLE-BYPASSRLS` مغلقًا تشغيليًا في تلك البيئة.
