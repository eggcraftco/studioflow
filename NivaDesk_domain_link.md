Evet — araştırınca benim görüşüm netleşti: NivaDesk Customer Portal’ın ideal hali, NivaDesk domaininde değil müşterinin kendi markasının domaininde çalışmalı. Ama bunu herkes için zorunlu yapmamak lazım.
Piyasadaki iyi sistemlerin kullandığı model de büyük ölçüde bu.
Piyasada üç yaklaşım var
1. SaaS domaini altında portal: Jobber hâlâ Client Hub’ı clienthub.getjobber.com/... üzerinden çalıştırıyor; işletme kendi websitesine “Client Login” butonu koyabiliyor ama portal URL’si Jobber domaininde kalıyor. Buna karşılık logo, şirket bilgileri ve renkler markalanabiliyor.
2. Varsayılan SaaS URL + isteğe bağlı custom domain: Bence NivaDesk için doğru model bu. Dubsado varsayılan olarak hello.dubsado.com kullanıyor ama işletme isterse portal.yourdomain.com gibi kendi domainini CNAME ile bağlayabiliyor; bundan sonra invoice, form, scheduler ve client portal linklerinin hepsi custom domain üzerinden açılıyor.
Plutio da aynı modeli kullanıyor: varsayılan Plutio adresini app.yourbrand.com gibi custom domain ile değiştiriyor; DNS doğrulandıktan sonra SSL’i otomatik provision ediyor ve client portal dahil bütün client-facing sayfalar o domain üzerinden çalışıyor.
SuiteDash ise bunu daha da ileri götürüp tamamen white-label portal olarak sunuyor; örnekleri doğrudan portal.yourbusiness.com şeklinde.
Yani senin düşündüğün şey tamamen doğru ve piyasada kanıtlanmış model.
NivaDesk için benim önerdiğim yapı
NivaDesk workspace'in kendi sitesi olduğunu düşünelim:
eggcraft.co.uk
Portal şu olmalı:
track.eggcraft.co.uk
veya
portal.eggcraft.co.uk
Ben repair/custom order işi için track. ismini daha çok seviyorum.
Örneğin müşteriye SMS gelir:
Your watch is now being painted.
Track your order:
track.eggcraft.co.uk/r/7K4P2D
Müşteri tıklıyor.
Adres çubuğunda:
track.eggcraft.co.uk
görüyor.
Sayfada EGGcraft logosu, EGGcraft renkleri var.
NivaDesk'i hiçbir yerde görmesine gerek yok.
Bu psikolojik olarak ciddi fark yaratıyor:
nivadesk.app/client/7K4P2D
→ “Bu şirket başka bir uygulama kullanıyor.”
track.eggcraft.co.uk/r/7K4P2D
→ “EGGcraft'ın kendi order tracking sistemi.”
Özellikle jewellery, watches, bespoke tailoring gibi premium işlerde ikinci deneyim çok daha iyi.
Ama eggcraft.co.uk/track/... yapmayalım
Burada teknik olarak önemli bir ayrım var.
İlk bakışta en güzel URL şu gibi görünebilir:
eggcraft.co.uk/track/R1058
Ama bunu SaaS tarafında yönetmek çok daha zor.
Çünkü DNS:
eggcraft.co.uk/track
gibi path bazında yönlendirme yapmaz.
DNS sadece:
track.eggcraft.co.uk
gibi hostname'i NivaDesk'e yönlendirebilir.
eggcraft.co.uk/track kullanmak için EGGcraft websitesinin server/reverse proxy ayarlarına müdahale etmek gerekir. WordPress, Wix, Shopify, Squarespace, Cloudflare vb. her birinde ayrı çözüm çıkar.
Bu yüzden Dubsado, Plutio ve SuiteDash gibi sistemler de genellikle:
portal.customer.com
modelini kullanıyor.
Bence NivaDesk de aynı şeyi yapmalı.
Kurulum kullanıcı açısından çok kolay olmalı
NivaDesk:
Settings → Customer Portal → Custom Domain
Portal Domain
track.eggcraft.co.uk
NivaDesk sonra:
Add this DNS record to your domain provider:
Type    Name    Target
CNAME    track    customers.nivadesk.app
Kullanıcı domain şirketine gidiyor ve bunu ekliyor.
NivaDesk:
Checking domain...
↓
🟢 Domain verified
↓
🟢 SSL active
↓
https://track.eggcraft.co.uk
Hazır.
Plutio ve Dubsado tam olarak CNAME + verification modelini kullanıyor. Plutio SSL sertifikasını otomatik provision edip yeniliyor.
NivaDesk arka tarafta nasıl çalışacak?
Tek uygulama olacak.
Örneğin:
track.eggcraft.co.uk/r/ABC123
ve:
portal.johnsjewellers.com/r/XYZ987
ikisi de aslında aynı NivaDesk application'a gider.
Request geldiğinde NivaDesk:
Host header:
track.eggcraft.co.uk
↓
database'de arar:
Bu domain hangi workspace'e ait?
↓
EGGcraft workspace
↓
EGGcraft branding + doğru order gösterilir.
Cloudflare'ın SaaS custom-hostname mimarisi tam olarak bu kullanım için tasarlanmış; SaaS sağlayıcısı binlerce müşteri domainini tek platforma bağlayabiliyor ve her hostname için SSL'i otomatik yönetebiliyor.
Teknik olarak ben geliştiriciye Cloudflare for SaaS / Custom Hostnames tarafını ciddi şekilde inceletirdim.
NivaDesk için iki domain seviyesi yapardım
Burada güzel bir ürün fikri var.
Website'i olmayan kullanıcıyı da düşünmek gerekiyor.
Standart portal
Her workspace otomatik olarak:
eggcraft.nivadesk.app
alabilir.
Sonra:
eggcraft.nivadesk.app/r/R1058
Bu şu ankinden bile daha güzel.
Şu an:
nivadesk.app/client/...
yerine workspace markası öne çıkar.
Custom Domain
Website'i olan:
track.eggcraft.co.uk
kullanır.
Dolayısıyla:
No custom domain
↓
eggcraft.nivadesk.app

Custom domain connected
↓
track.eggcraft.co.uk
Bu bence mükemmel fallback.
Customer Portal branding'i sadece domain olmamalı
Burası önemli.
Custom domain yapıp sayfada:
NivaDesk
logosu bırakmak anlamsız olur.
Customer Portal Settings içinde:
Branding
Logo
EGGcraft logo
Primary colour
#....
Portal title
Track Your Order
Favicon
EGGcraft icon
Domain
track.eggcraft.co.uk
Contact email
hello@eggcraft.co.uk
Contact phone
...
Website
eggcraft.co.uk
Powered by NivaDesk
ON / OFF
olmalı.
Dubsado URL'nin yanında favicon, browser title ve social preview metadata'sını bile customize ettiriyor.
Bunu NivaDesk'te de yapardım.
SMS açısından da çok daha iyi olur
Az önce konuştuğumuz SMS sistemiyle birleşince:
Kötü deneyim
EGGcraft
Your repair is ready.
nivadesk.app/client/82JKS8
İsim EGGcraft ama link NivaDesk.
Phishing gibi bile görünebilir.
İyi deneyim
EGGcraft
Your repair is ready.
track.eggcraft.co.uk/r/82JKS8
Burada:
SMS sender:
EGGcraft
Domain:
eggcraft.co.uk
Portal:
EGGcraft
Üçü birden uyuşuyor.
Trust açısından çok daha iyi.
Authentication'ı nasıl yapalım?
Jobber burada güzel bir model kullanıyor.
Client Hub'a müşteriler secure personalized link üzerinden girebiliyor ve password gerekmiyor. Güvenlik amacıyla link eskiyse tekrar email veya telefon bilgisinin bir kısmıyla verification istenebiliyor.
NivaDesk için de ben:
İlk tıklama
Unique secure link.
Login yok.
Örneğin:
track.eggcraft.co.uk/r/c8R2p1Qx
Müşteri direkt görüyor.
Ama:
link çok eskiyse,
hassas information varsa,
ödeme yapılacaksa,
müşteri hesabına tekrar erişiyorsa
NivaDesk:
Please verify your email
ve one-time code gönderir.
Bu experience açısından password account yaratmaktan çok daha iyi.
Güvenlikte çok önemli bir şey
URL:
❌ track.eggcraft.co.uk/order/1058
olmasın.
Çünkü adam:
1058 → 1059
yazıp başkasının order'ına erişmeye çalışabilir.
Dış URL'de mutlaka random high-entropy token kullanılmalı:
track.eggcraft.co.uk/r/f8Gk2mPx71
Database tarafında bunun:
Order #1058
olduğu bilinir.
Customer'a gerçek sequential internal ID göstermek zorunda bile değilsiniz.
Domain değişirse eski linkler ne olacak?
Dubsado'nun burada ilginç bir problemi var: custom CNAME'i değiştirirseniz eski custom-domain linkleri bozulabiliyor. Kendi dokümanları da domain değiştirmenin daha önce gönderilmiş linkleri kırabileceği konusunda uyarıyor.
NivaDesk'i bundan daha iyi yapabiliriz.
Mesela EGGcraft önce:
eggcraft.nivadesk.app/r/ABC
kullandı.
Sonra:
track.eggcraft.co.uk/r/ABC
bağladı.
Eski:
eggcraft.nivadesk.app/r/ABC
linki bozulmamalı.
301/302 ile:
track.eggcraft.co.uk/r/ABC
adresine yönlenmeli.
Aynı şekilde custom domain kaldırılırsa fallback URL tekrar çalışmalı.
Bu küçük ama çok iyi mühendislik detayı.
Portal sadece tracking için kalmasın
Bir kere custom domain infrastructure yaptığınızda sadece şu:
Order status
için kullanmak yazık olur.
Aynı domain gelecekte:
track.eggcraft.co.uk/r/...
Order tracking
track.eggcraft.co.uk/estimate/...
Estimate approval
track.eggcraft.co.uk/invoice/...
Invoice
track.eggcraft.co.uk/pay/...
Payment
track.eggcraft.co.uk/files/...
Shared files
gibi NivaDesk'in bütün customer-facing layer'ı olabilir.
Dubsado ve Plutio'nun yaptığı tam olarak bu: custom domain yalnızca portalı değil invoice, proposal, contract, forms gibi client-facing yüzeylerin tamamını kapsıyor.
Bence NivaDesk de baştan bu şekilde tasarlanmalı.
Yani teknik entity adı bile:
❌ customerPortalCustomDomain
yerine:
workspaceClientDomain
gibi daha genel olsun.
Planlara nasıl dağıtırdım?
Burada önceki Pro/Team konuşmamızı biraz geliştiriyorum.
Free
workspace.nivadesk.app
NivaDesk branding.
Lite £9
workspace.nivadesk.app
Business logo/colors.
Small “Powered by NivaDesk”.
Pro £19
Customer Portal zaten burada.
Ben şunları verirdim:
Custom logo ✅
Colours ✅
Portal ✅
Remove Powered by NivaDesk ✅
Ama custom domain konusunda iki seçenek var.
Seçenek A — Growth odaklı
Custom domain Pro'da dahil.
£19 çok güçlü görünür.
Bence NivaDesk yeni olduğu için şimdilik bunu tercih ederim.
Team £49
Custom domain +
custom sending email:
updates@eggcraft.co.uk
multi-user customer communications
advanced permissions.
İleride NivaDesk çok büyürse custom domain'i:
£5/month White Label Add-on
yapabilirsiniz.
Plutio şu anda benzer modeli kullanıyor; custom domain dahil white-label özelliğini $9/month add-on olarak satıyor.
Ama şu anda ben £19 Pro'ya dahil edip Pro'yu daha çekici hale getirirdim.
Benim NivaDesk için nihai önerim
Şöyle yapın:
Default
eggcraft.nivadesk.app
Pro+
track.eggcraft.co.uk
Technical setup
Customer:
track.eggcraft.co.uk
        │
        │ CNAME
        ▼
customers.nivadesk.app
        │
        ▼
Cloudflare / Custom Hostname
        │
        ▼
NivaDesk
        │
        ▼
workspace = EGGcraft
        │
        ▼
Customer Portal
SSL otomatik.
Domain verification otomatik.
Her workspace sadece doğruladığı domaini kullanabilir.
Eski NivaDesk links fallback olarak çalışmaya devam eder.
Ve custom domain sadece tracking için değil bütün client-facing NivaDesk pages için kullanılmalı.
Bence bu özellik özellikle sizin hedeflediğiniz premium custom-order/jewellery/watch müşterileri için oldukça yüksek değerli. Hatta SMS özelliğinden önce bile custom domain altyapısını yapmak mantıklı olabilir; çünkü SMS, email, estimate approval ve portalın hepsi daha sonra bu branded URL'leri kullanır.
