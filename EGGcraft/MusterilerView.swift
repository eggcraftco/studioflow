import SwiftUI
import UniformTypeIdentifiers
import FirebaseFirestore

enum MusteriSiralamaTuru { case sonGorusme, enCokSiparis }

struct MusterilerView: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("seciliParaBirimi") private var seciliParaBirimi: String = "£"
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    
    @Binding var seciliSiparis: Siparis?
    @Binding var aktifSekme: String
    @Binding var seciliMusteri: Musteri? // 🌟 STATE YERİNE BINDING OLDU!
    
    @State private var aramaMetni: String = ""
    @State private var seciliSiralama: MusteriSiralamaTuru = .sonGorusme
    @State private var phoneShowsCustomerDetail: Bool = false
    @AppStorage("ordersSidebarWidth") private var ordersSidebarWidth: Double = 380
    @AppStorage("ordersSidebarVisible") private var isOrdersSidebarVisible: Bool = true
    @State private var temporaryOrdersSidebarWidth: Double?
    @State private var orderSidebarResizerHovering: Bool = false
    
    var bgSidebar: Color { colorScheme == .dark ? Color(white: 0.12) : Color(white: 0.97) }
    var bgMain: Color { colorScheme == .dark ? Color(white: 0.08) : Color(white: 0.93) }
    private var isPhoneLayout: Bool { horizontalSizeClass == .compact }
    private let minOrdersSidebarWidth: Double = 300
    private let maxOrdersSidebarWidth: Double = 720
    private let defaultOrdersSidebarWidth: Double = 380
    private var effectiveOrdersSidebarWidth: Double {
        min(max(temporaryOrdersSidebarWidth ?? ordersSidebarWidth, minOrdersSidebarWidth), maxOrdersSidebarWidth)
    }
    
    var aramaSonuclari: [Musteri] {
        let filtrelenmis = aramaMetni.isEmpty ? firebaseManager.musteriler : firebaseManager.musteriler.filter {
            $0.name.localizedStandardContains(aramaMetni) ||
            $0.email.localizedStandardContains(aramaMetni) ||
            $0.phone.localizedStandardContains(aramaMetni) ||
            $0.instagram.localizedStandardContains(aramaMetni) ||
            $0.address.localizedStandardContains(aramaMetni) ||
            ($0.streetAddress ?? "").localizedStandardContains(aramaMetni) ||
            ($0.city ?? "").localizedStandardContains(aramaMetni) ||
            ($0.postalCode ?? "").localizedStandardContains(aramaMetni) ||
            ($0.country ?? "").localizedStandardContains(aramaMetni)
        }
        
        if seciliSiralama == .enCokSiparis {
            return filtrelenmis.sorted { m1, m2 in
                let count1 = firebaseManager.siparisler.filter { $0.customerName.lowercased() == m1.name.lowercased() }.count
                let count2 = firebaseManager.siparisler.filter { $0.customerName.lowercased() == m2.name.lowercased() }.count
                if count1 == count2 { return m1.lastContactDate > m2.lastContactDate }
                return count1 > count2
            }
        } else {
            return filtrelenmis.sorted { $0.lastContactDate > $1.lastContactDate }
        }
    }

    private func musteriAnahtari(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func designBasliklari(icin musteri: Musteri) -> [String] {
        let hedefAnahtar = musteriAnahtari(musteri.name)
        guard !hedefAnahtar.isEmpty else { return [] }

        let orders = firebaseManager.siparisler
            .filter { musteriAnahtari($0.customerName) == hedefAnahtar }
            .sorted { $0.paymentDate > $1.paymentDate }

        var titles = orders
            .prefix(3)
            .map {
                let design = $0.designName.trimmingCharacters(in: .whitespacesAndNewlines)
                return design.isEmpty ? t("Untitled design", lang: seciliDil) : design
            }
        if orders.count > titles.count {
            titles.append("+\(orders.count - titles.count) \(t("more", lang: seciliDil))")
        }
        return titles
    }
    
    var body: some View {
        Group {
            if isPhoneLayout {
                phoneCustomersView
            } else {
                desktopCustomersView
            }
        }
        .onAppear {
            if isPhoneLayout, seciliMusteri != nil {
                phoneShowsCustomerDetail = true
            }
        }
        .onChange(of: seciliMusteri?.id) { _, newValue in
            if isPhoneLayout, newValue != nil {
                phoneShowsCustomerDetail = true
            }
        }
        .onChange(of: firebaseManager.musteriler) { _, guncelMusteriler in
            guard let seciliId = seciliMusteri?.id,
                  let guncelMusteri = guncelMusteriler.first(where: { $0.id == seciliId }),
                  guncelMusteri != seciliMusteri else { return }
            seciliMusteri = guncelMusteri
        }
    }

    private var desktopCustomersView: some View {
        HStack(spacing: 0) {
            if isOrdersSidebarVisible {
                VStack(spacing: 0) {
                    VStack(spacing: 15) {
                        HStack(spacing: 10) {
                            HStack {
                                Image(systemName: "magnifyingglass").foregroundColor(.gray)
                                TextField(t("Search...", lang: seciliDil), text: $aramaMetni).textFieldStyle(.plain).foregroundColor(.primary)
                            }
                            .padding(10)
                            .background(Color.primary.opacity(0.05))
                            .cornerRadius(8)

                            Button {
                                withAnimation(.snappy) {
                                    isOrdersSidebarVisible = false
                                }
                                syncWorkspaceSidebarLayout()
                            } label: {
                                Image(systemName: "sidebar.leading")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundColor(.blue)
                                    .frame(width: 32, height: 32)
                                    .background(Color.blue.opacity(0.10))
                                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .help(t("Hide customers list", lang: seciliDil))
                        }
                        HStack {
                            SolMenuSiralamaButonu(title: t("Recent", lang: seciliDil), isSelected: seciliSiralama == .sonGorusme) { seciliSiralama = .sonGorusme }
                            SolMenuSiralamaButonu(title: t("Most Orders", lang: seciliDil), isSelected: seciliSiralama == .enCokSiparis) { seciliSiralama = .enCokSiparis }
                            Spacer()
                        }
                    }.padding(20)
                    Divider().background(Color.primary.opacity(0.1))
                    ScrollView {
                        VStack(spacing: 12) {
                            ForEach(aramaSonuclari) { musteri in
                                MusteriKarti(musteri: musteri, isSelected: seciliMusteri?.id == musteri.id, designNames: designBasliklari(icin: musteri))
                                    .onTapGesture { seciliMusteri = musteri }
                                    .contextMenu { Button(role: .destructive) { silMusteri(musteri) } label: { Label(t("Delete", lang: seciliDil), systemImage: "trash") } }
                            }
                        }.padding(20)
                    }
                    VStack(alignment: .leading) { HStack { Image(systemName: "person.3.fill").foregroundColor(.gray); Text("\(firebaseManager.musteriler.count) \(t("Customers", lang: seciliDil))").font(.system(size: 14, weight: .bold)).foregroundColor(.primary) } }.padding(20).frame(maxWidth: .infinity, alignment: .leading).background(bgSidebar)
                }
                .frame(width: effectiveOrdersSidebarWidth)
                .background(bgSidebar)
                .transaction { transaction in
                    transaction.animation = nil
                }

                OrdersSidebarResizeHandle(
                    storedWidth: $ordersSidebarWidth,
                    temporaryWidth: $temporaryOrdersSidebarWidth,
                    isHovering: $orderSidebarResizerHovering,
                    minWidth: minOrdersSidebarWidth,
                    maxWidth: maxOrdersSidebarWidth,
                    resetWidth: defaultOrdersSidebarWidth,
                    onWidthChangeEnd: { _ in
                        syncWorkspaceSidebarLayout()
                    }
                )
                .frame(width: 8)
                .frame(maxHeight: .infinity)
                .help(t("Drag to resize the customers list. Double-click to reset.", lang: seciliDil))
            } else {
                customersSidebarRevealHandle
            }

            ZStack {
                bgMain.ignoresSafeArea()
                if let musteri = seciliMusteri, firebaseManager.musteriler.contains(where: { $0.id == musteri.id }) {
                    MusteriDetayView(musteri: guvenliBinding(icin: musteri), seciliSiparis: $seciliSiparis, aktifSekme: $aktifSekme)
                } else {
                    VStack(spacing: 15) { Image(systemName: "person.crop.circle.badge.questionmark").font(.system(size: 40)).foregroundColor(.gray.opacity(0.5)); Text(t("Select a customer to view details.", lang: seciliDil)).foregroundColor(.gray) }
                }
            }.frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var customersSidebarRevealHandle: some View {
        VStack(spacing: 12) {
            Button {
                withAnimation(.snappy) {
                    isOrdersSidebarVisible = true
                }
                syncWorkspaceSidebarLayout()
            } label: {
                Image(systemName: "sidebar.leading")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.blue)
                    .frame(width: 34, height: 34)
                    .background(Color.blue.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)
            .help(t("Show customers list", lang: seciliDil))

            Text(t("Customers", lang: seciliDil))
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.secondary)
                .rotationEffect(.degrees(-90))
                .fixedSize()
                .frame(width: 34, height: 96)
        }
        .frame(width: 48)
        .frame(maxHeight: .infinity, alignment: .top)
        .padding(.top, 16)
        .background(bgSidebar)
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(Color.primary.opacity(0.08))
                .frame(width: 1)
        }
    }

    private func syncWorkspaceSidebarLayout() {
        let companyId = firebaseManager.currentCompanyId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !companyId.isEmpty else { return }

        Firestore.firestore()
            .collection("companySettings")
            .document(companyId)
            .setData([
                "ordersSidebarWidth": min(max(ordersSidebarWidth, minOrdersSidebarWidth), maxOrdersSidebarWidth),
                "ordersSidebarVisible": isOrdersSidebarVisible,
                "workspaceSidebarLayoutUpdatedAt": FieldValue.serverTimestamp()
            ], merge: true)
    }

    @ViewBuilder
    private var phoneCustomersView: some View {
        if phoneShowsCustomerDetail,
           let musteri = seciliMusteri,
           firebaseManager.musteriler.contains(where: { $0.id == musteri.id }) {
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Button {
                        withAnimation(.snappy) {
                            phoneShowsCustomerDetail = false
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chevron.left")
                            Text(t("Customers", lang: seciliDil))
                        }
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.blue)
                    }
                    .buttonStyle(.plain)

                    Spacer()

                    Text(musteri.name)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(bgSidebar)

                Divider().background(Color.primary.opacity(0.1))

                MusteriDetayView(
                    musteri: guvenliBinding(icin: musteri),
                    seciliSiparis: $seciliSiparis,
                    aktifSekme: $aktifSekme
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(bgMain)
        } else {
            phoneCustomerListView
        }
    }

    private var phoneCustomerListView: some View {
        VStack(spacing: 0) {
            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(t("Customers", lang: seciliDil))
                            .font(.system(size: 18, weight: .bold))
                            .foregroundColor(.primary)

                        Text("\(aramaSonuclari.count) " + t("customers", lang: seciliDil))
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }

                    Spacer()

                    Menu {
                        Button {
                            seciliSiralama = .sonGorusme
                        } label: {
                            Label(t("Recent", lang: seciliDil), systemImage: seciliSiralama == .sonGorusme ? "checkmark.circle.fill" : "circle")
                        }

                        Button {
                            seciliSiralama = .enCokSiparis
                        } label: {
                            Label(t("Most Orders", lang: seciliDil), systemImage: seciliSiralama == .enCokSiparis ? "checkmark.circle.fill" : "circle")
                        }
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease.circle")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.primary)
                            .frame(width: 34, height: 34)
                            .background(Color.primary.opacity(0.08))
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .menuStyle(.borderlessButton)
                }

                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.gray)

                    TextField(t("Search...", lang: seciliDil), text: $aramaMetni)
                        .textFieldStyle(.plain)
                        .foregroundColor(.primary)

                    if !aramaMetni.isEmpty {
                        Button {
                            aramaMetni = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.gray)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(10)
                .background(Color.primary.opacity(0.05))
                .cornerRadius(8)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(bgSidebar)

            Divider().background(Color.primary.opacity(0.1))

            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(aramaSonuclari) { musteri in
                        MusteriKarti(musteri: musteri, isSelected: false, designNames: designBasliklari(icin: musteri))
                            .onTapGesture {
                                seciliMusteri = musteri
                                withAnimation(.snappy) {
                                    phoneShowsCustomerDetail = true
                                }
                            }
                            .contextMenu {
                                Button(role: .destructive) {
                                    silMusteri(musteri)
                                } label: {
                                    Label(t("Delete", lang: seciliDil), systemImage: "trash")
                                }
                            }
                    }
                }
                .padding(14)
            }
            .background(bgMain)

            VStack(alignment: .leading) {
                HStack {
                    Image(systemName: "person.3.fill")
                        .foregroundColor(.gray)
                    Text("\(firebaseManager.musteriler.count) \(t("Customers", lang: seciliDil))")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.primary)
                }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(bgSidebar)
        }
    }

    private func guvenliBinding(icin musteri: Musteri) -> Binding<Musteri> {
        Binding(
            get: {
                firebaseManager.musteriler.first(where: { $0.id == musteri.id }) ?? musteri
            },
            set: { newValue in
                if let i = firebaseManager.musteriler.firstIndex(where: { $0.id == musteri.id }) {
                    firebaseManager.musteriler[i] = newValue
                }
            }
        )
    }
    private func silMusteri(_ musteri: Musteri) { withAnimation { if seciliMusteri?.id == musteri.id { seciliMusteri = nil }; if let id = musteri.id { firebaseManager.deleteMusteri(id: id) } } }
}

struct MusteriKarti: View {
    let musteri: Musteri
    let isSelected: Bool
    let designNames: [String]
    @Environment(\.colorScheme) var colorScheme
    @AppStorage("seciliDil") private var seciliDil: String = "English"

    private var displayName: String {
        let cleaned = musteri.name.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? t("New Project", lang: seciliDil) : cleaned
    }

    var body: some View {
        HStack(spacing: 16) {
            if musteri.profileImageUrl.isEmpty {
                Circle()
                    .fill(Color.blue.opacity(0.2))
                    .frame(width: 46, height: 46)
                    .overlay(
                        Text(String(displayName.prefix(1).uppercased()))
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.blue)
                    )
            } else {
                AsyncImage(url: URL(string: musteri.profileImageUrl)) { image in
                    image.resizable().scaledToFill().frame(width: 46, height: 46).clipShape(Circle())
                } placeholder: {
                    ProgressView().frame(width: 46, height: 46)
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(displayName)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                    .truncationMode(.tail)

                if !designNames.isEmpty {
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(Array(designNames.enumerated()), id: \.offset) { _, designName in
                            HStack(spacing: 4) {
                                Image(systemName: "paintpalette")
                                Text(designName)
                                    .lineLimit(1)
                            }
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(.gray)
                        }
                    }
                }

                HStack(spacing: 4) {
                    Image(systemName: "calendar")
                    Text(musteri.lastContactDate, format: .dateTime.day().month().year())
                }
                .font(.system(size: 11))
                .foregroundColor(.gray)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .foregroundColor(.gray.opacity(0.5))
                .font(.system(size: 12))
        }
        .padding(16)
        .background(isSelected ? Color.blue.opacity(0.15) : (colorScheme == .dark ? Color(white: 0.15) : .white))
        .cornerRadius(16)
        .overlay(RoundedRectangle(cornerRadius: 16).stroke(isSelected ? Color.blue.opacity(0.5) : Color.clear, lineWidth: 1.5))
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.04), radius: 5, y: 2)
        .contentShape(Rectangle())
    }
}

struct MusteriDetayView: View {
    @Binding var musteri: Musteri
    @Binding var seciliSiparis: Siparis?
    @Binding var aktifSekme: String
    @EnvironmentObject var firebaseManager: FirebaseManager
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("seciliParaBirimi") private var seciliParaBirimi: String = "£"
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    private var isPhoneLayout: Bool { horizontalSizeClass == .compact }
    
    @State private var isImagePickerPresented = false
    @State private var isHoveringAvatar = false
    @State private var isUploading = false
    @State private var musteriAutosaveWorkItem: DispatchWorkItem? = nil
    @State private var pendingMusteriPreviousName: String? = nil
    @State private var customerNameDraft: String = ""
    @FocusState private var customerNameFocused: Bool
    
    var musteriSiparisleri: [Siparis] { firebaseManager.siparisler.filter { $0.customerName.lowercased() == musteri.name.lowercased() }.sorted { $0.paymentDate > $1.paymentDate } }
    var toplamHarcama: Double { musteriSiparisleri.reduce(0) { $0 + $1.paidAmount + $1.remainingAmount } }
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: isPhoneLayout ? 16 : 25) {
                customerProfileHeader

                if isPhoneLayout {
                    VStack(spacing: 16) {
                        contactInfoCard
                        customerNotesCard
                        orderHistoryCard
                    }
                } else {
                    HStack(alignment: .top, spacing: 30) {
                        VStack(spacing: 20) {
                            contactInfoCard
                            customerNotesCard
                        }

                        VStack(spacing: 20) {
                            orderHistoryCard
                        }
                    }
                }
            }
            .padding(isPhoneLayout ? 14 : 40)
        }
        .onDisappear { flushMusteriAutosave() }
    }

    private var customerProfileHeader: some View {
        HStack(spacing: isPhoneLayout ? 12 : 20) {
            customerAvatarView

            VStack(alignment: .leading, spacing: 8) {
                TextField("Customer Name", text: $customerNameDraft)
                    .font(.system(size: isPhoneLayout ? 22 : 28, weight: .bold))
                    .foregroundColor(.primary)
                    .textFieldStyle(.plain)
                    .lineLimit(1)
                    .focused($customerNameFocused)
                    .onSubmit { commitCustomerNameDraft() }
                    .onAppear {
                        customerNameDraft = musteri.name
                    }
                    .onChange(of: musteri.id ?? "") { _, _ in
                        if !customerNameFocused {
                            customerNameDraft = musteri.name
                        }
                    }
                    .onChange(of: musteri.name) { _, newValue in
                        if !customerNameFocused {
                            customerNameDraft = newValue
                        }
                    }
                    .onChange(of: customerNameFocused) { _, focused in
                        if focused {
                            customerNameDraft = musteri.name
                        } else {
                            commitCustomerNameDraft()
                        }
                    }

                Text("\(t("Total Spent", lang: seciliDil)): \(seciliParaBirimi)\(toplamHarcama.toCurrencyString()) • \(musteriSiparisleri.count) \(t("Orders", lang: seciliDil))")
                    .font(.system(size: isPhoneLayout ? 12 : 14, weight: .bold))
                    .foregroundColor(.green)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)
        }
        .padding(.bottom, isPhoneLayout ? 4 : 10)
    }

    private var customerAvatarView: some View {
        ZStack {
            if musteri.profileImageUrl.isEmpty {
                Circle()
                    .fill(Color.blue.opacity(0.2))
                    .frame(width: isPhoneLayout ? 58 : 80, height: isPhoneLayout ? 58 : 80)
                    .overlay(
                        Text(String((musteri.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? t("New Project", lang: seciliDil) : musteri.name).prefix(1).uppercased()))
                            .font(.system(size: isPhoneLayout ? 26 : 36, weight: .bold))
                            .foregroundColor(.blue)
                    )
            } else {
                AsyncImage(url: URL(string: musteri.profileImageUrl)) { image in
                    image
                        .resizable()
                        .scaledToFill()
                        .frame(width: isPhoneLayout ? 58 : 80, height: isPhoneLayout ? 58 : 80)
                        .clipShape(Circle())
                } placeholder: {
                    ProgressView()
                        .frame(width: isPhoneLayout ? 58 : 80, height: isPhoneLayout ? 58 : 80)
                }
            }

            if isHoveringAvatar || isUploading {
                Circle()
                    .fill(Color.black.opacity(0.4))
                    .frame(width: isPhoneLayout ? 58 : 80, height: isPhoneLayout ? 58 : 80)

                if isUploading {
                    ProgressView()
                        .tint(.white)
                } else {
                    Image(systemName: "camera.fill")
                        .foregroundColor(.white)
                        .font(.system(size: isPhoneLayout ? 18 : 24))
                }
            }
        }
        .contentShape(Circle())
        .onHover { hover in withAnimation { isHoveringAvatar = hover } }
        .onTapGesture { isImagePickerPresented = true }
        .onDrop(of: [.fileURL], isTargeted: nil) { providers in
            guard let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) }) else { return false }
            provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier, options: nil) { (item, error) in
                guard let data = item as? Data,
                      let url = URL(dataRepresentation: data, relativeTo: nil) else { return }
                DispatchQueue.main.async { profilResmiYukle(url: url) }
            }
            return true
        }
        .fileImporter(isPresented: $isImagePickerPresented, allowedContentTypes: [.image]) { result in
            switch result {
            case .success(let url):
                profilResmiYukle(url: url)
            case .failure(let error):
                print("Dosya seçim hatası: \(error)")
            }
        }
    }

    private func commitCustomerNameDraft() {
        let cleaned = customerNameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        let nextName = cleaned.isEmpty ? "New Project" : cleaned
        let previousName = musteri.name
        customerNameDraft = nextName
        guard nextName != previousName else { return }
        musteri.name = nextName
        saveMusteriDetailChange(previousName: previousName)
    }

    private var contactInfoCard: some View {
        DetayKartiSabit(title: t("Contact Info", lang: seciliDil), iconName: "person.crop.circle") {
            DetailField(label: t("Email", lang: seciliDil), value: $musteri.email)
                .onChange(of: musteri.email) { _, _ in saveMusteriDetailChange() }
            DetailField(label: t("WhatsApp", lang: seciliDil), value: $musteri.phone)
                .onChange(of: musteri.phone) { _, _ in saveMusteriDetailChange() }
            DetailField(label: t("Instagram", lang: seciliDil), value: $musteri.instagram)
                .onChange(of: musteri.instagram) { _, _ in saveMusteriDetailChange() }
            Divider().opacity(0.35)
            DetailField(label: t("Street", lang: seciliDil), value: customerStreetAddressBinding)
            DetailField(label: t("City", lang: seciliDil), value: customerCityBinding)
            DetailField(label: t("Postal Code", lang: seciliDil), value: customerPostalCodeBinding)
            DetailField(label: t("Country", lang: seciliDil), value: customerCountryBinding)
        }
    }

    private var customerStreetAddressBinding: Binding<String> {
        Binding(
            get: {
                let street = musteri.streetAddress?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                if !street.isEmpty { return street }
                let hasDetailedAddress = !(musteri.city ?? "").isEmpty || !(musteri.postalCode ?? "").isEmpty || !(musteri.country ?? "").isEmpty
                return hasDetailedAddress ? "" : musteri.address
            },
            set: { setCustomerAddressField(\.streetAddress, value: $0) }
        )
    }

    private var customerCityBinding: Binding<String> {
        Binding(
            get: { musteri.city ?? "" },
            set: { setCustomerAddressField(\.city, value: $0) }
        )
    }

    private var customerPostalCodeBinding: Binding<String> {
        Binding(
            get: { musteri.postalCode ?? "" },
            set: { setCustomerAddressField(\.postalCode, value: $0) }
        )
    }

    private var customerCountryBinding: Binding<String> {
        Binding(
            get: { musteri.country ?? "" },
            set: { setCustomerAddressField(\.country, value: $0) }
        )
    }

    private func setCustomerAddressField(_ keyPath: WritableKeyPath<Musteri, String?>, value: String) {
        musteri[keyPath: keyPath] = value
        musteri.syncAddressFromDetailedFields()
        saveMusteriDetailChange()
    }

    private var customerNotesCard: some View {
        DetayKartiSabit(title: t("Customer Notes", lang: seciliDil), iconName: "person.text.rectangle") {
            TextEditor(text: $musteri.notes)
                .font(.system(size: 13))
                .foregroundColor(.primary)
                .frame(minHeight: isPhoneLayout ? 100 : 120)
                .padding(8)
                .background(Color.primary.opacity(0.05))
                .cornerRadius(8)
                .onChange(of: musteri.notes) { _, _ in saveMusteriDetailChange() }
        }
    }

    private var orderHistoryCard: some View {
        DetayKartiSabit(title: t("Order History", lang: seciliDil), iconName: "clock.arrow.circlepath") {
            if musteriSiparisleri.isEmpty {
                Text(t("No data available.", lang: seciliDil))
                    .foregroundColor(.gray)
                    .font(.system(size: 13))
                    .padding(.vertical, 20)
            } else {
                VStack(spacing: 12) {
                    ForEach(musteriSiparisleri) { siparis in
                        Button(action: {
                            withAnimation {
                                seciliSiparis = siparis
                                aktifSekme = "Orders"
                            }
                        }) {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    AsyncImage(url: URL(string: siparis.designLink)) { image in
                                        image.resizable().scaledToFill()
                                    } placeholder: {
                                        Color.gray.opacity(0.2)
                                    }
                                    .frame(width: 40, height: 40)
                                    .cornerRadius(8)
                                    .clipped()

                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(siparis.designName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? t("Untitled design", lang: seciliDil) : siparis.designName)
                                            .font(.system(size: 13, weight: .bold))
                                            .lineLimit(1)
                                        Text(siparis.paymentDate, format: .dateTime.day().month().year())
                                            .font(.system(size: 11))
                                            .foregroundColor(.gray)
                                    }

                                    Spacer()

                                    Text("\(seciliParaBirimi)\((siparis.paidAmount + siparis.remainingAmount).toCurrencyString())")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.green)
                                }

                                if !siparis.notes.isEmpty {
                                    Text(siparis.notes)
                                        .font(.system(size: 11, weight: .medium))
                                        .italic()
                                        .foregroundColor(.gray)
                                        .padding(8)
                                        .background(Color.gray.opacity(0.05))
                                        .cornerRadius(6)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                            .padding(12)
                            .background(Color.primary.opacity(0.03))
                            .cornerRadius(8)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .onHover { hover in
                            #if os(macOS)
                            if hover {
                                NSCursor.pointingHand.push()
                            } else {
                                NSCursor.pop()
                            }
                            #endif
                        }
                    }
                }
            }
        }
    }

    private func saveMusteriDetailChange(previousName: String? = nil) {
        if pendingMusteriPreviousName == nil {
            pendingMusteriPreviousName = previousName
        }
        musteriAutosaveWorkItem?.cancel()

        let customerToSave = musteri
        let previousNameForSync = pendingMusteriPreviousName
        let manager = firebaseManager
        let workItem = DispatchWorkItem {
            manager.updateMusteri(customerToSave, oncekiIsim: previousNameForSync)
            DispatchQueue.main.async {
                pendingMusteriPreviousName = nil
                musteriAutosaveWorkItem = nil
            }
        }
        musteriAutosaveWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.65, execute: workItem)
    }

    private func flushMusteriAutosave() {
        musteriAutosaveWorkItem?.cancel()
        if musteriAutosaveWorkItem != nil || pendingMusteriPreviousName != nil {
            firebaseManager.updateMusteri(musteri, oncekiIsim: pendingMusteriPreviousName)
        }
        pendingMusteriPreviousName = nil
        musteriAutosaveWorkItem = nil
    }

    private func profilResmiYukle(url: URL) {
        isUploading = true
        firebaseManager.uploadDesignImage(fileURL: url) { downloadURL in
            DispatchQueue.main.async {
                isUploading = false
                if let downloadURL = downloadURL {
                    flushMusteriAutosave()
                    withAnimation { musteri.profileImageUrl = downloadURL }
                    firebaseManager.updateMusteri(musteri)
                }
            }
        }
    }
}

struct DetayKartiSabit<Content: View>: View { @Environment(\.colorScheme) var colorScheme; let title: String; let iconName: String; let content: Content; init(title: String, iconName: String, @ViewBuilder content: () -> Content) { self.title = title; self.iconName = iconName; self.content = content() }; var body: some View { VStack(alignment: .leading, spacing: 0) { HStack(spacing: 10) { Image(systemName: iconName).foregroundColor(.gray); Text(title).font(.system(size: 14, weight: .bold)).foregroundColor(.primary); Spacer() }.padding(20); VStack(alignment: .leading, spacing: 15) { content }.padding(.horizontal, 20).padding(.bottom, 20) }.background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white).cornerRadius(12).shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.03), radius: 5, y: 2) } }
