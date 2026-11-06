/**
 * Curevia E-Pharmacy
 * Pharmacist Verification & Batch Deck (pharmacist.js)
 * Precision Care, Verified Deliveries
 */

let activeTab = 'rx';
let currentAlertFilter = '';
let currentPrescriptionsCache = [];

document.addEventListener('DOMContentLoaded', () => {
    initPharmacist();
});

async function initPharmacist() {
    setupTabSwitching();
    setupBatchForm();
    setupAlertFilters();
    await loadPrescriptionQueue();
    await loadProductsForBatchForm();
    await loadInventoryAlerts();
}

// ============================================================================
// TAB SWITCHING LOGIC
// ============================================================================
function setupTabSwitching() {
    const rxTabBtn = document.getElementById('tab-rx-btn');
    const batchTabBtn = document.getElementById('tab-batch-btn');
    const alertsTabBtn = document.getElementById('tab-alerts-btn');

    const rxContent = document.getElementById('tab-rx-content');
    const batchContent = document.getElementById('tab-batch-content');
    const alertsContent = document.getElementById('tab-alerts-content');

    const setTab = (tabName) => {
        activeTab = tabName;
        [rxTabBtn, batchTabBtn, alertsTabBtn].forEach(btn => {
            if (btn) btn.className = 'tab-nav-btn border-b-2 border-transparent py-3 px-1 text-sm font-bold text-gray-500 hover:text-gray-700 hover:border-gray-300 flex items-center space-x-2';
        });
        [rxContent, batchContent, alertsContent].forEach(c => {
            if (c) c.classList.add('hidden');
        });

        if (tabName === 'rx') {
            if (rxTabBtn) rxTabBtn.className = 'tab-nav-btn active border-b-2 border-[#064E3B] py-3 px-1 text-sm font-bold text-[#064E3B] flex items-center space-x-2';
            if (rxContent) rxContent.classList.remove('hidden');
            loadPrescriptionQueue();
        } else if (tabName === 'batch') {
            if (batchTabBtn) batchTabBtn.className = 'tab-nav-btn active border-b-2 border-[#064E3B] py-3 px-1 text-sm font-bold text-[#064E3B] flex items-center space-x-2';
            if (batchContent) batchContent.classList.remove('hidden');
        } else if (tabName === 'alerts') {
            if (alertsTabBtn) alertsTabBtn.className = 'tab-nav-btn active border-b-2 border-[#064E3B] py-3 px-1 text-sm font-bold text-[#064E3B] flex items-center space-x-2';
            if (alertsContent) alertsContent.classList.remove('hidden');
            loadInventoryAlerts();
        }
    };

    if (rxTabBtn) rxTabBtn.addEventListener('click', () => setTab('rx'));
    if (batchTabBtn) batchTabBtn.addEventListener('click', () => setTab('batch'));
    if (alertsTabBtn) alertsTabBtn.addEventListener('click', () => setTab('alerts'));

    // Prescription Filter Dropdown (Supports both rx-filter-status and filter-status)
    const rxFilterStatus = document.getElementById('rx-filter-status') || document.getElementById('filter-status');
    const refreshRxBtn = document.getElementById('refresh-rx-btn');

    if (rxFilterStatus) {
        rxFilterStatus.addEventListener('change', () => loadPrescriptionQueue());
    }
    if (refreshRxBtn) {
        refreshRxBtn.addEventListener('click', () => {
            loadPrescriptionQueue();
            showToast("Prescription audit queue refreshed.", "info");
        });
    }
}

// ============================================================================
// TAB 1: PRESCRIPTION VERIFICATION QUEUE
// ============================================================================
async function loadPrescriptionQueue() {
    const list = document.getElementById('prescriptions-list');
    const statusSelect = document.getElementById('rx-filter-status') || document.getElementById('filter-status');
    const filterStatus = statusSelect ? statusSelect.value.trim() : 'Pending';

    if (!list) return;

    list.innerHTML = `
        <div class="col-span-full py-12 text-center text-gray-400">
            <i class="fa-solid fa-spinner fa-spin text-2xl text-emerald-700 mb-2"></i>
            <p class="text-xs font-semibold">Loading prescription audit queue...</p>
        </div>
    `;

    try {
        const res = await CureviaAPI.getPrescriptions();
        const allPrescriptions = res.prescriptions || [];
        currentPrescriptionsCache = allPrescriptions;

        // Calculate pending count
        const pendingCount = allPrescriptions.filter(p => (p.status || '').toLowerCase() === 'pending').length;
        const pharmaPendingBadge = document.getElementById('pharma-pending-count');
        const tabRxBadge = document.getElementById('tab-rx-badge');
        if (pharmaPendingBadge) pharmaPendingBadge.textContent = pendingCount;
        if (tabRxBadge) tabRxBadge.textContent = pendingCount;

        // Case-insensitive filtering
        let filtered = allPrescriptions;
        if (filterStatus && filterStatus.toLowerCase() !== 'all') {
            filtered = allPrescriptions.filter(p => (p.status || '').toLowerCase() === filterStatus.toLowerCase());
        }

        if (filtered.length === 0) {
            list.innerHTML = `
                <div class="col-span-full py-12 text-center bg-gray-50 rounded-2xl border border-gray-200 p-8">
                    <i class="fa-solid fa-file-circle-check text-4xl text-gray-300 mb-2"></i>
                    <h3 class="text-sm font-bold text-gray-800">No Prescriptions in Queue</h3>
                    <p class="text-xs text-gray-400 mt-0.5">There are no prescriptions matching the selected filter status.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = filtered.map(rx => {
            const rxStatus = (rx.status || 'Pending').toLowerCase();
            const isPending = rxStatus === 'pending';
            const isApproved = rxStatus === 'approved';
            const isRejected = rxStatus === 'rejected';

            return `
                <div id="rx-card-${rx.prescription_id}" class="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow">
                    <div class="space-y-3">
                        
                        <div class="flex items-center justify-between">
                            <span class="text-xs font-mono font-bold text-gray-500">Rx #${rx.prescription_id}</span>
                            <span id="rx-status-badge-${rx.prescription_id}" class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-extrabold ${
                                isApproved ? 'bg-emerald-100 text-[#064E3B]' :
                                isRejected ? 'bg-red-100 text-red-700' :
                                'bg-amber-100 text-amber-800'
                            }">
                                ${rx.status}
                            </span>
                        </div>

                        <div>
                            <h3 class="text-sm font-extrabold text-gray-900 leading-snug">
                                ${rx.doctor_name}
                            </h3>
                            <p class="text-xs text-gray-500 mt-1">
                                Patient: <strong class="text-gray-800">${rx.customer_name}</strong>
                            </p>
                            <p class="text-[11px] text-gray-400">
                                Contact: ${rx.customer_phone || rx.customer_email || 'Verified Customer'}
                            </p>
                            <p class="text-[10px] text-gray-400 mt-1">
                                Uploaded: ${rx.uploaded_at ? new Date(rx.uploaded_at).toLocaleString() : 'Recent'}
                            </p>
                        </div>

                        <!-- Document Attachment Link -->
                        <div class="pt-1">
                            <a href="/static/${rx.file_path}" target="_blank" class="inline-flex items-center space-x-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-200 transition-colors">
                                <i class="fa-solid fa-file-medical text-emerald-600"></i>
                                <span>Inspect Prescription File</span>
                                <i class="fa-solid fa-arrow-up-right-from-square text-[10px] ml-1"></i>
                            </a>
                        </div>

                        <div id="rx-verifier-info-${rx.prescription_id}">
                            ${rx.verifier_name ? `
                                <p class="text-[10px] text-gray-500">
                                    Audited by: <strong class="text-emerald-900">${rx.verifier_name}</strong>
                                </p>
                            ` : ''}
                        </div>

                    </div>

                    <!-- Action Controls (Approve / Reject) -->
                    <div id="rx-actions-${rx.prescription_id}">
                        ${isPending ? `
                            <div class="pt-3 border-t border-gray-100 grid grid-cols-2 gap-2">
                                <button 
                                    class="btn-approve-rx py-2 px-3 bg-[#064E3B] hover:bg-[#065F46] text-white text-xs font-bold rounded-lg transition-all btn-compression flex items-center justify-center space-x-1.5 shadow-xs"
                                    data-rx-id="${rx.prescription_id}"
                                >
                                    <i class="fa-solid fa-check"></i>
                                    <span>Approve Rx</span>
                                </button>
                                <button 
                                    class="btn-reject-rx py-2 px-3 bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold rounded-lg transition-all btn-compression flex items-center justify-center space-x-1.5 shadow-xs"
                                    data-rx-id="${rx.prescription_id}"
                                >
                                    <i class="fa-solid fa-xmark"></i>
                                    <span>Reject Rx</span>
                                </button>
                            </div>
                        ` : `
                            <div class="pt-2 border-t border-gray-100 text-center">
                                <span class="text-[11px] text-gray-400 italic">Audit verification complete</span>
                            </div>
                        `}
                    </div>
                </div>
            `;
        }).join('');

        // Attach In-Place Approval Listeners
        list.querySelectorAll('.btn-approve-rx').forEach(btn => {
            btn.addEventListener('click', async () => {
                const rxId = btn.getAttribute('data-rx-id');
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    await CureviaAPI.verifyPrescription(rxId, 'Approved');
                    showToast(`Prescription #${rxId} Approved! Customer may now associate this prescription.`, 'success');
                    
                    // In-place UI update without full reload flicker
                    updateCardInPlace(rxId, 'Approved');
                } catch (e) {
                    showToast(e.message || "Failed to approve prescription", "error");
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>Approve Rx</span>';
                }
            });
        });

        // Attach In-Place Rejection Listeners
        list.querySelectorAll('.btn-reject-rx').forEach(btn => {
            btn.addEventListener('click', async () => {
                const rxId = btn.getAttribute('data-rx-id');
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    await CureviaAPI.verifyPrescription(rxId, 'Rejected');
                    showToast(`Prescription #${rxId} marked as Rejected.`, 'error');
                    
                    // In-place UI update without full reload flicker
                    updateCardInPlace(rxId, 'Rejected');
                } catch (e) {
                    showToast(e.message || "Failed to reject prescription", "error");
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-xmark"></i> <span>Reject Rx</span>';
                }
            });
        });

    } catch (err) {
        console.error("Error loading prescription queue:", err);
        list.innerHTML = `<div class="col-span-full text-center text-red-600 py-6 text-xs font-bold">Error loading queue: ${err.message}</div>`;
    }
}

// Immediate in-place card update
function updateCardInPlace(rxId, newStatus) {
    const badge = document.getElementById(`rx-status-badge-${rxId}`);
    const actions = document.getElementById(`rx-actions-${rxId}`);
    const verifierInfo = document.getElementById(`rx-verifier-info-${rxId}`);

    if (badge) {
        badge.textContent = newStatus;
        if (newStatus === 'Approved') {
            badge.className = 'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-extrabold bg-emerald-100 text-[#064E3B]';
        } else {
            badge.className = 'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-extrabold bg-red-100 text-red-700';
        }
    }

    if (actions) {
        actions.innerHTML = `
            <div class="pt-2 border-t border-gray-100 text-center">
                <span class="text-[11px] text-gray-400 italic">Audit verification complete</span>
            </div>
        `;
    }

    if (verifierInfo) {
        verifierInfo.innerHTML = `
            <p class="text-[10px] text-gray-500">
                Audited by: <strong class="text-emerald-900">Licensed Pharmacist</strong>
            </p>
        `;
    }

    // Update pending counter
    const pharmaPendingBadge = document.getElementById('pharma-pending-count');
    const tabRxBadge = document.getElementById('tab-rx-badge');
    if (pharmaPendingBadge) {
        const cur = parseInt(pharmaPendingBadge.textContent) || 0;
        pharmaPendingBadge.textContent = Math.max(0, cur - 1);
    }
    if (tabRxBadge) {
        const cur = parseInt(tabRxBadge.textContent) || 0;
        tabRxBadge.textContent = Math.max(0, cur - 1);
    }
}

// ============================================================================
// TAB 2: LOG INCOMING BATCH FORM
// ============================================================================
async function loadProductsForBatchForm() {
    const select = document.getElementById('batch-product-select');
    if (!select) return;

    try {
        const res = await CureviaAPI.getProducts();
        const products = res.products || [];

        let html = '<option value="">-- Choose Product from Catalog --</option>';
        products.forEach(p => {
            html += `<option value="${p.product_id}">${p.product_name} (${p.dosage_form} - ${p.strength})</option>`;
        });
        select.innerHTML = html;
    } catch (e) {
        console.warn("Could not load products for batch form:", e);
    }
}

function setupBatchForm() {
    const form = document.getElementById('add-batch-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const productId = document.getElementById('batch-product-select').value;
        const batchNumber = document.getElementById('batch-number-input').value.trim();
        const mfgDate = document.getElementById('batch-mfg-input').value;
        const expDate = document.getElementById('batch-exp-input').value;
        const stockQty = document.getElementById('batch-qty-input').value;

        if (expDate <= mfgDate) {
            showToast("Expiry date must be after manufacturing date.", "error");
            return;
        }

        const submitBtn = document.getElementById('btn-submit-batch');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Logging Batch...</span>';

        try {
            const res = await CureviaAPI.addBatch({
                product_id: parseInt(productId),
                batch_number: batchNumber,
                manufacturing_date: mfgDate,
                expiry_date: expDate,
                stock_quantity: parseInt(stockQty)
            });

            showToast(res.message || "Batch registered successfully!", "success");
            form.reset();
            loadInventoryAlerts();

        } catch (err) {
            showToast(err.message || "Failed to register batch", "error");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-plus-circle"></i> <span>Register Batch in Inventory</span>';
        }
    });
}

// ============================================================================
// TAB 3: INVENTORY ALERTS TABLE
// ============================================================================
function setupAlertFilters() {
    const filterBtns = document.querySelectorAll('.alert-pill-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentAlertFilter = btn.getAttribute('data-status');
            filterBtns.forEach(b => {
                b.className = 'alert-pill-btn px-3 py-1.5 rounded-lg text-xs font-bold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50';
            });
            btn.className = 'alert-pill-btn active px-3 py-1.5 rounded-lg text-xs font-bold bg-[#064E3B] text-white';
            loadInventoryAlerts();
        });
    });
}

async function loadInventoryAlerts() {
    const tbody = document.getElementById('inventory-alerts-tbody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="7" class="py-8 text-center text-gray-400">
                <i class="fa-solid fa-spinner fa-spin text-xl text-emerald-700 mb-1"></i>
                <p class="text-xs">Scanning batch shelf-life and stock levels...</p>
            </td>
        </tr>
    `;

    try {
        const res = await CureviaAPI.getInventoryAlerts(currentAlertFilter);
        const alerts = res.alerts || [];
        const counts = res.counts || {};

        const expiringBadge = document.getElementById('pharma-expiring-count');
        const totalBatchesBadge = document.getElementById('pharma-total-batches');
        const tabAlertsBadge = document.getElementById('tab-alerts-badge');

        if (expiringBadge) expiringBadge.textContent = counts.expiring_soon || 0;
        if (totalBatchesBadge) totalBatchesBadge.textContent = counts.total_batches || 0;
        if (tabAlertsBadge) tabAlertsBadge.textContent = (counts.expired || 0) + (counts.expiring_soon || 0);

        if (alerts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="py-8 text-center text-gray-400 text-xs">
                        No batch records matching status "${currentAlertFilter || 'All'}".
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = alerts.map(b => {
            const isExpired = b.alert_status === 'EXPIRED';
            const isSoon = b.alert_status === 'EXPIRING SOON';
            const isLow = b.alert_status === 'LOW STOCK';

            let statusBadge = '';
            if (isExpired) {
                statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">EXPIRED</span>';
            } else if (isSoon) {
                statusBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">${b.days_to_expiry}d REMAINING</span>`;
            } else if (isLow) {
                statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-800">LOW STOCK</span>';
            } else {
                statusBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-[#064E3B]">ADEQUATE</span>';
            }

            return `
                <tr class="hover:bg-gray-50/80 transition-colors">
                    <td class="py-3 px-4 font-mono font-bold text-gray-900">
                        ${b.batch_number}
                        <span class="block text-[10px] text-gray-400 font-normal">#ID: ${b.batch_id}</span>
                    </td>
                    <td class="py-3 px-4">
                        <div class="font-bold text-gray-900">${b.product_name}</div>
                        ${b.requires_prescription ? '<span class="text-[10px] text-red-600 font-semibold">Prescription</span>' : '<span class="text-[10px] text-gray-400">OTC</span>'}
                    </td>
                    <td class="py-3 px-4 text-gray-600">
                        ${b.manufacturer_name}
                    </td>
                    <td class="py-3 px-4 font-mono text-[11px] text-gray-600">
                        <div>Mfg: ${b.manufacturing_date}</div>
                        <div class="font-bold text-gray-900">Exp: ${b.expiry_date}</div>
                    </td>
                    <td class="py-3 px-4">
                        ${statusBadge}
                    </td>
                    <td class="py-3 px-4 font-mono font-bold ${b.stock_quantity <= 15 ? 'text-red-600' : 'text-gray-900'}">
                        ${b.stock_quantity} units
                    </td>
                    <td class="py-3 px-4 text-center">
                        ${isExpired ? `
                            <span class="inline-flex items-center text-xs text-red-600 font-bold" title="Dispensing blocked">
                                <i class="fa-solid fa-ban mr-1"></i> Blocked
                            </span>
                        ` : `
                            <span class="inline-flex items-center text-xs text-emerald-700 font-bold" title="Verified for dispensing">
                                <i class="fa-solid fa-circle-check mr-1"></i> Active
                            </span>
                        `}
                    </td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="py-6 text-center text-red-600 text-xs font-bold">
                    Unable to load inventory vigilance data.
                </td>
            </tr>
        `;
    }
}
