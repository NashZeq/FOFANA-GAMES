# Casus Belli - yerel ve çevrimiçi test sürümü (v0.97)

**Güncel durum (FOFANA GAMES v2.22 / çevrimiçi Casus Belli):** Yerel tarayıcı motoru ile çevrimiçi oda motoru ayrı uygulamalardır. Çevrimiçi sürüm oda açma/katılma, kişiye özel el, kapalı hamle, sunucuda çatışma çözümü, maç sonu sonucu ve çok adımlı hedef seçimini destekler. Önceki turda Avcı ve Rahip hedef seçimi, Kral etkisinin sonraki iki tura uygulanması, kart sahipliği/rengi ve kart türünün transfer sırasında korunması iyileştirildi. v2.22 turunda, hedef seçimi ekranındayken bağlantısı kopup dönen oyuncunun bekleyen özel seçimi yeni soket oturumuna taşınıyor. **Kart yeteneklerinin tüm kombinasyonlarında yerel-çevrimiçi tam eşitlik henüz garanti edilmiyor; canlı internet ve iki fiziksel cihaz testi yapılmadı.**

## Çalıştırma
`index.html` dosyasını açabilirsin. Kart verileri `data/cards.js` olarak da yüklenir; bu nedenle `file://` üzerinden açıldığında JSON fetch/CORS sorunu olmaz. VS Code Live Server önerilir.

## Yapı
- `index.html`: Oyun ekranı
- `style.css`: Oyun arayüzü
- `game.js`: Tur akışı ve prototip kural çözümleyicisi
- `data/cards.json`: Kart kataloğunun düzenlenebilir JSON kopyası
- `data/cards.js`: Tarayıcı tarafından yüklenen kart kataloğu
- `assets/cards/reference-sheet-*.png`: Kullanıcının gönderdiği referans görseller

## Uygulanan akış
- Her krallıkta 15 Ordu ve 10 Destek kartı.
- Her tur iki kart çekilir; çekim başına Ordu veya Destek destesi seçilebilir.
- Her krallık en az bir kart oynar; elde kalan kartlar ilgili destenin altına döner.
- Kartlar kapalı oynanır; sonra açılır.
- Destek kartı başına iki etkiden biri seçilir. Çözüm sırası hızlı/yavaş Destek, düşük puandan yüksek puana Ordu ve çok yavaş Destek olarak ayrıldı.
- Temel Ordu puanı karşılaştırması, Çöp alanı, deste sayacı ve bitiş kontrolü.

## Prototip sınırları
Yerel `game.js` ile çevrimiçi `server/casus-belli-room.js` farklı oyun motorlarıdır. Çevrimiçi modda oda/özel el/kapalı hamle ve çatışma çözümlemesi sunucuda yürür; bazı hedef seçimi ve sıra taşıyan yeteneklerde yerel motorla tam özellik eşitliği hâlâ kontrol edilmelidir. Gerçek internet üzerinden farklı ağlardaki cihazların testi bu geliştirme ortamında yapılmadı.
\n## Sürüm 0.6 notu\n- Destek ve Ordu çözümlemesi kılavuzda görünen hız sırasına yaklaştırıldı.\n- Suikastçı'nın oynanmış Prens yeteneğini iptal etmesi ve Kral Destek kartını Çöp'e göndermesi eklendi.\n- Bu motor hâlâ prototiptir; çok adımlı/gelecek turlara taşınan etkiler ayrıca test edilmelidir.\n
## Sürüm 0.7
- Kart çekme sırasında tarayıcı `prompt()` pencereleri yerine oyun tasarımına uygun bir seçim penceresi kullanılır.
- Her oyuncu her kart çekişinde Ordu veya Destek destesini ekrandan seçer.
- Kart çekme akışı iki oyuncu için sırayla ilerler.

## Sürüm 0.8
- Destek kartı etkileri artık tarayıcının `prompt()` pencereleriyle değil, oyunun kendi görsel seçim penceresiyle seçilir.
- Etki seçimi her Destek kartı için sırayla açılır.
- Kartlar ve seçim düğmeleri için klavye odağı görünürlüğü eklendi.


## v0.9 notları
- Ordu ve Destek kartlarının görsel çerçeveleri yeniden düzenlendi.
- Güç seviyesi, Destek hızı, kart türü ve krallık rengi daha belirgin hale getirildi.
- Savaş alanındaki oynanmış kartlar daha küçük bir ölçekte gösteriliyor.
- Bu sürümde kart çizimleri CSS/ikon tabanlıdır; yüklenen referans sayfalarından her karta ayrı ayrı kırpılmış gerçek illüstrasyonlar henüz entegre edilmedi.
- Tarayıcıda uçtan uca oyun testi yapılmadı. `prompt()` kullanan Hırsız ve Rahip etkileri sonraki iterasyonda uygulama içi seçim penceresine taşınmalıdır.


## v0.10 notları
- Hırsız ve Rahip efektlerindeki tarayıcı `prompt()` pencereleri kaldırıldı.
- Hırsız için hedef deste ve deste ucu; Rahip için rakibin Çöp alanı, oyun içindeki seçim penceresinden seçiliyor.
- Seçim adımları kart efektleri çözümlenmeden önce sırayla tamamlanıyor.
- Bu değişiklikler sözdizimi kontrolünden geçirildi; tarayıcıda iki oyunculu uçtan uca test henüz yapılmadı.


## v0.11 notları
- Kullanıcının yüklediği kart sayfalarından 25 ayrı kart illüstrasyonu kırpılarak WebP biçiminde `assets/cards/individual/` altına eklendi.
- Ordu ve Destek kartları artık kendi illüstrasyonlarını kart yüzünde gösteriyor; görsel dosya yolları `cards.json` ve `cards.js` kataloglarında tutuluyor.
- JavaScript sözdizimi ve görsel dosyalarının varlığı kontrol edildi. Tarayıcıda gerçek oynanış testi hâlâ gerekli.


## v0.12 — özgün görsel kimlik
- Referans kartlardan kırpılan görseller, oynanabilir kart yüzlerinden çıkarıldı.
- Yeni görsel yön: kronik/parşömen kart yüzleri, mürekkep tonlarında savaş alanı, bakır-altın detaylar ve özgün geometrik mühür motifleri.
- Kartların mevcut isimleri ve oyun mekaniği prototip amacıyla korunuyor; görsel dil artık kaynak kart resimlerini kullanmıyor.
- Bu, özgün bir arayüz ve CSS tabanlı sembol sistemi oluşturur. Kamuya açık yayın için ayrıca özgün oyun adı, logo, metinler ve tüm kuralların lisans/haklar açısından gözden geçirilmesi önerilir.


## v0.13 — özgün arayüz kimliği
- Ana başlık ve mikro metinler, Kronikler dünyası için daha özgün bir anlatım tonuna çekildi.
- Deste arkalarına özgün geometrik mühür işareti eklendi; önceki genel harf/ikon görünümü kaldırıldı.
- Parşömen kart yüzü, mürekkep tonları, bakır-altın detaylar ve hareket azaltma tercihi için CSS desteği tutarlı hale getirildi.
- JavaScript sözdizimi kontrolü başarılı. Bu ortamda Chromium ile başsız tarayıcı testi, ortamın GPU/sandbox kısıtları nedeniyle tamamlanamadı.


## v0.14 — Kural motoru düzeltmeleri
- Cellat artık rakibin sonraki tur Destek kartı çekmesini engeller.
- Kuzeyli, rakibin oynadığı Çok Yavaş Destek kartlarını çözülmeden desteye geri döndürür.
- Ninja'nın çift puanlı rakip Ordu kartlarını 2 sayma etkisi ayrı ve tutarlı biçimde uygulanır.
- Barbar'ın bağışıklığı puan hesaplamasında korunur.
- İki tarafın destesi aynı anda biterse sonuç artık döngü sırasına göre yanlışlıkla tek tarafa yazılmaz; beraberlik gösterilir.
- Bu sürümün kural motoru düzeltmeleri statik kontrollerden geçirildi; tam tarayıcı tur testi ayrıca yapılmalıdır.


## v0.15 — Tur zamanlaması ve etki güvenliği
- Cellat/Kraliçe/Kral/Prenses/Okçu gibi kartların sonraki turlara yayılan etkileri, kartın oynandığı tur biter bitmez azaltılmıyor; Kral’ın Ordu puanı etkisi de oynandığı turun puan hesabına sızmıyor.
- Bir kart başka bir etki tarafından masadan kaldırıldıysa, eski işlem listesinden dolayı yine de etkisini çalıştırmıyor.
- Hırsız, rakibin iki destesi de boşken boş bir hedef seçtirmiyor; hedef deste işlem sırasında boşalırsa hata vermek yerine kayda geçiriyor.
- Bu güncelleme, tur zamanlamasındaki bilinen hataları hedefleyen kod düzeltmesidir. Tam tarayıcıda çok turlu test hâlâ gereklidir.


## v0.16 — Çekim kısıtı ve QA notları
- Destek kartı çekme yasağı, oyuncu kart türü seçerken uygulanacak şekilde bağlandı; yasaklı turda yalnızca Ordu seçeneği gösterilir.
- Kart verisi ve temel kural motoru için statik QA raporu eklendi.
- Bu sürümde tam tarayıcı simülasyonu yapılmadı; rapor bunu açıkça belirtir.


## v0.17 — Otomatik statik test
- `test-rules.js` eklendi. Kart verisini JSON olarak okuyup kart kayıtlarının ad/tür/alan tutarlılığını ve kritik kural kontrollerinin kaynakta bulunmasını denetler.
- Çalıştırma: Casus Belli klasöründe `node test-rules.js`
- Bu bir statik smoke testidir; gerçek kart etkilerini simüle etmez ve tarayıcı testinin yerini tutmaz.


## v0.18 — Kural smoke testlerini genişletme
- Statik kart kontrollerine ek olarak Prens +3, Demirci ikiye katlama ve tur etkisi sayaçları için küçük referans-model testleri eklendi.
- Testleri çalıştırmak için Casus Belli klasöründe `node test-rules.js` komutu kullanılır.
- Referans-model testleri gerçek oyun motorunun bütün çözüm sırasını çalıştırmaz; tam entegrasyon testleri sonraki adımdır.


## v0.19 — Kaynak fonksiyonlarına bağlı testler
- `test-rules.js`, `effectivePoints`, `totalArmyPoints` ve `decrementStatus` fonksiyonlarını doğrudan `game.js` içinden çıkarıp kontrollü test verisiyle çalıştırır.
- Böylece Prens, Demirci, Kral tur zamanlaması ve Ninja puanlama kontrolleri yalnızca ayrı bir örnek modeli değil, gerçek oyun fonksiyonlarını sınar.
- Çalıştırma: `node test-rules.js`
- Tam DOM/tarayıcı entegrasyon testi henüz yoktur.


## v0.20 — Kart yeteneklerini görünür kılma
- Destek kartlarının iki seçenekli etkileri artık kart yüzünde numaralı olarak yazıyor.
- Ordu kartlarının yetenek metinleri de aynı alanda daha okunaklı gösteriliyor; yeteneği olmayan kartlarda bu açıkça belirtiliyor.
- Kart metinleri HTML açısından kaçışlanıyor ve erişilebilir kart açıklamasına yetenekler ekleniyor.


## v0.21 — Kart ayrıntı paneli
- Kart üzerinde sağ tıklama, ayrıntı penceresini açar.
- Shift + tıklama da ayrıntı penceresini açar; normal tıklama kart seçmeye devam eder.
- Pencere kartın türünü, gücünü/hızını ve bütün yetenek açıklamalarını gösterir.
- Panel masaüstünde sağ tık/Shift+tıklama ile erişilir. Dokunmatik cihazlarda bağlam menüsü olmadığından bu sürümde kart yüzündeki açıklamalar görünür kalır; sonraki iyileştirme doğrudan dokunmatik ayrıntı düğmesi eklemek olabilir.


## v0.22 — Dokunmatik kart inceleme
- Her kartın sağ üstüne ayrı bir ⓘ ayrıntı kontrolü eklendi.
- Kartın gövdesine dokunmak/seçmek normal işlevini korur; ⓘ kontrolü yalnızca ayrıntı penceresini açar.
- Ayrıntı kontrolü klavyeyle Enter/Boşluk kullanılarak da etkinleştirilebilir.


## v0.23 — Tur çözümleme entegrasyon testi
- `test-rules.js` içine `finishResolution()` fonksiyonunu doğrudan `game.js` kaynağından çalıştıran kontrollü tur testi eklendi.
- Test, Avcı/Ordu/Çok Yavaş Destek çözüm sırasını, Ordu kazananı için kartların geri dönüş/Çöp işlemlerini ve tur sayacının ilerlemesini kontrol eder.
- Test DOM'u taklit eden kontrollü fonksiyonlar kullanır; gerçek tarayıcıda görsel etkileşim testi değildir.


## v0.24 — Destek efektlerinin gerçek fonksiyon testleri
- Testler artık `applySupport()` fonksiyonunu doğrudan oyun kaynağından çalıştırıyor.
- Avcı'nın rakip Destek kartını Çöp'e göndermesi, Hırsız'ın rakip destesinin üstünden kart alması ve Kral'ın iki turluk Ordu puanı etkisi kontrol ediliyor.
- Kontrollü test ortamı gerçek tarayıcı/DOM entegrasyonu değildir; ancak bu testler ilgili efekt fonksiyonunun gerçek kodunu çalıştırır.


## v0.25 — Aktif etki rozetleri
- Her krallık paneline aktif etkiler alanı eklendi.
- Destek yasağı, Orduyu 1 puana indirme, açık çekim, deste etkisi engeli, bağışıklık, Destekleri geri döndür ve sonraki tur ek çekim durumları rozetlenir.
- Rozete dokunulduğunda etkinin açıklaması ve kalan tur sayısı gösterilir.
- Bazı etkilerin mekanik uygulaması hâlâ tamamlanmadıysa rozet bunu açıklama metninde açıkça belirtir.

## v0.26 — Destek yetenekleri için genişletilmiş kural testleri
- Okçu'nun iki yeteneği, Prenses'in iki yeteneği, Rahip'in iki yeteneği ve Simyacı'nın iki yeteneği gerçek `applySupport()` fonksiyonuyla sınanıyor.
- Tur başlangıcının çekim kuyruğu ve ek kart bonusu hazırlığı için entegrasyon testi eklendi.
- Otomatik testler: 28 başarılı, 0 başarısız.
- `node --check game.js` ve `node --check test-rules.js` başarılı.
- Bu sürüm daha geniş otomatik kural doğrulaması sunar; gerçek tarayıcıda uçtan uca test hâlâ yapılmış değildir.


## v0.27 — Aktif etkilerin mekaniklerini bağlama
- Prenses'in açık çekim etkisi artık çekilen kartın adını savaş günlüğünde gösterir.
- Okçu'nun deste etkisi engeli; Hırsız, Okçu'nun deste hedefleyen yeteneği, Rahip, Simyacı ve Demirci'nin deste hedefleyen yeteneklerini engeller.
- Deste engeli kurulduğu çözümleme turunda geriye dönük çalışmaz; sonraki turlarda uygulanır.
- Etki rozetlerindeki açıklamalar tamamlanan davranışla eşitlendi.
- Otomatik kural testleri: 32 başarılı, 0 başarısız. Gerçek tarayıcıda uçtan uca test hâlâ yapılmış değildir.

## v0.29 — Çok turlu maç simülasyonu testleri
- Altı turluk kontrollü maç senaryosu eklendi; her iki tarafın Ordu ve Destek kartlarının destede, Çöp'te veya oynanan alanda korunması kontrol ediliyor.
- Tur çözümlemesinden sonra oynanan alanların temizlenmesi, turun hazır durumuna dönmesi ve tur sayacının ilerlemesi test ediliyor.
- Otomatik testler: 39 başarılı, 0 başarısız.
- `node --check game.js` ve `node --check test-rules.js` başarılı.
- Bu simülasyon gerçek oyun fonksiyonlarını kontrollü Node.js ortamında çalıştırır; tam görsel tarayıcı testi değildir.

## v0.31 — Tarayıcıda tur akışı testi
- El alanının başlığı etkin oyuncuya göre güncellenir; Kırmızı oyuncunun eline geçildiğinde başlık da değişir.
- `test-browser.py` eklendi. Gerçek Chromium DOM'unda sayfa açılışı, başlangıç deste sayıları, dört kart çekimi, kart inceleme penceresi, kartı kapalı oynama, el devri ve bir tur çözümlemesi test edilir.
- Tarayıcı testini çalıştırmak için Casus Belli klasöründe `python test-browser.py` komutu kullanılır; Python Playwright ve Chromium gerektirir.
- Sonuçlar: `node test-rules.js` 42/42 başarılı; tarayıcı testi 12/12 başarılı; JavaScript sözdizimi kontrolleri başarılı.
- Bu uçtan uca senaryo bir normal turu kapsar; tüm özel kart etkilerinin kombinasyonlarını kapsadığı iddia edilmez.


## v0.32 notları
- Deste etkileri engelliyken Hırsız/Rahip hedef seçimleri atlanır; uygulanamayacak hamle için oyuncuya gereksiz seçim penceresi gösterilmez.
- Regresyon testleri `test-rules.js` içine eklendi.

## v0.33 — Kart sahipliği aktarımı
- Avcı, Hırsız, Rahip ve Şaklaban ile başka krallıktan alınan/değiştirilen kartların `color` alanı yeni sahibine güncellenir.
- Bu, kart sonraki turda oynandığında yeteneğinin yanlış krallık adına çözülmesi gibi bir hatayı önler.
- Dört yeni regresyon testi eklendi.
- Otomatik kural testleri: 48 başarılı, 0 başarısız.
- Tarayıcı testi: 12 başarılı, 0 başarısız.
- JavaScript sözdizimi kontrolleri başarılı.

## v0.34 — Kart koruma denetimi
- Oyun turu tamamlandığında 50 fiziksel kart kimliğinin destelerde, ellerde, Çöp alanlarında veya oynanan bölgede tam bir kez bulunduğu denetlenir.
- Eksik, mükerrer veya tanımsız kart kimliği varsa savaş günlüğüne uyarı yazılır.
- Test sonucu: kural testleri 51/51, tarayıcı testi 12/12 başarılı.

## v0.37 — Kart kayıt denetimini derinleştirme
- Tur sonu kart denetimi artık yalnızca eksik/mükerrer/tanımsız kimlikleri değil, kartın bulunduğu krallıkla `color` sahipliğinin uyuşmasını da kontrol eder.
- Ordu ve Destek destesi/Çöp bölgelerinde yanlış kart türü bulunması da tespit edilir. El ve oynanan bölge iki kart türünü de kabul ettiği için tür kısıtı uygulanmaz.
- Savaş günlüğü, kart sahipliği ve kart türü uyuşmazlıklarının sayılarını da bildirir.
- Yeni regresyon testleri: temiz 50 kartlık kayıt, sahiplik uyuşmazlığı ve yanlış kart türü.
- Kural testleri: 64/64 başarılı. Tarayıcı testleri: 12/12 başarılı.


## v0.38 — Açık oyun sonu ve bitiş kuralı
- Oyun, yalnızca bir krallığın hem Ordu hem Destek çekme destesi boşaldığında, turun çözümlemesi tamamlandıktan sonra sona erer. O krallık kaybeder; rakibi kazanır.
- İki krallığın da iki çekme destesi boşsa maç berabere biter. Çöp alanındaki kartlar bitiş kontrolünde destede sayılmaz.
- Oyun sonu artık açık bir sonuç penceresiyle gösterilir; yeni maç düğmesi pencereyi kapatıp bütün desteleri yeniden kurar.
- Kurallar penceresindeki bitiş açıklaması gerçek kod davranışıyla eşleştirildi.
- Testler: `node test-rules.js` 69/69; Chromium `python test-browser.py` 15/15; JavaScript sözdizimi kontrolleri başarılı.


## v0.39
- Tarayıcı testine, arayüz üzerinden oynanan dört ardışık tur eklendi.
- Her tur sonunda 50 kartın kaybolmadığı, çoğalmadığı ve kart kimliklerinin korunduğu gerçek oyun durumu üzerinden denetleniyor.
- Bu test, tam maçın tüm özel yetenek kombinasyonlarını değil, art arda tur akışını doğrular.


## v0.40 — Gelecek tura taşınan kartların korunması
- Tur başlangıcında eldeki kartlar artık silinmiyor; önceki çözümlemede Simyacı veya Prenses ile ele geçirilen kartlar yeni turda kullanılabiliyor. Normal oynanan kartlar zaten `playActiveCards()` sırasında elden çıkarılıyor.
- Prenses'in ikinci yeteneği, rakibin elini aramak yerine oynanan alandaki Prens ve Kral kartlarını etkisizleştirip kendi ele alıyor; sahiplik aktarımı da uygulanıyor.
- Chromium testine Prenses ve Simyacı için gerçek tarayıcı regresyon senaryoları eklendi.
- Doğrulama: kural testleri 69/69; tarayıcı testleri 30/30; JavaScript sözdizimi kontrolleri başarılı.


## v0.41 — Gelecek tur Destek iadesi zamanlaması
- Büyücü ve Şaklaban etkileri artık mevcut turdaki Destek kartlarını değil, bir sonraki tur oynanan Destek kartlarını turun sonunda desteye döndürür.
- `returnSupportsNextTurn` gecikmeli etki bayrağı eklendi ve tur başında aktif duruma geçirilir.
- Durum rozetleri, etkin Destek iadesi ile sonraki tur için sıraya alınan iade etkisini ayırt eder.
- Doğrulama: kural testleri 71/71; Chromium tarayıcı testleri 32/32; JavaScript sözdizimi kontrolleri başarılı.
- Ayrıntılar: `QA-raporu-v0.41.md`.


## v0.42 — Deterministik Simyacı regresyon testi
- Tarayıcı testinde Simyacı'nın rastgele `pop()` ile bazen kendisinin Çöp'e taşınmasına neden olan test-fixture hatası düzeltildi.
- Simyacı'nın Çöp'ten Destek kartı geri kazanıp yeni turda elinde tutması 10 ardışık tekrar ile doğrulanır.
- Doğrulama: kural testleri 71/71; Chromium tarayıcı testleri 33/33.
- Ayrıntılar: `QA-raporu-v0.42.md`.


## v0.43 — Kraliçe'nin gecikmeli kart alma yeteneği
- Kraliçe'nin birinci yeteneği artık mevcut çözümleme sırasında boş elden kart almaya çalışmaz; sonraki turun iki oyuncu da kart çektikten sonraki aşamasına sıraya alınır.
- Kraliçe'yi oynayan oyuncu, gizlilik el devrinden sonra rakibin elinden bir kart seçer. Kartın sahibi güncellenir ve kart koruma denetimi çalışır.
- Rakibin eli boşsa akış güvenli biçimde devam eder.
- Doğrulama: `node test-rules.js` 72/72; Chromium `python test-browser.py` 37/37; JavaScript sözdizimi kontrolleri başarılı.
- Ayrıntılar: `QA-raporu-v0.43.md`.

## v0.44 — Destek oynama yasağının tüm giriş yollarında uygulanması

- Destek yasağı aktifken, başka bir kart yeteneğiyle ele geçen Destek kartı da seçilemez.
- `playActiveCards()` içinde ek savunma kontrolü var; arayüz dışından/önceden seçilmiş bir kartla kural aşılamaz.
- Engellenen kart soluk ve kesik çerçeveli görünür; erişilebilirlik durumu `aria-disabled` ile bildirilir.
- Durum rozeti, Destek çekme ve oynama kısıtını açıklar.
- Testler: 76 kural testi ve 38 tarayıcı testi geçti.
- Ayrıntılar: `QA-raporu-v0.44.md`.

## v0.45 — Hırsız'ın zorunlu Çöp kuralı
- Hırsız'ın birinci yeteneği kart açıklamasına göre Hırsız'ı Çöp'e gönderir. Önceden, Büyücü veya Şaklaban'ın Destek iadesi aynı turda etkinse Hırsız da yanlışlıkla desteye dönebiliyordu.
- Çözümleme sonunda Hırsız'ın `usedEffect === 0` durumu Destek iadesinden önce kontrol edilir; diğer Destek kartları iade etkisinden yararlanmaya devam eder.
- Kural testi ve Chromium testi, Hırsız'ın Çöp'e gittiğini, diğer Destek kartının desteye döndüğünü ve 50 kartın korunduğunu doğrular.
- Doğrulama: kural testleri 77/77; Chromium tarayıcı testleri 40/40; JavaScript sözdizimi kontrolleri başarılı.
- Ayrıntılar: `QA-raporu-v0.45.md`.


## v0.47 — Destek yasağı kural kapsamı
- Kart kılavuzundaki Cellat/Kraliçe yasağı, Destek kartı çekmeyi değil oynanmasını kısıtlar. Destek çekim seçeneği yasak sürerken de kullanılabilir; eldeki Destek kartı oynanamaz.
- Cellat günlüğü mesajı ve durum rozeti bu kapsamla eşleştirildi.
- Doğrulama: kural testleri 80/80; Chromium tarayıcı testleri 42/42.
- Ayrıntılar: `QA-raporu-v0.47.md`.


## v0.48 — Dinamik Ordu yetenek çözümlemesi

- Rahibe'nin oynattığı Ordu kartları aynı turun Ordu yeteneği çözümlemesine katılır.
- Yeni sahaya gelen kartlar düşük puandan yükseğe işlenir ve her kart kimliği yalnızca bir kez çözülür.
- Rahibe'nin Cellat oynattığı duruma regresyon testi eklendi.
- Ayrıntılar: `QA-raporu-v0.48.md`.


## v0.49 — Okçu'nun hedefleme kuralı

Okçu'nun ilk yeteneği artık rakip Ordu destesinin yalnızca üstteki üç kartını inceler ve bunlardan 3 puan veya altındakileri Çöp'e gönderir. Destenin daha alt sıralarındaki düşük puanlı kartlar artık yanlışlıkla bulunup atılmaz. Kural ve Chromium tarayıcı testleri bu davranışı kapsar.

## v0.50 — Demirci puan çarpanı geçici hâle getirildi
- Demirci'nin ikinci yeteneği artık Ordu kartlarının `effectType` alanını değiştirmez; böylece Rahibe gibi kartların kalıcı yetenekleri silinmez.
- Puan ikiye katlama yalnızca mevcut çatışmada uygulanır ve çatışma çözümlemesi tamamlanınca temizlenir.
- Doğrulama: 83 kural testi ve 46 Chromium tarayıcı testi geçti.
- Ayrıntılar: `QA-raporu-v0.50.md`.

## v0.51 — Şaklaban'ın gerçek deste değişimi
- Şaklaban'ın ikinci yeteneği artık yalnızca iki destenin alt kartı da mevcutsa uygulanır.
- Destelerden biri boşsa tek taraflı kart transferi yapılmaz; savaş günlüğüne neden yazılır.
- Kural ve Chromium testleri normal değişim, boş Ordu destesi ve kart koruması senaryolarını kapsar.
- Doğrulama: 85 kural testi ve 48 Chromium tarayıcı testi geçti.
- Ayrıntılar: `QA-raporu-v0.51.md`.


## v0.52 — Kral'ın Ordu puan kısıtlaması
- Kral'ın sonraki iki tur boyunca rakibin Ordu kartlarını 1 puan sayan etkisi, Köylü/Keşiş bonusları, Prens bonusu, Demirci çarpanı ve Ninja değiştiricisi uygulandıktan sonra geçerli olur.
- Barbar'ın bağışıklığı korunur; Kral etkisi aynı çatışmada uygulanmışsa o çatışmanın puanını geriye dönük değiştirmez.
- Doğrulama: 86 kural testi ve 49 Chromium tarayıcı testi geçti. Ayrıntılar: `QA-raporu-v0.52.md`.

## v0.53 — Geçici Prens iptali ve Destek kartı temizliği
- Suikastçı, Prens'in yeteneğini yalnızca mevcut çatışma için kapatır; kalıcı `effectType` değerini değiştirmez.
- Çatışma sonunda geçici iptal işareti temizlenir, kart yeniden oynandığında Prens'in yeteneği geri gelir.
- Destek kartı Çöp'e veya desteye dönerken eski `usedEffect` ve hedef seçimleri temizlenir; geri kazanılan kart bir sonraki kullanımda yeniden yetenek seçtirir.
- Doğrulama: 90 kural testi ve 51 Chromium tarayıcı testi geçti. Ayrıntılar `QA-raporu-v0.53.md` dosyasındadır.

## v0.54 — Büyücü'nün aynı tur Destek iadesi

- Büyücü'nün açıklamasına uygun olarak, bu tur oynanan dost Destek kartları aynı turun çözümlemesi sonunda kendi destelerine döner.
- Şaklaban'ın etkisi farklıdır: bir sonraki tur oynanacak Destek kartları o turun sonunda desteye döner.
- Hızlı ve Çok Yavaş Destek kartlarıyla gerçek `finishResolution()` akışında regresyon testi eklendi.
- Doğrulama: 91 kural testi ve 54 Chromium tarayıcı testi geçti. Ayrıntılar `QA-raporu-v0.54.md` dosyasındadır.

## v0.56 — Okçu'nun deste engeli kapsamı
- Okçu'nun sonraki üç tur boyunca deste etkilerini engelleyen yeteneği Avcı'nın Ordu kartı ele geçirmesine, Şaklaban'ın deste değişimine, Kuzeyli'nin Destek iadesine ve Büyücü'nün Destek iadesine de uygulanır.
- Engellenen yetenekler kart hareketi yapmaz ve savaş günlüğüne açıklama yazar.
- Doğrulama: 97 kural testi ve 56 Chromium tarayıcı testi geçti. Ayrıntılar `QA-raporu-v0.56.md` dosyasındadır.

## v0.57 — Avcı'nın hedef seçimi
- Avcı artık rakibin oynadığı uygun Destek/Ordu kartını otomatik olarak ilk karttan seçmek yerine oyuncuya seçim penceresi gösterir.
- Birinci etki seçilen Destek kartını Çöp'e gönderir; ikinci etki seçilen Ordu kartını kendi Ordu destene aktarır.
- Hedef başka bir etki tarafından daha önce sahadan kaldırılmışsa kart ikinci kez taşınmaz. Deste engeli altındaki ikinci etki için hedef penceresi açılmaz.
- Destek kartı tekrar kullanıma dönerken `targetCardId` sıfırlanır.
- Doğrulama: 100 kural testi ve 60 Chromium tarayıcı testi geçti. Ayrıntılar `QA-raporu-v0.57.md` dosyasındadır.


## v0.58 — Uzun maç regresyon testi
- Tarayıcı testi, arayüz üzerinden arka arkaya yedi tur oynatır.
- Her turdan sonra 50 fiziksel kartın tamamının benzersizliği, sahipliği ve bölge kaydı doğrulanır.
- Senaryo her krallığın 14 Ordu kartını tüketerek çok turlu durum geçişlerini sınar; Destek hedef pencereleriyle testin rastlantısal olarak kesişmesini önlemek için bu senaryoda Ordu çekilir.
- Ayrıntılar `QA-raporu-v0.58.md` dosyasındadır.


## v0.59 — Mobil görünüm regresyonu
- Chromium testlerine 360 px genişlikte mobil sayfa taşması ve hedef seçimi penceresinin ekran içinde kalması kontrolleri eklendi.
- Bu sürümde yeni oynanış mekaniği eklenmedi; küçük ekranlarda temel kullanılabilirlik doğrulandı.
- Ayrıntılar `QA-raporu-v0.59.md` dosyasındadır.


## v0.60 — Maç sonu regresyonları
- Son çatışma çözümlemesinden sonra bir krallığın iki destesi de biterse rakibin kazandığı ve oyun sonu penceresinin açıldığı doğrulanır.
- İki krallığın da iki destesi boşaldığında sonuç beraberlik olarak doğrulanır.
- Her iki bitiş senaryosunda da kart kayıt denetimi 50 kartın tamamını, benzersiz ve doğru sahip/bölge eşleşmesiyle bulur.
- Maç bittiğinde çekme, oynama ve çözümleme kontrollerinin devre dışı kaldığı doğrulanır.
- Doğrulama: 100 kural testi ve 73 Chromium tarayıcı testi geçti; tarayıcı testi iki kez arka arkaya başarılı oldu.
- Ayrıntılar `QA-raporu-v0.60.md` dosyasındadır.

## v0.61 — Kart türü bütünlüğü denetimi
- Kart koruma denetimi artık fiziksel kartın beklenen türünü el ve oyun alanı dahil tüm bölgelerde kontrol eder.
- Önceki denetim, kart türü yalnızca el/oyun alanındayken yanlışlıkla değiştirilirse bunu kaçırabiliyordu.
- Kural ve tarayıcı testlerine el/saha tür bozulması regresyonları eklendi.
- Ayrıntılar `QA-raporu-v0.61.md` dosyasındadır.


## v0.62 — Kontrollü tam maç entegrasyon testi
- Tarayıcı testlerine gerçek `finishResolution()` ve `checkWinner()` akışını kullanan 15 turluk kontrollü tam maç eklendi.
- Senaryo fiziksel 50 kartı gerçek destelerden alıp gerçek oyun bölgeleri arasında ilerletir; yetenek adları test amacıyla nötrleştirildiği için rastlantısal hedef seçim pencerelerine bağlı değildir.
- Her tur sonunda kartların benzersizliği, sahibi ve fiziksel türü denetlenir.
- İki oyuncunun da 15 Ordu ve 10 Destek kartının Çöp'e ulaşması ve beraberlik penceresinin açılması doğrulanır.
- Bu, kart yeteneklerinin tüm kombinasyonlarını değil; tam maçın bölge geçişlerini ve beraberlik bitiş akışını sınayan kontrollü entegrasyon testidir.
- Ayrıntılar `QA-raporu-v0.62.md` dosyasındadır.


## v0.63 — Gerçek kartlarla yetenek kombinasyonu regresyonu

- Tarayıcı testine gerçek destelerden alınan Avcı, Suikastçı, Prens, Piyade ve Kral kartlarıyla kombinasyon senaryosu eklendi.
- Avcı'nın seçilen rakip Ordu kartını kendi destesine aktarması, Suikastçı'nın Prens'i etkisizleştirmesi ve Kral'ı Çöp'e göndermesi aynı çatışmada doğrulanır.
- Kombinasyon sonrasında 50 fiziksel kartın kayıt bütünlüğü tekrar denetlenir.
- Ayrıntılar `QA-raporu-v0.63.md` dosyasındadır.


## v0.64 — Zincirleme Ordu yeteneği regresyonu
- Gerçek Rahibe kartının Ordu destesinin üstündeki Cellat'ı aynı çatışmaya çıkarması test edilir.
- Yeni çıkan Cellat'ın çözümleme kuyruğuna girdiği ve yeteneğini aynı çatışmada uyguladığı doğrulanır.
- Kombinasyon sonrasında 50 fiziksel kartın bütünlüğü denetlenir.
- Ayrıntılar `QA-raporu-v0.64.md` dosyasındadır.


## v0.65 — Kart illüstrasyonlarını oyuna geri entegre etme
- Önceki sürümlerde kart yüzlerinden kaldırılmış olan referans karakter görselleri, kullanıcı tarafından sağlanan sekiz referans sayfasından ayrı ayrı kırpıldı.
- 25 kart türünün her biri için optimize edilmiş yerel WebP illüstrasyonu `assets/cards/individual/` içine eklendi; çalışma sırasında harici ağ bağlantısı gerekmez.
- Orijinal oyun içi kart çerçevesi ve yetenek metinleri korundu; görsel alanında karakter illüstrasyonu gösteriliyor, görsel dosyası eksikse sembol tabanlı yedek görünüm kullanılmaya devam ediyor.
- Kural testlerine 25 görsel dosyasının varlık/bütünlük kontrolü, tarayıcı testlerine gerçek görsel yüklenme kontrolü eklendi.
- Bu sürüm anlamlı bir görsel iyileştirme içerir; oyun kurallarının tamamını yeniden yazmaz.
- Ayrıntılar `QA-raporu-v0.65.md` dosyasındadır.


## v0.66 — Çatışma sonucu özeti
- Her çatışma sonrasında ayrı bir sonuç paneli gösterilir; oyuncular artık kısa savaş günlüğüne bakmak zorunda kalmadan tur puanını, kazananı veya beraberliği görebilir.
- Panel, her iki tarafın Ordu kartı kaybını da gösterir. Sayılar, gerçek puan karşılaştırması ve kart eleme akışından kaydedilir.
- Sonuç paneli ekran okuyucu için `aria-live="polite"` kullanır ve dar ekranlarda uyumlu biçimde yerleşir; hareket azaltma tercihi de dikkate alınır.
- Tarayıcı testlerinde gerçek çatışma çözümlemesiyle hem galibiyet hem beraberlik paneli doğrulanır; her iki durumda da 50 kartlık bütünlük denetimi geçer.
- Doğrulama: 106 kural testi ve 92 Chromium tarayıcı testi geçti; tarayıcı paketi iki kez arka arkaya başarılı oldu.
- Ayrıntılar `QA-raporu-v0.66.md` dosyasındadır.


## v0.67 — Okçu'nun deste engelini doğru kapsamda uygulama
- Okçu'nun “deste etkilerini engelle” yeteneği yalnızca çekme destelerini doğrudan değiştiren yetenekleri engeller.
- Simyacı'nın kendi Destek Çöp'ünden karta eline alması ve Demirci'nin Ordu Çöp'ünden kartı sahaya çıkarması artık yanlışlıkla engellenmez.
- Simyacı'nın rakibin Destek destesinin üst kartını Çöp'e gönderen ikinci yeteneği engellenmeye devam eder.
- Üç hedefli kural testi eklendi; mevcut tarayıcı regresyon paketi korundu.
- Doğrulama: 109 kural testi ve 92 Chromium tarayıcı testi geçti.
- Ayrıntılar `QA-raporu-v0.67.md` dosyasındadır.

## v0.68 — Açık çekim işaretinin sıfırlanması
- Prenses'in açık çekim etkisi aktifken çekilmiş bir kart, desteye dönüp etki bittikten sonra yeniden çekildiğinde artık eski açık çekim işaretini taşımaz.
- Kural ve tarayıcı testlerine bu yaşam döngüsü için regresyon senaryoları eklendi.
- Testler: 110 kural testi ve 93 tarayıcı testi başarılı; tarayıcı paketi ikinci kez de geçti.

## v0.69 — Rahip'in üstteki iki karttan seçim yapması
- Rahip'in ikinci yeteneği artık Ordu ve Destek destelerinin yalnızca ilk kartını otomatik oynamaz.
- Oyuncu her destenin üstteki en fazla iki kartını görür ve her desteden oynanacak kartı ayrı ayrı seçer.
- Seçilmeyen kart destede kalır ve deste sırası korunur; seçilen kart daha sonra normal çatışma çözümlemesine girer.
- Okçu'nun deste etkisi engeli aktifse Rahip için bu seçim pencereleri açılmaz.
- Kural ve gerçek Chromium arayüz testleri, ikinci kartın seçilmesini, ilk kartın destede kalmasını ve 50 kartın bütünlüğünü doğrular.
- Doğrulama: 111 kural testi ve 95 tarayıcı testi geçti; tarayıcı paketi iki kez çalıştırıldı.
- Ayrıntılar `QA-raporu-v0.69.md` dosyasındadır.

## v0.70 — Demirci'nin geri getirdiği Ordu kartını çözümleme
- Demirci'nin Çok Yavaş yeteneği Ordu Çöp'ünden bir kartı sahaya çıkardığında, kart artık çatışma puanlamasından önce kendi Ordu yeteneğini de çalıştırır.
- Aynı çatışmada Ordu yetenekleri için paylaşılan işlenmiş-kart kümesi kullanılır; önceden çözülmüş kartların yetenekleri ikinci kez çalıştırılmaz.
- Ordu pasif etkileri, geç çözülen Destek yeteneklerinin sahaya eklediği kartlar da hesaba katıldıktan sonra uygulanır.
- Gerçek tarayıcı testi Demirci → Rahibe → Cellat zincirini ve 50 kartın bütünlüğünü doğrular.
- Doğrulama: 113 kural testi ve 97 Chromium tarayıcı testi geçti; tarayıcı paketi iki kez başarılı oldu.
- Ayrıntılar `QA-raporu-v0.70.md` dosyasındadır.


## v0.71 — Çatışmada kaybedilen kartları gösterme
- Çatışma özeti, kaybedilen Ordu kartlarının isimlerini iki oyuncu için ayrı ayrı gösterir.
- Beraberlikte iki tarafın kayıpları da listelenir; kaybı olmayan taraf için “Yok” yazılır.
- Kart adları HTML için güvenli biçimde kaçırılır; mobilde kayıp listesi tek sütuna geçer.
- Ayrıntılar `QA-raporu-v0.71.md` dosyasındadır.


## v0.72 — Oyun içi kart rehberi
- Üst menüden 25 kart türüne, yetenek metinlerine ve güç/hız bilgilerine erişilebilir.
- Kart rehberinde isim/yetenek araması ve Tüm Kartlar, Ordu, Destek filtreleri bulunur.
- Rehberdeki bir kart mevcut ayrıntı penceresinde açılır; açıklamalar tek bir kart veri kaynağından üretilir.
- Mobil yerleşim ve DOM'a güvenli metin aktarımı eklendi.
- Doğrulama: 114 kural testi ve 104 Chromium tarayıcı testi geçti; tarayıcı paketi ikinci kez de başarılı oldu.
- Ayrıntılar `QA-raporu-v0.72.md` dosyasındadır.


## v0.73 — Tur geçmişi
- Son çatışma özeti korunurken önceki çatışmalar kapalı/açılır bir listede gösterilir.
- Her geçmiş kaydı tur numarası, iki tarafın puanı, kazanan/beraberlik ve Ordu kayıp sayısını içerir.
- Geçmiş en fazla 30 çatışma tutar; yeni maç başlatılınca temizlenir.
- Mobil ekranda satırlar dikey yerleşir ve geçmiş alanı sınırlı yükseklikte kaydırılabilir.
- Doğrulama sonuçları `QA-raporu-v0.73.md` dosyasındadır.


## Sürüm 0.74
- Çöp alanları tıklanabilir/klavyeyle açılabilir hâle geldi; kart adları, Ordu gücü/Destek hızı ve yazılı yetenekler incelenebilir.
- Çöp penceresine Ordu/Destek filtresi eklendi.
- Kart açıklamaları ve kod içindeki uygulama noktaları `MEKANIK-DENETIMI-v0.74.md` dosyasında eşleştirildi.
- Kural ve tarayıcı testleri mevcut özelliklerle birlikte çalıştırıldı.


## v0.75 — Ayrıntılı maç geçmişi
- Önceki çatışma kayıtları artık sadece puan ve kayıp sayısını değil, iki tarafın kaybettiği Ordu kartlarının adlarını da gösterir.
- Kart adları geçmiş listesine aktarılırken HTML için güvenli biçimde kaçırılır.
- Yeni maçta geçmiş temizleme davranışı korunur.
- Doğrulama: 116 kural testi ve 111 Chromium tarayıcı testi; tarayıcı testi iki ayrı çalıştırmada da başarılı.
- Ayrıntılar `QA-raporu-v0.75.md` dosyasındadır.


## v0.76 — Kart çekme animasyonu
- Yeni çekilen kartlara kısa giriş animasyonu eklendi.
- Hareket azaltma tercihi etkinse animasyonlar kapatılır.
- Kural motoru değiştirilmedi; mevcut regresyon testleri korundu.
- Ayrıntılar `QA-raporu-v0.76.md` dosyasındadır.


## v0.77 — Çatışma ve kart geçişleri
- Kapalı oynanan kartlar savaş alanına girerken kısa bir giriş animasyonu alır.
- Yeni Çöp kartları tek seferlik geçiş animasyonuyla vurgulanır.
- Savaş günlüğü yeni olaylarda kısa görsel geri bildirim verir.
- Sistem hareket azaltma tercihi tüm bu animasyonları kapatır.
- Doğrulama: 116 kural testi ve 116 Chromium tarayıcı testi geçti; tarayıcı paketi ikinci kez de başarılı oldu.
- Ayrıntılar `QA-raporu-v0.77.md` dosyasındadır.


## v0.78
- Kurallar penceresine adım adım çatışma çözüm sırası eklendi.
- Hırsız yeteneği, ters çevirdiği gerçek kart sayısını günlüğe yazıyor.
- Hedefli kural ve tarayıcı regresyon testleri eklendi.


## v0.79 — Okçu engeli ve Rahip yeteneği
- Okçu'nun deste etkisi engeli, Rahip'in Çöp'ten kart alma yeteneğini artık yanlışlıkla durdurmuyor.
- Rahip'in deste üzerinden kart oynatan ikinci etkisi engel kapsamında kalıyor.
- Kural ve gerçek tarayıcı regresyon testleri eklendi.
- Doğrulama: 120 kural testi ve 118 Chromium tarayıcı testi geçti; tarayıcı paketi ikinci kez de başarılı oldu.
- Ayrıntılar `QA-raporu-v0.79.md` dosyasındadır.


## v0.80
- Aktif etki açıklamalarındaki iki kural belirsizliği düzeltildi: Barbar'ın Ordu puanını 1'e indiren etkiden bağışık olması ve Okçu'nun deste engelinin Çöp alanından geri alma gibi deste dışı etkileri engellememesi artık açıkça belirtiliyor.
- Kart veri kılavuzundaki Destek kartlarının tek kullanımlık olması kuralı, Büyücü/Şaklaban gibi kartların açık iade etkilerini kapsayacak şekilde netleştirildi.
- Kural ve tarayıcı testlerine açıklama-kural tutarlılığı kontrolleri eklendi.

## v0.81 — Kart başına puan dökümü

- Çatışma çözümlemesi, puanlama tamamlanırken her Ordu kartının basılı temel puanını ve etkiler uygulandıktan sonraki gerçek puanını kaydeder.
- Sonuç paneline kapalı başlayan "Puan dökümünü göster" bölümü eklendi. Oyuncu her iki krallığın hangi kartlardan kaç puan aldığını inceleyebilir.
- Puan dökümü çatışma geçmişi kaydında da tutulur; geçici puan değiştiricileri temizlendikten sonra sonuç yeniden hesaplanmaz.
- Dökümde kart adları HTML'e güvenli biçimde kaçırılarak yazılır; mobil görünümde sütunlar tek sütuna düşer.
- Doğrulama: 124 kural testi, 123 Chromium tarayıcı testi (iki ardışık çalıştırma), JavaScript sözdizimi kontrolü ve ZIP bütünlüğü.


## v0.82 — Puan değişimlerini görünür kılma
- Çatışma dökümünde puanı değişen Ordu kartları artık temel puandan son puana geçişi gösterir (ör. `Temel 4 → 7`).
- Değişmiş puan satırları hafif altın vurguyla ayrılır; değişmeyen kartlarda gereksiz metin gösterilmez.
- Kural ve Chromium tarayıcı testleri bu gösterimi de doğrular.

## v0.83 — Puan etkilerinin kaynağı
- Çatışma puan dökümü artık yalnızca temel ve son puanı değil, sonucu oluşturan bilinen kart etkilerini de gösterir.
- Prens, Demirci, Ninja, Kral, Köylü ve Keşiş puan etkileri açıklama satırlarına eklenir; Barbar bağışıklığı da görünür.
- Açıklama metinleri kart adları gibi güvenli HTML kaçışından geçirilir.
- Kural ve Chromium testlerine birden fazla etkinin aynı kartta birleştiği senaryo eklendi.


## v0.84 — Puan dökümü netliği
- Temel puanıyla aynı sonuca ulaşsa bile etkileyici kart değiştiricileri bulunan Ordu kartları artık puan geçişini ve etki nedenlerini gösterir. Böylece bir etkinin başka bir etki tarafından dengelendiği durumlar gizlenmez.
- Puan dökümü özeti için daha açıklayıcı erişilebilir ad ve klavye odağı görünümü eklendi.
- Doğrulama: kural ve Chromium tarayıcı testleri bu sürümde yeniden çalıştırılır.

## v0.85 — Önceki çatışmaların puan dökümü
- Maç geçmişindeki her çatışma artık kendi açılır puan dökümünü taşır; geçmiş turda hangi Ordu kartlarının hangi puanla hesaba katıldığı ve kayıtlı puan etkileri incelenebilir.
- Geçmiş sonuçlar mevcut turun puan dökümünden bağımsızdır; geçmiş kayıtları yalnızca okunur.
- Mobil düzen tek sütuna iner; hareket azaltma tercihi desteklenir.
- Doğrulama: 126 kural testi ve 127 Chromium tarayıcı testi geçti. Tarayıcı paketi art arda iki kez temiz geçti.

## v0.86 — Doğrulama ve kapsam notu
- Puan dökümü, geçmiş çatışmalar ve kart kayıt bütünlüğü kontrolleri yeniden çalıştırıldı.
- Kılavuzdaki tüm olası kart kombinasyonlarının doğrulandığı iddia edilmemesi için kapsam notu eklendi.
- Doğrulama: 126 kural testi ve 127 Chromium tarayıcı testi geçti; tarayıcı testi ikinci kez de başarılı oldu.

## v0.87 — Geçmiş puan geçişleri
- Önceki çatışmaların puan dökümünde de kartın temel puanı ile son puanı arasındaki geçiş gösterilir.
- Geçmiş kayıtlarında puan etkileri, güncel çatışmayla aynı etiketleme biçimini kullanır; oyuncu turun sonucunu sonradan daha rahat denetleyebilir.
- Doğrulama: kural ve Chromium tarayıcı testleri çalıştırılır; sonuçlar aşağıdaki QA raporunda belirtilir.

### v0.88
- Sonuç ekranına maç raporunu `.txt` dosyası olarak indirme eklendi. Rapor; her turun sonucunu, puanları, Ordu kayıplarını, kart bazlı puan dökümünü ve kayıtlı etki açıklamalarını içerir.
- Dışa aktarma mevcut maç geçmişini kullanır; oyunun kural çözümlemesini değiştirmez.


## v0.89 — Maç raporu dışa aktarma testi
- Tarayıcı testi artık gerçek indirme olayını yakalar, indirilen `.txt` dosyasını okur ve tur, kart puanı, kayıp adlarının içerikte bulunduğunu doğrular.
- Bu test, yalnızca indirme düğmesinin varlığını kontrol etmek yerine dosyanın gerçekten üretildiğini sınar.


## v0.90 — Maç raporunda toplu istatistikler

Dışa aktarılan rapor artık toplam çatışma sayısına ek olarak Yeşil/Kırmızı galibiyet ve beraberlik sayılarını, toplam çatışma puanlarını ve toplam Ordu kayıplarını içerir. Bu özet, kayıtlı çatışma geçmişinden hesaplanır.

## v0.91 — CSV maç raporu
- Mevcut TXT raporuna ek olarak, maç geçmişini Excel ve elektronik tablo uygulamalarında açılabilecek UTF-8 CSV dosyası olarak dışa aktarma eklendi.
- Her Ordu kartı ayrı satırda; tur sonucu, puanlar, kayıplar, temel/son puan ve puan etkileri sütunlarda tutulur.
- Tarayıcı testleri gerçek CSV indirmesini ve içeriğini doğrulayacak şekilde genişletildi.


## v0.92 — arkadaş grubuyla test teslimi
- Ana sayfadaki Casus Belli açıklaması prototip yerine oynanabilir test sürümü olduğunu belirtiyor.
- Proje köküne `OYUNA-BASLAMA.md` eklendi: çalıştırma, aynı cihazda sıra devri, rapor indirme ve bilinen kapsam sınırları açıklandı.


## Sürüm 0.93
- 360 px mobil genişlikte üst menüdeki 4 px yatay taşma giderildi; marka ve kural düğmeleri küçük ekrana göre sıkıştırıldı.
- Proje açıklamasındaki eski v0.76 sürüm işareti güncellendi.
- Bu sürüm çevrimiçi oda veya sunucu otoritesi eklemez; oyun hâlâ aynı cihazda iki kişiyle oynanan prototiptir.


## v1.98 — Çevrimiçi kapalı hamle seçimi
- Kart seçilmeden kapalı hamle gönderme düğmesi etkinleşmez.
- Seçim durumu değiştikçe düğme durumu güncellenir; boş seçim ayrıca tıklama anında kontrol edilir.


## v1.99 — Destek yeteneği doğrulama sağlamlaştırması
- Geçersiz yetenek indeksi gönderildiğinde sunucunun oyuncunun elini veya tur aşamasını değiştirmediğini doğrulayan regresyon testi eklendi.
- Sunucu paket sürümü 1.99.0 olarak güncellendi.
- Bu sürüm, Rahip'in çevrimiçi üst-iki-kart seçimini tamamladığını iddia etmez; bu arayüz/etkileşim akışı sonraki geliştirme olarak kalır.


## v0.96 — Çatışma ve maç sonu güvenilirliği
- Yerel tarayıcı modülü ve çevrimiçi motor için sürüm/QA notları güncellendi.
- Çevrimiçi çatışmada Avcı ve hızlı/yavaş Desteklerin, Ordu yeteneklerinin ve Çok Yavaş Desteklerin çözüm sırası kural kılavuzuna göre düzenlendi.
- Suikastçı'nın Kral Destek yeteneğini zamanında iptal etmesi, Okçu'nun gelecek turlara ait engelinin mevcut kapalı hamlelere geriye dönük uygulanmaması ve Barbar bağışıklığı için regresyonlar eklendi.
- Bir krallığın hem Ordu hem Destek çekme destesi tükenince maç biter; iki taraf aynı anda tükenirse beraberlik gösterilir. Bitiş durumu çevrimiçi arayüzde kalıcı sonuç ekranı olarak sunulur.
- Boş rakip destesi seçilmiş Hırsız etkisi hata vermeden sonuçlanır.
- Kural testi: 127/127; çevrimiçi oda testi: 56/56. Tüm sunucu testleri: 291/291.


## v2.21 çevrimiçi motor düzeltmeleri
- Avcı için oynanmış rakip kartı, Rahip için rakibin Ordu/Destek Çöp alanı kullanıcı tarafından seçilir. Geçersiz veya artık uygun olmayan hedefler sunucu tarafından reddedilir.
- Kralın 1 puan etkisi mevcut çatışmanın puan hesabına sızmaz; sonraki iki tura uygulanır.
- Şaklaban değişiminde kartlar doğru türdeki destelerde kalır; sahiplik değişirken kart rengi güncellenir. Avcı, Hırsız, Rahip, Kraliçe ve Prenses gibi kart aktarım etkileri önceki sahibin hedef/çatışma bayraklarını temizler.
- Okçu engeli Avcı’nın etkisiz kalan ikinci seçeneği için gereksiz hedef penceresini atlar.
- Çevrimiçi testleri: sunucu oda/kart mantığı ve genel regresyon komutları bu paket hazırlanırken yeniden çalıştırıldı. Gerçek telefonlarla canlı internet kabul testi yapılmadı.


## v0.97 — Hedef seçimi sırasında oturum kurtarma
- Oyuncu Avcı/Rahip hedef seçimi sırasında bağlantısını kaybedip 90 saniye içinde dönerse bekleyen hedef sahibi ve tüm kuyruk istekleri yeni Socket.IO kimliğine taşınır.
- Yeniden bağlanan oyuncu yalnızca kendisine ait hedef kartlarını görür ve seçimi tamamlayabilir; sıradaki rakip seçimi de doğru oyuncuya geçer.
- Kural testi: 127/127; çevrimiçi oda testi: 61/61; Casus Belli tarayıcı testi: 131/131.
- Canlı, iki farklı internet ağındaki fiziksel telefonlarla kabul testi bu sürümde de yapılmadı.
