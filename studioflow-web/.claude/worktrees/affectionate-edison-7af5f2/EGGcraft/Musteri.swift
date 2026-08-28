import Foundation
import FirebaseFirestore

struct Musteri: Identifiable, Codable, Equatable {
    @DocumentID var id: String?
    
    var companyId: String = "test_studio_123"
    var name: String
    var email: String
    var phone: String
    var instagram: String
    var address: String
    var streetAddress: String?
    var city: String?
    var postalCode: String?
    var country: String?
    // Latest per-order shipping destination (populated by the WooCommerce/Shopify/inbound
    // webhooks). Optional so existing customers without these keys still decode. Read-only
    // in the app — the editable source of truth is each order's shipping fields.
    var shippingAddress: String?
    var shippingStreetAddress: String?
    var shippingCity: String?
    var shippingPostalCode: String?
    var shippingCountry: String?
    var shippingPhone: String?
    // Store-integration provenance (written by the WooCommerce/Shopify/inbound
    // webhooks). Optional so pre-integration customers still decode. Read-only in
    // the app — the resyncIntegrationCustomer callable replays the stored payload.
    var source: String?                     // "woocommerce" | "shopify" | "inbound" | ""
    var externalCustomerId: String?
    var integrationSyncedAt: Date?          // when a store webhook last touched this customer
    var integrationLastPayload: String?     // the store's last normalized payload (JSON string, ≤6KB)
    // Secondary phone the web/callable path maintains. Decoded (and re-encoded on
    // full-document saves) so the app's setData writes never wipe it.
    var primaryPhone: String?
    // The customer's OWN WhatsApp number — kept apart from the store-fed
    // `phone` so "Phone / WhatsApp" stops being one ambiguous box. Optional so
    // existing customers decode; full-document saves re-encode it.
    var whatsappNumber: String?
    // Trade customers: the business the person buys for. Same decode/re-encode
    // contract as whatsappNumber.
    var company: String?
    // Customer segments ("VIP", "Wholesale"...). Written through the
    // updateWebCustomer callable with KEY-PRESENT semantics — decoded here so
    // full-document local writes preserve them.
    var tags: [String]?
    // Contact preferences (mirrors the web slice). All optional so pre-feature
    // customers still decode; full-document local writes re-encode them.
    var preferredChannel: String?           // "" | "phone" | "whatsapp" | "email" | "instagram"
    var doNotContact: Bool?
    var marketingOptIn: String?             // "" | "subscribed" | "unsubscribed"
    var nextFollowUpDate: Date?             // Timestamp | null on the server
    var notes: String
    var lastContactDate: Date
    var profileImageUrl: String // Profile photo URL
    
    init(id: String? = nil, companyId: String = "test_studio_123", name: String = "", email: String = "", phone: String = "", instagram: String = "", address: String = "", streetAddress: String = "", city: String = "", postalCode: String = "", country: String = "", notes: String = "", lastContactDate: Date = Date(), profileImageUrl: String = "") {
        self.id = id
        self.companyId = companyId
        self.name = name
        self.email = email
        self.phone = phone
        self.instagram = instagram
        self.address = address
        self.streetAddress = streetAddress
        self.city = city
        self.postalCode = postalCode
        self.country = country
        self.notes = notes
        self.lastContactDate = lastContactDate
        self.profileImageUrl = profileImageUrl
    }

    /// Non-optional views over the preference fields, for UI code.
    var segmentTags: [String] { tags ?? [] }
    var isDoNotContact: Bool { doNotContact ?? false }

    var detailedAddressText: String {
        [streetAddress, city, postalCode, country]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }

    mutating func syncAddressFromDetailedFields() {
        let detailedAddress = detailedAddressText
        if !detailedAddress.isEmpty || streetAddress != nil || city != nil || postalCode != nil || country != nil {
            address = detailedAddress
        }
    }
}
