const reply = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'"
  }
});

const trimSlash = (value) => String(value || "").replace(/\/$/, "");
const normalizeIdentity = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export const WEBSITE_WINES = [
  {
    sku: "TOL-WEB-20267959",
    name: "Bourgogne Chardonnay Dessous Les Mues",
    producer: "Bader-Mimeur",
    vintage: "2023",
    region: "Côte de Beaune · Bourgogne",
    country: "Frankrijk",
    color: "Wit",
    description: "Elegante, levendige Chardonnay met limoen, groene appel en witte perzik. Kalkrijke mineraliteit en een frisse, precieze afdronk.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/badermimeur-chardonnay-high.png",
    price_cents: 3795,
    stock: 2,
    active: true,
    sort_order: 5001
  },
  {
    sku: "TOL-WEB-21075276",
    name: "Merlot",
    producer: "De Trafford",
    vintage: "2014",
    region: "Stellenbosch",
    country: "Zuid-Afrika",
    color: "Rood",
    description: "Rijke, zachte Merlot met zwarte kers, pruim en vijg, aangevuld met chocolade, mokka, ceder en tabak.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/de-trafford-merlot-high-high.png",
    price_cents: 3495,
    stock: 2,
    active: true,
    sort_order: 5002
  },
  {
    sku: "TOL-WEB-22413809",
    name: "Alexander Valley Cabernet Sauvignon",
    producer: "Frei Brothers",
    vintage: "2021",
    region: "Alexander Valley · Californië",
    country: "Verenigde Staten",
    color: "Rood",
    description: "Ronde Cabernet Sauvignon met cassis, pruim en zwarte kers, verweven met vanille, ceder en fijne specerijen.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/bbc88b2d9b40b657ccf8407a2ccd0d01ead63a2c_801260_2-high.png",
    price_cents: 2995,
    stock: 1,
    active: true,
    sort_order: 5003
  },
  {
    sku: "TOL-WEB-20105711",
    name: "Bedoba Orange",
    producer: "Kakheti Company",
    vintage: "2022",
    region: "Kakheti",
    country: "Georgië",
    color: "Orange",
    description: "Droge qvevriwijn van Rkatsiteli en Mtsvane met gedroogde abrikoos, sinaasappelschil, thee en honing, plus een fijne tanninestructuur.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/kakheti-orange-high.png",
    price_cents: 1595,
    stock: 3,
    active: true,
    sort_order: 1001
  },
  {
    sku: "TOL-WEB-22440335",
    name: "Vin de Constance (0,5L)",
    producer: "Klein Constantia",
    vintage: "2022",
    region: "Constantia",
    country: "Zuid-Afrika",
    color: "Dessert wijn",
    description: "Iconische dessertwijn van Muscat de Frontignan met abrikoos, honing, sinaasappelschil en perzik, in balans gehouden door levendige zuren.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/bxvdc21w2_0_1771339420249-removebg-preview-high.png",
    price_cents: 6495,
    stock: 1,
    active: true,
    sort_order: 5004
  },
  {
    sku: "TOL-WEB-20195992",
    name: "Cariñena DO Garnacha",
    producer: "Libre y Salvaje",
    vintage: "2021",
    region: "Cariñena · Aragón",
    country: "Spanje",
    color: "Rood",
    description: "Sappige Garnacha van oude stokken met bessen, kers, pruim, kruiden, peper en viooltjes. Fris, soepel en karaktervol.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/libre-y-salvaje-high.png",
    price_cents: 1695,
    stock: 1,
    active: true,
    sort_order: 1002
  },
  {
    sku: "TOL-WEB-22413775",
    name: "Napa Valley Cabernet Sauvignon",
    producer: "Louis M. Martini",
    vintage: "2019",
    region: "Napa Valley · Californië",
    country: "Verenigde Staten",
    color: "Rood",
    description: "Volle, gestructureerde Napa Cabernet met cassis, pruim, donkere chocolade, vanille en een verfijnde houttoets.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/655e93dfc65ddfd3863dcbe5f77b9e2f2caf2b80_801207-high.png",
    price_cents: 5495,
    stock: 2,
    active: true,
    sort_order: 5005
  },
  {
    sku: "TOL-WEB-22307296",
    name: "Moscato D’Asti",
    producer: "Massimo Abbate",
    vintage: "2024",
    region: "Piemonte",
    country: "Italië",
    color: "Dessert wijn",
    description: "Licht mousserende, zoete Moscato met sinaasappel, perzik en tropisch fruit. Fris, aromatisch en ideaal bij een licht dessert.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/moscato-high.webp",
    price_cents: 1459,
    stock: 1,
    active: true,
    sort_order: 1003
  },
  {
    sku: "TOL-WEB-18332051",
    name: "Brut Impérial 75 cl",
    producer: "Moët & Chandon",
    vintage: null,
    region: "Champagne",
    country: "Frankrijk",
    color: "Champagne",
    description: "Klassieke Brut van Pinot Noir, Pinot Meunier en Chardonnay. Droog, fris en levendig met fruit, fijne briochetonen en elegante bubbels.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/moet-high-high.png",
    price_cents: 3795,
    stock: 1,
    active: true,
    sort_order: 1004
  },
  {
    sku: "TOL-WEB-22154488",
    name: "8 Years in the Desert",
    producer: "Orin Swift Cellars",
    vintage: "2022",
    region: "Californië",
    country: "Verenigde Staten",
    color: "Rood",
    description: "Krachtige Californische blend met Zinfandel in de hoofdrol. Bramen, blauwe bessen en kersen worden aangevuld met vanille, chocolade en zoethout.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/orin-swift-8-years-in-the-desert-2022-768x1024-1-high.png",
    price_cents: 6495,
    stock: 1,
    active: true,
    sort_order: 5006
  },
  {
    sku: "TOL-WEB-18586361",
    name: "California Chardonnay",
    producer: "Panamera",
    vintage: "2023",
    region: "Californië",
    country: "Verenigde Staten",
    color: "Wit",
    description: "Romige Chardonnay met tropisch fruit, citrus, vanille en boter. Subtiel hout en een lange, zachte afdronk.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/pana01017_6-high.png",
    price_cents: 1495,
    stock: 6,
    active: true,
    sort_order: 1005
  },
  {
    sku: "TOL-WEB-22414988",
    name: "Chassagne-Montrachet 1er Cru Les Embazées",
    producer: "Paul Gayot",
    vintage: "2022",
    region: "Chassagne-Montrachet · Bourgogne",
    country: "Frankrijk",
    color: "Wit",
    description: "Rijke en elegante Premier Cru Chardonnay met citrus, perzik, witte bloemen, toast en een lange minerale finale.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/gayo05022-removebg-preview-high.png",
    price_cents: 11995,
    stock: 1,
    active: true,
    sort_order: 5007
  },
  {
    sku: "TOL-WEB-22164419",
    name: "Blue Belle Chardonnay",
    producer: "RedHeads Studio",
    vintage: "2022",
    region: "Zuid-Australië",
    country: "Australië",
    color: "Wit",
    description: "Volle, ronde Chardonnay met rijpe perzik, ananas en citrus, aangevuld met vanille, toast en een zachte botertoets.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/rh068_22_0_1771338770415-high.png",
    price_cents: 1695,
    stock: 3,
    active: true,
    sort_order: 1006
  },
  {
    sku: "TOL-WEB-22164654",
    name: "Coco Rôtie Syrah / Viognier",
    producer: "RedHeads Studio",
    vintage: "2022",
    region: "Zuid-Australië",
    country: "Australië",
    color: "Rood",
    description: "Rhône-geïnspireerde blend met bramen, zwarte kersen, viooltjes en zwarte peper. Krachtig en kruidig, met een elegante florale lift.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/rh051_22_0_1771341691796-high.png",
    price_cents: 1375,
    stock: 5,
    active: true,
    sort_order: 1007
  },
  {
    sku: "TOL-WEB-22164268",
    name: "Dan'Jango Shiraz",
    producer: "RedHeads Studio",
    vintage: "2022",
    region: "McLaren Vale",
    country: "Australië",
    color: "Rood",
    description: "Volle McLaren Vale Shiraz met bramen, zwarte kersen en blauwe bessen, plus zwarte peper, specerijen en een licht rokerige houttoets.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/rh029_22_0_1771340638877-high.png",
    price_cents: 1295,
    stock: 1,
    active: true,
    sort_order: 1008
  },
  {
    sku: "TOL-WEB-22164692",
    name: "The Red Sedan Cabernet Sauvignon / Shiraz",
    producer: "RedHeads Studio",
    vintage: "2022",
    region: "Zuid-Australië",
    country: "Australië",
    color: "Rood",
    description: "Krachtige blend met cassis, bramen en zwarte kersen, aangevuld met zwarte peper, ceder en chocolade. Rijpe tannines en een lange afdronk.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/rh025_22_0_1771341693984-high.png",
    price_cents: 1095,
    stock: 4,
    active: true,
    sort_order: 1009
  },
  {
    sku: "TOL-WEB-22152679",
    name: "Whip-Hand Cabernet Sauvignon",
    producer: "RedHeads Studio",
    vintage: "2018",
    region: "McLaren Vale",
    country: "Australië",
    color: "Rood",
    description: "Geconcentreerde Cabernet met cassis, zwarte bessen en bramen, ceder, specerijen, vanille en een vleug pure chocolade.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/rh083_18_0_1771338772431-high.png",
    price_cents: 3495,
    stock: 1,
    active: true,
    sort_order: 1010
  },
  {
    sku: "TOL-WEB-18698632",
    name: "The Rhebok Red Blend",
    producer: "Rhebokskloof",
    vintage: "2019",
    region: "Paarl",
    country: "Zuid-Afrika",
    color: "Rood",
    description: "Blend van Syrah, Mourvèdre en Grenache met kersen, zwarte bessen en specerijen. Soepel en fruitig, met zachte tannines en een kruidige finale.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/rhebokskloof-the-rhebok-high-high.png",
    price_cents: 2195,
    stock: 1,
    active: true,
    sort_order: 5008
  },
  {
    sku: "TOL-WEB-22420061",
    name: "Jägerberg Chardonnay | Südsteiermark",
    producer: "Weingut Hannes Sabathi",
    vintage: "2022",
    region: "Südsteiermark",
    country: "Oostenrijk",
    color: "Wit",
    description: "Terroirgedreven Chardonnay met citrus, rijpe appel en witte perzik, subtiele hazelnoot en toast, en een lange kalkrijke mineraliteit.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/saba06021-high.png",
    price_cents: 2495,
    stock: 3,
    active: true,
    sort_order: 1011
  },
  {
    sku: "TOL-WEB-22164092",
    name: "NZ 66 Sauvignon Blanc",
    producer: "Weingut Hannes Sabathi",
    vintage: "2024",
    region: "Südsteiermark",
    country: "Oostenrijk",
    color: "Wit",
    description: "Strakke Sauvignon Blanc met limoen, grapefruit en groene appel, kruidige tonen en een kalkachtige, mineraalgedreven afdronk.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/saba10024-1-high.png",
    price_cents: 1395,
    stock: 2,
    active: true,
    sort_order: 1012
  },
  {
    sku: "TOL-WEB-22164147",
    name: "Südsteiermark DAC CA 66 Chardonnay",
    producer: "Weingut Hannes Sabathi",
    vintage: "2023",
    region: "Südsteiermark DAC",
    country: "Oostenrijk",
    color: "Wit",
    description: "Elegante Chardonnay met citrus, groene appel en witte perzik, subtiele amandel en toast, frisse zuren en een kalkrijke spanning.",
    image_url: "https://primary.jwwb.nl/public/u/y/n/temp-dnzvcnsiybyeotqnkxst/saba05022_3-high.png",
    price_cents: 1395,
    stock: 4,
    active: true,
    sort_order: 1013
  }
];

export function winesMissingFrom(existingProducts) {
  const existingSkus = new Set(
    existingProducts
      .map((product) => String(product?.sku || "").trim().toUpperCase())
      .filter(Boolean)
  );
  const existingTitles = new Set(
    existingProducts.map((product) => normalizeIdentity([
      product?.producer,
      product?.name,
      product?.vintage
    ].filter(Boolean).join(" ")))
  );

  return WEBSITE_WINES.filter((wine) => {
    if (existingSkus.has(wine.sku)) return false;
    const title = normalizeIdentity([wine.producer, wine.name, wine.vintage].filter(Boolean).join(" "));
    return !existingTitles.has(title);
  });
}

export async function onRequestPost({ request, env }) {
  const authorization = String(request?.headers?.get("Authorization") || "");
  const accessToken = authorization.match(/^Bearer\s+(\S+)$/i)?.[1] || "";
  if (!accessToken) {
    return reply({ error: "Log opnieuw in bij Beheer.", code: "LOGIN_REQUIRED" }, 401);
  }

  const apiKey = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !apiKey) {
    return reply({
      error: "De voorraadkoppeling is nog niet ingesteld.",
      code: "NOT_CONFIGURED"
    }, 503);
  }

  const expectedBottleCount = WEBSITE_WINES.reduce((sum, wine) => sum + wine.stock, 0);
  if (WEBSITE_WINES.length !== 21 || expectedBottleCount !== 46) {
    return reply({ error: "De vaste importset is ongeldig.", code: "IMPORT_SET_INVALID" }, 500);
  }

  const baseUrl = trimSlash(env.SUPABASE_URL);
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };

  try {
    const adminResponse = await fetch(`${baseUrl}/rest/v1/rpc/is_wijnkast_admin`, {
      method: "POST",
      headers,
      body: "{}"
    });
    const isAdmin = await adminResponse.json().catch(() => false);
    if (!adminResponse.ok || isAdmin !== true) {
      return reply({ error: "Deze sessie heeft geen beheerrechten.", code: "ADMIN_REQUIRED" }, 403);
    }
  } catch (error) {
    console.error("Beheerrechten voor de wijnimport konden niet worden gecontroleerd", error?.message || error);
    return reply({ error: "De beheerrechten konden niet veilig worden gecontroleerd." }, 502);
  }

  let existingResponse;
  let existingProducts;
  try {
    existingResponse = await fetch(`${baseUrl}/rest/v1/products?select=sku,name,producer,vintage`, {
      method: "GET",
      headers
    });
    existingProducts = await existingResponse.json().catch(() => []);
  } catch (error) {
    console.error("Bestaande wijnen konden niet worden gecontroleerd", error?.message || error);
    return reply({ error: "De bestaande voorraad kon niet veilig worden gecontroleerd." }, 502);
  }
  if (!existingResponse.ok || !Array.isArray(existingProducts)) {
    return reply({ error: "De bestaande voorraad kon niet veilig worden gecontroleerd." }, 502);
  }

  const missing = winesMissingFrom(existingProducts);
  if (!missing.length) {
    return reply({
      added: 0,
      existing: WEBSITE_WINES.length,
      total: WEBSITE_WINES.length,
      bottles: expectedBottleCount
    });
  }

  const insertedSkus = [];
  const failedSkus = [];
  for (const wine of missing) {
    try {
      const insertResponse = await fetch(`${baseUrl}/rest/v1/products`, {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=representation"
        },
        body: JSON.stringify(wine)
      });
      const inserted = await insertResponse.json().catch(() => []);
      if (insertResponse.ok && Array.isArray(inserted) && inserted.length === 1) {
        insertedSkus.push(wine.sku);
      } else {
        failedSkus.push(wine.sku);
        console.error("Websitewijn is door de voorraad geweigerd", wine.sku, insertResponse.status);
      }
    } catch (error) {
      failedSkus.push(wine.sku);
      console.error("Websitewijn kon niet worden toegevoegd", wine.sku, error?.message || error);
    }
  }

  if (failedSkus.length) {
    return reply({
      error: "Niet alle wijnen konden veilig worden toegevoegd.",
      added: insertedSkus.length,
      failed: failedSkus
    }, 502);
  }

  return reply({
    added: insertedSkus.length,
    existing: WEBSITE_WINES.length - insertedSkus.length,
    total: WEBSITE_WINES.length,
    bottles: expectedBottleCount
  }, 201);
}
