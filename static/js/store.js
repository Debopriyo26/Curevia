/**
 * Curevia E-Pharmacy
 * Customer Storefront & Cart Engine (store.js)
 * Precision Care, Verified Deliveries
 * 
 * Supports:
 * - Unrestricted customer checkout (prescription optional, zero friction)
 * - Category dashboard header navigation sync
 * - Real-time stock display and multi-batch lot selection
 */

let cart = JSON.parse(localStorage.getItem('curevia_cart') || '[]');
let currentCategoryId = '';
let activeSearchQuery = '';
let activeRxFilter = '';
let userPrescriptions = [];

document.addEventListener('DOMContentLoaded', () => {
    initStore();
});

async function initStore() {
    updateCartUI();
    setupCartDrawerEvents();
    setupFilterEvents();
    setupCategoryNavEvents();
    await loadCategories();
    await loadProducts();
    await loadCustomerPrescriptions();
}

// ============================================================================
// SECONDARY CATEGORY DASHBOARD BAR SYNC
// ============================================================================
function setupCategoryNavEvents() {
    const navTabs = document.querySelectorAll('.category-nav-tab');
    if (!navTabs || navTabs.length === 0) return;

    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const catId = tab.getAttribute('data-cat-id') || '';
            currentCategoryId = catId;

            // Update active styling on secondary header bar
            navTabs.forEach(t => {
                t.className = 'category-nav-tab inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-bold transition-all border-b-2 border-transparent text-gray-600 hover:text-[#064E3B] hover:border-emerald-700';
            });
            tab.className = 'category-nav-tab inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-bold transition-all border-b-2 border-[#064E3B] text-[#064E3B]';

            // Sync with page pills if present
            const pillContainer = document.getElementById('category-pills');
            if (pillContainer) {
                pillContainer.querySelectorAll('.category-pill').forEach(p => {
                    const pCat = p.getAttribute('data-category-id') || '';
                    if (pCat === catId) {
                        p.className = 'category-pill flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all bg-[#064E3B] text-white shadow-xs';
                    } else {
                        p.className = 'category-pill flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all bg-white text-gray-700 border border-gray-200 hover:border-emerald-700';
                    }
                });
            }

            loadProducts();
        });
    });
}

// ============================================================================
// CATEGORY PILLS BAR (STOREFRONT INLINE)
// ============================================================================
async function loadCategories() {
    const container = document.getElementById('category-pills');
    if (!container) return;

    try {
        const res = await CureviaAPI.getCategories();
        const categories = res.categories || [];

        let html = `
            <button class="category-pill flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${currentCategoryId === '' ? 'bg-[#064E3B] text-white shadow-xs' : 'bg-white text-gray-700 border border-gray-200 hover:border-emerald-700'}" data-category-id="">
                All Categories
            </button>
        `;

        categories.forEach(cat => {
            const isSelected = currentCategoryId === String(cat.category_id);
            html += `
                <button class="category-pill flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all ${isSelected ? 'bg-[#064E3B] text-white shadow-xs' : 'bg-white text-gray-700 border border-gray-200 hover:border-emerald-700'}" data-category-id="${cat.category_id}">
                    ${cat.category_name}
                </button>
            `;
        });

        container.innerHTML = html;

        container.querySelectorAll('.category-pill').forEach(btn => {
            btn.addEventListener('click', () => {
                const catId = btn.getAttribute('data-category-id') || '';
                currentCategoryId = catId;
                
                container.querySelectorAll('.category-pill').forEach(b => {
                    b.className = 'category-pill flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all bg-white text-gray-700 border border-gray-200 hover:border-emerald-700';
                });
                btn.className = 'category-pill flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition-all bg-[#064E3B] text-white shadow-xs';

                // Sync header bar tabs as well
                const navTabs = document.querySelectorAll('.category-nav-tab');
                navTabs.forEach(t => {
                    const tId = t.getAttribute('data-cat-id') || '';
                    if (tId === catId) {
                        t.className = 'category-nav-tab inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-bold transition-all border-b-2 border-[#064E3B] text-[#064E3B]';
                    } else {
                        t.className = 'category-nav-tab inline-flex items-center space-x-1.5 px-3 py-2 text-xs font-bold transition-all border-b-2 border-transparent text-gray-600 hover:text-[#064E3B] hover:border-emerald-700';
                    }
                });

                loadProducts();
            });
        });

    } catch (err) {
        console.warn("Categories temporarily unavailable:", err);
    }
}

// ============================================================================
// FILTER & SEARCH CONTROLS
// ============================================================================
function setupFilterEvents() {
    const searchInput = document.getElementById('search-input');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    const rxFilterSelect = document.getElementById('rx-filter-select');
    const refreshCatalogBtn = document.getElementById('refresh-catalog-btn');

    let debounceTimer;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            activeSearchQuery = e.target.value.trim();
            if (clearSearchBtn) {
                if (activeSearchQuery) clearSearchBtn.classList.remove('hidden');
                else clearSearchBtn.classList.add('hidden');
            }
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                loadProducts();
            }, 300);
        });
    }

    if (clearSearchBtn && searchInput) {
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            activeSearchQuery = '';
            clearSearchBtn.classList.add('hidden');
            loadProducts();
        });
    }

    if (rxFilterSelect) {
        rxFilterSelect.addEventListener('change', (e) => {
            activeRxFilter = e.target.value;
            loadProducts();
        });
    }

    if (refreshCatalogBtn) {
        refreshCatalogBtn.addEventListener('click', () => {
            loadProducts();
            loadCustomerPrescriptions();
            showToast("Inventory synchronized.", "info");
        });
    }
}

// ============================================================================
// PRODUCT CATALOG RENDERING
// ============================================================================
async function loadProducts() {
    const grid = document.getElementById('product-grid');
    const countLabel = document.getElementById('catalog-count-label');
    if (!grid) return;

    grid.innerHTML = `
        <div class="col-span-full py-16 text-center text-gray-400">
            <i class="fa-solid fa-spinner fa-spin text-3xl text-emerald-700 mb-3"></i>
            <p class="text-sm font-semibold text-gray-700">Checking real-time medicine availability...</p>
        </div>
    `;

    try {
        const res = await CureviaAPI.getProducts({
            category_id: currentCategoryId,
            search: activeSearchQuery,
            rx: activeRxFilter
        });

        const products = res.products || [];
        if (countLabel) {
            countLabel.textContent = `Displaying ${products.length} genuine, batch-verified healthcare essentials`;
        }

        if (products.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full py-16 text-center bg-gray-50 rounded-2xl border border-gray-200 p-8">
                    <i class="fa-solid fa-prescription-bottle text-4xl text-gray-300 mb-3"></i>
                    <h3 class="text-base font-bold text-gray-800">No Medications Found</h3>
                    <p class="text-xs text-gray-500 mt-1 max-w-sm mx-auto">Try clearing search filters or selecting another healthcare category.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = products.map(prod => {
            const isOutOfStock = prod.total_active_stock <= 0;
            const price = parseFloat(prod.unit_price).toFixed(2);
            
            return `
                <div class="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs hover:shadow-lg transition-all duration-200 flex flex-col justify-between group">
                    <div class="space-y-3">
                        
                        <!-- Badges Row -->
                        <div class="flex items-center justify-between gap-1 flex-wrap">
                            <span class="bg-emerald-50 text-emerald-800 text-[11px] font-semibold px-2.5 py-1 rounded-md">
                                ${prod.category_name}
                            </span>
                            ${prod.requires_prescription ? `
                                <span class="bg-red-50 text-red-700 border border-red-200 text-[11px] px-2 py-0.5 rounded font-bold flex items-center space-x-1" title="Prescription Medicine (Optional doctor Rx verification)">
                                    <i class="fa-solid fa-file-prescription text-xs"></i>
                                    <span>Prescription Medicine</span>
                                </span>
                            ` : `
                                <span class="bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded font-medium">
                                    Over-the-Counter (OTC)
                                </span>
                            `}
                        </div>

                        <!-- Product Identity -->
                        <div class="pt-1">
                            <h3 class="font-extrabold text-sm sm:text-base text-gray-900 group-hover:text-[#064E3B] transition-colors leading-snug">
                                ${prod.product_name}
                            </h3>
                            <div class="flex items-center space-x-2 text-xs text-gray-500 mt-1">
                                <span>${prod.dosage_form}</span>
                                <span>&bull;</span>
                                <span>${prod.strength}</span>
                            </div>
                            <p class="text-[11px] text-gray-400 mt-0.5 truncate" title="${prod.manufacturer_name}">
                                Mfr: <span class="font-medium text-gray-600">${prod.manufacturer_name}</span>
                            </p>
                        </div>

                        <!-- Availability Status -->
                        <div class="py-2 px-3 rounded-xl bg-gray-50 border border-gray-100 text-[11px] space-y-1">
                            <div class="flex items-center justify-between">
                                <span class="text-gray-500">Stock Availability:</span>
                                <span class="${isOutOfStock ? 'text-red-600 font-bold' : 'text-emerald-700 font-bold'}">
                                    ${isOutOfStock ? 'Out of Stock' : `${prod.total_active_stock} units in stock`}
                                </span>
                            </div>
                            ${prod.earliest_expiry_date ? `
                                <div class="flex items-center justify-between text-[10px] text-gray-400">
                                    <span>Certified Fresh Until:</span>
                                    <span class="text-gray-700 font-mono font-medium">${prod.earliest_expiry_date}</span>
                                </div>
                            ` : ''}
                        </div>

                    </div>

                    <!-- Pricing & Action (1-Click Add to Cart Allowed for All) -->
                    <div class="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                        <div>
                            <span class="text-[10px] text-gray-400 uppercase font-semibold">Price per unit</span>
                            <div class="text-lg font-black text-gray-900">
                                ₹${price}
                            </div>
                        </div>

                        <button 
                            type="button" 
                            class="btn-add-to-cart px-4 py-2.5 rounded-xl font-bold text-xs shadow-xs transition-all btn-compression flex items-center space-x-1.5 ${
                                isOutOfStock 
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                                : 'bg-[#064E3B] hover:bg-[#065F46] text-white'
                            }"
                            data-product-id="${prod.product_id}"
                            data-product-name="${encodeURIComponent(prod.product_name)}"
                            data-unit-price="${prod.unit_price}"
                            data-requires-rx="${prod.requires_prescription ? '1' : '0'}"
                            ${isOutOfStock ? 'disabled' : ''}
                        >
                            <i class="fa-solid fa-cart-plus"></i>
                            <span>${isOutOfStock ? 'Unavailable' : 'Add to Cart'}</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Attach Add to Cart Listeners
        grid.querySelectorAll('.btn-add-to-cart').forEach(btn => {
            btn.addEventListener('click', async () => {
                const prodId = parseInt(btn.getAttribute('data-product-id'));
                const prodName = decodeURIComponent(btn.getAttribute('data-product-name'));
                const unitPrice = parseFloat(btn.getAttribute('data-unit-price'));
                const requiresRx = btn.getAttribute('data-requires-rx') === '1';

                await addToCart(prodId, prodName, unitPrice, requiresRx);
            });
        });

    } catch (err) {
        console.error("Error loading products:", err);
        grid.innerHTML = `
            <div class="col-span-full py-12 text-center text-amber-800 bg-amber-50 rounded-2xl border border-amber-200 p-6 space-y-2">
                <i class="fa-solid fa-cloud-arrow-down text-3xl mb-1 text-amber-600"></i>
                <p class="font-bold text-sm">We are currently updating our medicine inventory.</p>
                <p class="text-xs text-amber-700">Please ensure your local database is running or try refreshing in a moment.</p>
                <button onclick="window.location.reload()" class="mt-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors">
                    Retry
                </button>
            </div>
        `;
    }
}

// ============================================================================
// CART MANAGEMENT & BATCH SELECTION
// ============================================================================
async function addToCart(productId, productName, unitPrice, requiresRx) {
    try {
        const res = await CureviaAPI.getProductBatches(productId);
        const batches = res.batches || [];

        if (batches.length === 0) {
            showToast("Currently out of active non-expired stock for this item.", "error");
            return;
        }

        const existing = cart.find(item => item.productId === productId);
        if (existing) {
            existing.quantity += 1;
            showToast(`Increased quantity of ${productName} in cart.`, 'success');
        } else {
            const selectedBatch = batches[0];
            cart.push({
                productId,
                productName,
                unitPrice,
                requiresRx,
                quantity: 1,
                batchId: selectedBatch.batch_id,
                batchNumber: selectedBatch.batch_number,
                batchExpiry: selectedBatch.expiry_date,
                availableBatches: batches
            });
            showToast(`Added ${productName} to your cart.`, 'success');
        }

        saveCart();
        updateCartUI();
        openCartDrawer();

    } catch (err) {
        showToast("Unable to verify stock: " + err.message, "error");
    }
}

function saveCart() {
    localStorage.setItem('curevia_cart', JSON.stringify(cart));
}

function updateCartUI() {
    const badge = document.getElementById('cart-counter-badge');
    const drawerCount = document.getElementById('drawer-item-count');
    const container = document.getElementById('cart-items-container');
    const subtotalEl = document.getElementById('cart-subtotal');
    const totalEl = document.getElementById('cart-total-amount');
    const rxNotice = document.getElementById('cart-rx-notice');

    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (badge) badge.textContent = totalCount;
    if (drawerCount) drawerCount.textContent = `${totalCount} item${totalCount === 1 ? '' : 's'}`;

    if (!container) return;

    if (cart.length === 0) {
        container.innerHTML = `
            <div class="py-16 text-center text-gray-400 space-y-3">
                <i class="fa-solid fa-basket-shopping text-5xl text-gray-200"></i>
                <p class="text-sm font-semibold text-gray-600">Your Curevia Cart is Empty</p>
                <p class="text-xs text-gray-400">Explore medications above and add them to your cart.</p>
            </div>
        `;
        if (subtotalEl) subtotalEl.textContent = '₹0.00';
        if (totalEl) totalEl.textContent = '₹0.00';
        if (rxNotice) rxNotice.classList.add('hidden');
        return;
    }

    let subtotal = 0;
    let hasRxItem = false;

    container.innerHTML = cart.map((item, index) => {
        const itemTotal = item.unitPrice * item.quantity;
        subtotal += itemTotal;
        if (item.requiresRx) hasRxItem = true;

        const batchOptions = (item.availableBatches || []).map(b => `
            <option value="${b.batch_id}" ${b.batch_id === item.batchId ? 'selected' : ''}>
                Batch: ${b.batch_number} (Exp: ${b.expiry_date}, Avail: ${b.stock_quantity})
            </option>
        `).join('');

        return `
            <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-xs space-y-3">
                <div class="flex items-start justify-between">
                    <div>
                        <div class="flex items-center space-x-1.5">
                            <h4 class="text-xs font-bold text-gray-900">${item.productName}</h4>
                            ${item.requiresRx ? `
                                <span class="bg-red-50 text-red-700 border border-red-200 text-[10px] px-1.5 py-0.5 rounded font-extrabold">Rx</span>
                            ` : ''}
                        </div>
                        <p class="text-xs text-gray-500 mt-0.5">₹${parseFloat(item.unitPrice).toFixed(2)} each</p>
                    </div>
                    <button class="btn-remove-item text-gray-400 hover:text-red-600 p-1 rounded-md transition-colors" data-index="${index}">
                        <i class="fa-solid fa-trash-can text-xs"></i>
                    </button>
                </div>

                <div>
                    <label class="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Select Dispensing Batch
                    </label>
                    <select class="cart-batch-select w-full text-xs py-1.5 px-2 rounded-lg border border-gray-200 bg-gray-50 focus:bg-white focus:border-[#064E3B] font-mono text-gray-800" data-index="${index}">
                        ${batchOptions}
                    </select>
                </div>

                <div class="flex items-center justify-between pt-1">
                    <div class="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                        <button class="btn-qty-dec px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100" data-index="${index}">-</button>
                        <span class="px-3 py-1 text-xs font-bold text-gray-900">${item.quantity}</span>
                        <button class="btn-qty-inc px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100" data-index="${index}">+</button>
                    </div>
                    <div class="text-sm font-extrabold text-[#064E3B]">
                        ₹${itemTotal.toFixed(2)}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (subtotalEl) subtotalEl.textContent = `₹${subtotal.toFixed(2)}`;
    if (totalEl) totalEl.textContent = `₹${subtotal.toFixed(2)}`;

    // Optional prescription section in drawer
    if (rxNotice) {
        if (hasRxItem) {
            rxNotice.classList.remove('hidden');
            populateCartRxDropdown();
        } else {
            rxNotice.classList.add('hidden');
        }
    }

    container.querySelectorAll('.btn-remove-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-index'));
            cart.splice(idx, 1);
            saveCart();
            updateCartUI();
        });
    });

    container.querySelectorAll('.btn-qty-inc').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-index'));
            cart[idx].quantity += 1;
            saveCart();
            updateCartUI();
        });
    });

    container.querySelectorAll('.btn-qty-dec').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-index'));
            if (cart[idx].quantity > 1) {
                cart[idx].quantity -= 1;
            } else {
                cart.splice(idx, 1);
            }
            saveCart();
            updateCartUI();
        });
    });

    container.querySelectorAll('.cart-batch-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const idx = parseInt(select.getAttribute('data-index'));
            cart[idx].batchId = parseInt(e.target.value);
            saveCart();
        });
    });
}

// ============================================================================
// CUSTOMER PRESCRIPTIONS (OPTIONAL ATTACHMENT)
// ============================================================================
async function loadCustomerPrescriptions() {
    try {
        const authRes = await CureviaAPI.getMe();
        if (!authRes.authenticated) {
            const summaryEl = document.getElementById('active-rx-summary');
            if (summaryEl) {
                summaryEl.textContent = "Sign in to view your prescriptions";
            }
            return;
        }

        const res = await CureviaAPI.getPrescriptions();
        userPrescriptions = res.prescriptions || [];

        const approvedCount = userPrescriptions.filter(p => p.status === 'Approved').length;
        const pendingCount = userPrescriptions.filter(p => p.status === 'Pending').length;

        const summaryEl = document.getElementById('active-rx-summary');
        if (summaryEl) {
            if (userPrescriptions.length === 0) {
                summaryEl.textContent = "No prescriptions on file";
            } else {
                summaryEl.textContent = `${approvedCount} Approved &bull; ${pendingCount} Under Review`;
            }
        }

        populateCartRxDropdown();

    } catch (err) {
        console.warn("Could not load customer prescriptions:", err);
    }
}

function populateCartRxDropdown() {
    const rxSelect = document.getElementById('cart-prescription-select');
    if (!rxSelect) return;

    const approvedList = userPrescriptions.filter(p => p.status === 'Approved');

    let options = '<option value="">-- No Prescription Attached (Proceed Directly) --</option>';
    if (approvedList.length > 0) {
        approvedList.forEach(rx => {
            options += `<option value="${rx.prescription_id}">Rx #${rx.prescription_id} (${rx.doctor_name} - Approved)</option>`;
        });
    }

    rxSelect.innerHTML = options;
}

// Exposed global refresh helper
window.refreshCustomerPrescriptions = loadCustomerPrescriptions;

// ============================================================================
// CART DRAWER TOGGLES & CHECKOUT
// ============================================================================
function setupCartDrawerEvents() {
    const openBtn = document.getElementById('btn-open-cart');
    const closeBtn = document.getElementById('btn-close-cart');
    const backdrop = document.getElementById('cart-drawer-backdrop');
    const placeOrderBtn = document.getElementById('btn-place-order');

    if (openBtn) openBtn.addEventListener('click', openCartDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeCartDrawer);

    if (backdrop) {
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeCartDrawer();
        });
    }

    if (placeOrderBtn) {
        placeOrderBtn.addEventListener('click', executeOrderPlacement);
    }
}

function openCartDrawer() {
    const backdrop = document.getElementById('cart-drawer-backdrop');
    if (backdrop) {
        backdrop.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
    }
}

function closeCartDrawer() {
    const backdrop = document.getElementById('cart-drawer-backdrop');
    if (backdrop) {
        backdrop.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

// ============================================================================
// UNRESTRICTED ORDER PLACEMENT
// ============================================================================
async function executeOrderPlacement() {
    if (cart.length === 0) {
        showToast("Your cart is empty.", "error");
        return;
    }

    // Check if user is logged in
    try {
        const authRes = await CureviaAPI.getMe();
        if (!authRes.authenticated) {
            showToast("Please sign in or create an account to place your order.", "info");
            setTimeout(() => {
                window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
            }, 800);
            return;
        }
    } catch (e) {
        // Continue and let checkout endpoint handle auth if necessary
    }

    const shippingAddressInput = document.getElementById('shipping-address-input');
    const shippingAddress = shippingAddressInput ? shippingAddressInput.value.trim() : '';

    if (!shippingAddress) {
        showToast("Please provide your delivery shipping address.", "error");
        return;
    }

    // Prescription is 100% OPTIONAL — never block customer checkout!
    const rxSelect = document.getElementById('cart-prescription-select');
    const prescriptionId = rxSelect && rxSelect.value ? parseInt(rxSelect.value) : null;

    const placeOrderBtn = document.getElementById('btn-place-order');
    placeOrderBtn.disabled = true;
    placeOrderBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Processing Order...</span>';

    try {
        const targetItem = cart[0];

        const payload = {
            prescription_id: prescriptionId,
            shipping_address: shippingAddress,
            product_id: targetItem.productId,
            batch_id: targetItem.batchId,
            quantity: targetItem.quantity
        };

        const res = await CureviaAPI.checkoutOrder(payload);

        if (res.status === 'success') {
            showToast(res.message, "success");
            showInvoiceModal(res.invoice);

            cart.shift();
            saveCart();
            updateCartUI();
            closeCartDrawer();

            loadProducts();
        }

    } catch (err) {
        console.error("Checkout failed:", err);
        if (err.authRequired) {
            showToast("Please sign in to confirm your order.", "error");
            setTimeout(() => window.location.href = '/login', 800);
        } else {
            showToast(err.message || "Failed to place order.", "error");
        }
    } finally {
        placeOrderBtn.disabled = false;
        placeOrderBtn.innerHTML = '<i class="fa-solid fa-lock text-xs"></i> <span>Confirm &amp; Place Order</span>';
    }
}

// ============================================================================
// INVOICE CONFIRMATION MODAL
// ============================================================================
function showInvoiceModal(inv) {
    if (!inv) return;
    const modal = document.getElementById('invoice-modal');
    if (!modal) return;

    document.getElementById('inv-order-id').textContent = `Order #CUR-${inv.order_id}`;
    document.getElementById('inv-customer').textContent = inv.customer_name;
    document.getElementById('inv-email').textContent = inv.customer_email;
    document.getElementById('inv-txn').textContent = inv.transaction_reference || 'TXN-CUR-SUCCESS';
    document.getElementById('inv-address').textContent = inv.shipping_address;

    document.getElementById('inv-product-name').textContent = inv.product_name;
    document.getElementById('inv-line-price').textContent = `₹${parseFloat(inv.price_at_purchase * inv.quantity).toFixed(2)}`;
    document.getElementById('inv-batch-num').textContent = inv.batch_number;
    document.getElementById('inv-batch-exp').textContent = inv.expiry_date;
    document.getElementById('inv-quantity').textContent = `${inv.quantity} units`;
    document.getElementById('inv-total-amount').textContent = `₹${parseFloat(inv.total_amount).toFixed(2)}`;

    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}
