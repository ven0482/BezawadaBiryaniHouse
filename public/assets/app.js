const DELIVERY_FEE = 40;
const PAGE_SIZE = 10;
const MAX_PAGES = 10;
const USD_INR_RATE = 83;
const INDIA_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Puducherry"
];
const USA_STATES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming"
];
const API = {
  signupCustomer: "/api/auth/signup-customer",
  login: "/api/auth/login",
  adminRegister: "/api/auth/admin/register",
  adminVerifyOtp: "/api/auth/admin/verify-otp",
  createAdminUser: "/api/admin/users",
  adminUsers: "/api/admin/users",
  adminUserById: (id) => `/api/admin/users/${encodeURIComponent(id)}`,
  forgotPasswordRequest: "/api/auth/forgot-password/request",
  forgotPasswordConfirm: "/api/auth/forgot-password/confirm",
  me: "/api/auth/me",
  logout: "/api/auth/logout",
  profile: "/api/auth/profile",
  adminProfile: "/api/auth/admin/profile",
  myOrders: "/api/my/orders",
  products: "/api/products",
  orders: "/api/orders",
  orderById: (id) => `/api/orders/${encodeURIComponent(id)}`,
  dashboard: "/api/dashboard",
  customers: "/api/customers",
  dineInTables: "/api/admin/dine-in/tables",
  dineInTableGrid: "/api/admin/dine-in/table-grid",
  dineInByTable: (tableNo) => `/api/admin/dine-in/by-table?tableNo=${encodeURIComponent(tableNo)}`,
  dineInOrder: "/api/admin/dine-in/order",
  dineInAddItems: (orderId) => `/api/admin/dine-in/orders/${encodeURIComponent(orderId)}/add-items`,
  dineInMarkPaid: "/api/admin/dine-in/mark-paid",
  phoneOrderTileGrid: "/api/admin/phone-order/tile-grid",
  phoneOrderBySlot: (slotNo) => `/api/admin/phone-order/by-slot?slotNo=${encodeURIComponent(slotNo)}`,
  phoneOrderCreate: "/api/admin/phone-order/order",
  phoneOrderAddItems: (orderId) => `/api/admin/phone-order/orders/${encodeURIComponent(orderId)}/add-items`,
  health: "/api/health",
  createIntent: "/api/checkout/create-intent",
  verifyPayment: "/api/checkout/verify",
  markPaidManual: "/api/checkout/mark-paid-manual"
};

let currentCurrency = "INR";
const money = (value) => {
  const amountInInr = Number(value || 0);
  if (currentCurrency === "INR") return `₹${amountInInr.toFixed(0)}`;
  const amountInUsd = amountInInr / USD_INR_RATE;
  return `$${amountInUsd.toFixed(2)}`;
};

function normalizeCountry(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "INDIA" || raw === "IN") return "INDIA";
  if (
    raw === "USA" ||
    raw === "US" ||
    raw === "UNITED STATES" ||
    raw === "UNITED STATES OF AMERICA"
  ) {
    return "USA";
  }
  return "";
}

function currencyForCountry(country) {
  const normalized = normalizeCountry(country);
  if (normalized === "INDIA") return "INR";
  if (normalized === "USA") return "USD";
  return null;
}

function populateStateOptions(countryEl, stateEl, selectedState = "") {
  if (!countryEl || !stateEl) return;
  const normalizedCountry = normalizeCountry(countryEl.value);
  const states = normalizedCountry === "INDIA" ? INDIA_STATES : normalizedCountry === "USA" ? USA_STATES : [];
  stateEl.innerHTML = `<option value="">Select state</option>${states
    .map((state) => `<option value="${state}">${state}</option>`)
    .join("")}`;
  stateEl.disabled = !normalizedCountry;
  if (selectedState && states.includes(selectedState)) {
    stateEl.value = selectedState;
    return;
  }
  stateEl.value = "";
}

function applyCurrencyForCountry(country, fallbackCurrency) {
  const inferred = currencyForCountry(country);
  applyCurrency(inferred || fallbackCurrency || getSavedCurrency());
}
const formatDateTime = (value) => new Date(`${value}Z`).toLocaleString("en-IN");
const formatOrderType = (value) => (String(value || "").toUpperCase() === "PICKUP" ? "Pickup" : "Delivery");
const formatOrderSource = (order) => {
  const channel = String(order?.order_channel || "ONLINE").toUpperCase();
  if (channel === "DINE_IN") return "Table Order";
  if (channel === "PHONE_ORDER") return "Phone Order";
  return "Online";
};
const getOrderChannelClass = (order) => {
  const channel = String(order?.order_channel || "ONLINE").toUpperCase();
  if (channel === "DINE_IN") return "table-order";
  if (channel === "PHONE_ORDER") return "phone-order";
  return "online-order";
};
const isLockedOrder = (order) =>
  String(order?.payment_status || "").toUpperCase() === "PAID" &&
  String(order?.status || "").toUpperCase() === "CLOSED";
const normalizeTableNo = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  const match = raw.match(/^T(\d{1,3})$/);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isInteger(num) || num < 1 || num > 100) return null;
  return `T${String(num).padStart(2, "0")}`;
};
const normalizePhoneSlotNo = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  const match = raw.match(/^P(\d{1,3})$/);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isInteger(num) || num < 1 || num > 100) return null;
  return `P${String(num).padStart(2, "0")}`;
};

function getServiceOrderMode() {
  const params = new URLSearchParams(window.location.search);
  const mode = String(params.get("mode") || "").trim().toLowerCase();
  const isPhone = mode === "phone";
  return {
    isPhone,
    mode: isPhone ? "phone" : "dine",
    channel: isPhone ? "PHONE_ORDER" : "DINE_IN",
    slotLabel: isPhone ? "Phone Slot" : "Table",
    slotPrefix: isPhone ? "P" : "T",
    listPage: isPhone ? "dine-in.html?mode=phone" : "dine-in.html",
    normalizeSlot: isPhone ? normalizePhoneSlotNo : normalizeTableNo,
    bySlotApi: isPhone ? API.phoneOrderBySlot : API.dineInByTable,
    createApi: isPhone ? API.phoneOrderCreate : API.dineInOrder,
    addItemsApi: isPhone ? API.phoneOrderAddItems : API.dineInAddItems
  };
}

function paginateRows(rows, page) {
  const totalItems = Array.isArray(rows) ? rows.length : 0;
  const totalPages = Math.max(1, Math.min(MAX_PAGES, Math.ceil(totalItems / PAGE_SIZE) || 1));
  const current = Math.min(Math.max(1, Number(page || 1)), totalPages);
  const start = (current - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  return {
    totalItems,
    totalPages,
    page: current,
    items: rows.slice(start, end)
  };
}

function renderPagination(el, page, totalPages, onPageClick) {
  if (!el) return;
  if (totalPages <= 1) {
    el.innerHTML = "";
    return;
  }
  let html = `<button class="btn btn-outline btn-sm" data-page="${Math.max(1, page - 1)}" ${page <= 1 ? "disabled" : ""}>Prev</button>`;
  for (let i = 1; i <= totalPages; i += 1) {
    html += `<button class="btn btn-sm ${i === page ? "" : "btn-outline"}" data-page="${i}">${i}</button>`;
  }
  html += `<button class="btn btn-outline btn-sm" data-page="${Math.min(totalPages, page + 1)}" ${page >= totalPages ? "disabled" : ""}>Next</button>`;
  el.innerHTML = html;
  el.querySelectorAll("button[data-page]").forEach((button) => {
    if (button.disabled) return;
    button.addEventListener("click", () => onPageClick(Number(button.dataset.page)));
  });
}

function csvCell(value) {
  const text = String(value ?? "");
  if (/[\",\\n]/.test(text)) return `"${text.replace(/\"/g, "\"\"")}"`;
  return text;
}
const AUTH_TOKEN_KEY = "foodbiz_auth_token_v1";
const AUTH_USER_KEY = "foodbiz_auth_user_v1";
const NAV_GUARD_KEY = "foodbiz_nav_guard_v1";
const ADMIN_BUTTON_ORDER_KEY = "foodbiz_admin_btn_order_v1";
const THEME_MODE_KEY_PREFIX = "foodbiz_theme_mode_v1";
const CURRENCY_KEY_PREFIX = "foodbiz_currency_v1";
const GLOBAL_CURRENCY_KEY = "foodbiz_currency_global_v1";

async function request(url, options = {}) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const incomingHeaders = options.headers || {};
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...incomingHeaders
    },
    ...options
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function setAuthSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function getLocalAuthUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || "null");
  } catch {
    return null;
  }
}

function getThemeModeStorageKey() {
  const user = getLocalAuthUser();
  const scope = String(user?.id || "guest");
  return `${THEME_MODE_KEY_PREFIX}:${scope}`;
}

function getCurrencyStorageKey() {
  const user = getLocalAuthUser();
  const scope = String(user?.id || "guest");
  return `${CURRENCY_KEY_PREFIX}:${scope}`;
}

function getSavedThemeMode() {
  const raw = String(localStorage.getItem(getThemeModeStorageKey()) || "day").toLowerCase();
  return raw === "night" ? "night" : "day";
}

function applyThemeMode(mode) {
  const normalized = String(mode || "").toLowerCase() === "night" ? "night" : "day";
  if (document.body) {
    document.body.setAttribute("data-theme", normalized);
  }
  localStorage.setItem(getThemeModeStorageKey(), normalized);
}

function initThemeMode() {
  applyThemeMode(getSavedThemeMode());
}

function getSavedCurrency() {
  const scoped = String(localStorage.getItem(getCurrencyStorageKey()) || "").toUpperCase();
  const global = String(localStorage.getItem(GLOBAL_CURRENCY_KEY) || "").toUpperCase();
  const raw = scoped || global || "INR";
  return raw === "INR" ? "INR" : "USD";
}

function applyCurrency(currency) {
  const normalized = String(currency || "").toUpperCase() === "INR" ? "INR" : "USD";
  currentCurrency = normalized;
  if (document.body) {
    document.body.setAttribute("data-currency", normalized);
  }
  localStorage.setItem(getCurrencyStorageKey(), normalized);
  if (getLocalAuthUser()?.role === "admin") {
    localStorage.setItem(GLOBAL_CURRENCY_KEY, normalized);
  }
}

function initCurrency() {
  applyCurrency(getSavedCurrency());
}

function navigateTo(path) {
  const target = String(path || "").trim();
  if (!target) return;
  const current = window.location.pathname.split("/").pop() || "index.html";
  const targetPage = target.split("?")[0].split("/").pop();
  if (current === targetPage) return;

  const now = Date.now();
  let state = { count: 0, ts: now };
  try {
    state = JSON.parse(sessionStorage.getItem(NAV_GUARD_KEY) || '{"count":0,"ts":0}');
  } catch {}
  if (now - Number(state.ts || 0) < 3000) {
    state.count = Number(state.count || 0) + 1;
  } else {
    state.count = 1;
  }
  state.ts = now;
  sessionStorage.setItem(NAV_GUARD_KEY, JSON.stringify(state));

  if (state.count > 8) {
    clearAuthSession();
    console.warn("Navigation guard stopped repeated redirects.");
    return;
  }
  window.location.replace(target);
}

async function requireRole(role) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (!token) {
    navigateTo("index.html");
    return null;
  }
  try {
    const me = await request(API.me);
    if (role && me.role !== role) {
      navigateTo(me.role === "admin" ? "admin.html" : "home.html");
      return null;
    }
    return me;
  } catch {
    clearAuthSession();
    navigateTo("index.html");
    return null;
  }
}

function getCart() {
  return JSON.parse(localStorage.getItem("foodbiz_cart_v2") || "[]");
}

function saveCart(cart) {
  localStorage.setItem("foodbiz_cart_v2", JSON.stringify(cart));
}

function initLogoutButtons() {
  document.querySelectorAll("#logoutBtn").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await request(API.logout, { method: "POST" });
      } catch {}
      saveCart([]);
      clearAuthSession();
      navigateTo("index.html");
    });
  });
}

function initActiveNavLinks() {
  const page = window.location.pathname.split("/").pop() || "index.html";
  const links = document.querySelectorAll(".nav-links a[href]");
  if (!links.length) return;

  const normalizedPage = page === "" ? "index.html" : page;
  const targetByPage = {
    "home.html": "home.html",
    "cart.html": "cart.html",
    "profile.html": "profile.html",
    "customer-orders.html": "customer-orders.html",
    "customer-order-detail.html": "customer-orders.html",
    "orders.html": "orders.html",
    "inventory.html": "inventory.html",
    "dashboard.html": "dashboard.html",
    "customers.html": "customers.html",
    "reports.html": "admin.html",
    "admin-profile.html": "admin-profile.html",
    "admin.html": "admin.html",
    "create-admin.html": "admin.html",
    "create-admin-edit.html": "admin.html",
    "dine-in.html": "dine-in.html",
    "dine-in-order.html": "dine-in.html",
    "dine-in-create.html": "dine-in.html",
    "dine-in-add-items.html": "dine-in.html",
    "admin-order-detail.html": "orders.html"
  };

  const target = targetByPage[normalizedPage];
  links.forEach((link) => {
    const href = String(link.getAttribute("href") || "");
    const hrefPage = href.split("?")[0].split("/").pop();
    link.classList.toggle("active-nav", Boolean(target && hrefPage === target));
  });
}

function initAuthPage() {
  const customerLoginForm = document.getElementById("customerLoginForm");
  if (!customerLoginForm) return;

  const messageEl = document.getElementById("authMessage");
  const authTabs = document.querySelectorAll(".auth-tab");
  const authPanels = document.querySelectorAll(".auth-panel");
  const authSection = document.getElementById("authSection");
  const topLoginBtn = document.getElementById("topLoginBtn");
  const topSignupBtn = document.getElementById("topSignupBtn");
  const heroLoginBtn = document.getElementById("heroLoginBtn");
  const heroSignupBtn = document.getElementById("heroSignupBtn");
  const customerSignupForm = document.getElementById("customerSignupForm");
  const signupCountryEl = document.getElementById("signupCountry");
  const signupStateEl = document.getElementById("signupState");
  const adminLoginForm = document.getElementById("adminLoginForm");
  const adminRegisterForm = document.getElementById("adminRegisterForm");
  const adminVerifyOtpForm = document.getElementById("adminVerifyOtpForm");
  const forgotRequestForm = document.getElementById("forgotRequestForm");
  const forgotConfirmForm = document.getElementById("forgotConfirmForm");

  const localUser = getLocalAuthUser();
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (localUser && !token) {
    clearAuthSession();
  } else if (localUser?.role === "admin" && token) {
    request(API.me)
      .then((me) => {
        if (me?.role === "admin") navigateTo("admin.html");
      })
      .catch(() => clearAuthSession());
  } else if (localUser?.role === "customer" && token) {
    request(API.me)
      .then((me) => {
        if (me?.role === "customer") navigateTo("home.html");
      })
      .catch(() => clearAuthSession());
  }

  function showMessage(text) {
    messageEl.textContent = text;
  }

  function setAuthMode(mode) {
    const isLoginMode = mode === "login";
    authTabs.forEach((tab) => {
      const isLoginTab = tab.dataset.tab === "customer-login" || tab.dataset.tab === "admin-login";
      const isSignupTab = tab.dataset.tab === "customer-signup" || tab.dataset.tab === "admin-register";
      const visible = isLoginMode ? isLoginTab : isSignupTab;
      tab.classList.toggle("hidden", !visible);
    });
    forgotRequestForm.classList.toggle("hidden", !isLoginMode);
    forgotConfirmForm.classList.toggle("hidden", !isLoginMode);
  }

  function activateAuthTab(tabName) {
    authTabs.forEach((item) => {
      item.classList.toggle("active", item.dataset.tab === tabName);
    });
    authPanels.forEach((panel) => panel.classList.add("hidden"));
    if (tabName === "customer-login") customerLoginForm.classList.remove("hidden");
    if (tabName === "customer-signup") customerSignupForm.classList.remove("hidden");
    if (tabName === "admin-login") adminLoginForm.classList.remove("hidden");
    if (tabName === "admin-register") adminRegisterForm.classList.remove("hidden");
  }

  function focusAuth(tabName, mode) {
    if (mode) setAuthMode(mode);
    activateAuthTab(tabName);
    if (authSection) {
      authSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      activateAuthTab(tab.dataset.tab);
    });
  });

  [topLoginBtn, heroLoginBtn].forEach((button) => {
    if (!button) return;
    button.addEventListener("click", () => focusAuth("customer-login", "login"));
  });

  [topSignupBtn, heroSignupBtn].forEach((button) => {
    if (!button) return;
    button.addEventListener("click", () => focusAuth("customer-signup", "signup"));
  });

  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "signup") {
    setAuthMode("signup");
    activateAuthTab("customer-signup");
  } else {
    setAuthMode("login");
    activateAuthTab("customer-login");
  }

  if (signupCountryEl && signupStateEl) {
    populateStateOptions(signupCountryEl, signupStateEl);
    signupCountryEl.addEventListener("change", () => {
      populateStateOptions(signupCountryEl, signupStateEl);
      applyCurrencyForCountry(signupCountryEl.value, getSavedCurrency());
    });
  }

  customerLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await request(API.login, {
        method: "POST",
        body: JSON.stringify({
          email: document.getElementById("loginEmail").value.trim(),
          password: document.getElementById("loginPassword").value
        })
      });
      setAuthSession(result.token, result.user);
      navigateTo(result.user.role === "admin" ? "admin.html" : "home.html");
    } catch (error) {
      showMessage(error.message);
    }
  });

  customerSignupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await request(API.signupCustomer, {
        method: "POST",
        body: JSON.stringify({
          firstName: document.getElementById("signupFirstName").value.trim(),
          lastName: document.getElementById("signupLastName").value.trim(),
          email: document.getElementById("signupEmail").value.trim(),
          password: document.getElementById("signupPassword").value,
          phone: document.getElementById("signupPhone").value.trim(),
          country: signupCountryEl?.value || "",
          state: signupStateEl?.value || "",
          address: document.getElementById("signupAddress").value.trim()
        })
      });
      setAuthSession(result.token, result.user);
      navigateTo("home.html");
    } catch (error) {
      showMessage(error.message);
    }
  });

  adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await request(API.login, {
        method: "POST",
        body: JSON.stringify({
          email: document.getElementById("adminLoginEmail").value.trim(),
          password: document.getElementById("adminLoginPassword").value
        })
      });
      setAuthSession(result.token, result.user);
      navigateTo("admin.html");
    } catch (error) {
      showMessage(error.message);
    }
  });

  adminRegisterForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await request(API.adminRegister, {
        method: "POST",
        body: JSON.stringify({
          firstName: document.getElementById("adminRegFirstName").value.trim(),
          lastName: document.getElementById("adminRegLastName").value.trim(),
          email: document.getElementById("adminRegEmail").value.trim(),
          password: document.getElementById("adminRegPassword").value
        })
      });
      adminVerifyOtpForm.classList.remove("hidden");
      showMessage(`${result.message} OTP: ${result.devOtp}`);
    } catch (error) {
      showMessage(error.message);
    }
  });

  adminVerifyOtpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await request(API.adminVerifyOtp, {
        method: "POST",
        body: JSON.stringify({
          email: document.getElementById("adminVerifyEmail").value.trim(),
          otp: document.getElementById("adminVerifyOtp").value.trim()
        })
      });
      showMessage(result.message);
    } catch (error) {
      showMessage(error.message);
    }
  });

  forgotRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await request(API.forgotPasswordRequest, {
        method: "POST",
        body: JSON.stringify({ email: document.getElementById("forgotEmail").value.trim() })
      });
      showMessage(`${result.message} OTP: ${result.devOtp || ""}`);
    } catch (error) {
      showMessage(error.message);
    }
  });

  forgotConfirmForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const result = await request(API.forgotPasswordConfirm, {
        method: "POST",
        body: JSON.stringify({
          email: document.getElementById("resetEmail").value.trim(),
          otp: document.getElementById("resetOtp").value.trim(),
          newPassword: document.getElementById("resetNewPassword").value
        })
      });
      showMessage(result.message);
    } catch (error) {
      showMessage(error.message);
    }
  });
}

function initShopPage() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  const cartCountBadge = document.getElementById("cartCountBadge");
  const categoryFilters = document.getElementById("categoryFilters");

  let selectedCategory = "All";
  let products = [];

  async function loadProducts() {
    products = await request(`${API.products}?activeOnly=1`);
  }

  function updateCartBadge() {
    const count = getCart().reduce((sum, item) => sum + item.qty, 0);
    cartCountBadge.textContent = String(count);
  }

  function renderCategories() {
    const preferredCategories = ["Breakfast"];
    const categories = ["All", ...new Set([...preferredCategories, ...products.map((p) => p.category)])];
    categoryFilters.innerHTML = categories
      .map(
        (category) =>
          `<button type="button" class="pill ${selectedCategory === category ? "active" : ""}" data-category="${category}">${category}</button>`
      )
      .join("");

    categoryFilters.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        selectedCategory = button.dataset.category;
        renderCategories();
        renderProducts();
      });
    });
  }

  function renderProducts() {
    const filtered = products.filter((product) => {
      const inCategory = selectedCategory === "All" || product.category === selectedCategory;
      return product.active && product.stock > 0 && inCategory;
    });

    if (!filtered.length) {
      grid.innerHTML = `<p>No active products in this category.</p>`;
      return;
    }

    grid.innerHTML = filtered
      .map(
        (product) => `
          <article class="product">
            <img src="${product.image || "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=800&q=80"}" alt="${product.name}" />
            <h3>${product.name}</h3>
            <p>${product.description}</p>
            <div class="meta">
              <strong>${money(product.price)}</strong>
            </div>
            <button class="btn btn-sm add-to-cart" data-id="${product.id}">Add To Cart</button>
          </article>
        `
      )
      .join("");

    grid.querySelectorAll(".add-to-cart").forEach((button) => {
      button.addEventListener("click", () => {
        const product = products.find((p) => p.id === button.dataset.id);
        if (!product || product.stock <= 0) return;

        const cart = getCart();
        const existing = cart.find((item) => item.id === product.id);
        if (existing) {
          if (existing.qty >= product.stock) return;
          existing.qty += 1;
        } else {
          cart.push({ id: product.id, qty: 1 });
        }

        saveCart(cart);
        updateCartBadge();
      });
    });
  }

  requireRole("customer").then((me) => {
    if (!me) return;
    applyCurrencyForCountry(me.customer?.country || "", getSavedCurrency());
    loadProducts()
      .then(() => {
        renderCategories();
        renderProducts();
        updateCartBadge();
      })
      .catch((error) => {
        grid.innerHTML = `<p>${error.message}</p>`;
      });
  });
}

function initHomePage() {
  const marker = document.querySelector(".hero");
  if (!marker) return;
  requireRole("customer").then(() => {});
}

function initCartPage() {
  const cartItemsEl = document.getElementById("cartItems");
  if (!cartItemsEl) return;

  const subtotalEl = document.getElementById("subtotal");
  const deliveryFeeEl = document.getElementById("deliveryFee");
  const totalEl = document.getElementById("total");
  const orderTypeEl = document.getElementById("orderType");
  const paymentMethodEl = document.getElementById("paymentMethod");
  const checkoutForm = document.getElementById("checkoutForm");
  const customerAddressWrap = document.getElementById("customerAddressWrap");
  const customerAddressEl = document.getElementById("customerAddress");
  const customerCountryEl = document.getElementById("customerCountry");
  const customerStateEl = document.getElementById("customerState");
  const upiArea = document.getElementById("upiArea");
  const paymentAssistText = document.getElementById("paymentAssistText");
  const upiLink = document.getElementById("upiLink");
  const upiUri = document.getElementById("upiUri");
  const orderSuccess = document.getElementById("orderSuccess");
  const markPaidBtn = document.getElementById("markPaidBtn");

  let products = [];
  let latestFallbackOrderId = null;
  let latestFallbackPaymentMode = "UPI";

  async function loadProducts() {
    products = await request(API.products);
  }

  function selectedOrderType() {
    return String(orderTypeEl?.value || "DELIVERY").toUpperCase();
  }

  function selectedPaymentMethod() {
    return String(paymentMethodEl?.value || "UPI").toUpperCase();
  }

  function syncOrderTypeUI() {
    const isPickup = selectedOrderType() === "PICKUP";
    if (!customerAddressWrap || !customerAddressEl) return;
    if (isPickup) {
      customerAddressWrap.classList.add("hidden");
      customerAddressEl.required = false;
      customerAddressEl.value = "";
    } else {
      customerAddressWrap.classList.remove("hidden");
      customerAddressEl.required = true;
    }
  }

  function renderCart() {
    const cart = getCart();
    const deliveryFee = selectedOrderType() === "PICKUP" ? 0 : DELIVERY_FEE;

    if (!cart.length) {
      cartItemsEl.innerHTML = `<p>Your cart is empty. <a href="home.html">Add food items</a>.</p>`;
      subtotalEl.textContent = money(0);
      if (deliveryFeeEl) deliveryFeeEl.textContent = money(deliveryFee);
      totalEl.textContent = money(deliveryFee);
      return;
    }

    let subtotal = 0;
    cartItemsEl.innerHTML = cart
      .map((item) => {
        const product = products.find((p) => p.id === item.id);
        if (!product) return "";

        const lineTotal = product.price * item.qty;
        subtotal += lineTotal;

        return `
          <div class="cart-item">
            <div>
              <strong>${product.name}</strong>
              <div class="small">${money(product.price)} x ${item.qty}</div>
            </div>
            <div class="qty">
              <button type="button" data-action="minus" data-id="${item.id}">-</button>
              <span>${item.qty}</span>
              <button type="button" data-action="plus" data-id="${item.id}">+</button>
            </div>
            <strong>${money(lineTotal)}</strong>
          </div>
        `;
      })
      .join("");

    subtotalEl.textContent = money(subtotal);
    if (deliveryFeeEl) deliveryFeeEl.textContent = money(deliveryFee);
    totalEl.textContent = money(subtotal + deliveryFee);

    cartItemsEl.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const cart = getCart();
        const item = cart.find((c) => c.id === button.dataset.id);
        const product = products.find((p) => p.id === button.dataset.id);
        if (!item || !product) return;

        if (button.dataset.action === "plus" && item.qty < product.stock) item.qty += 1;
        if (button.dataset.action === "minus") item.qty -= 1;

        saveCart(cart.filter((c) => c.qty > 0));
        renderCart();
      });
    });
  }

  async function handleCheckout(event) {
    event.preventDefault();
    const cartItems = getCart();
    if (!cartItems.length) {
      alert("Cart is empty.");
      return;
    }

    const payload = {
      orderType: selectedOrderType(),
      paymentMode: selectedPaymentMethod(),
      customerName: document.getElementById("customerName").value.trim(),
      customerPhone: document.getElementById("customerPhone").value.trim(),
      customerAddress: customerAddressEl.value.trim(),
      customerCountry: customerCountryEl?.value || "",
      customerState: customerStateEl?.value || "",
      cartItems
    };

    try {
      const created = await request(API.createIntent, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      saveCart([]);
      renderCart();
      checkoutForm.reset();
      await loadProducts();

      if (created.payment.provider === "razorpay") {
        const options = {
          key: created.payment.keyId,
          amount: created.payment.amountPaise,
          currency: created.payment.currency,
          name: created.payment.businessName,
          description: `Order ${created.orderId}`,
          order_id: created.payment.razorpayOrderId,
          handler: async function (response) {
            await request(API.verifyPayment, {
              method: "POST",
              body: JSON.stringify({
                orderId: created.orderId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature
              })
            });

            upiArea.classList.remove("hidden");
            orderSuccess.classList.remove("hidden");
            orderSuccess.textContent = `Order ${created.orderId} placed and payment successful.`;
          },
          theme: { color: "#c84b31" }
        };

        const rzp = new Razorpay(options);
        rzp.open();
        return;
      }

      latestFallbackOrderId = created.orderId;
      latestFallbackPaymentMode = String(created.payment?.paymentMode || selectedPaymentMethod()).toUpperCase();
      upiArea.classList.remove("hidden");
      if (created.payment.provider === "upi_intent") {
        upiLink.classList.remove("hidden");
        upiUri.classList.remove("hidden");
        upiLink.href = created.payment.upiUri;
        upiUri.textContent = created.payment.upiUri;
        if (paymentAssistText) paymentAssistText.textContent = "Use any UPI app to complete payment:";
      } else {
        upiLink.classList.add("hidden");
        upiUri.classList.add("hidden");
        if (paymentAssistText) {
          paymentAssistText.textContent =
            "Complete payment at counter/terminal and click 'I Have Paid' to confirm.";
        }
      }
      orderSuccess.classList.remove("hidden");
      orderSuccess.textContent = `Order ${created.orderId} is pending. After payment click 'I Have Paid'.`;
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleManualPaid() {
    if (!latestFallbackOrderId) {
      alert("No pending order found.");
      return;
    }

    try {
      await request(API.markPaidManual, {
        method: "POST",
        body: JSON.stringify({
          orderId: latestFallbackOrderId,
          transactionRef: `${latestFallbackPaymentMode}-${Date.now()}`
        })
      });

      saveCart([]);
      await loadProducts();
      renderCart();
      checkoutForm.reset();
      orderSuccess.classList.remove("hidden");
      orderSuccess.textContent = `Order ${latestFallbackOrderId} marked paid and moved to Open.`;
      latestFallbackOrderId = null;
      latestFallbackPaymentMode = "UPI";
    } catch (error) {
      alert(error.message);
    }
  }

  checkoutForm.addEventListener("submit", handleCheckout);
  markPaidBtn.addEventListener("click", handleManualPaid);
  if (orderTypeEl) {
    orderTypeEl.addEventListener("change", () => {
      syncOrderTypeUI();
      renderCart();
    });
  }
  if (customerCountryEl && customerStateEl) {
    populateStateOptions(customerCountryEl, customerStateEl);
    customerCountryEl.addEventListener("change", () => {
      populateStateOptions(customerCountryEl, customerStateEl);
      applyCurrencyForCountry(customerCountryEl.value, getSavedCurrency());
      renderCart();
    });
  }

  requireRole("customer").then((me) => {
    if (!me) return;
    document.getElementById("customerName").value = `${me.customer?.firstName || ""} ${me.customer?.lastName || ""}`.trim();
    document.getElementById("customerPhone").value = me.customer?.phone || "";
    document.getElementById("customerAddress").value = me.customer?.address || "";
    if (customerCountryEl && customerStateEl) {
      customerCountryEl.value = normalizeCountry(me.customer?.country || "");
      populateStateOptions(customerCountryEl, customerStateEl, me.customer?.state || "");
      applyCurrencyForCountry(customerCountryEl.value, getSavedCurrency());
    }
    syncOrderTypeUI();
    loadProducts()
      .then(() => {
        renderCart();
      })
      .catch((error) => {
        cartItemsEl.innerHTML = `<p>${error.message}</p>`;
      });
  });
}

function initDineInPage() {
  const tilesWrap = document.getElementById("dineInTilesWrap");
  if (!tilesWrap) return;
  const modeCfg = getServiceOrderMode();
  const titleEl = document.querySelector("#dineInTilesWrap")?.closest(".card")?.querySelector("h1");
  const searchInput = document.getElementById("dineInTableSearchInput");
  const statusEl = document.getElementById("dineInTilesStatus");

  let tables = [];
  let nextAvailableSlot = null;
  let query = "";

  function rowLabel(table) {
    if (!table.orderId) return "Available";
    return `${table.customerName || "Guest"} | ${table.orderId}`;
  }

  function renderTiles() {
    const normalized = query.toLowerCase();
    const filtered = tables.filter((table) => {
      if (!normalized) return true;
      return [table.tableNo || table.slotNo, table.orderId, table.customerName].join(" ").toLowerCase().includes(normalized);
    });

    if (!filtered.length) {
      if (modeCfg.isPhone) {
        const plusHref = nextAvailableSlot
          ? `dine-in-order.html?mode=phone&slot=${encodeURIComponent(nextAvailableSlot)}&back=${encodeURIComponent(modeCfg.listPage)}`
          : "";
        const plusTile = `
          <a class="card table-tile-link table-tile-plus ${!plusHref ? "disabled" : ""}" ${plusHref ? `href="${plusHref}"` : ""}>
            <h3>+</h3>
            <p><strong>New Phone Order</strong></p>
            <p>${nextAvailableSlot ? `Assign ${nextAvailableSlot}` : "All slots are busy"}</p>
          </a>
        `;
        tilesWrap.innerHTML = plusTile;
      } else {
        tilesWrap.innerHTML = `<p>No tables found.</p>`;
      }
      return;
    }

    let html = filtered
      .map((table) => {
        const hasOrder = Boolean(table.orderId);
        const slotNo = table.tableNo || table.slotNo;
        const slotKey = modeCfg.isPhone ? "slot" : "table";
        const orderLink = `dine-in-order.html?${slotKey}=${encodeURIComponent(slotNo)}${modeCfg.isPhone ? "&mode=phone" : ""}&back=${encodeURIComponent(modeCfg.listPage)}`;
        const tileClass = modeCfg.isPhone
          ? `phone-order-tile ${hasOrder ? "phone-order-tile-active" : "phone-order-tile-available"}`
          : `table-order-tile ${hasOrder ? "table-order-tile-active" : "table-order-tile-available"}`;
        return `
          <a class="card table-tile-link ${tileClass}" href="${orderLink}">
            <h3>${slotNo}</h3>
            <p><strong>Order:</strong> ${table.orderId || "-"}</p>
            <p><strong>Name:</strong> ${table.customerName || "-"}</p>
            <p><strong>Status:</strong> ${table.status || "Available"}</p>
            <p><strong>Payment:</strong> ${table.paymentStatus || "-"}</p>
            <span class="pill ${hasOrder ? "" : "active"}">${hasOrder ? "In Use" : "Available"}</span>
          </a>
        `;
      })
      .join("");

    if (modeCfg.isPhone) {
      const plusHref = nextAvailableSlot
        ? `dine-in-order.html?mode=phone&slot=${encodeURIComponent(nextAvailableSlot)}&back=${encodeURIComponent(modeCfg.listPage)}`
        : "";
      html += `
        <a class="card table-tile-link table-tile-plus ${!plusHref ? "disabled" : ""}" ${plusHref ? `href="${plusHref}"` : ""}>
          <h3>+</h3>
          <p><strong>New Phone Order</strong></p>
          <p>${nextAvailableSlot ? `Assign ${nextAvailableSlot}` : "All slots are busy"}</p>
        </a>
      `;
    }

    tilesWrap.innerHTML = html;
  }

  async function loadTiles() {
    if (modeCfg.isPhone) {
      const payload = await request(API.phoneOrderTileGrid);
      tables = Array.isArray(payload?.tiles) ? payload.tiles : [];
      nextAvailableSlot = payload?.nextAvailableSlot || null;
    } else {
      tables = await request(API.dineInTableGrid);
      nextAvailableSlot = null;
    }
    renderTiles();
  }

  if (searchInput) {
    const searchLabelEl = searchInput.closest("label");
    searchInput.placeholder = modeCfg.isPhone ? "P01, customer name, order id" : "T01, customer name, order id";
    if (searchLabelEl && searchLabelEl.firstChild && searchLabelEl.firstChild.nodeType === Node.TEXT_NODE) {
      searchLabelEl.firstChild.nodeValue = modeCfg.isPhone
        ? "Search Phone Slot / Name / Order\n        "
        : "Search Table / Name / Order\n        ";
    }
    searchInput.addEventListener("input", () => {
      query = String(searchInput.value || "").trim();
      renderTiles();
    });
  }

  if (titleEl) titleEl.textContent = modeCfg.isPhone ? "Phone Orders" : "Dine In Tables";

  requireRole("admin").then((me) => {
    if (!me) return;
    loadTiles().catch((error) => {
      statusEl.textContent = error.message;
      tilesWrap.innerHTML = `<p>${error.message}</p>`;
    });
  });
}

function initAdminButtonSorting() {
  const grid = document.querySelector(".admin-function-grid");
  if (!grid) return;

  const keyFor = (button) => String(button.getAttribute("href") || "").trim();
  const getButtons = () => Array.from(grid.querySelectorAll("a.admin-nav-btn[href]"));

  function applySavedOrder() {
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem(ADMIN_BUTTON_ORDER_KEY) || "[]");
    } catch {
      saved = [];
    }
    if (!Array.isArray(saved) || !saved.length) return;

    const current = getButtons();
    const byKey = new Map(current.map((button) => [keyFor(button), button]));
    const ordered = [];

    saved.forEach((href) => {
      const found = byKey.get(String(href || ""));
      if (found) {
        ordered.push(found);
        byKey.delete(String(href || ""));
      }
    });
    byKey.forEach((button) => ordered.push(button));
    ordered.forEach((button) => grid.appendChild(button));
  }

  function saveOrder() {
    const orderedKeys = getButtons().map((button) => keyFor(button)).filter(Boolean);
    localStorage.setItem(ADMIN_BUTTON_ORDER_KEY, JSON.stringify(orderedKeys));
  }

  applySavedOrder();
  let dragged = null;

  getButtons().forEach((button) => {
    button.setAttribute("draggable", "true");
    button.classList.add("draggable-admin-btn");

    button.addEventListener("dragstart", (event) => {
      dragged = button;
      button.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", keyFor(button));
      }
    });

    button.addEventListener("dragover", (event) => {
      if (!dragged || dragged === button) return;
      event.preventDefault();
      const rect = button.getBoundingClientRect();
      const isAfter = event.clientY - rect.top > rect.height / 2;
      grid.insertBefore(dragged, isAfter ? button.nextSibling : button);
    });

    button.addEventListener("drop", (event) => {
      event.preventDefault();
      if (!dragged) return;
      saveOrder();
    });

    button.addEventListener("dragend", () => {
      getButtons().forEach((b) => b.classList.remove("is-dragging"));
      if (dragged) saveOrder();
      dragged = null;
    });
  });
}

function initAdminPage() {
  const tableBody = document.getElementById("productTableBody");
  const inventoryPaginationEl = document.getElementById("inventoryPagination");
  const addInventoryBtn = document.getElementById("addInventoryBtn");
  const inventorySearchInput = document.getElementById("inventorySearchInput");
  const ordersTableBody = document.getElementById("ordersTableBody");
  const ordersPaginationEl = document.getElementById("ordersPagination");
  const ordersSearchInput = document.getElementById("ordersSearchInput");
  const statusFilters = document.getElementById("orderStatusFilters");
  const channelFilters = document.getElementById("orderChannelFilters");
  if (!tableBody && !ordersTableBody) return;

  let currentStatus = "ALL";
  let currentChannel = "ALL";
  let inventoryQuery = "";
  let ordersQuery = "";
  let latestProducts = [];
  let inventoryPage = 1;
  let ordersPage = 1;

  function renderProducts() {
    const normalized = inventoryQuery.toLowerCase();
    const filteredProducts = latestProducts.filter((product) => {
      if (!normalized) return true;
      return [product.name, product.category, product.sku].some((field) =>
        String(field || "").toLowerCase().includes(normalized)
      );
    });
    const paged = paginateRows(filteredProducts, inventoryPage);
    inventoryPage = paged.page;

    if (!filteredProducts.length) {
      tableBody.innerHTML = `<tr><td colspan="7">No products found.</td></tr>`;
      if (inventoryPaginationEl) inventoryPaginationEl.innerHTML = "";
      return;
    }

    tableBody.innerHTML = paged.items
      .map(
        (product) => `
          <tr>
            <td>${product.name}</td>
            <td>${product.category}</td>
            <td>${product.sku}</td>
            <td>${money(product.price)}</td>
            <td>${product.stock}</td>
            <td>${product.active ? "Active" : "Hidden"}</td>
            <td>
              <button class="btn btn-sm" data-action="edit" data-id="${product.id}" type="button">Update</button>
              <button class="btn btn-outline btn-sm" data-action="delete" data-id="${product.id}" type="button">Delete</button>
            </td>
          </tr>
        `
      )
      .join("");

    tableBody.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.dataset.id;

        if (button.dataset.action === "edit") {
          window.location.href = `inventory-form.html?id=${encodeURIComponent(id)}`;
          return;
        }

        if (button.dataset.action === "delete") {
          await request(`${API.products}/${id}`, { method: "DELETE" });
          await loadProducts();
        }
      });
    });

    renderPagination(inventoryPaginationEl, paged.page, paged.totalPages, (nextPage) => {
      inventoryPage = nextPage;
      renderProducts();
    });
  }

  async function loadProducts() {
    if (!tableBody) return;
    latestProducts = await request(API.products);
    renderProducts();
  }

  async function loadOrders() {
    if (!ordersTableBody) return;
    const params = new URLSearchParams();
    if (currentStatus !== "ALL") params.set("status", currentStatus);
    if (currentChannel !== "ALL") params.set("channel", currentChannel);
    const url = params.toString() ? `${API.orders}?${params.toString()}` : API.orders;
    const fetched = await request(url);
    const normalized = ordersQuery.toLowerCase();
    const filteredOrders = fetched.filter((order) => {
      if (!normalized) return true;
      const itemsText = Array.isArray(order.items)
        ? order.items.map((item) => `${item.product_name} ${item.sku}`).join(" ")
        : "";
      return [
        order.id,
        order.order_type,
        order.order_channel,
        order.table_no,
        order.customer_name,
        order.customer_phone,
        order.status,
        order.payment_status,
        itemsText
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
    const paged = paginateRows(filteredOrders, ordersPage);
    ordersPage = paged.page;

    if (!filteredOrders.length) {
      ordersTableBody.innerHTML = `<tr><td colspan="9">No orders found.</td></tr>`;
      if (ordersPaginationEl) ordersPaginationEl.innerHTML = "";
      return;
    }

    ordersTableBody.innerHTML = paged.items
      .map((order) => {
        const locked = isLockedOrder(order);
        const itemsSummary = order.items
          .map((item) => `${item.product_name} x${item.qty}`)
          .join(", ");

        return `
          <tr>
            <td>${order.id}</td>
            <td>${formatDateTime(order.created_at)}</td>
            <td>
              <span class="order-channel-chip ${getOrderChannelClass(order)}">${formatOrderSource(order)}</span>
              ${order.table_no ? `<span class="small"> (${order.table_no})</span>` : ""}
            </td>
            <td>${order.customer_name}<br/><span class="small">${order.customer_phone}</span></td>
            <td>${money(order.total)}</td>
            <td>${order.payment_status}</td>
            <td>${order.status}</td>
            <td><span class="small">${itemsSummary}</span></td>
            <td>
              <a class="btn btn-sm ${locked ? "btn-outline" : ""}" href="admin-order-detail.html?id=${encodeURIComponent(order.id)}&back=orders.html">
                ${locked ? "View" : "Open"}
              </a>
            </td>
          </tr>
        `;
      })
      .join("");

    renderPagination(ordersPaginationEl, paged.page, paged.totalPages, async (nextPage) => {
      ordersPage = nextPage;
      await loadOrders();
    });
  }

  if (statusFilters) {
    statusFilters.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", async () => {
        currentStatus = button.dataset.status;
        ordersPage = 1;
        statusFilters.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        button.classList.add("active");
        await loadOrders();
      });
    });
  }

  if (channelFilters) {
    channelFilters.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", async () => {
        currentChannel = button.dataset.channel;
        ordersPage = 1;
        channelFilters.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
        button.classList.add("active");
        await loadOrders();
      });
    });
  }

  if (inventorySearchInput) {
    inventorySearchInput.addEventListener("input", () => {
      inventoryQuery = inventorySearchInput.value.trim();
      inventoryPage = 1;
      renderProducts();
    });
  }

  if (ordersSearchInput) {
    ordersSearchInput.addEventListener("input", async () => {
      ordersQuery = ordersSearchInput.value.trim();
      ordersPage = 1;
      await loadOrders();
    });
  }

  if (addInventoryBtn) {
    addInventoryBtn.addEventListener("click", () => {
      window.location.href = "inventory-form.html";
    });
  }

  requireRole("admin").then((me) => {
    if (!me) return;
    if (tableBody) {
      loadProducts().catch((error) => {
        tableBody.innerHTML = `<tr><td colspan="7">${error.message}</td></tr>`;
      });
    }

    if (ordersTableBody) {
      loadOrders().catch((error) => {
        ordersTableBody.innerHTML = `<tr><td colspan="8">${error.message}</td></tr>`;
      });
    }
  });
}

function initAdminOrderDetailPage() {
  const pageRoot = document.getElementById("adminOrderDetailPage");
  if (!pageRoot) return;

  const params = new URLSearchParams(window.location.search);
  const orderId = String(params.get("id") || "").trim();
  const back = String(params.get("back") || "orders.html").trim() || "orders.html";

  const orderTitleEl = document.getElementById("adminOrderTitle");
  const orderMetaEl = document.getElementById("adminOrderMeta");
  const orderItemsBodyEl = document.getElementById("adminOrderItemsBody");
  const subtotalEl = document.getElementById("adminOrderSubtotal");
  const deliveryEl = document.getElementById("adminOrderDelivery");
  const totalEl = document.getElementById("adminOrderTotal");
  const closeBtn = document.getElementById("adminOrderCloseBtn");
  const form = document.getElementById("adminOrderEditForm");
  const channelEl = document.getElementById("adminOrderChannel");
  const tableWrapEl = document.getElementById("adminOrderTableWrap");
  const slotLabelEl = document.getElementById("adminOrderSlotLabel");
  const tableNoEl = document.getElementById("adminOrderTableNo");
  const orderTypeEl = document.getElementById("adminOrderType");
  const addressWrapEl = document.getElementById("adminOrderAddressWrap");
  const addressEl = document.getElementById("adminOrderAddress");
  const nameEl = document.getElementById("adminOrderCustomerName");
  const phoneEl = document.getElementById("adminOrderCustomerPhone");
  const statusEl = document.getElementById("adminOrderStatus");
  const paymentStatusEl = document.getElementById("adminOrderPaymentStatus");
  const statusMessageEl = document.getElementById("adminOrderStatusMessage");
  const submitBtn = form.querySelector('button[type="submit"]');

  closeBtn.href = back;

  if (!orderId) {
    statusMessageEl.textContent = "Order ID is missing.";
    form.classList.add("hidden");
    return;
  }

  function syncFormUI() {
    const isServiceOrder = channelEl.value === "DINE_IN" || channelEl.value === "PHONE_ORDER";
    const isPhoneOrder = channelEl.value === "PHONE_ORDER";
    tableWrapEl.classList.toggle("hidden", !isServiceOrder);
    tableNoEl.required = isServiceOrder;
    if (slotLabelEl) slotLabelEl.textContent = isPhoneOrder ? "Phone Slot" : "Table No";
    tableNoEl.placeholder = isPhoneOrder ? "Example: P12" : "Example: T12";

    if (isServiceOrder) {
      orderTypeEl.value = "PICKUP";
      orderTypeEl.disabled = true;
      addressWrapEl.classList.add("hidden");
      addressEl.required = false;
    } else {
      orderTypeEl.disabled = false;
      const isDelivery = orderTypeEl.value === "DELIVERY";
      addressWrapEl.classList.toggle("hidden", !isDelivery);
      addressEl.required = isDelivery;
    }
  }

  function renderOrder(order) {
    const locked = isLockedOrder(order);
    orderTitleEl.textContent = `Order ${order.id}`;
    orderMetaEl.innerHTML = `
      <div><strong>Date:</strong> ${formatDateTime(order.created_at)}</div>
      <div><strong>Source:</strong> <span class="order-channel-chip ${getOrderChannelClass(order)}">${formatOrderSource(order)}</span></div>
      <div><strong>Slot:</strong> ${order.table_no || "-"}</div>
      <div><strong>Current Status:</strong> ${order.status}</div>
      <div><strong>Payment:</strong> ${order.payment_status}</div>
      <div><strong>Type:</strong> ${formatOrderType(order.order_type)}</div>
    `;

    orderItemsBodyEl.innerHTML = (order.items || [])
      .map(
        (item) => `
          <tr>
            <td>${item.product_name}</td>
            <td>${item.sku}</td>
            <td>${item.qty}</td>
            <td>${money(item.price)}</td>
            <td>${money(item.line_total)}</td>
          </tr>
        `
      )
      .join("");

    subtotalEl.textContent = money(order.subtotal);
    deliveryEl.textContent = money(order.delivery_fee);
    totalEl.textContent = money(order.total);

    channelEl.value = String(order.order_channel || "ONLINE").toUpperCase();
    tableNoEl.value = order.table_no || "";
    orderTypeEl.value = String(order.order_type || "DELIVERY").toUpperCase();
    nameEl.value = order.customer_name || "";
    phoneEl.value = order.customer_phone === "-" ? "" : order.customer_phone || "";
    addressEl.value = order.customer_address || "";
    statusEl.value = String(order.status || "PENDING").toUpperCase();
    paymentStatusEl.value = String(order.payment_status || "INITIATED").toUpperCase();
    syncFormUI();

    if (locked) {
      const editableFields = [channelEl, tableNoEl, orderTypeEl, addressEl, nameEl, phoneEl, statusEl, paymentStatusEl];
      editableFields.forEach((field) => {
        field.disabled = true;
      });
      if (submitBtn) submitBtn.disabled = true;
      statusMessageEl.textContent = "Paid and Closed orders cannot be updated from Orders.";
    } else {
      if (submitBtn) submitBtn.disabled = false;
      syncFormUI();
      if (statusMessageEl.textContent.includes("cannot be updated")) {
        statusMessageEl.textContent = "";
      }
    }
  }

  async function loadOrder() {
    const order = await request(API.orderById(orderId));
    renderOrder(order);
  }

  channelEl.addEventListener("change", syncFormUI);
  orderTypeEl.addEventListener("change", syncFormUI);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const normalizedTableNo =
        channelEl.value === "DINE_IN"
          ? normalizeTableNo(tableNoEl.value)
          : channelEl.value === "PHONE_ORDER"
            ? normalizePhoneSlotNo(tableNoEl.value)
            : "";
      if (channelEl.value === "DINE_IN" && !normalizedTableNo) {
        alert("Table no must be between T01 and T100.");
        return;
      }
      if (channelEl.value === "PHONE_ORDER" && !normalizedTableNo) {
        alert("Phone slot must be between P01 and P100.");
        return;
      }
      if (normalizedTableNo) tableNoEl.value = normalizedTableNo;
      const payload = {
        orderChannel: channelEl.value,
        tableNo: normalizedTableNo,
        orderType: orderTypeEl.value,
        customerName: nameEl.value.trim(),
        customerPhone: phoneEl.value.trim(),
        customerAddress: addressEl.value.trim(),
        status: statusEl.value,
        paymentStatus: paymentStatusEl.value
      };
      await request(`${API.orders}/${encodeURIComponent(orderId)}/details`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      statusMessageEl.textContent = `Order ${orderId} updated.`;
      await loadOrder();
    } catch (error) {
      alert(error.message);
    }
  });

  requireRole("admin").then((me) => {
    if (!me) return;
    loadOrder().catch((error) => {
      statusMessageEl.textContent = error.message;
      form.classList.add("hidden");
    });
  });
}

function initDineInOrderPage() {
  const pageRoot = document.getElementById("dineInOrderPage");
  if (!pageRoot) return;
  const modeCfg = getServiceOrderMode();

  const params = new URLSearchParams(window.location.search);
  const orderIdFromQuery = String(params.get("id") || "").trim();
  const rawSlot = params.get("slot") || params.get("table");
  const slotFromQuery = modeCfg.normalizeSlot(rawSlot);
  const back = String(params.get("back") || modeCfg.listPage).trim() || modeCfg.listPage;

  const titleEl = document.getElementById("dineInOrderTitle");
  const closeBtn = document.getElementById("dineInOrderCloseBtn");
  const statusMessageEl = document.getElementById("dineInOrderStatusMessage");
  const metaEl = document.getElementById("dineInOrderMeta");
  const itemsBodyEl = document.getElementById("dineInOrderItemsBody");
  const subtotalEl = document.getElementById("dineInOrderSubtotal");
  const deliveryEl = document.getElementById("dineInOrderDelivery");
  const totalEl = document.getElementById("dineInOrderTotal");
  const statusSelectEl = document.getElementById("dineInOrderStatus");
  const paymentSelectEl = document.getElementById("dineInOrderPaymentStatus");
  const stateFormEl = document.getElementById("dineInOrderStateForm");
  const paymentWrapEl = document.getElementById("dineInOrderPaymentWrap");
  const statusWrapEl = document.getElementById("dineInOrderStatusWrap");
  const customerNameEl = document.getElementById("dineInOrderCustomerName");
  const customerPhoneEl = document.getElementById("dineInOrderCustomerPhone");
  const createBtnEl = document.getElementById("dineInOrderCreateBtn");
  const goAddItemsBtnEl = document.getElementById("dineInOrderGoAddItemsBtn");
  const updateBtnEl = document.getElementById("dineInOrderUpdateBtn");

  closeBtn.href = back;
  titleEl.textContent = modeCfg.isPhone ? "Phone Order" : "Dine In Order";

  if (!orderIdFromQuery && !slotFromQuery) {
    statusMessageEl.textContent = `Order or ${modeCfg.slotLabel.toLowerCase()} is missing.`;
    if (stateFormEl) stateFormEl.classList.add("hidden");
    if (createBtnEl) createBtnEl.disabled = true;
    return;
  }

  let currentOrder = null;
  let currentOrderId = orderIdFromQuery;
  let currentSlotNo = slotFromQuery || "";

  function setActionMode(hasOrder) {
    createBtnEl?.classList.toggle("hidden", hasOrder);
    goAddItemsBtnEl?.classList.toggle("hidden", !hasOrder);
    updateBtnEl?.classList.toggle("hidden", !hasOrder);
    paymentWrapEl?.classList.toggle("hidden", !hasOrder);
    statusWrapEl?.classList.toggle("hidden", !hasOrder);
  }

  function renderOrder(order) {
    currentOrder = order;
    const locked = isLockedOrder(order);

    titleEl.textContent = `${modeCfg.isPhone ? "Phone" : "Dine In"} Order ${order.id}`;
    metaEl.innerHTML = `
      <div><strong>Date:</strong> ${formatDateTime(order.created_at)}</div>
      <div><strong>${modeCfg.slotLabel}:</strong> ${order.table_no || "-"}</div>
      <div><strong>Status:</strong> ${order.status}</div>
      <div><strong>Payment:</strong> ${order.payment_status}</div>
      <div><strong>Customer:</strong> ${order.customer_name || "-"}</div>
      <div><strong>Phone:</strong> ${order.customer_phone || "-"}</div>
    `;

    itemsBodyEl.innerHTML = (order.items || [])
      .map(
        (item) => `
          <tr>
            <td>${item.product_name}</td>
            <td>${item.sku}</td>
            <td>${item.qty}</td>
            <td>${money(item.price)}</td>
            <td>${money(item.line_total)}</td>
          </tr>
        `
      )
      .join("");

    subtotalEl.textContent = money(order.subtotal);
    deliveryEl.textContent = money(order.delivery_fee);
    totalEl.textContent = money(order.total);
    statusSelectEl.value = String(order.status || "OPEN").toUpperCase();
    paymentSelectEl.value = String(order.payment_status || "INITIATED").toUpperCase();
    statusSelectEl.disabled = locked;
    paymentSelectEl.disabled = locked;
    if (goAddItemsBtnEl) goAddItemsBtnEl.disabled = locked;
    createBtnEl.disabled = true;
    setActionMode(true);
    const defaultGuestName = modeCfg.isPhone ? `Phone ${order.table_no} Guest` : `Table ${order.table_no} Guest`;
    customerNameEl.value = order.customer_name === defaultGuestName ? "" : order.customer_name || "";
    customerPhoneEl.value = order.customer_phone === "-" ? "" : order.customer_phone || "";

    if (locked) {
      statusMessageEl.textContent = "This order is Paid and Closed. Further updates are not allowed.";
    } else {
      statusMessageEl.textContent = "";
    }

  }

  async function loadOrder() {
    const order = await request(API.orderById(currentOrderId));
    if (String(order.order_channel || "").toUpperCase() !== modeCfg.channel) {
      throw new Error(`This is not a ${modeCfg.isPhone ? "phone" : "dine-in"} order.`);
    }
    currentSlotNo = order.table_no || currentSlotNo;
    renderOrder(order);
  }

  function renderEmptySlotState() {
    currentOrder = null;
    titleEl.textContent = `${modeCfg.slotLabel} ${currentSlotNo}`;
    metaEl.innerHTML = `
      <div><strong>${modeCfg.slotLabel}:</strong> ${currentSlotNo}</div>
      <div><strong>Status:</strong> Available</div>
      <div><strong>Order:</strong> New</div>
    `;
    itemsBodyEl.innerHTML = `<tr><td colspan="5">No active order for this ${modeCfg.slotLabel.toLowerCase()}.</td></tr>`;
    subtotalEl.textContent = money(0);
    deliveryEl.textContent = money(0);
    totalEl.textContent = money(0);
    statusSelectEl.value = "OPEN";
    paymentSelectEl.value = "INITIATED";
    statusSelectEl.disabled = true;
    paymentSelectEl.disabled = true;
    if (goAddItemsBtnEl) goAddItemsBtnEl.disabled = true;
    createBtnEl.disabled = false;
    setActionMode(false);
    statusMessageEl.textContent = `${modeCfg.slotLabel} ${currentSlotNo} is available. Add items and create a new order.`;
  }

  stateFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentOrder) return;
    if (isLockedOrder(currentOrder)) {
      alert("Paid and closed order cannot be updated.");
      return;
    }
    try {
      await request(`${API.orders}/${encodeURIComponent(currentOrderId)}/details`, {
        method: "PATCH",
        body: JSON.stringify({
          orderChannel: modeCfg.channel,
          tableNo: currentOrder.table_no,
          orderType: "PICKUP",
          customerName: customerNameEl.value.trim() || String(currentOrder.customer_name || "").trim(),
          customerPhone:
            customerPhoneEl.value.trim() ||
            (currentOrder.customer_phone === "-" ? "" : String(currentOrder.customer_phone || "").trim()),
          customerAddress: `${modeCfg.slotLabel} ${currentOrder.table_no || ""}`.trim(),
          status: statusSelectEl.value,
          paymentStatus: paymentSelectEl.value
        })
      });
      await loadOrder();
      statusMessageEl.textContent = `Order ${currentOrderId} updated.`;
    } catch (error) {
      alert(error.message);
    }
  });

  createBtnEl.addEventListener("click", async () => {
    if (!currentSlotNo) return;
    if (currentOrder && !isLockedOrder(currentOrder)) {
      alert("Active order already exists for this slot.");
      return;
    }
    const qp = new URLSearchParams();
    qp.set(modeCfg.isPhone ? "slot" : "table", currentSlotNo);
    qp.set("back", modeCfg.listPage);
    qp.set("customerName", customerNameEl.value.trim());
    qp.set("customerPhone", customerPhoneEl.value.trim());
    if (modeCfg.isPhone) qp.set("mode", "phone");
    window.location.href = `dine-in-create.html?${qp.toString()}`;
  });

  if (goAddItemsBtnEl) {
    goAddItemsBtnEl.addEventListener("click", () => {
      if (!currentOrderId) return;
      if (currentOrder && isLockedOrder(currentOrder)) {
        alert("Paid and closed order cannot be updated.");
        return;
      }
      const qp = new URLSearchParams({
        id: currentOrderId,
        back: `dine-in-order.html?id=${encodeURIComponent(currentOrderId)}&back=${encodeURIComponent(modeCfg.listPage)}${modeCfg.isPhone ? "&mode=phone" : ""}`
      });
      qp.set(modeCfg.isPhone ? "slot" : "table", currentSlotNo || "");
      if (modeCfg.isPhone) qp.set("mode", "phone");
      window.location.href = `dine-in-add-items.html?${qp.toString()}`;
    });
  }

  requireRole("admin").then((me) => {
    if (!me) return;
    Promise.resolve()
      .then(async () => {
      if (currentOrderId) {
        await loadOrder();
        return;
      }
      if (!currentSlotNo) {
        throw new Error(`Invalid ${modeCfg.slotLabel.toLowerCase()}.`);
      }
      try {
        const order = await request(modeCfg.bySlotApi(currentSlotNo));
        currentOrderId = order.id;
        await loadOrder();
      } catch {
        renderEmptySlotState();
      }
      })
      .catch((error) => {
        statusMessageEl.textContent = error.message;
        if (stateFormEl) stateFormEl.classList.add("hidden");
        if (goAddItemsBtnEl) goAddItemsBtnEl.disabled = true;
        if (createBtnEl) createBtnEl.disabled = true;
      });
  });
}

function initDineInCreatePage() {
  const pageRoot = document.getElementById("dineInCreatePage");
  if (!pageRoot) return;
  const modeCfg = getServiceOrderMode();

  const params = new URLSearchParams(window.location.search);
  const rawSlot = params.get("slot") || params.get("table");
  const slotNo = modeCfg.normalizeSlot(rawSlot);
  const back = String(params.get("back") || modeCfg.listPage).trim() || modeCfg.listPage;
  const customerNameFromQuery = String(params.get("customerName") || "").trim();
  const customerPhoneFromQuery = String(params.get("customerPhone") || "").trim();

  const titleEl = document.getElementById("dineInCreateTitle");
  const closeBtn = document.getElementById("dineInCreateCloseBtn");
  const statusEl = document.getElementById("dineInCreateStatus");
  const categoriesEl = document.getElementById("dineInCreateCategories");
  const customerNameEl = document.getElementById("dineInCreateCustomerName");
  const customerPhoneEl = document.getElementById("dineInCreateCustomerPhone");
  const selectedEl = document.getElementById("dineInCreateSelectedItems");
  const selectedTotalEl = document.getElementById("dineInCreateSelectedTotal");
  const menuEl = document.getElementById("dineInCreateMenuGrid");
  const createBtn = document.getElementById("dineInCreateOrderBtn");

  closeBtn.href = back;

  if (!slotNo) {
    statusEl.textContent = modeCfg.isPhone ? "Invalid phone slot. Use P01 to P100." : "Invalid table. Use T01 to T100.";
    createBtn.disabled = true;
    return;
  }

  titleEl.textContent = `Create Order - ${modeCfg.slotLabel} ${slotNo}`;
  if (customerNameFromQuery) customerNameEl.value = customerNameFromQuery;
  if (customerPhoneFromQuery) customerPhoneEl.value = customerPhoneFromQuery;

  let products = [];
  const cart = new Map();
  let activeCategory = "ALL";

  function payloadItems() {
    return Array.from(cart.entries())
      .map(([id, qty]) => ({ id, qty }))
      .filter((row) => row.qty > 0);
  }

  function renderSelected() {
    const rows = payloadItems();
    if (!rows.length) {
      selectedEl.innerHTML = `<p>No items selected.</p>`;
      selectedTotalEl.textContent = money(0);
      return;
    }

    let subtotal = 0;
    selectedEl.innerHTML = rows
      .map((row) => {
        const product = products.find((p) => p.id === row.id);
        if (!product) return "";
        const lineTotal = Number(product.price || 0) * row.qty;
        subtotal += lineTotal;
        return `
          <div class="cart-item">
            <div>
              <strong>${product.name}</strong>
              <div class="small">${money(product.price)} x ${row.qty}</div>
            </div>
            <div class="qty">
              <button type="button" data-action="minus" data-id="${product.id}">-</button>
              <span>${row.qty}</span>
              <button type="button" data-action="plus" data-id="${product.id}">+</button>
            </div>
            <strong>${money(lineTotal)}</strong>
          </div>
        `;
      })
      .join("");

    selectedTotalEl.textContent = money(subtotal);

    selectedEl.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.id;
        const qty = Number(cart.get(id) || 0);
        const product = products.find((p) => p.id === id);
        if (!product) return;
        if (button.dataset.action === "plus" && qty < Number(product.stock || 0)) {
          cart.set(id, qty + 1);
        }
        if (button.dataset.action === "minus") {
          if (qty <= 1) cart.delete(id);
          else cart.set(id, qty - 1);
        }
        renderSelected();
      });
    });
  }

  function renderCategoryFilters(categories) {
    if (!categoriesEl) return;
    const all = ["ALL", ...categories];
    categoriesEl.innerHTML = all
      .map(
        (name) =>
          `<button type="button" class="pill ${activeCategory === name ? "active" : ""}" data-category="${name}">${
            name === "ALL" ? "All" : name
          }</button>`
      )
      .join("");

    categoriesEl.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        activeCategory = button.dataset.category;
        renderMenu();
      });
    });
  }

  function renderMenu() {
    const available = products.filter((product) => product.active && product.stock > 0);
    if (!available.length) {
      menuEl.innerHTML = `<p>No products available.</p>`;
      return;
    }

    const grouped = available.reduce((acc, product) => {
      const key = String(product.category || "Other").trim() || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(product);
      return acc;
    }, {});
    const categories = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
    if (activeCategory !== "ALL" && !categories.includes(activeCategory)) {
      activeCategory = "ALL";
    }
    renderCategoryFilters(categories);

    const visible = activeCategory === "ALL" ? available : grouped[activeCategory] || [];
    menuEl.innerHTML = visible
      .map(
        (product) => `
          <article class="product">
            <img src="${product.image || "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=800&q=80"}" alt="${product.name}" />
            <h3>${product.name}</h3>
            <p>${product.description}</p>
            <div class="meta"><strong>${money(product.price)}</strong></div>
            <button class="btn btn-sm dinein-create-add-btn" data-id="${product.id}" type="button">Add</button>
          </article>
        `
      )
      .join("");

    menuEl.querySelectorAll(".dinein-create-add-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.id;
        const product = products.find((p) => p.id === id);
        if (!product) return;
        const qty = Number(cart.get(id) || 0);
        if (qty >= Number(product.stock || 0)) return;
        cart.set(id, qty + 1);
        renderSelected();
      });
    });
  }

  async function loadContext() {
    products = await request(`${API.products}?activeOnly=1`);
    renderMenu();
    renderSelected();

    try {
      const existing = await request(modeCfg.bySlotApi(slotNo));
      if (existing && !isLockedOrder(existing)) {
        statusEl.textContent = `Active order ${existing.id} already exists for ${slotNo}.`;
        const qp = new URLSearchParams({
          id: existing.id,
          back
        });
        if (modeCfg.isPhone) qp.set("mode", "phone");
        window.location.href = `dine-in-order.html?${qp.toString()}`;
      }
    } catch {
      statusEl.textContent = "";
    }
  }

  createBtn.addEventListener("click", async () => {
    const items = payloadItems();
    if (!items.length) {
      alert("Add at least one item to create order.");
      return;
    }
    try {
      const result = await request(modeCfg.createApi, {
        method: "POST",
        body: JSON.stringify({
          tableNo: slotNo,
          customerName: customerNameEl.value.trim(),
          customerPhone: customerPhoneEl.value.trim(),
          cartItems: items
        })
      });
      const newOrderId = result.order?.id;
      if (!newOrderId) throw new Error("Order created but missing order ID.");
      const qp = new URLSearchParams({
        id: newOrderId,
        back
      });
      if (modeCfg.isPhone) qp.set("mode", "phone");
      window.location.href = `dine-in-order.html?${qp.toString()}`;
    } catch (error) {
      alert(error.message);
    }
  });

  requireRole("admin").then((me) => {
    if (!me) return;
    loadContext().catch((error) => {
      statusEl.textContent = error.message;
      createBtn.disabled = true;
    });
  });
}

function initDineInAddItemsPage() {
  const pageRoot = document.getElementById("dineInAddItemsPage");
  if (!pageRoot) return;
  const modeCfg = getServiceOrderMode();

  const params = new URLSearchParams(window.location.search);
  const orderId = String(params.get("id") || "").trim();
  const rawSlot = params.get("slot") || params.get("table");
  const slotNo = modeCfg.normalizeSlot(rawSlot);
  const back = String(params.get("back") || modeCfg.listPage).trim() || modeCfg.listPage;

  const titleEl = document.getElementById("dineInAddItemsTitle");
  const closeBtn = document.getElementById("dineInAddItemsCloseBtn");
  const statusEl = document.getElementById("dineInAddItemsStatus");
  const categoriesEl = document.getElementById("dineInAddItemsCategories");
  const selectedEl = document.getElementById("dineInAddItemsSelectedItems");
  const selectedTotalEl = document.getElementById("dineInAddItemsSelectedTotal");
  const menuEl = document.getElementById("dineInAddItemsMenuGrid");
  const addBtn = document.getElementById("dineInAddItemsSubmitBtn");

  closeBtn.href = back;

  if (!orderId) {
    statusEl.textContent = "Order ID is missing.";
    addBtn.disabled = true;
    return;
  }
  titleEl.textContent = `Add Items - ${slotNo ? `${slotNo} | ` : ""}${orderId}`;

  let order = null;
  let products = [];
  const cart = new Map();
  let activeCategory = "ALL";

  function payloadItems() {
    return Array.from(cart.entries())
      .map(([id, qty]) => ({ id, qty }))
      .filter((row) => row.qty > 0);
  }

  function renderSelected() {
    const rows = payloadItems();
    if (!rows.length) {
      selectedEl.innerHTML = `<p>No items selected.</p>`;
      selectedTotalEl.textContent = money(0);
      return;
    }

    let subtotal = 0;
    selectedEl.innerHTML = rows
      .map((row) => {
        const product = products.find((p) => p.id === row.id);
        if (!product) return "";
        const lineTotal = Number(product.price || 0) * row.qty;
        subtotal += lineTotal;
        return `
          <div class="cart-item">
            <div>
              <strong>${product.name}</strong>
              <div class="small">${money(product.price)} x ${row.qty}</div>
            </div>
            <div class="qty">
              <button type="button" data-action="minus" data-id="${product.id}">-</button>
              <span>${row.qty}</span>
              <button type="button" data-action="plus" data-id="${product.id}">+</button>
            </div>
            <strong>${money(lineTotal)}</strong>
          </div>
        `;
      })
      .join("");

    selectedTotalEl.textContent = money(subtotal);

    selectedEl.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.id;
        const qty = Number(cart.get(id) || 0);
        const product = products.find((p) => p.id === id);
        if (!product) return;
        if (button.dataset.action === "plus" && qty < Number(product.stock || 0)) {
          cart.set(id, qty + 1);
        }
        if (button.dataset.action === "minus") {
          if (qty <= 1) cart.delete(id);
          else cart.set(id, qty - 1);
        }
        renderSelected();
      });
    });
  }

  function renderCategoryFilters(categories) {
    if (!categoriesEl) return;
    const all = ["ALL", ...categories];
    categoriesEl.innerHTML = all
      .map(
        (name) =>
          `<button type="button" class="pill ${activeCategory === name ? "active" : ""}" data-category="${name}">${
            name === "ALL" ? "All" : name
          }</button>`
      )
      .join("");

    categoriesEl.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        activeCategory = button.dataset.category;
        renderMenuByCategory();
      });
    });
  }

  function renderMenuByCategory() {
    const available = products.filter((product) => product.active && product.stock > 0);
    if (!available.length) {
      menuEl.innerHTML = `<p>No products available.</p>`;
      return;
    }
    const grouped = available.reduce((acc, product) => {
      const key = String(product.category || "Other").trim() || "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(product);
      return acc;
    }, {});
    const categories = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
    if (activeCategory !== "ALL" && !categories.includes(activeCategory)) {
      activeCategory = "ALL";
    }
    renderCategoryFilters(categories);

    const visible = activeCategory === "ALL" ? available : grouped[activeCategory] || [];
    menuEl.innerHTML = visible
      .map(
        (product) => `
          <article class="product">
            <img src="${product.image || "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=800&q=80"}" alt="${product.name}" />
            <h3>${product.name}</h3>
            <p>${product.description}</p>
            <div class="meta"><strong>${money(product.price)}</strong></div>
            <button class="btn btn-sm dinein-add-items-btn" data-id="${product.id}" type="button">Add</button>
          </article>
        `
      )
      .join("");

    menuEl.querySelectorAll(".dinein-add-items-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.id;
        const product = products.find((p) => p.id === id);
        if (!product) return;
        const qty = Number(cart.get(id) || 0);
        if (qty >= Number(product.stock || 0)) return;
        cart.set(id, qty + 1);
        renderSelected();
      });
    });
  }

  async function loadContext() {
    const [fetchedOrder, fetchedProducts] = await Promise.all([request(API.orderById(orderId)), request(`${API.products}?activeOnly=1`)]);
    if (String(fetchedOrder.order_channel || "").toUpperCase() !== modeCfg.channel) {
      throw new Error(`This is not a ${modeCfg.isPhone ? "phone" : "dine-in"} order.`);
    }
    if (isLockedOrder(fetchedOrder)) {
      throw new Error("Paid and closed order cannot be updated.");
    }
    order = fetchedOrder;
    products = fetchedProducts;
    renderMenuByCategory();
    renderSelected();
  }

  addBtn.addEventListener("click", async () => {
    const items = payloadItems();
    if (!items.length) {
      alert("Select at least one item.");
      return;
    }
    try {
      await request(modeCfg.addItemsApi(orderId), {
        method: "POST",
        body: JSON.stringify({ cartItems: items })
      });
      window.location.href = back;
    } catch (error) {
      alert(error.message);
    }
  });

  requireRole("admin").then((me) => {
    if (!me) return;
    loadContext().catch((error) => {
      statusEl.textContent = error.message;
      addBtn.disabled = true;
    });
  });
}

function initInventoryFormPage() {
  const form = document.getElementById("inventoryForm");
  if (!form) return;

  const title = document.getElementById("inventoryFormTitle");
  const submitBtn = document.getElementById("inventorySubmitBtn");
  const fields = {
    productId: document.getElementById("inventoryProductId"),
    name: document.getElementById("inventoryName"),
    category: document.getElementById("inventoryCategory"),
    sku: document.getElementById("inventorySku"),
    price: document.getElementById("inventoryPrice"),
    stock: document.getElementById("inventoryStock"),
    image: document.getElementById("inventoryImage"),
    description: document.getElementById("inventoryDescription"),
    active: document.getElementById("inventoryActive")
  };

  const params = new URLSearchParams(window.location.search);
  const editId = params.get("id");

  async function populateIfEditing() {
    if (!editId) return;
    const products = await request(API.products);
    const product = products.find((item) => item.id === editId);
    if (!product) {
      alert("Product not found.");
      window.location.href = "inventory.html";
      return;
    }

    fields.productId.value = product.id;
    fields.name.value = product.name;
    fields.category.value = product.category;
    fields.sku.value = product.sku;
    fields.price.value = product.price;
    fields.stock.value = product.stock;
    fields.image.value = product.image || "";
    fields.description.value = product.description;
    fields.active.checked = Boolean(product.active);
    title.textContent = "Update Inventory";
    submitBtn.textContent = "Update Inventory";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      name: fields.name.value.trim(),
      category: fields.category.value.trim(),
      sku: fields.sku.value.trim(),
      price: Number(fields.price.value),
      stock: Number(fields.stock.value),
      image: fields.image.value.trim(),
      description: fields.description.value.trim(),
      active: fields.active.checked
    };

    try {
      if (editId) {
        await request(`${API.products}/${editId}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await request(API.products, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      window.location.href = "inventory.html";
    } catch (error) {
      alert(error.message);
    }
  });

  populateIfEditing().catch((error) => {
    alert(error.message);
  });

  requireRole("admin").then(() => {});
}

function initCreateAdminPage() {
  const form = document.getElementById("createAdminForm");
  if (!form) return;

  const firstNameEl = document.getElementById("createAdminFirstName");
  const lastNameEl = document.getElementById("createAdminLastName");
  const emailEl = document.getElementById("createAdminEmail");
  const phoneEl = document.getElementById("createAdminPhone");
  const passwordEl = document.getElementById("createAdminPassword");
  const resultCard = document.getElementById("createAdminResult");
  const resultBody = document.getElementById("createAdminResultBody");
  const resultMessage = document.getElementById("createAdminStatusMessage");
  const searchQueryEl = document.getElementById("adminSearchQuery");
  const searchBtn = document.getElementById("adminSearchBtn");
  const searchResultsBodyEl = document.getElementById("adminSearchResultsBody");

  let allAdmins = [];

  function renderAdminSearchRows(rows) {
    if (!searchResultsBodyEl) return;
    if (!rows.length) {
      searchResultsBodyEl.innerHTML = `<tr><td colspan="6">No admins found.</td></tr>`;
      return;
    }
    searchResultsBodyEl.innerHTML = rows
      .map(
        (admin) => `
          <tr class="clickable-row" data-id="${admin.id}">
            <td>${admin.id}</td>
            <td>${admin.firstName} ${admin.lastName}</td>
            <td>${admin.email}</td>
            <td>${admin.phone || "-"}</td>
            <td>${formatDateTime(admin.createdAt)}</td>
            <td>
              <button class="btn btn-sm edit-admin-btn" type="button" data-id="${admin.id}">Open</button>
              <button class="btn btn-outline btn-sm delete-admin-btn" type="button" data-id="${admin.id}">Delete</button>
            </td>
          </tr>
        `
      )
      .join("");

    searchResultsBodyEl.querySelectorAll(".edit-admin-btn").forEach((button) => {
      button.addEventListener("click", () => {
        window.location.href = `create-admin-edit.html?id=${encodeURIComponent(button.dataset.id)}`;
      });
    });
    searchResultsBodyEl.querySelectorAll(".clickable-row").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        const id = row.dataset.id;
        window.location.href = `create-admin-edit.html?id=${encodeURIComponent(id)}`;
      });
    });
    searchResultsBodyEl.querySelectorAll(".delete-admin-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.dataset.id;
        const ok = window.confirm("Delete this admin?");
        if (!ok) return;
        try {
          await request(API.adminUserById(id), { method: "DELETE" });
          await fetchAdmins();
          runSearch();
        } catch (error) {
          alert(error.message);
        }
      });
    });
  }

  function runSearch() {
    const query = String(searchQueryEl?.value || "").trim().toLowerCase();
    const rows = allAdmins.filter((admin) =>
      [admin.firstName, admin.lastName, admin.email, admin.phone].join(" ").toLowerCase().includes(query)
    );
    renderAdminSearchRows(rows);
  }

  async function fetchAdmins() {
    allAdmins = await request(API.adminUsers);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = {
        firstName: firstNameEl.value.trim(),
        lastName: lastNameEl.value.trim(),
        email: emailEl.value.trim(),
        phone: phoneEl.value.trim(),
        password: passwordEl.value.trim()
      };
      const response = await request(API.createAdminUser, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      const creds = response.credentials || {};
      resultMessage.textContent = response.emailSent
        ? "Admin created and credentials email sent."
        : "Admin created. Email not sent; share credentials manually.";
      resultBody.innerHTML = `
        <p><strong>Name:</strong> ${creds.firstName || ""} ${creds.lastName || ""}</p>
        <p><strong>Email:</strong> ${creds.email || ""}</p>
        <p><strong>Phone:</strong> ${creds.phone || "-"}</p>
        <p><strong>Temporary Password:</strong> ${creds.password || ""}</p>
      `;
      resultCard.classList.remove("hidden");
      form.reset();
      await fetchAdmins();
      runSearch();
    } catch (error) {
      alert(error.message);
    }
  });

  if (searchBtn) {
    searchBtn.addEventListener("click", runSearch);
  }
  if (searchQueryEl) {
    searchQueryEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch();
      }
    });
  }

  requireRole("admin").then((me) => {
    if (!me) return;
    fetchAdmins()
      .then(() => runSearch())
      .catch((error) => {
        if (searchResultsBodyEl) searchResultsBodyEl.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
      });
  });
}

function initCreateAdminEditPage() {
  const pageRoot = document.getElementById("createAdminEditPage");
  if (!pageRoot) return;

  const params = new URLSearchParams(window.location.search);
  const id = String(params.get("id") || "").trim();
  const form = document.getElementById("updateAdminForm");
  const idEl = document.getElementById("updateAdminId");
  const firstNameEl = document.getElementById("updateAdminFirstName");
  const lastNameEl = document.getElementById("updateAdminLastName");
  const emailEl = document.getElementById("updateAdminEmail");
  const phoneEl = document.getElementById("updateAdminPhone");
  const passwordEl = document.getElementById("updateAdminPassword");
  const resetPasswordEl = document.getElementById("updateAdminResetPassword");
  const resultCard = document.getElementById("updateAdminResult");
  const resultMessage = document.getElementById("updateAdminStatusMessage");
  const resultBody = document.getElementById("updateAdminResultBody");

  if (!id) {
    resultCard.classList.remove("hidden");
    resultMessage.textContent = "Admin ID is missing.";
    return;
  }

  async function loadAdmin() {
    const admin = await request(API.adminUserById(id));
    idEl.value = admin.id;
    firstNameEl.value = admin.firstName || "";
    lastNameEl.value = admin.lastName || "";
    emailEl.value = admin.email || "";
    phoneEl.value = admin.phone || "";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const payload = {
        firstName: firstNameEl.value.trim(),
        lastName: lastNameEl.value.trim(),
        email: emailEl.value.trim(),
        phone: phoneEl.value.trim(),
        password: passwordEl.value.trim(),
        resetPassword: resetPasswordEl.checked
      };
      const response = await request(API.adminUserById(id), {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      const admin = response.admin || {};
      resultMessage.textContent = "Admin updated successfully.";
      resultBody.innerHTML = `
        <p><strong>Name:</strong> ${admin.firstName || ""} ${admin.lastName || ""}</p>
        <p><strong>Email:</strong> ${admin.email || ""}</p>
        <p><strong>Phone:</strong> ${admin.phone || "-"}</p>
        <p><strong>Updated Password:</strong> ${response.updatedPassword || "Not changed"}</p>
      `;
      resultCard.classList.remove("hidden");
      passwordEl.value = "";
      resetPasswordEl.checked = false;
      await loadAdmin();
    } catch (error) {
      alert(error.message);
    }
  });

  requireRole("admin").then((me) => {
    if (!me) return;
    loadAdmin().catch((error) => {
      resultCard.classList.remove("hidden");
      resultMessage.textContent = error.message;
      form.classList.add("hidden");
    });
  });
}

function initReportsPage() {
  const pageRoot = document.getElementById("reportsPage");
  if (!pageRoot) return;

  const typeEl = document.getElementById("reportType");
  const searchEl = document.getElementById("reportSearch");
  const fromEl = document.getElementById("reportDateFrom");
  const toEl = document.getElementById("reportDateTo");
  const statusEl = document.getElementById("reportStatus");
  const channelEl = document.getElementById("reportChannel");
  const categoryEl = document.getElementById("reportCategory");
  const lowStockEl = document.getElementById("reportLowStock");
  const statusWrapEl = document.getElementById("reportStatusWrap");
  const channelWrapEl = document.getElementById("reportChannelWrap");
  const categoryWrapEl = document.getElementById("reportCategoryWrap");
  const lowStockWrapEl = document.getElementById("reportLowStockWrap");
  const generateBtn = document.getElementById("generateReportBtn");
  const exportCsvBtn = document.getElementById("exportReportCsvBtn");
  const exportPdfBtn = document.getElementById("exportReportPdfBtn");
  const reportStatusTextEl = document.getElementById("reportStatusText");
  const tableHeadEl = document.getElementById("reportTableHead");
  const tableBodyEl = document.getElementById("reportTableBody");
  const paginationEl = document.getElementById("reportsPagination");

  let reportPage = 1;
  let categories = [];
  let currentReport = { title: "Report", columns: [], rows: [] };

  function initCategoryOptions() {
    categoryEl.innerHTML = `<option value="ALL">All</option>${categories
      .map((c) => `<option value="${c}">${c}</option>`)
      .join("")}`;
  }

  function updateFilterVisibility() {
    const type = typeEl.value;
    const isOrders = type === "ORDERS";
    const usesCategory = ["INVENTORY", "LOW_STOCK", "CATEGORY_REVENUE"].includes(type);
    statusWrapEl.classList.toggle("hidden", !isOrders);
    channelWrapEl.classList.toggle("hidden", !isOrders);
    categoryWrapEl.classList.toggle("hidden", !usesCategory);
    lowStockWrapEl.classList.toggle("hidden", type !== "LOW_STOCK");
  }

  function inDateRange(value) {
    if (!value) return true;
    const from = fromEl.value ? new Date(`${fromEl.value}T00:00:00`).getTime() : null;
    const to = toEl.value ? new Date(`${toEl.value}T23:59:59`).getTime() : null;
    const current = new Date(`${value}Z`).getTime();
    if (from && current < from) return false;
    if (to && current > to) return false;
    return true;
  }

  function renderReport() {
    const paged = paginateRows(currentReport.rows, reportPage);
    reportPage = paged.page;
    tableHeadEl.innerHTML = `<tr>${currentReport.columns.map((col) => `<th>${col}</th>`).join("")}</tr>`;
    if (!currentReport.rows.length) {
      tableBodyEl.innerHTML = `<tr><td colspan="${Math.max(1, currentReport.columns.length)}">No results.</td></tr>`;
      paginationEl.innerHTML = "";
      reportStatusTextEl.textContent = "No report data found.";
      return;
    }
    tableBodyEl.innerHTML = paged.items
      .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
      .join("");
    reportStatusTextEl.textContent = `Showing ${paged.items.length} of ${paged.totalItems} rows.`;
    renderPagination(paginationEl, paged.page, paged.totalPages, (nextPage) => {
      reportPage = nextPage;
      renderReport();
    });
  }

  function exportCsv() {
    if (!currentReport.rows.length) {
      alert("No report data to export.");
      return;
    }
    const lines = [
      currentReport.columns.map(csvCell).join(","),
      ...currentReport.rows.map((row) => row.map(csvCell).join(","))
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentReport.title.replace(/\s+/g, "_").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    if (!currentReport.rows.length) {
      alert("No report data to export.");
      return;
    }
    const hasJsPdf = Boolean(window.jspdf?.jsPDF);
    if (!hasJsPdf) {
      const html = `
        <html><head><title>${currentReport.title}</title></head><body>
        <h1>${currentReport.title}</h1>
        <table border="1" cellspacing="0" cellpadding="5">
          <thead><tr>${currentReport.columns.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
          <tbody>${currentReport.rows
            .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
            .join("")}</tbody>
        </table>
        </body></html>
      `;
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(html);
      win.document.close();
      win.print();
      return;
    }
    const doc = new window.jspdf.jsPDF("l", "pt", "a4");
    doc.text(currentReport.title, 40, 30);
    doc.autoTable({
      startY: 45,
      head: [currentReport.columns],
      body: currentReport.rows
    });
    doc.save(`${currentReport.title.replace(/\s+/g, "_").toLowerCase()}.pdf`);
  }

  async function generateReport() {
    const type = typeEl.value;
    const search = String(searchEl.value || "").toLowerCase();
    const category = categoryEl.value;

    if (type === "ORDERS") {
      const orders = await request(API.orders);
      const rows = orders
        .filter((order) => (statusEl.value === "ALL" ? true : order.status === statusEl.value))
        .filter((order) => (channelEl.value === "ALL" ? true : order.order_channel === channelEl.value))
        .filter((order) => inDateRange(order.created_at))
        .filter((order) =>
          [order.id, order.customer_name, order.customer_phone, order.status, order.payment_status]
            .join(" ")
            .toLowerCase()
            .includes(search)
        )
        .map((order) => [
          order.id,
          formatDateTime(order.created_at),
          formatOrderSource(order),
          order.customer_name,
          order.customer_phone,
          order.status,
          order.payment_status,
          money(order.total)
        ]);
      currentReport = {
        title: "Orders Report",
        columns: ["Order ID", "Date", "Source", "Customer", "Phone", "Status", "Payment", "Total"],
        rows
      };
    }

    if (type === "INVENTORY" || type === "LOW_STOCK") {
      const products = await request(API.products);
      const threshold = Math.max(0, Number(lowStockEl.value || 10));
      let filtered = products.filter((p) =>
        [p.name, p.category, p.sku, String(p.stock)].join(" ").toLowerCase().includes(search)
      );
      if (category !== "ALL") filtered = filtered.filter((p) => p.category === category);
      if (type === "LOW_STOCK") filtered = filtered.filter((p) => Number(p.stock || 0) <= threshold);
      const rows = filtered.map((p) => [
        p.name,
        p.category,
        p.sku,
        money(p.price),
        String(p.stock),
        p.active ? "Active" : "Hidden"
      ]);
      currentReport = {
        title: type === "LOW_STOCK" ? "Low Stock Report" : "Inventory Report",
        columns: ["Name", "Category", "SKU", "Price", "Stock", "Status"],
        rows
      };
    }

    if (type === "CUSTOMERS") {
      const customers = await request(API.customers);
      const rows = customers
        .filter((c) => inDateRange(c.registered_at))
        .filter((c) =>
          [c.id, c.first_name, c.last_name, c.phone, c.status].join(" ").toLowerCase().includes(search)
        )
        .map((c) => [
          c.id,
          c.first_name,
          c.last_name,
          c.phone,
          formatDateTime(c.registered_at),
          String(c.total_orders),
          money(c.total_spent),
          c.status
        ]);
      currentReport = {
        title: "Customers Report",
        columns: ["Customer ID", "First Name", "Last Name", "Phone", "Registered", "Orders", "Spent", "Status"],
        rows
      };
    }

    if (type === "ADMINS") {
      const admins = await request(API.adminUsers);
      const rows = admins
        .filter((a) => inDateRange(a.createdAt))
        .filter((a) =>
          [a.id, a.firstName, a.lastName, a.email, a.emailVerified ? "Verified" : "Not Verified"]
            .join(" ")
            .toLowerCase()
            .includes(search)
        )
        .map((a) => [
          a.id,
          a.firstName,
          a.lastName,
          a.email,
          a.emailVerified ? "Verified" : "Not Verified",
          formatDateTime(a.createdAt)
        ]);
      currentReport = {
        title: "Admins Report",
        columns: ["Admin ID", "First Name", "Last Name", "Email", "Email Status", "Created"],
        rows
      };
    }

    if (type === "CATEGORY_REVENUE") {
      const dashboard = await request(API.dashboard);
      let rows = dashboard.categoryPerformance || [];
      if (category !== "ALL") rows = rows.filter((r) => r.category === category);
      rows = rows
        .filter((r) => [r.category, String(r.qty), String(r.revenue)].join(" ").toLowerCase().includes(search))
        .map((r) => [r.category, String(r.qty), money(r.revenue)]);
      currentReport = {
        title: "Revenue By Category",
        columns: ["Category", "Units Sold", "Revenue"],
        rows
      };
    }

    if (type === "PAYMENT_METHOD") {
      const orders = await request(API.orders);
      const grouped = new Map();

      orders
        .filter((order) => inDateRange(order.created_at))
        .filter((order) =>
          [order.id, order.payment_mode, order.payment_status, order.customer_name, order.customer_phone]
            .join(" ")
            .toLowerCase()
            .includes(search)
        )
        .forEach((order) => {
          const key = String(order.payment_mode || "UNKNOWN").toUpperCase();
          if (!grouped.has(key)) {
            grouped.set(key, {
              paymentMode: key,
              orders: 0,
              paidOrders: 0,
              paidRevenue: 0
            });
          }
          const row = grouped.get(key);
          row.orders += 1;
          if (String(order.payment_status || "").toUpperCase() === "PAID") {
            row.paidOrders += 1;
            row.paidRevenue += Number(order.total || 0);
          }
        });

      const rows = Array.from(grouped.values())
        .sort((a, b) => b.paidRevenue - a.paidRevenue || b.orders - a.orders || a.paymentMode.localeCompare(b.paymentMode))
        .map((r) => [r.paymentMode, String(r.orders), String(r.paidOrders), money(r.paidRevenue)]);

      currentReport = {
        title: "Payment By Method",
        columns: ["Payment Method", "Total Orders", "Paid Orders", "Collected Revenue"],
        rows
      };
    }

    currentReport.rows = currentReport.rows.slice(0, PAGE_SIZE * MAX_PAGES);

    reportPage = 1;
    renderReport();
  }

  generateBtn.addEventListener("click", () => {
    generateReport().catch((error) => {
      reportStatusTextEl.textContent = error.message;
      tableHeadEl.innerHTML = "";
      tableBodyEl.innerHTML = `<tr><td>${error.message}</td></tr>`;
    });
  });
  exportCsvBtn.addEventListener("click", exportCsv);
  exportPdfBtn.addEventListener("click", exportPdf);
  typeEl.addEventListener("change", updateFilterVisibility);

  requireRole("admin").then(async (me) => {
    if (!me) return;
    const products = await request(API.products).catch(() => []);
    categories = Array.from(new Set(products.map((p) => String(p.category || "").trim()).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
    initCategoryOptions();
    updateFilterVisibility();
    await generateReport();
  });
}

function initAdminDashboardPage() {
  const weekOrders = document.getElementById("weekOrders");
  if (!weekOrders) return;

  const weekRevenue = document.getElementById("weekRevenue");
  const monthOrders = document.getElementById("monthOrders");
  const monthRevenue = document.getElementById("monthRevenue");
  const yearOrders = document.getElementById("yearOrders");
  const yearRevenue = document.getElementById("yearRevenue");
  const inceptionOrders = document.getElementById("inceptionOrders");
  const inceptionRevenue = document.getElementById("inceptionRevenue");
  const customersCountBtn = document.getElementById("customersCountBtn");
  const categoryBody = document.getElementById("dashboardCategoryBody");
  if (!customersCountBtn) return;
  const ordersRevenueChartEl = document.getElementById("ordersRevenueChart");
  const customerMixChartEl = document.getElementById("customerMixChart");
  let ordersRevenueChart;
  let customerMixChart;

  function drawCharts(data) {
    if (!window.Chart || !ordersRevenueChartEl || !customerMixChartEl) return;

    ordersRevenueChart?.destroy();
    customerMixChart?.destroy();

    ordersRevenueChart = new window.Chart(ordersRevenueChartEl, {
      type: "bar",
      data: {
        labels: ["Week", "Month", "Year"],
        datasets: [
          {
            label: "Orders",
            data: [data.byPeriod.week.orders, data.byPeriod.month.orders, data.byPeriod.year.orders],
            backgroundColor: "#c84b31"
          },
          {
            label: "Revenue (INR)",
            data: [data.byPeriod.week.revenue, data.byPeriod.month.revenue, data.byPeriod.year.revenue],
            backgroundColor: "#e08f54"
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "top" } }
      }
    });

    customerMixChart = new window.Chart(customerMixChartEl, {
      type: "doughnut",
      data: {
        labels: ["Registered", "Guest"],
        datasets: [
          {
            data: [data.customerMix?.registered || 0, data.customerMix?.guest || 0],
            backgroundColor: ["#2f8f4e", "#d8a03f"]
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom" } }
      }
    });
  }

  requireRole("admin").then((me) => {
    if (!me) return;
    request(API.dashboard)
      .then((data) => {
      weekOrders.textContent = String(data.byPeriod.week.orders || 0);
      weekRevenue.textContent = money(data.byPeriod.week.revenue || 0);
      monthOrders.textContent = String(data.byPeriod.month.orders || 0);
      monthRevenue.textContent = money(data.byPeriod.month.revenue || 0);
      yearOrders.textContent = String(data.byPeriod.year.orders || 0);
      yearRevenue.textContent = money(data.byPeriod.year.revenue || 0);
      inceptionOrders.textContent = String(data.inception.orders || 0);
      inceptionRevenue.textContent = money(data.inception.revenue || 0);
      customersCountBtn.textContent = String(data.inception.customers || 0);

      if (!data.categoryPerformance.length) {
        categoryBody.innerHTML = `<tr><td colspan="3">No paid orders yet.</td></tr>`;
        return;
      }

      categoryBody.innerHTML = data.categoryPerformance
        .map(
          (row) => `
            <tr>
              <td>${row.category}</td>
              <td>${row.qty}</td>
              <td>${money(row.revenue)}</td>
            </tr>
          `
        )
        .join("");
        drawCharts(data);
      })
      .catch((error) => {
        categoryBody.innerHTML = `<tr><td colspan="3">${error.message}</td></tr>`;
      });
  });

  customersCountBtn.addEventListener("click", () => {
    window.open("customers.html?from=dashboard", "_blank");
  });
}

function initCustomersPage() {
  const customersTableBody = document.getElementById("customersPageTableBody");
  if (!customersTableBody) return;
  const customersPaginationEl = document.getElementById("customersPagination");
  const closeCustomersPageBtn = document.getElementById("closeCustomersPageBtn");
  const customersBackLink = document.getElementById("customersBackLink");
  const customersSearchInput = document.getElementById("customersSearchInput");
  const customerEditSection = document.getElementById("customerEditSection");
  const customerEditForm = document.getElementById("customerEditForm");
  const cancelCustomerEditBtn = document.getElementById("cancelCustomerEditBtn");
  const editCustomerId = document.getElementById("editCustomerId");
  const editCustomerFirstName = document.getElementById("editCustomerFirstName");
  const editCustomerLastName = document.getElementById("editCustomerLastName");
  const editCustomerPhone = document.getElementById("editCustomerPhone");

  let allCustomers = [];
  let customerQuery = "";
  let customersPage = 1;
  const params = new URLSearchParams(window.location.search);
  const fromDashboard = params.get("from") === "dashboard";

  if (fromDashboard && closeCustomersPageBtn && customersBackLink) {
    closeCustomersPageBtn.classList.remove("hidden");
    customersBackLink.setAttribute("href", "dashboard.html");
    closeCustomersPageBtn.addEventListener("click", () => {
      window.close();
      window.location.href = "dashboard.html";
    });
  }

  function renderCustomersTable() {
    const normalized = customerQuery.toLowerCase();
    const filteredRows = allCustomers.filter((customer) => {
      if (!normalized) return true;
      return [customer.id, customer.name, customer.phone, customer.status]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
    const paged = paginateRows(filteredRows, customersPage);
    customersPage = paged.page;

    if (!filteredRows.length) {
      customersTableBody.innerHTML = `<tr><td colspan="9">No customers found.</td></tr>`;
      if (customersPaginationEl) customersPaginationEl.innerHTML = "";
      return;
    }

    customersTableBody.innerHTML = paged.items
      .map(
        (customer) => `
          <tr>
            <td>${customer.id}</td>
            <td>${customer.first_name}</td>
            <td>${customer.last_name}</td>
            <td>${customer.phone}</td>
            <td>${formatDateTime(customer.registered_at)}</td>
            <td>${customer.total_orders}</td>
            <td>${money(customer.total_spent)}</td>
            <td>${customer.status}</td>
            <td><button class="btn btn-sm edit-customer-btn" data-id="${customer.id}" type="button">Update</button></td>
          </tr>
        `
      )
      .join("");

    customersTableBody.querySelectorAll(".edit-customer-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const customer = allCustomers.find((row) => row.id === button.dataset.id);
        if (!customer) return;
        editCustomerId.value = customer.id;
        editCustomerFirstName.value = customer.first_name || "";
        editCustomerLastName.value = customer.last_name || "";
        editCustomerPhone.value = customer.phone;
        customerEditSection.classList.remove("hidden");
        customerEditSection.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    renderPagination(customersPaginationEl, paged.page, paged.totalPages, (nextPage) => {
      customersPage = nextPage;
      renderCustomersTable();
    });
  }

  async function loadCustomers() {
    allCustomers = await request(API.customers);
    renderCustomersTable();
  }

  if (customersSearchInput) {
    customersSearchInput.addEventListener("input", () => {
      customerQuery = customersSearchInput.value.trim();
      customersPage = 1;
      renderCustomersTable();
    });
  }

  if (customerEditForm) {
    customerEditForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await request(`${API.customers}/${editCustomerId.value}`, {
          method: "PATCH",
          body: JSON.stringify({
            firstName: editCustomerFirstName.value.trim(),
            lastName: editCustomerLastName.value.trim(),
            phone: editCustomerPhone.value.trim()
          })
        });
        customerEditSection.classList.add("hidden");
        await loadCustomers();
        alert("Customer details updated.");
      } catch (error) {
        alert(error.message);
      }
    });
  }

  if (cancelCustomerEditBtn) {
    cancelCustomerEditBtn.addEventListener("click", () => {
      customerEditSection.classList.add("hidden");
    });
  }

  requireRole("admin").then((me) => {
    if (!me) return;
    loadCustomers().catch((error) => {
      customersTableBody.innerHTML = `<tr><td colspan="9">${error.message}</td></tr>`;
    });
  });
}

function initProfilePage() {
  const profileForm = document.getElementById("profileForm");
  if (!profileForm) return;

  const firstNameEl = document.getElementById("profileFirstName");
  const lastNameEl = document.getElementById("profileLastName");
  const phoneEl = document.getElementById("profilePhone");
  const countryEl = document.getElementById("profileCountry");
  const stateEl = document.getElementById("profileState");
  const addressEl = document.getElementById("profileAddress");
  const themeModeEl = document.getElementById("profileThemeMode");
  const ordersBody = document.getElementById("myOrdersTableBody");

  if (countryEl && stateEl) {
    populateStateOptions(countryEl, stateEl);
    countryEl.addEventListener("change", () => {
      populateStateOptions(countryEl, stateEl);
      applyCurrencyForCountry(countryEl.value, getSavedCurrency());
    });
  }

  requireRole("customer").then(async (me) => {
    if (!me) return;
    applyCurrencyForCountry(me.customer?.country || "", getSavedCurrency());
    firstNameEl.value = me.customer?.firstName || "";
    lastNameEl.value = me.customer?.lastName || "";
    phoneEl.value = me.customer?.phone || "";
    if (countryEl && stateEl) {
      countryEl.value = normalizeCountry(me.customer?.country || "");
      populateStateOptions(countryEl, stateEl, me.customer?.state || "");
    }
    addressEl.value = me.customer?.address || "";
    if (themeModeEl) themeModeEl.value = getSavedThemeMode();

    const myOrders = await request(API.myOrders).catch(() => []);
    if (!myOrders.length) {
      ordersBody.innerHTML = `<tr><td colspan="5">No orders yet.</td></tr>`;
    } else {
      ordersBody.innerHTML = myOrders
        .map(
          (order) => `
            <tr>
              <td><a href="customer-order-detail.html?id=${encodeURIComponent(order.id)}">${order.id}</a></td>
              <td>${formatDateTime(order.created_at)}</td>
              <td>${formatOrderType(order.order_type)}</td>
              <td>${order.status}</td>
              <td>${money(order.total)}</td>
            </tr>
          `
        )
        .join("");
    }
  });

  if (themeModeEl) {
    themeModeEl.addEventListener("change", () => {
      applyThemeMode(themeModeEl.value);
    });
  }

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await request(API.profile, {
        method: "PATCH",
        body: JSON.stringify({
          firstName: firstNameEl.value.trim(),
          lastName: lastNameEl.value.trim(),
          phone: phoneEl.value.trim(),
          country: countryEl?.value || "",
          state: stateEl?.value || "",
          address: addressEl.value.trim()
        })
      });
      if (themeModeEl) applyThemeMode(themeModeEl.value);
      alert("Profile updated.");
    } catch (error) {
      alert(error.message);
    }
  });
}

function initCustomerOrdersPage() {
  const tableBody = document.getElementById("customerOrdersTableBody");
  if (!tableBody) return;

  requireRole("customer").then(async (me) => {
    if (!me) return;
    applyCurrencyForCountry(me.customer?.country || "", getSavedCurrency());
    try {
      const orders = await request(API.myOrders);
      if (!orders.length) {
        tableBody.innerHTML = `<tr><td colspan="6">No orders yet.</td></tr>`;
        return;
      }
      tableBody.innerHTML = orders
        .map((order) => {
          const items = order.items.map((item) => `${item.product_name} x${item.qty}`).join(", ");
          return `
            <tr>
              <td><a href="customer-order-detail.html?id=${encodeURIComponent(order.id)}">${order.id}</a></td>
              <td>${formatDateTime(order.created_at)}</td>
              <td>${formatOrderType(order.order_type)}</td>
              <td>${order.status}</td>
              <td>${money(order.total)}</td>
              <td><span class="small">${items}</span></td>
            </tr>
          `;
        })
        .join("");
    } catch (error) {
      tableBody.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
    }
  });
}

function initCustomerOrderDetailPage() {
  const root = document.getElementById("customerOrderDetail");
  if (!root) return;

  const orderMeta = document.getElementById("customerOrderMeta");
  const orderItemsBody = document.getElementById("customerOrderItemsBody");
  const closeBtn = document.getElementById("closeOrderDetailBtn");
  const orderId = new URLSearchParams(window.location.search).get("id");

  closeBtn.addEventListener("click", () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigateTo("customer-orders.html");
    }
  });

  if (!orderId) {
    orderMeta.innerHTML = `<p>Order ID is missing.</p>`;
    return;
  }

  requireRole("customer").then(async (me) => {
    if (!me) return;
    applyCurrencyForCountry(me.customer?.country || "", getSavedCurrency());
    try {
      const order = await request(`${API.myOrders}/${encodeURIComponent(orderId)}`);
      orderMeta.innerHTML = `
        <div class="order-meta-grid">
          <div><strong>Order ID:</strong> ${order.id}</div>
          <div><strong>Date:</strong> ${formatDateTime(order.created_at)}</div>
          <div><strong>Type:</strong> ${formatOrderType(order.order_type)}</div>
          <div><strong>Status:</strong> ${order.status}</div>
          <div><strong>Payment:</strong> ${order.payment_status}</div>
          <div><strong>Total:</strong> ${money(order.total)}</div>
        </div>
      `;

      orderItemsBody.innerHTML = order.items
        .map(
          (item) => `
            <tr>
              <td>${item.product_name}</td>
              <td>${item.sku}</td>
              <td>${item.qty}</td>
              <td>${money(item.price)}</td>
              <td>${money(item.line_total)}</td>
            </tr>
          `
        )
        .join("");
    } catch (error) {
      orderMeta.innerHTML = `<p>${error.message}</p>`;
      orderItemsBody.innerHTML = "";
    }
  });
}

function initAdminProfilePage() {
  const form = document.getElementById("adminProfileForm");
  if (!form) return;

  const firstNameEl = document.getElementById("adminProfileFirstName");
  const lastNameEl = document.getElementById("adminProfileLastName");
  const emailEl = document.getElementById("adminProfileEmail");
  const roleEl = document.getElementById("adminProfileRole");
  const passwordEl = document.getElementById("adminProfilePassword");
  const themeModeEl = document.getElementById("adminProfileThemeMode");
  const currencyEl = document.getElementById("adminProfileCurrency");

  requireRole("admin").then((me) => {
    if (!me) return;
    firstNameEl.value = me.firstName || "";
    lastNameEl.value = me.lastName || "";
    emailEl.value = me.email || "";
    roleEl.value = me.role || "admin";
    if (themeModeEl) themeModeEl.value = getSavedThemeMode();
    if (currencyEl) currencyEl.value = getSavedCurrency();
  });

  if (themeModeEl) {
    themeModeEl.addEventListener("change", () => {
      applyThemeMode(themeModeEl.value);
    });
  }
  if (currencyEl) {
    currencyEl.addEventListener("change", () => {
      applyCurrency(currencyEl.value);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await request(API.adminProfile, {
        method: "PATCH",
        body: JSON.stringify({
          firstName: firstNameEl.value.trim(),
          lastName: lastNameEl.value.trim(),
          password: passwordEl.value
        })
      });
      passwordEl.value = "";
      if (themeModeEl) applyThemeMode(themeModeEl.value);
      if (currencyEl) applyCurrency(currencyEl.value);
      alert("Admin profile updated.");
    } catch (error) {
      alert(error.message);
    }
  });
}

function initPageGuardByPath() {
  const page = window.location.pathname.split("/").pop();
  const adminPages = new Set([
    "admin.html",
    "orders.html",
    "inventory.html",
    "inventory-form.html",
    "dashboard.html",
    "customers.html",
    "reports.html",
    "admin-profile.html",
    "create-admin.html",
    "create-admin-edit.html",
    "dine-in.html",
    "dine-in-order.html",
    "dine-in-create.html",
    "dine-in-add-items.html",
    "admin-order-detail.html"
  ]);
  const customerPages = new Set([
    "home.html",
    "shop.html",
    "cart.html",
    "profile.html",
    "customer-orders.html",
    "customer-order-detail.html"
  ]);
  if (adminPages.has(page)) {
    requireRole("admin");
  } else if (customerPages.has(page)) {
    requireRole("customer");
  }
}

function initMobileMode() {
  const navs = Array.from(document.querySelectorAll(".nav"));
  if (!navs.length) return;

  const mediaQuery = window.matchMedia("(max-width: 920px)");
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(
    navigator.userAgent || ""
  );

  function isMobileMode() {
    return mediaQuery.matches || mobileUserAgent;
  }

  function ensureToggle(nav, navLinks) {
    let toggle = nav.querySelector(".nav-menu-toggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "btn btn-outline btn-sm nav-menu-toggle";
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "Menu";
      nav.insertBefore(toggle, navLinks);
    }
    return toggle;
  }

  function applyMode() {
    const mobile = isMobileMode();
    document.body.setAttribute("data-device", mobile ? "mobile" : "desktop");

    navs.forEach((nav) => {
      const navLinks = nav.querySelector(".nav-links");
      if (!navLinks) return;
      const toggle = ensureToggle(nav, navLinks);

      if (mobile) {
        toggle.classList.remove("hidden");
      } else {
        nav.classList.remove("mobile-nav-open");
        toggle.classList.add("hidden");
        toggle.setAttribute("aria-expanded", "false");
      }

      if (!toggle.dataset.bound) {
        toggle.addEventListener("click", () => {
          const open = nav.classList.toggle("mobile-nav-open");
          toggle.setAttribute("aria-expanded", open ? "true" : "false");
        });
        toggle.dataset.bound = "1";
      }
    });
  }

  applyMode();
  mediaQuery.addEventListener("change", applyMode);
  window.addEventListener("resize", applyMode);
}

initThemeMode();
initCurrency();
initMobileMode();
initPageGuardByPath();
initActiveNavLinks();
initAuthPage();
initLogoutButtons();
initHomePage();
initShopPage();
initCartPage();
initAdminButtonSorting();
initDineInPage();
initAdminPage();
initInventoryFormPage();
initCreateAdminPage();
initCreateAdminEditPage();
initReportsPage();
initAdminDashboardPage();
initCustomersPage();
initProfilePage();
initAdminProfilePage();
initAdminOrderDetailPage();
initDineInOrderPage();
initDineInCreatePage();
initDineInAddItemsPage();
initCustomerOrdersPage();
initCustomerOrderDetailPage();
