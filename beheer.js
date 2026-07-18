(() => {
  "use strict";

  const OWNER_EMAIL = "patrick.tasteoflife@hotmail.com";
  const SAFE_SW_VERSION = "wijnkast-v6-2-snel";
  const SW_RELOAD_KEY = "tol-wijnkast-admin-sw-reload";
  const PRODUCT_SELECT = [
    "id", "sku", "name", "producer", "vintage", "region", "country", "color",
    "description", "image_url", "price_cents", "stock", "active", "sort_order",
    "created_at", "updated_at"
  ].join(",");
  const SETTING_SELECT = "key,section,label,value,input_kind,max_length,sort_order,updated_at";
  const config = window.WIJNKAST_CONFIG || {};

  const state = {
    client: null,
    isAdmin: false,
    authorizing: false,
    products: [],
    settings: [],
    settingsInputs: new Map(),
    activeTab: "products",
    editingProduct: null,
    productDirty: false,
    savingProduct: false,
    savingSettings: false
  };

  const els = {
    loginView: document.querySelector("#loginView"),
    loginForm: document.querySelector("#loginForm"),
    loginButton: document.querySelector("#loginButton"),
    loginMessage: document.querySelector("#loginMessage"),
    loadingView: document.querySelector("#loadingView"),
    loadingMessage: document.querySelector("#loadingMessage"),
    adminView: document.querySelector("#adminView"),
    logoutButton: document.querySelector("#logoutButton"),
    refreshButton: document.querySelector("#refreshButton"),
    productsTab: document.querySelector("#productsTab"),
    settingsTab: document.querySelector("#settingsTab"),
    productsPanel: document.querySelector("#productsPanel"),
    settingsPanel: document.querySelector("#settingsPanel"),
    productSearch: document.querySelector("#productSearch"),
    newProductButton: document.querySelector("#newProductButton"),
    productList: document.querySelector("#productList"),
    productsStatus: document.querySelector("#productsStatus"),
    productsEmpty: document.querySelector("#productsEmpty"),
    settingsForm: document.querySelector("#settingsForm"),
    settingsSections: document.querySelector("#settingsSections"),
    settingsEmpty: document.querySelector("#settingsEmpty"),
    settingsSaveBar: document.querySelector("#settingsSaveBar"),
    resetSettingsButton: document.querySelector("#resetSettingsButton"),
    saveSettingsButton: document.querySelector("#saveSettingsButton"),
    productDialog: document.querySelector("#productDialog"),
    productForm: document.querySelector("#productForm"),
    productDialogEyebrow: document.querySelector("#productDialogEyebrow"),
    productDialogTitle: document.querySelector("#productDialogTitle"),
    closeProductDialog: document.querySelector("#closeProductDialog"),
    cancelProductButton: document.querySelector("#cancelProductButton"),
    saveProductButton: document.querySelector("#saveProductButton"),
    productMessage: document.querySelector("#productMessage"),
    toast: document.querySelector("#toast")
  };

  init();

  async function init() {
    bindEvents();

    const safeCache = await ensureSafeServiceWorker();
    if (!safeCache) {
      if (sessionStorage.getItem(SW_RELOAD_KEY) !== "1") {
        sessionStorage.setItem(SW_RELOAD_KEY, "1");
        window.location.reload();
        return;
      }
      showLogin("De beveiligde cache kon niet worden vernieuwd. Sluit dit tabblad en open Beheer opnieuw.", "error");
      els.loginButton.disabled = true;
      return;
    }
    sessionStorage.removeItem(SW_RELOAD_KEY);

    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      showLogin("De beheerverbinding is nog niet ingesteld.", "error");
      els.loginButton.disabled = true;
      return;
    }
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      showLogin("De beveiligde inlogmodule kon niet worden geladen. Ververs de pagina.", "error");
      els.loginButton.disabled = true;
      return;
    }

    state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      global: { fetch: fetchWithTimeout }
    });

    const { data, error } = await state.client.auth.getSession();
    if (error) {
      showLogin("De inlogsessie kon niet worden gecontroleerd. Probeer opnieuw.", "error");
    } else if (data.session) {
      await authorizeAndLoad(data.session);
    } else {
      showLogin();
    }

    state.client.auth.onAuthStateChange((event, session) => {
      window.setTimeout(() => {
        if (event === "SIGNED_OUT" || !session) {
          if (state.isAdmin) showLogin();
          return;
        }
        if (!state.isAdmin && !state.authorizing) void authorizeAndLoad(session);
      }, 0);
    });
  }

  async function ensureSafeServiceWorker() {
    if (!("serviceWorker" in navigator) || window.location.protocol === "file:") return true;
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await registration.update();
      const candidate = registration.installing || registration.waiting;
      if (candidate && candidate.state !== "activated") await waitForWorkerActivation(candidate, 6000);
      if (registration.waiting) registration.waiting.postMessage({ type: "WIJNKAST_SW_CLAIM" });

      let version = await readServiceWorkerVersion(1800);
      if (version !== SAFE_SW_VERSION) {
        await waitForControllerChange(3500);
        version = await readServiceWorkerVersion(1800);
      }
      return version === SAFE_SW_VERSION;
    } catch {
      return !navigator.serviceWorker.controller;
    }
  }

  function waitForWorkerActivation(worker, timeoutMs) {
    return new Promise((resolve) => {
      if (!worker || worker.state === "activated") {
        resolve();
        return;
      }
      const timer = window.setTimeout(finish, timeoutMs);
      worker.addEventListener("statechange", onStateChange);
      function onStateChange() {
        if (worker.state === "activated" || worker.state === "redundant") finish();
      }
      function finish() {
        window.clearTimeout(timer);
        worker.removeEventListener("statechange", onStateChange);
        resolve();
      }
    });
  }

  function waitForControllerChange(timeoutMs) {
    return new Promise((resolve) => {
      const timer = window.setTimeout(finish, timeoutMs);
      navigator.serviceWorker.addEventListener("controllerchange", finish, { once: true });
      function finish() {
        window.clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("controllerchange", finish);
        resolve();
      }
    });
  }

  function readServiceWorkerVersion(timeoutMs) {
    return new Promise((resolve) => {
      const controller = navigator.serviceWorker.controller;
      if (!controller) {
        resolve("");
        return;
      }
      const timer = window.setTimeout(() => finish(""), timeoutMs);
      navigator.serviceWorker.addEventListener("message", onMessage);
      controller.postMessage({ type: "WIJNKAST_SW_VERSION" });
      function onMessage(event) {
        if (event.data?.type === "WIJNKAST_SW_VERSION") finish(String(event.data.version || ""));
      }
      function finish(version) {
        window.clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("message", onMessage);
        resolve(version);
      }
    });
  }

  function bindEvents() {
    els.loginForm.addEventListener("submit", requestMagicLink);
    els.logoutButton.addEventListener("click", logout);
    els.refreshButton.addEventListener("click", refreshAdminData);
    els.productsTab.addEventListener("click", () => selectTab("products"));
    els.settingsTab.addEventListener("click", () => selectTab("settings"));
    els.productSearch.addEventListener("input", renderProducts);
    els.newProductButton.addEventListener("click", () => openProductEditor());
    els.productForm.addEventListener("input", () => { state.productDirty = true; });
    els.productForm.addEventListener("change", () => { state.productDirty = true; });
    els.productForm.addEventListener("submit", saveProduct);
    els.closeProductDialog.addEventListener("click", requestCloseProductEditor);
    els.cancelProductButton.addEventListener("click", requestCloseProductEditor);
    els.productDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      requestCloseProductEditor();
    });
    els.productDialog.addEventListener("click", (event) => {
      if (event.target === els.productDialog) requestCloseProductEditor();
    });
    els.productDialog.addEventListener("close", () => document.body.classList.remove("dialog-open"));
    els.productForm.querySelectorAll("[data-stock-step]").forEach((button) => {
      button.addEventListener("click", () => stepStock(Number(button.dataset.stockStep || 0)));
    });
    els.resetSettingsButton.addEventListener("click", resetSettings);
    els.saveSettingsButton.addEventListener("click", saveSettings);
    window.addEventListener("beforeunload", (event) => {
      if (!hasUnsavedChanges()) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  async function requestMagicLink(event) {
    event.preventDefault();
    if (!state.client) return;
    setLoginBusy(true);
    setMessage(els.loginMessage, "De beveiligde link wordt verstuurd…");

    const redirectUrl = String(config.adminRedirectUrl || "").trim();
    if (!/^https:\/\/[^/]+\/beheer$/.test(redirectUrl)) {
      setLoginBusy(false);
      setMessage(els.loginMessage, "De vaste beheerlink is nog niet ingesteld.", "error");
      return;
    }
    const { error } = await state.client.auth.signInWithOtp({
      email: OWNER_EMAIL,
      options: {
        emailRedirectTo: redirectUrl,
        shouldCreateUser: true
      }
    });

    if (error) {
      setLoginBusy(false);
      setMessage(els.loginMessage, friendlyError(error, "De inloglink kon niet worden verstuurd."), "error");
      return;
    }
    startLoginCooldown(60);
    setMessage(
      els.loginMessage,
      "De inloglink is verstuurd. Gebruik alleen de nieuwste e-mail en klik één keer op de link.",
      "success"
    );
  }

  async function authorizeAndLoad(session) {
    if (state.authorizing || !session) return;
    state.authorizing = true;
    showLoading("Beheerrechten controleren…");

    try {
      let { data: isAdmin, error: adminError } = await state.client.rpc("is_wijnkast_admin");
      if (adminError) throw adminError;
      if (isAdmin !== true) {
        const { data: claimed, error: claimError } = await state.client.rpc("claim_wijnkast_admin");
        if (claimError) throw claimError;
        if (claimed !== true) throw new Error("NO_MAGIC_LINK_ACCESS");
        ({ data: isAdmin, error: adminError } = await state.client.rpc("is_wijnkast_admin"));
        if (adminError) throw adminError;
      }
      if (isAdmin !== true) throw new Error("NO_ADMIN_ACCESS");

      state.isAdmin = true;
      await loadAdminData();
      showAdmin();
    } catch (error) {
      state.isAdmin = false;
      await state.client.auth.signOut({ scope: "local" }).catch(() => {});
      const message = error.message === "NO_ADMIN_ACCESS" || error.message === "NO_MAGIC_LINK_ACCESS"
        ? "Dit account heeft geen beheerrechten."
        : friendlyError(error, "De beheeromgeving kon niet worden geopend.");
      showLogin(message, "error");
    } finally {
      state.authorizing = false;
    }
  }

  async function logout() {
    if (hasUnsavedChanges() && !window.confirm("Je hebt wijzigingen die niet zijn opgeslagen. Toch uitloggen?")) return;
    els.logoutButton.disabled = true;
    await state.client.auth.signOut({ scope: "local" }).catch(() => {});
    state.isAdmin = false;
    state.products = [];
    state.settings = [];
    state.settingsInputs.clear();
    els.logoutButton.disabled = false;
    showLogin("Je bent veilig uitgelogd.", "success");
  }

  async function loadAdminData() {
    showLoading("Wijnen en website laden…");
    const [productsResult, settingsResult] = await Promise.all([
      state.client
        .from("products")
        .select(PRODUCT_SELECT)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
      state.client
        .from("site_settings")
        .select(SETTING_SELECT)
        .order("sort_order", { ascending: true })
    ]);

    if (productsResult.error) throw productsResult.error;
    if (settingsResult.error) throw settingsResult.error;
    state.products = Array.isArray(productsResult.data) ? productsResult.data : [];
    state.settings = Array.isArray(settingsResult.data) ? settingsResult.data : [];
    renderProducts();
    renderSettings();
  }

  async function refreshAdminData() {
    if (hasUnsavedChanges() && !window.confirm("Niet-opgeslagen wijzigingen verdwijnen. Toch opnieuw laden?")) return;
    els.refreshButton.disabled = true;
    try {
      await loadAdminData();
      showAdmin();
      showToast("Alles is opnieuw geladen.");
    } catch (error) {
      showAdmin();
      showToast(friendlyError(error, "Opnieuw laden is niet gelukt."), true);
    } finally {
      els.refreshButton.disabled = false;
    }
  }

  function showLogin(message = "", type = "") {
    els.loginView.hidden = false;
    els.loadingView.hidden = true;
    els.adminView.hidden = true;
    els.logoutButton.hidden = true;
    els.settingsSaveBar.hidden = true;
    setMessage(els.loginMessage, message, type);
  }

  function showLoading(message) {
    els.loginView.hidden = true;
    els.loadingView.hidden = false;
    els.adminView.hidden = true;
    els.logoutButton.hidden = true;
    els.loadingMessage.textContent = message;
  }

  function showAdmin() {
    els.loginView.hidden = true;
    els.loadingView.hidden = true;
    els.adminView.hidden = false;
    els.logoutButton.hidden = false;
    selectTab(state.activeTab);
    updateSettingsDirtyState();
  }

  function setLoginBusy(busy) {
    els.loginButton.disabled = busy;
    els.loginButton.textContent = busy ? "Link versturen…" : "Stuur mij de inloglink";
  }

  function startLoginCooldown(seconds) {
    window.clearTimeout(startLoginCooldown.timer);
    const until = Date.now() + (seconds * 1000);
    const update = () => {
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      els.loginButton.disabled = remaining > 0;
      els.loginButton.textContent = remaining > 0 ? `Link verstuurd (${remaining}s)` : "Stuur mij de inloglink";
      if (remaining > 0) startLoginCooldown.timer = window.setTimeout(update, 1000);
    };
    update();
  }

  function selectTab(tab) {
    state.activeTab = tab === "settings" ? "settings" : "products";
    const settingsActive = state.activeTab === "settings";
    els.productsTab.classList.toggle("active", !settingsActive);
    els.productsTab.setAttribute("aria-selected", String(!settingsActive));
    els.settingsTab.classList.toggle("active", settingsActive);
    els.settingsTab.setAttribute("aria-selected", String(settingsActive));
    els.productsPanel.hidden = settingsActive;
    els.settingsPanel.hidden = !settingsActive;
  }

  function renderProducts() {
    const query = els.productSearch.value.trim().toLocaleLowerCase("nl-NL");
    const products = state.products.filter((product) => {
      if (!query) return true;
      return [product.name, product.producer, product.sku, product.vintage, product.region]
        .some((value) => String(value || "").toLocaleLowerCase("nl-NL").includes(query));
    });

    els.productList.replaceChildren();
    els.productsEmpty.hidden = products.length > 0;
    els.productsStatus.textContent = `${products.length} ${products.length === 1 ? "wijn" : "wijnen"}`;
    products.forEach((product) => els.productList.append(createProductRow(product)));
  }

  function createProductRow(product) {
    const row = make("article", "product-row");
    if (!product.active) row.classList.add("inactive");

    const thumb = make("div", "product-thumb");
    const image = document.createElement("img");
    image.alt = "";
    image.loading = "lazy";
    setSafeImageSource(image, product.image_url);
    thumb.append(image);

    const copy = make("div", "product-copy");
    copy.append(
      make("h3", "", product.producer || product.name || "Naamloze wijn"),
      make("p", "", [product.name, product.vintage].filter(Boolean).join(" · ")),
      make("small", "", product.sku ? `SKU ${product.sku}` : "Geen SKU")
    );

    const numbers = make("div", "product-numbers");
    numbers.append(
      make("strong", "", formatMoney(product.price_cents)),
      make("span", "", `${Number(product.stock || 0)} ${Number(product.stock) === 1 ? "fles" : "flessen"}`)
    );
    const badges = make("div", "product-badges");
    if (!product.active) badges.append(make("span", "badge hidden", "Verborgen"));
    else badges.append(make("span", "badge", "Zichtbaar"));
    if (Number(product.stock) === 0) badges.append(make("span", "badge sold-out", "Uitverkocht"));
    numbers.append(badges);

    const edit = make("button", "quiet-button edit-product", "Bewerken");
    edit.type = "button";
    edit.addEventListener("click", () => openProductEditor(product));

    row.append(thumb, copy, numbers, edit);
    return row;
  }

  function openProductEditor(product = null) {
    state.editingProduct = product;
    state.productDirty = false;
    clearProductMessage();

    els.productDialogEyebrow.textContent = product ? "Wijn bewerken" : "Nieuwe wijn";
    els.productDialogTitle.textContent = product ? (product.name || "Wijn") : "Nieuwe wijn toevoegen";
    setProductField("name", product?.name || "");
    setProductField("producer", product?.producer || "");
    setProductField("vintage", product?.vintage || "");
    setProductField("sku", product?.sku || "");
    setProductField("region", product?.region || "");
    setProductField("country", product?.country || "");
    setProductField("color", product?.color || "Overig");
    setProductField("sort_order", String(product?.sort_order ?? 0));
    setProductField("price", product ? centsToInput(product.price_cents) : "");
    setProductField("stock", String(product?.stock ?? 0));
    setProductField("image_url", product?.image_url || "");
    setProductField("description", product?.description || "");
    productField("active").checked = product ? product.active === true : true;

    document.body.classList.add("dialog-open");
    els.productDialog.showModal();
    window.setTimeout(() => productField("name").focus(), 0);
  }

  function requestCloseProductEditor() {
    if (state.savingProduct) return;
    if (state.productDirty && !window.confirm("Wijzigingen aan deze wijn niet opslaan?")) return;
    state.productDirty = false;
    els.productDialog.close();
  }

  function stepStock(step) {
    const input = productField("stock");
    const current = parseInteger(input.value, 0, 9999, 0);
    input.value = String(Math.min(9999, Math.max(0, current + step)));
    state.productDirty = true;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (state.savingProduct || !state.client) return;
    clearProductMessage();

    let payload;
    try {
      payload = readProductPayload();
    } catch (error) {
      setMessage(els.productMessage, error.message, "error");
      return;
    }

    state.savingProduct = true;
    setProductFormBusy(true);
    try {
      let saved;
      if (state.editingProduct) {
        const { data, error } = await state.client
          .from("products")
          .update(payload)
          .eq("id", state.editingProduct.id)
          .eq("updated_at", state.editingProduct.updated_at)
          .select(PRODUCT_SELECT)
          .maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("PRODUCT_CONFLICT");
        saved = data;
        const index = state.products.findIndex((product) => product.id === saved.id);
        if (index >= 0) state.products.splice(index, 1, saved);
      } else {
        const { data, error } = await state.client
          .from("products")
          .insert(payload)
          .select(PRODUCT_SELECT)
          .single();
        if (error) throw error;
        saved = data;
        state.products.push(saved);
      }

      sortProducts();
      state.productDirty = false;
      els.productDialog.close();
      renderProducts();
      showToast(`${saved.name} is opgeslagen.`);
    } catch (error) {
      if (error.message === "PRODUCT_CONFLICT") {
        setMessage(
          els.productMessage,
          "Deze wijn is intussen gewijzigd, mogelijk door een reservering. Sluit dit venster, laad opnieuw en controleer de voorraad.",
          "error"
        );
      } else {
        setMessage(els.productMessage, friendlyError(error, "De wijn kon niet worden opgeslagen."), "error");
      }
    } finally {
      state.savingProduct = false;
      setProductFormBusy(false);
    }
  }

  function readProductPayload() {
    const name = cleanText(productField("name").value, 160);
    const color = cleanText(productField("color").value, 40);
    if (!name) throw new Error("Vul de naam van de wijn in.");
    if (!color) throw new Error("Vul de soort of kleur van de wijn in.");

    const priceCents = parsePrice(productField("price").value);
    const stock = parseInteger(productField("stock").value, 0, 9999);
    const sortOrder = parseInteger(productField("sort_order").value || "0", 0, 9999);
    const imageUrl = normalizeImageUrl(productField("image_url").value);

    return {
      sku: nullableText(productField("sku").value, 80),
      name,
      producer: nullableText(productField("producer").value, 160),
      vintage: nullableText(productField("vintage").value, 20),
      region: nullableText(productField("region").value, 160),
      country: nullableText(productField("country").value, 100),
      color,
      description: nullableText(productField("description").value, 3000, true),
      image_url: imageUrl,
      price_cents: priceCents,
      stock,
      active: productField("active").checked,
      sort_order: sortOrder
    };
  }

  function renderSettings() {
    state.settingsInputs.clear();
    els.settingsSections.replaceChildren();
    els.settingsEmpty.hidden = state.settings.length > 0;
    if (!state.settings.length) {
      updateSettingsDirtyState();
      return;
    }

    const groups = new Map();
    state.settings.forEach((setting) => {
      const section = setting.section || String(setting.key || "Overig").split(".")[0];
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section).push(setting);
    });

    let groupIndex = 0;
    groups.forEach((settings, section) => {
      const details = make("details", "settings-group");
      if (groupIndex < 2) details.open = true;
      details.append(make("summary", "", sectionTitle(section)));
      const fields = make("div", "settings-fields");
      settings.forEach((setting) => fields.append(createSettingField(setting)));
      details.append(fields);
      els.settingsSections.append(details);
      groupIndex += 1;
    });
    updateSettingsDirtyState();
  }

  function createSettingField(setting) {
    const isTextarea = setting.input_kind === "textarea";
    const wrapper = make("div", `setting-field${isTextarea ? " textarea" : ""}`);
    const heading = make("div", "field-heading");
    const id = `setting-${String(setting.key).replace(/[^A-Za-z0-9_-]/g, "-")}`;
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = setting.label || setting.key;
    const counter = make("span", "char-count");
    heading.append(label, counter);

    const input = document.createElement(isTextarea ? "textarea" : "input");
    input.id = id;
    input.value = String(setting.value ?? "");
    if (isTextarea) input.rows = 4;
    const maxLength = Number(setting.max_length || 0);
    if (maxLength > 0) input.maxLength = maxLength;
    input.addEventListener("input", () => {
      updateSettingCounter(input, counter, maxLength);
      updateSettingsDirtyState();
    });
    updateSettingCounter(input, counter, maxLength);
    wrapper.append(heading, input);
    state.settingsInputs.set(setting.key, { input, wrapper, counter, setting });
    return wrapper;
  }

  function updateSettingCounter(input, counter, maxLength) {
    counter.textContent = maxLength > 0 ? `${input.value.length} / ${maxLength}` : `${input.value.length}`;
  }

  function updateSettingsDirtyState() {
    let dirty = false;
    state.settingsInputs.forEach(({ input, wrapper, setting }) => {
      const changed = normalizeSettingValue(input.value) !== normalizeSettingValue(setting.value);
      wrapper.classList.toggle("changed", changed);
      if (changed) dirty = true;
    });
    els.settingsSaveBar.hidden = !dirty || !state.isAdmin;
    els.saveSettingsButton.disabled = state.savingSettings;
    els.resetSettingsButton.disabled = state.savingSettings;
    return dirty;
  }

  function resetSettings() {
    if (!updateSettingsDirtyState()) return;
    if (!window.confirm("Alle niet-opgeslagen tekstwijzigingen terugzetten?")) return;
    state.settingsInputs.forEach(({ input, counter, setting }) => {
      input.value = String(setting.value ?? "");
      updateSettingCounter(input, counter, Number(setting.max_length || 0));
    });
    updateSettingsDirtyState();
  }

  async function saveSettings() {
    if (state.savingSettings || !state.client) return;
    const changes = [];
    state.settingsInputs.forEach(({ input, setting }) => {
      const value = normalizeSettingValue(input.value);
      const original = normalizeSettingValue(setting.value);
      if (value !== original) changes.push({ setting, value });
    });
    if (!changes.length) return;

    for (const { setting, value } of changes) {
      if (!value) {
        showToast(`${setting.label || setting.key} mag niet leeg zijn.`, true);
        return;
      }
      const maxLength = Number(setting.max_length || 0);
      if (maxLength > 0 && value.length > maxLength) {
        showToast(`${setting.label || setting.key} is te lang.`, true);
        return;
      }
    }

    state.savingSettings = true;
    setSettingsBusy(true);
    const outcomes = await Promise.all(changes.map(async ({ setting, value }) => {
      const { data, error } = await state.client
        .from("site_settings")
        .update({ value })
        .eq("key", setting.key)
        .eq("updated_at", setting.updated_at)
        .select(SETTING_SELECT)
        .maybeSingle();
      if (error) return { type: "error", setting, error };
      if (!data) return { type: "conflict", setting };
      return { type: "success", setting, data };
    }));

    const conflicts = outcomes.filter((outcome) => outcome.type === "conflict");
    const failures = outcomes.filter((outcome) => outcome.type === "error");
    outcomes.filter((outcome) => outcome.type === "success").forEach((outcome) => {
      const index = state.settings.findIndex((setting) => setting.key === outcome.data.key);
      if (index >= 0) state.settings.splice(index, 1, outcome.data);
      const entry = state.settingsInputs.get(outcome.data.key);
      if (entry) entry.setting = outcome.data;
    });

    state.savingSettings = false;
    setSettingsBusy(false);

    if (conflicts.length) {
      await reloadSettingsAfterConflict();
      showToast("Een tekst was intussen gewijzigd. De nieuwste versie is geladen; controleer hem opnieuw.", true);
      return;
    }
    updateSettingsDirtyState();
    if (failures.length) {
      showToast(friendlyError(failures[0].error, "Niet alle teksten konden worden opgeslagen."), true);
      return;
    }
    showToast(`${changes.length} ${changes.length === 1 ? "tekst is" : "teksten zijn"} opgeslagen.`);
  }

  async function reloadSettingsAfterConflict() {
    const { data, error } = await state.client
      .from("site_settings")
      .select(SETTING_SELECT)
      .order("sort_order", { ascending: true });
    if (error) return;
    state.settings = Array.isArray(data) ? data : [];
    renderSettings();
  }

  function setSettingsBusy(busy) {
    els.saveSettingsButton.disabled = busy;
    els.resetSettingsButton.disabled = busy;
    els.saveSettingsButton.textContent = busy ? "Opslaan…" : "Teksten opslaan";
    state.settingsInputs.forEach(({ input }) => { input.disabled = busy; });
  }

  function setProductFormBusy(busy) {
    els.saveProductButton.disabled = busy;
    els.cancelProductButton.disabled = busy;
    els.closeProductDialog.disabled = busy;
    els.saveProductButton.textContent = busy ? "Opslaan…" : "Wijn opslaan";
    Array.from(els.productForm.elements).forEach((control) => { control.disabled = busy; });
    if (!busy) {
      els.saveProductButton.disabled = false;
      els.cancelProductButton.disabled = false;
      els.closeProductDialog.disabled = false;
    }
  }

  function sortProducts() {
    state.products.sort((a, b) => {
      const order = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (order !== 0) return order;
      return String(a.name || "").localeCompare(String(b.name || ""), "nl-NL");
    });
  }

  function hasUnsavedChanges() {
    return state.productDirty || updateSettingsDirtyState();
  }

  function productField(name) {
    return els.productForm.elements.namedItem(name);
  }

  function setProductField(name, value) {
    const field = productField(name);
    if (field) field.value = value;
  }

  function clearProductMessage() {
    setMessage(els.productMessage, "");
  }

  function setMessage(element, message, type = "") {
    element.textContent = message || "";
    element.classList.toggle("error", type === "error");
    element.classList.toggle("success", type === "success");
  }

  function make(tag, className = "", text = null) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== null) element.textContent = String(text);
    return element;
  }

  function sectionTitle(section) {
    const normalized = String(section || "").toLocaleLowerCase("nl-NL");
    const titles = {
      site: "Website",
      website: "Website",
      brand: "Merk",
      merk: "Merk",
      nav: "Navigatie",
      navigation: "Navigatie",
      navigatie: "Navigatie",
      hero: "Intro",
      intro: "Intro",
      collection: "Collectie",
      collectie: "Collectie",
      empty: "Lege wijnkast",
      benefit: "Voordelen",
      benefits: "Voordelen",
      voordelen: "Voordelen",
      about: "Over Taste of Life",
      over: "Over Taste of Life",
      footer: "Footer"
    };
    return titles[normalized] || section || "Overig";
  }

  function cleanText(value, maxLength, preserveLines = false) {
    const normalized = String(value ?? "").replace(/\r\n?/g, "\n");
    const cleaned = preserveLines
      ? normalized.split("\n").map((line) => line.trim()).join("\n").trim()
      : normalized.replace(/\s+/g, " ").trim();
    if (cleaned.length > maxLength) throw new Error(`Gebruik maximaal ${maxLength} tekens.`);
    return cleaned;
  }

  function nullableText(value, maxLength, preserveLines = false) {
    return cleanText(value, maxLength, preserveLines) || null;
  }

  function normalizeSettingValue(value) {
    return String(value ?? "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[ \t]+$/g, ""))
      .join("\n")
      .trim();
  }

  function parseInteger(value, min, max, fallback = null) {
    const text = String(value ?? "").trim();
    if (!text && fallback !== null) return fallback;
    if (!/^\d+$/.test(text)) throw new Error(`Vul een heel getal tussen ${min} en ${max} in.`);
    const number = Number(text);
    if (!Number.isSafeInteger(number) || number < min || number > max) {
      throw new Error(`Vul een heel getal tussen ${min} en ${max} in.`);
    }
    return number;
  }

  function parsePrice(value) {
    let text = String(value ?? "").trim().replace(/[€\s]/g, "");
    if (!text) throw new Error("Vul de prijs per fles in.");
    if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
    if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(text)) {
      throw new Error("Vul de prijs in als bijvoorbeeld 62,50.");
    }
    const [euros, decimals = ""] = text.split(".");
    const cents = Number(euros) * 100 + Number(decimals.padEnd(2, "0"));
    if (!Number.isSafeInteger(cents) || cents < 0 || cents > 999999999) {
      throw new Error("Deze prijs is te hoog.");
    }
    return cents;
  }

  function centsToInput(cents) {
    const amount = Math.max(0, Number(cents || 0));
    return `${Math.floor(amount / 100)},${String(amount % 100).padStart(2, "0")}`;
  }

  function normalizeImageUrl(value) {
    const text = String(value ?? "").trim();
    if (!text) return null;
    if (text.length > 1000) throw new Error("De afbeeldingslink is te lang.");
    if (/^https:\/\//i.test(text)) {
      try {
        const parsed = new URL(text);
        if (parsed.protocol === "https:") return parsed.toString();
      } catch (_) {
        throw new Error("De afbeeldingslink is niet geldig.");
      }
    }
    if (/^(?:\/?[A-Za-z0-9._-]+)+(?:\/[A-Za-z0-9._-]+)*$/.test(text) && !text.includes("..") && !text.startsWith("//")) {
      return text;
    }
    throw new Error("Gebruik een lokaal afbeeldingspad of een https-link.");
  }

  function safeImageUrl(value) {
    try { return normalizeImageUrl(value); }
    catch (_) { return null; }
  }

  function setSafeImageSource(image, value) {
    const fallback = "assets/taste-of-life-logo.jpg";
    image.src = safeImageUrl(value) || fallback;
    image.addEventListener("error", () => {
      if (!image.src.endsWith(fallback)) image.src = fallback;
    }, { once: true });
  }

  function formatMoney(cents) {
    return new Intl.NumberFormat(config.locale || "nl-NL", {
      style: "currency",
      currency: config.currency || "EUR"
    }).format(Number(cents || 0) / 100);
  }

  function friendlyError(error, fallback) {
    const message = String(error?.message || "");
    const code = String(error?.code || "");
    if (!navigator.onLine || /failed to fetch|network|abort/i.test(message)) {
      return "Geen verbinding. Er is niets gewijzigd; probeer het opnieuw.";
    }
    if (code === "23505" || /duplicate key|unique constraint/i.test(message)) {
      return "Deze SKU of unieke waarde wordt al gebruikt.";
    }
    if (/rate limit|too many requests|email rate/i.test(message)) {
      return "Er is net al een inloglink verstuurd. Wacht een minuut en gebruik de nieuwste e-mail.";
    }
    if (/row-level security|permission denied|jwt|not authorized|unauthorized/i.test(message)) {
      return "Je beheersessie is verlopen of heeft geen rechten. Log opnieuw in.";
    }
    if (/max_length|too long/i.test(message)) return "Een van de teksten is te lang.";
    return fallback;
  }

  function showToast(message, isError = false) {
    els.toast.textContent = message;
    els.toast.classList.toggle("error", isError);
    els.toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 3600);
  }

  async function fetchWithTimeout(input, init = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    const sourceSignal = init.signal;
    const forwardAbort = () => controller.abort();
    if (sourceSignal) sourceSignal.addEventListener("abort", forwardAbort, { once: true });
    try {
      return await window.fetch(input, { ...init, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
      if (sourceSignal) sourceSignal.removeEventListener("abort", forwardAbort);
    }
  }
})();
