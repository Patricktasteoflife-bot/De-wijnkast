/*
 * Taste of Life beheerapp -> De Wijnkast
 * Gebruik uitsluitend met een ingelogde Supabase-beheerder.
 * Klanten krijgen dit bestand en het beheer-token nooit nodig.
 */

export class WijnkastAdminConnector {
  constructor({ supabaseUrl, anonKey, accessToken }) {
    this.base = String(supabaseUrl || "").replace(/\/$/, "");
    this.anonKey = anonKey;
    this.accessToken = accessToken;
  }

  headers(extra = {}) {
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  async request(path, options = {}) {
    const response = await fetch(`${this.base}/rest/v1/${path}`, {
      ...options,
      headers: this.headers(options.headers)
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(body?.message || "Wijnkast-koppeling mislukt.");
    return body;
  }

  listProducts() {
    return this.request("products?select=*&order=sort_order.asc,created_at.desc");
  }

  createProduct(product) {
    return this.request("products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(product)
    });
  }

  updateProduct(id, changes) {
    return this.request(`products?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ ...changes, updated_at: new Date().toISOString() })
    });
  }

  setStock(id, stock) {
    return this.updateProduct(id, { stock: Math.max(0, Number(stock)) });
  }

  listOrders(status = "") {
    const filter = status ? `&status=eq.${encodeURIComponent(status)}` : "";
    return this.request(`orders?select=*,order_items(*)&order=created_at.desc${filter}`);
  }

  updateOrderStatus(id, status) {
    return this.request(`orders?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ status, updated_at: new Date().toISOString() })
    });
  }
}

