import UIKit
import UniformTypeIdentifiers

final class ClientFileShareViewController: UIViewController {
    private let statusLabel = UILabel()
    private let spinner = UIActivityIndicatorView(style: .medium)
    private let openButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        configureView()
        saveIncomingFiles()
    }

    private func configureView() {
        view.backgroundColor = .systemBackground

        statusLabel.text = "Saving file for NivaDesk…"
        statusLabel.font = .systemFont(ofSize: 15, weight: .semibold)
        statusLabel.textColor = .label
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0

        spinner.startAnimating()

        openButton.setTitle("Open NivaDesk", for: .normal)
        openButton.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        openButton.isHidden = true
        openButton.addTarget(self, action: #selector(openMainAppButtonTapped), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [spinner, statusLabel, openButton])
        stack.axis = .vertical
        stack.spacing = 14
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24)
        ])
    }

    private func saveIncomingFiles() {
        let extensionItems = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        let providers = extensionItems.flatMap { $0.attachments ?? [] }
        let supportedTypeIdentifiers = [UTType.pdf.identifier, UTType.image.identifier]

        var savedCount = 0
        let group = DispatchGroup()

        for provider in providers {
            guard let typeIdentifier = supportedTypeIdentifiers.first(where: { provider.hasItemConformingToTypeIdentifier($0) }) else { continue }

            group.enter()
            provider.loadFileRepresentation(forTypeIdentifier: typeIdentifier) { temporaryURL, error in
                defer { group.leave() }
                guard let temporaryURL else { return }

                let suggestedName = provider.suggestedName.map { name -> String in
                    let ext = temporaryURL.pathExtension
                    if name.lowercased().hasSuffix(".\(ext.lowercased())") || ext.isEmpty { return name }
                    return name + "." + ext
                }

                if SharedClientFileInbox.saveSharedFile(
                    from: temporaryURL,
                    originalFileName: suggestedName,
                    contentType: UTType(typeIdentifier)?.preferredMIMEType
                ) != nil {
                    savedCount += 1
                }
            }
        }

        group.notify(queue: .main) { [weak self] in
            self?.finish(savedCount: savedCount)
        }
    }

    private func finish(savedCount: Int) {
        spinner.stopAnimating()

        if savedCount > 0 {
            statusLabel.text = "Saved for NivaDesk. Tap Open NivaDesk to choose the order."
            openButton.isHidden = false
            openButton.isEnabled = true
        } else {
            statusLabel.text = "This file type is not supported. Please share a PDF or image."

            DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) { [weak self] in
                self?.extensionContext?.completeRequest(returningItems: nil)
            }
        }
    }

    @objc private func openMainAppButtonTapped() {
        openMainApp()
    }

    private func openMainApp() {
        guard let url = URL(string: "nivadesk://client-files") else { return }
        openButton.isEnabled = false
        statusLabel.text = "Opening NivaDesk…"

        extensionContext?.open(url) { [weak self] success in
            DispatchQueue.main.async {
                guard let self else { return }
                if success || self.openURLUsingResponderChain(url) {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.55) { [weak self] in
                        self?.extensionContext?.completeRequest(returningItems: nil)
                    }
                } else {
                    self.openButton.isEnabled = true
                    self.statusLabel.text = "Saved for NivaDesk. If it does not open automatically, open NivaDesk manually and the order selection will appear."
                }
            }
        }
    }

    @discardableResult
    private func openURLUsingResponderChain(_ url: URL) -> Bool {
        let selector = NSSelectorFromString("openURL:")
        var responder: UIResponder? = self

        while let currentResponder = responder {
            if currentResponder.responds(to: selector) {
                currentResponder.perform(selector, with: url)
                return true
            }
            responder = currentResponder.next
        }

        return false
    }
}
