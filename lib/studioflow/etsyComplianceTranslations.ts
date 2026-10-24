import type { StudioLanguage } from "./language";

// Etsy API Terms compliance (24 Oct 2026): the notes on Etsy orders and the Etsy
// settings section. Turkish here; other languages fall back to English. The
// trademark notice (T1) is deliberately NOT in this table: it is never translated.
// Merged last in language.ts.
export const ETSY_COMPLIANCE_TRANSLATIONS: Record<string, Partial<Record<StudioLanguage, string>>> = {
  "Questions about the Etsy connection? Email": {
    "Türkçe": "Etsy bağlantısıyla ilgili sorularınız için e-posta:"
  },
  "By connecting Etsy you agree to the NivaDesk {terms} and our {privacy}.": {
    "Türkçe": "Etsy'yi bağlayarak NivaDesk {terms} ve {privacy} metinlerini kabul etmiş olursunuz."
  },
  "Terms": {
    "Türkçe": "Koşullar"
  },
  "Privacy Policy": {
    "Türkçe": "Gizlilik Politikası"
  },
  "Link copied.": {
    "Türkçe": "Bağlantı kopyalandı."
  },
  "Etsy order — NivaDesk does not send status, delivery or tracking messages to Etsy buyers (Etsy's API terms). Add tracking on Etsy; Etsy tells the buyer.": {
    "Türkçe": "Etsy siparişi — NivaDesk, Etsy alıcılarına durum, teslimat veya kargo takip mesajı göndermez (Etsy API koşulları). Takip numarasını Etsy'de ekleyin; alıcıya Etsy bildirir."
  },
  "Etsy order — NivaDesk does not send this link to the buyer. If you share it yourself, use Etsy Messages.": {
    "Türkçe": "Etsy siparişi — NivaDesk bu bağlantıyı alıcıya göndermez. Kendiniz paylaşacaksanız Etsy Mesajlar'ı kullanın."
  },
  "Etsy order — NivaDesk does not send this reply to the buyer. Paste it into Etsy Messages yourself.": {
    "Türkçe": "Etsy siparişi — NivaDesk bu yanıtı alıcıya göndermez. Etsy Mesajlar'a kendiniz yapıştırın."
  },
  "This conversation is linked to an Etsy order. NivaDesk can't send replies here (Etsy's API terms) — reply in Etsy Messages. Reading, linking and notes still work.": {
    "Türkçe": "Bu konuşma bir Etsy siparişine bağlı. NivaDesk buradan yanıt gönderemez (Etsy API koşulları) — Etsy Mesajlar'dan yanıtlayın. Okuma, bağlama ve notlar çalışmaya devam eder."
  },
  "Etsy order — the buyer's e-mail is not sent to DHL.": {
    "Türkçe": "Etsy siparişi — alıcının e-posta adresi DHL'ye gönderilmez."
  }
};
