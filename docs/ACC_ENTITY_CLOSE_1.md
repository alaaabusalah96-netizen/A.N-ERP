# ACC-ENTITY-CLOSE-1 — إقفال دفاتر الكيان القانوني

## الفرق عن إقفال الفترة
إقفال الفترة (`/api/accounting/periods/close`) يغلق شهر/فترة.  
إقفال الكيان يضع حالة `EntityBooksState.CLOSED` على مستوى الشركة القانونية بعد إقفال فترة، ويمنع تحويلات بين الشركات (`STK-XCOMPANY`) بينما أحد الطرفين مقفل.

## API
| مسار | صلاحية | الوظيفة |
|---|---|---|
| GET `/api/accounting/entity-close-status` | PERIOD_CLOSE | حالة الدفاتر |
| POST `/api/accounting/entity-close` | PERIOD_CLOSE | إقفال (يتطلب periodId مقفلة) |
| POST `/api/accounting/entity-reopen` | PERIOD_CLOSE | إعادة فتح مع سبب |

## تكامل
`dispatch` / `receive` في `/api/xcompany/transfers` يرفضان إن كانت دفاتر المصدر أو الوجهة CLOSED.
