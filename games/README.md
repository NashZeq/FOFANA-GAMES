
## v0.46 — Barbar bağışıklığının kapsamı
- Barbar'ın bağışıklığı yalnızca Barbar kartına uygulanır; artık oyuncu geneline yayılan yanıltıcı bir durum/rozet oluşturulmaz.
- Gerçek `effectivePoints()` fonksiyonu, Barbar'ın Kral ve Ninja etkilerine karşı bağışıklığını ve normal Ordu kartlarının bu etkilerden etkilenmeye devam ettiğini test eder.
- Chromium regresyon testi aynı kapsam ayrımını gerçek tarayıcı DOM'unda doğrular.
- Doğrulama: kural testleri 79/79; Chromium tarayıcı testleri 41/41.
- Ayrıntılar: `QA-raporu-v0.46.md`.

- `worms/`: Tepe Savaşı, aynı cihazda 2 oyunculu sıra tabanlı topçu prototipi.
- `go-kart/`: Three.js ile oluşturulan 3D Go-Kart sürüş prototipi. Pistte çarpışılabilir bariyerler ve toplanabilir altın kutular bulunur. Kutular roket veya muz verir; iki yerel bot rakibi roketle yavaşlatabilir, muz kabuğuna basınca kayabilir. Klavye ve mobil dokunmatik kontroller içerir; rakipler çevrim içi oyuncular değil, yerel botlardır.

- `sky-sprint/`: Tek HTML dosyasında Canvas tabanlı yandan kaydırmalı yarış. PC/mobil zıplama, çift zıplama, iki bot, testere/hız bandı, duraklatma ve yerel kişisel rekor bulunur. Gerçek internet çok oyuncululuğu iddia etmez.
