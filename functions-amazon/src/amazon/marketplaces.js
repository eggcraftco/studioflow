// Which marketplace a sale came from, and what that implies.
//
// Amazon and eBay both key everything on a marketplace id, and both use it to
// decide three different things a connector cannot guess: which regional
// endpoint to call, which currency the money is quoted in, and which host a
// human would open to see the order. Getting the endpoint wrong is not a
// degraded call, it is a 403 — a European seller's orders are simply not
// visible from the North American endpoint.
//
// Kept as data rather than as branches, so adding a marketplace is one line
// and a test can walk every row. Pure: no network, no clock, no Firestore.
// Spec: NivaDesk_Amazon_eBay_Integration_AI_Spec.md §13, §20, §43.

/**
 * Amazon's marketplace ids are opaque strings, not country codes, and the same
 * seller account reaches several of them through ONE regional endpoint.
 */
const AMAZON_MARKETPLACES = Object.freeze({
  A1F83G8C2ARO7P: { country: "GB", currency: "GBP", region: "eu", host: "sellercentral.amazon.co.uk", name: "Amazon UK" },
  A1PA6795UKMFR9: { country: "DE", currency: "EUR", region: "eu", host: "sellercentral.amazon.de", name: "Amazon Germany" },
  A13V1IB3VIYZZH: { country: "FR", currency: "EUR", region: "eu", host: "sellercentral.amazon.fr", name: "Amazon France" },
  APJ6JRA9NG5V4: { country: "IT", currency: "EUR", region: "eu", host: "sellercentral.amazon.it", name: "Amazon Italy" },
  A1RKKUPIHCS9HS: { country: "ES", currency: "EUR", region: "eu", host: "sellercentral.amazon.es", name: "Amazon Spain" },
  A1805IZSGTT6HS: { country: "NL", currency: "EUR", region: "eu", host: "sellercentral.amazon.nl", name: "Amazon Netherlands" },
  A2NODRKZP88ZB9: { country: "SE", currency: "SEK", region: "eu", host: "sellercentral.amazon.se", name: "Amazon Sweden" },
  A1C3SOZRARQ6R3: { country: "PL", currency: "PLN", region: "eu", host: "sellercentral.amazon.pl", name: "Amazon Poland" },
  A2VIGQ35RCS4UG: { country: "AE", currency: "AED", region: "eu", host: "sellercentral.amazon.ae", name: "Amazon UAE" },
  A21TJRUUN4KGV: { country: "IN", currency: "INR", region: "eu", host: "sellercentral.amazon.in", name: "Amazon India" },
  ATVPDKIKX0DER: { country: "US", currency: "USD", region: "na", host: "sellercentral.amazon.com", name: "Amazon US" },
  A2EUQ1WTGCTBG2: { country: "CA", currency: "CAD", region: "na", host: "sellercentral.amazon.ca", name: "Amazon Canada" },
  A1AM78C64UM0Y8: { country: "MX", currency: "MXN", region: "na", host: "sellercentral.amazon.com.mx", name: "Amazon Mexico" },
  A2Q3Y263D00KWC: { country: "BR", currency: "BRL", region: "na", host: "sellercentral.amazon.com.br", name: "Amazon Brazil" },
  A1VC38T7YXB528: { country: "JP", currency: "JPY", region: "fe", host: "sellercentral.amazon.co.jp", name: "Amazon Japan" },
  A39IBJ37TRP1C6: { country: "AU", currency: "AUD", region: "fe", host: "sellercentral.amazon.com.au", name: "Amazon Australia" },
  A19VAU5U5O7RUS: { country: "SG", currency: "SGD", region: "fe", host: "sellercentral.amazon.sg", name: "Amazon Singapore" }
});

/** One endpoint serves every marketplace in its region. */
const AMAZON_ENDPOINTS = Object.freeze({
  na: "https://sellingpartnerapi-na.amazon.com",
  eu: "https://sellingpartnerapi-eu.amazon.com",
  fe: "https://sellingpartnerapi-fe.amazon.com"
});

/** eBay's marketplace ids ARE readable, and each has its own site host. */
const EBAY_MARKETPLACES = Object.freeze({
  EBAY_GB: { country: "GB", currency: "GBP", host: "www.ebay.co.uk", name: "eBay UK" },
  EBAY_US: { country: "US", currency: "USD", host: "www.ebay.com", name: "eBay US" },
  EBAY_DE: { country: "DE", currency: "EUR", host: "www.ebay.de", name: "eBay Germany" },
  EBAY_FR: { country: "FR", currency: "EUR", host: "www.ebay.fr", name: "eBay France" },
  EBAY_IT: { country: "IT", currency: "EUR", host: "www.ebay.it", name: "eBay Italy" },
  EBAY_ES: { country: "ES", currency: "EUR", host: "www.ebay.es", name: "eBay Spain" },
  EBAY_NL: { country: "NL", currency: "EUR", host: "www.ebay.nl", name: "eBay Netherlands" },
  EBAY_IE: { country: "IE", currency: "EUR", host: "www.ebay.ie", name: "eBay Ireland" },
  EBAY_AT: { country: "AT", currency: "EUR", host: "www.ebay.at", name: "eBay Austria" },
  EBAY_BE: { country: "BE", currency: "EUR", host: "www.ebay.be", name: "eBay Belgium" },
  EBAY_CH: { country: "CH", currency: "CHF", host: "www.ebay.ch", name: "eBay Switzerland" },
  EBAY_PL: { country: "PL", currency: "PLN", host: "www.ebay.pl", name: "eBay Poland" },
  EBAY_CA: { country: "CA", currency: "CAD", host: "www.ebay.ca", name: "eBay Canada" },
  EBAY_AU: { country: "AU", currency: "AUD", host: "www.ebay.com.au", name: "eBay Australia" }
});

/**
 * What a marketplace id means, or null.
 *
 * Null, never a default: guessing GB for an unrecognised id would send a
 * German seller's calls to the wrong endpoint and quote their money in the
 * wrong currency, and both failures look like the marketplace being empty.
 */
function amazonMarketplace(id) {
  const key = String(id || "").trim();
  return Object.prototype.hasOwnProperty.call(AMAZON_MARKETPLACES, key) ? AMAZON_MARKETPLACES[key] : null;
}

function ebayMarketplace(id) {
  const key = String(id || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(EBAY_MARKETPLACES, key) ? EBAY_MARKETPLACES[key] : null;
}

/** The SP-API host for a marketplace, or null when we do not know the marketplace. */
function amazonEndpointFor(marketplaceId) {
  const market = amazonMarketplace(marketplaceId);
  return market ? AMAZON_ENDPOINTS[market.region] || null : null;
}

/**
 * Every marketplace a connection covers must sit in ONE region, because one
 * connection holds one endpoint's credentials. A seller listing in both the UK
 * and the US has two connections, and saying so at setup is far better than
 * discovering it as a 403 on the first sync.
 */
function amazonRegionsFor(marketplaceIds) {
  const regions = new Set();
  const unknown = [];
  for (const id of Array.isArray(marketplaceIds) ? marketplaceIds : []) {
    const market = amazonMarketplace(id);
    if (!market) unknown.push(String(id));
    else regions.add(market.region);
  }
  return { regions: [...regions].sort(), unknown, single: regions.size <= 1 };
}

module.exports = {
  AMAZON_MARKETPLACES, AMAZON_ENDPOINTS, EBAY_MARKETPLACES,
  amazonMarketplace, ebayMarketplace, amazonEndpointFor, amazonRegionsFor
};
