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
    var notes: String
    var lastContactDate: Date
    var profileImageUrl: String // 🌟 YENİ: Profil Fotoğrafı Linki
    
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
