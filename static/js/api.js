/**
 * Curevia E-Pharmacy
 * RESTful API Client Wrapper (api.js)
 * Precision Care, Verified Deliveries
 */

const CureviaAPI = (() => {
    const BASE_URL = '/api';

    async function request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint}`;
        const defaultHeaders = {};

        if (!(options.body instanceof FormData)) {
            defaultHeaders['Content-Type'] = 'application/json';
        }

        const config = {
            ...options,
            headers: {
                ...defaultHeaders,
                ...(options.headers || {})
            }
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const errorMsg = data.message || `Request failed with status ${response.status}`;
                const error = new Error(errorMsg);
                error.status = response.status;
                error.data = data;
                error.authRequired = data.auth_required || false;
                error.isMaintenance = data.code === 'DB_MAINTENANCE' || response.status === 503;
                throw error;
            }

            return data;
        } catch (err) {
            console.error(`API Error on ${endpoint}:`, err);
            throw err;
        }
    }

    return {
        // Authentication
        login: (credentials) => request('/auth/login', {
            method: 'POST',
            body: JSON.stringify(credentials)
        }),

        register: (userData) => request('/auth/register', {
            method: 'POST',
            body: JSON.stringify(userData)
        }),

        logout: () => request('/auth/logout', { method: 'POST' }),

        getMe: () => request('/auth/me'),

        // System Health
        getSystemStatus: () => request('/system/status'),

        // Categories
        getCategories: () => request('/categories'),

        // Products & Batches
        getProducts: (params = {}) => {
            const query = new URLSearchParams();
            if (params.category_id) query.append('category_id', params.category_id);
            if (params.search) query.append('search', params.search);
            if (params.rx !== undefined && params.rx !== '') query.append('rx', params.rx);
            const qs = query.toString() ? `?${query.toString()}` : '';
            return request(`/products${qs}`);
        },

        getProductBatches: (productId) => request(`/products/${productId}/batches`),

        // Prescriptions
        uploadPrescription: (formData) => {
            return request('/prescriptions/upload', {
                method: 'POST',
                body: formData
            });
        },

        getPrescriptions: (params = {}) => {
            const query = new URLSearchParams();
            if (params.status) query.append('status', params.status);
            if (params.user_id) query.append('user_id', params.user_id);
            const qs = query.toString() ? `?${query.toString()}` : '';
            return request(`/prescriptions${qs}`);
        },

        verifyPrescription: (rxId, status) => {
            return request(`/prescriptions/${rxId}/verify`, {
                method: 'POST',
                body: JSON.stringify({ status })
            });
        },

        // Inventory & Batches
        getInventoryAlerts: (status = '') => {
            const qs = status ? `?status=${encodeURIComponent(status)}` : '';
            return request(`/inventory/alerts${qs}`);
        },

        addBatch: (batchData) => {
            return request('/inventory/batch', {
                method: 'POST',
                body: JSON.stringify(batchData)
            });
        },

        // Orders & Transactions
        checkoutOrder: (orderPayload) => {
            return request('/orders/checkout', {
                method: 'POST',
                body: JSON.stringify(orderPayload)
            });
        },

        getOrders: (userId = null) => {
            const qs = userId ? `?user_id=${userId}` : '';
            return request(`/orders${qs}`);
        },

        // Admin Analytics
        getAdminMetrics: () => request('/admin/metrics')
    };
})();
