/**
 * @file ActivityTemplates.ts
 * @description 50 Business Activity Templates & Country Tax Rules for A.N ERP (v7.1 / Phase 2)
 * Strictly conforms to Section 10.2 & Phase 19 Activity Templates.
 * Each template maps to initial Chart of Accounts + Activated Modules from the 15 standard modules.
 */

import { CountryTaxRule, Account } from '../storage/StoragePort';

export interface StandardModuleDef {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
}

export const STANDARD_MODULES: StandardModuleDef[] = [
  { id: 'accounting', nameAr: 'المحاسبة العامة والأستاذ العام', nameEn: 'General Ledger & Accounting', descriptionAr: 'قيود اليومية وميزان المراجعة والقوائم المالية' },
  { id: 'custody', nameAr: 'العهدة النقدية والمصروفات النثرية', nameEn: 'Petty Cash & Custody', descriptionAr: 'تسوية وصرف العهد ومتابعة الأرصدة المؤقتة' },
  { id: 'expenses', nameAr: 'المصروفات والمستحقات', nameEn: 'Expenses & Payables', descriptionAr: 'إدارة فواتير ومصروفات التشغيل ومستحقات الموردين' },
  { id: 'inventory', nameAr: 'إدارة المخازن والمستودعات', nameEn: 'Inventory & Warehousing', descriptionAr: 'أرصدة الأصناف والجرد والتحويلات المستودعية' },
  { id: 'purchasing', nameAr: 'المشتريات وإدارة الموردين', nameEn: 'Purchasing & Procurement', descriptionAr: 'أوامر الشراء وفواتير التوريد وتقييم الموردين' },
  { id: 'sales', nameAr: 'المبيعات والعملاء والفواتير', nameEn: 'Sales & Invoicing', descriptionAr: 'عروض الأسعار والفواتير الضريبية وسندات القبض' },
  { id: 'pos', nameAr: 'نقاط البيع السريعة', nameEn: 'Point of Sale (POS)', descriptionAr: 'كاشير الكاونتر والفواتير المبسطة وطاولات المطاعم' },
  { id: 'assets', nameAr: 'الأصول الثابتة والإهلاك', nameEn: 'Fixed Assets & Depreciation', descriptionAr: 'سجل الأصول وحساب الإهلاك الشهري والسنوي الآلي' },
  { id: 'hr', nameAr: 'الموارد البشرية والرواتب', nameEn: 'HR & Payroll', descriptionAr: 'ملفات الموظفين ومسير الرواتب والإجازات' },
  { id: 'crm', nameAr: 'علاقات العملاء والفرص البيعية', nameEn: 'CRM & Pipeline', descriptionAr: 'إدارة العملاء المحتملين ومتابعة مسار الصفقات' },
  { id: 'fleet', nameAr: 'إدارة الأسطول والنقليات', nameEn: 'Fleet & Logistics', descriptionAr: 'تتبع المركبات والصيانة ومصروفات الوقود والتشغيل' },
  { id: 'projects', nameAr: 'المشاريع ومراكز التكلفة', nameEn: 'Project Costing & Contracts', descriptionAr: 'مستخلصات المقاولات وحساب ربحية المشروعات' },
  { id: 'manufacturing', nameAr: 'التصنيع وتكاليف الإنتاج', nameEn: 'Manufacturing & BOM', descriptionAr: 'أوامر التصنيع ومعادلات المواد الخام وتكاليف التشغيل' },
  { id: 'documents', nameAr: 'إدارة المستندات ومكتب المساعدة', nameEn: 'Document Archival & Helpdesk', descriptionAr: 'الأرشفة الرقمية وتذاكر الدعم الفني والخدمات الداخلية' },
  { id: 'ecommerce', nameAr: 'التجارة الإلكترونية والربط الرقمي', nameEn: 'E-Commerce Integration', descriptionAr: 'ربط المتاجر الإلكترونية وبوابات الدفع والتوصيل' },
];

export const INITIAL_COUNTRY_TAX_RULES: CountryTaxRule[] = [
  {
    countryCode: 'SA',
    countryNameAr: 'المملكة العربية السعودية',
    standardVatRate: 0.15,
    currencyCode: 'SAR',
    taxAuthorityName: 'هيئة الزكاة والضريبة والجمارك (ZATCA)',
    taxIdFormatRegex: '^3\\d{13}3$',
    updatedAt: new Date().toISOString(),
  },
  {
    countryCode: 'EG',
    countryNameAr: 'جمهورية مصر العربية',
    standardVatRate: 0.14,
    currencyCode: 'EGP',
    taxAuthorityName: 'مصلحة الضرائب المصرية (ETA)',
    taxIdFormatRegex: '^\\d{9}$',
    updatedAt: new Date().toISOString(),
  },
  {
    countryCode: 'AE',
    countryNameAr: 'الإمارات العربية المتحدة',
    standardVatRate: 0.05,
    currencyCode: 'AED',
    taxAuthorityName: 'الهيئة الاتحادية للضرائب (FTA)',
    taxIdFormatRegex: '^\\d{15}$',
    updatedAt: new Date().toISOString(),
  },
  {
    countryCode: 'OM',
    countryNameAr: 'سلطنة عُمان',
    standardVatRate: 0.05,
    currencyCode: 'OMR',
    taxAuthorityName: 'جهاز الضرائب العماني (OTA)',
    taxIdFormatRegex: '^\\d{8,10}$',
    updatedAt: new Date().toISOString(),
  },
  {
    countryCode: 'BH',
    countryNameAr: 'مملكة البحرين',
    standardVatRate: 0.10,
    currencyCode: 'BHD',
    taxAuthorityName: 'الجهاز الوطني للإيرادات (NBR)',
    taxIdFormatRegex: '^\\d{15}$',
    updatedAt: new Date().toISOString(),
  },
  {
    countryCode: 'KW',
    countryNameAr: 'دولة الكويت',
    standardVatRate: 0.00,
    currencyCode: 'KWD',
    taxAuthorityName: 'وزارة المالية الكويتية',
    taxIdFormatRegex: '^\\d{7,12}$',
    updatedAt: new Date().toISOString(),
  },
  {
    countryCode: 'QA',
    countryNameAr: 'دولة قطر',
    standardVatRate: 0.00,
    currencyCode: 'QAR',
    taxAuthorityName: 'الهيئة العامة للضرائب (GTA)',
    taxIdFormatRegex: '^\\d{8,11}$',
    updatedAt: new Date().toISOString(),
  },
];

export interface ActivityTemplate {
  id: string;
  code: string;
  categoryAr: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  defaultModules: string[];
  initialChartOfAccounts: Array<{
    code: string;
    nameAr: string;
    type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  }>;
}

// Generate base COA accounts common to all commercial entities
function createBaseAccounts(): Array<{ code: string; nameAr: string; type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE' }> {
  return [
    { code: '1010', nameAr: 'الصندوق والنقدية بالخزينة', type: 'ASSET' },
    { code: '1020', nameAr: 'الحسابات الجارية بالبنوك', type: 'ASSET' },
    { code: '1030', nameAr: 'العملاء والمدينون التجاريون', type: 'ASSET' },
    { code: '1040', nameAr: 'مخزون البضائع والمواد', type: 'ASSET' },
    { code: '1050', nameAr: 'العهد النقدية المؤقتة', type: 'ASSET' },
    { code: '2010', nameAr: 'الموردون والدائنون التجاريون', type: 'LIABILITY' },
    { code: '2020', nameAr: 'أمانات ضريبة القيمة المضافة المحصلة', type: 'LIABILITY' },
    { code: '2030', nameAr: 'مصروفات مستحقة وأرصدة دائنة', type: 'LIABILITY' },
    { code: '3010', nameAr: 'رأس المال المدفوع', type: 'EQUITY' },
    { code: '3020', nameAr: 'الأرباح والخسائر المبقاة', type: 'EQUITY' },
    { code: '4010', nameAr: 'إيرادات المبيعات والخدمات الرئيسية', type: 'REVENUE' },
    { code: '5010', nameAr: 'تكلفة البضاعة والمواد المستهلكة', type: 'EXPENSE' },
    { code: '5020', nameAr: 'الرواتب والأجور ومستحقات العاملين', type: 'EXPENSE' },
    { code: '5030', nameAr: 'مصروفات الإيجار والمرافق', type: 'EXPENSE' },
    { code: '5040', nameAr: 'المصروفات الإدارية والتشغيلية العامة', type: 'EXPENSE' },
  ];
}

// Full catalogue of 50 Business Activity Templates
export const ACTIVITY_TEMPLATES: ActivityTemplate[] = [
  // 1-8: الضيافة والمطاعم والتموين
  {
    id: 'tmpl-01',
    code: 'REST-FULL',
    categoryAr: 'الضيافة والمطاعم',
    nameAr: 'مطاعم الوجبات السريعة والسحابية',
    nameEn: 'Fast Food & Cloud Kitchens',
    descriptionAr: 'قالب متخصص في المطابخ السحابية والمطاعم السريعة مع نقاط البيع وإدارة هالك المواد الخام',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'pos'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1041', nameAr: 'مخزون المواد الغذائية والمكونات الطازجة', type: 'ASSET' },
      { code: '1042', nameAr: 'مخزون مواد التغليف والتعبئة', type: 'ASSET' },
      { code: '4011', nameAr: 'إيرادات مبيعات الصالة والوجبات', type: 'REVENUE' },
      { code: '4012', nameAr: 'إيرادات تطبيقات التوصيل الخارجية', type: 'REVENUE' },
      { code: '5011', nameAr: 'تكلفة المكونات الغذائية والتوالف', type: 'EXPENSE' },
      { code: '5012', nameAr: 'عمولات منصات التوصيل', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-02',
    code: 'CAFE-SPEC',
    categoryAr: 'الضيافة والمطاعم',
    nameAr: 'المقاهي والكافيهات والمخابز العصرية',
    nameEn: 'Specialty Cafes & Modern Bakeries',
    descriptionAr: 'نقاط بيع سريعة مع تتبع مخزون البن والحلويات وحساب تكلفة الكوب المباشرة',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'pos'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1041', nameAr: 'مخزون البن الأخضر والمحمص والمشروبات', type: 'ASSET' },
      { code: '4011', nameAr: 'إيرادات مبيعات المشروبات الساخنة والباردة', type: 'REVENUE' },
      { code: '4012', nameAr: 'إيرادات المعجنات والحلويات', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-03',
    code: 'CATR-EVNT',
    categoryAr: 'الضيافة والمطاعم',
    nameAr: 'شركات الإعاشة والتموين والحفلات',
    nameEn: 'Catering & Event Food Services',
    descriptionAr: 'إدارة عقود الإعاشة، توريدات المناسبات الكبرى وتكلفة الوجبات التعاقدية',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'projects', 'fleet'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '4011', nameAr: 'إيرادات عقود الإعاشة المؤسسية', type: 'REVENUE' },
      { code: '4012', nameAr: 'إيرادات بوفيهات الحفلات والمناسبات', type: 'REVENUE' },
      { code: '5013', nameAr: 'مصروفات تجهيز ونقل البوفيهات الميدانية', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-04',
    code: 'BAKE-PROD',
    categoryAr: 'الضيافة والمطاعم',
    nameAr: 'المخابز الآلية ومصانع الحلويات',
    nameEn: 'Automated Bakeries & Confectioneries',
    descriptionAr: 'تصنيع غذائي وخطوط إنتاج للمخبوزات وتوزيع على منافذ البيع والسوبرماركت',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'manufacturing', 'fleet'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1043', nameAr: 'مخزون الطحين والمحسنات ومستلزمات الخبز', type: 'ASSET' },
      { code: '5014', nameAr: 'استهلاك غاز وطاقة خطوط أفران الإنتاج', type: 'EXPENSE' },
    ],
  },

  // 5-12: المقاولات والتطوير العقاري والبناء
  {
    id: 'tmpl-05',
    code: 'CONT-GENL',
    categoryAr: 'المقاولات والبناء',
    nameAr: 'المقاولات العامة والإنشاءات والتعمير',
    nameEn: 'General Contracting & Civil Works',
    descriptionAr: 'إدارة مستخلصات المالك، مقاولي الباطن، مراكز تكلفة المشاريع وضمانات البنوك',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'projects', 'fleet', 'assets'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1035', nameAr: 'أرصدة محتجزة لدى العملاء (ضمان أعمال)', type: 'ASSET' },
      { code: '1045', nameAr: 'مخزون مواد البناء والحديد والإسمنت', type: 'ASSET' },
      { code: '2015', nameAr: 'مقاولو الباطن ومستحقات التنفيذ', type: 'LIABILITY' },
      { code: '4015', nameAr: 'إيرادات المستخلصات المعتمدة للمشاريع', type: 'REVENUE' },
      { code: '5015', nameAr: 'تكاليف مقاولي الباطن والعمالة المباشرة', type: 'EXPENSE' },
      { code: '5016', nameAr: 'تكلفة استئجار وصيانة المعدات الثقيلة', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-06',
    code: 'ELEC-MECH',
    categoryAr: 'المقاولات والبناء',
    nameAr: 'مقاولات الكهروميكانيك والتكييف (MEP)',
    nameEn: 'Electromechanical & HVAC Contracting',
    descriptionAr: 'تنفيذ أعمال الدكت والتمديدات، الكوابل وتوريد وتركيب أنظمة التكييف والإنذار',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'projects'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1046', nameAr: 'مخزون الكوابل وقواطع الكهرباء والمواسير', type: 'ASSET' },
      { code: '4016', nameAr: 'إيرادات عقود الكهروميكانيك والمخططات', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-07',
    code: 'FINI-DECO',
    categoryAr: 'المقاولات والبناء',
    nameAr: 'أعمال التشطيبات والديكور والتصميم الداخلي',
    nameEn: 'Finishing, Interior Design & Fit-Out',
    descriptionAr: 'إدارة طلبات المواد الفاخرة، الرخام، الديكورات الجبصية والإشراف الميداني',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'projects', 'crm'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '4017', nameAr: 'إيرادات التصاميم والتشطيبات المعمارية', type: 'REVENUE' },
      { code: '5017', nameAr: 'أتعاب مصممي الديكور والحرفيين المتخصصين', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-08',
    code: 'REAL-DEVL',
    categoryAr: 'العقارات وإدارة الأملاك',
    nameAr: 'التطوير العقاري وتسويق المشاريع',
    nameEn: 'Real Estate Development & Brokerage',
    descriptionAr: 'شراء وتطوير الأراضي، إدارة البيع على الخارطة ومتابعة دفعات المستثمرين',
    defaultModules: ['accounting', 'expenses', 'purchasing', 'sales', 'projects', 'crm', 'documents'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1060', nameAr: 'مشاريع عقارية تحت التطوير والإنشاء', type: 'ASSET' },
      { code: '2040', nameAr: 'دفعات مقدمة من مشتري الوحدات العقارية', type: 'LIABILITY' },
      { code: '4020', nameAr: 'إيرادات بيع وتطوير الوحدات السكنية والتجارية', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-09',
    code: 'PROP-MGMT',
    categoryAr: 'العقارات وإدارة الأملاك',
    nameAr: 'إدارة الأملاك وتأجير العقارات والمجمعات',
    nameEn: 'Property Management & Leasing Services',
    descriptionAr: 'عقود الإيجار السنوية، إدارة الصيانة والتحصيل والربط مع شبكة إيجار',
    defaultModules: ['accounting', 'custody', 'expenses', 'sales', 'crm', 'documents'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '2045', nameAr: 'إيرادات تأجير مقبوضة مقدماً', type: 'LIABILITY' },
      { code: '4025', nameAr: 'إيرادات إدارة وتأجير العقارات والمباني', type: 'REVENUE' },
      { code: '5045', nameAr: 'مصروفات صيانة ونظافة المباني المشتركة', type: 'EXPENSE' },
    ],
  },

  // 10-18: التجارة والتجزئة والجملة والسوبرماركت
  {
    id: 'tmpl-10',
    code: 'RETL-SUPR',
    categoryAr: 'التجارة والتجزئة',
    nameAr: 'السوبرماركت والتموينات الكبرى',
    nameEn: 'Supermarkets & Grocery Mega Stores',
    descriptionAr: 'نقاط بيع باركود سريعة، إدارة تواريخ الصلاحية، الجرد المستمر والخصومات',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'pos'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1047', nameAr: 'مخزون الأغذية والتموينات الاستهلاكية', type: 'ASSET' },
      { code: '4030', nameAr: 'إيرادات مبيعات التجزئة بالكاشير', type: 'REVENUE' },
      { code: '5035', nameAr: 'هالك وتوالف الأطعمة منتهية الصلاحية', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-11',
    code: 'RETL-CLTH',
    categoryAr: 'التجارة والتجزئة',
    nameAr: 'محلات الملابس والموضة والإكسسوارات',
    nameEn: 'Fashion, Apparel & Accessories',
    descriptionAr: 'إدارة المقاسات والألوان والمواسم، ونقاط البيع مع المتجر الإلكتروني',
    defaultModules: ['accounting', 'expenses', 'inventory', 'purchasing', 'sales', 'pos', 'ecommerce'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1048', nameAr: 'مخزون الملابس والأحذية حسب الموديل', type: 'ASSET' },
      { code: '4031', nameAr: 'إيرادات مبيعات الفروع والأزياء', type: 'REVENUE' },
      { code: '4032', nameAr: 'إيرادات المتجر الإلكتروني وتطبيقات الشراء', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-12',
    code: 'RETL-ELEC',
    categoryAr: 'التجارة والتجزئة',
    nameAr: 'الأجهزة الإلكترونية والمنزلية والهواتف',
    nameEn: 'Electronics, Smartphones & Appliances',
    descriptionAr: 'تتبع السيريال نمبر والأرقام التسلسلية لكل قطعة، والضمان والصيانة',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'pos', 'ecommerce'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1049', nameAr: 'مخزون الإلكترونيات والهواتف بالرقم التسلسلي', type: 'ASSET' },
      { code: '2050', nameAr: 'مخصصات التزامات الضمان والصيانة', type: 'LIABILITY' },
      { code: '4033', nameAr: 'إيرادات بيع الأجهزة الذكية والأكسسوارات', type: 'REVENUE' },
      { code: '4034', nameAr: 'إيرادات خدمات تمديد الضمان والدعم الفني', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-13',
    code: 'WHLS-DIST',
    categoryAr: 'التجارة والجملة',
    nameAr: 'تجارة الجملة والتوزيع والتوكيلات',
    nameEn: 'Wholesale Trade & FMCG Distribution',
    descriptionAr: 'إدارة خطوط التوزيع، مندوبي المبيعات، خطط الائتمان ومتابعة تسعير الحزم',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'fleet', 'crm'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1036', nameAr: 'أرصدة عملاء الجملة والائتمان المفتوح', type: 'ASSET' },
      { code: '4035', nameAr: 'إيرادات مبيعات الجملة والطلبات الكبرى', type: 'REVENUE' },
      { code: '5050', nameAr: 'عمولات وبدلات مندوبي التوزيع الميداني', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-14',
    code: 'AUTO-PARTS',
    categoryAr: 'التجارة والتجزئة',
    nameAr: 'قطع غيار السيارات والزيوت والمعدات',
    nameEn: 'Auto Spare Parts & Lubricants',
    descriptionAr: 'البحث برقم الشاسيه ورقم القطعة الأصلي OEM وإدارة التوافقية بين الموديلات',
    defaultModules: ['accounting', 'expenses', 'inventory', 'purchasing', 'sales', 'pos'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1051', nameAr: 'مخزون قطع الغيار الميكانيكية والكهربائية', type: 'ASSET' },
      { code: '4036', nameAr: 'إيرادات مبيعات قطع الغيار والإطارات', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-15',
    code: 'BLDG-MTRL',
    categoryAr: 'التجارة والجملة',
    nameAr: 'تجارة مواد البناء والسباكة والدهانات',
    nameEn: 'Building Materials, Plumbing & Paints',
    descriptionAr: 'إدارة المبيعات بالوزن والمتر المربع وأكياس الإسمنت وأطنان الحديد والتوصيل',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'fleet'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1052', nameAr: 'مخزون الحديد والإسمنت ومواد السباكة', type: 'ASSET' },
      { code: '4037', nameAr: 'إيرادات توريدات المقاولين ومواد البناء', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-16',
    code: 'FURN-HOME',
    categoryAr: 'التجارة والتجزئة',
    nameAr: 'معارض الأثاث والمفروشات والديكور',
    nameEn: 'Furniture Showrooms & Home Decor',
    descriptionAr: 'إدارة مستودعات الكتل الكبيرة، التوصيل والتركيب المنزلي وأوامر الحجز المسبق',
    defaultModules: ['accounting', 'expenses', 'inventory', 'purchasing', 'sales', 'fleet', 'pos'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1053', nameAr: 'مخزون غرف النوم والأثاث المكتبي والمفروشات', type: 'ASSET' },
      { code: '4038', nameAr: 'إيرادات مبيعات الأثاث وأطقم الصالونات', type: 'REVENUE' },
      { code: '5055', nameAr: 'مصروفات تركيب ونقل الأثاث للعملاء', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-17',
    code: 'GOLD-JWLR',
    categoryAr: 'التجارة والتجزئة',
    nameAr: 'محلات الذهب والمجوهرات والساعات الثمينة',
    nameEn: 'Gold, Jewelry & Luxury Watches',
    descriptionAr: 'حساب التكلفة بالجرام عيار 18/21/24 وأجور المصنعية وتتبع القطع بالباركود الدقيق',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'pos'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1054', nameAr: 'مخزون الذهب والمجوهرات بالجرام والألماس', type: 'ASSET' },
      { code: '4039', nameAr: 'إيرادات بيع المشغولات الذهبية والمصنعية', type: 'REVENUE' },
      { code: '5060', nameAr: 'تكلفة المصنعية والصياغة المباشرة', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-18',
    code: 'PERF-COSM',
    categoryAr: 'التجارة والتجزئة',
    nameAr: 'العطور ومستحضرات التجميل والعناية',
    nameEn: 'Perfumes, Scents & Beauty Cosmetics',
    descriptionAr: 'خلطات العطور، زجاجات التعبئة، البكجات التسويقية ونقاط البيع بالفروع',
    defaultModules: ['accounting', 'expenses', 'inventory', 'purchasing', 'sales', 'pos', 'ecommerce'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1055', nameAr: 'مخزون الزيوت العطرية والزجاجات الفاخرة', type: 'ASSET' },
      { code: '4040', nameAr: 'إيرادات مبيعات العطور والبكجات التجميلية', type: 'REVENUE' },
    ],
  },

  // 19-24: الصحة والطب والصيدليات
  {
    id: 'tmpl-19',
    code: 'PHRM-CHIN',
    categoryAr: 'الصحة والطب',
    nameAr: 'الصيدليات ومستودعات الأدوية',
    nameEn: 'Pharmacies & Medical Dispensaries',
    descriptionAr: 'تتبع كود الهيئة العامة للغذاء والدواء ورقم التشغيلة وتواريخ الصلاحية والتسعيرة الجبرية',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'pos'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1056', nameAr: 'مخزون الأدوية والمستلزمات الطبية والضمادات', type: 'ASSET' },
      { code: '4045', nameAr: 'إيرادات صرف الأدوية والمستلزمات الطبية', type: 'REVENUE' },
      { code: '4046', nameAr: 'مبيعات التأمين الصحي وشركات التعويض', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-20',
    code: 'CLNC-MEDL',
    categoryAr: 'الصحة والطب',
    nameAr: 'المجمعات الطبية والعيادات التخصصية',
    nameEn: 'Poly Clinics & Specialized Medical Centers',
    descriptionAr: 'حساب نسب وأتعاب الأطباء، مواعيد المرضى، الفواتير الطبية والربط مع شركات التأمين',
    defaultModules: ['accounting', 'custody', 'expenses', 'sales', 'hr', 'crm', 'documents'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '2060', nameAr: 'مستحقات وأتعاب الأطباء الاستشاريين', type: 'LIABILITY' },
      { code: '4047', nameAr: 'إيرادات كشوفات العيادات والعمليات الصغرى', type: 'REVENUE' },
      { code: '4048', nameAr: 'إيرادات المختبر والتحاليل والأشعة التشخيصية', type: 'REVENUE' },
      { code: '5065', nameAr: 'أتعاب وحوافز الأطباء والتمريض المباشرة', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-21',
    code: 'DENT-CLNC',
    categoryAr: 'الصحة والطب',
    nameAr: 'عيادات ومراكز طب وجراحة الأسنان',
    nameEn: 'Dental Clinics & Implant Centers',
    descriptionAr: 'تتبع تكاليف معامل الأسنان، التركيبات، التقويم ومخزون المواد الاستهلاكية الطبية',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'crm'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1057', nameAr: 'مخزون مستلزمات حشو الأسنان والغرسات', type: 'ASSET' },
      { code: '4049', nameAr: 'إيرادات معالجات وتقويم وجراحة الأسنان', type: 'REVENUE' },
      { code: '5070', nameAr: 'تكاليف معامل صناعة الأسنان والتركيبات', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-22',
    code: 'LABS-MEDL',
    categoryAr: 'الصحة والطب',
    nameAr: 'مختبرات التحاليل ومراكز الأشعة',
    nameEn: 'Diagnostic Laboratories & Radiology Centers',
    descriptionAr: 'تسعير الفحوصات الفردية والباقات الشاملة وتتبع تكلفة الكواشف والمحاليل المخبرية',
    defaultModules: ['accounting', 'expenses', 'inventory', 'purchasing', 'sales', 'assets'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1058', nameAr: 'مخزون الكواشف والمحاليل المخبرية الدقيقة', type: 'ASSET' },
      { code: '4050', nameAr: 'إيرادات التحاليل المخبرية والفحوص الدورية', type: 'REVENUE' },
      { code: '5075', nameAr: 'استهلاك مستلزمات الفحص والمحاليل المخبرية', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-23',
    code: 'VETR-CARE',
    categoryAr: 'الصحة والطب',
    nameAr: 'العيادات البيطرية وتغذية الحيوانات الأليفة',
    nameEn: 'Veterinary Clinics & Pet Care Care',
    descriptionAr: 'إدارة اللقاحات، العمليات البيطرية ومبيعات أطعمة ومستلزمات العناية',
    defaultModules: ['accounting', 'expenses', 'inventory', 'purchasing', 'sales', 'pos'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1059', nameAr: 'مخزون الأدوية والأعلاف الحيوانية المتخصصة', type: 'ASSET' },
      { code: '4051', nameAr: 'إيرادات الفحوصات والعمليات البيطرية', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-24',
    code: 'OPTC-SHOP',
    categoryAr: 'الصحة والطب',
    nameAr: 'مراكز البصريات والنظارات الطبية',
    nameEn: 'Optometry Centers & Eye Eyewear',
    descriptionAr: 'فحوصات النظر، تفصيل العدسات الطبية والنظارات الشمسية والماركات العالمية',
    defaultModules: ['accounting', 'expenses', 'inventory', 'purchasing', 'sales', 'pos'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1061', nameAr: 'مخزون الإطارات والعدسات الطبية واللاصقة', type: 'ASSET' },
      { code: '4052', nameAr: 'إيرادات مبيعات النظارات والعدسات والقياسات', type: 'REVENUE' },
    ],
  },

  // 25-30: النقل والخدمات اللوجستية والشحن
  {
    id: 'tmpl-25',
    code: 'FLT-LOGS',
    categoryAr: 'النقل واللوجستيات',
    nameAr: 'شركات النقل البري والخدمات اللوجستية',
    nameEn: 'Overland Logistics & Freight Transport',
    descriptionAr: 'إدارة الشاحنات، بوالص الشحن، تتبع استهلاك الديزل والمسافات وصيانة الأسطول',
    defaultModules: ['accounting', 'custody', 'expenses', 'sales', 'fleet', 'hr', 'assets'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '4060', nameAr: 'إيرادات خدمات الشحن والنقل البري الثقيل', type: 'REVENUE' },
      { code: '5080', nameAr: 'مصروفات الوقود والديزل للشاحنات', type: 'EXPENSE' },
      { code: '5081', nameAr: 'مصروفات الصيانة الدورية وتغيير الإطارات', type: 'EXPENSE' },
      { code: '5082', nameAr: 'رسوم الموازين وبوابات الطرق السريعة والتأمين', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-26',
    code: 'LAST-MILE',
    categoryAr: 'النقل واللوجستيات',
    nameAr: 'شركات التوصيل السريع والميل الأخير',
    nameEn: 'Courier & Last-Mile Express Delivery',
    descriptionAr: 'إدارة الكباتن والطرود، الدفع عند الاستلام (COD)، وتتبع الشحنات المرتجعة',
    defaultModules: ['accounting', 'custody', 'expenses', 'sales', 'fleet', 'ecommerce'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '2070', nameAr: 'أمانات تحصيل الدفع عند الاستلام للمتاجر (COD)', type: 'LIABILITY' },
      { code: '4061', nameAr: 'إيرادات رسوم التوصيل ونقل الطرود السريعة', type: 'REVENUE' },
      { code: '5085', nameAr: 'عمولات كباتن وسائقي التوصيل الميدانيين', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-27',
    code: 'FRGT-FRWD',
    categoryAr: 'النقل واللوجستيات',
    nameAr: 'الشحن الدولي والتخليص الجمركي',
    nameEn: 'Freight Forwarding & Customs Clearance',
    descriptionAr: 'إدارة الحاويات البحرية والشحن الجوي ومصاريف الموانئ والبيانات الجمركية',
    defaultModules: ['accounting', 'custody', 'expenses', 'sales', 'projects', 'documents'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1062', nameAr: 'مصروفات جمركية وموانئ مدفوعة نيابة عن العملاء', type: 'ASSET' },
      { code: '4062', nameAr: 'أتعاب التخليص الجمركي ورسوم الوكالة', type: 'REVENUE' },
      { code: '4063', nameAr: 'إيرادات حجز نوالين الشحن البحري والجوي', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-28',
    code: 'RENT-AUTO',
    categoryAr: 'النقل واللوجستيات',
    nameAr: 'مكاتب وشركات تأجير السيارات',
    nameEn: 'Car Rental & Fleet Leasing Agencies',
    descriptionAr: 'عقود التأجير اليومي والشهري، فحص استلام وتسليم المركبة وإدارة المخالفات المرورية',
    defaultModules: ['accounting', 'custody', 'expenses', 'sales', 'fleet', 'assets'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1063', nameAr: 'مخالفات مرورية تحت التحصيل من المستأجرين', type: 'ASSET' },
      { code: '2075', nameAr: 'تأمينات نقدية مستردة لمستأجري السيارات', type: 'LIABILITY' },
      { code: '4065', nameAr: 'إيرادات عقود تأجير السيارات اليومية والتشغيلية', type: 'REVENUE' },
      { code: '5090', nameAr: 'أقساط تأمين وتراخيص أسطول السيارات', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-29',
    code: 'MOV-PAC',
    categoryAr: 'النقل واللوجستيات',
    nameAr: 'شركات نقل وتغليف العفش والأثاث',
    nameEn: 'Relocation, Moving & Packing Services',
    descriptionAr: 'إدارة معاينة المواقع، رافعات الأثاث، ومواد التغليف والتأمين على المنقولات',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'sales', 'fleet', 'crm'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '4066', nameAr: 'إيرادات خدمات فك وتركيب ونقل الأثاث', type: 'REVENUE' },
      { code: '5092', nameAr: 'تكلفة كراتين ومواد التغليف الفقاعي والأشرطة', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-30',
    code: 'WARE-COLD',
    categoryAr: 'النقل واللوجستيات',
    nameAr: 'المستودعات العامة وغرف التبريد والتخزين',
    nameEn: 'Cold Storage & Third-Party Logistics (3PL)',
    descriptionAr: 'إدارة المساحات التخزينية بالباليت والمتر المكعب وإدارة درجات الحرارة للمخزون',
    defaultModules: ['accounting', 'expenses', 'sales', 'assets', 'documents'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '4067', nameAr: 'إيرادات إيجار المساحات التخزينية والتبريد', type: 'REVENUE' },
      { code: '5095', nameAr: 'استهلاك كهرباء غرف التجميد والتبريد المركزي', type: 'EXPENSE' },
    ],
  },

  // 31-38: الصناعة والإنتاج والورش
  {
    id: 'tmpl-31',
    code: 'MFG-GENL',
    categoryAr: 'الصناعة والإنتاج',
    nameAr: 'المصانع العامة والورش الصناعية',
    nameEn: 'General Manufacturing & Industrial Workshops',
    descriptionAr: 'أوامر تصنيع وتتبع تكاليف الإنتاج ومعادلات المواد (BOM) ونسب الهالك الصناعي',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'manufacturing', 'assets'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1064', nameAr: 'مخزون المواد الخام الأولية للإنتاج', type: 'ASSET' },
      { code: '1065', nameAr: 'مخزون إنتاج تحت التشغيل (WIP)', type: 'ASSET' },
      { code: '1066', nameAr: 'مخزون الإنتاج التام الجاهز للبيع', type: 'ASSET' },
      { code: '5100', nameAr: 'أجور العمالة الصناعية المباشرة في المصنع', type: 'EXPENSE' },
      { code: '5101', nameAr: 'مصروفات صناعية غير مباشرة وصيانة خطوط الإنتاج', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-32',
    code: 'AUTO-WRK',
    categoryAr: 'الصيانة والورش',
    nameAr: 'مراكز صيانة السيارات وورش السمكرة والدهان',
    nameEn: 'Auto Repair Workshops & Body Painting',
    descriptionAr: 'أوامر كروت الفحص، وقت الفنيين الميكانيكيين وقطع الغيار المستخدمة في الإصلاح',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'pos'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '4070', nameAr: 'إيرادات أجور اليد وأتعاب الصيانة والإصلاح', type: 'REVENUE' },
      { code: '4071', nameAr: 'إيرادات مبيعات قطع الغيار أثناء الصيانة', type: 'REVENUE' },
      { code: '5105', nameAr: 'أجور وحوافز الفنيين والميكانيكيين المباشرة', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-33',
    code: 'CAR-WASH',
    categoryAr: 'الصيانة والخدمات',
    nameAr: 'مغاسل السيارات ومراكز التلميع والعزل',
    nameEn: 'Car Wash & Nano-Ceramic Detailing Centers',
    descriptionAr: 'نقاط بيع تذاكر الغسيل، باقات النانو سيراميك، وتتبع مخزون الشامبو ومواد التلميع',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'pos'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '4072', nameAr: 'إيرادات الغسيل السريع وتلميع السيارات', type: 'REVENUE' },
      { code: '4073', nameAr: 'إيرادات تركيب أفلام الحماية والنانو سيراميك', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-34',
    code: 'CARP-JOIN',
    categoryAr: 'الصناعة والإنتاج',
    nameAr: 'مصانع النجارة والديكورات الخشبية والأبواب',
    nameEn: 'Carpentry, Joinery & Custom Woodworks',
    descriptionAr: 'تفصيل المطابخ، الأبواب وخزائن الحائط وفق مقاسات العملاء وحساب تكلفة الألواح',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'manufacturing', 'projects'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1067', nameAr: 'مخزون ألواح الخشب، القشور والإكسسوارات المعدنية', type: 'ASSET' },
      { code: '4075', nameAr: 'إيرادات تصنيع وتوريد المطابخ والأبواب الخشبية', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-35',
    code: 'ALUM-GLAS',
    categoryAr: 'الصناعة والإنتاج',
    nameAr: 'ورش ومصانع الألمنيوم والزجاج والواجهات',
    nameEn: 'Aluminum & Glass Architectural Fabricators',
    descriptionAr: 'تصنيع قطاعات الألمنيوم، الزجاج الدبل المعزول وحساب مقاسات الهدر بالأمتار الطولية',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'manufacturing', 'projects'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1068', nameAr: 'مخزون قطاعات الألمنيوم وألواح الزجاج والإكسسوار', type: 'ASSET' },
      { code: '4076', nameAr: 'إيرادات تركيب النوافذ والواجهات الزجاجية', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-36',
    code: 'PRNT-PACK',
    categoryAr: 'الصناعة والإنتاج',
    nameAr: 'المطابع الرقمية ودور النشر والتغليف',
    nameEn: 'Digital Printing Presses & Packaging Houses',
    descriptionAr: 'حساب استهلاك الأحبار، أوزان الورق، وماكينات التقطيع وأوامر الطباعة الفورية',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'manufacturing', 'assets'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1069', nameAr: 'مخزون أوراق الطباعة والأحبار والصفائح المعدنية', type: 'ASSET' },
      { code: '4078', nameAr: 'إيرادات المطبوعات التجارية والعلب والكتالوجات', type: 'REVENUE' },
      { code: '5110', nameAr: 'استهلاك صيانة وأحبار ماكينات الأوفست والديجيتال', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-37',
    code: 'TEXT-SEW',
    categoryAr: 'الصناعة والإنتاج',
    nameAr: 'مصانع ومشاغل الخياطة والزي الموحد',
    nameEn: 'Uniform & Garment Tailoring Factories',
    descriptionAr: 'تفصيل أزياء المدارس والشركات والمستشفيات مع مخزون الأقمشة والأزرار والتطريز',
    defaultModules: ['accounting', 'expenses', 'inventory', 'purchasing', 'sales', 'manufacturing'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1071', nameAr: 'مخزون الأقمشة، الخيوط وسحابات الأزياء', type: 'ASSET' },
      { code: '4080', nameAr: 'إيرادات تفصيل وتوريد الزي الموحد المؤسسي', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-38',
    code: 'PLAS-POLY',
    categoryAr: 'الصناعة والإنتاج',
    nameAr: 'مصانع البلاستيك واللدائن والتعبئة',
    nameEn: 'Plastic Molding & Polymer Packaging',
    descriptionAr: 'حقن وقوالب البلاستيك وتكاليف خرز البوليمرات والعبوات والكرتون البلاستيكي',
    defaultModules: ['accounting', 'expenses', 'inventory', 'purchasing', 'sales', 'manufacturing', 'assets'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1072', nameAr: 'مخزون حبيبات البوليمر والصبغات والمحسنات', type: 'ASSET' },
      { code: '4082', nameAr: 'إيرادات بيع العبوات والمنتجات البلاستيكية', type: 'REVENUE' },
    ],
  },

  // 39-44: الخدمات المهنية والتقنية والاستشارات
  {
    id: 'tmpl-39',
    code: 'SOFT-TECH',
    categoryAr: 'تقنية المعلومات',
    nameAr: 'شركات البرمجيات وحلول تقنية المعلومات',
    nameEn: 'Software Development & IT Solutions',
    descriptionAr: 'إدارة مشاريع السوفتوير، الاشتراكات الدورية (SaaS)، استهلاك السحابة والدعم الفني',
    defaultModules: ['accounting', 'expenses', 'sales', 'projects', 'crm', 'hr', 'documents'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '2080', nameAr: 'إيرادات اشتراكات برمجية مؤجلة ومقدمة', type: 'LIABILITY' },
      { code: '4085', nameAr: 'إيرادات الاشتراكات الدورية والترخيص السنوي', type: 'REVENUE' },
      { code: '4086', nameAr: 'إيرادات تطوير الأنظمة والاستشارات التقنية', type: 'REVENUE' },
      { code: '5115', nameAr: 'تكاليف الخوادم السحابية والاستضافة والبنية التحتية', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-40',
    code: 'MARK-ADVT',
    categoryAr: 'التسويق والدعاية',
    nameAr: 'وكالات الدعاية والإعلان والتسويق الرقمي',
    nameEn: 'Advertising Agencies & Digital Marketing',
    descriptionAr: 'إدارة الحملات الإعلانية الممولة، تكلفة المنصات، إنتاج الفيديو وإدارة المؤثرين',
    defaultModules: ['accounting', 'custody', 'expenses', 'sales', 'projects', 'crm', 'documents'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '1073', nameAr: 'أرصدة إعلانية مدفوعة مقدماً لدى المنصات الرقمية', type: 'ASSET' },
      { code: '4088', nameAr: 'أتعاب إدارة الحملات والخطط التسويقية', type: 'REVENUE' },
      { code: '4089', nameAr: 'إيرادات صناعة المحتوى والتصوير والإنتاج الفني', type: 'REVENUE' },
      { code: '5120', nameAr: 'مصروفات الإعلانات الممولة المدفوعة للمنصات', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-41',
    code: 'LEGL-LAW',
    categoryAr: 'الخدمات المهنية',
    nameAr: 'مكاتب وشركات المحاماة والاستشارات القانونية',
    nameEn: 'Law Firms & Legal Consultancies',
    descriptionAr: 'تتبع ساعات عمل المحامين، القضايا والنزاعات، الأتعاب التعاقدية والأرشفة السرية',
    defaultModules: ['accounting', 'custody', 'expenses', 'sales', 'projects', 'documents'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '2085', nameAr: 'أمانات ورسوم قضايا تحت التسوية للعملاء', type: 'LIABILITY' },
      { code: '4090', nameAr: 'إيرادات أتعاب الترافع والاستشارات القانونية', type: 'REVENUE' },
      { code: '5125', nameAr: 'أتعاب المحامين المستشارين والخبراء القانونيين', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-42',
    code: 'AUDT-FINC',
    categoryAr: 'الخدمات المهنية',
    nameAr: 'مكاتب المحاسبة القانونية والمراجعة والضرائب',
    nameEn: 'Chartered Accountants, Audit & Tax Advisory',
    descriptionAr: 'عقود التدقيق الخارجي، إقرارات الزكاة والضريبة ودراسات الجدوى الاقتصادية',
    defaultModules: ['accounting', 'expenses', 'sales', 'projects', 'crm', 'documents'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '4092', nameAr: 'إيرادات أتعاب مراجعة الحسابات والتدقيق القانوني', type: 'REVENUE' },
      { code: '4093', nameAr: 'أتعاب تقديم الإقرارات الضريبية والزكوية', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-43',
    code: 'ENGN-CNSL',
    categoryAr: 'الخدمات المهنية',
    nameAr: 'المكاتب الهندسية والاستشارات المعمارية',
    nameEn: 'Engineering Consultancies & Architecture',
    descriptionAr: 'مخططات البناء، تراخيص منصة بلدي، الإشراف على المشاريع وحساب تكلفة المهندسين',
    defaultModules: ['accounting', 'expenses', 'sales', 'projects', 'crm', 'documents'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '4095', nameAr: 'إيرادات التصاميم المعمارية والمخططات الإنشائية', type: 'REVENUE' },
      { code: '4096', nameAr: 'إيرادات الإشراف الهندسي الميداني على المباني', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-44',
    code: 'RECR-HRSO',
    categoryAr: 'الخدمات المهنية',
    nameAr: 'شركات الاستقدام وإدارة الموارد البشرية (Outsourcing)',
    nameEn: 'Recruitment, Staffing & HR Outsourcing',
    descriptionAr: 'إدارة عقود التوظيف، تكاليف التأشيرات والسفر ومتابعة تسكين الكوادر لدى الشركات',
    defaultModules: ['accounting', 'custody', 'expenses', 'sales', 'hr', 'documents'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '2090', nameAr: 'أمانات ورسوم تأشيرات قيد المعالجة للعملاء', type: 'LIABILITY' },
      { code: '4098', nameAr: 'أتعاب وساطة الاستقدام والتوظيف الخارجي', type: 'REVENUE' },
      { code: '4099', nameAr: 'إيرادات عقود الإسناد وتشغيل العمالة للغير', type: 'REVENUE' },
    ],
  },

  // 45-50: الخدمات الشخصية والتعليم والترفيه والأنشطة المتنوعة
  {
    id: 'tmpl-45',
    code: 'GYM-FITN',
    categoryAr: 'الرياضة والجمال',
    nameAr: 'الأندية الرياضية والمراكز الصحية واللياقة',
    nameEn: 'Fitness Gyms & Health Wellness Clubs',
    descriptionAr: 'إدارة اشتراكات الأعضاء بالباركود والبصمة، تدريب شخصي، وبيع المكملات الغذائية',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'sales', 'pos', 'crm'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '2095', nameAr: 'إيرادات عضويات واشتراكات رياضية مقبوضة مقدماً', type: 'LIABILITY' },
      { code: '4100', nameAr: 'إيرادات الاشتراكات الدورية في النادي الرياضي', type: 'REVENUE' },
      { code: '4101', nameAr: 'إيرادات جلسات التدريب الخاص (Personal Trainer)', type: 'REVENUE' },
    ],
  },
  {
    id: 'tmpl-46',
    code: 'SALN-BEAU',
    categoryAr: 'الرياضة والجمال',
    nameAr: 'صالونات ومراكز التجميل والعناية النسائية/الرجالية',
    nameEn: 'Beauty Salons, Spas & Grooming Centers',
    descriptionAr: 'حجز المواعيد والخدمات، حساب نسب الخبيرات وتتبع استهلاك الصبغات والمواد',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'sales', 'pos', 'hr'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '4105', nameAr: 'إيرادات خدمات تصفيف الشعر والمكياج والعناية', type: 'REVENUE' },
      { code: '5130', nameAr: 'عمولات وبدلات خبيرات التجميل المباشرة', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-47',
    code: 'HOTL-HOSP',
    categoryAr: 'السياحة والفنادق',
    nameAr: 'الفنادق والشقق الفندقية والمنتجعات',
    nameEn: 'Hotels, Furnished Apartments & Resorts',
    descriptionAr: 'حجز الغرف والوحدات، خدمات التنظيف، التسكين ومغادرة النزلاء وضريبة السياحة والبلدية',
    defaultModules: ['accounting', 'custody', 'expenses', 'sales', 'pos', 'assets', 'documents'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '2100', nameAr: 'أمانات تأمين حجز الغرف ومستحقات النزلاء', type: 'LIABILITY' },
      { code: '4110', nameAr: 'إيرادات إشغال الغرف والأجنحة الفندقية', type: 'REVENUE' },
      { code: '4111', nameAr: 'إيرادات خدمات المغسلة والوجبات بالغرف', type: 'REVENUE' },
      { code: '5135', nameAr: 'مصروفات مستلزمات الضيافة ومفارش النزلاء', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-48',
    code: 'SCHL-EDUC',
    categoryAr: 'التعليم والتدريب',
    nameAr: 'المدارس الأهلية والمعاهد والجامعات الخاصة',
    nameEn: 'Private Schools, Academies & Colleges',
    descriptionAr: 'رسوم الدراسة والأقساط الفصلية، الكتب المدرسية، النقل المدرسي ومسيرات المعلمين',
    defaultModules: ['accounting', 'custody', 'expenses', 'sales', 'fleet', 'hr', 'documents'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '2105', nameAr: 'رسوم تعليمية ودراسية مقبوضة مقدماً للعام', type: 'LIABILITY' },
      { code: '4115', nameAr: 'إيرادات الرسوم والأقساط الدراسية للطلاب', type: 'REVENUE' },
      { code: '4116', nameAr: 'إيرادات خدمات النقل والمواصلات المدرسية', type: 'REVENUE' },
      { code: '5140', nameAr: 'رواتب وبدلات الهيئة التعليمية والتربوية', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-49',
    code: 'TRN-CENT',
    categoryAr: 'التعليم والتدريب',
    nameAr: 'مراكز التدريب المهني واللغات وتطوير الكوادر',
    nameEn: 'Vocational Training & Language Centers',
    descriptionAr: 'تسجيل الدورات، طباعة الشهادات المعتمدة، أتعاب المحاضرين وقاعات التدريب',
    defaultModules: ['accounting', 'expenses', 'sales', 'crm', 'documents'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '4120', nameAr: 'إيرادات رسوم الدورات وورش العمل التدريبية', type: 'REVENUE' },
      { code: '5145', nameAr: 'مكافآت وأتعاب المدربين والمحاضرين المتخصصين', type: 'EXPENSE' },
    ],
  },
  {
    id: 'tmpl-50',
    code: 'LNDR-DRY',
    categoryAr: 'الخدمات والصيانة',
    nameAr: 'المغاسل المركزية والتنظيف الجاف للملابس',
    nameEn: 'Commercial Laundries & Dry Cleaning',
    descriptionAr: 'إدارة الباركود المقاوم للماء على الملابس، تسليم واستلام الملابس والتوصيل المنزلي',
    defaultModules: ['accounting', 'custody', 'expenses', 'inventory', 'purchasing', 'sales', 'pos', 'fleet'],
    initialChartOfAccounts: [
      ...createBaseAccounts(),
      { code: '4125', nameAr: 'إيرادات غسيل وكي الملابس والتنظيف الجاف', type: 'REVENUE' },
      { code: '5150', nameAr: 'استهلاك مساحيق التنظيف ومذيبات الدراي كلين', type: 'EXPENSE' },
    ],
  },
];

export function getTemplateById(idOrCode: string): ActivityTemplate | undefined {
  return ACTIVITY_TEMPLATES.find((t) => t.id === idOrCode || t.code === idOrCode);
}

export function getTaxRuleForCountry(countryCode: string): CountryTaxRule {
  const found = INITIAL_COUNTRY_TAX_RULES.find((r) => r.countryCode.toUpperCase() === countryCode.toUpperCase());
  if (found) return found;
  // Default to SA standard
  return INITIAL_COUNTRY_TAX_RULES[0];
}

export type BusinessActivityTemplate = ActivityTemplate;

export const ACTIVITY_TEMPLATES_DICT: Record<string, ActivityTemplate> = Object.fromEntries(
  ACTIVITY_TEMPLATES.flatMap((t) => [
    [t.id, t],
    [t.code, t],
  ])
);

export const COUNTRY_TAX_RULES_DICT: Record<string, CountryTaxRule> = Object.fromEntries(
  INITIAL_COUNTRY_TAX_RULES.map((r) => [r.countryCode, r])
);

export const MODULE_REGISTRY_DICT: Record<string, StandardModuleDef> = Object.fromEntries(
  STANDARD_MODULES.map((m) => [m.id, m])
);

export {
  COUNTRY_TAX_RULES_DICT as COUNTRY_TAX_RULES,
  MODULE_REGISTRY_DICT as MODULE_REGISTRY,
};

