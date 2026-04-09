/**
 * Tech detection signatures.
 * Maps technology names to arrays of patterns to search in HTML source.
 */
const TECH_SIGNATURES = [
  {
    technology: 'Shopify',
    patterns: ['cdn.shopify.com', 'Shopify.theme', '/collections/', 'shopify-section'],
  },
  {
    technology: 'WordPress',
    patterns: ['/wp-content/', '/wp-includes/', 'wp-json', 'generator" content="WordPress'],
  },
  {
    technology: 'WooCommerce',
    patterns: ['woocommerce', 'wc-ajax', '/wc/', 'WooCommerce'],
  },
  {
    technology: 'WhatsApp Business',
    patterns: ['wa.me/', 'api.whatsapp.com', 'web.whatsapp.com', 'WhatsApp'],
  },
  {
    technology: 'Wix',
    patterns: ['static.wixstatic.com', 'wix.com/dpages', 'wixsite.com'],
  },
  {
    technology: 'Squarespace',
    patterns: ['squarespace.com', 'sqsp.net', 'static1.squarespace.com'],
  },
  {
    technology: 'Magento',
    patterns: ['Mage.Cookies', '/skin/frontend/', 'magento', 'Magento_'],
  },
  {
    technology: 'Webflow',
    patterns: ['webflow.io', 'assets.website-files.com', 'Webflow'],
  },
  {
    technology: 'GoDaddy',
    patterns: ['gdcorp.com', 'sucuri.net/packs/godaddy', 'godaddy'],
  },
  {
    technology: 'React',
    patterns: ['react.development.js', 'react.production.min.js', '__REACT_DEVTOOLS', 'data-reactroot'],
  },
  {
    technology: 'Google Analytics',
    patterns: ['google-analytics.com/analytics.js', 'gtag(', 'UA-', 'G-'],
  },
  {
    technology: 'Facebook Pixel',
    patterns: ['connect.facebook.net/en_US/fbevents.js', 'fbq('],
  },
]

/**
 * Detect technologies used on a website from its HTML source.
 *
 * @param {string} html - Raw HTML string of the page
 * @returns {Array<{ technology: string, confidence: string, evidence: string }>}
 */
export function detectTech(html) {
  const detections = []

  for (const sig of TECH_SIGNATURES) {
    for (const pattern of sig.patterns) {
      if (html.includes(pattern)) {
        detections.push({
          technology: sig.technology,
          confidence: 'HIGH',
          evidence: pattern,
        })
        break // one match per tech is enough
      }
    }
  }

  return detections
}
