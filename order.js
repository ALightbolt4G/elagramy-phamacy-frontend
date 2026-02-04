// ==================== إعدادات التطبيق ====================
const API_BASE = 'https://elagramy-phamacy-production.up.railway.app/api';

// متغيرات التطبيق
let allProducts = [];
let cart = [];
let clientId = null;
let clientData = null;
let selectedBranchId = null;
let userBranches = [];
let categories = [];
let selectedCategory = 'all';
let prescriptionImages = [];

// متغيرات البحث
let currentSearchQuery = '';
let searchTimeout;
let currentSearchResults = [];

// متغيرات Pagination
let currentPage = 1;
const itemsLimit = 10;
let hasMoreProducts = true;
let isLoading = false;

// متغيرات الواتساب
let shouldSendToWhatsApp = false;
const WHATSAPP_NUMBER = "201234522133";

// متغيرات المنتج الحالي
let selectedProductForQuantity = null;
let modalQuantity = 1;
let modalProductPrice = 0;
let modalProductData = null;

// ==================== التهيئة الرئيسية ====================
document.addEventListener('DOMContentLoaded', async () => {
    await initializeApp();
    setupEventListeners();
});

async function initializeApp() {
    try {
        // التحقق من مصادقة العميل
        const storedClient = localStorage.getItem('client');
        const authTime = localStorage.getItem('auth_time');

        if (!storedClient || !authTime) {
            window.location.href = 'login.html';
            return;
        }

        // التحقق من انتهاء الجلسة (24 ساعة)
        const timeDiff = Date.now() - parseInt(authTime);
        if (timeDiff > 24 * 60 * 60 * 1000) {
            localStorage.clear();
            window.location.href = 'login.html';
            return;
        }

        // تحميل بيانات العميل
        clientData = JSON.parse(storedClient);
        clientId = clientData.id;

        // تحديث واجهة العميل
        updateClientUI();

        // تحميل فروع العميل
        await loadClientBranches();

        // إذا لم يكن هناك فروع، إظهار رسالة خطأ
        if (userBranches.length === 0) {
            showMessage('أنت غير مسجل في أي فرع. يرجى التواصل مع الإدارة', 'error');
            return;
        }

        // التحقق إذا كان هناك فرع محفوظ
        const savedBranch = localStorage.getItem('selected_branch');
        if (savedBranch) {
            const branchExists = userBranches.some(b => 
                (b.branch_id || b.branches?.id) == savedBranch
            );
            if (branchExists) {
                selectedBranchId = parseInt(savedBranch);
                await afterBranchSelection();
            } else {
                showBranchSelection();
            }
        } else {
            showBranchSelection();
        }

    } catch (error) {
        console.error('❌ خطأ في تهيئة التطبيق:', error);
        showMessage('خطأ في تحميل التطبيق. يرجى المحاولة مرة أخرى', 'error');
    }
}

async function afterBranchSelection() {
    try {
        hideBranchModal();
        updateCurrentBranchButton();
        await loadCategories();
        await loadProducts(); // ⚠️ بدون معاملات
        loadSavedCart();
        showMessage(`✅ تم اختيار فرع "${getBranchName(selectedBranchId)}"`, 'success', 3000);
    } catch (error) {
        console.error('❌ خطأ بعد اختيار الفرع:', error);
        showMessage('حدث خطأ في تحميل البيانات', 'error');
    }
}

function updateClientUI() {
    const clientInfo = document.getElementById('clientInfo');
    if (clientInfo && clientData) {
        clientInfo.innerHTML = `
            <div class="client-badge">
                <div class="client-name">مرحباً ${clientData.name}</div>
                <div class="client-address">${clientData.address || 'لم يتم تحديد العنوان'}</div>
            </div>
        `;
    }
}

// ==================== إعداد المستمعين للأحداث ====================
function setupEventListeners() {
    // البحث
    const searchInput = document.getElementById('mainSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearchInput);
        searchInput.addEventListener('keypress', handleSearchKeyPress);
    }

    // زر البحث
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', triggerFullSearch);
    }

    // إغلاق نتائج البحث عند النقر خارجها
    document.addEventListener('click', handleOutsideClick);

    // نافذة الكمية
    const modalInput = document.getElementById('modalQuantityInput');
    if (modalInput) {
        modalInput.addEventListener('input', handleModalQuantityInput);
    }

    // تأكيد الفرع
    const confirmBranchBtn = document.getElementById('confirmBranchBtn');
    if (confirmBranchBtn) {
        confirmBranchBtn.onclick = confirmBranchSelection;
    }

    // تغيير الفرع
    const changeBranchBtn = document.getElementById('changeBranchBtn');
    if (changeBranchBtn) {
        changeBranchBtn.addEventListener('click', changeBranch);
    }

    // السلة
    const cartOverlay = document.getElementById('cartOverlay');
    if (cartOverlay) {
        cartOverlay.addEventListener('click', closeCart);
    }

    // استعادة السلة المحفوظة عند تحميل الصفحة
    loadSavedCart();
}

// ==================== نظام الفروع ====================
async function loadClientBranches() {
    try {
        const response = await fetch(`${API_BASE}/clients/${clientId}/branches`);
        
        if (!response.ok) {
            throw new Error(`خطأ في الاستجابة: ${response.status}`);
        }
        
        const result = await response.json();

        if (result.success && result.data && result.data.length > 0) {
            userBranches = result.data.filter(branch => 
                branch.branches?.is_active !== false
            );
            
            if (userBranches.length === 0) {
                showMessage('لا توجد فروع نشطة متاحة لك', 'error');
            }
        } else {
            throw new Error('لا توجد فروع متاحة');
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل فروع العميل:', error);
        showMessage('تعذر تحميل الفروع. يرجى المحاولة مرة أخرى', 'error');
        throw error;
    }
}

function showBranchSelection() {
    // إخفاء جميع الأقسام الأخرى
    document.querySelectorAll('.products-section, .search-section, .cart-section').forEach(el => {
        el.style.display = 'none';
    });
    
    const modal = document.getElementById('branchSelectionModal');
    const branchesList = document.getElementById('branchesList');
    const welcomeMessage = document.getElementById('welcomeMessage');

    if (!modal || !branchesList || !welcomeMessage || userBranches.length === 0) {
        showMessage('لا توجد فروع متاحة', 'error');
        return;
    }

    selectedBranchId = null;
    
    // تحديث رسالة الترحيب
    if (clientData) {
        welcomeMessage.innerHTML = `
            <div style="text-align: center; margin-bottom: 20px;">
                <div style="font-size: 22px; font-weight: 600; color: var(--primary); margin-bottom: 10px;">
                    <i class="fas fa-store"></i> مرحباً ${clientData.name}!
                </div>
                <div style="font-size: 16px; color: var(--gray-600);">
                    اختر الفرع الذي ترغب في الشراء منه
                </div>
                <div style="font-size: 14px; color: var(--gray-500); margin-top: 10px;">
                    <i class="fas fa-info-circle"></i>
                    سيتم عرض المنتجات المتاحة في الفرع المختار فقط
                </div>
            </div>
        `;
    }
    
    let branchesHtml = '';

    userBranches.forEach((branch) => {
        const branchId = branch.branch_id || branch.branches?.id;
        const branchName = branch.branches?.name || 'فرع';
        const branchAddress = branch.branches?.address;

        branchesHtml += `
            <div class="branch-option" onclick="selectBranch(${branchId}, this)">
                <input type="radio" 
                       name="branch" 
                       id="branch_${branchId}" 
                       value="${branchId}">
                
                <div class="branch-radio-circle"></div>
                
                <div class="branch-info">
                    <div class="branch-name">
                        ${branchName}
                        ${branchAddress ? `
                            <div style="font-size: 14px; color: var(--gray-600); margin-top: 4px;">
                                <i class="fas fa-map-marker-alt"></i>
                                ${branchAddress}
                            </div>
                        ` : ''}
                    </div>
                    <div class="branch-status active">
                        <i class="fas fa-check-circle"></i>
                        نشط
                    </div>
                </div>
            </div>
        `;
    });

    branchesList.innerHTML = branchesHtml;
    modal.style.display = 'flex';

    updateConfirmBranchButton();
}

function selectBranch(branchId, element) {
    selectedBranchId = parseInt(branchId);

    // تحديث الواجهة
    if (element) {
        document.querySelectorAll('.branch-option').forEach(option => {
            option.classList.remove('selected');
        });
        element.classList.add('selected');
    }

    // تحديث زر التأكيد
    updateConfirmBranchButton();
}

function updateConfirmBranchButton() {
    const confirmBtn = document.getElementById('confirmBranchBtn');
    if (!confirmBtn) return;

    if (selectedBranchId) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `
            <i class="fas fa-check-circle"></i>
            تأكيد الاختيار والمتابعة للتسوق
        `;
    } else {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `
            <i class="fas fa-hand-point-up"></i>
            اختر فرعاً أولاً
        `;
    }
}

async function confirmBranchSelection() {
    if (!selectedBranchId) {
        showMessage('يرجى اختيار فرع أولاً', 'error');
        return;
    }

    try {
        localStorage.setItem('selected_branch', selectedBranchId.toString());
        await afterBranchSelection();
    } catch (error) {
        console.error('❌ خطأ في تأكيد الفرع:', error);
        showMessage('حدث خطأ في اختيار الفرع', 'error');
    }
}

function hideBranchModal() {
    const modal = document.getElementById('branchSelectionModal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // إظهار الأقسام الأخرى
    document.querySelectorAll('.products-section, .search-section, .cart-section').forEach(el => {
        el.style.display = '';
    });
}

function updateCurrentBranchButton() {
    if (!selectedBranchId || userBranches.length === 0) return;

    const currentBranchText = document.getElementById('currentBranchText');
    const changeBranchBtn = document.getElementById('changeBranchBtn');
    
    if (currentBranchText) {
        currentBranchText.textContent = `الفرع: ${getBranchName(selectedBranchId)}`;
    }
    if (changeBranchBtn) {
        changeBranchBtn.style.display = 'flex';
    }
}

function getBranchName(branchId) {
    const branch = userBranches.find(b => 
        (b.branch_id || b.branches?.id) == branchId
    );
    return branch?.branches?.name || `الفرع ${branchId}`;
}

function changeBranch() {
    // حفظ السلة مؤقتاً
    saveCart();
    
    // إعادة تعيين التطبيق
    allProducts = [];
    currentPage = 1;
    hasMoreProducts = true;
    
    // إخفاء واجهة المنتجات
    const productsContainer = document.getElementById('productsContainer');
    if (productsContainer) {
        productsContainer.innerHTML = '';
    }
    
    // إخفاء السلة
    closeCart();
    
    // إعادة إظهار اختيار الفرع
    showBranchSelection();
}

// ==================== نظام الفئات ====================
async function loadCategories() {
    try {
        if (!selectedBranchId) return;
        
        const response = await fetch(`${API_BASE}/products/categories?branchId=${selectedBranchId}`);
        
        if (!response.ok) {
            throw new Error(`خطأ في الاستجابة: ${response.status}`);
        }
        
        const result = await response.json();

        if (result.success && result.data) {
            categories = result.data;
            updateCategoryFilter();
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل الفئات:', error);
    }
}

function updateCategoryFilter() {
    const categoryFilter = document.getElementById('categoryFilter');
    if (!categoryFilter) return;

    categoryFilter.innerHTML = '<option value="all">جميع الفئات</option>';
    
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.id;
        option.textContent = category.name;
        categoryFilter.appendChild(option);
    });

    categoryFilter.addEventListener('change', handleCategoryChange);
}

function handleCategoryChange(e) {
    selectedCategory = e.target.value;
    currentPage = 1;
    hasMoreProducts = true;
    loadProducts(1);
}

// ==================== نظام البحث ====================
function handleSearchInput(e) {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    currentSearchQuery = query;

    if (query.length < 2) {
        hideSearchResults();
        return;
    }

    searchTimeout = setTimeout(() => {
        performSearch(query);
    }, 300);
}

function handleSearchKeyPress(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const query = e.target.value.trim();
        if (query.length >= 2) {
            clearTimeout(searchTimeout);
            triggerFullSearch();
        }
    }
}

function handleOutsideClick(event) {
    const searchResults = document.getElementById('searchResultsList');
    const searchInput = document.getElementById('mainSearchInput');

    if (searchResults && searchResults.style.display === 'block' && 
        !searchResults.contains(event.target) && 
        searchInput && !searchInput.contains(event.target)) {
        hideSearchResults();
    }
}

function hideSearchResults() {
    const searchResults = document.getElementById('searchResultsList');
    if (searchResults) {
        searchResults.style.display = 'none';
    }
}

async function performSearch(query) {
    const searchResultsList = document.getElementById('searchResultsList');
    
    if (!searchResultsList) return;

    searchResultsList.innerHTML = `
        <div style="padding: 15px; text-align: center; color: var(--gray-600);">
            <i class="fas fa-spinner fa-spin"></i>
            جاري البحث...
        </div>
    `;
    searchResultsList.style.display = 'block';

    try {
        if (!selectedBranchId) {
            searchResultsList.innerHTML = `
                <div style="padding: 15px; text-align: center; color: var(--danger);">
                    <i class="fas fa-exclamation-triangle"></i>
                    يرجى اختيار فرع أولاً
                </div>
            `;
            return;
        }

        const searchUrl = `${API_BASE}/products/quick-search?q=${encodeURIComponent(query)}&branchId=${selectedBranchId}&type=all`;

        const response = await fetch(searchUrl);
        
        if (!response.ok) {
            throw new Error(`خطأ في البحث: ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.data && result.data.length > 0) {
            displaySearchResults(result.data);
        } else {
            searchResultsList.innerHTML = `
                <div style="padding: 15px; text-align: center; color: var(--gray-500);">
                    <i class="fas fa-search"></i>
                    لا توجد نتائج لـ "${query}"
                </div>
            `;
        }
    } catch (error) {
        console.error('❌ خطأ في البحث:', error);
        searchResultsList.innerHTML = `
            <div style="padding: 15px; text-align: center; color: var(--danger);">
                <i class="fas fa-exclamation-circle"></i>
                تعذر الاتصال بالخادم
            </div>
        `;
    }
}

async function triggerFullSearch() {
    const searchInput = document.getElementById('mainSearchInput');
    const query = searchInput.value.trim();
    
    if (query.length < 2) {
        showMessage('أدخل كلمتين على الأقل للبحث', 'info');
        return;
    }

    if (!selectedBranchId) {
        showMessage('يرجى اختيار فرع أولاً', 'error');
        return;
    }

    hideSearchResults();
    
    // تحديث عنوان القسم
    const sectionTitle = document.querySelector('.section-title h2');
    if (sectionTitle) {
        sectionTitle.textContent = `نتائج البحث عن: "${query}"`;
    }

    // إعادة تعيين البيانات
    currentPage = 1;
    hasMoreProducts = true;
    allProducts = [];
    
    // إظهار مؤشر التحميل
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'block';
    }
    
    // إخفاء المنتجات الحالية
    const productsContainer = document.getElementById('productsContainer');
    if (productsContainer) {
        productsContainer.innerHTML = '';
    }

    try {
        const searchUrl = `${API_BASE}/products/quick-search?q=${encodeURIComponent(query)}&branchId=${selectedBranchId}&type=all`;

        const response = await fetch(searchUrl);
        
        if (!response.ok) {
            throw new Error(`خطأ في البحث: ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.data && result.data.length > 0) {
            currentSearchResults = result.data;
            
            // تحويل النتائج إلى صيغة المنتجات
            const searchProducts = result.data.map(item => ({
                ...item,
                id: item.branch_product_id || item.id,
                type: item.product_category || 'drug',
                price: parseFloat(item.price || 0)
            }));
            
            // عرض النتائج
            displayProducts(searchProducts, true);
            
            // إخفاء زر التحميل المزيد
            const loadMoreContainer = document.getElementById('loadMoreContainer');
            if (loadMoreContainer) {
                loadMoreContainer.style.display = 'none';
            }
            
            showMessage(`تم العثور على ${result.data.length} نتيجة`, 'success');
        } else {
            showMessage('لا توجد نتائج للبحث', 'info');
            
            // عرض رسالة عدم وجود نتائج
            const noProductsMessage = document.getElementById('noProductsMessage');
            if (noProductsMessage) {
                noProductsMessage.style.display = 'block';
                noProductsMessage.innerHTML = `
                    <i class="fas fa-search" style="font-size: 60px; margin-bottom: 20px;"></i>
                    <h3 style="font-size: 22px; margin-bottom: 10px;">لا توجد نتائج لـ "${query}"</h3>
                    <p style="font-size: 16px; color: var(--gray-600);">جرب كلمات بحث أخرى</p>
                `;
            }
        }
    } catch (error) {
        console.error('❌ خطأ في البحث الكامل:', error);
        showMessage('تعذر إجراء البحث', 'error');
    } finally {
        // إخفاء مؤشر التحميل
        if (loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
}

function displaySearchResults(results) {
    const list = document.getElementById('searchResultsList');
    if (!list) return;

    if (!results || results.length === 0) {
        list.innerHTML = `
            <div style="padding: 15px; text-align: center; color: var(--gray-500);">
                <i class="fas fa-search"></i>
                لا توجد نتائج
            </div>
        `;
        list.style.display = 'block';
        return;
    }

    currentSearchResults = results;
    
    list.innerHTML = results.map(item => {
        const prodType = item.product_category || 'drug';
        const productId = item.branch_product_id || item.id;
        const price = item.price ? parseFloat(item.price).toFixed(2) : '0.00';
        const productName = item.name || 'منتج بدون اسم';
        const typeName = prodType === 'drug' ? 'دواء' : 'مستحضر';
        const typeColor = prodType === 'drug' ? 'var(--success)' : '#3b82f6';

        return `
            <div onclick="handleSearchResultClick('${productId}', '${prodType}')" 
                 class="search-result-item"
                 style="padding: 12px 15px; border-bottom: 1px solid var(--gray-100); cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s;"
                 onmouseover="this.style.background='var(--gray-50)'" 
                 onmouseout="this.style.background='white'">
                <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                    <div style="width: 40px; height: 40px; background: ${typeColor}; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-size: 18px;">
                        <i class="fas ${prodType === 'drug' ? 'fa-capsules' : 'fa-spray-can-sparkles'}"></i>
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: var(--gray-800); font-size: 15px; margin-bottom: 3px;">
                            ${productName}
                        </div>
                        <div style="font-size: 13px; color: var(--gray-600);">
                            <span style="color: var(--primary); font-weight: 600;">${price} جنيه</span>
                        </div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <small style="color: ${typeColor}; font-weight: 600; background: ${typeColor.replace(')', ', 0.1)')}; padding: 4px 10px; border-radius: 12px; font-size: 12px;">
                        ${typeName}
                    </small>
                </div>
            </div>
        `;
    }).join('');

    list.style.display = 'block';
}

async function handleSearchResultClick(productId, productType, productName = '') {
    hideSearchResults();
    
    const searchInput = document.getElementById('mainSearchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    
    // البحث عن المنتج في currentSearchResults
    let productData = null;
    if (currentSearchResults && currentSearchResults.length > 0) {
        productData = currentSearchResults.find(item => 
            (item.branch_product_id == productId || item.id == productId)
        );
    }
    
    if (productData) {
        // تحويل البيانات
        const product = {
            id: productData.branch_product_id || productData.id,
            branch_product_id: productData.branch_product_id || productData.id,
            product_id: productData.original_id || productData.id,
            name: productData.name || productName,
            product_type: productData.product_category || productType,
            type: productData.product_category || productType,
            price: parseFloat(productData.price) || 0,
            active_ingredient: productData.active_ingredient || '',
            description: productData.description || '',
            image_url: productData.image_url || '',
            is_search_result: true
        };
        
        // فتح نافذة الكمية
        await openQuantityModal(productId, productType, productName, product);
    } else {
        await openQuantityModal(productId, productType, productName);
    }
}

// ==================== نظام المنتجات ====================
async function loadProducts(page = 1, isLoadMore = false, searchQuery = '') {
    if (!selectedBranchId || isLoading) return;

    isLoading = true;

    const loadingIndicator = document.getElementById('loadingIndicator');
    const noProductsMessage = document.getElementById('noProductsMessage');
    const productsContainer = document.getElementById('productsContainer');
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    const sectionTitle = document.querySelector('.section-title h2');

    // تحديث العنوان
    if (sectionTitle) {
        if (searchQuery) {
            sectionTitle.textContent = `نتائج البحث: "${searchQuery}"`;
        } else {
            sectionTitle.textContent = 'منتجات الصيدلية';
        }
    }

    if (page === 1 && !isLoadMore) {
        if (loadingIndicator) loadingIndicator.style.display = 'block';
        if (noProductsMessage) noProductsMessage.style.display = 'none';
        
        if (productsContainer) {
            productsContainer.innerHTML = `
                <div class="skeleton-container">
                    ${Array(20).fill().map(() => `
                        <div class="skeleton-card">
                            <div class="skeleton-image"></div>
                            <div class="skeleton-text"></div>
                            <div class="skeleton-text short"></div>
                            <div class="skeleton-text medium"></div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
    }

    try {
        console.log('🚀 جلب المنتجات...', {
            page,
            searchQuery,
            branchId: selectedBranchId
        });

        let url;
        let isSearch = searchQuery && searchQuery.trim().length >= 2;
        
        if (isSearch) {
            // البحث: استخدام quick-search
            url = `${API_BASE}/products/quick-search?q=${encodeURIComponent(searchQuery)}&branchId=${selectedBranchId}&type=all&limit=20`;
            console.log('🔍 استخدام البحث السريع');
        } else {
            // الرئيسية: استخدام endpoint المنتجات العادي
            url = `${API_BASE}/products?branchId=${selectedBranchId}&type=all&limit=20`;
            console.log('🏠 استخدام الصفحة الرئيسية');
        }

        const response = await fetch(url);
        console.log('📡 حالة الاستجابة:', response.status);
        
        if (!response.ok) {
            throw new Error(`خطأ في الاستجابة: ${response.status}`);
        }

        const result = await response.json();
        console.log('📊 بيانات API:', result.success ? '✅ ناجح' : '❌ فشل');

        if (result.success) {
            let newProducts = [];
            
            // معالجة البيانات بناءً على نوع الـ endpoint
            if (isSearch) {
                // البيانات من quick-search
                if (result.data && Array.isArray(result.data)) {
                    newProducts = result.data.map(item => {
                        console.log('🔍 معالجة نتيجة بحث:', item.name || 'غير معروف');
                        return {
                            // ⚠️ المهم: branch_product_id هو المفتاح
                            id: item.branch_product_id || item.id,
                            branch_product_id: item.branch_product_id || item.id,
                            product_id: item.original_id || item.id,
                            
                            // معلومات المنتج
                            name: item.name || 'منتج بدون اسم',
                            product_type: item.product_category || 'drug',
                            type: item.product_category || 'drug',
                            
                            // السعر
                            price: parseFloat(item.price || 0),
                            
                            // معلومات إضافية
                            active_ingredient: item.active_ingredient || '',
                            description: item.description || '',
                            image_url: item.image_url || '',
                            category_id: item.category_id,
                            is_search_result: true // ⚠️ علامة أن هذا من بحث
                        };
                    });
                }
            } else {
                // البيانات من endpoint الرئيسي
                if (result.data) {
                    // جمع الأدوية
                    if (result.data.drugs && Array.isArray(result.data.drugs)) {
                        const drugs = result.data.drugs.map(item => {
                            console.log('💊 معالجة دواء:', item.name || 'غير معروف');
                            return {
                                id: item.branch_product_id || item.id,
                                branch_product_id: item.branch_product_id || item.id,
                                product_id: item.id,
                                name: item.name || 'دواء بدون اسم',
                                product_type: 'drug',
                                type: 'drug',
                                price: parseFloat(item.price || 0),
                                active_ingredient: item.active_ingredient || '',
                                description: item.description || '',
                                image_url: item.image_url || '',
                                category_id: item.category_id,
                                category_name: item.categories?.name || '',
                                is_search_result: false
                            };
                        });
                        newProducts = newProducts.concat(drugs);
                    }
                    
                    // جمع المستحضرات
                    if (result.data.cosmetics && Array.isArray(result.data.cosmetics)) {
                        const cosmetics = result.data.cosmetics.map(item => {
                            console.log('💄 معالجة مستحضر:', item.name || 'غير معروف');
                            return {
                                id: item.branch_product_id || item.id,
                                branch_product_id: item.branch_product_id || item.id,
                                product_id: item.id,
                                name: item.name || 'مستحضر بدون اسم',
                                product_type: 'cosmetic',
                                type: 'cosmetic',
                                price: parseFloat(item.price || 0),
                                description: item.description || '',
                                image_url: item.image_url || '',
                                category_id: item.category_id,
                                category_name: item.categories?.name || '',
                                is_search_result: false
                            };
                        });
                        newProducts = newProducts.concat(cosmetics);
                    }
                }
            }
            
            console.log(`✅ تم معالجة ${newProducts.length} منتج`);
            
            // حفظ النتائج
            if (page === 1 || isSearch) {
                allProducts = newProducts;
            } else {
                allProducts = [...allProducts, ...newProducts];
            }
            
            // حفظ نتائج البحث مؤقتاً
            if (isSearch) {
                currentSearchResults = result.data || [];
                currentSearchQuery = searchQuery;
            } else {
                currentSearchResults = [];
                currentSearchQuery = '';
            }
            
            // عرض المنتجات
            displayProducts(allProducts, page === 1 || isSearch);
            
            // تحديث حالة تحميل المزيد
            hasMoreProducts = newProducts.length === 20 && !isSearch;
            updateLoadMoreButton(hasMoreProducts && !isSearch);
            
            // رسالة عدم وجود منتجات
            if (page === 1 && newProducts.length === 0 && noProductsMessage) {
                noProductsMessage.style.display = 'block';
                if (isSearch) {
                    noProductsMessage.innerHTML = `
                        <i class="fas fa-search"></i>
                        <h3>لا توجد نتائج لـ "${searchQuery}"</h3>
                        <p>جرب كلمات بحث أخرى</p>
                    `;
                } else {
                    noProductsMessage.innerHTML = `
                        <i class="fas fa-box-open"></i>
                        <h3>لا توجد منتجات متاحة حالياً</h3>
                        <p>استخدم شريط البحث للعثور على منتجات</p>
                    `;
                }
            }
            
            // إظهار زر العودة إذا كان بحث
            if (isSearch) {
                showBackToMainButton();
            } else {
                hideBackToMainButton();
            }
            
        } else {
            console.error('❌ بيانات غير صالحة من API');
            throw new Error(result.message || 'فشل في جلب البيانات');
        }
    } catch (error) {
        console.error("❌ خطأ في تحميل المنتجات:", error);
        if (page === 1 && noProductsMessage) {
            noProductsMessage.style.display = 'block';
            noProductsMessage.innerHTML = `
                <i class="fas fa-exclamation-triangle"></i>
                <h3>تعذر تحميل المنتجات</h3>
                <p>يرجى المحاولة مرة أخرى</p>
            `;
        }
        showMessage('تعذر تحميل المنتجات', 'error');
    } finally {
        isLoading = false;
        if (page === 1 && loadingIndicator) {
            loadingIndicator.style.display = 'none';
        }
    }
}

// دالة عرض زر العودة للرئيسية
function showBackToMainButton() {
    let backBtn = document.getElementById('backToMainBtn');
    
    if (!backBtn) {
        backBtn = document.createElement('button');
        backBtn.id = 'backToMainBtn';
        backBtn.className = 'back-to-main-btn';
        backBtn.innerHTML = '<i class="fas fa-arrow-right"></i> عودة للرئيسية';
        backBtn.onclick = () => {
            // مسح البحث
            const searchInput = document.getElementById('mainSearchInput');
            if (searchInput) searchInput.value = '';
            
            // إعادة تحميل المنتجات الرئيسية
            loadProducts(1, false, '');
        };
        
        const sectionHeader = document.querySelector('.section-title');
        if (sectionHeader) {
            sectionHeader.appendChild(backBtn);
        }
    }
    
    backBtn.style.display = 'flex';
}

// دالة إخفاء زر العودة
function hideBackToMainButton() {
    const backBtn = document.getElementById('backToMainBtn');
    if (backBtn) {
        backBtn.style.display = 'none';
    }
}

// دالة تحميل المزيد
function loadMoreProducts() {
    if (isLoading || !hasMoreProducts || currentSearchQuery) return;
    
    currentPage++;
    loadProducts(currentPage, true, '');
}

// دالة البحث الكامل
async function triggerFullSearch() {
    const searchInput = document.getElementById('mainSearchInput');
    const query = searchInput.value.trim();
    
    if (query.length < 2) {
        showMessage('أدخل كلمتين على الأقل للبحث', 'info');
        return;
    }

    if (!selectedBranchId) {
        showMessage('يرجى اختيار فرع أولاً', 'error');
        return;
    }

    // إخفاء نتائج البحث السريع
    hideSearchResults();
    
    // استدعاء loadProducts مع query البحث
    loadProducts(1, false, query);
}

// دالة البحث السريع (تبقى كما هي)
async function performSearch(query) {
    const searchResultsList = document.getElementById('searchResultsList');
    
    if (!searchResultsList) return;

    searchResultsList.innerHTML = `
        <div style="padding: 15px; text-align: center; color: var(--gray-600);">
            <i class="fas fa-spinner fa-spin"></i>
            جاري البحث...
        </div>
    `;
    searchResultsList.style.display = 'block';

    try {
        if (!selectedBranchId) {
            searchResultsList.innerHTML = `
                <div style="padding: 15px; text-align: center; color: var(--danger);">
                    <i class="fas fa-exclamation-triangle"></i>
                    يرجى اختيار فرع أولاً
                </div>
            `;
            return;
        }

        const searchUrl = `${API_BASE}/products/quick-search?q=${encodeURIComponent(query)}&branchId=${selectedBranchId}&type=all`;

        const response = await fetch(searchUrl);
        
        if (!response.ok) {
            throw new Error(`خطأ في البحث: ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.data && result.data.length > 0) {
            displaySearchResults(result.data);
        } else {
            searchResultsList.innerHTML = `
                <div style="padding: 15px; text-align: center; color: var(--gray-500);">
                    <i class="fas fa-search"></i>
                    لا توجد نتائج لـ "${query}"
                </div>
            `;
        }
    } catch (error) {
        console.error('❌ خطأ في البحث:', error);
        searchResultsList.innerHTML = `
            <div style="padding: 15px; text-align: center; color: var(--danger);">
                <i class="fas fa-exclamation-circle"></i>
                تعذر الاتصال بالخادم
            </div>
        `;
    }
}

function displayProducts(products, clear = true) {
    const container = document.getElementById('productsContainer');
    if (!container) return;

    if (clear) {
        container.innerHTML = '';
    }

    const drugs = products.filter(p => p.product_type === 'drug');
    const cosmetics = products.filter(p => p.product_type === 'cosmetic');

    console.log(`📊 عرض المنتجات: ${drugs.length} دواء، ${cosmetics.length} مستحضر`);

    function renderCards(productList, isDrugSection = true) {
        return productList.map((product, index) => {
            const isDrug = product.product_type === 'drug';
            const productType = isDrug ? 'drug' : 'cosmetic';
            const productId = product.branch_product_id || product.id; // ⚠️ استخدم branch_product_id
            const productName = product.name || 'منتج';
            
            const productKey = `${productType}_${productId}_${index}`;
            
            // تنظيف النص
            const cleanProductName = productName.replace(/'/g, "\\'");
            const cleanProductId = productId.toString().replace(/'/g, "\\'");
            const cleanProductType = productType.replace(/'/g, "\\'");
            
            console.log(`📝 إنشاء بطاقة: ${productName} | ID: ${productId} | السعر: ${product.price}`);
            
            return `
                <div class="product-card" 
                     data-product-id="${cleanProductId}"
                     data-product-type="${cleanProductType}"
                     data-product-name="${cleanProductName}"
                     data-product-key="${productKey}">
                    <span class="product-type ${isDrug ? 'drug-type' : 'cosmetic-type'}">
                        ${isDrug ? 'دواء' : 'مستحضر'}
                    </span>

                    <div class="product-image">
                        ${product.image_url ? 
                            `<img src="${product.image_url}" alt="${productName}" loading="lazy">` : 
                            `<i class="fas ${isDrug ? 'fa-capsules' : 'fa-spray-can-sparkles'}" 
                                 style="color: ${isDrug ? '#10b981' : '#8b5cf6'}; font-size: 50px;"></i>`
                        }
                    </div>

                    <div class="product-info">
                        <div class="product-name">${productName}</div>
                        
                        <div class="product-description" 
                             style="color: ${isDrug ? '#10b981' : '#8b5cf6'}; 
                                    font-weight: 500;">
                            ${isDrug ? 
                                (product.active_ingredient && product.active_ingredient !== 'لم يتم التدقيق بعد سوف نعرض المعلومات قريبا' ? 
                                    `المادة الفعالة: ${product.active_ingredient.substring(0, 30)}...` : 
                                    (product.description || 'دواء')) : 
                                (product.description || 'مستحضر تجميلي')}
                        </div>

                        <div class="product-price">${(product.price || 0).toFixed(2)} جنيه</div>
                    </div>

                    <button class="add-to-cart" 
                            onclick="handleProductSelection(this)"
                            data-product-id="${cleanProductId}"
                            data-product-type="${cleanProductType}"
                            data-product-name="${cleanProductName}"
                            data-product-key="${productKey}">
                        <i class="fas fa-cart-plus"></i>
                        إضافة للسلة
                    </button>
                </div>
            `;
        }).join('');
    }

    let html = '';

    if (drugs.length > 0) {
        html += `
            <div class="product-category-section">
                <h3 class="section-subtitle">💊 الأدوية المتاحة (${drugs.length})</h3>
                <div class="products-grid">
                    ${renderCards(drugs, true)}
                </div>
            </div>
        `;
    }

    if (cosmetics.length > 0) {
        html += `
            <div class="product-category-section">
                <h3 class="section-subtitle">💄 المستحضرات والعناية (${cosmetics.length})</h3>
                <div class="products-grid">
                    ${renderCards(cosmetics, false)}
                </div>
            </div>
        `;
    }

    if (drugs.length === 0 && cosmetics.length === 0) {
        html = `
            <div class="no-products">
                <i class="fas fa-box-open"></i>
                <h3>لا توجد منتجات متاحة حالياً</h3>
                <p>استخدم شريط البحث للعثور على منتجات</p>
            </div>
        `;
    }

    container.innerHTML = html;
}

// 🔵 دالة جديدة للتعامل مع اختيار المنتج
function handleProductSelection(button) {
    console.log('🖱️ نقر على زر المنتج');
    
    // الحصول على البيانات من الزر
    const productId = button.getAttribute('data-product-id');
    const productType = button.getAttribute('data-product-type');
    const productName = button.getAttribute('data-product-name');
    
    console.log('  - ID:', productId);
    console.log('  - النوع:', productType);
    console.log('  - الاسم:', productName);
    
    // البحث عن المنتج في allProducts باستخدام branch_product_id
    let product = null;
    
    if (allProducts && allProducts.length > 0) {
        // البحث باستخدام branch_product_id أولاً
        product = allProducts.find(p => {
            const pId = p.branch_product_id || p.id;
            return pId && pId.toString() === productId && 
                   p.product_type === productType;
        });
        
        if (product) {
            console.log('✅ تم العثور على المنتج:', product.name, 'السعر:', product.price);
        } else {
            console.log('⚠️ المنتج غير موجود، البحث بالاسم');
            // البحث بالاسم كحل بديل
            product = allProducts.find(p => 
                p.name === productName && 
                p.product_type === productType
            );
            
            if (product) {
                console.log('✅ تم العثور بالاسم:', product.name);
            }
        }
    }
    
    if (!product) {
        console.log('⚠️ المنتج غير موجود في allProducts');
        product = {
            id: productId,
            branch_product_id: productId,
            product_id: productId,
            name: productName,
            product_type: productType,
            type: productType,
            price: 0
        };
    }
    
    // فتح نافذة الكمية
    openQuantityModal(productId, productType, productName, product);
}

// 🔵 دالة لفحص البيانات في الكونسول
function debugProductsData() {
    console.log('🔍 فحص بيانات المنتجات:');
    console.log('عدد المنتجات في allProducts:', allProducts.length);
    
    // فحص الأدوية
    const drugs = allProducts.filter(p => 
        p.product_type === 'drug' || p.type === 'drug'
    );
    console.log('عدد الأدوية:', drugs.length);
    drugs.forEach((drug, index) => {
        console.log(`  ${index + 1}. ${drug.name} | ID: ${drug.id} | Type: ${drug.type}`);
    });
    
    // فحص المستحضرات
    const cosmetics = allProducts.filter(p => 
        p.product_type === 'cosmetic' || p.type === 'cosmetic'
    );
    console.log('عدد المستحضرات:', cosmetics.length);
    cosmetics.forEach((cosmetic, index) => {
        console.log(`  ${index + 1}. ${cosmetic.name} | ID: ${cosmetic.id} | Type: ${cosmetic.type}`);
    });
    
    // التحقق من الـ IDs المتكررة
    const ids = allProducts.map(p => p.id || p.branch_product_id);
    const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
    console.log('الـ IDs المتكررة:', [...new Set(duplicateIds)]);
}

// استدع هذه الدالة بعد تحميل المنتجات
// في نهاية دالة loadProducts:
setTimeout(() => {
    debugProductsData();
}, 1000);

function updateLoadMoreButton(show) {
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    if (loadMoreContainer) {
        loadMoreContainer.style.display = show ? 'block' : 'none';
    }
    
    if (loadMoreBtn) {
        loadMoreBtn.disabled = isLoading;
        loadMoreBtn.innerHTML = isLoading ? 
            `<i class="fas fa-spinner fa-spin"></i> جاري التحميل...` :
            `<i class="fas fa-sync-alt"></i> تحميل المزيد`;
    }
}

function loadMoreProducts() {
    if (isLoading || !hasMoreProducts) return;
    
    currentPage++;
    loadProducts(currentPage, true);
}

// ==================== نافذة اختيار الكمية ====================
async function openQuantityModal(productId, productType, productName = '') {
    console.log('🔔 openQuantityModal تم استدعاؤها!');
    console.log('  - productId:', productId);
    console.log('  - productType:', productType);
    console.log('  - productName:', productName);
    
    try {
        const cleanProductId = productId.toString().trim();
        const cleanProductType = productType.toString().trim();
        
        if (!cleanProductId || cleanProductId === 'undefined' || cleanProductId === 'null') {
            showMessage('خطأ: معرف المنتج غير صالح', 'error');
            return;
        }
        
        console.log('🔍 البحث عن المنتج في allProducts...');
        console.log('عدد المنتجات في allProducts:', allProducts.length);
        
        // البحث عن المنتج في allProducts
        let product = null;
        
        if (allProducts && allProducts.length > 0) {
            // أولاً: البحث باستخدام branch_product_id (هذا هو المهم!)
            product = allProducts.find(p => {
                const pId = p.branch_product_id || p.id;
                console.log(`🔎 مقارنة: ${pId} == ${cleanProductId}? النوع: ${p.product_type}`);
                return pId && pId.toString() === cleanProductId && 
                       p.product_type === cleanProductType;
            });
            
            if (product) {
                console.log('✅ المنتج موجود في allProducts:', product.name);
                console.log('💰 السعر:', product.price);
            } else {
                console.log('⚠️ لم يتم العثور باستخدام branch_product_id، البحث بالـ product_id');
                
                // ثانياً: البحث باستخدام product_id
                product = allProducts.find(p => {
                    const pProductId = p.product_id;
                    return pProductId && pProductId.toString() === cleanProductId;
                });
                
                if (product) {
                    console.log('✅ تم العثور باستخدام product_id:', product.name);
                }
            }
        }
        
        // إذا لم يتم العثور بعد، ابحث في نتائج البحث
        if (!product && currentSearchResults && currentSearchResults.length > 0) {
            console.log('🔍 البحث في currentSearchResults...');
            product = currentSearchResults.find(r => {
                const rId = r.branch_product_id || r.id;
                return rId && rId.toString() === cleanProductId;
            });
            
            if (product) {
                console.log('✅ المنتج موجود في currentSearchResults:', product.name);
                // تأكد من أن البيانات بالشكل الصحيح
                product = {
                    id: product.branch_product_id || product.id,
                    branch_product_id: product.branch_product_id || product.id,
                    product_id: product.original_id || product.id,
                    name: product.name,
                    product_type: product.product_category || cleanProductType,
                    type: product.product_category || cleanProductType,
                    price: parseFloat(product.price) || 0,
                    active_ingredient: product.active_ingredient || '',
                    description: product.description || ''
                };
            }
        }
        
        // إذا لم نجد المنتج، ننشئ بيانات افتراضية
        if (!product) {
            console.log('⚠️ المنتج غير موجود في البيانات المحملة، إنشاء بيانات افتراضية');
            product = {
                id: cleanProductId,
                branch_product_id: cleanProductId,
                product_id: cleanProductId,
                name: productName || 'منتج',
                product_type: cleanProductType,
                type: cleanProductType,
                price: 0
            };
            
            // محاولة جلب المنتج من API
            try {
                const searchResult = await fetchProductFromAPI(cleanProductId, cleanProductType);
                if (searchResult) {
                    product = searchResult;
                    console.log('✅ تم جلب المنتج من API:', product.name, 'السعر:', product.price);
                }
            } catch (error) {
                console.error('❌ خطأ في جلب المنتج من API:', error);
            }
        }
        
        // حفظ بيانات المنتج
        selectedProductForQuantity = {
            productId: cleanProductId,
            productType: cleanProductType
        };
        
        modalProductData = product;
        modalQuantity = 1;
        modalProductPrice = parseFloat(product.price || 0);
        
        console.log('💰 السعر النهائي:', modalProductPrice);
        
        // تحديث واجهة المودال
        updateQuantityModalUI();
        
        // إظهار المودال
        const modal = document.getElementById('quantityModal');
        if (modal) {
            modal.style.display = 'flex';
            console.log('✅ تم عرض نافذة الكمية للمنتج:', product.name, 'السعر:', product.price);
        }
        
    } catch (error) {
        console.error('❌ خطأ في openQuantityModal:', error);
        showMessage('حدث خطأ في فتح نافذة الكمية', 'error');
    }
}

async function getProductPrice(productId, productType) {
    if (!selectedBranchId) return 0;
    
    try {
        const response = await fetch(
            `${API_BASE}/products/${productId}/price?type=${productType}&branchId=${selectedBranchId}`
        );
        
        if (response.ok) {
            const result = await response.json();
            return parseFloat(result.price) || 0;
        }
        return 0;
    } catch (error) {
        console.error('❌ خطأ في جلب السعر:', error);
        return 0;
    }
}

function updateQuantityModalUI() {
    if (!modalProductData) return;

    const productName = document.getElementById('quantityProductName');
    const productPrice = document.getElementById('quantityProductPrice');
    const modalInput = document.getElementById('modalQuantityInput');
    const totalPrice = document.getElementById('modalTotalPrice');
    const productImage = document.getElementById('quantityProductImage');

    if (productName) productName.textContent = modalProductData.name || 'منتج بدون اسم';
    if (productPrice) productPrice.textContent = `${modalProductPrice.toFixed(2)} جنيه`;
    if (modalInput) modalInput.value = modalQuantity;
    if (totalPrice) totalPrice.textContent = `${(modalQuantity * modalProductPrice).toFixed(2)} جنيه`;

    // تحديث الصورة
    if (productImage) {
        const isDrug = selectedProductForQuantity?.productType === 'drug';
        if (modalProductData.image_url) {
            productImage.innerHTML = `<img src="${modalProductData.image_url}" alt="${modalProductData.name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 10px;">`;
        } else {
            productImage.innerHTML = `<i class="fas ${isDrug ? 'fa-capsules' : 'fa-spray-can-sparkles'}"></i>`;
        }
    }
}
function closeQuantityModal() {
    const modal = document.getElementById('quantityModal');
    if (modal) {
        modal.style.display = 'none';
        console.log('✅ تم إغلاق نافذة الكمية');
    }
    selectedProductForQuantity = null;
    modalProductData = null;
}
function changeModalQuantity(change) {
    if (!modalProductData) return;
    
    let newQuantity = modalQuantity + change;
    if (newQuantity < 1) newQuantity = 1;
    if (newQuantity > 99) newQuantity = 99;
    
    modalQuantity = newQuantity;
    
    const modalInput = document.getElementById('modalQuantityInput');
    if (modalInput) {
        modalInput.value = modalQuantity;
    }
    
    const totalPriceEl = document.getElementById('modalTotalPrice');
    if (totalPriceEl) {
        totalPriceEl.textContent = `${(modalQuantity * modalProductPrice).toFixed(2)} جنيه`;
    }
}
function confirmAddToCart() {
    console.log('🛒 تأكيد إضافة إلى السلة');
    
    if (!selectedProductForQuantity || !modalProductData) {
        showMessage('لم يتم تحديد منتج', 'error');
        return;
    }
    
    const { productId, productType } = selectedProductForQuantity;
    const quantity = parseInt(document.getElementById('modalQuantityInput')?.value) || 1;
    
    console.log('  - إضافة المنتج:', {
        productId,
        productType,
        quantity,
        productName: modalProductData.name
    });
    
    // إضافة المنتج للسلة
    addToCart(productId, productType, quantity, modalProductData);
    
    closeQuantityModal();
    showMessage('تمت الإضافة إلى السلة ✓', 'success');
}
function addToCart(productId, productType, quantity, productData) {
    console.log('➕ إضافة إلى السلة:', {
        productId,
        productType,
        quantity,
        productName: productData.name,
        price: productData.price
    });
    
    // ⚠️ التأكد من استخدام branch_product_id في السلة
    const branchProductId = productData.branch_product_id || productId;
    
    // البحث عن المنتج في السلة
    const existingIndex = cart.findIndex(item => 
        item.branch_product_id == branchProductId && 
        item.product_type === productType
    );
    
    const price = parseFloat(productData.price) || 0;
    
    if (existingIndex !== -1) {
        // تحديث الكمية والسعر
        cart[existingIndex].quantity += quantity; // ⚠️ إضافة إلى الكمية الحالية
        cart[existingIndex].price = price;
        console.log(`✅ تم تحديث المنتج: ${productData.name}، الكمية الجديدة: ${cart[existingIndex].quantity}`);
    } else {
        // إضافة منتج جديد
        cart.push({
            product_type: productType,
            branch_product_id: branchProductId,
            product_id: productData.product_id || productData.id,
            quantity: quantity,
            name: productData.name || 'منتج',
            price: price,
            type: productData.type || productType,
            active_ingredient: productData.active_ingredient || '',
            description: productData.description || ''
        });
        console.log(`✅ تم إضافة المنتج الجديد: ${productData.name}، الكمية: ${quantity}`);
    }
    
    updateCartBadge();
    updateCartDisplay();
    saveCart();
}

async function fetchProductFromAPI(productId, productType) {
    try {
        console.log(`🔍 جلب المنتج من API: ${productId}, ${productType}`);
        
        // البحث باستخدام quick-search مع ID معين
        const url = `${API_BASE}/products/quick-search?q=${productId}&branchId=${selectedBranchId}&type=all&limit=1`;
        console.log('🌐 URL:', url);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`خطأ في الاستجابة: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success && result.data && result.data.length > 0) {
            const productData = result.data[0];
            console.log('✅ تم جلب المنتج:', productData.name, 'السعر:', productData.price);
            
            return {
                id: productData.branch_product_id || productData.id,
                branch_product_id: productData.branch_product_id || productData.id,
                product_id: productData.original_id || productData.id,
                name: productData.name,
                product_type: productData.product_category || productType,
                type: productData.product_category || productType,
                price: parseFloat(productData.price) || 0,
                active_ingredient: productData.active_ingredient || '',
                description: productData.description || '',
                image_url: productData.image_url || ''
            };
        }
        
        console.log('⚠️ لم يتم العثور على المنتج في API');
        return null;
        
    } catch (error) {
        console.error('❌ خطأ في جلب المنتج من API:', error);
        return null;
    }
}

function closeQuantityModal() {
    const modal = document.getElementById('quantityModal');
    if (modal) {
        modal.style.display = 'none';
    }
    selectedProductForQuantity = null;
    modalProductData = null;
}

function changeModalQuantity(change) {
    let newQuantity = modalQuantity + change;
    if (newQuantity < 1) newQuantity = 1;
    if (newQuantity > 99) newQuantity = 99;

    modalQuantity = newQuantity;
    
    const modalInput = document.getElementById('modalQuantityInput');
    if (modalInput) {
        modalInput.value = modalQuantity;
    }
    
    const totalPriceElement = document.getElementById('modalTotalPrice');
    if (totalPriceElement) {
        totalPriceElement.textContent = `${(modalQuantity * modalProductPrice).toFixed(2)} جنيه`;
    }
}

function handleModalQuantityInput(e) {
    let value = parseInt(e.target.value) || 1;
    if (value < 1) value = 1;
    if (value > 99) value = 99;

    modalQuantity = value;
    
    const totalPriceElement = document.getElementById('modalTotalPrice');
    if (totalPriceElement) {
        totalPriceElement.textContent = `${(modalQuantity * modalProductPrice).toFixed(2)} جنيه`;
    }
}

async function confirmAddToCart() {
    if (!selectedProductForQuantity || !modalProductData) {
        showMessage('لم يتم تحديد منتج', 'error');
        return;
    }

    const { productId, productType } = selectedProductForQuantity;
    
    // إضافة المنتج للسلة
    await updateCartFromQuantity(productId, productType, modalQuantity);
    
    closeQuantityModal();
    showMessage('تمت الإضافة إلى السلة ✓', 'success');
}

// ==================== نظام السلة ====================
async function updateCartFromQuantity(productId, productType, quantity) {
    let product = modalProductData;
    
    if (!product) {
        product = await fetchProductFromAPI(productId, productType);
    }

    if (!product) {
        showMessage('المنتج غير متاح', 'error');
        return;
    }

    const branchProductId = product.branch_product_id || product.id;
    const existingIndex = cart.findIndex(item => 
        item.branch_product_id === branchProductId && item.product_type === productType
    );

    if (quantity === 0) {
        if (existingIndex !== -1) {
            cart.splice(existingIndex, 1);
        }
    } else {
        const price = parseFloat(product.price || 0);

        if (existingIndex !== -1) {
            cart[existingIndex].quantity = quantity;
            cart[existingIndex].price = price;
        } else {
            cart.push({
                product_type: productType,
                branch_product_id: branchProductId,
                product_id: product.id,
                quantity: quantity,
                name: product.name,
                price: price,
                type: product.type || productType,
                active_ingredient: product.active_ingredient,
                description: product.description
            });
        }
    }

    updateCartBadge();
    updateCartDisplay();
    saveCart();
}

function updateCartBadge() {
    const cartBadge = document.getElementById('cartBadge');
    if (cartBadge) {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartBadge.textContent = totalItems;
        cartBadge.style.display = totalItems > 0 ? 'flex' : 'none';
    }
}

function updateCartDisplay() {
    const cartContent = document.getElementById('cartContent');
    const checkoutBtn = document.getElementById('checkoutBtn');

    if (!cartContent) return;

    if (cart.length === 0) {
        cartContent.innerHTML = `
            <div class="empty-cart">
                <i class="fas fa-shopping-cart"></i>
                <h3>سلة المشتريات فارغة</h3>
                <p>أضف منتجات من القائمة لبدء الطلب</p>
            </div>
            <div class="cart-total">
                <span class="total-label">المجموع:</span>
                <span class="total-amount">0 جنيه</span>
            </div>
        `;
        
        if (checkoutBtn) {
            checkoutBtn.disabled = true;
        }
        return;
    }

    let total = 0;
    let itemsHtml = '';

    cart.forEach((item, index) => {
        const itemTotal = (item.price || 0) * item.quantity;
        total += itemTotal;

        const typeIcon = item.product_type === 'drug' ? 'fa-capsules' : 'fa-spray-can-sparkles';
        const typeColor = item.product_type === 'drug' ? 'var(--success)' : '#3b82f6';

        // ⚠️ المهم: استخدام branch_product_id بدلاً من product_id
        const productIdentifier = item.branch_product_id || item.product_id;
        
        itemsHtml += `
            <div class="cart-item" data-item-index="${index}">
                <div class="cart-item-image" style="background: ${typeColor}20;">
                    <i class="fas ${typeIcon}" style="color: ${typeColor}; font-size: 28px; display: flex; align-items: center; justify-content: center; height: 100%;"></i>
                </div>
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.name}</div>
                    <div class="cart-item-details">
                        <div class="cart-item-price">${itemTotal.toFixed(2)} جنيه</div>
                        <div class="cart-item-quantity">
                            <button class="cart-qty-btn" onclick="updateCartQuantity(${index}, -1)">
                                <i class="fas fa-minus"></i>
                            </button>
                            <input type="text" 
                                   value="${item.quantity}" 
                                   class="cart-qty-input" 
                                   readonly>
                            <button class="cart-qty-btn" onclick="updateCartQuantity(${index}, 1)">
                                <i class="fas fa-plus"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <button class="cart-item-remove" onclick="removeCartItem(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    });

    const formSection = `
        <div class="order-notes">
            <label for="prescription">
                <i class="fas fa-notes-medical"></i>
                ملاحظات / روشتة طبية (اختياري)
            </label>
            <textarea id="prescription" 
                      placeholder="يمكنك إرفاق روشتة طبية أو تعليمات خاصة...
أو اكتب الأدوية المطلوبة إذا لم تجدها في القائمة..."></textarea>
        </div>
        
        <div class="image-upload">
            <label class="upload-label">
                <i class="fas fa-camera"></i>
                رفع صور الروشتة الطبية (اختياري)
                <span style="font-size: 12px; color: var(--gray-500); font-weight: normal; margin-right: 5px;">
                    - يمكنك رفع حتى 5 صور
                </span>
            </label>
            
            <div class="upload-box" onclick="document.getElementById('imageUpload').click()">
                <div class="upload-icon">
                    <i class="fas fa-cloud-upload-alt"></i>
                </div>
                <div class="upload-text">انقر لرفع الصور</div>
                <div class="upload-hint">
                    <i class="fas fa-info-circle"></i>
                    JPG, PNG, WEBP - أقصى حجم 5MB للصورة
                </div>
            </div>
            
            <input type="file" 
                   id="imageUpload" 
                   multiple 
                   accept="image/*" 
                   style="display: none"
                   onchange="handleImageUpload(event)">
            
            <div id="imagePreview" class="image-preview"></div>
        </div>
    `;

    cartContent.innerHTML = `
        <div class="cart-items">
            ${itemsHtml}
        </div>
        <div class="cart-total">
            <span class="total-label">المجموع:</span>
            <span class="total-amount">${total.toFixed(2)} جنيه</span>
        </div>
        ${formSection}
    `;

    if (checkoutBtn) {
        checkoutBtn.disabled = false;
    }
}

// 🔧 دالة جديدة للتحكم في الكمية بناءً على الفهرس
function updateCartQuantity(itemIndex, change) {
    console.log('🔄 تحديث الكمية:', { itemIndex, change });
    
    if (itemIndex < 0 || itemIndex >= cart.length) {
        console.error('❌ فهرس غير صالح:', itemIndex);
        return;
    }
    
    const item = cart[itemIndex];
    
    if (!item) {
        console.error('❌ العنصر غير موجود:', itemIndex);
        return;
    }
    
    const newQuantity = item.quantity + change;
    
    if (newQuantity < 1) {
        // إذا كانت الكمية أقل من 1، احذف العنصر
        if (confirm(`هل تريد إزالة ${item.name} من السلة؟`)) {
            removeCartItem(itemIndex);
        }
        return;
    }
    
    if (newQuantity > 99) {
        showMessage('الحد الأقصى للكمية هو 99', 'warning');
        return;
    }
    
    // تحديث الكمية مباشرة
    item.quantity = newQuantity;
    
    // تحديث العرض
    updateCartBadge();
    updateCartDisplay();
    saveCart();
    
    // إظهار رسالة التحديث
    showMessage(`تم تحديث كمية ${item.name} إلى ${newQuantity}`, 'success', 2000);
}

// 🔧 دالة جديدة لحذف العنصر بناءً على الفهرس
function removeCartItem(itemIndex) {
    if (itemIndex < 0 || itemIndex >= cart.length) {
        console.error('❌ فهرس غير صالح:', itemIndex);
        return;
    }
    
    const itemName = cart[itemIndex].name;
    
    // إزالة العنصر من المصفوفة
    cart.splice(itemIndex, 1);
    
    // تحديث العرض والحفظ
    updateCartBadge();
    updateCartDisplay();
    saveCart();
    
    showMessage(`تم إزالة ${itemName} من السلة`, 'success', 2000);
}

// 🔧 إزالة الدوال القديمة أو تحديثها
window.updateCartQuantity = updateCartQuantity;
window.removeCartItem = removeCartItem;

function updateCartItemQuantity(productType, productId, change) {
    const item = cart.find(item => 
        item.product_type === productType && item.product_id == productId
    );
    
    if (!item) return;

    const newQuantity = item.quantity + change;
    if (newQuantity < 1) {
        removeFromCart(productType, productId);
        return;
    }

    updateCartFromQuantity(productId, productType, newQuantity);
}

function removeFromCart(productType, productId) {
    const originalLength = cart.length;
    cart = cart.filter(item => 
        !(item.product_type === productType && item.product_id == productId)
    );

    if (cart.length < originalLength) {
        updateCartBadge();
        updateCartDisplay();
        saveCart();
        showMessage('تمت الإزالة من السلة', 'success');
    }
}

function saveCart() {
    if (cart.length > 0) {
        localStorage.setItem('saved_cart', JSON.stringify(cart));
    } else {
        localStorage.removeItem('saved_cart');
    }
}

function loadSavedCart() {
    const savedCart = localStorage.getItem('saved_cart');
    if (savedCart) {
        try {
            const parsedCart = JSON.parse(savedCart);
            if (Array.isArray(parsedCart)) {
                cart = parsedCart;
                updateCartBadge();
            }
        } catch (e) {
            console.error('❌ خطأ في تحميل السلة المحفوظة:', e);
            localStorage.removeItem('saved_cart');
        }
    }
}

function toggleCart() {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');

    if (drawer && overlay) {
        drawer.classList.toggle('open');
        overlay.classList.toggle('show');
        
        if (drawer.classList.contains('open')) {
            updateCartDisplay();
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }
}

function closeCart() {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');

    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
    
    document.body.style.overflow = '';
}

// ==================== نظام رفع الصور ====================
function handleImageUpload(event) {
    const files = event.target.files;
    const imagePreview = document.getElementById('imagePreview');

    if (!imagePreview) return;

    // التحقق من عدد الصور
    if (prescriptionImages.length + files.length > 5) {
        showMessage('يمكنك رفع حتى 5 صور فقط!', 'error');
        event.target.value = '';
        return;
    }

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        // التحقق من حجم الصورة (5MB)
        if (file.size > 5 * 1024 * 1024) {
            showMessage(`الصورة "${file.name}" كبيرة جداً (الحد الأقصى 5MB)`, 'error');
            continue;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const imageData = {
                id: Date.now() + i,
                data: e.target.result.split(',')[1],
                name: file.name,
                size: file.size,
                type: file.type
            };

            prescriptionImages.push(imageData);
            updateImagePreview();
        };
        reader.readAsDataURL(file);
    }

    event.target.value = '';
}

function updateImagePreview() {
    const imagePreview = document.getElementById('imagePreview');
    if (!imagePreview) return;

    imagePreview.innerHTML = '';

    prescriptionImages.forEach((image, index) => {
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';
        previewItem.innerHTML = `
            <img src="data:${image.type};base64,${image.data}" alt="صورة ${index + 1}" class="preview-image">
            <div class="preview-info">${Math.round(image.size / 1024)} KB</div>
            <button class="remove-preview" onclick="removeImage(${image.id})">
                <i class="fas fa-times"></i>
            </button>
        `;
        imagePreview.appendChild(previewItem);
    });
}

function removeImage(imageId) {
    prescriptionImages = prescriptionImages.filter(img => img.id !== imageId);
    updateImagePreview();
}

async function uploadOrderImages(orderId) {
    try {
        console.log(`📸 رفع ${prescriptionImages.length} صورة للطلب ${orderId}`);

        if (prescriptionImages.length === 0) return;

        for (let i = 0; i < prescriptionImages.length; i++) {
            const image = prescriptionImages[i];
            const imageData = {
                image_base64: image.data,
                image_name: image.name || `prescription_${Date.now()}_${i}.jpg`
            };

            try {
                await fetch(`${API_BASE}/orders/${orderId}/image`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(imageData)
                });
            } catch (error) {
                console.error(`❌ خطأ في رفع الصورة ${i + 1}:`, error);
            }

            // تأخير بسيط بين الصور
            if (i < prescriptionImages.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

    } catch (error) {
        console.error('❌ خطأ عام في رفع الصور:', error);
    }
}

// ==================== تأكيد الطلب مع سؤال الواتساب ====================
async function placeOrder() {
    const checkoutBtn = document.getElementById('checkoutBtn');
    const checkoutText = document.getElementById('checkoutText');
    const checkoutLoading = document.getElementById('checkoutLoading');

    // التحقق من وجود أصناف في السلة
    if (cart.length === 0) {
        showMessage('السلة فارغة. أضف منتجات أولاً', 'error');
        return;
    }

    // التحقق من اختيار الفرع
    if (!selectedBranchId) {
        showMessage('يرجى اختيار فرع أولاً', 'error');
        return;
    }

    // التحقق من عدد الصور
    if (prescriptionImages.length > 5) {
        showMessage('يمكنك رفع حتى 5 صور فقط!', 'error');
        return;
    }

    // سؤال المستخدم إذا كان يريد إرسال رسالة واتساب
    const sendToWhatsApp = await askWhatsAppConfirmation();
    if (sendToWhatsApp === null) {
        return; // المستخدم ألغى العملية
    }

    shouldSendToWhatsApp = sendToWhatsApp;

    // حالة التحميل
    if (checkoutBtn) checkoutBtn.disabled = true;
    if (checkoutText) checkoutText.style.display = 'none';
    if (checkoutLoading) checkoutLoading.style.display = 'inline-block';

    try {
        // إعداد بيانات الطلب
        const orderData = {
            client_id: clientId,
            branch_id: selectedBranchId,
            items: cart.map(item => ({
                product_type: item.product_type,
                branch_product_id: item.branch_product_id,
                quantity: item.quantity,
                notes: item.active_ingredient || item.description || ''
            })),
            customer_notes: document.getElementById('prescription')?.value || ''
        };

        console.log('📦 إرسال الطلب:', orderData);

        // إرسال الطلب
        const response = await fetch(`${API_BASE}/orders`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });

        const result = await response.json();
        console.log('📦 استجابة الطلب:', result);

        if (result.success) {
            const orderId = result.data.order_id;

            // رفع الصور إن وجدت
            if (prescriptionImages.length > 0) {
                await uploadOrderImages(orderId);
            }

            // إرسال للواتساب إذا طلب المستخدم
            if (shouldSendToWhatsApp) {
                // التحقق من ID الفرع
                if (selectedBranchId === 2) {
                    const success = sendOrderToWhatsApp(orderId, result.data);
                    if (success) {
                        showMessage('تم تسجيل طلبك وإرساله للواتساب بنجاح!', 'success');
                    } else {
                        showMessage('تم تسجيل طلبك بنجاح! ولكن تعذر إرساله للواتساب', 'warning');
                    }
                } else {
                    showMessage('تم تسجيل طلبك بنجاح! الميزة قيد التطوير حالياً للفروع الأخرى', 'info');
                }
            } else {
                showMessage('تم تسجيل طلبك بنجاح! سيتم التواصل معك قريباً', 'success');
            }

            // رسالة تنبيه إضافية
            showNotificationMessage();

            // إعادة تعيين السلة
            resetCart();

            // توجيه إلى صفحة حالة الطلب بعد 3 ثواني
            setTimeout(() => {
                window.location.href = `orderstate.html?order_id=${orderId}`;
            }, 3000);

        } else {
            throw new Error(result.message || 'فشل في تأكيد الطلب');
        }
    } catch (error) {
        console.error('❌ خطأ في تنفيذ الطلب:', error);
        showMessage('حدث خطأ: ' + error.message, 'error');
    } finally {
        // إعادة حالة الأزرار
        if (checkoutBtn) checkoutBtn.disabled = false;
        if (checkoutText) checkoutText.style.display = 'inline';
        if (checkoutLoading) checkoutLoading.style.display = 'none';
    }
}

function showNotificationMessage() {
    Swal.fire({
        title: '⚠️ ملاحظة مهمة',
        html: `
            <div style="text-align: right; direction: rtl;">
                <p style="font-size: 16px; margin-bottom: 15px;">
                    <strong>سيتم التواصل معك في حال:</strong>
                </p>
                <ul style="text-align: right; padding-right: 20px; margin-bottom: 20px;">
                    <li>وجود نقص في الصنف المختار</li>
                    <li>عدم توفر المنتج</li>
                    <li>الحاجة لتوضيح حول الروشتة</li>
                    <li>تحديد موعد التوصيل</li>
                </ul>
                <p style="color: #666; font-size: 14px;">
                    <i class="fas fa-info-circle"></i>
                    يمكنك متابعة حالة طلبك من صفحة حالة الطلب
                </p>
            </div>
        `,
        icon: 'info',
        confirmButtonText: 'حسناً',
        confirmButtonColor: '#4f46e5',
        showCloseButton: true,
        customClass: {
            popup: 'rtl-popup'
        }
    });
}

function askWhatsAppConfirmation() {
    return new Promise((resolve) => {
        // إنشاء نافذة تأكيد
        const modalHTML = `
            <div id="whatsappModal" style="
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            ">
                <div style="
                    background: white;
                    width: 90%;
                    max-width: 400px;
                    border-radius: 16px;
                    padding: 25px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    text-align: center;
                ">
                    <div style="
                        width: 70px;
                        height: 70px;
                        background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 20px;
                        color: white;
                        font-size: 32px;
                    ">
                        <i class="fab fa-whatsapp"></i>
                    </div>
                    
                    <h3 style="
                        font-size: 22px;
                        color: var(--gray-800);
                        margin-bottom: 10px;
                    ">
                        إرسال الطلب عبر الواتساب؟
                    </h3>
                    
                    <p style="
                        color: var(--gray-600);
                        line-height: 1.6;
                        margin-bottom: 25px;
                        font-size: 16px;
                    ">
                        هل تريد إرسال تفاصيل طلبك عبر رسالة واتساب للإدارة؟
                        <br>
                        <small style="color: var(--gray-500);">
                            (اختياري - يساعد في تسريع العملية)
                        </small>
                    </p>
                    
                    <div style="
                        display: flex;
                        gap: 15px;
                        justify-content: center;
                    ">
                        <button id="whatsappYesBtn" style="
                            flex: 1;
                            padding: 15px;
                            background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
                            color: white;
                            border: none;
                            border-radius: 12px;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 10px;
                        ">
                            <i class="fab fa-whatsapp"></i>
                            نعم، أرسل
                        </button>
                        
                        <button id="whatsappNoBtn" style="
                            flex: 1;
                            padding: 15px;
                            background: var(--gray-200);
                            color: var(--gray-700);
                            border: none;
                            border-radius: 12px;
                            font-size: 16px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 10px;
                        ">
                            <i class="fas fa-times"></i>
                            لا، فقط سجل الطلب
                        </button>
                    </div>
                    
                    <button id="whatsappCancelBtn" style="
                        margin-top: 20px;
                        background: none;
                        border: none;
                        color: var(--gray-500);
                        font-size: 14px;
                        cursor: pointer;
                    ">
                        إلغاء
                    </button>
                </div>
            </div>
        `;
        
        // إضافة النافذة للصفحة
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // إضافة المستمعين للأحداث
        document.getElementById('whatsappYesBtn').addEventListener('click', () => {
            removeWhatsAppModal();
            resolve(true);
        });
        
        document.getElementById('whatsappNoBtn').addEventListener('click', () => {
            removeWhatsAppModal();
            resolve(false);
        });
        
        document.getElementById('whatsappCancelBtn').addEventListener('click', () => {
            removeWhatsAppModal();
            resolve(null);
        });
        
        function removeWhatsAppModal() {
            const modal = document.getElementById('whatsappModal');
            if (modal) {
                modal.remove();
            }
        }
    });
}

function sendOrderToWhatsApp(orderId, orderData) {
    try {
        let message = `*📦 طلب جديد من صيدلية سارة العجرمي*%0A`;
        message += `*رقم الطلب:* ${orderId}%0A`;
        message += `*العميل:* ${clientData.name}%0A`;
        message += `*الهاتف:* ${clientData.phone || 'غير متوفر'}%0A`;
        message += `*العنوان:* ${clientData.address || 'غير محدد'}%0A`;
        message += `*الفرع:* ${getBranchName(selectedBranchId)}%0A`;
        message += `---------------------------%0A`;
        message += `*المنتجات المطلوبة:*%0A`;

        cart.forEach((item, index) => {
            const itemTotal = (item.price * item.quantity).toFixed(2);
            const activeIngredient = item.active_ingredient ? ` [${item.active_ingredient}]` : '';
            const itemType = item.product_type === 'drug' ? '💊' : '💄';
            
            message += `${index + 1}. ${itemType} *${item.name}*${activeIngredient}%0A`;
            message += `   الكمية: ${item.quantity} × ${item.price.toFixed(2)} = ${itemTotal} ج.م%0A`;
            
            if (item.description) {
                message += `   الوصف: ${item.description.substring(0, 50)}...%0A`;
            }
            message += `%0A`;
        });

        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        message += `---------------------------%0A`;
        message += `*الإجمالي النهائي:* ${total.toFixed(2)} جنيه%0A`;
        message += `*عدد المنتجات:* ${cart.length} منتج%0A`;

        const notes = document.getElementById('prescription')?.value.trim();
        if (notes) {
            message += `*ملاحظات العميل:* ${notes}%0A`;
        }

        if (prescriptionImages.length > 0) {
            message += `*صور مرفقة:* ${prescriptionImages.length} صورة%0A`;
        }

        message += `%0A_تم إرسال هذا الطلب تلقائياً من تطبيق العميل_`;

        const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;
        window.open(whatsappUrl, '_blank');
        
        return true;
    } catch (error) {
        console.error('❌ خطأ في إرسال الواتساب:', error);
        return false;
    }
}

function resetCart() {
    cart = [];
    prescriptionImages = [];
    updateCartBadge();
    updateCartDisplay();
    
    const imagePreview = document.getElementById('imagePreview');
    const prescriptionTextarea = document.getElementById('prescription');
    
    if (imagePreview) imagePreview.innerHTML = '';
    if (prescriptionTextarea) prescriptionTextarea.value = '';
    
    localStorage.removeItem('saved_cart');
    setTimeout(() => closeCart(), 2000);
}

// ==================== نظام الرسائل ====================
function showMessage(text, type = 'info', duration = 5000) {
    const msgDiv = document.getElementById('message');
    if (!msgDiv) return;

    const icon = type === 'success' ? 'check-circle' : 
                 type === 'error' ? 'exclamation-circle' : 
                 type === 'warning' ? 'exclamation-triangle' : 'info-circle';

    msgDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <i class="fas fa-${icon}"></i>
            <span>${text}</span>
        </div>
    `;
    msgDiv.className = `message ${type}`;
    msgDiv.style.display = 'block';

    setTimeout(() => {
        msgDiv.style.display = 'none';
    }, duration);
}

// ==================== تصدير الدوال للنافذة ====================
window.loadMoreProducts = loadMoreProducts;
window.openQuantityModal = openQuantityModal;
window.closeQuantityModal = closeQuantityModal;
window.changeModalQuantity = changeModalQuantity;
window.handleModalQuantityInput = handleModalQuantityInput;
window.confirmAddToCart = confirmAddToCart;
window.handleSearchResultClick = handleSearchResultClick;
window.updateCartItemQuantity = updateCartItemQuantity;
window.removeFromCart = removeFromCart;
window.toggleCart = toggleCart;
window.closeCart = closeCart;
window.changeBranch = changeBranch;
window.placeOrder = placeOrder;
window.removeImage = removeImage;
window.selectBranch = selectBranch;
window.confirmBranchSelection = confirmBranchSelection;
window.performSearch = performSearch;
window.displaySearchResults = displaySearchResults;
window.updateCartFromQuantity = updateCartFromQuantity;
window.handleImageUpload = handleImageUpload;

// ==================== أحداث الصفحة ====================
window.addEventListener('beforeunload', () => {
    saveCart();
});

window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        loadSavedCart();
    }
});

// إضافة CSS للرسائل
const style = document.createElement('style');
style.textContent = `
    .rtl-popup {
        direction: rtl;
        text-align: right;
    }
    
    .rtl-popup .swal2-title {
        text-align: right;
    }
    
    .rtl-popup .swal2-content {
        text-align: right;
    }
    
    .swal2-popup {
        font-family: 'Segoe UI', 'Cairo', sans-serif;
    }
`;
document.head.appendChild(style);
// في نهاية ملف JavaScript:
window.handleProductSelection = handleProductSelection;
window.debugProductsData = debugProductsData;
