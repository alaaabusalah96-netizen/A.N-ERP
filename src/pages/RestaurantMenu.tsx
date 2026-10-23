import React, { useState, useEffect } from 'react';
import {
  Utensils,
  Plus,
  Trash2,
  Edit2,
  DollarSign,
  PieChart,
  PackageCheck,
  Search,
  Filter,
  Layers,
  ChefHat,
  X,
  Save,
  Info,
  Tag
} from 'lucide-react';
import { InventoryModule, RestaurantEngine, UsersModule, CompaniesModule } from '../db';
import { MenuItem, MenuCategory, Recipe, RecipeIngredient, MenuItemWithCost } from '../types/restaurant';
import { Language, Theme } from '../types';

interface RestaurantMenuProps {
  language?: Language;
  theme?: Theme;
}

export const RestaurantMenu: React.FC<RestaurantMenuProps> = () => {
  const activeUser = UsersModule.getActiveUser();
  const companies = CompaniesModule.getCompanies();
  const activeCompany = companies.find(c => c.id === activeUser?.company_id);
  const companyId = activeCompany?.id || activeUser?.company_id || CompaniesModule.getSelectedCompanyId() || '';
  const isRtl = document.documentElement.dir === 'rtl';

  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);

  // Category form state
  const [catNameAr, setCatNameAr] = useState('');
  const [catNameEn, setCatNameEn] = useState('');
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);

  // Item form state
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemNameAr, setItemNameAr] = useState('');
  const [itemNameEn, setItemNameEn] = useState('');
  const [itemCategoryId, setItemCategoryId] = useState('');
  const [itemPrice, setItemPrice] = useState<number | ''>('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemAvailable, setItemAvailable] = useState(true);

  // Recipe modal state
  const [selectedItemForRecipe, setSelectedItemForRecipe] = useState<MenuItemWithCost | null>(null);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
  const [recipeNotes, setRecipeNotes] = useState('');
  const [targetMargin, setTargetMargin] = useState<number>(60);

  // Load data
  const categories = RestaurantEngine.getCategories(companyId);
  const itemsWithCost = RestaurantEngine.getMenuItemsWithCost(companyId);
  const inventoryProducts = InventoryModule.getProducts(companyId);

  const refreshData = () => setRefreshKey(prev => prev + 1);

  // Category Actions
  const handleOpenCategoryModal = (cat?: MenuCategory) => {
    if (cat) {
      setEditingCategory(cat);
      setCatNameAr(cat.name_ar);
      setCatNameEn(cat.name_en);
    } else {
      setEditingCategory(null);
      setCatNameAr('');
      setCatNameEn('');
    }
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      alert(isRtl ? 'يرجى اختيار شركة أولاً' : 'Please select a company first');
      return;
    }
    if (!catNameAr.trim()) return;

    if (editingCategory) {
      RestaurantEngine.updateCategory(editingCategory.id, {
        name_ar: catNameAr,
        name_en: catNameEn || catNameAr
      });
    } else {
      RestaurantEngine.addCategory({
        company_id: companyId,
        name_ar: catNameAr,
        name_en: catNameEn || catNameAr,
        display_order: categories.length + 1
      });
    }

    setIsCategoryModalOpen(false);
    refreshData();
  };

  const handleDeleteCategory = (id: string) => {
    if (window.confirm(isRtl ? 'هل أنت تأكد من حذف القسم؟' : 'Are you sure you want to delete this category?')) {
      RestaurantEngine.deleteCategory(id);
      if (selectedCategory === id) setSelectedCategory('all');
      refreshData();
    }
  };

  // Item Actions
  const handleOpenItemModal = (item?: MenuItem) => {
    if (item) {
      setEditingItem(item);
      setItemNameAr(item.name_ar);
      setItemNameEn(item.name_en);
      setItemCategoryId(item.category_id);
      setItemPrice(item.price);
      setItemDesc(item.description || '');
      setItemAvailable(item.is_available);
    } else {
      setEditingItem(null);
      setItemNameAr('');
      setItemNameEn('');
      setItemCategoryId(categories[0]?.id || '');
      setItemPrice('');
      setItemDesc('');
      setItemAvailable(true);
    }
    setIsItemModalOpen(true);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      alert(isRtl ? 'يرجى اختيار شركة أولاً' : 'Please select a company first');
      return;
    }
    if (!itemNameAr.trim() || !itemCategoryId) return;

    const priceNum = typeof itemPrice === 'number' ? itemPrice : parseFloat(itemPrice) || 0;

    if (editingItem) {
      RestaurantEngine.updateMenuItem(editingItem.id, {
        name_ar: itemNameAr,
        name_en: itemNameEn || itemNameAr,
        category_id: itemCategoryId,
        price: priceNum,
        description: itemDesc,
        is_available: itemAvailable
      });
    } else {
      RestaurantEngine.addMenuItem({
        company_id: companyId,
        name_ar: itemNameAr,
        name_en: itemNameEn || itemNameAr,
        category_id: itemCategoryId,
        price: priceNum,
        description: itemDesc,
        is_available: itemAvailable
      });
    }

    setIsItemModalOpen(false);
    refreshData();
  };

  const handleDeleteItem = (id: string) => {
    if (window.confirm(isRtl ? 'هل أنت تأكد من حذف هذا الطبق؟' : 'Are you sure you want to delete this dish?')) {
      RestaurantEngine.deleteMenuItem(id);
      refreshData();
    }
  };

  // Recipe Actions
  const handleOpenRecipeModal = (item: MenuItemWithCost) => {
    setSelectedItemForRecipe(item);
    const existingRecipe = RestaurantEngine.getRecipeForMenuItem(item.id);
    if (existingRecipe) {
      setRecipeIngredients([...existingRecipe.ingredients]);
      setRecipeNotes(existingRecipe.notes || '');
    } else {
      setRecipeIngredients([]);
      setRecipeNotes('');
    }
    setIsRecipeModalOpen(true);
  };

  const handleAddIngredientRow = () => {
    const firstProduct = inventoryProducts[0];
    if (!firstProduct) return;
    setRecipeIngredients(prev => [
      ...prev,
      {
        inventory_item_id: firstProduct.id,
        quantity_used: 0.1,
        unit: firstProduct.unit || 'كجم'
      }
    ]);
  };

  const handleUpdateIngredient = (index: number, field: keyof RecipeIngredient, value: any) => {
    setRecipeIngredients(prev => {
      const updated = [...prev];
      if (field === 'inventory_item_id') {
        const prod = inventoryProducts.find(p => p.id === value);
        updated[index] = {
          ...updated[index],
          inventory_item_id: value,
          unit: prod?.unit || updated[index].unit
        };
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  const handleRemoveIngredientRow = (index: number) => {
    setRecipeIngredients(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveRecipe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      alert(isRtl ? 'يرجى اختيار شركة أولاً' : 'Please select a company first');
      return;
    }
    if (!selectedItemForRecipe) return;

    RestaurantEngine.saveRecipe({
      company_id: companyId,
      menu_item_id: selectedItemForRecipe.id,
      ingredients: recipeIngredients,
      notes: recipeNotes
    });

    setIsRecipeModalOpen(false);
    refreshData();
  };

  // Filtering
  const filteredItems = itemsWithCost.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category_id === selectedCategory;
    const matchesSearch =
      item.name_ar.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.name_en.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // KPI calculations
  const totalDishes = itemsWithCost.length;
  const avgProfitMargin = itemsWithCost.length > 0
    ? (itemsWithCost.reduce((acc, curr) => acc + curr.margin_percentage, 0) / itemsWithCost.length).toFixed(1)
    : '0.0';
  const totalWithRecipes = itemsWithCost.filter(i => i.ingredients_count > 0).length;

  return (
    <div className="space-y-6 p-4 md:p-6" key={refreshKey}>
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
            <Utensils className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {isRtl ? 'قائمة الأطعمة وتكاليف الوجبات' : 'Restaurant Menu & Dish Costing'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {isRtl
                ? 'إدارة الأصناف، المكونات (BOM)، واحتساب تكلفة الأطباق تلقائياً من أسعار خامات المخزن'
                : 'Manage dishes, recipe ingredients (BOM), and live cost tracking directly from inventory'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleOpenCategoryModal()}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium transition flex items-center gap-2"
          >
            <Layers className="w-4 h-4" />
            {isRtl ? 'إضافة قسم جديد' : 'Add Category'}
          </button>
          <button
            onClick={() => handleOpenItemModal()}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {isRtl ? 'إضافة صنف/طبق جديد' : 'Add New Dish'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">
              {isRtl ? 'إجمالي الأطباق المسجلة' : 'Total Dishes'}
            </span>
            <ChefHat className="w-5 h-5 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{totalDishes}</div>
          <p className="text-xs text-slate-500 mt-1">
            {isRtl ? `موزعة على ${categories.length} أقسام` : `Across ${categories.length} categories`}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">
              {isRtl ? 'متوسط هامش الربح' : 'Avg Profit Margin'}
            </span>
            <PieChart className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{avgProfitMargin}%</div>
          <p className="text-xs text-slate-500 mt-1">
            {isRtl ? 'محسوب تلقائياً من أسعار الخامات' : 'Calculated live from raw material purchase costs'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">
              {isRtl ? 'أطباق بخلطة مكونات (BOM)' : 'Dishes with Costing Recipe'}
            </span>
            <PackageCheck className="w-5 h-5 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {totalWithRecipes} / {totalDishes}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {isRtl ? 'مرتبطة بخامات ومستلزمات المخزن' : 'Linked to inventory raw materials'}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                selectedCategory === 'all'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {isRtl ? 'الكل' : 'All Categories'} ({itemsWithCost.length})
            </button>
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center gap-1">
                <button
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                    selectedCategory === cat.id
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {isRtl ? cat.name_ar : cat.name_en}
                </button>
                <button
                  onClick={() => handleOpenCategoryModal(cat)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                  title={isRtl ? 'تعديل القسم' : 'Edit Category'}
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 rtl:right-3 rtl:left-auto" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isRtl ? 'بحث باسم الطبق...' : 'Search dish name...'}
              className="w-full pl-9 pr-4 rtl:pr-9 rtl:pl-4 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Menu Items Grid / Table */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="p-12 text-center text-slate-500 dark:text-slate-400">
            <Utensils className="w-12 h-12 mx-auto mb-3 opacity-30 text-amber-500" />
            <p className="text-base font-medium">{isRtl ? 'لا توجد أطباق مسجلة حالياً' : 'No dishes found'}</p>
            <p className="text-xs mt-1">
              {isRtl
                ? 'قم بإضافة أقسام وأطباق جديدة وحدد مكوناتها لاحتساب التكلفة تلقائياً'
                : 'Add new categories and dishes to calculate raw material costs automatically'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left rtl:text-right">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-4">{isRtl ? 'اسم الطبق' : 'Dish Name'}</th>
                  <th className="px-6 py-4">{isRtl ? 'القسم' : 'Category'}</th>
                  <th className="px-6 py-4">{isRtl ? 'سعر البيع' : 'Selling Price'}</th>
                  <th className="px-6 py-4">{isRtl ? 'تكلفة الخامات (BOM)' : 'Food Cost'}</th>
                  <th className="px-6 py-4">{isRtl ? 'مجمل الربح' : 'Gross Profit'}</th>
                  <th className="px-6 py-4">{isRtl ? 'نسبة الهامش' : 'Margin %'}</th>
                  <th className="px-6 py-4 text-center">{isRtl ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {filteredItems.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {isRtl ? item.name_ar : item.name_en}
                        </div>
                        {item.description && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {item.description}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                      <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 rounded-md">
                        {isRtl ? item.category_name_ar : item.category_name_en}
                      </span>
                    </td>

                    <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                      {item.price.toLocaleString()} EGP
                    </td>

                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          {item.cost.toLocaleString()} EGP
                        </span>
                        <button
                          onClick={() => handleOpenRecipeModal(item)}
                          className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                            item.ingredients_count > 0
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 hover:bg-amber-50'
                          }`}
                        >
                          {item.ingredients_count > 0
                            ? isRtl
                              ? `${item.ingredients_count} خامات`
                              : `${item.ingredients_count} items`
                            : isRtl
                            ? '+ حدد المكونات'
                            : '+ Set Recipe'}
                        </button>
                      </div>
                    </td>

                    <td className="px-6 py-4 font-semibold text-emerald-600 dark:text-emerald-400">
                      {item.gross_profit.toLocaleString()} EGP
                    </td>

                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                          item.margin_percentage >= 50
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                            : item.margin_percentage >= 30
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                        }`}
                      >
                        {item.margin_percentage}%
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleOpenRecipeModal(item)}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition"
                          title={isRtl ? 'تعديل خلطة المكونات (BOM)' : 'Manage Recipe / BOM'}
                        >
                          <ChefHat className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenItemModal(item)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition"
                          title={isRtl ? 'تعديل الطبق' : 'Edit Dish'}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition"
                          title={isRtl ? 'حذف الطبق' : 'Delete Dish'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingCategory
                  ? isRtl
                    ? 'تعديل قسم قائمة الأطعمة'
                    : 'Edit Menu Category'
                  : isRtl
                  ? 'إضافة قسم جديد'
                  : 'Add New Category'}
              </h3>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'اسم القسم (عربي)' : 'Category Name (Arabic)'} *
                </label>
                <input
                  type="text"
                  required
                  value={catNameAr}
                  onChange={e => setCatNameAr(e.target.value)}
                  placeholder="مثال: المشويات، الأطباق الرئيسية، المشروبات"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'اسم القسم (إنجليزي)' : 'Category Name (English)'}
                </label>
                <input
                  type="text"
                  value={catNameEn}
                  onChange={e => setCatNameEn(e.target.value)}
                  placeholder="e.g. Grills, Main Courses, Drinks"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition"
                >
                  {isRtl ? 'حفظ القسم' : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {isItemModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg p-6 border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingItem
                  ? isRtl
                    ? 'تعديل بيانات الطبق/الصنف'
                    : 'Edit Dish Details'
                  : isRtl
                  ? 'إضافة طبق/صنف جديد'
                  : 'Add New Dish'}
              </h3>
              <button
                onClick={() => setIsItemModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isRtl ? 'اسم الطبق (عربي)' : 'Dish Name (Arabic)'} *
                  </label>
                  <input
                    type="text"
                    required
                    value={itemNameAr}
                    onChange={e => setItemNameAr(e.target.value)}
                    placeholder="مثال: وجبة كباب بلدي مع أرز"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isRtl ? 'اسم الطبق (إنجليزي)' : 'Dish Name (English)'}
                  </label>
                  <input
                    type="text"
                    value={itemNameEn}
                    onChange={e => setItemNameEn(e.target.value)}
                    placeholder="e.g. Kebab Plate with Rice"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isRtl ? 'القسم' : 'Category'} *
                  </label>
                  <select
                    required
                    value={itemCategoryId}
                    onChange={e => setItemCategoryId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">{isRtl ? 'اختر القسم...' : 'Select Category...'}</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>
                        {isRtl ? c.name_ar : c.name_en}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isRtl ? 'سعر البيع للعميل (EGP)' : 'Selling Price (EGP)'} *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    required
                    value={itemPrice}
                    onChange={e => setItemPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isRtl ? 'الوصف' : 'Description'}
                </label>
                <textarea
                  rows={2}
                  value={itemDesc}
                  onChange={e => setItemDesc(e.target.value)}
                  placeholder={isRtl ? 'ترافقها سلطة وطحينة وخبز طازج' : 'Served with salad and fresh bread'}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="itemAvailable"
                  checked={itemAvailable}
                  onChange={e => setItemAvailable(e.target.checked)}
                  className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                />
                <label htmlFor="itemAvailable" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  {isRtl ? 'الطبق متاح للطلب والتجهيز حالياً' : 'Dish is available for orders'}
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition"
                >
                  {isRtl ? 'حفظ البيانات' : 'Save Dish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recipe (BOM / Dish Costing) Modal */}
      {isRecipeModalOpen && selectedItemForRecipe && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-2xl p-6 border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                  <ChefHat className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {isRtl
                      ? `خلطة المكونات وتكلفة الخامات (BOM): ${selectedItemForRecipe.name_ar}`
                      : `Dish Recipe & Raw Material Cost: ${selectedItemForRecipe.name_en}`}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isRtl
                      ? 'حدد خامات المخزن والكمية المستخدمة لتحسب تكلفة الطبق ومجمل الربح دقيقة بلمسة زر'
                      : 'Define raw material ingredients from inventory to auto-calculate food cost'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRecipeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecipe} className="space-y-6 mt-4">
              {/* Ingredients List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isRtl ? 'المكونات من خامات المخزن' : 'Raw Material Ingredients'}
                  </span>
                  <button
                    type="button"
                    onClick={handleAddIngredientRow}
                    className="px-3 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-medium transition flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {isRtl ? 'إضافة خامة للمكونات' : 'Add Ingredient'}
                  </button>
                </div>

                {recipeIngredients.length === 0 ? (
                  <div className="p-6 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 text-xs">
                    {isRtl
                      ? 'لم يتم إضافة خامات لهذا الطبق بعد. اضغط "إضافة خامة للمكونات" للبدء.'
                      : 'No ingredients added yet. Click "Add Ingredient" to start.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recipeIngredients.map((ing, idx) => {
                      const selectedProd = inventoryProducts.find(p => p.id === ing.inventory_item_id);
                      const unitCost = selectedProd?.last_purchase_price || 0;
                      const lineCost = Number((unitCost * ing.quantity_used).toFixed(2));

                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          <div className="flex-1">
                            <select
                              value={ing.inventory_item_id}
                              onChange={e => handleUpdateIngredient(idx, 'inventory_item_id', e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs text-slate-900 dark:text-white"
                            >
                              {inventoryProducts.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.last_purchase_price || 0} EGP/{p.unit || 'وحدة'})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="w-24">
                            <input
                              type="number"
                              min="0.001"
                              step="0.001"
                              value={ing.quantity_used}
                              onChange={e =>
                                handleUpdateIngredient(
                                  idx,
                                  'quantity_used',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              placeholder="الكمية"
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs font-semibold text-slate-900 dark:text-white"
                            />
                          </div>

                          <div className="w-20 text-xs text-slate-500 font-medium text-center">
                            {ing.unit}
                          </div>

                          <div className="w-24 text-xs font-bold text-amber-600 dark:text-amber-400 text-right">
                            = {lineCost} EGP
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveIngredientRow(idx)}
                            className="p-1 text-slate-400 hover:text-red-600 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Dynamic Cost Summary & Suggested Price Box */}
              {(() => {
                const currentCost = recipeIngredients.reduce((acc, ing) => {
                  const prod = inventoryProducts.find(p => p.id === ing.inventory_item_id);
                  const uCost = prod?.last_purchase_price || 0;
                  return acc + uCost * ing.quantity_used;
                }, 0);

                const currentPrice = selectedItemForRecipe.price;
                const profit = currentPrice - currentCost;
                const marginPct = currentPrice > 0 ? ((profit / currentPrice) * 100).toFixed(1) : '0';
                const suggestedPrice = RestaurantEngine.suggestMenuItemPrice(currentCost, targetMargin);

                return (
                  <div className="p-4 bg-amber-50/70 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl space-y-3">
                    <div className="grid grid-cols-3 gap-3 text-center border-b border-amber-200 dark:border-amber-800/50 pb-3">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">
                          {isRtl ? 'تكلفة الخامات' : 'Food Cost'}
                        </div>
                        <div className="text-base font-bold text-amber-700 dark:text-amber-400">
                          {currentCost.toFixed(2)} EGP
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">
                          {isRtl ? 'مجمل الربح' : 'Gross Profit'}
                        </div>
                        <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                          {profit.toFixed(2)} EGP
                        </div>
                      </div>

                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-semibold">
                          {isRtl ? 'هامش الربح الحالي' : 'Current Margin'}
                        </div>
                        <div className="text-base font-bold text-slate-900 dark:text-white">
                          {marginPct}%
                        </div>
                      </div>
                    </div>

                    {/* Target Margin Price Advisor */}
                    <div className="flex items-center justify-between gap-4 pt-1">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-amber-600" />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {isRtl ? 'حاسبة السعر المقترح لهامش ربح:' : 'Suggested Price for Target Margin:'}
                        </span>
                        <select
                          value={targetMargin}
                          onChange={e => setTargetMargin(parseInt(e.target.value))}
                          className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-xs font-bold text-amber-700"
                        >
                          <option value={40}>40%</option>
                          <option value={50}>50%</option>
                          <option value={60}>60%</option>
                          <option value={70}>70%</option>
                        </select>
                      </div>

                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {isRtl ? 'السعر المقترح:' : 'Suggested:'}{' '}
                        <span className="text-amber-600 font-extrabold text-sm">{suggestedPrice} EGP</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsRecipeModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50"
                >
                  {isRtl ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  {isRtl ? 'حفظ خلطة المكونات والتكلفة' : 'Save Recipe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RestaurantMenu;
