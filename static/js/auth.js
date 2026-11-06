/**
 * Curevia E-Pharmacy
 * Authentication Client Engine (auth.js)
 * Precision Care, Verified Deliveries
 */

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
});

function initAuth() {
    const tabLogin = document.getElementById('tab-login-btn');
    const tabRegister = document.getElementById('tab-register-btn');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const alertBox = document.getElementById('auth-alert');
    const alertMsg = document.getElementById('auth-alert-message');
    const alertIcon = document.getElementById('auth-alert-icon');
    const roleSelect = document.getElementById('reg-role');
    const staffCodeContainer = document.getElementById('staff-code-container');
    const staffCodeInput = document.getElementById('reg-auth-code');

    const showAlert = (message, type = 'error') => {
        if (!alertBox || !alertMsg) return;
        alertBox.className = `p-3.5 rounded-xl border text-xs font-semibold flex items-start space-x-2.5 ${
            type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`;
        alertIcon.className = type === 'success' 
            ? 'fa-solid fa-circle-check mt-0.5 flex-shrink-0 text-emerald-600' 
            : 'fa-solid fa-circle-exclamation mt-0.5 flex-shrink-0 text-red-600';
        alertMsg.textContent = message;
        alertBox.classList.remove('hidden');
    };

    const hideAlert = () => {
        if (alertBox) alertBox.classList.add('hidden');
    };

    // Tab Switching
    if (tabLogin && tabRegister && formLogin && formRegister) {
        tabLogin.addEventListener('click', () => {
            tabLogin.className = 'py-2.5 text-xs font-bold rounded-lg transition-all text-white bg-[#064E3B] shadow-xs';
            tabRegister.className = 'py-2.5 text-xs font-bold rounded-lg transition-all text-gray-600 hover:text-gray-900';
            formLogin.classList.remove('hidden');
            formRegister.classList.add('hidden');
            hideAlert();
        });

        tabRegister.addEventListener('click', () => {
            tabRegister.className = 'py-2.5 text-xs font-bold rounded-lg transition-all text-white bg-[#064E3B] shadow-xs';
            tabLogin.className = 'py-2.5 text-xs font-bold rounded-lg transition-all text-gray-600 hover:text-gray-900';
            formRegister.classList.remove('hidden');
            formLogin.classList.add('hidden');
            hideAlert();
        });
    }

    // Role Selection change -> toggle Staff Secret Code Field
    if (roleSelect && staffCodeContainer) {
        roleSelect.addEventListener('change', () => {
            const role = roleSelect.value;
            if (role === 'Pharmacist' || role === 'Admin') {
                staffCodeContainer.classList.remove('hidden');
                if (staffCodeInput) staffCodeInput.setAttribute('required', 'required');
            } else {
                staffCodeContainer.classList.add('hidden');
                if (staffCodeInput) {
                    staffCodeInput.removeAttribute('required');
                    staffCodeInput.value = '';
                }
            }
        });
    }

    // Password Visibility Toggle
    document.querySelectorAll('.btn-toggle-pwd').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.parentElement.querySelector('input');
            const icon = btn.querySelector('i');
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'fa-solid fa-eye-slash text-xs';
            } else {
                input.type = 'password';
                icon.className = 'fa-solid fa-eye text-xs';
            }
        });
    });

    // Login Form Submit
    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAlert();

            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            const nextUrl = document.getElementById('login-next-url')?.value || '/';

            const submitBtn = document.getElementById('btn-submit-login');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Verifying...</span>';

            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.message || 'Invalid credentials');
                }

                showToast(`Welcome back, ${data.user.full_name}!`, 'success');
                
                // Redirect user based on role or next url
                setTimeout(() => {
                    if (data.user.role === 'Pharmacist' && (nextUrl === '/' || !nextUrl)) {
                        window.location.href = '/pharmacist';
                    } else if (data.user.role === 'Admin' && (nextUrl === '/' || !nextUrl)) {
                        window.location.href = '/admin';
                    } else {
                        window.location.href = nextUrl;
                    }
                }, 400);

            } catch (err) {
                showAlert(err.message, 'error');
                showToast(err.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket text-xs"></i> <span>Sign In to Curevia</span>';
            }
        });
    }

    // Register Form Submit
    if (formRegister) {
        formRegister.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAlert();

            const fullName = document.getElementById('reg-name').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const phone = document.getElementById('reg-phone').value.trim();
            const password = document.getElementById('reg-password').value;
            const role = document.getElementById('reg-role').value;
            const authCode = staffCodeInput ? staffCodeInput.value.trim() : '';
            const nextUrl = document.getElementById('login-next-url')?.value || '/';

            if ((role === 'Pharmacist' || role === 'Admin') && !authCode) {
                showAlert('Staff authorization code is mandatory for professional accounts.', 'error');
                return;
            }

            const submitBtn = document.getElementById('btn-submit-register');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Creating Account...</span>';

            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        full_name: fullName,
                        email: email,
                        phone_number: phone,
                        password: password,
                        role: role,
                        auth_code: authCode
                    })
                });
                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.message || 'Registration failed');
                }

                showToast(data.message || 'Account created successfully!', 'success');
                
                setTimeout(() => {
                    if (role === 'Pharmacist' && (nextUrl === '/' || !nextUrl)) {
                        window.location.href = '/pharmacist';
                    } else if (role === 'Admin' && (nextUrl === '/' || !nextUrl)) {
                        window.location.href = '/admin';
                    } else {
                        window.location.href = nextUrl;
                    }
                }, 400);

            } catch (err) {
                showAlert(err.message, 'error');
                showToast(err.message, 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-user-plus text-xs"></i> <span>Create Curevia Account</span>';
            }
        });
    }
}
