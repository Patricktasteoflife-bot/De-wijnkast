const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sourcePath = path.resolve(__dirname, "..", "beheer.js");

function createHarness() {
  const elements = new Map();
  const createElement = () => ({
    hidden: false,
    disabled: false,
    textContent: "",
    dataset: {},
    classList: {
      add() {},
      remove() {},
      toggle() {}
    },
    setAttribute() {},
    addEventListener() {},
    querySelectorAll: () => []
  });
  const document = {
    body: { classList: { add() {}, remove() {} } },
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, createElement());
      return elements.get(selector);
    }
  };

  let testSource = fs.readFileSync(sourcePath, "utf8");
  testSource = testSource.replace("  init();", "  // init uitgeschakeld voor beheerlogintests");
  testSource = testSource.replace(
    /\}\)\(\);\s*$/,
    "  window.__beheerAuth = { state, els, requestMagicLink, authorizeAndLoad, friendlyError };\n})();"
  );

  const sandbox = {
    URL,
    Intl,
    console,
    document,
    navigator: { onLine: true },
    AbortController,
    Event,
    Date,
    setTimeout: () => 1,
    clearTimeout() {},
    WIJNKAST_CONFIG: {
      adminRedirectUrl: "https://de-wijnkast-v2.pages.dev/beheer"
    }
  };
  sandbox.window = sandbox;
  vm.runInNewContext(testSource, sandbox, { filename: "beheer.js" });
  return sandbox.__beheerAuth;
}

test("een technische autorisatiefout bewaart de lokale sessie", async () => {
  const { state, els, authorizeAndLoad } = createHarness();
  let signOutCalls = 0;
  state.client = {
    rpc: async () => ({ data: null, error: new Error("Failed to fetch") }),
    auth: {
      signOut: async () => { signOutCalls += 1; }
    }
  };

  await authorizeAndLoad({ access_token: "test" });

  assert.equal(signOutCalls, 0);
  assert.equal(state.authorizing, false);
  assert.equal(els.loginView.hidden, false);
  assert.match(els.loginMessage.textContent, /Geen verbinding/);
});

test("een expliciet geweigerd account wordt lokaal uitgelogd", async () => {
  const { state, els, authorizeAndLoad } = createHarness();
  let signOutCalls = 0;
  state.client = {
    rpc: async (name) => name === "is_wijnkast_admin"
      ? { data: false, error: null }
      : { data: false, error: null },
    auth: {
      signOut: async (options) => {
        signOutCalls += 1;
        assert.equal(options.scope, "local");
      }
    }
  };

  await authorizeAndLoad({ access_token: "test" });

  assert.equal(signOutCalls, 1);
  assert.equal(state.authorizing, false);
  assert.equal(els.loginMessage.textContent, "Dit account heeft geen beheerrechten.");
});

test("een geworpen inlogfout herstelt de verzendknop", async () => {
  const { state, els, requestMagicLink } = createHarness();
  state.client = {
    auth: {
      signInWithOtp: async () => { throw new Error("Failed to fetch"); }
    }
  };

  await requestMagicLink({ preventDefault() {} });

  assert.equal(els.loginButton.disabled, false);
  assert.equal(els.loginButton.textContent, "Stuur mij de inloglink");
  assert.match(els.loginMessage.textContent, /Geen verbinding/);
});

test("de magic-link maakt nooit stilzwijgend een nieuw account aan", async () => {
  const { state, els, requestMagicLink } = createHarness();
  let options;
  state.client = {
    auth: {
      signInWithOtp: async (received) => {
        options = received;
        return { error: null };
      }
    }
  };

  await requestMagicLink({ preventDefault() {} });

  assert.equal(options.email, "patrick.tasteoflife@hotmail.com");
  assert.equal(options.options.shouldCreateUser, false);
  assert.equal(els.loginButton.disabled, true);
  assert.match(els.loginButton.textContent, /Link verstuurd/);
});

test("Supabase-inlogcodes krijgen een duidelijke Nederlandse melding", () => {
  const { friendlyError } = createHarness();

  assert.match(friendlyError({ code: "over_email_send_rate_limit" }, "fallback"), /nieuwste e-mail/);
  assert.match(friendlyError({ code: "over_request_rate_limit" }, "fallback"), /Wacht even/);
  assert.match(friendlyError({ code: "email_address_not_authorized" }, "fallback"), /mag geen beheerlink ontvangen/);
  assert.match(friendlyError({ code: "otp_disabled" }, "fallback"), /e-mail is uitgeschakeld/);
});
