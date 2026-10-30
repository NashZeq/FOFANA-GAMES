# Casus Belli — Mekanik denetim envanteri (v0.74)

Bu belge, `data/cards.js` içindeki kart açıklamalarını `game.js` içindeki uygulama noktalarıyla eşleştiren bir kod inceleme envanteridir. Tek başına bütün olası kart kombinasyonlarının doğrulandığı anlamına gelmez. Metni belirsiz kartlarda kaynak kılavuz esas alınmalıdır.

## Ordu kartları

| Kart | Referans metninin özeti | Uygulama noktası | İnceleme notu |
|---|---|---|---|
| Köylü | Yanında başka Ordu varsa 4 puan | `effectivePoints` / `army-neighbor-bonus` | Dost Ordu kartı sayısı üzerinden hesaplanır. |
| Suikastçı | Prens yeteneğini iptal et; Kral Destek'i Çöp'e gönder | `applyArmyAction` | Prens yalnızca bu çatışmada pasif yeteneğini kaybeder; Kral Destek kartı Çöp'e gider. |
| Keşiş | Başka kart yoksa 6 puan | `effectivePoints` / `isolated-bonus` | Kontrol dost sahasındaki Ordu ve Destek kartlarını kapsar. |
| Rahibe | Ordu destesinin üst kartını oynat | `applyArmyAction` | Yeni kart aynı çatışmanın Ordu çözümlemesine eklenir; deste engeli kontrol edilir. |
| Prens | Prens hariç dost Ordu'ya +3 | `effectivePoints`, `applyArmyPassiveEffects` | Pasif bonus puan hesabında uygulanır; Suikastçı iptalini dikkate alır. |
| Cellat | Rakip sonraki tur Destek oynayamaz | `applyArmyAction`, `setStatus` | Süre durumu sonraki tur için işaretlenir. |
| Piyade | Özel güç yok | Varsayılan puan hesabı | 4 temel puan. |
| Ninja | Rakibin çift puanlı Ordu kartları 2 sayılır | `effectivePoints` | Kartın basılı temel puanının çift olması esas alınır. |
| Barbar | Pozitif/negatif etkilerden etkilenmez | `effectivePoints` | Puan değiştiricilerinden önce bağışıklık kontrolü yapılır. |
| Leydi | Özel güç yok | Varsayılan puan hesabı | 5 temel puan. |
| Kuzeyli | Rakibin Çok Yavaş Desteklerini desteye döndür | `applyArmyAction` | Deste engeli ve kartın yeniden kullanılma sıfırlaması uygulanır. |
| Büyücü | Bu tur oynanan dost Destekleri tur sonunda desteye döndür | `applyArmyPassiveEffects`, `finishResolution` | Aynı tur sonu iadesi; deste engeli kontrol edilir. |
| Samuray | Özel güç yok | Varsayılan puan hesabı | 7 temel puan. |
| Şövalye | Özel güç yok | Varsayılan puan hesabı | 8 temel puan. |
| Lord | Özel güç yok | Varsayılan puan hesabı | 9 temel puan. |

## Destek kartları

| Kart / yetenek | Uygulama noktası | İnceleme notu |
|---|---|---|
| Avcı 1 | `applySupport` | Rakibin oynadığı bir Destek kartı hedef seçilerek Çöp'e gönderilir. |
| Avcı 2 | `applySupport` | Rakibin oynadığı bir Ordu kartı hedef seçilerek sahipliği değiştirilip kendi Ordu destesine eklenir. |
| Kraliçe 1 | `applySupport`, sonraki tur `startRound`/çekim akışı | Sonraki tur rakibin elinden kart seçme durumu kurulur. |
| Kraliçe 2 | `applySupport`, `setStatus` | Rakibin Destek oynama yasağı 3 tur olarak ayarlanır. |
| Kral 1 | `applySupport`, `effectivePoints` | Rakip Ordu kartları 2 tur boyunca 1 puan sayılır; Barbar bağışıklığı korunur. |
| Kral 2 | `applySupport`, `startRound` | Sonraki tur +2 kart çekme hakkı eklenir. |
| Prenses 1 | `applySupport`, `drawCard` | Rakibin sonraki iki turdaki çekişlerinde kart adları görünür; görünürlük her çekişte yeniden belirlenir. |
| Prenses 2 | `applySupport` | Oynanmış rakip Prens ve Kral kartlarını etkisizleştirerek ele taşır. |
| Şaklaban 1 | `applySupport`, `startRound`, `finishResolution` | Sonraki tur oynanan Destek kartları tur sonunda kendi destesine döner. |
| Şaklaban 2 | `applySupport` | Rakip Destek ve kendi Ordu destesinin alt kartlarını yalnızca iki kart da varsa değiştirir. |
| Hırsız 1 | `applySupport`, `finishResolution` | Rakip destesinin seçilen uç kartını kendi destesine alır; Hırsız Çöp'e gönderilir. |
| Hırsız 2 | `applySupport` | Rakip destesinin seçilen ucundaki en fazla beş kartın sırası ters çevrilir. |
| Okçu 1 | `applySupport` | Yalnızca rakip Ordu destesinin üst üç kartını inceler; 3 veya altı puanlıları Çöp'e gönderir. |
| Okçu 2 | `applySupport`, `deckEffectsBlockedFor` | Rakibin deste hedefleyen yeteneklerini sonraki üç tur engeller. |
| Rahip 1 | `applySupport` | Rakibin seçilen Ordu veya Destek Çöp alanından en üst kart kendi destesine alınır. |
| Rahip 2 | `applySupport`, seçim penceresi | Ordu ve Destek destelerinin üstteki en fazla iki kartından birer seçim yapılır; seçilenler oynanır. |
| Simyacı 1 | `applySupport` | Kendi Destek Çöp'ünün en üst kartı sonraki tur için ele alınır. |
| Simyacı 2 | `applySupport` | Rakip Destek destesinin en üst kartı Yavaş/Çok Yavaş ise Çöp'e gönderilir. |
| Demirci 1 | `applySupport`, `resolveArmyActions` | Ordu Çöp'ünden kart sahaya döner; yeni gelen kartın yeteneği aynı çatışmada çözümlemeye alınır. |
| Demirci 2 | `applySupport`, `effectivePoints` | O tur sahadaki dost Ordu kartlarının puanı iki katına çıkarılır; işaret puanlama sonrası temizlenir. |

## Bilinen sınırlar

- Kaynak kart görsellerindeki bazı zamanlama ifadeleri tek başına bütün etkileşimleri tanımlamıyor. Belirsiz durumlarda oyun içi günlük ve test senaryoları davranışı görünür kılmalıdır.
- Bu envanter, her yeteneğin ana uygulama yolunu belirler. Her kartın diğer 24 kartla tüm permütasyonlarını doğrulamaz.
- Yerel, aynı cihazda oynanan prototip; çevrimiçi oda, sunucu otoritesi ve ağ senkronizasyonu bu denetimin kapsamı dışındadır.
