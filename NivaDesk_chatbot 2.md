Bence ikinizin arasında bir sistem en doğrusu olur. Stocksmith’in ekranı kullanıcıya seçenekleri çok net anlatıyor ama biraz “support portal” hissi veriyor. Sizin mevcut ekranınız daha premium ve sade, fakat şu anda chatbot’tan çok iletişim formu gibi görünüyor.
NivaDesk için ben bunu şöyle kurgulardım:
Kullanıcı pencereyi açınca email/name formu görmesin. Direkt sohbet başlasın:
“Hi 👋 How can I help with NivaDesk?”
Altında 3–4 küçük suggestion olabilir: Plans & pricing · Features · Migrating to NivaDesk · Talk to our team
Kullanıcı sorusunu yazsın, AI önce cevaplasın. Knowledge Base'i zaten arka planda kullansın; kullanıcıya ayrıca “Search Knowledge Base” seçeneği koymaya bence gerek yok.
AI cevabından emin değilse uydurmamalı. Şu tarz bir geçiş çok doğru olur:
“I’m not completely sure about this one. I can pass this conversation to the NivaDesk team.”
Sonra Send to the team butonu.
Kullanıcı bunu seçerse o anda konuşma Human support / Waiting for NivaDesk team durumuna geçsin. Buradan sonra AI cevap vermeyi bıraksın ve siz aynı conversation'a girip cevap yazın. Bu şu an yaptığınız mantığın daha düzgün UX versiyonu.
Kullanıcı isterse AI doğru cevap verse bile her zaman küçük bir Talk to a person seçeneği bulabilsin.
En önemli değiştireceğim şey ise email sistemi olurdu. Bütün konuşmaların Support bölümüne düşmesi çok iyi; çünkü ileride “insanlar en çok neyi soruyor?”, “AI neyi cevaplayamıyor?” gibi çok değerli veriniz oluyor. Ama AI'ya yazılan her mesajın size ayrıca email olarak gelmesi bence uzun vadede yanlış. 50–100 müşteri olduğunda inbox kullanılmaz hale gelir.
Ben şu mantığı kullanırdım:
Support inbox'a: bütün konuşmalar kaydedilsin.
Email notification: sadece insan müdahalesi gerektiğinde gelsin. Örneğin AI needs_human durumuna geçtiğinde, kullanıcı özellikle “talk to team” dediğinde veya sizin cevabınızdan sonra kullanıcı tekrar mesaj attığında.
AI'nın başarıyla cevapladığı normal sorular için email göndermeyin. İsterseniz günlük tek bir özet olabilir: “Today: 23 AI conversations · 19 resolved · 4 need review.”
Bir de sizin ilk ekranda şu anki:
Leave your email and we'll come straight back to you.
metni AI chatbot mantığıyla biraz çelişiyor. Kullanıcı burada “ben mesaj bırakıyorum, birkaç saat sonra biri cevap verecek” diye düşünüyor. Halbuki sisteminiz aslında çok daha güçlü: önce anında AI, gerektiğinde gerçek insan. Bunu ürünün avantajı olarak göstermek lazım.
Mesela üst tarafı çok sade:
Ask NivaDesk
Get an instant answer, or speak to our team if you need us.
Ardından direkt conversation alanı.
Ayrıca login olmuş NivaDesk kullanıcılarından email ve isim hiç istemezdim. Zaten hangi workspace ve hangi kullanıcı olduğunu biliyorsunuz. Hatta destek ekranında sizin tarafınızda şöyle görünmesi çok değerli olur:
Gunes · EGGcraft Ltd
Orders: 42 · Plan: Pro
Current page: Banking → Transactions
Conversation: “How do I attach a receipt?”
Böylece kullanıcı “şu buton çalışmıyor” dediğinde siz hangi ekranda olduğunu bile görebilirsiniz. Bu, sıradan web chatbotlarından NivaDesk'i ciddi şekilde ayırır.
Ben olsam akışı kabaca şöyle yapardım:
AI → AI → AI → emin değil → handoff → NivaDesk team → human replies → resolved
ve hiçbir zaman:
AI → bilmiyor → conversation bitiyor → kullanıcı yeniden form dolduruyor
yapmazdım. Aynı thread devam etmeli.
Son olarak Stocksmith'teki üç büyük kartı birebir almam. NivaDesk için biraz fazla. Sizin mevcut yeşil tasarımınızı koruyup gerçek bir chat interface'e dönüştürmek çok daha premium durur. Stocksmith'ten alınacak esas fikir, kullanıcıya AI mı insan mı ile konuştuğunu açıkça göstermek.
