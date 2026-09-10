# Gece çalışma raporu — 10 Eylül 2026 (operatör uyurken, yetkili kapsam)

Yetki: 10 Eyl gece mesajı (6 iş, sırayla; rutin uygulama/test/commit/push ve açıkça yetkilendirilen deploy'lar için
yeniden onay yok; giriş/MFA/dış yanıt/ürün kararı → BLOCKED; yeni HIGH → o hattın deploy'u durur; force-push/reset yok).
Bu dosya ilerledikçe güncellenir; her deploy için kaynak/revision/rollback kaydı ve "hazır ama yayınlanmamış" ayrımı tutulur.

| İş | Tamamlanan | Commit/branch | Test kanıtı | Canlı durum | Kalan engel | Sabah gereken karar |
|---|---|---|---|---|---|---|
| 1. OpenAI başvuru paketi | Platformdaki 1.2.0 taslağı (asdk_app_v_6aa205eb…) dolduruldu ve taslak olarak kaydedildi: Info (ad, sürüm 1.2.0, alt başlık, onaylı Description, kategori Productivity, kimlik Business — NivaDesk, yazar EGGCRAFT LIMITED, 4 URL + demo videosu, ikonlar), MCP sunucu URL'si, Testing (giriş bilgileri şifre HARİÇ; 5 pozitif + 3 negatif test; rakamlar canlı handler'larla yeniden doğrulandı), Submit → Release Notes. Global: tüm ülkeler. Yazma testleri koştu: update_order_status fixture'da (bildirim KAPALI, e-posta/telefon yok; aynı statüyle 2. çağrı 2. history satırı ekledi, hiçbir mesaj gitmedi) ve attach_bank_receipt sentetik ESET satırında (OCR ile eşleşti, eski dosya silindi = replace); ESET satırı reviewer için tekrar 'fişsiz' bırakıldı. | deploy dalı: docs/security/evidence/oauth-client-registry-gap-2026-09-10.md, docs/security/evidence/openai-1.2.0-write-tests-2026-09-10.md (bu commit) | write-tests dosyası §1–3; read-only rakamlar aynı dosya §3 | 1.2.0 canlı (değişmedi). Platform: 1.0.0 Published, 1.1.1 Rejected, 1.2.0 Draft (Submit BASILMADI). Not: taslağı 01:20Z'de sürümsüz edit URL'sine gitmem oluşturdu (platform 2.0.0 adıyla boş taslak açtı; 1.2.0'a çevrildi) — 1.1.1 verisi taslağa taşınmaz, hepsi elle girildi | **HIGH (canlı regresyon):** OpenAI/ChatGPT'nin 21 Ağu'da kaydettiği OAuth client'ının kaydı yok (14ff0cfb, 4 Eyl'den beri her connect 'This client is not registered' ile reddediliyor; 4 Eyl'den beri 0 başarılı consent). Bu yüzden Scan Tools (→ tool gerekçe alanları) ve ChatGPT review bağlantısını yeniden kurma BLOCKED; platform 'Client registration is locked' diyor, yeniden kayıt yok. Ayrıca: şifre alanı (benim yazmam yasak), 4 policy onay kutusu + mature-content seçimi (şart kabulü) | (1) chatgptOAuthClients'a TEK kaydı geri yazma kararı (evidence §5; rollback = silme) → sonra Scan Tools + gerekçeler (platform-justifications.json hazır) + review hesabını ChatGPT'de yeniden bağlama; (2) Testing → şifreyi yapıştır; (3) Submit sayfasında policy kutuları + 'No' mature; (4) 16 demo siparişte portalAutoUpdates.enabled=false yapılsın mı (reviewer statü değiştirirse gerçek görünümlü adreslere e-posta gider); (5) Submit'e basılsın mı |
| 2. Web onboarding yayını | — | — | — | — | — | — |
| 3. substantiveOrder / v2.1 | — | — | — | — | — | — |
| 4. Retention (gönderim kapalı) | — | — | — | — | — | — |
| 5. eBay / Etsy hazırlığı | — | — | — | — | — | — |
| 6. Açık takipler | — | — | — | — | — | — |

## Zaman çizelgesi
- 01:20Z — rapor açıldı; 1. iş başladı.
- 01:36Z — Scan Tools → OAuth: chatgptOAuthAuthorize 'unregistered_client' (client 21 Ağu kayıtlı, kaydı yok; 14ff0cfb). HIGH kaydedildi, üretime yazılmadı.
- 01:55Z — update_order_status yazma testi (fixture pMfJ9be6wE1ZC1wzmns1), bildirim yok. 01:59Z — attach_bank_receipt ESET (demo) eşleşti/replace; sonra fişsiz bırakıldı.
- 02:05Z — taslak formu tamamlandı (scan + gerekçeler + şifre + policy hariç); Submit basılmadı.
