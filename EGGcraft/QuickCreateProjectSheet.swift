import SwiftUI

// Quick Create.
//
// "+ Add Project" used to write an empty order the instant it was pressed, so
// a mis-tap left a real document, a real customer called "New Project" and a
// number that can never come round again. This form is what it opens instead:
// NOTHING is written until Create is pressed, and then it is written once, by
// the server, through the same callable on every plan.
//
// The customer is OPTIONAL on purpose. A piece made for the window, or for
// stock, belongs to nobody yet — inventing a name for it would put a ghost in
// the customer list that somebody has to clean up later.
//
// Every row here is its own small struct. Deeply nested inline SwiftUI is what
// overflows the stack guard on real iPhones (see the note in EGGcraftApp).

struct QuickCreateProjectSheet: View {
    @EnvironmentObject var firebaseManager: FirebaseManager
    @Environment(\.dismiss) private var dismiss

    let lang: String
    /// Called once the server has answered and the project exists. The screen
    /// underneath owns what happens next — selection, the Mac guide, the bar.
    let onCreated: (FirebaseManager.StudioProjectCreateResult) -> Void

    @State private var customerId = ""
    @State private var customerName = ""
    @State private var projectName = ""
    @State private var hasDueDate = false
    @State private var dueDate = Calendar.current.date(byAdding: .day, value: 45, to: Date()) ?? Date()
    @State private var showCustomerPicker = false
    @State private var saving = false
    @State private var error = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    QuickCreateCustomerRow(
                        customerName: customerName,
                        lang: lang,
                        onTap: { showCustomerPicker = true }
                    )
                    if !customerName.isEmpty {
                        QuickCreateClearCustomerRow(lang: lang, onClear: clearCustomer)
                    }
                } header: {
                    Text(t("Customer", lang: lang))
                } footer: {
                    Text(t("Optional. Leave it empty for a stock piece or a window piece.", lang: lang))
                }

                Section {
                    TextField(t("Project Name", lang: lang), text: $projectName)
                } header: {
                    Text(t("Project Name", lang: lang))
                } footer: {
                    Text(t("Optional. Left blank, the project is numbered and named for you.", lang: lang))
                }

                Section {
                    QuickCreateDueDateRows(
                        hasDueDate: $hasDueDate,
                        dueDate: $dueDate,
                        lang: lang
                    )
                } header: {
                    Text(t("Due Date", lang: lang))
                } footer: {
                    Text(t("Nothing is saved until you press Create.", lang: lang))
                }

                if !error.isEmpty {
                    Section {
                        QuickCreateErrorRow(message: error)
                    }
                }
            }
            .navigationTitle(t("New Project", lang: lang))
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(t("Cancel", lang: lang)) { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? t("Creating…", lang: lang) : t("Create", lang: lang)) { create() }
                        .disabled(saving)
                }
            }
            .sheet(isPresented: $showCustomerPicker) {
                QuickCreateCustomerPickerSheet(
                    lang: lang,
                    customers: firebaseManager.musteriler,
                    onPick: { picked in
                        customerId = picked.id ?? ""
                        customerName = picked.name
                    },
                    onTypedName: { typed in
                        // A name nobody in the list carries. The server makes
                        // the customer record as part of the create, so the
                        // form never writes one on its own.
                        customerId = ""
                        customerName = typed
                    },
                    onNoCustomer: clearCustomer
                )
            }
        }
        #if os(macOS)
        .frame(minWidth: 480, minHeight: 430)
        #endif
    }

    private func clearCustomer() {
        customerId = ""
        customerName = ""
    }

    private func create() {
        // The button is disabled while a create is in flight; this is the same
        // guard from the other direction, for a second tap that beat the redraw.
        guard !saving else { return }
        saving = true
        error = ""

        firebaseManager.createProjectThroughCallable(
            customerId: customerId,
            customerName: customerName,
            projectName: projectName,
            dueDate: hasDueDate ? dueDate : nil
        ) { result in
            saving = false
            switch result {
            case .success(let outcome):
                onCreated(outcome)
                dismiss()
            case .failure(let failure):
                // The form stays open holding what was typed, so a refused
                // create costs the person nothing but the press.
                error = failure.localizedDescription
            }
        }
    }
}

// MARK: - Rows

private struct QuickCreateCustomerRow: View {
    let customerName: String
    let lang: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 10) {
                Image(systemName: customerName.isEmpty ? "person.crop.circle.badge.questionmark" : "person.crop.circle.fill")
                    .foregroundColor(customerName.isEmpty ? .secondary : .blue)
                Text(customerName.isEmpty ? t("No customer", lang: lang) : customerName)
                    .foregroundColor(customerName.isEmpty ? .secondary : .primary)
                    .lineLimit(1)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private struct QuickCreateClearCustomerRow: View {
    let lang: String
    let onClear: () -> Void

    var body: some View {
        Button(action: onClear) {
            Text(t("Clear", lang: lang))
                .foregroundColor(.red)
        }
        .buttonStyle(.plain)
    }
}

private struct QuickCreateDueDateRows: View {
    @Binding var hasDueDate: Bool
    @Binding var dueDate: Date
    let lang: String

    var body: some View {
        Toggle(t("Set a due date", lang: lang), isOn: $hasDueDate)
        if hasDueDate {
            DatePicker(t("Due Date", lang: lang), selection: $dueDate, displayedComponents: .date)
        }
    }
}

private struct QuickCreateErrorRow: View {
    let message: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.orange)
            Text(message)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: - Customer picker

/// There is no reusable customer picker in this app: the customers screen keeps
/// its search filter and its search field as private members of one very large
/// view. This is the shared one, laid out like the shared-files order picker so
/// a long list behaves the way the other long list does.
struct QuickCreateCustomerPickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    #if !os(macOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    #endif

    let lang: String
    let customers: [Musteri]
    let onPick: (Musteri) -> Void
    let onTypedName: (String) -> Void
    let onNoCustomer: () -> Void

    @State private var searchText = ""

    private var isPhoneLayout: Bool {
        #if os(macOS)
        return false
        #else
        return horizontalSizeClass == .compact
        #endif
    }

    private var query: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var results: [Musteri] {
        let sorted = customers.sorted { $0.lastContactDate > $1.lastContactDate }
        guard !query.isEmpty else { return sorted }
        return sorted.filter {
            $0.name.localizedStandardContains(query)
                || $0.email.localizedStandardContains(query)
                || $0.phone.localizedStandardContains(query)
                || ($0.company ?? "").localizedStandardContains(query)
                || ($0.whatsappNumber ?? "").localizedStandardContains(query)
        }
    }

    /// Offered only when the typed name is not already somebody's, so the same
    /// person cannot be entered twice under two spellings of the same word.
    private var showsInlineAdd: Bool {
        guard !query.isEmpty else { return false }
        return !customers.contains { $0.name.compare(query, options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            QuickCreateCustomerPickerHeader(lang: lang, onClose: { dismiss() })
            QuickCreateCustomerSearchField(lang: lang, text: $searchText)
            Divider().background(Color.primary.opacity(0.08))
            listBody
        }
        .frame(minWidth: isPhoneLayout ? 0 : 460, minHeight: isPhoneLayout ? 0 : 520)
    }

    private var listBody: some View {
        ScrollView {
            LazyVStack(spacing: 10) {
                QuickCreateNoCustomerRow(lang: lang) {
                    onNoCustomer()
                    dismiss()
                }

                if showsInlineAdd {
                    QuickCreateAddCustomerRow(name: query, lang: lang) {
                        onTypedName(query)
                        dismiss()
                    }
                }

                ForEach(results) { customer in
                    QuickCreateCustomerResultRow(customer: customer) {
                        onPick(customer)
                        dismiss()
                    }
                }

                if results.isEmpty && !showsInlineAdd {
                    Text(t("No matching customers.", lang: lang))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                }
            }
            .padding(18)
        }
    }
}

private struct QuickCreateCustomerPickerHeader: View {
    let lang: String
    let onClose: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "person.2.fill")
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(.blue)
                .frame(width: 42, height: 42)
                .background(Color.blue.opacity(0.12))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            VStack(alignment: .leading, spacing: 4) {
                Text(t("Choose a customer", lang: lang))
                    .font(.system(size: 20, weight: .bold))
                Text(t("Search the workspace, type a new name, or leave the project without a customer.", lang: lang))
                    .font(.system(size: 12))
                    .foregroundColor(.gray)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)

            Button(action: onClose) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(.secondary)
            }
            .buttonStyle(.plain)
        }
        .padding(18)
    }
}

private struct QuickCreateCustomerSearchField: View {
    let lang: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundColor(.secondary)
            TextField(t("Search customers…", lang: lang), text: $text)
                .textFieldStyle(.plain)
        }
        .padding(11)
        .background(Color.primary.opacity(0.055))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.horizontal, 18)
        .padding(.bottom, 12)
    }
}

private struct QuickCreateNoCustomerRow: View {
    let lang: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Image(systemName: "circle.slash")
                    .foregroundColor(.secondary)
                Text(t("No customer", lang: lang))
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.primary)
                Spacer(minLength: 0)
            }
            .padding(12)
            .background(Color.primary.opacity(0.045))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct QuickCreateAddCustomerRow: View {
    let name: String
    let lang: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                Image(systemName: "person.badge.plus")
                    .foregroundColor(.green)
                VStack(alignment: .leading, spacing: 3) {
                    Text(name)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                    Text(t("Add as a new customer", lang: lang))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding(12)
            .background(Color.green.opacity(0.10))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

private struct QuickCreateCustomerResultRow: View {
    let customer: Musteri
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(customer.name)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                    Text(subtitle)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.secondary)
            }
            .padding(12)
            .background(Color.primary.opacity(0.045))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private var subtitle: String {
        let parts = [customer.email, customer.phone, customer.company ?? ""]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return parts.isEmpty ? "-" : parts.joined(separator: " · ")
    }
}
