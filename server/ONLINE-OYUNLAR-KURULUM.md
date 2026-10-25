# FOFANA GAMES çevrimiçi sunucu kurulumu

## Gereksinimler
- Node.js 18 veya üstü
- npm
- İlk kurulumda internet erişimi (Express ve Socket.IO paketlerini indirmek için)

## Çalıştırma
1. Proje ZIP'ini tamamen çıkar.
2. Terminalde çıkardığın güncel proje klasörünün içindeki `server/` klasörüne gir.
3. `npm install` çalıştır.
4. `npm test` ile sunucu tarafındaki oyun motoru testlerini çalıştır.
5. `npm start` ile sunucuyu başlat.
6. Bilgisayarda `http://localhost:3000` adresini aç.
7. Aynı Wi-Fi ağındaki telefonlardan bilgisayarın yerel IP adresine `:3000` ekleyerek bağlan. Windows güvenlik duvarında özel ağ için Node.js bağlantısına izin vermek gerekebilir.

`GET /health` uç noktası sunucunun yanıt verdiğini gösterir. Bu, tek başına internetten erişilebilir olduğu anlamına gelmez.

## Çevrimiçi Tabu (v1.63)
- Oda oluşturup 6 karakterli kodu arkadaşlarınla paylaş. Her oyuncu kendi telefonundan aynı Node.js sunucusuna bağlanır. En fazla 12 oyuncu ve iki takım desteklenir.
- Katılırken takım seçebilir veya dengeli otomatik dağıtımı kullanabilirsin. Oda sahibi takım isimlerini, 15-180 saniye tur süresini ve 10/15/20/30 puan hedefini belirler. Seçilen hedef puan sunucu oyun motoruna aktarılır.
- Tur başlatan oyuncu anlatıcı olur. Hedef ve yasaklı kelimeler yalnızca anlatıcıya özel `tabu:state` mesajında gönderilir. Eylemler, puanlar ve tur süresi sunucu tarafından doğrulanır.
- Bağlantı koparsa oyuncu, takımı, oda sahibi yetkisi ve anlatıcıysa aktif kartı 90 saniyelik kurtarma penceresinde saklanır. Aynı sekme yenilenince veya Socket.IO yeniden bağlanınca kayıtlı oturum anahtarı otomatik gönderilir. Başarılı kurtarmada anahtar döndürülür; anlatıcının süresi duraklatılır ve kaldığı saniyeden devam eder.
- Oyuncu 90 saniye içinde dönmezse odadan temizlenir. Bir takım boş kalırsa oyun durdurulup lobiye alınır. Bilinçli **Odadan ayrıl** işlemi üyeliği hemen siler, 90 saniye bekletmez.
- Kurtarma anahtarları genel oda durumuna gönderilmez. Çevrimiçi deste `server/tabu-cards.js` içinde tutulur; hedef kart yalnızca anlatıcıya gönderilir. Çevrimdışı deste ayrı dosyadadır.
- Oda sahibinin lobide bağlantısı koparsa ilk katılımcı geçici sahip olur; eski sahip süre dolmadan dönünce yetkiyi geri alır. Maç başlarken bağlantısı kesik lobi rezervasyonları temizlenir.
- Maç bittikten sonra yalnızca oda sahibi lobiye dönerek hedef puan/süre ayarlarını değiştirebilir ve yeni maç başlatabilir. Aktif maçtan lobiye dönme isteği reddedilir.
- Tabu için oyun motoru, kart veri kalitesi, gizlilik, token kurtarma, geçici sahiplik, lobi dönüşü ve sahte Socket.IO oda entegrasyon testleri bulunur; bunlar gerçek internet/telefon testi değildir.

- v1.62: Oda sahibi davet bağlantısını paylaşabilir; bağlantıyı açan oyuncuda oda kodu otomatik doldurulur. Katılmak için oyuncunun adını girip onaylaması gerekir.
- v1.63: Lobi oyuncusu maç başlamadan kendi takımını değiştirebilir. Sunucu, bağlı tek oyuncuyu takımından çıkartıp bir takımı boş bırakan değişikliği reddeder; maç başlayınca takım seçimi kilitlenir.

## İnternetten oynatma
Yerel IP adresi yalnızca aynı yerel ağda çalışır. Farklı evlerden bağlanmak için Node.js uygulamasını WebSocket destekleyen bir hosting/VPS platformuna dağıt, platformun verdiği HTTPS adresini kullan ve `PORT` ortam değişkenini destekle. Üretim ortamında HTTPS, güncel bağımlılıklar, loglama ve oda/bağlantı limitleri önerilir.

## Bilinen sınırlamalar
- Oda ve oyun durumu şu an bellekte tutulur; sunucu yeniden başlarsa odalar silinir.
- Tabu, Imposter, İşkembeden Sallama ve Worms için 90 saniyelik token tabanlı oturum kurtarma vardır. Monopoly çevrimiçi modunda kopan oyuncunun oturumunu devam ettirme henüz uygulanmadı.
- Çalışma ortamında npm kayıt sunucusuna DNS bağlantısı kurulamadığı için gerçek Express/Socket.IO sunucusu başlatılarak canlı ağ testi yapılamadı. Tabu sunucu olayları gerçek uygulama kodunu kullanan sahte Socket.IO taşımasıyla test edildi; gerçek iki cihaz testi yayın öncesi gerekliliktir.
- Çevrimiçi Tabu, aynı oyunun yerel modunu kaldırmaz; iki mod aynı sayfada ayrı alanlardır.

## Çevrimiçi İşkembeden Sallama (v1.65)
- İşkembeden Sallama sayfasında **Arkadaşlarınla çevrimiçi oyna** düğmesine bas. Oda sahibi oda kurar ve kodu paylaşır; her arkadaş kendi cihazından katılır.
- Oda sahibi kategoriyi ve 3 ya da 5 soruluk maç uzunluğunu seçebilir.
- Her soruda sunucu kontrollü **45 saniyelik sayaç** çalışır. Süre bitene kadar cevap göndermeyen oyuncuya o tur 0 puan yazılır; oyun diğer oyuncuların beklemesi yüzünden sonsuza kadar kilitlenmez.
- Doğru cevap ve tur puanları tüm oyuncular cevap verene veya süre dolana kadar gizli tutulur. Geçerli tahmin ikinci kez gönderilemez.
- Süre tamamlanınca oda sahibi sonraki soruya geçer. Son sorudan sonra sıralama ve kazanan otomatik gösterilir; oda sahibi lobiye dönerek yeni maç açabilir.
- Soru havuzu ve cevap anahtarı `server/iskembeden-engine.js` içinde sunucu tarafında tutulur; cevaplar istemciye erkenden verilmez.
- Oyuncu bağlantısı koparsa oda, puanı, mevcut tahmini ve oda sahibi bilgisi 90 saniye korunur. Aynı sekme yenilenince veya Socket.IO yeniden bağlanınca `sessionStorage` içindeki kurtarma anahtarı otomatik gönderilir; başarılı kurtarmada anahtar döndürülür.
- Kurtarma anahtarı genel oda durumuna gönderilmez; yanlış, daha önce kullanılmış veya süresi geçmiş anahtarlar reddedilir. Bilinçli **Odadan ayrıl** işlemi oda rezervasyonunu bekletmeden temizler.
- Oda sahibi koparsa bağlı bir oyuncuya geçici sahiplik verilir; ilk sahip 90 saniye içinde dönerse yetkisini geri alır. Lobi başlatılırken bağlantısı kesik rezervasyonlar temizlenir.
- Davet bağlantısı oluşturulabilir; bağlantı açıldığında geçerli altı karakterli oda kodu otomatik doldurulur.
- Yeni oturum kurtarma ve sahte Socket.IO oda entegrasyon testleri vardır; bunlar gerçek internet/telefon testi değildir. Canlı dağıtımda iki ayrı cihazla oda kurma, tahmin, süre sonu ve yeniden bağlanma doğrulanmalıdır.
- Geçici RPC/bağlantı zaman aşımında istemci kayıtlı kurtarma anahtarını silmez; 2,5 saniye sonra çevrimiçi ise otomatik yeniden dener. Sunucunun açıkça reddettiği geçersiz veya süresi geçmiş anahtar silinir.
- Yerel yaş tahmini tam sayı, bütün tahminler 0–1.000.000.000.000 aralığıyla sınırlandırılır; tarayıcı ve sunucu aynı temel giriş doğrulamasını uygular.
- TL ve yüzde gibi ham farkı karşılaştırılamayan birimler aynı havuzda bulunabildiği için genel sıralama toplam puana göre yapılır; eşit toplam puan beraberliktir.
- Davet düğmesi mobil paylaşım menüsünü, pano kopyalamayı veya son çare olarak bağlantı penceresini kullanır; bağlantıdaki kod biçimi kontrol edildikten sonra doldurulur.

## Çevrimiçi Monopoly
- Monopoly sayfasında **Çevrimiçi oyna** düğmesine bas.
- Oda sahibi adını girip oda oluşturur; oda kodunu 1-3 arkadaşına gönderir.
- Diğer oyuncular kendi cihazlarından siteye girip oda koduyla katılır. Oyun 2-4 oyuncuyla başlar.
- Zar, Başlangıç'tan geçişte para kazanma, mülk satın alma veya satın almama, kira, vergi, Şans/Kamu Fonu kartlarının temel etkileri, hapishane ve sıra geçişi sunucu tarafından hesaplanır.
- Sadece sırası gelen oyuncu zar atabilir, satın alma kararı verebilir ve turunu bitirebilir. Herkes aynı tahtayı ve aynı oyun günlüğünü görür.
- Çevrimiçi sürüm şu anda temel oyun akışını kapsar. Ev/otel inşası, ipotek, takas, açık artırma, ayrıntılı borç yapılandırması ve kalıcı kayıt çevrimiçi moda henüz taşınmadı; bunlar yerel modda mevcut olmaya devam eder.


### Monopoly çevrimiçi ekonomi (v1.33)
Monopoly çevrimiçi odasında mülk seçerek ipotek koyabilir/kaldırabilir, ev veya otel inşa edebilir ve bina satabilirsin. Mülk/nakit takası teklif olarak gönderilir; alıcı kendi cihazından kabul etmeden varlıklar aktarılmaz. Ev/otel kuralları ve mülkiyet doğrulaması sunucuda yapılır.


## Çevrimiçi Worms (v1.37)
- İki oyuncu kendi telefonundan oda oluşturup kodla katılır.
- Çevrimiçi atışta istemci yalnızca açı, güç ve silah türünü gönderir. Mermi yörüngesi, çarpışma, hasar, krater, can ve tur değişimi sunucuda hesaplanır.
- İstemci, maç başladıktan sonra arazi veya can durumunu kendi başına değiştiremez. Başlangıç tahtası oda sahibi tarafından bir kez gönderilir.
- Eski v1.37 sürümünde bağlantı kopması odayı lobiye döndürüyordu. Bu davranış v1.68 ile değiştirildi: bağlantı kopunca maç duraklatılır ve oyuncu 90 saniye içinde aynı oturumla dönerse devam eder.
- Sunucu motoru testleri atış kurallarını doğrular, ancak gerçek telefonlar arasında canlı ağ testi ayrıca yapılmalıdır.



## v1.51 notu
Go Kart/araba yarışı ve Stick Run/koşu yarışı bu paket sürümünde kaldırılmıştır. Kaldırılan oyunlara ait eski kurulum adımları bu pakette artık bulunmaz.

### v1.58 Tabu mahremiyeti ve oda yaşam döngüsü
- Çevrim içi Tabu kendi destesini `server/tabu-cards.js` içinden okur. `server/` dizinine yönelik statik istekler URL kodlaması ve yol normalizasyonu sonrasında 404 ile engellenir. Her hedef kelime, tarayıcıda kullanılan açık çevrim dışı destedeki bütün ifadelerden ayrı tutulur.
- Normal çevrim içi oda yayınında hedef kartı yalnızca mevcut anlatıcıya gönderilir; `lastAction` üzerinden kelime sızdırılmaz.
- Bu koruma, Node/Express sunucusu bu paketle çalıştırıldığında geçerlidir. Projenin tamamını ayrı bir statik barındırma servisine sunmak `/server` rotasını uygulamaz; çevrim içi mod için Express sunucusu kullanılmalıdır.


### v1.59 İşkembeden Sallama süre ve maç sonu düzeltmeleri
- 3/5 soruluk maç seçenekleri eklendi; son soruda kazanan otomatik hesaplanır.
- 45 saniyelik sunucu sayacı yeni soru başında sıfırlanır; eksik tahminler süre bitiminde 0 puanlık `forfeited` kayıtlarına dönüşür.
- Zaman aşımı durumu oyuncunun kendi ekranında açıkça belirtilir; sonuç tablosunda yanıt göndermeyen oyuncu `Yanıt yok` olarak gösterilir.
- Mevcut geliştirme ortamında `express` ve `socket.io` bağımlılıkları kurulamadığı için iki bağımsız tarayıcıyla canlı Socket.IO E2E testi atlandı. Birim ve tarayıcı duman testleri bunun yerine geçmez.


### v1.60 Imposter oturum kurtarma
- Imposter odası, geçici bağlantı kopmasında oyuncuyu 90 saniye tutar. Aynı sekme yenilenirse istemci kayıtlı oda kodu ve token ile otomatik bağlanıp rolünü tekrar alır.
- Kurtarma başarılı olunca token yenilenir; yanlış veya süresi dolmuş token reddedilir. Bilinçli ayrılma üyeliği hemen siler.
- Sunucu bellekteki odaları tuttuğu için Node süreci yeniden başlarsa kurtarma yapılamaz. Bu ortamda server handler'ları sahte Socket.IO taşımasıyla test edildi, fiziksel telefonlar arasında canlı E2E doğrulaması yapılmadı.


### v1.65 İşkembeden Sallama oturum kurtarma ve mobil düzeltmeleri
- Kurtarma anahtarları `server/iskembeden-room-recovery.js` üzerinden kriptografik rastgele üretilir ve sabit zamanlı karşılaştırılır. Başarılı dönüşte anahtar döndürülür.
- Puan, mevcut tahmin, tur geçmişi ve kazanan kimlikleri eski Socket.IO kimliğinden yenisine taşınır. İlk oda sahibinin dönüş hakkı geçici sahiplerin art arda bağlantı kaybetmesinden etkilenmez.
- Sunucu 90 saniye sonunda dönmeyen oyuncuyu temizler; aktif turun katılımcı sayısı geçersiz kalırsa maç iptal durumuna alınır.
- İşkembeden Sallama mobil form alanlarındaki yatay taşma giderildi, yerel oyunda yaş tahmininin tam sayı olma kuralı çevrim içi sunucuyla eşitlendi.


### v1.66 — İşkembeden Sallama soru çeşitliliği ve birim doğruluğu

- Ünlü yaşı soru havuzu 18 soruya, market fiyatları 11 soruya ve ikinci el otomobil kategorisi 10 soruya genişletildi. Her soru kaynak URL'si, veri tarihi ve hesaplama notu taşıyor. Market ve otomobil soruları tarihli snapshot/hesap sorularıdır; canlı fiyat verisi olarak sunulmaz.
- Türetilmiş fiyat sorularında hesap adımı ve yuvarlama yöntemi notta belirtilir. Bu, örnek fiyatlardan türetilen matematik sorularını canlı piyasa verisinden ayırır.
- Sunucu, en iyi tahmin farkını birim bazında (`TL`, `%`, `yaş`) saklar. Karışık birimlerde ham farklar birbiriyle kıyaslanmaz; aktif turun yeni istatistiği diğer oyunculardan gizlenir.
- Sonuç ekranı bütün cevaplar geldikten sonra doğru cevabı, oyuncu başına puanı ve birim etiketli en iyi farkı gösterir. Süre dolan oyuncu `Yanıt yok` olarak listelenir.
- Doğrulama: 108/108 sunucu testleri, 168/168 genel QA, 87/87 diğer oyunların statik QA'sı, 73/73 ana tarayıcı testi, 37/37 diğer oyun tarayıcı testi, 10/10 oturum kurtarma ve 9/9 istemci akışı Chromium testi.
- Gerçek Socket.IO E2E, bağımlılıklar npm'den bu ortamda indirilemediği için SKIPPED. Sahte Socket.IO taşıması canlı iki cihazlı ağ testinin yerini tutmaz.


## Çevrimiçi Worms: Tepe Savaşı (v1.68)
- İki oyuncu ayrı cihazlardan aynı sunucuya bağlanır. Oda sahibi kodu paylaşır; ikinci oyuncu katılınca oda sahibi maçı başlatır.
- Atışın yörüngesi, hasar, can, patlama krateri ve tur geçişi sunucu tarafından hesaplanır. İstemci sadece açı, güç ve silah türü gönderir; maç başladıktan sonra yeni arazi/can durumu istemci tarafından yazılamaz.
- Bağlantı koparsa maç duraklar ve oda 90 saniye korunur. Aynı sekme/oturum geri dönerse aynı oyuncu yuvası, can, arazi, aktif tur ve oda sahipliği geri yüklenir; başarılı kurtarmada token yenilenir. Yanlış, eski veya süresi geçen token reddedilir.
- Oda sahibi geri dönmezse 90 saniye sonunda oda mevcut katılımcı sayısına göre temiz lobiye alınır veya silinir. Maç bittikten sonra yalnızca bağlı oda sahibi yeni maç başlatabilir.
- Başlangıç tahtası doğrulanır: arazi, başlangıç konumları, can değerleri ve aktif oyuncu sunucu tarafından beklenen değerlerle karşılaştırılır. Aynı anda iki oyuncu elenirse sonuç beraberliktir.
- Otomatik doğrulama: Worms motoru/oda/kurtarma testleri ve sahte Socket.IO entegrasyon testi bulunur. Chromium’da bağlantı kaybı, kurtarma, token döndürme, beraberlik, yeniden maç ve 390 px görünüm kontrol edilir. Bunlar fiziksel cihazlar arasında canlı ağ testinin yerine geçmez.
