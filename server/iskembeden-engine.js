'use strict';

// Values in this question bank are snapshot facts, not live prices. Each item
// carries its own reference date so the answer remains auditable after release.
const QUESTIONS = {
  age: [
    { q: 'Kenan İmirzalıoğlu, 15 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 52, unit: 'yaş', note: 'Doğum tarihi: 18 Haziran 1974. Yaş, 15 Ekim 2026 tarihine göre hesaplandı.', date: '15 Ekim 2026', url: 'https://www.biyografya.com/tr/biographies/kenan-imirzalioglu-5e424ab5', source: 'Biyografya · Kenan İmirzalıoğlu', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Kenan_%C4%B0mirzal%C4%B1o%C4%9Flu.jpg?width=480', imagePage: 'https://commons.wikimedia.org/wiki/File:Kenan_%C4%B0mirzal%C4%B1o%C4%9Flu.jpg', imageCredit: 'Serkan Yakın', imageLicense: 'CC BY-SA 3.0 / CC BY 3.0' },
    { q: 'Acun Ilıcalı, 15 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 57, unit: 'yaş', note: 'Doğum tarihi: 29 Mayıs 1969. Yaş, 15 Ekim 2026 tarihine göre hesaplandı.', date: '15 Ekim 2026', url: 'https://www.biyografya.com/tr/biographies/acun-ilicali-7582a9d5', source: 'Biyografya · Acun Ilıcalı', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Acun_Il%C4%B1cal%C4%B1.jpg?width=480', imagePage: 'https://commons.wikimedia.org/wiki/File:Acun_Il%C4%B1cal%C4%B1.jpg', imageCredit: 'İnsanperver', imageLicense: 'CC BY-SA 3.0' },
    { q: 'Hande Erçel, 15 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 32, unit: 'yaş', note: 'Doğum tarihi: 24 Kasım 1993. Yaş, 15 Ekim 2026 tarihine göre hesaplandı.', date: '15 Ekim 2026', url: 'https://www.biyografya.com/tr/biographies/hande-ercel-533e6675', source: 'Biyografya · Hande Erçel', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Hande_Er%C3%A7el.jpg?width=480', imagePage: 'https://commons.wikimedia.org/wiki/File:Hande_Er%C3%A7el.jpg', imageCredit: 'Magazin Burada', imageLicense: 'CC BY 3.0' },
    { q: 'Beren Saat, 15 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 42, unit: 'yaş', note: 'Doğum tarihi: 26 Şubat 1984. Yaş, 15 Ekim 2026 tarihine göre hesaplandı.', date: '15 Ekim 2026', url: 'https://www.biyografya.com/tr/biographies/beren-saat-5e426635', source: 'Biyografya · Beren Saat' },
    { q: 'Demet Özdemir, 15 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 34, unit: 'yaş', note: 'Doğum tarihi: 26 Şubat 1992. Yaş, 15 Ekim 2026 tarihine göre hesaplandı.', date: '15 Ekim 2026', url: 'https://www.sinematurk.com/kisi/149097-demet-oezdemir', source: 'SinemaTürk · Demet Özdemir' },
    { q: 'Cem Yılmaz, 15 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 53, unit: 'yaş', note: 'Doğum tarihi: 23 Nisan 1973. Yaş, 15 Ekim 2026 tarihine göre hesaplandı.', date: '15 Ekim 2026', url: 'https://tr.wikipedia.org/wiki/Cem_Y%C4%B1lmaz', source: 'Cem Yılmaz biyografi sayfası', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Cem_Y%C4%B1lmaz.jpg?width=480', imagePage: 'https://commons.wikimedia.org/wiki/File:Cem_Y%C4%B1lmaz.jpg', imageCredit: 'Charismaniac', imageLicense: 'Public domain' },
    { q: 'Barış Arduç, 15 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 39, unit: 'yaş', note: 'Doğum tarihi: 9 Ekim 1987. Yaş, 15 Ekim 2026 tarihine göre hesaplandı.', date: '15 Ekim 2026', url: 'https://tr.wikipedia.org/wiki/Bar%C4%B1%C5%9F_Ardu%C3%A7', source: 'Barış Arduç biyografi sayfası' },
    { q: 'Murat Boz, 15 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 46, unit: 'yaş', note: 'Doğum tarihi: 7 Mart 1980. Yaş, 15 Ekim 2026 tarihine göre hesaplandı.', date: '15 Ekim 2026', url: 'https://tr.wikipedia.org/wiki/Murat_Boz', source: 'Murat Boz biyografi sayfası' },
    { q: 'Tarkan, 17 Ekim 2026 itibarıyla kaç yaşına girdi?', a: 54, unit: 'yaş', note: 'Doğum tarihi: 17 Ekim 1972. Yaşı, 17 Ekim 2026 tarihine göre hesaplandı.', date: '17 Ekim 2026', url: 'https://www.sinematurk.com/kisi/6206-tarkan', source: 'SinemaTürk · Tarkan', image: 'https://commons.wikimedia.org/wiki/Special:FilePath/Tarkan.jpg?width=480', imagePage: 'https://commons.wikimedia.org/wiki/File:Tarkan.jpg', imageCredit: 'Hakki Topcu', imageLicense: 'CC BY 2.0' },
    { q: 'Kıvanç Tatlıtuğ, 17 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 42, unit: 'yaş', note: 'Doğum tarihi: 27 Ekim 1983. 2026 yılındaki doğum günü henüz gelmediği için 42 yaşındadır.', date: '17 Ekim 2026', url: 'https://www.sinematurk.com/kisi/9557-kivanc-tatlitug', source: 'SinemaTürk · Kıvanç Tatlıtuğ' },
    { q: 'Çağatay Ulusoy, 17 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 36, unit: 'yaş', note: 'Doğum tarihi: 23 Eylül 1990. Yaşı, 17 Ekim 2026 tarihine göre hesaplandı.', date: '17 Ekim 2026', url: 'https://www.sinematurk.com/kisi/110673-cagatay-ulusoy', source: 'SinemaTürk · Çağatay Ulusoy' },
    { q: 'Fahriye Evcen, 17 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 40, unit: 'yaş', note: 'Doğum tarihi: 4 Haziran 1986. Yaşı, 17 Ekim 2026 tarihine göre hesaplandı.', date: '17 Ekim 2026', url: 'https://www.sinematurk.com/kisi/14095-fahriye-evcen/', source: 'SinemaTürk · Fahriye Evcen' },
    { q: 'Kerem Bürsin, 17 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 39, unit: 'yaş', note: 'Doğum tarihi: 4 Haziran 1987. Yaşı, 17 Ekim 2026 tarihine göre hesaplandı.', date: '17 Ekim 2026', url: 'https://www.sinematurk.com/kisi/147999-kerem-buersin', source: 'SinemaTürk · Kerem Bürsin' },
    { q: 'Hande Soral, 17 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 39, unit: 'yaş', note: 'Doğum tarihi: 2 Şubat 1987. Yaşı, 17 Ekim 2026 tarihine göre hesaplandı.', date: '17 Ekim 2026', url: 'https://www.sinematurk.com/kisi/33776-hande-soral', source: 'SinemaTürk · Hande Soral' },
    { q: 'Burak Özçivit, 17 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 41, unit: 'yaş', note: 'Doğum tarihi: 24 Aralık 1984. 2026 yılındaki doğum günü henüz gelmediği için 41 yaşındadır.', date: '17 Ekim 2026', url: 'https://www.sinematurk.com/kisi/26777-burak-ozcivit/', source: 'SinemaTürk · Burak Özçivit' },
    { q: 'Meryem Uzerli, 17 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 43, unit: 'yaş', note: 'Doğum tarihi: 12 Ağustos 1983. Yaşı, 17 Ekim 2026 tarihine göre hesaplandı.', date: '17 Ekim 2026', url: 'https://www.sinematurk.com/kisi/108450-meryem-uzerli', source: 'SinemaTürk · Meryem Uzerli' },
    { q: 'Engin Akyürek, 17 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 45, unit: 'yaş', note: 'Doğum tarihi: 12 Ekim 1981. Yaşı, 17 Ekim 2026 tarihine göre hesaplandı.', date: '17 Ekim 2026', url: 'https://www.sinematurk.com/kisi/10175-engin-akyurek/', source: 'SinemaTürk · Engin Akyürek' },
    { q: 'Hadise, 17 Ekim 2026 itibarıyla kaç yaşındaydı?', a: 40, unit: 'yaş', note: 'Doğum tarihi: 22 Ekim 1985. 2026 yılındaki doğum gününe beş gün kaldığı için 40 yaşındadır.', date: '17 Ekim 2026', url: 'https://www.tarihtebugun.org/tarihte-bugun/22/ekim/1985/hadise_kimdir_dogum_tarihi_gunu_yasi', source: 'Tarihte Bugün · Hadise doğum tarihi' }
  ],
  market: [
    { q: '16 Ekim 2026 kaydına göre CarrefourSA’da 1 litre Carrefour yağlı süt kaç TL idi?', a: 52.75, unit: 'TL', note: 'Bu, belirtilen tarihte eşleştirilen ürünün birim fiyatıdır.', date: '16 Ekim 2026', url: 'https://hepsihal.com/market-fiyatlari/sut', source: 'HepsiHal · süt fiyatları karşılaştırması' },
    { q: '16 Ekim 2026 kaydına göre KOOP Market’te 1 litre Tarım Kredi yağlı süt kaç TL idi?', a: 54.5, unit: 'TL', note: 'Bu, belirtilen tarihte eşleştirilen ürünün birim fiyatıdır.', date: '16 Ekim 2026', url: 'https://hepsihal.com/market-fiyatlari/sut', source: 'HepsiHal · süt fiyatları karşılaştırması' },
    { q: '16 Ekim 2026 kaydına göre Migros’ta 1 litre İçim Light süt kaç TL idi?', a: 64.9, unit: 'TL', note: 'Ürün çeşidi diğer market kayıtlarından farklıdır; fiyat karşılaştırması ürün adıyla birlikte okunmalıdır.', date: '16 Ekim 2026', url: 'https://hepsihal.com/market-fiyatlari/sut', source: 'HepsiHal · süt fiyatları karşılaştırması' },
    { q: '16 Ekim 2026 karşılaştırmasında altı market zincirinin süt fiyatlarının ortancası kaç TL/L idi?', a: 53.63, unit: 'TL', note: 'Kaynak sayfasında altı zincir için verilen ortanca litre fiyatı.', date: '16 Ekim 2026', url: 'https://hepsihal.com/market-fiyatlari/sut', source: 'HepsiHal · süt fiyatları karşılaştırması' },
    { q: '16 Ekim 2026 verisinde listelenen en pahalı ve en ucuz süt arasında kaç TL/L fark vardı?', a: 32.4, unit: 'TL', note: '64,90 TL/L eksi 32,50 TL/L. Bu iki farklı ürün kaydı arasındaki farktır.', date: '16 Ekim 2026', url: 'https://hepsihal.com/market-fiyatlari/sut', source: 'HepsiHal · süt fiyatları karşılaştırması' },
    { q: '16 Ekim 2026 süt karşılaştırmasında en yüksek fiyat, en düşük fiyatın yaklaşık yüzde kaç üzerindeydi?', a: 100, unit: '%', note: 'Sayfa bu farkı yaklaşık yüzde 100 olarak bildiriyor; ürün çeşitleri marketler arasında farklılık gösterir.', date: '16 Ekim 2026', url: 'https://hepsihal.com/market-fiyatlari/sut', source: 'HepsiHal · süt fiyatları karşılaştırması' },
    { q: '1 litre Carrefour yağlı süt 52,75 TL ve Tarım Kredi yağlı süt 54,50 TL ise aradaki fiyat farkı kaç TL idi?', a: 1.75, unit: 'TL', note: 'Hesaplanan fark: 54,50 − 52,75. Kaynak tarihi 16 Ekim 2026; ürün adları aynı çeşidi garanti etmez.', date: '16 Ekim 2026', url: 'https://hepsihal.com/market-fiyatlari/sut', source: 'HepsiHal · süt fiyatları karşılaştırması' },
    { q: '1 litre Migros İçim Light süt 64,90 TL ve Carrefour yağlı süt 52,75 TL ise aradaki fark kaç TL idi?', a: 12.15, unit: 'TL', note: 'Hesaplanan fark: 64,90 − 52,75. İki ürünün süt çeşidi farklıdır.', date: '16 Ekim 2026', url: 'https://hepsihal.com/market-fiyatlari/sut', source: 'HepsiHal · süt fiyatları karşılaştırması' },
    { q: '52,75 TL, 54,50 TL ve 64,90 TL fiyatlarının aritmetik ortalaması yaklaşık kaç TL idi?', a: 57.38, unit: 'TL', note: 'Üç kaynak fiyatının aritmetik ortalaması 57,3833… TL; iki ondalığa yuvarlandı.', date: '16 Ekim 2026', url: 'https://hepsihal.com/market-fiyatlari/sut', source: 'HepsiHal · kaynak değerlerinden hesaplandı' },
    { q: '64,90 TL olan süt, 54,50 TL olan sütten yaklaşık yüzde kaç daha pahalıydı?', a: 19.08, unit: '%', note: '(64,90 − 54,50) / 54,50 × 100 = yaklaşık %19,08. Ürün çeşitleri farklıdır.', date: '16 Ekim 2026', url: 'https://hepsihal.com/market-fiyatlari/sut', source: 'HepsiHal · kaynak değerlerinden hesaplandı' },
    { q: 'Litre başına 52,75 TL sabit birim fiyatla 2,5 litre süt kaç TL tutardı?', a: 131.88, unit: 'TL', note: 'Bu bir hesaplama sorusudur: 52,75 × 2,5 = 131,875 TL, iki ondalığa yuvarlandı; gerçek paket satış fiyatı değildir.', date: '16 Ekim 2026 fiyatını kullanarak yapılan hesaplama', url: 'https://hepsihal.com/market-fiyatlari/sut', source: 'HepsiHal · kaynak değerinden hesaplandı' },
  ],
  car: [
    { q: 'arabam.com verilerine göre Ağustos 2026’da ortalama ikinci el otomobil ilan fiyatı kaç TL idi?', a: 913817, unit: 'TL', note: 'İlan fiyatlarının ortalamasıdır; gerçekleşen satış fiyatı değildir.', date: '12 Ekim 2026’da yayımlanan Eylül 2026 verisi', url: 'https://www.capital.com.tr/sektorler/otomotiv/arabamcom-eylul-ayi-ikinci-el-ilan-verilerini-paylasti', source: 'Capital · arabam.com Eylül 2026 endeksi' },
    { q: 'Ağustos’tan Eylül 2026’ya ortalama ikinci el otomobil ilan fiyatı kaç TL arttı?', a: 7490, unit: 'TL', note: '921.307 TL eksi 913.817 TL. Tutar, ilan fiyatı ortalamasındaki nominal değişimdir.', date: '12 Ekim 2026’da yayımlanan Eylül 2026 verisi', url: 'https://www.capital.com.tr/sektorler/otomotiv/arabamcom-eylul-ayi-ikinci-el-ilan-verilerini-paylasti', source: 'Capital · arabam.com Eylül 2026 endeksi' },
    { q: 'Eylül 2026’da 1 milyon TL ve altındaki ikinci el araç ilanları toplam ilanların yaklaşık yüzde kaçını oluşturdu?', a: 55, unit: '%', note: 'Kaynak rapordaki oran, ilanların payını ifade eder.', date: '12 Ekim 2026’da yayımlanan Eylül 2026 verisi', url: 'https://www.capital.com.tr/sektorler/otomotiv/arabamcom-eylul-ayi-ikinci-el-ilan-verilerini-paylasti', source: 'Capital · arabam.com Eylül 2026 endeksi' },
    { q: 'Eylül 2026’da 600 bin TL’ye kadar olan araç ilanlarının payı yaklaşık yüzde kaçtı?', a: 29, unit: '%', note: 'Bu oran, arabam.com üzerindeki ilanların fiyat aralığına göre dağılımıdır.', date: '12 Ekim 2026’da yayımlanan Eylül 2026 verisi', url: 'https://www.capital.com.tr/sektorler/otomotiv/arabamcom-eylul-ayi-ikinci-el-ilan-verilerini-paylasti', source: 'Capital · arabam.com Eylül 2026 endeksi' },
    { q: 'Eylül 2026’da 600.001 TL ile 1 milyon TL arasındaki araç ilanlarının payı yaklaşık yüzde kaçtı?', a: 26, unit: '%', note: 'Bu oran, arabam.com üzerindeki ilanların fiyat aralığına göre dağılımıdır.', date: '12 Ekim 2026’da yayımlanan Eylül 2026 verisi', url: 'https://www.capital.com.tr/sektorler/otomotiv/arabamcom-eylul-ayi-ikinci-el-ilan-verilerini-paylasti', source: 'Capital · arabam.com Eylül 2026 endeksi' },
    { q: 'Eylül 2026’da ortalama ilan fiyatı 921.307 TL, Ağustos ortalaması 913.817 TL ise artış, Ağustos ortalamasının yaklaşık yüzde kaçına karşılık geliyordu?', a: 0.82, unit: '%', note: 'Yüzde değişim yaklaşık olarak (921.307 − 913.817) / 913.817 × 100 ile hesaplanır.', date: '12 Ekim 2026’da yayımlanan Eylül 2026 verisi', url: 'https://www.capital.com.tr/sektorler/otomotiv/arabamcom-eylul-ayi-ikinci-el-ilan-verilerini-paylasti', source: 'Capital · arabam.com Eylül 2026 endeksi' },
    { q: 'Eylül 2026’daki 921.307 TL ortalama ikinci el ilan fiyatı, 1 milyon TL sınırının kaç TL altındaydı?', a: 78693, unit: 'TL', note: 'Hesaplama: 1.000.000 − 921.307 = 78.693 TL. Ortalama ilan fiyatıdır; gerçekleşen satış fiyatı değildir.', date: '12 Ekim 2026’da yayımlanan Eylül 2026 verisi', url: 'https://www.capital.com.tr/sektorler/otomotiv/arabamcom-eylul-ayi-ikinci-el-ilan-verilerini-paylasti', source: 'Capital · kaynak değerinden hesaplandı' },
    { q: 'İlanların yüzde 55’i 1 milyon TL ve altındaysa, 1 milyon TL üzerindeki ilanların payı yüzde kaçtır?', a: 45, unit: '%', note: 'Tamamlayıcı oran: 100 − 55 = %45. Yuvarlanmış kaynak oranına dayanır.', date: '12 Ekim 2026’da yayımlanan Eylül 2026 verisi', url: 'https://www.capital.com.tr/sektorler/otomotiv/arabamcom-eylul-ayi-ikinci-el-ilan-verilerini-paylasti', source: 'Capital · kaynak oranından hesaplandı' },
    { q: 'Ağustos 2026 ortalaması 913.817 TL ve Eylül 2026 ortalaması 921.307 TL ise iki ayın ortalaması kaç TL idi?', a: 917562, unit: 'TL', note: '(913.817 + 921.307) / 2 = 917.562 TL. Bu hesaplanmış iki aylık ortalamadır.', date: '12 Ekim 2026’da yayımlanan Eylül 2026 verisi', url: 'https://www.capital.com.tr/sektorler/otomotiv/arabamcom-eylul-ayi-ikinci-el-ilan-verilerini-paylasti', source: 'Capital · kaynak değerlerinden hesaplandı' },
    { q: 'Eylül 2026’daki 921.307 TL ortalama ilan fiyatına sahip iki araç için toplam ilan fiyatı kaç TL ederdi?', a: 1842614, unit: 'TL', note: 'Hesaplama: 921.307 × 2 = 1.842.614 TL. Ortalama üzerinden yapılan varsayımsal hesaplamadır.', date: '12 Ekim 2026’da yayımlanan Eylül 2026 verisi', url: 'https://www.capital.com.tr/sektorler/otomotiv/arabamcom-eylul-ayi-ikinci-el-ilan-verilerini-paylasti', source: 'Capital · kaynak değerinden hesaplandı' }
  ]
};
const CATEGORY_NAMES = { age: 'Ünlülerin yaşı', market: 'Türkiye market fiyatları', car: 'İkinci el otomobil fiyatları' };
const ROUND_OPTIONS = [3, 5];
const QUESTION_SECONDS = 45;

function createGame(players, category = 'age', maxRounds = 5) {
  if (!Array.isArray(players) || players.length < 2) throw new Error('Çevrimiçi oyun için en az 2 oyuncu gerekli.');
  if (!QUESTIONS[category]) throw new Error('Geçersiz kategori.');
  const ids = players.map(p => p && String(p.id || ''));
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('Oyuncu kimlikleri geçersiz veya tekrarlı.');
  const rounds = ROUND_OPTIONS.includes(Number(maxRounds)) ? Number(maxRounds) : 5;
  if (QUESTIONS[category].length < rounds) throw new Error('Bu kategoride seçilen maç uzunluğu için yeterli soru yok.');
  const scores = {};
  for (const p of players) scores[p.id] = { score: 0, rounds: 0, bestDiff: null, bestDiffByUnit: {} };
  const game = { category, phase: 'playing', round: 0, maxRounds: rounds, question: null, scores, submissions: {}, history: [], used: [], startedAt: Date.now(), winnerIds: [], finishReason: null, lastFinalizedRound: 0, remainingSeconds: QUESTION_SECONDS };
  nextQuestion(game);
  return game;
}

function rankedIds(game) {
  // The question bank mixes units (ages, TL and percentages); raw absolute
  // differences cannot fairly break a tie across different units. Total points
  // are the only cross-question comparable ranking measure.
  return Object.keys(game.scores).sort((a, b) => game.scores[b].score - game.scores[a].score);
}

function finalizeRoundIfReady(game) {
  if (!game || !game.question || game.phase !== 'playing') return false;
  const ids = Object.keys(game.scores);
  if (!ids.length || !ids.every(id => Object.hasOwn(game.submissions, id))) return false;
  if (game.lastFinalizedRound !== game.round) {
    game.history.push({
      round: game.round,
      question: game.question.q,
      answer: game.question.a,
      unit: game.question.unit,
      results: Object.fromEntries(Object.entries(game.submissions).map(([id, x]) => [id, { guess: x.guess, diff: x.diff, earned: x.earned }]))
    });
    game.lastFinalizedRound = game.round;
  }
  if (game.round >= game.maxRounds) {
    game.phase = 'finished';
    const ranked = rankedIds(game);
    if (ranked.length) {
      const bestScore = game.scores[ranked[0]].score;
      game.winnerIds = ranked.filter(id => game.scores[id].score === bestScore);
    }
  }
  return true;
}

function nextQuestion(game) {
  if (!game || game.phase !== 'playing') throw new Error('Oyun yeni soruya geçemiyor.');
  if (game.round > 0 && !Object.keys(game.scores).every(id => Object.hasOwn(game.submissions, id))) throw new Error('Herkes mevcut soru için tahminini göndermeden devam edemezsiniz.');
  if (game.round > 0 && game.round >= game.maxRounds) throw new Error('Maç tamamlandı. Yeni maç için lobiye dönün.');
  const pool = QUESTIONS[game.category].map((q, i) => ({ q, i })).filter(x => !game.used.includes(x.i));
  if (!pool.length) throw new Error('Bu maç için kullanılabilir soru kalmadı.');
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  game.question = chosen.q;
  game.used.push(chosen.i);
  game.round += 1;
  game.submissions = {};
  game.remainingSeconds = QUESTION_SECONDS;
  return game;
}

function scoreGuess(game, playerId, rawGuess) {
  if (!game || game.phase !== 'playing' || !game.question) throw new Error('Aktif soru yok.');
  if (!Object.hasOwn(game.scores, playerId)) throw new Error('Oyuncu bu oyunda değil.');
  if (Object.hasOwn(game.submissions, playerId)) throw new Error('Bu soruya zaten tahmin gönderdin.');
  if (rawGuess === null || rawGuess === undefined || String(rawGuess).trim() === '') throw new Error('Sıfır veya daha büyük geçerli bir sayı gir.');
  const guess = Number(rawGuess);
  if (!Number.isFinite(guess) || guess < 0 || guess > 1e12) throw new Error('Sıfır veya daha büyük geçerli bir sayı gir.');
  if (game.question.unit === 'yaş' && !Number.isInteger(guess)) throw new Error('Yaş tahmini tam sayı olmalı.');
  const diff = Math.abs(guess - game.question.a);
  const earned = game.question.unit === 'yaş'
    ? Math.max(0, 100 - Math.round(diff * 10))
    : Math.max(0, Math.round(1000 - (diff / Math.abs(game.question.a || 1) * 100) * 10));
  const stat = game.scores[playerId];
  stat.bestDiffByUnit ||= {};
  const previousBestDiff = Object.hasOwn(stat.bestDiffByUnit, game.question.unit) ? stat.bestDiffByUnit[game.question.unit] : null;
  game.submissions[playerId] = { guess, diff, earned, unit: game.question.unit, previousBestDiff };
  stat.score += earned;
  stat.rounds += 1;
  stat.bestDiffByUnit[game.question.unit] = previousBestDiff === null ? diff : Math.min(previousBestDiff, diff);
  // Compatibility field is now scoped to the most recently answered unit, never a cross-unit minimum.
  stat.bestDiff = stat.bestDiffByUnit[game.question.unit];
  const allSubmitted = finalizeRoundIfReady(game);
  return { allSubmitted, submitted: Object.keys(game.submissions).length, total: Object.keys(game.scores).length, matchFinished: game.phase === 'finished' };
}

function expireRound(game) {
  if (!game || game.phase !== 'playing' || !game.question) return false;
  for (const id of Object.keys(game.scores)) {
    if (Object.hasOwn(game.submissions, id)) continue;
    const stat = game.scores[id];
    game.submissions[id] = { guess: null, diff: null, earned: 0, unit: game.question.unit, previousBestDiff: (stat.bestDiffByUnit || {})[game.question.unit] ?? null, forfeited: true };
    stat.rounds += 1;
  }
  return finalizeRoundIfReady(game);
}

function publicGame(game, players, viewerId) {
  if (!game) return null;
  const ids = Object.keys(game.scores);
  const allSubmitted = ids.length >= 2 && ids.every(id => Object.hasOwn(game.submissions, id));
  const publicQuestion = game.question ? { q: game.question.q, unit: game.question.unit, note: game.question.note, date: game.question.date, url: game.question.url, source: game.question.source, image: game.question.image, imagePage: game.question.imagePage, imageCredit: game.question.imageCredit, imageLicense: game.question.imageLicense } : null;
  const submissions = Object.fromEntries(Object.entries(game.submissions).map(([id, sub]) => [id, { submitted: true, ...(sub.forfeited ? { forfeited: true } : {}) }]));
  const publicPlayers = players.filter(p => Object.hasOwn(game.scores, p.id)).map(p => {
    const stat = game.scores[p.id];
    const pending = !allSubmitted ? game.submissions[p.id] : null;
    const bestDiffByUnit = { ...(stat?.bestDiffByUnit || {}) };
    if (pending && !allSubmitted) {
      const pendingUnit = pending.unit || game.question?.unit;
      if (pending.previousBestDiff === null || pending.previousBestDiff === undefined) delete bestDiffByUnit[pendingUnit];
      else bestDiffByUnit[pendingUnit] = pending.previousBestDiff;
    }
    return {
      id: p.id,
      name: p.name,
      score: (stat?.score || 0) - (pending?.earned || 0),
      rounds: (stat?.rounds || 0) - (pending ? 1 : 0),
      bestDiff: pending ? (pending.previousBestDiff ?? null) : (stat?.bestDiff ?? null),
      bestDiffByUnit,
      submitted: !!game.submissions[p.id]
    };
  });
  const standings = [...publicPlayers].sort((a, b) => b.score - a.score);
  const ownRaw = game.submissions[viewerId];
  const ownSubmission = ownRaw ? { submitted: true, ...(ownRaw.forfeited ? { forfeited: true } : {}), ...(allSubmitted ? { guess: ownRaw.guess, diff: ownRaw.diff, earned: ownRaw.earned } : {}) } : null;
  return {
    category: game.category,
    categoryName: CATEGORY_NAMES[game.category],
    phase: game.phase,
    round: game.round,
    maxRounds: game.maxRounds,
    question: publicQuestion,
    players: publicPlayers,
    submitted: Object.keys(game.submissions).length,
    total: ids.length,
    allSubmitted,
    submissions,
    ownSubmission,
    results: allSubmitted ? Object.entries(game.submissions).map(([id, s]) => ({ id, name: players.find(p => p.id === id)?.name || 'Oyuncu', guess: s.guess, diff: s.diff, earned: s.earned, forfeited: !!s.forfeited })).sort((a, b) => b.earned - a.earned || (a.diff ?? Infinity) - (b.diff ?? Infinity)) : [],
    answer: allSubmitted ? game.question.a : null,
    unit: game.question?.unit || '',
    remainingSeconds: game.remainingSeconds ?? QUESTION_SECONDS,
    history: game.history.map(h => ({ round: h.round, question: h.question, answer: h.answer, unit: h.unit })),
    winnerIds: game.phase === 'finished' ? [...game.winnerIds] : [],
    finishReason: game.finishReason,
    standings: allSubmitted ? standings.map((p, index) => ({ ...p, rank: index + 1 })) : []
  };
}

module.exports = { QUESTIONS, CATEGORY_NAMES, ROUND_OPTIONS, QUESTION_SECONDS, createGame, nextQuestion, scoreGuess, finalizeRoundIfReady, expireRound, publicGame };
