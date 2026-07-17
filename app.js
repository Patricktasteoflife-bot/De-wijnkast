(() => {
  "use strict";

  const config = window.WIJNKAST_CONFIG || {};
  const previewRequested = new URLSearchParams(location.search).get("preview") === "1";
  const demoMode = config.demoMode === true || previewRequested;
  const backendConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const CART_KEY = "tol-wijnkast-cart-v1";
  const CUSTOMER_KEY = "tol-wijnkast-customer-v1";
  const PENDING_ORDER_KEY = "tol-wijnkast-pending-order-v1";
  const PENDING_RECONCILE_TTL = 5 * 60 * 1000;
  const previewProducts = Array.isArray(window.WIJNKAST_PRODUCTS) ? window.WIJNKAST_PRODUCTS : [];
  const SITE_SETTING_RULES = Object.freeze({
    "site.browser_title": { target: "title", max: 100 },
    "site.meta_description": { target: "description", max: 240 },
    "brand.name": { selector: '[data-site-setting="brand.name"]', max: 40 },
    "brand.subtitle": { selector: '[data-site-setting="brand.subtitle"]', max: 60 },
    "nav.home": { selector: '[data-site-setting="nav.home"]', max: 30 },
    "nav.wines": { selector: '[data-site-setting="nav.wines"]', max: 30 },
    "nav.selection": { selector: '[data-site-setting="nav.selection"]', max: 40 },
    "nav.about": { selector: '[data-site-setting="nav.about"]', max: 40 },
    "nav.contact": { selector: '[data-site-setting="nav.contact"]', max: 30 },
    "hero.title": { selector: '[data-site-setting="hero.title"]', max: 40 },
    "hero.tagline": { selector: '[data-site-setting="hero.tagline"]', max: 80 },
    "hero.body": { selector: '[data-site-setting="hero.body"]', max: 360, multiline: true },
    "hero.cta": { selector: '[data-site-setting="hero.cta"]', max: 40 },
    "collection.eyebrow": { selector: '[data-site-setting="collection.eyebrow"]', max: 60 },
    "collection.title": { selector: '[data-site-setting="collection.title"]', max: 100 },
    "collection.body": { selector: '[data-site-setting="collection.body"]', max: 300, multiline: true },
    "collection.options": { selector: '[data-site-setting="collection.options"]', max: 40 },
    "empty.title": { selector: '[data-site-setting="empty.title"]', max: 100 },
    "empty.body": { selector: '[data-site-setting="empty.body"]', max: 240, multiline: true },
    "benefit.exclusive.title": { selector: '[data-site-setting="benefit.exclusive.title"]', max: 50 },
    "benefit.exclusive.body": { selector: '[data-site-setting="benefit.exclusive.body"]', max: 140, multiline: true },
    "benefit.available.title": { selector: '[data-site-setting="benefit.available.title"]', max: 50 },
    "benefit.available.body": { selector: '[data-site-setting="benefit.available.body"]', max: 140, multiline: true },
    "benefit.care.title": { selector: '[data-site-setting="benefit.care.title"]', max: 50 },
    "benefit.care.body": { selector: '[data-site-setting="benefit.care.body"]', max: 140, multiline: true },
    "benefit.personal.title": { selector: '[data-site-setting="benefit.personal.title"]', max: 50 },
    "benefit.personal.body": { selector: '[data-site-setting="benefit.personal.body"]', max: 140, multiline: true },
    "about.eyebrow": { selector: '[data-site-setting="about.eyebrow"]', max: 60 },
    "about.title": { selector: '[data-site-setting="about.title"]', max: 100 },
    "about.body": { selector: '[data-site-setting="about.body"]', max: 300, multiline: true },
    "footer.name": { selector: '[data-site-setting="footer.name"]', max: 60 },
    "footer.tagline": { selector: '[data-site-setting="footer.tagline"]', max: 180, multiline: true },
    "footer.verse": { selector: '[data-site-setting="footer.verse"]', max: 300, multiline: true },
    "footer.verse_reference": { selector: '[data-site-setting="footer.verse_reference"]', max: 80 }
  });

  const state = {
    products: [],
    cart: readStorage(CART_KEY, {}),
    filter: "Alles",
    sort: "price-asc",
    busy: false,
    reconciling: false
  };

  const els = {
    filters: document.querySelector("#filters"),
    grid: document.querySelector("#productGrid"),
    empty: document.querySelector("#emptyState"),
    sort: document.querySelector("#sortSelect"),
    sortControl: document.querySelector("#sortControl"),
    collectionOptions: document.querySelector("#collectionOptions"),
    selectionDots: document.querySelector("#selectionDots"),
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
    productDialog: document.querySelector("#productDialog"),
    productDialogContent: document.querySelector("#productDialogContent"),
    closeProduct: document.querySelector("#closeProductButton"),
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
    const pendingOrder = applyPendingOrderGuard();
    void loadSiteSettings();
    await loadProducts();
    renderAll();
    registerServiceWorker();
    if (pendingOrder?.status === "confirmed" && pendingOrder.result?.order_number) {
      finishConfirmedOrder(pendingOrder.customer, pendingOrder.result, false, pendingOrder.request_id);
    } else if (pendingOrder) {
      void reconcilePendingOrder(pendingOrder, 500);
    }
  }

  async function loadSiteSettings() {
    if (!backendConfigured || demoMode) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(`${trimSlash(config.supabaseUrl)}/rest/v1/site_settings?select=key,value&order=sort_order.asc`, {
        headers: apiHeaders(),
        signal: controller.signal
      });
      if (!response.ok) return;
      const rows = await response.json();
      if (!Array.isArray(rows)) return;
      rows.forEach(applySiteSetting);
    } catch {
      // De vaste HTML-teksten blijven altijd als veilige fallback staan.
    } finally {
      window.clearTimeout(timer);
    }
  }

  function applySiteSetting(row) {
    const rule = SITE_SETTING_RULES[row?.key];
    if (!rule || typeof row.value !== "string") return;
    const value = row.value.replace(/\r\n?/g, "\n").trim();
    if (!value || value.length > rule.max) return;
    if (rule.target === "title") {
      document.title = value;
      return;
    }
    if (rule.target === "description") {
      const description = document.querySelector("#siteDescription");
      if (description) description.content = value;
      return;
    }
    const element = document.querySelector(rule.selector);
    if (!element) return;
    element.textContent = value;
    if (rule.multiline) element.classList.add("site-setting-multiline");
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
    els.closeProduct.addEventListener("click", () => els.productDialog.close());
    els.productDialog.addEventListener("click", (event) => {
      if (event.target === els.productDialog) els.productDialog.close();
    });
    els.productDialogContent.addEventListener("click", (event) => {
      const button = event.target.closest("[data-detail-add]");
      if (!button) return;
      addToCart(button.dataset.detailAdd);
      els.productDialog.close();
    });
    els.closeCheckout.addEventListener("click", () => els.checkoutDialog.close());
    els.closeSuccess.addEventListener("click", () => els.successDialog.close());
    els.checkoutForm.addEventListener("submit", submitOrder);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && els.drawer.classList.contains("open")) closeCart();
    });
  }

  async function loadProducts() {
    if (demoMode) {
      state.products = previewProducts;
      return;
    }
    if (!backendConfigured) {
      state.products = [];
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${trimSlash(config.supabaseUrl)}/rest/v1/public_products?select=*&order=created_at.desc`, {
        headers: apiHeaders(),
        signal: controller.signal
      });
      if (!response.ok) throw new Error("De wijnkast kon niet worden geladen.");
      state.products = (await response.json()).map(normalizeProduct);
    } catch (error) {
      state.products = [];
      showToast(error.message);
    } finally {
      window.clearTimeout(timer);
    }
  }

  function normalizeProduct(product) {
    return {
      id: product.id,
      name: product.name,
      producer: product.producer || "",
      vintage: product.vintage || "",
      region: product.region || "",
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
    els.collectionOptions.hidden = !hasProducts;
    els.selectionDots.hidden = !hasProducts;
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
      const metaParts = [product.country, product.region]
        .filter(Boolean)
        .filter((value, index, values) => values.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);
      const image = product.image_url
        ? `<img src="${escapeAttr(product.image_url)}" alt="${escapeAttr(product.producer)} ${escapeAttr(product.name)}" loading="lazy" />`
        : `<div class="bottle-fallback" aria-hidden="true"></div>`;
      const stockText = product.stock === 1 ? "Laatste fles" : `Nog ${product.stock} flessen`;
      return `
        <article class="product-card">
          <div class="product-image">
            <span class="stock-badge ${product.stock > 1 ? "more" : ""}">${stockText}</span>
            <svg class="heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21S3 15.7 3 8.8A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 9 2.8C21 15.7 12 21 12 21Z" /></svg>
            ${image}
          </div>
          <div class="product-info">
            <span class="product-meta">${escapeHtml(metaParts.join(" | "))}</span>
            <h3 class="product-title">${escapeHtml(product.producer || product.name)}</h3>
            ${product.producer && product.producer !== product.name ? `<p class="product-subtitle">${escapeHtml(product.name)}</p>` : ""}
            ${product.vintage ? `<p class="product-vintage">${escapeHtml(product.vintage)}</p>` : ""}
            <strong class="price">${formatMoney(product.price_cents)}</strong>
            <div class="product-actions">
              <button class="view-label" type="button" data-view="${escapeAttr(product.id)}">Bekijk wijn</button>
              <button class="add-button" type="button" data-add="${escapeAttr(product.id)}" aria-label="Voeg ${escapeAttr(product.producer || product.name)} toe aan de wijnmand" ${available <= 0 ? "disabled" : ""}>
                ${available <= 0 ? "✓" : "+"}
              </button>
            </div>
          </div>
        </article>`;
    }).join("");
    els.grid.querySelectorAll("[data-add]").forEach((button) => {
      button.addEventListener("click", () => addToCart(button.dataset.add));
    });
    els.grid.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => openProduct(button.dataset.view));
    });
  }

  function openProduct(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return;
    const cartQty = Number(state.cart[product.id] || 0);
    const available = Math.max(0, product.stock - cartQty);
    const stockText = product.stock === 1 ? "Laatste fles beschikbaar" : `${product.stock} flessen beschikbaar`;
    const metaParts = [product.country, product.region, product.color]
      .filter(Boolean)
      .filter((value, index, values) => values.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index);
    const image = product.image_url
      ? `<img src="${escapeAttr(product.image_url)}" alt="${escapeAttr(product.producer)} ${escapeAttr(product.name)} ${escapeAttr(product.vintage)}" />`
      : `<div class="bottle-fallback" aria-hidden="true"></div>`;

    els.productDialogContent.innerHTML = `
      <div class="product-detail-image">${image}</div>
      <div class="product-detail-copy">
        <p class="eyebrow">${escapeHtml(metaParts.join(" · "))}</p>
        <h2 id="productDetailTitle">${escapeHtml(product.producer || product.name)}</h2>
        ${product.producer && product.producer !== product.name ? `<p class="product-detail-name">${escapeHtml(product.name)}</p>` : ""}
        ${product.vintage ? `<p class="product-detail-vintage">${escapeHtml(product.vintage)}</p>` : ""}
        <div class="ornament compact" aria-hidden="true"><span></span><i></i><span></span></div>
        <p class="product-detail-description">${escapeHtml(product.description || "Een bijzondere fles uit de selectie van Taste of Life.")}</p>
        <div class="product-detail-purchase">
          <div>
            <strong>${formatMoney(product.price_cents)}</strong>
            <small>${escapeHtml(stockText)}</small>
          </div>
          <button class="primary-button" type="button" data-detail-add="${escapeAttr(product.id)}" ${available <= 0 ? "disabled" : ""}>
            ${available <= 0 ? "In wijnmand" : "Voeg toe aan wijnmand"}
          </button>
        </div>
      </div>`;
    els.productDialog.showModal();
  }

  function addToCart(productId) {
    if (state.busy) {
      showToast("Wacht tot de huidige reservering is gecontroleerd.");
      return;
    }
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
    if (state.busy) {
      showToast("Wacht tot de huidige reservering is gecontroleerd.");
      return;
    }
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
    if (!state.busy) els.formStatus.textContent = "";
    els.checkoutDialog.showModal();
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (state.busy || !cartItems().length) return;
    const formData = new FormData(els.checkoutForm);
    const customerNote = String(formData.get("notes") || "").trim();
    const businessDetails = [
      ["Bedrijf", formData.get("company")],
      ["Adres", formData.get("address")],
      ["Postcode", formData.get("postalCode")],
      ["Plaats", formData.get("city")],
      ["BTW-nummer", formData.get("vatNumber")]
    ].map(([label, value]) => [label, String(value || "").trim()])
      .filter(([, value]) => value)
      .map(([label, value]) => `${label}: ${value}`);
    const customer = {
      name: String(formData.get("name") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      delivery: String(formData.get("delivery") || "pickup"),
      notes: [...businessDetails, customerNote].filter(Boolean).join("\\n")
    };
    if (!customer.name || !customer.phone || !formData.get("adult")) {
      els.formStatus.textContent = "Vul de verplichte gegevens in.";
      return;
    }
    const existingPending = readStorage(PENDING_ORDER_KEY, null);
    if (!demoMode && isPendingOrder(existingPending)) {
      state.busy = true;
      els.placeOrderButton.disabled = true;
      els.placeOrderButton.textContent = "Reservering wordt gecontroleerd";
      els.formStatus.textContent = "Een eerdere reservering wordt eerst veilig gecontroleerd.";
      if (pendingCanReconcile(existingPending)) void reconcilePendingOrder(existingPending);
      return;
    }
    state.busy = true;
    els.placeOrderButton.disabled = true;
    els.placeOrderButton.textContent = "Even reserveren…";
    els.formStatus.textContent = "";
    const requestId = createRequestId();
    const orderItems = cartItems().map(({ product, quantity }) => ({
      product_id: product.id,
      product_name: product.name,
      quantity
    }));
    const pendingOrder = {
      request_id: requestId,
      created_at: Date.now(),
      customer,
      items: orderItems
    };
    if (!demoMode && !savePendingOrder(pendingOrder)) {
      state.busy = false;
      els.placeOrderButton.disabled = false;
      els.placeOrderButton.textContent = "Reservering plaatsen";
      els.formStatus.textContent = "De veilige reserveringscontrole kon niet worden opgeslagen. Ververs de app en probeer daarna opnieuw.";
      return;
    }

    let result;
    try {
      if (!backendConfigured && !demoMode) throw new Error("De wijnkast wordt nog met de live voorraad verbonden.");
      result = demoMode
        ? await createDemoOrder(customer)
        : await createLiveOrder(customer, requestId, orderItems);
    } catch (error) {
      if (error.orderStatusUnknown) {
        els.formStatus.textContent = "De reservering wordt gecontroleerd. Klik niet opnieuw; neem bij twijfel contact op met Taste of Life.";
        els.placeOrderButton.textContent = "Reservering wordt gecontroleerd";
        if (!demoMode) window.setTimeout(() => void reconcilePendingOrder(pendingOrder), 1200);
      } else {
        clearPendingOrder(requestId);
        state.busy = false;
        els.placeOrderButton.disabled = false;
        els.placeOrderButton.textContent = "Reservering plaatsen";
        els.formStatus.textContent = friendlyOrderError(error);
        if (!demoMode) await loadProducts();
        renderAll();
      }
      return;
    }

    markPendingConfirmed(requestId, result);
    finishConfirmedOrder(customer, result, demoMode, requestId);
  }

  async function createLiveOrder(customer, requestId, orderItems) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    let response;
    let body;
    try {
      response = await fetch("/api/reserve", {
        method: "POST",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          request_id: requestId,
          customer,
          items: orderItems
        })
      });
      body = await response.json().catch(() => ({}));
    } catch {
      const error = new Error("De verbinding viel weg tijdens het reserveren.");
      error.orderStatusUnknown = true;
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
    if (!response.ok) {
      const error = new Error(body.message || body.error || "Reserveren is niet gelukt.");
      error.orderStatusUnknown = response.status >= 500 && body.code !== "NOT_CONFIGURED";
      throw error;
    }
    const result = Array.isArray(body) ? body[0] : body;
    if (!result?.order_number) {
      const error = new Error("De reservering is ontvangen, maar de bevestiging ontbreekt.");
      error.orderStatusUnknown = true;
      throw error;
    }
    return result;
  }

  function applyPendingOrderGuard() {
    const pending = readStorage(PENDING_ORDER_KEY, null);
    if (!pending) return;
    if (!isPendingOrder(pending)) {
      clearPendingOrder();
      return;
    }
    state.busy = true;
    els.placeOrderButton.disabled = true;
    els.placeOrderButton.textContent = "Reservering wordt gecontroleerd";
    if (pending.status === "confirmed" && pending.result?.order_number) {
      els.formStatus.textContent = `Reservering ${pending.result.order_number} is al bevestigd.`;
      return pending;
    }
    if (!pendingCanReconcile(pending)) {
      els.formStatus.textContent = "Deze eerdere reservering wordt niet automatisch opnieuw verstuurd. Neem contact op met Taste of Life voor controle.";
      showToast("Een eerdere reservering moet handmatig worden gecontroleerd.");
      return;
    }
    els.formStatus.textContent = "Een eerdere reservering wordt nog gecontroleerd. Klik niet opnieuw.";
    showToast("Een eerdere reservering wordt veilig gecontroleerd.");
    return pending;
  }

  function isPendingOrder(pending) {
    return Boolean(
      pending?.request_id
      && pending.customer
      && Array.isArray(pending.items)
      && pending.items.length
    );
  }

  function pendingCanReconcile(pending) {
    const age = Date.now() - Number(pending?.created_at || 0);
    return age >= 0 && age <= PENDING_RECONCILE_TTL;
  }

  function savePendingOrder(pending) {
    try {
      localStorage.setItem(PENDING_ORDER_KEY, JSON.stringify(pending));
      return true;
    } catch {
      return false;
    }
  }

  function clearPendingOrder(requestId) {
    try {
      const current = readStorage(PENDING_ORDER_KEY, null);
      if (!current || !requestId || current.request_id === requestId) {
        localStorage.removeItem(PENDING_ORDER_KEY);
      }
    } catch {
      // De database-idempotentie blijft leidend als browseropslag niet beschikbaar is.
    }
  }

  function markPendingConfirmed(requestId, result) {
    const current = readStorage(PENDING_ORDER_KEY, null);
    if (!current || current.request_id !== requestId) return;
    savePendingOrder({ ...current, status: "confirmed", result });
  }

  function createRequestId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `wk-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function refreshProductsAfterOrder() {
    await loadProducts();
    renderAll();
  }

  async function reconcilePendingOrder(pendingOrder, delay = 0) {
    if (demoMode || state.reconciling || !pendingOrder) return;
    if (!pendingCanReconcile(pendingOrder)) {
      state.busy = true;
      els.placeOrderButton.disabled = true;
      els.placeOrderButton.textContent = "Handmatige controle nodig";
      els.formStatus.textContent = "Deze reservering wordt niet automatisch opnieuw verstuurd. Neem contact op met Taste of Life voor controle.";
      return;
    }
    state.reconciling = true;
    if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
    if (!pendingCanReconcile(pendingOrder)) {
      state.reconciling = false;
      state.busy = true;
      els.placeOrderButton.disabled = true;
      els.placeOrderButton.textContent = "Handmatige controle nodig";
      els.formStatus.textContent = "Deze reservering wordt niet automatisch opnieuw verstuurd. Neem contact op met Taste of Life voor controle.";
      return;
    }
    let result;
    try {
      result = await createLiveOrder(
        pendingOrder.customer,
        pendingOrder.request_id,
        pendingOrder.items
      );
    } catch (error) {
      if (error.orderStatusUnknown) {
        state.busy = true;
        els.placeOrderButton.disabled = true;
        els.placeOrderButton.textContent = "Reservering wordt gecontroleerd";
        els.formStatus.textContent = "De reservering kon nog niet worden bevestigd. Klik niet opnieuw; neem contact op met Taste of Life.";
      } else {
        clearPendingOrder(pendingOrder.request_id);
        state.busy = false;
        els.placeOrderButton.disabled = false;
        els.placeOrderButton.textContent = "Reservering plaatsen";
        els.formStatus.textContent = friendlyOrderError(error);
        await loadProducts();
        renderAll();
      }
      state.reconciling = false;
      return;
    }
    state.reconciling = false;
    markPendingConfirmed(pendingOrder.request_id, result);
    finishConfirmedOrder(pendingOrder.customer, result, false, pendingOrder.request_id);
  }

  function finishConfirmedOrder(customer, result, isDemo, requestId) {
    try {
      completeOrder(customer, result, isDemo, requestId);
    } catch (error) {
      console.error("Bevestigde reservering kon niet volledig worden getoond", error);
      state.busy = true;
      els.placeOrderButton.disabled = true;
      els.placeOrderButton.textContent = "Reservering vastgelegd";
      els.formStatus.textContent = `Reservering ${result.order_number} is vastgelegd. Ververs de app als de bevestiging niet opent.`;
    }
  }

  function completeOrder(customer, result, isDemo, requestId) {
    try {
      localStorage.setItem(CUSTOMER_KEY, JSON.stringify({
        name: customer.name,
        phone: customer.phone,
        email: customer.email
      }));
    } catch {
      // Het onthouden van klantgegevens is optioneel en mag bevestiging niet blokkeren.
    }
    state.cart = {};
    state.busy = false;
    try { persistCart(); } catch { /* De order zelf is al bevestigd. */ }
    renderAll();
    if (els.checkoutDialog.open) els.checkoutDialog.close();
    els.placeOrderButton.disabled = false;
    els.placeOrderButton.textContent = "Reservering plaatsen";
    els.formStatus.textContent = "";
    els.successMessage.textContent = `${isDemo ? "Testreservering" : "Reservering"} ${result.order_number} is vastgelegd. We nemen persoonlijk contact met je op over ophalen of verzenden.`;
    if (!els.successDialog.open) els.successDialog.showModal();
    els.checkoutForm.reset();
    prefillCustomer();
    if (!isDemo) void refreshProductsAfterOrder();
    clearPendingOrder(requestId);
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
    return message || "De reservering kon niet worden geplaatst. Probeer het opnieuw.";
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
