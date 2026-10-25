# Imposter çevrimiçi sunucu kurulumu (v1.82)

## Gereksinimler
- Node.js 18 veya üstü ve npm
- İnternet üzerinden oynatmak için Node.js uygulaması çalıştırabilen bir sunucu/hosting
- Geliştirme testi için aynı Wi-Fi ağına bağlı bilgisayarlar/telefonlar

## Bilgisayarda başlatma
1. ZIP dosyasını tamamen çıkar.
2. Terminali `server` klasöründe aç.
3. `npm install` komutunu çalıştır. Bu işlem Express ve Socket.IO bağımlılıklarını indirir.
4. `npm test` ile sunucu oyun kurallarının bağımsız testlerini çalıştır.
5. `npm start` komutuyla sunucuyu başlat. Terminalde `FOFANA GAMES server listening on 0.0.0.0:3000` görünmeli.
6. Bilgisayarda `http://localhost:3000` adresini aç. `http://localhost:3000/health` yanıtında `ok: true` görülmeli.

## Aynı Wi-Fi ağındaki telefonlarda deneme
1. Bilgisayarın yerel IP adresini öğren. Windows'ta `ipconfig` komutunu çalıştır ve etkin Wi-Fi adaptörünün IPv4 adresine bak.
2. Telefonlar ve bilgisayar aynı Wi-Fi ağında olsun.
3. Her telefonda `http://BILGISAYAR_IP:3000` adresini aç. Örnek: `http://192.168.1.25:3000`.
4. Bir oyuncu **Yeni oda oluştur** düğmesine bassın. Diğerleri altı karakterli kodla katılsın.
5. En az dört oyuncu katıldıktan sonra oda sahibi oyunu başlatsın. Her oyuncu kendi cihazındaki özel rolünü görüp hazır olduğunu işaretlesin.
6. Roller için tüm aktif oyuncular hazır olunca 120 saniyelik tartışma sayacı başlar. Oda sahibi isterse oylamayı daha erken açabilir; süre dolunca sunucu otomatik olarak 45 saniyelik oylamayı başlatır.
7. Oyuncular kendi telefonlarından oy verir. Son Imposter yakalanırsa 30 saniyelik kelime tahmini süresi başlar; süre aşılırsa masum oyuncular kazanır.
8. Windows Güvenlik Duvarı 3000/TCP bağlantısını engellerse yalnızca özel ağ için bu porta izin ver. Bilgisayarın güvenlik duvarını tamamen kapatma.

## İnternetten oynatmak
- Projeyi Node.js uygulaması çalıştırabilen bir barındırma hizmetine dağıt. `server` dizinindeki `package.json` bağımlılıkları kurmalı ve başlangıç komutu `npm start` olmalı.
- Hosting ortamının verdiği `PORT` değişkeni kullanılır; uygulama bu porta bağlanır. HTTPS/WSS desteği olan bir alan adı kullan.
- Statik dosyaları başka bir alan adında tutacaksan aynı-origin ayarını ve Socket.IO bağlantı adresini hosting mimarisine göre ayrıca yapılandırmak gerekir. Varsayılan yapı, web sitesini bu Node sunucusunun kendisinden servis eder.
- Uygulama süreç yeniden başladığında aktif odalar bellekte tutulduğu için silinir. Kalıcı oda/veri tabanı v1.28 kapsamına dahil değildir. Oda kodu gizli kimlik doğrulama değildir; hassas bilgi paylaşma.

## Oturum kurtarma davranışı (v1.82)
- Bir oda kurulduğunda/katılındığında sunucu rastgele oturum kurtarma anahtarı verir. Tarayıcı bunu aynı sekmenin `sessionStorage` alanında saklar; anahtar genel oda durumuna gönderilmez.
- Sayfa yenilenirse veya Socket.IO bağlantısı tekrar kurulursa istemci aynı oda kodu ve anahtarla `room:resume` gönderir. Sunucu oyuncu kimliğini yeni soket kimliğine taşır, eski rolü ve oy durumunu korur ve yeni anahtar döndürür.
- Bağlantı 90 saniye içinde geri gelmezse oyuncu odadan çıkarılır. Node sunucusu tamamen yeniden başlarsa odalar bellekte tutulduğu için kaybolur ve kurtarılamaz.
- **Odadan ayrıl** düğmesi anahtarı siler ve üyeliği hemen kaldırır.

## v1.82 oyun akışı ve kurtarma davranışı
- Tur akışı artık tamamlanmış bir zaman döngüsüne sahiptir: gizli roller → 120 saniyeye kadar tartışma → 45 saniyelik oylama → gerekiyorsa 30 saniyelik son kelime tahmini → sonuç/galip. Bağlı yaşayan oyuncu sayısı üçten azsa oylama zorla başlatılmaz; sunucu bağlantı kurtarmasını bekleyip tekrar kontrol eder.
- Oylama zaman aşımında yalnız gelen oylar değerlendirilir; kimse oy vermediyse kimse elenmez. Tur sonucu tüm odaya yayınlanır.
- Oturum kurtarma v1.60 ile eklendi ve v1.82 sürümünde sıkılaştırıldı: aynı tarayıcı sekmesindeki kayıtlı oturum, sayfa yenilenmesi veya geçici bağlantı kopmasından sonra 90 saniye içinde otomatik kurtarılır. Rol, aktiflik ve önceden verilmiş oy korunur; oturum anahtarı kurtarma sonrasında yenilenir. Bilinçli ayrılma üyeliği hemen kaldırır.
- Sunucu olay işleyicileri sahte Socket.IO taşımasıyla ve tarayıcı akışları Chromium’da taklit taşıma ile test edilir. Bu testler gerçek ağ davranışı değildir. Canlı doğrulama için bağımlılıkları kurup yukarıdaki yerel ağ adımlarını en az iki telefonda uygulayın; test sonuçlarının ayrıntıları `QA-raporu-v1.82.md` içindedir.

## v1.82 ek kontrolleri
- Elenmiş oyuncunun ayrılması oyunu yalnızca gerçek zafer koşullarında bitirir; dört kişilik başlangıçtan sonra üç yaşayan oyuncuyla devam eden durum korunur.
- Elenmiş oda sahibinin yerini aktif oyuncu alır; geçici sahip de oyundan çıkarsa yönetim yeniden aktarılır.
- Rol geldiğinde istemci hazırlık düğmesini görünür kılar. Yeni oylamada önceki turun sonuç paneli temizlenir.
- Paylaşım URL’sinde yalnızca oda kodu bulunur; kurtarma anahtarı URL’ye yazılmaz.
- 64 karakterlik hexadecimal kurtarma anahtarı doğrulanır ve canlı bir oyuncu oturumu başka soket tarafından devralınamaz.


## v1.82 odaklı doğrulamalar
- Sunucu testleri; otomatik tartışma sonu, üç bağlı oyuncudan az olduğunda gecikme, son kelime zaman aşımıyla masumların kazanması ve zamanında doğru tahminin sayaç iptali akışlarını kapsar.
- Chromium testi; tartışma ve son kelime sayaçlarını, son tahmin alanının görünmesini, eski tur sonucunun temizlenmesini ve oda davet linkini doğrular.
- Bu testler sahte Socket.IO taşımasıyla yürür. Gerçek iki telefon / internet kabul testi ve canlı dağıtım yapılmış değildir. Oda durumu sunucu belleğindedir; süreç yeniden başlatılırsa Imposter odaları kaybolur.
