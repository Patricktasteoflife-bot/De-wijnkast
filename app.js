(() => {
  "use strict";

  const config = window.WIJNKAST_CONFIG || {};
  const demoMode = config.demoMode === true;
  const backendConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const CART_KEY = "tol-wijnkast-cart-v1";
  const CUSTOMER_KEY = "tol-wijnkast-customer-v1";

  const demoProducts = [
    {
      id: "demo-giscours-2023",
      name: "Château Giscours",
      producer: "Château Giscours",
      vintage: "2023",
      region: "Margaux · Bordeaux",
      country: "Frankrijk",
      color: "Rood",
      price_cents: 6350,
      stock: 1,
      image_url: "",
      description: "Een bijzondere laatste fles uit Bordeaux."
    },
    {
      id: "demo-knoll-trum-2025",
      name: "Ried Trum Federspiel",
      producer: "Weingut Knoll",
      vintage: "2025",
      region: "Wachau",
      country: "Oostenrijk",
      color: "Wit",
      price_cents: 3295,
      stock: 3,
      image_url: "",
      description: "Fris, precies en gemaakt voor een mooie tafel."
    },
    {
      id: "demo-dugat-py-2022",
      name: "Beaune 1er Cru",
      producer: "Domaine Dugat-Py",
      vintage: "2022",
      region: "Bourgogne",
      country: "Frankrijk",
      color: "Rood",
      price_cents: 12900,
      stock: 1,
      image_url: "",
      description: "Een zeldzame Bourgogne voor de liefhebber."
    },
    {
      id: "demo-sabathi-2017",
      name: "Ried Jagersberg Chardonnay",
      producer: "Hannes Sabathi",
      vintage: "2017",
      region: "Südsteiermark",
      country: "Oostenrijk",
      color: "Wit",
      price_cents: 2295,
      stock: 2,
      image_url: "",
      description: "Rijk en gelaagd, met mooie spanning."
    },
    {
      id: "demo-ouskool-2021",
      name: "Wijnskool Ouskool",
      producer: "Bartho Eksteen",
      vintage: "2021",
      region: "Hemel-en-Aarde",
      country: "Zuid-Afrika",
      color: "Wit",
      price_cents: 3495,
      stock: 1,
      image_url: "",
      description: "Karaktervol wit in een zeer kleine oplage."
    },
    {
      id: "demo-murrieta-2012",
      name: "Castillo Ygay Gran Reserva",
      producer: "Marqués de Murrieta",
      vintage: "2012",
      region: "Rioja",
      country: "Spanje",
      color: "Rood",
      price_cents: 23000,
      stock: 1,
      image_url: "",
      description: "Een klassieke icoonwijn uit Rioja."
    }
  ];

  const state = {
    products: [],
    cart: readStorage(CART_KEY, {}),
    filter: "Alles",
    sort: "newest",
    busy: false
  };

  const els = {
    filters: document.querySelector("#filters"),
    grid: document.querySelector("#productGrid"),
    empty: document.querySelector("#emptyState"),
    sort: document.querySelector("#sortSelect"),
    sortControl: document.querySelector("#sortControl"),
    headerCartButton: document.querySelector("#headerCartButton"),
    headerCartCount: document.querySelector("#headerCartCount"),
    floatingCart: document.querySelector("#floatingCartButton"),
    floatingCartCount: document.querySelector("#floatingCartCount"),
    floatingCartTotal: document.querySelector("#floatingCartTotal"),
    backdrop: document.querySelector("#drawerBackdrop"),
    drawer: document.querySelector("#cartDrawer"),
    closeCart: document.querySelector("#closeCartButton"),
    continueShopping: document.querySelector("#continueShoppingButton"),
    cartLines: document.querySelector("#cartLines"),
    cartEmpty: document.querySelector("#cartEmpty"),
    cartSummary: document.querySelector("#cartSummary"),
    cartSubtotal: document.querySelector("#cartSubtotal"),
    checkoutButton: document.querySelector("#checkoutButton"),
    checkoutDialog: document.querySelector("#checkoutDialog"),
    checkoutForm: document.querySelector("#checkoutForm"),
    closeCheckout: document.querySelector("#closeCheckoutButton"),
    checkoutTotal: document.querySelector("#checkoutTotal"),
    placeOrderButton: document.querySelector("#placeOrderButton"),
    formStatus: document.querySelector("#formStatus"),
    successDialog: document.querySelector("#successDialog"),
    successMessage: document.querySelector("#successMessage"),
    closeSuccess: document.querySelector("#closeSuccessButton"),
    toast: document.querySelector("#toast")
  };

  init();

  async function init() {
    bindEvents();
    prefillCustomer();
    await loadProducts();
    renderAll();
    registerServiceWorker();
  }

  function bindEvents() {
    els.sort.addEventListener("change", (event) => {
      state.sort = event.target.value;
      renderProducts();
    });
    els.headerCartButton.addEventListener("click", openCart);
    els.floatingCart.addEventListener("click", openCart);
    els.closeCart.addEventListener("click", closeCart);
    els.continueShopping.addEventListener("click", closeCart);
    els.backdrop.addEventListener("click", closeCart);
    els.checkoutButton.addEventListener("click", openCheckout);
    els.closeCheckout.addEventListener("click", () => els.checkoutDialog.close());
    els.closeSuccess.addEventListener("click", () => els.successDialog.close());
    els.checkoutForm.addEventListener("submit", submitOrder);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && els.drawer.classList.contains("open")) closeCart();
    });
  }

  async function loadProducts() {
    if (demoMode) {
      state.products = demoProducts;
      return;
    }
    if (!backendConfigured) {
      state.products = [];
      return;
    }
    try {
      const response = await fetch(`${trimSlash(config.supabaseUrl)}/rest/v1/public_products?select=*&order=created_at.desc`, {
        headers: apiHeaders()
      });
      if (!response.ok) throw new Error("De wijnkast kon niet worden geladen.");
      state.products = (await response.json()).map(normalizeProduct);
    } catch (error) {
      state.products = [];
      showToast(error.message);
    }
  }

  function normalizeProduct(product) {
    return {
      id: product.id,
      name: product.name,
      producer: product.producer || "",
      vintage: product.vintage || "",
      region: [product.region, product.country].filter(Boolean).join(" · "),
      country: product.country || "",
      color: product.color || "Overig",
      price_cents: Number(product.price_cents || 0),
      stock: Number(product.stock || 0),
      image_url: product.image_url || "",
      description: product.description || "",
      created_at: product.created_at || ""
    };
  }

  function renderAll() {
    renderFilters();
    renderProducts();
    renderCart();
  }

  function renderFilters() {
    const hasProducts = state.products.length > 0;
    els.filters.hidden = !hasProducts;
    els.sortControl.hidden = !hasProducts;
    const categories = ["Alles", ...new Set(state.products.map((product) => product.color).filter(Boolean))];
    els.filters.innerHTML = categories.map((category) => (
      `<button type="button" class="filter-button ${category === state.filter ? "active" : ""}" data-filter="${escapeHtml(category)}">${escapeHtml(category)}</button>`
    )).join("");
    els.filters.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter;
        renderFilters();
        renderProducts();
      });
    });
  }

  function visibleProducts() {
    const filtered = state.products.filter((product) => product.stock > 0 && (state.filter === "Alles" || product.color === state.filter));
    return filtered.sort((a, b) => {
      if (state.sort === "price-asc") return a.price_cents - b.price_cents;
      if (state.sort === "price-desc") return b.price_cents - a.price_cents;
      if (state.sort === "stock") return a.stock - b.stock;
      return String(b.created_at || b.id).localeCompare(String(a.created_at || a.id));
    });
  }

  function renderProducts() {
    const products = visibleProducts();
    els.empty.hidden = products.length > 0;
    els.grid.innerHTML = products.map((product) => {
      const cartQty = Number(state.cart[product.id] || 0);
      const available = Math.max(0, product.stock - cartQty);
      const image = product.image_url
        ? `<img src="${escapeAttr(product.image_url)}" alt="${escapeAttr(product.producer)} ${escapeAttr(product.name)}" loading="lazy" />`
        : `<div class="bottle-fallback" aria-hidden="true"></div>`;
      const stockText = product.stock === 1 ? "Laatste fles" : `Nog ${product.stock} flessen`;
      return `
        <article class="product-card">
          <div class="product-image">
            <span class="stock-badge ${product.stock > 1 ? "more" : ""}">${stockText}</span>
            ${image}
          </div>
          <div class="product-info">
            <span class="product-meta">${escapeHtml([product.region, product.vintage].filter(Boolean).join(" · "))}</span>
            <h3 class="product-title">${escapeHtml(product.producer || product.name)}</h3>
            ${product.producer && product.producer !== product.name ? `<p class="product-subtitle">${escapeHtml(product.name)}</p>` : ""}
            ${product.description ? `<p class="product-subtitle">${escapeHtml(product.description)}</p>` : ""}
            <div class="product-bottom">
              <strong class="price">${formatMoney(product.price_cents)}</strong>
              <button class="add-button" type="button" data-add="${escapeAttr(product.id)}" aria-label="Voeg ${escapeAttr(product.producer || product.name)} toe aan de wijnmand" ${available <= 0 ? "disabled" : ""}>
                ${available <= 0 ? "Geselecteerd" : "In wijnmand"}
              </button>
            </div>
          </div>
        </article>`;
    }).join("");
    els.grid.querySelectorAll("[data-add]").forEach((button) => {
      button.addEventListener("click", () => addToCart(button.dataset.add));
    });
  }

  function addToCart(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return;
    const current = Number(state.cart[productId] || 0);
    if (current >= product.stock) {
      showToast("Meer flessen zijn er helaas niet beschikbaar.");
      return;
    }
    state.cart[productId] = current + 1;
    persistCart();
    renderProducts();
    renderCart();
    showToast(`${product.name} staat in je wijnmand.`);
  }

  function setCartQty(productId, quantity) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return;
    const next = Math.max(0, Math.min(product.stock, quantity));
    if (next === 0) delete state.cart[productId];
    else state.cart[productId] = next;
    persistCart();
    renderProducts();
    renderCart();
  }

  function cartItems() {
    return Object.entries(state.cart).map(([id, quantity]) => {
      const product = state.products.find((item) => item.id === id);
      return product ? { product, quantity: Number(quantity) } : null;
    }).filter(Boolean);
  }

  function cartTotal() {
    return cartItems().reduce((sum, item) => sum + item.product.price_cents * item.quantity, 0);
  }

  function cartCount() {
    return cartItems().reduce((sum, item) => sum + item.quantity, 0);
  }

  function renderCart() {
    const items = cartItems();
    const count = cartCount();
    const total = cartTotal();
    els.headerCartCount.textContent = count;
    els.floatingCartCount.textContent = count;
    els.floatingCartTotal.textContent = formatMoney(total);
    els.floatingCart.hidden = count === 0 || els.drawer.classList.contains("open");
    els.cartEmpty.hidden = items.length > 0;
    els.cartSummary.hidden = items.length === 0;
    els.cartSubtotal.textContent = formatMoney(total);
    els.checkoutTotal.textContent = formatMoney(total);
    els.cartLines.innerHTML = items.map(({ product, quantity }) => {
      const thumbnail = product.image_url
        ? `<img src="${escapeAttr(product.image_url)}" alt="" />`
        : `<span class="mini-bottle" aria-hidden="true"></span>`;
      return `
      <article class="cart-line">
        <div class="cart-thumb">${thumbnail}</div>
        <div>
          <h3>${escapeHtml(product.producer || product.name)}</h3>
          <p>${escapeHtml([product.name, product.vintage].filter(Boolean).join(" · "))}</p>
          <div class="qty">
            <button type="button" data-decrease="${escapeAttr(product.id)}" aria-label="Eén minder">−</button>
            <span>${quantity}</span>
            <button type="button" data-increase="${escapeAttr(product.id)}" aria-label="Eén meer" ${quantity >= product.stock ? "disabled" : ""}>+</button>
          </div>
        </div>
        <button class="remove-button" type="button" data-remove="${escapeAttr(product.id)}" aria-label="Verwijderen">×</button>
      </article>`;
    }).join("");
    els.cartLines.querySelectorAll("[data-decrease]").forEach((button) => button.addEventListener("click", () => setCartQty(button.dataset.decrease, Number(state.cart[button.dataset.decrease]) - 1)));
    els.cartLines.querySelectorAll("[data-increase]").forEach((button) => button.addEventListener("click", () => setCartQty(button.dataset.increase, Number(state.cart[button.dataset.increase]) + 1)));
    els.cartLines.querySelectorAll("[data-remove]").forEach((button) => button.addEventListener("click", () => setCartQty(button.dataset.remove, 0)));
  }

  function openCart() {
    els.backdrop.hidden = false;
    els.drawer.classList.add("open");
    els.drawer.setAttribute("aria-hidden", "false");
    els.floatingCart.hidden = true;
    document.body.classList.add("cart-open");
    window.setTimeout(() => els.closeCart.focus(), 50);
  }

  function closeCart() {
    els.drawer.classList.remove("open");
    els.drawer.setAttribute("aria-hidden", "true");
    els.backdrop.hidden = true;
    document.body.classList.remove("cart-open");
    renderCart();
  }

  function openCheckout() {
    if (!cartItems().length) return;
    closeCart();
    els.formStatus.textContent = "";
    els.checkoutDialog.showModal();
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (state.busy || !cartItems().length) return;
    const formData = new FormData(els.checkoutForm);
    const customer = {
      name: String(formData.get("name") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      delivery: String(formData.get("delivery") || "pickup"),
      notes: String(formData.get("notes") || "").trim()
    };
    if (!customer.name || !customer.phone || !formData.get("adult")) {
      els.formStatus.textContent = "Vul de verplichte gegevens in.";
      return;
    }
    state.busy = true;
    els.placeOrderButton.disabled = true;
    els.placeOrderButton.textContent = "Even reserveren…";
    els.formStatus.textContent = "";

    try {
      if (!backendConfigured && !demoMode) throw new Error("De wijnkast wordt nog met de live voorraad verbonden.");
      const result = demoMode ? await createDemoOrder(customer) : await createLiveOrder(customer);
      localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ name: customer.name, phone: customer.phone, email: customer.email }));
      state.cart = {};
      persistCart();
      if (!demoMode) await loadProducts();
      renderAll();
      els.checkoutDialog.close();
      els.successMessage.textContent = `${demoMode ? "Testbestelling" : "Bestelling"} ${result.order_number} is ontvangen. We nemen persoonlijk contact met je op over ophalen of verzenden.`;
      els.successDialog.showModal();
      els.checkoutForm.reset();
      prefillCustomer();
    } catch (error) {
      els.formStatus.textContent = friendlyOrderError(error);
      if (!demoMode) await loadProducts();
      renderAll();
    } finally {
      state.busy = false;
      els.placeOrderButton.disabled = false;
      els.placeOrderButton.textContent = "Bestelling plaatsen";
    }
  }

  async function createLiveOrder(customer) {
    const response = await fetch(`${trimSlash(config.supabaseUrl)}/rest/v1/rpc/place_order`, {
      method: "POST",
      headers: { ...apiHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        customer,
        items: cartItems().map(({ product, quantity }) => ({ product_id: product.id, quantity }))
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.error || "Bestellen is niet gelukt.");
    return Array.isArray(body) ? body[0] : body;
  }

  async function createDemoOrder(customer) {
    await new Promise((resolve) => setTimeout(resolve, 550));
    const number = `DEMO-${String(Date.now()).slice(-6)}`;
    const orders = readStorage("tol-wijnkast-demo-orders", []);
    orders.push({ order_number: number, customer, items: cartItems(), created_at: new Date().toISOString() });
    localStorage.setItem("tol-wijnkast-demo-orders", JSON.stringify(orders));
    return { order_number: number };
  }

  function prefillCustomer() {
    const customer = readStorage(CUSTOMER_KEY, {});
    ["name", "phone", "email"].forEach((field) => {
      const input = els.checkoutForm.elements[field];
      if (input && customer[field]) input.value = customer[field];
    });
  }

  function persistCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  }

  function apiHeaders() {
    return {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      Accept: "application/json"
    };
  }

  function formatMoney(cents) {
    return new Intl.NumberFormat(config.locale || "nl-NL", {
      style: "currency",
      currency: config.currency || "EUR"
    }).format(Number(cents || 0) / 100);
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2300);
  }

  function friendlyOrderError(error) {
    const message = String(error.message || "");
    if (/voorraad|stock|available/i.test(message)) return "Eén van deze flessen is net verkocht. De wijnkast is bijgewerkt.";
    return message || "De bestelling kon niet worden geplaatst. Probeer het opnieuw.";
  }

  function trimSlash(value) { return String(value || "").replace(/\/$/, ""); }
  function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
  function escapeAttr(value) { return escapeHtml(value); }
  function readStorage(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function registerServiceWorker() {
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
})();
