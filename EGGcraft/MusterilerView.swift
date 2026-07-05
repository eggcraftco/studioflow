import SwiftUI
import UniformTypeIdentifiers
import FirebaseFirestore

enum MusteriSiralamaTuru { case sonGorusme, enCokSiparis }

struct MusterilerView: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @EnvironmentObject var authVM: AuthViewModel
    @AppStorage("seciliDil") private var seciliDil: String = "English"
    @AppStorage("seciliParaBirimi") private var seciliParaBirimi: String = "£"
    @Environment(\.colorScheme) var colorScheme
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    
    @Binding var seciliSiparis: Siparis?
    @Binding var aktifSekme: String
    @Binding var seciliMusteri: Musteri?
    var onOpenOrder: (Siparis) -> Void = { _ in }

    @State private var aramaMetni: String = ""
    @State private var seciliSiralama: MusteriSiralamaTuru = .sonGorusme
    @State private var phoneShowsCustomerDetail: Bool = false
    @State private var showCustomerLimitAlert: Bool = false
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
        .alert(t("Plan limit reached", lang: seciliDil), isPresented: $showCustomerLimitAlert) {
            Button(t("OK", lang: seciliDil), role: .cancel) { }
        } message: {
            Text(t("Your current plan has reached its customer limit. Upgrade the workspace plan to add more customers.", lang: seciliDil))
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
                            addCustomerButton(compact: false)
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
                    MusteriDetayView(musteri: guvenliBinding(icin: musteri), seciliSiparis: $seciliSiparis, aktifSekme: $aktifSekme, onOpenOrder: onOpenOrder)
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
                    aktifSekme: $aktifSekme,
                    onOpenOrder: onOpenOrder
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

                    addCustomerButton(compact: true)
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

    private func ekleMusteri() {
        guard authVM.canCreateMoreCustomers(currentCount: firebaseManager.musteriler.count) else {
            showCustomerLimitAlert = true
            return
        }
        guard let yeni = firebaseManager.createMusteri(name: t("New Customer", lang: seciliDil)) else { return }
        withAnimation {
            seciliMusteri = yeni
            if isPhoneLayout {
                phoneShowsCustomerDetail = true
            }
        }
    }

    @ViewBuilder
    private func addCustomerButton(compact: Bool) -> some View {
        Button {
            ekleMusteri()
        } label: {
            if compact {
                Image(systemName: "person.badge.plus")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 34, height: 34)
                    .background(Color.blue)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                Label(t("Add Customer", lang: seciliDil), systemImage: "person.badge.plus")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .frame(height: 32)
                    .background(Color.blue)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
        }
        .buttonStyle(.plain)
        .help(t("Add Customer", lang: seciliDil))
    }
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
    var onOpenOrder: (Siparis) -> Void = { _ in }
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
    @State private var isEditingCustomerNotes = false
    @State private var selectedCustomerTab: String = "Orders"
    @Environment(\.openURL) private var openURL

    var musteriSiparisleri: [Siparis] { firebaseManager.siparisler.filter { $0.customerName.lowercased() == musteri.name.lowercased() }.sorted { $0.paymentDate > $1.paymentDate } }
    var toplamHarcama: Double { musteriSiparisleri.reduce(0) { $0 + $1.paidAmount + $1.remainingAmount } }
    var lastOrderDate: Date? { musteriSiparisleri.first?.paymentDate }
    var customerSinceDate: Date? { musteriSiparisleri.last?.paymentDate }
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: isPhoneLayout ? 16 : 25) {
                customerProfileHeader

                if isPhoneLayout {
                    VStack(spacing: 16) {
                        customerStatsRow
                        contactInfoCard
                        orderHistoryCard
                        customerNotesCard
                        customerActivityTabsCard
                    }
                } else {
                    VStack(spacing: 25) {
                        customerStatsRow

                        HStack(alignment: .top, spacing: 25) {
                            VStack(spacing: 20) {
                                contactInfoCard
                            }
                            .frame(maxWidth: .infinity, alignment: .top)

                            VStack(spacing: 20) {
                                orderHistoryCard
                                customerNotesCard
                            }
                            .frame(maxWidth: .infinity, alignment: .top)
                        }

                        customerActivityTabsCard
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

                Text("\(musteriSiparisleri.count) \(t("Orders", lang: seciliDil)) • \(seciliParaBirimi)\(toplamHarcama.toCurrencyString())")
                    .font(.system(size: isPhoneLayout ? 12 : 13, weight: .semibold))
                    .foregroundColor(.secondary)
                    .lineLimit(1)
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
            Divider().opacity(0.35)
            Text(t("Shipping Address", lang: seciliDil))
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.gray)
                .frame(maxWidth: .infinity, alignment: .leading)
            DetailField(label: t("Street", lang: seciliDil), value: customerShippingStreetBinding)
            DetailField(label: t("City", lang: seciliDil), value: customerShippingCityBinding)
            DetailField(label: t("Postal Code", lang: seciliDil), value: customerShippingPostalCodeBinding)
            DetailField(label: t("Country", lang: seciliDil), value: customerShippingCountryBinding)
            DetailField(label: t("Shipping Phone", lang: seciliDil), value: customerShippingPhoneBinding)
        }
    }

    private var customerShippingStreetBinding: Binding<String> {
        Binding(get: { musteri.shippingStreetAddress ?? "" }, set: { setCustomerShippingField(\.shippingStreetAddress, value: $0) })
    }
    private var customerShippingCityBinding: Binding<String> {
        Binding(get: { musteri.shippingCity ?? "" }, set: { setCustomerShippingField(\.shippingCity, value: $0) })
    }
    private var customerShippingPostalCodeBinding: Binding<String> {
        Binding(get: { musteri.shippingPostalCode ?? "" }, set: { setCustomerShippingField(\.shippingPostalCode, value: $0) })
    }
    private var customerShippingCountryBinding: Binding<String> {
        Binding(get: { musteri.shippingCountry ?? "" }, set: { setCustomerShippingField(\.shippingCountry, value: $0) })
    }
    private var customerShippingPhoneBinding: Binding<String> {
        Binding(get: { musteri.shippingPhone ?? "" }, set: { setCustomerShippingField(\.shippingPhone, value: $0) })
    }

    // Editing any shipping field saves the customer; the combined shippingAddress line is kept
    // in sync from the structured parts (mirrors syncAddressFromDetailedFields for billing).
    private func setCustomerShippingField(_ keyPath: WritableKeyPath<Musteri, String?>, value: String) {
        musteri[keyPath: keyPath] = value
        musteri.shippingAddress = [musteri.shippingStreetAddress, musteri.shippingCity, musteri.shippingPostalCode, musteri.shippingCountry]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
        saveMusteriDetailChange()
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
        DetayKartiAksesuarli(title: t("Customer Notes", lang: seciliDil), iconName: "note.text", accessory: {
            Button(action: {
                if isEditingCustomerNotes { flushMusteriAutosave() }
                withAnimation(.easeInOut(duration: 0.15)) { isEditingCustomerNotes.toggle() }
            }) {
                Text(isEditingCustomerNotes ? t("Done", lang: seciliDil) : t("Edit", lang: seciliDil))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.blue)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Color.blue.opacity(0.10))
                    .cornerRadius(8)
            }
            .buttonStyle(.plain)
        }) {
            if isEditingCustomerNotes {
                TextEditor(text: $musteri.notes)
                    .font(.system(size: 13))
                    .foregroundColor(.primary)
                    .frame(minHeight: isPhoneLayout ? 100 : 120)
                    .padding(8)
                    .background(Color.primary.opacity(0.05))
                    .cornerRadius(8)
                    .onChange(of: musteri.notes) { _, _ in saveMusteriDetailChange() }
            } else {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "note.text")
                        .font(.system(size: 13))
                        .foregroundColor(.orange)
                    Text(musteri.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                         ? t("No notes yet. Tap Edit to add a note.", lang: seciliDil)
                         : musteri.notes)
                        .font(.system(size: 13))
                        .foregroundColor(musteri.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .secondary : .primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(colorScheme == .dark ? Color.orange.opacity(0.12) : Color(red: 1.0, green: 0.97, blue: 0.88))
                .cornerRadius(10)
            }
        }
    }

    private var customerStatsRow: some View {
        let columns: [GridItem] = isPhoneLayout
            ? [GridItem(.adaptive(minimum: 140), spacing: 12)]
            : Array(repeating: GridItem(.flexible(), spacing: 14), count: 4)
        return LazyVGrid(columns: columns, spacing: 14) {
            statCard(icon: "bag.fill", tint: .green,
                     label: t("Total Spent", lang: seciliDil),
                     value: "\(seciliParaBirimi)\(toplamHarcama.toCurrencyString())",
                     valueColor: .green)
            statCard(icon: "shippingbox.fill", tint: .blue,
                     label: t("Total Orders", lang: seciliDil),
                     value: "\(musteriSiparisleri.count)")
            statCard(icon: "calendar", tint: .purple,
                     label: t("Last Order", lang: seciliDil),
                     value: lastOrderDate.map { $0.formatted(.dateTime.day().month(.abbreviated).year()) } ?? "—")
            statCard(icon: "clock.fill", tint: .orange,
                     label: t("Customer Since", lang: seciliDil),
                     value: customerSinceDate.map { $0.formatted(.dateTime.month(.abbreviated).year()) } ?? "—")
        }
    }

    private func statCard(icon: String, tint: Color, label: String, value: String, valueColor: Color = .primary) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous).fill(tint.opacity(0.15)).frame(width: 30, height: 30)
                Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundColor(tint)
            }
            Text(label).font(.system(size: 12, weight: .medium)).foregroundColor(.secondary).lineLimit(1)
            Text(value).font(.system(size: 16, weight: .bold)).foregroundColor(valueColor).lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
        .cornerRadius(12)
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.03), radius: 5, y: 2)
    }

    @ViewBuilder
    private func orderStatusBadge(_ siparis: Siparis) -> some View {
        let s = siparis.status.trimmingCharacters(in: .whitespacesAndNewlines)
        let lowered = s.lowercased()
        let isDone = siparis.isDelivered || lowered.contains("complet") || lowered.contains("deliver")
        let color: Color = isDone ? .green : (siparis.isDispatched ? .blue : .orange)
        let label = s.isEmpty ? (siparis.isDelivered ? t("Delivered", lang: seciliDil) : t("Pending", lang: seciliDil)) : t(s, lang: seciliDil)
        Text(label)
            .font(.system(size: 11, weight: .bold))
            .foregroundColor(color)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(color.opacity(0.15))
            .cornerRadius(20)
    }

    private var orderHistoryCard: some View {
        DetayKartiAksesuarli(title: t("Order History", lang: seciliDil), iconName: "clock.arrow.circlepath", accessory: {
            if !musteriSiparisleri.isEmpty {
                Button(action: { withAnimation { aktifSekme = "Orders" } }) {
                    Text(t("View All Orders", lang: seciliDil))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.blue)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(Color.blue.opacity(0.10))
                        .cornerRadius(8)
                }
                .buttonStyle(.plain)
            }
        }) {
            if musteriSiparisleri.isEmpty {
                Text(t("No data available.", lang: seciliDil))
                    .foregroundColor(.gray)
                    .font(.system(size: 13))
                    .padding(.vertical, 20)
            } else {
                VStack(spacing: 12) {
                    ForEach(musteriSiparisleri) { siparis in
                        Button(action: {
                            onOpenOrder(siparis)
                        }) {
                            HStack(spacing: 12) {
                                AsyncImage(url: URL(string: siparis.designLink)) { image in
                                    image.resizable().scaledToFill()
                                } placeholder: {
                                    Color.gray.opacity(0.2)
                                }
                                .frame(width: 48, height: 48)
                                .cornerRadius(8)
                                .clipped()

                                VStack(alignment: .leading, spacing: 3) {
                                    Text(siparis.designName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? t("Untitled design", lang: seciliDil) : siparis.designName)
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.primary)
                                        .lineLimit(1)
                                    if !siparis.invoiceNumber.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                                        Text("\(t("Order", lang: seciliDil)) #\(siparis.invoiceNumber)")
                                            .font(.system(size: 11))
                                            .foregroundColor(.secondary)
                                            .lineLimit(1)
                                    }
                                    HStack(spacing: 4) {
                                        Image(systemName: "calendar").font(.system(size: 9))
                                        Text(siparis.paymentDate, format: .dateTime.day().month(.abbreviated).year())
                                            .font(.system(size: 11))
                                    }
                                    .foregroundColor(.secondary)
                                }

                                Spacer(minLength: 8)

                                VStack(alignment: .trailing, spacing: 6) {
                                    Text("\(seciliParaBirimi)\(siparis.salesTotal.toCurrencyString())")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundColor(.green)
                                        .lineLimit(1)
                                        .fixedSize(horizontal: true, vertical: false)
                                    orderStatusBadge(siparis)
                                }
                                .layoutPriority(1)
                            }
                            .padding(12)
                            .background(Color.primary.opacity(0.03))
                            .cornerRadius(10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .onHover { hover in
                            #if os(macOS)
                            if hover { NSCursor.pointingHand.push() } else { NSCursor.pop() }
                            #endif
                        }
                    }
                }
            }
        }
    }

    // MARK: - Bottom tabbed section (Orders / Files / Activity)

    private var customerFiles: [ClientFileItem] {
        musteriSiparisleri.flatMap { $0.clientFiles ?? [] }.sorted { $0.uploadedAt > $1.uploadedAt }
    }

    private var customerActivity: [(siparis: Siparis, log: OrderHistoryLogItem)] {
        musteriSiparisleri
            .flatMap { siparis in (siparis.historyLog ?? []).map { (siparis: siparis, log: $0) } }
            .sorted { $0.log.createdAt > $1.log.createdAt }
    }

    // Order-level notes (the order's Notes card content), aggregated for this customer.
    // NOT the customer-profile note — that lives in the Customer Notes card above.
    private var customerOrderNotes: [(siparis: Siparis, note: String)] {
        musteriSiparisleri.compactMap { siparis in
            let n = siparis.notes.trimmingCharacters(in: .whitespacesAndNewlines)
            return n.isEmpty ? nil : (siparis: siparis, note: n)
        }
    }

    private var customerActivityTabsCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 26) {
                ForEach(["Orders", "Files", "Notes", "Activity"], id: \.self) { tab in
                    let isSelected = selectedCustomerTab == tab
                    Button(action: { withAnimation(.easeInOut(duration: 0.15)) { selectedCustomerTab = tab } }) {
                        VStack(spacing: 8) {
                            Text(t(tab, lang: seciliDil))
                                .font(.system(size: 14, weight: isSelected ? .bold : .medium))
                                .foregroundColor(isSelected ? .blue : .secondary)
                            Rectangle()
                                .fill(isSelected ? Color.blue : Color.clear)
                                .frame(height: 2)
                        }
                        .fixedSize()
                    }
                    .buttonStyle(.plain)
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

            Divider()

            Group {
                switch selectedCustomerTab {
                case "Files": filesTabContent
                case "Notes": notesTabContent
                case "Activity": activityTabContent
                default: ordersTabContent
                }
            }
            .padding(20)
        }
        .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
        .cornerRadius(12)
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.03), radius: 5, y: 2)
    }

    private var ordersTabContent: some View {
        Group {
            if musteriSiparisleri.isEmpty {
                emptyTabState(icon: "shippingbox", text: t("No orders yet.", lang: seciliDil))
            } else if isPhoneLayout {
                VStack(spacing: 10) {
                    ForEach(musteriSiparisleri) { siparis in
                        Button(action: { onOpenOrder(siparis) }) {
                            HStack(spacing: 10) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(siparis.invoiceNumber.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "—" : siparis.invoiceNumber)
                                        .font(.system(size: 12, weight: .bold)).foregroundColor(.blue).lineLimit(1)
                                    Text(siparis.designName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? t("Untitled design", lang: seciliDil) : siparis.designName)
                                        .font(.system(size: 13)).foregroundColor(.primary).lineLimit(1)
                                    Text(siparis.paymentDate, format: .dateTime.day().month(.abbreviated).year())
                                        .font(.system(size: 11)).foregroundColor(.secondary)
                                }
                                Spacer(minLength: 8)
                                VStack(alignment: .trailing, spacing: 6) {
                                    Text("\(seciliParaBirimi)\(siparis.salesTotal.toCurrencyString())")
                                        .font(.system(size: 13, weight: .bold)).foregroundColor(.primary)
                                        .lineLimit(1)
                                        .fixedSize(horizontal: true, vertical: false)
                                    orderStatusBadge(siparis)
                                }
                                .layoutPriority(1)
                            }
                            .padding(12).background(Color.primary.opacity(0.03)).cornerRadius(10).contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            } else {
                VStack(spacing: 0) {
                    HStack(spacing: 12) {
                        Text(t("Order", lang: seciliDil).uppercased()).frame(width: 130, alignment: .leading)
                        Text(t("Project", lang: seciliDil).uppercased()).frame(maxWidth: .infinity, alignment: .leading)
                        Text(t("Date", lang: seciliDil).uppercased()).frame(width: 110, alignment: .leading)
                        Text(t("Status", lang: seciliDil).uppercased()).frame(width: 120, alignment: .leading)
                        Text(t("Amount", lang: seciliDil).uppercased()).frame(width: 100, alignment: .trailing)
                        Image(systemName: "chevron.right").opacity(0).frame(width: 14)
                    }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.secondary)
                    .padding(.vertical, 10)

                    Divider()

                    ForEach(musteriSiparisleri) { siparis in
                        Button(action: { onOpenOrder(siparis) }) {
                            HStack(spacing: 12) {
                                Text(siparis.invoiceNumber.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "—" : siparis.invoiceNumber)
                                    .font(.system(size: 13, weight: .semibold)).foregroundColor(.blue)
                                    .frame(width: 130, alignment: .leading).lineLimit(1)
                                Text(siparis.designName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? t("Untitled design", lang: seciliDil) : siparis.designName)
                                    .font(.system(size: 13)).foregroundColor(.primary)
                                    .frame(maxWidth: .infinity, alignment: .leading).lineLimit(1)
                                Text(siparis.paymentDate, format: .dateTime.day().month(.abbreviated).year())
                                    .font(.system(size: 13)).foregroundColor(.secondary)
                                    .frame(width: 110, alignment: .leading)
                                HStack { orderStatusBadge(siparis); Spacer(minLength: 0) }.frame(width: 120, alignment: .leading)
                                Text("\(seciliParaBirimi)\(siparis.salesTotal.toCurrencyString())")
                                    .font(.system(size: 13, weight: .bold)).foregroundColor(.primary)
                                    .frame(width: 100, alignment: .trailing)
                                Image(systemName: "chevron.right").font(.system(size: 11)).foregroundColor(.secondary).frame(width: 14)
                            }
                            .padding(.vertical, 12)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .onHover { hover in
                            #if os(macOS)
                            if hover { NSCursor.pointingHand.push() } else { NSCursor.pop() }
                            #endif
                        }
                        Divider()
                    }
                }
            }
        }
    }

    private var filesTabContent: some View {
        Group {
            if customerFiles.isEmpty {
                emptyTabState(icon: "doc", text: t("No files yet.", lang: seciliDil))
            } else {
                VStack(spacing: 10) {
                    ForEach(customerFiles) { file in
                        Button(action: { if let url = URL(string: file.downloadURL) { openURL(url) } }) {
                            HStack(spacing: 12) {
                                Image(systemName: fileIconName(file.contentType))
                                    .font(.system(size: 16)).foregroundColor(.blue)
                                    .frame(width: 36, height: 36)
                                    .background(Color.blue.opacity(0.10)).cornerRadius(8)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(file.fileName).font(.system(size: 13, weight: .semibold)).foregroundColor(.primary).lineLimit(1)
                                    Text("\(fileSizeText(file.fileSize)) • \(file.uploadedAt.formatted(.dateTime.day().month(.abbreviated).year()))")
                                        .font(.system(size: 11)).foregroundColor(.secondary)
                                }
                                Spacer(minLength: 8)
                                Image(systemName: "arrow.down.circle").font(.system(size: 14)).foregroundColor(.secondary)
                            }
                            .padding(12)
                            .background(Color.primary.opacity(0.03)).cornerRadius(10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var notesTabContent: some View {
        Group {
            if customerOrderNotes.isEmpty {
                emptyTabState(icon: "note.text", text: t("No order notes yet.", lang: seciliDil))
            } else {
                VStack(spacing: 10) {
                    ForEach(customerOrderNotes, id: \.siparis.id) { entry in
                        Button(action: { onOpenOrder(entry.siparis) }) {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 8) {
                                    Image(systemName: "note.text").font(.system(size: 11)).foregroundColor(.blue)
                                    Text(entry.siparis.invoiceNumber.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                         ? (entry.siparis.designName.isEmpty ? t("Order", lang: seciliDil) : entry.siparis.designName)
                                         : entry.siparis.invoiceNumber)
                                        .font(.system(size: 12, weight: .bold)).foregroundColor(.blue)
                                    Text(entry.siparis.paymentDate, format: .dateTime.day().month(.abbreviated).year())
                                        .font(.system(size: 11)).foregroundColor(.secondary)
                                    Spacer(minLength: 0)
                                }
                                Text(entry.note)
                                    .font(.system(size: 13)).foregroundColor(.primary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.primary.opacity(0.03))
                            .cornerRadius(10)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .onHover { hover in
                            #if os(macOS)
                            if hover { NSCursor.pointingHand.push() } else { NSCursor.pop() }
                            #endif
                        }
                    }
                }
            }
        }
    }

    private var activityTabContent: some View {
        Group {
            if customerActivity.isEmpty {
                emptyTabState(icon: "clock", text: t("No activity yet.", lang: seciliDil))
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(customerActivity, id: \.log.id) { entry in
                        HStack(alignment: .top, spacing: 12) {
                            Circle().fill(Color.blue.opacity(0.5)).frame(width: 8, height: 8).padding(.top, 5)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(t(entry.log.title, lang: seciliDil))
                                    .font(.system(size: 13, weight: .semibold)).foregroundColor(.primary)
                                if !entry.log.oldValue.isEmpty || !entry.log.newValue.isEmpty {
                                    Text("\(entry.log.oldValue.isEmpty ? "—" : entry.log.oldValue) → \(entry.log.newValue.isEmpty ? "—" : entry.log.newValue)")
                                        .font(.system(size: 12)).foregroundColor(.secondary).lineLimit(2)
                                }
                                Text("\(entry.siparis.invoiceNumber.isEmpty ? entry.siparis.designName : entry.siparis.invoiceNumber) • \(entry.log.createdAt.formatted(.dateTime.day().month(.abbreviated).year().hour().minute()))")
                                    .font(.system(size: 11)).foregroundColor(.secondary.opacity(0.8))
                            }
                            Spacer(minLength: 0)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
            }
        }
    }

    private func emptyTabState(icon: String, text: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 26)).foregroundColor(.secondary.opacity(0.5))
            Text(text).font(.system(size: 13)).foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 30)
    }

    private func fileSizeText(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }

    private func fileIconName(_ contentType: String) -> String {
        let ct = contentType.lowercased()
        if ct.hasPrefix("image") { return "photo" }
        if ct.contains("pdf") { return "doc.richtext" }
        if ct.contains("video") { return "film" }
        if ct.contains("zip") || ct.contains("compressed") { return "doc.zipper" }
        return "doc"
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

// Same card as DetayKartiSabit but with a trailing accessory view in the header
// (e.g. "View All Orders" / "Edit" buttons), used by the customer detail cards.
struct DetayKartiAksesuarli<Content: View, Accessory: View>: View {
    @Environment(\.colorScheme) var colorScheme
    let title: String
    let iconName: String
    let accessory: Accessory
    let content: Content
    init(title: String, iconName: String, @ViewBuilder accessory: () -> Accessory, @ViewBuilder content: () -> Content) {
        self.title = title
        self.iconName = iconName
        self.accessory = accessory()
        self.content = content()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: iconName).foregroundColor(.gray)
                Text(title).font(.system(size: 14, weight: .bold)).foregroundColor(.primary)
                Spacer()
                accessory
            }.padding(20)
            VStack(alignment: .leading, spacing: 15) { content }.padding(.horizontal, 20).padding(.bottom, 20)
        }
        .background(colorScheme == .dark ? Color.white.opacity(0.05) : Color.white)
        .cornerRadius(12)
        .shadow(color: colorScheme == .dark ? .clear : Color.black.opacity(0.03), radius: 5, y: 2)
    }
}
