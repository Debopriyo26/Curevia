/**
 * Curevia E-Pharmacy
 * Application Core Bootstrapper & UI Helpers (app.js)
 * Brand: Curevia | Tagline: Precision Care, Verified Deliveries
 */

// Global Toast Notification Helper
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    // Filter out technical tracebacks
    let cleanMessage = message;
    if (typeof cleanMessage === 'string') {
        if (cleanMessage.includes('Can\'t connect to MySQL') || 
            cleanMessage.includes('Access denied for user') || 
            cleanMessage.includes('OperationalError') ||
            cleanMessage.includes('WinError 10013')) {
            cleanMessage = "We are currently updating our medicine inventory. Please ensure your local database is running or try refreshing in a moment.";
        }
    }

    const toast = document.createElement('div');
    toast.className = 'toast-slide-in pointer-events-auto flex items-start space-x-3 p-4 rounded-xl border shadow-lg transition-all duration-300 text-xs font-semibold';

    let iconHtml = '';
    if (type === 'success') {
        toast.classList.add('bg-white', 'border-emerald-200', 'text-emerald-900');
        iconHtml = '<i class="fa-solid fa-circle-check text-emerald-600 text-base mt-0.5"></i>';
    } else if (type === 'error') {
        toast.classList.add('bg-white', 'border-red-200', 'text-red-900');
        iconHtml = '<i class="fa-solid fa-circle-exclamation text-red-600 text-base mt-0.5"></i>';
    } else {
        toast.classList.add('bg-white', 'border-blue-200', 'text-blue-900');
        iconHtml = '<i class="fa-solid fa-circle-info text-blue-600 text-base mt-0.5"></i>';
    }

    toast.innerHTML = `
        ${iconHtml}
        <div class="flex-1 pr-2 leading-snug">${cleanMessage}</div>
        <button class="text-gray-400 hover:text-gray-600 focus:outline-none ml-2" onclick="this.parentElement.remove()">
            <i class="fa-solid fa-xmark text-sm"></i>
        </button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 4500);
}

// Check Store Health Status
async function checkSystemHealth() {
    const badge = document.getElementById('system-health-badge');
    const offlineBanner = document.getElementById('db-offline-banner');

    try {
        const res = await CureviaAPI.getSystemStatus();
        if (res.status === 'success' && res.system_status === 'Live') {
            if (badge) {
                badge.innerHTML = `
                    <span class="h-2 w-2 rounded-full bg-emerald-400"></span>
                    <span class="text-[11px] text-emerald-200 font-medium">Store Status: Live</span>
                `;
            }
            if (offlineBanner) offlineBanner.classList.add('hidden');
        } else {
            if (badge) {
                badge.innerHTML = `
                    <span class="h-2 w-2 rounded-full bg-amber-400 animate-pulse"></span>
                    <span class="text-[11px] text-amber-200 font-medium">Store Status: Maintenance</span>
                `;
            }
            if (offlineBanner) offlineBanner.classList.remove('hidden');
        }
    } catch (e) {
        if (badge) {
            badge.innerHTML = `
                <span class="h-2 w-2 rounded-full bg-amber-400"></span>
                <span class="text-[11px] text-amber-200 font-medium">Store Status: Maintenance</span>
            `;
        }
        if (offlineBanner) offlineBanner.classList.remove('hidden');
    }
}

// Global UI Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    checkSystemHealth();

    // Mobile Navigation Toggle
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileBtn && mobileMenu) {
        mobileBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }

    // User Profile Dropdown Toggle
    const userMenuBtn = document.getElementById('user-menu-btn');
    const userDropdown = document.getElementById('user-menu-dropdown');
    if (userMenuBtn && userDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!userDropdown.contains(e.target) && e.target !== userMenuBtn) {
                userDropdown.classList.add('hidden');
            }
        });
    }

    // Logout Handler
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await CureviaAPI.logout();
                showToast("You have been signed out.", "info");
                setTimeout(() => window.location.href = '/', 400);
            } catch (err) {
                window.location.href = '/api/auth/logout';
            }
        });
    }

    // Prescription Modal Triggers
    const openRxModalBtn = document.getElementById('btn-open-rx-modal');
    const bannerUploadRxBtn = document.getElementById('banner-upload-rx-btn');
    const mobileUploadRxBtn = document.getElementById('mobile-rx-upload-trigger');
    const dropdownUploadRxBtn = document.getElementById('dropdown-upload-rx-btn');
    const closeRxModalBtn = document.getElementById('btn-close-rx-modal');
    const cancelRxModalBtn = document.getElementById('btn-cancel-rx-modal');
    const rxModal = document.getElementById('rx-upload-modal');

    const openRxModal = async () => {
        // Check if user is authenticated
        try {
            const authRes = await CureviaAPI.getMe();
            if (!authRes.authenticated) {
                showToast("Please sign in to upload your doctor's prescription.", "info");
                setTimeout(() => {
                    window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
                }, 800);
                return;
            }
        } catch (e) {
            // Ignore error and allow opening
        }

        if (rxModal) {
            rxModal.classList.remove('hidden');
            document.body.classList.add('overflow-hidden');
        }
    };

    const closeRxModal = () => {
        if (rxModal) {
            rxModal.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
        }
    };

    if (openRxModalBtn) openRxModalBtn.addEventListener('click', openRxModal);
    if (bannerUploadRxBtn) bannerUploadRxBtn.addEventListener('click', openRxModal);
    if (mobileUploadRxBtn) mobileUploadRxBtn.addEventListener('click', openRxModal);
    if (dropdownUploadRxBtn) dropdownUploadRxBtn.addEventListener('click', openRxModal);
    if (closeRxModalBtn) closeRxModalBtn.addEventListener('click', closeRxModal);
    if (cancelRxModalBtn) cancelRxModalBtn.addEventListener('click', closeRxModal);

    // Dropzone logic
    const dropzone = document.getElementById('dropzone-rx');
    const rxInput = document.getElementById('rx-file-input');
    const filenameDisplay = document.getElementById('selected-filename-display');
    const filenameBox = document.getElementById('file-selected-name');

    if (dropzone && rxInput) {
        dropzone.addEventListener('click', () => rxInput.click());
        
        rxInput.addEventListener('change', () => {
            if (rxInput.files && rxInput.files[0]) {
                filenameDisplay.textContent = rxInput.files[0].name;
                filenameBox.classList.remove('hidden');
            }
        });

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('border-emerald-600', 'bg-emerald-50/50');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('border-emerald-600', 'bg-emerald-50/50');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('border-emerald-600', 'bg-emerald-50/50');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                rxInput.files = e.dataTransfer.files;
                filenameDisplay.textContent = e.dataTransfer.files[0].name;
                filenameBox.classList.remove('hidden');
            }
        });
    }

    // Prescription Form Submit Handler
    const rxForm = document.getElementById('rx-upload-form');
    if (rxForm) {
        rxForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('btn-submit-rx');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Uploading...</span>';

            try {
                const formData = new FormData(rxForm);
                const res = await CureviaAPI.uploadPrescription(formData);
                showToast(res.message || "Prescription uploaded successfully!", "success");
                rxForm.reset();
                if (filenameBox) filenameBox.classList.add('hidden');
                closeRxModal();

                if (window.refreshCustomerPrescriptions) {
                    window.refreshCustomerPrescriptions();
                }
            } catch (err) {
                if (err.authRequired) {
                    showToast("Please sign in to upload prescriptions.", "error");
                    setTimeout(() => window.location.href = '/login', 800);
                } else {
                    showToast(err.message || "Failed to upload prescription", "error");
                }
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-upload"></i> <span>Submit for Verification</span>';
            }
        });
    }

    // Invoice Modal Close Button
    const closeInvoiceBtn = document.getElementById('btn-close-invoice');
    const invoiceModal = document.getElementById('invoice-modal');
    if (closeInvoiceBtn && invoiceModal) {
        closeInvoiceBtn.addEventListener('click', () => {
            invoiceModal.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
        });
    }
});
