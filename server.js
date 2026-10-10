const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// İmposter Kelimeleri
const rawImposterKelimeler = [
    { kelime: "AYNA", ipucu: "TERS" }, { kelime: "GÜNEŞ", ipucu: "GÖLGE" },
    { kelime: "KÜTÜPHANE", ipucu: "KOKU" }, { kelime: "DOKTOR", ipucu: "İMZA" },
    { kelime: "PENGUEN", ipucu: "SMOKİN" }, { kelime: "SİNEMA", ipucu: "YATAKLI" },
    { kelime: "DEPREM", ipucu: "ÇATLAK" }, { kelime: "FOTOĞRAF", ipucu: "KARE" },
    { kelime: "KALE", ipucu: "TAŞ" }, { kelime: "OKYANUS", ipucu: "ARAŞTIRILMAYAN" },
    { kelime: "BALON", ipucu: "İĞNE" }, { kelime: "HAPİSHANE", ipucu: "MÜHLET" },
    { kelime: "RÜZGAR", ipucu: "ISLIK" }, { kelime: "MUM", ipucu: "ZAMAN" },
    { kelime: "PİL", ipucu: "KUTUP" }, { kelime: "PIRLANTA", ipucu: "IŞILTI" },
    { kelime: "LABİRENT", ipucu: "İP" }, { kelime: "MÜZE", ipucu: "TOZ" },
    { kelime: "YILDIRIM", ipucu: "GECİKME" }, { kelime: "ORMAN", ipucu: "BÖCEK" },
    { kelime: "HEYKEL", ipucu: "POZ" }, { kelime: "ÇÖL", ipucu: "TANE" },
    { kelime: "TİYATRO", ipucu: "MASKE" }, { kelime: "RADYO", ipucu: "PARAZİT" },
    { kelime: "UÇURTMA", ipucu: "KUYRUK" }, { kelime: "KÖPRÜ", ipucu: "GEÇİŞ" },
    { kelime: "VOLKAN", ipucu: "KÜL" }, { kelime: "ŞEMSİYE", ipucu: "ISLAK" },
    { kelime: "BUZUL", ipucu: "ÇATLAMA" }, { kelime: "HARİTA", ipucu: "ÖLÇEK" },
    { kelime: "GEMİ", ipucu: "DÜMEN" }, { kelime: "TELESKOP", ipucu: "GECE" },
    { kelime: "ZEHİR", ipucu: "DAMLA" }, { kelime: "UYDU", ipucu: "SİNYAL" },
    { kelime: "KUMARHANE", ipucu: "KASA" }, { kelime: "ASANSÖR", ipucu: "KABİN" },
    { kelime: "HAZİNE", ipucu: "KİLİT" }, { kelime: "DENİZALTI", ipucu: "PERİSKOP" },
    { kelime: "SİRK", ipucu: "ÇADIR" }, { kelime: "PİRAMİT", ipucu: "KÖŞE" },
    { kelime: "YANARDAĞ", ipucu: "DUMAN" }, { kelime: "CASUS", ipucu: "KİMLİK" },
    { kelime: "METRO", ipucu: "TÜNEL" }, { kelime: "CENAZE", ipucu: "SİYAH" },
    { kelime: "AKVARYUM", ipucu: "CAM" }, { kelime: "POSTA", ipucu: "PUL" },
    { kelime: "BANKA", ipucu: "SIRA" }, { kelime: "SAVAŞ", ipucu: "SİREN" },
    { kelime: "ORUÇ", ipucu: "TOP" }
];

// Tabu Kartları
const rawTabuKartlari = [
    { kelime: "FUTBOL", yasaklar: ["TOP", "KALE", "MAÇ", "GOL", "HAKEM"] },
    { kelime: "TELEFON", yasaklar: ["ARAMAK", "EKRAN", "ŞARJ", "AKILLI", "MESAJ"] },
    { kelime: "DOKTOR", yasaklar: ["HASTANE", "İLAÇ", "REÇETE", "ÖNLÜK", "MUAYENE"] },
    { kelime: "GİTAR", yasaklar: ["MÜZİK", "TEL", "AKOR", "PENA", "ÇALMAK"] },
    { kelime: "KAHVE", yasaklar: ["FİNCAN", "ÇEKİRDEK", "TELVE", "KAFEİN", "SABAH"] },
    { kelime: "BİLGİSAYAR", yasaklar: ["KLAVYE", "FARE", "MONİTÖR", "KOD", "İNTERNET"] },
    { kelime: "SİNEMA", yasaklar: ["FİLM", "BİLET", "MISIR", "SALON", "PERDE"] },
    { kelime: "DENİZ", yasaklar: ["SU", "TUZ", "BALIK", "YÜZMEK", "DALGA"] },
    { kelime: "PİZZA", yasaklar: ["HAMUR", "PEYNİR", "DİLİM", "İTALYAN", "FIRIN"] },
    { kelime: "ÖĞRETMEN", yasaklar: ["OKUL", "DERS", "SINAV", "NOT", "ÖĞRENCİ"] },
    { kelime: "ÇAY", yasaklar: ["RİZE", "DEMLİK", "ŞEKER", "BARDAK", "KAHVALTI"] },
    { kelime: "ARABA", yasaklar: ["TEKERLEK", "MOTOR", "DİREKSİYON", "YOL", "VİTES"] },
    { kelime: "INSTAGRAM", yasaklar: ["FOTOĞRAF", "TAKİPÇİ", "BEĞENİ", "HİKAYE", "REELS"] },
    { kelime: "BERBER", yasaklar: ["SAÇ", "MAKAS", "TIRAŞ", "AYNA", "KOLTUK"] },
    { kelime: "GÖZLÜK", yasaklar: ["GÖZ", "CAM", "ÇERÇEVE", "NUMARA", "LENS"] },
    { kelime: "DÜĞÜN", yasaklar: ["GELİN", "DAMAT", "HALAY", "ALTIN", "PASTA"] },
    { kelime: "UÇAK", yasaklar: ["KANAT", "HAVAALANI", "PİLOT", "UÇMAK", "BİLET"] },
    { kelime: "ASANSÖR", yasaklar: ["KAT", "BİNA", "İNMEK", "ÇIKMAK", "BUTON"] },
    { kelime: "DOLMUŞ", yasaklar: ["ŞOFÖR", "ÜCRET", "PARAYI UZATMAK", "İNECEK VAR", "MİNİBÜS"] },
    { kelime: "YURT", yasaklar: ["ODA", "RANZA", "ÖĞRENCİ", "KYK", "YEMEKHANE"] },
    { kelime: "VİZE", yasaklar: ["FİNAL", "SINAV", "ÜNİVERSİTE", "NOT", "BÜT"] },
    { kelime: "KUMANDA", yasaklar: ["TELEVİZYON", "TUŞ", "PİL", "KANAL", "KOLTUK"] },
    { kelime: "AYNA", yasaklar: ["YANSIMA", "BAKMAK", "CAM", "KENDİN", "SÜSLENMEK"] },
    { kelime: "BUZDOLABI", yasaklar: ["SOĞUK", "YEMEK", "MUTFAK", "KAPAK", "DONDURUCU"] },
    { kelime: "DİŞ FIRÇASI", yasaklar: ["MACUN", "AĞIZ", "SABAH", "BANYO", "TEMİZLEMEK"] },
    { kelime: "KÜTÜPHANE", yasaklar: ["KİTAP", "SESSİZ", "DERS", "MASA", "OKUMAK"] },
    { kelime: "KEDİ", yasaklar: ["MİYAV", "MAMA", "PATİ", "KUM", "TÜY"] },
    { kelime: "KÖPEK", yasaklar: ["HAV", "TASMA", "SADIK", "KUYRUK", "CİNS"] },
    { kelime: "ZAMAN", yasaklar: ["SAAT", "DAKİKA", "GEÇMEK", "AKREP", "YELKOVAN"] },
    { kelime: "PARFÜM", yasaklar: ["KOKU", "SIKMAK", "ŞİŞE", "GÜZEL", "DEODORANT"] },
    { kelime: "CÜZDAN", yasaklar: ["PARA", "KART", "KİMLİK", "CEP", "DERİ"] },
    { kelime: "PASAPORT", yasaklar: ["YURT DIŞI", "VİZE", "HAVAALANI", "ÜLKE", "SEYAHAT"] },
    { kelime: "MANGAL", yasaklar: ["ET", "KÖMÜR", "ATEŞ", "PİKNİK", "YELLEMEK"] },
    { kelime: "KUMPİR", yasaklar: ["PATATES", "ORTAKÖY", "KAŞAR", "TEREYAĞI", "MEZE"] },
    { kelime: "TAVLA", yasaklar: ["ZAR", "PUL", "DÜŞEŞ", "KAPI", "MARS"] },
    { kelime: "OKEY", yasaklar: ["TAŞ", "ISTAKA", "GÖSTERGE", "PER", "ÇİFTE"] },
    { kelime: "PİLAV", yasaklar: ["PİRİNÇ", "TAVUK", "TEREYAĞI", "LAPA", "TENCERE"] },
    { kelime: "MENEMEN", yasaklar: ["YUMURTA", "DOMATES", "BİBER", "SOĞAN", "TAVA"] },
    { kelime: "LAHMACUN", yasaklar: ["KIYMA", "LİMON", "MAYDANOZ", "ÇITIR", "AYRAN"] },
    { kelime: "BAKLAVA", yasaklar: ["ŞERBET", "FISTIK", "ANTEP", "BAYRAM", "TATLI"] },
    { kelime: "KARPUZ", yasaklar: ["KAVUN", "ÇEKİRDEK", "DİLİM", "YAZ", "PEYNİR"] },
    { kelime: "HAMAM", yasaklar: ["KESE", "KÖPÜK", "GÖBEK TAŞI", "SICAK", "TELLAK"] },
    { kelime: "ŞEMSİYE", yasaklar: ["YAĞMUR", "ISLANMAK", "AÇMAK", "RÜZGAR", "HAVA"] },
    { kelime: "YASTIK", yasaklar: ["UYKU", "YATAK", "KILIFA", "BAŞ", "YUMUŞAK"] },
    { kelime: "ÇORAP", yasaklar: ["AYAK", "GİYMEK", "KOKU", "AYAKKABI", "ÇİFT"] },
    { kelime: "KÜPE", yasaklar: ["KULAK", "DELİK", "TAKI", "GÜMÜŞ", "ALTIN"] },
    { kelime: "DÖVME", yasaklar: ["İĞNE", "MÜREKKEP", "DERİ", "KOL", "DESEN"] },
    { kelime: "SPOR SALONU", yasaklar: ["AĞIRLIK", "KAS", "FITNESS", "HALTER", "KARDİYO"] },
    { kelime: "DİYET", yasaklar: ["KİLO", "YEMEK", "ZAYIFLAMAK", "PAZARTESİ", "SALATA"] },
    { kelime: "ALARM", yasaklar: ["SABAH", "UYANDIRMA", "TELEFON", "ERTELEMEK", "ÇALMAK"] },
    { kelime: "TRAFİK", yasaklar: ["ARABA", "IŞIK", "SIKIŞIK", "KORNA", "YOL"] },
    { kelime: "BORÇ", yasaklar: ["PARA", "BANKA", "ÖDEMEK", "KREDİ", "İSTEMEK"] },
    { kelime: "GÜNEŞ GÖZLÜĞÜ", yasaklar: ["YAZ", "GÖZ", "IŞIK", "DENİZ", "CAM"] },
    { kelime: "KORSAN", yasaklar: ["GEMİ", "DENİZ", "KAPTI-KAÇTI", "GÖZ BANDI", "HAZİNE"] },
    { kelime: "BOMBA", yasaklar: ["PATLAMAK", "FÜNYE", "İMHA", "İMHA UZMANI", "BARUT"] },
    { kelime: "GİZLİ AJAN", yasaklar: ["CASUS", "GÖREV", "TAKIM ELBİSE", "SİLAH", "007"] },
    { kelime: "DEDEKTİF", yasaklar: ["BÜYÜTEÇ", "İPUCU", "CİNAYET", "SHERLOCK", "İZ"] },
    { kelime: "PİYANGO", yasaklar: ["BİLET", "YILBAŞI", "İKRAMİYE", "ÇEKİLİŞ", "ZENGİN"] },
    { kelime: "DEDİKODU", yasaklar: ["KONUŞMAK", "ARKASINDAN", "SIR", "KULAK", "GIZLI"] },
    { kelime: "KABUS", yasaklar: ["RÜYA", "KORKU", "UYKU", "UYANMAK", "GECE"] }
];

// Şans ve Kamu Fonu
const sansKartlari = [
    { text: "Gülüm başlangıç noktasına git hele 200 tl al yolluk yaparsın", action: "go_to_go" },
    { text: "Telefonun çalıyor çantayı hazırla en yakın halısahaya koş servis geliyor.", action: "nearest_pitch" },
    { text: "Paran vardır senin kanka en pahalı mülke git bakiyim sen.", action: "go_to_thanos" },
    { text: "250 gr zurna yedin az yürü ve 3 kare ileri git.", action: "forward_3" },
    { text: "Kodesi blok ders olarak değiştirelim ve blok derse git not al bize lazım not botu seni.", action: "go_to_jail" },
    { text: "Blok dersten çıkış için konferansa katılma kartı kazandın daralırsan blok dersten hemen kaç dostum :)", action: "get_jail_card" },
    { text: "Fofana Teame çay ısmarladın her oyuncu için 50tl öde", action: "pay_each_50" },
    { text: "Susadın ve su aldın 15tl öde", action: "pay_15" },
    { text: "Geçenki çayın parasını arkadaşın attı 50 tl al", action: "gain_50" },
    { text: "Emirin ayağını gördün göz sağlığı sigortası için 150 tl öde", action: "pay_150" },
    { text: "sercü soğan yiyip yüzüne üfledi acillik oldun serum masrafı: 100tl öde", action: "pay_100" },
    { text: "osmandan özürlü oyuncağı aldın: 50tl öde", action: "pay_50" },
    { text: "KYK fazladan yattı OHA LAN! 100tl al", action: "gain_100" },
    { text: "Barış ceketi nerden aldın diyip sallarken yırttı terzi parası 100 tl öde", action: "pay_100" },
    { text: "oziye bir şey yapalım dedin ve göz kaşımaya başladı sinirden dişini kırdın muayene parası 100 tl öde", action: "pay_100" },
    { text: "Yeni aldığın şeye herkes oooo parayı buldun dedi nazar değdi ve yolda 175 lira düşürdün", action: "pay_175" },
    { text: "Thanos seni çağırdı: Doğrudan Thanos'un Evi karesine git.", action: "go_to_thanos" },
    { text: "Fotokopi ve kırtasiye masrafı: 50₺ öde.", action: "pay_50" },
    { text: "KYK bursun yattı: 200₺ al.", action: "gain_200" }
];

const kamuFonuKartlari = [
    { text: "Halısahaya para atarken yanlış hesaplandı 150tl fazla ödedin", action: "pay_150" },
    { text: "Bugün doğum günün her oyuncudan 10 tl al", action: "collect_each_10" },
    { text: "burs yattı moruq 100 tl al", action: "gain_100" },
    { text: "kupon yaptın geldiii bebeğimmm 10tl al", action: "gain_10" },
    { text: "kartın asgarisini ödedin faiz olarak 20 tl öde", action: "pay_20" },
    { text: "Bizde yok ki abi demekten dil belası oldu dostum 100tl öde dil belası kardeşim", action: "pay_100" },
    { text: "Doğruca blok derse kardeşim seçmeseydin o dersi hadi trafo mrafo aynen hadi abicim", action: "go_to_jail" },
    { text: "Blok dersten kaçmak için konferansa katılma kartı daralırsan kullan dostum", action: "get_jail_card" },
    { text: "Yemekhane kartına yanlışlıkla çift bakiye yüklendi: Bankadan 150₺ al.", action: "gain_150" },
    { text: "Kalkınma'da cüzdan düşürdün: 50₺ kaybettin.", action: "pay_50" }
];

const initialMonopolyBoard = [
    { id: 0, name: "BAŞLANGIÇ", type: "go" },
    { id: 1, name: "İBF Kantin", type: "property", group: "brown", price: 60, baseRent: 2 },
    { id: 2, name: "Kamu Fonu", type: "chest" },
    { id: 3, name: "Mavi Playstation", type: "property", group: "brown", price: 60, baseRent: 4 },
    { id: 4, name: "Gelir Vergisi", type: "tax", amount: 200 },
    { id: 5, name: "Uzunlar Halısaha", type: "pitch", price: 200 },
    { id: 6, name: "Balance", type: "property", group: "light_blue", price: 100, baseRent: 6 },
    { id: 7, name: "Şans", type: "chance" },
    { id: 8, name: "Oba Market", type: "property", group: "light_blue", price: 100, baseRent: 6 },
    { id: 9, name: "Lokal", type: "property", group: "light_blue", price: 120, baseRent: 8 },
    { id: 10, name: "BLOK DERS / ZİYARET", type: "jail" },
    { id: 11, name: "Makine Bölümü", type: "property", group: "pink", price: 140, baseRent: 10 },
    { id: 12, name: "Çoruh Elektrik", type: "utility", price: 150 },
    { id: 13, name: "Elektronik Bölümü", type: "property", group: "pink", price: 140, baseRent: 10 },
    { id: 14, name: "Köşem", type: "property", group: "pink", price: 160, baseRent: 12 },
    { id: 15, name: "Saha 3", type: "pitch", price: 200 },
    { id: 16, name: "Doksanoğlu", type: "property", group: "orange", price: 180, baseRent: 14 },
    { id: 17, name: "Kamu Fonu", type: "chest" },
    { id: 18, name: "Makine Kantini", type: "property", group: "orange", price: 180, baseRent: 14 },
    { id: 19, name: "Şenlik", type: "property", group: "orange", price: 200, baseRent: 16 },
    { id: 20, name: "Doblo Zamanı Dostum", type: "doblo" },
    { id: 21, name: "Ganita", type: "property", group: "red", price: 220, baseRent: 18 },
    { id: 22, name: "Şans", type: "chance" },
    { id: 23, name: "Kalkınma", type: "property", group: "red", price: 220, baseRent: 18 },
    { id: 24, name: "Konaklar", type: "property", group: "red", price: 240, baseRent: 20 },
    { id: 25, name: "Bayramoğlu Halısaha", type: "pitch", price: 200 },
    { id: 26, name: "KD Döner", type: "property", group: "yellow", price: 260, baseRent: 22 },
    { id: 27, name: "Meydan", type: "property", group: "yellow", price: 260, baseRent: 22 },
    { id: 28, name: "Kütüphane", type: "utility", price: 150 },
    { id: 29, name: "Koru", type: "property", group: "yellow", price: 280, baseRent: 24 },
    { id: 30, name: "BLOK DERSE GİT!", type: "go_to_jail" },
    { id: 31, name: "Cafe 5", type: "property", group: "green", price: 300, baseRent: 26 },
    { id: 32, name: "Rize", type: "property", group: "green", price: 300, baseRent: 26 },
    { id: 33, name: "Kamu Fonu", type: "chest" },
    { id: 34, name: "Çaykara", type: "property", group: "green", price: 320, baseRent: 28 },
    { id: 35, name: "10 Numara Halısaha", type: "pitch", price: 200 },
    { id: 36, name: "Şans", type: "chance" },
    { id: 37, name: "Bektaş Yaylası", type: "property", group: "dark_blue", price: 350, baseRent: 35 },
    { id: 38, name: "Lüks Vergisi", type: "tax", amount: 100 },
    { id: 39, name: "Thanos'un Evi", type: "property", group: "dark_blue", price: 400, baseRent: 50 }
];

let players = [];
let currentGame = null;

const playerColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e84393', '#00cec9', '#fdcb6e'];

let monoState = {
    active: false,
    board: JSON.parse(JSON.stringify(initialMonopolyBoard)),
    players: [],
    turnIndex: 0,
    dice: [1, 1],
    doubleRollCount: 0,
    waitingForDecision: false,
    waitingForDoblo: false,
    activeTrade: null,
    log: []
};

let currentImposterDeck = [];
let currentTabuDeck = [];
let imposterState = { word: '', imposterId: '', imposterName: '', votes: {}, timer: null };

let tabuState = {
    scores: { red: 0, blue: 0 }, currentCard: null, describerId: null,
    currentTeam: 'red', passCount: 3, timer: null, timeLeft: 60,
    roundActive: false, isIntermission: false, intermissionTimer: null,
    maxRounds: 5, currentRound: 1, teamTurnCount: 0
};

// ==========================================
// 🏎️ BÜYÜTÜLMÜŞ (1200x750) PİST & GELİŞMİŞ DRİFT MOTORU
// ==========================================
let raceState = {
    active: false,
    cars: {},
    items: [],
    itemBoxes: [
        { id: 1, x: 380, y: 640, active: true, respawnTimer: 0 },
        { id: 2, x: 1060, y: 380, active: true, respawnTimer: 0 },
        { id: 3, x: 620, y: 160, active: true, respawnTimer: 0 },
        { id: 4, x: 160, y: 340, active: true, respawnTimer: 0 },
        { id: 5, x: 580, y: 320, active: true, respawnTimer: 0 } // S-virajı ortası
    ],
    loopInterval: null,
    totalLaps: 3,
    winner: null
};

// 1200x750 Mega Pist Omurgası
const trackWaypoints = [
    { x: 550, y: 640 },
    { x: 920, y: 640 },
    { x: 1080, y: 520 },
    { x: 1080, y: 260 },
    { x: 920, y: 140 },
    { x: 680, y: 140 },
    { x: 580, y: 320 }, // S-Virajı içi
    { x: 420, y: 320 },
    { x: 320, y: 140 },
    { x: 140, y: 240 },
    { x: 130, y: 520 },
    { x: 320, y: 640 },
    { x: 550, y: 640 }
];

function distToSegment(p, v, w) {
    const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

function isCarOnTrack(x, y) {
    let minDist = 9999;
    for (let i = 0; i < trackWaypoints.length - 1; i++) {
        const d = distToSegment({ x, y }, trackWaypoints[i], trackWaypoints[i + 1]);
        if (d < minDist) minDist = d;
    }
    return minDist <= 65; // Geniş asfalt yarıçapı
}

function broadcastMonoLog(msg) {
    monoState.log.unshift(msg);
    io.emit('monoGlobalAlert', msg);
}

function getRentDetails(tile, diceSum) {
    if (tile.type === 'property') {
        const groupTiles = monoState.board.filter(t => t.type === 'property' && t.group === tile.group);
        const ownedInGroup = groupTiles.filter(t => t.owner === tile.owner);
        const isMonopoly = groupTiles.length === ownedInGroup.length;
        const finalRent = isMonopoly ? (tile.baseRent * 2) : tile.baseRent;
        return {
            rent: finalRent,
            isMonopoly: isMonopoly,
            note: isMonopoly ? '🔥 TEKEL ZAMMI (x2 Kat Kira)' : 'Standart Kira'
        };
    }
    if (tile.type === 'pitch') {
        const ownedPitches = monoState.board.filter(t => t.type === 'pitch' && t.owner === tile.owner).length;
        let r = 25;
        if (ownedPitches === 2) r = 50;
        if (ownedPitches === 3) r = 100;
        if (ownedPitches === 4) r = 200;
        return {
            rent: r,
            isMonopoly: ownedPitches === 4,
            note: `⚽ ${ownedPitches} Halısaha Sahibi`
        };
    }
    if (tile.type === 'utility') {
        const ownedUtils = monoState.board.filter(t => t.type === 'utility' && t.owner === tile.owner).length;
        const multiplier = ownedUtils === 2 ? 10 : 4;
        return {
            rent: diceSum * multiplier,
            isMonopoly: ownedUtils === 2,
            note: `💡 ${ownedUtils} Kamu Binası (Zar x ${multiplier})`
        };
    }
    return { rent: 0, isMonopoly: false, note: '' };
}

function checkHalısahaWin(ownerId, ownerName) {
    const pitchCount = monoState.board.filter(t => t.type === 'pitch' && t.owner === ownerId).length;
    if (pitchCount === 4) {
        monoState.active = false;
        broadcastMonoLog(`🏆🏆 GOLDEN GOAL! ${ownerName} 4 HALISAHAIN HEPSİNİ ALARAK OYUNU KAZANDI! 🏆🏆`);
        io.emit('monopolyStateUpdated', monoState);
        return true;
    }
    return false;
}

io.on('connection', (socket) => {
    socket.on('joinLobby', (name) => {
        if (players.length >= 10) return socket.emit('errorMsg', 'Lobi dolu! (Maks 10)');
        players.push({
            id: socket.id,
            name,
            team: 'red',
            ready: false,
            color: playerColors[players.length % playerColors.length]
        });
        io.emit('updateLobby', { players, currentGame });
    });

    socket.on('selectGame', (gameType) => {
        currentGame = gameType;
        players.forEach(p => p.ready = false);
        io.emit('gameSelected', gameType);
        io.emit('updateLobbyStatuses', { players, gameType });
    });

    socket.on('toggleGeneralReady', () => {
        const p = players.find(x => x.id === socket.id);
        if (p) {
            p.ready = !p.ready;
            io.emit('updateLobbyStatuses', { players, gameType: currentGame });
        }
    });

    socket.on('backToLobby', () => {
        currentGame = null;
        if (imposterState.timer) clearInterval(imposterState.timer);
        if (tabuState.timer) clearInterval(tabuState.timer);
        if (tabuState.intermissionTimer) clearInterval(tabuState.intermissionTimer);
        if (raceState.loopInterval) clearInterval(raceState.loopInterval);
        tabuState.roundActive = false;
        tabuState.isIntermission = false;
        raceState.active = false;
        players.forEach(p => p.ready = false);
        io.emit('gameSelected', 'lobby');
        io.emit('updateLobby', { players, currentGame });
    });

    // ==========================================
    // 🏎️ YARIŞ VE GELİŞMİŞ DRİFT / SPIN FİZİĞİ
    // ==========================================
    socket.on('startRaceGame', () => {
        if (players.length < 1) return socket.emit('errorMsg', 'En az 1 oyuncu gerekir!');
        if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Oyunu başlatmak için herkes HAZIR olmalı!');
        if (raceState.loopInterval) clearInterval(raceState.loopInterval);

        raceState.active = true;
        raceState.winner = null;
        raceState.cars = {};
        raceState.items = [];

        players.forEach((p, idx) => {
            raceState.cars[p.id] = {
                id: p.id,
                name: p.name,
                color: p.color,
                x: 480 - (idx * 35),
                y: 640,
                angle: 0, // Sağa doğru kalkış
                speed: 0,
                // Kayma vektörleri (Spin sırasında yönünü korur)
                vx: 0,
                vy: 0,
                lap: 1,
                checkpoints: [false, false, false],
                heldItem: null,
                isSpinning: false,
                spinAngleSpeed: 0,
                finished: false,
                inputs: { up: false, down: false, left: false, right: false }
            };
        });

        io.emit('raceStarted', { totalLaps: raceState.totalLaps });

        // 30 FPS Fizik Döngüsü
        raceState.loopInterval = setInterval(() => {
            if (!raceState.active) return;

            // Kutu yeniden doğma süreleri
            raceState.itemBoxes.forEach(box => {
                if (!box.active) {
                    box.respawnTimer--;
                    if (box.respawnTimer <= 0) box.active = true;
                }
            });

            // Roketler
            for (let i = raceState.items.length - 1; i >= 0; i--) {
                const item = raceState.items[i];
                if (item.type === 'rocket') {
                    item.x += Math.cos(item.angle) * 14;
                    item.y += Math.sin(item.angle) * 14;
                    item.life--;

                    for (let id in raceState.cars) {
                        const car = raceState.cars[id];
                        if (id !== item.ownerId && !car.finished) {
                            if (Math.hypot(car.x - item.x, car.y - item.y) < 28) {
                                // Patlama: Hızı sıfırlama, savur ve döndür!
                                car.isSpinning = true;
                                car.spinAngleSpeed = 0.35;
                                car.vx = Math.cos(item.angle) * 4;
                                car.vy = Math.sin(item.angle) * 4;
                                car.speed = Math.max(1.5, car.speed * 0.6);
                                item.life = 0;
                                io.emit('monoGlobalAlert', `💥 ${item.ownerName}'in Roketi ${car.name}'i savurdu!`);
                                break;
                            }
                        }
                    }

                    if (item.life <= 0 || item.x < 0 || item.x > 1200 || item.y < 0 || item.y > 750) {
                        raceState.items.splice(i, 1);
                    }
                }
            }

            // Arabaların Hareketi
            for (let id in raceState.cars) {
                const car = raceState.cars[id];
                if (car.finished) continue;

                const onTrack = isCarOnTrack(car.x, car.y);
                const maxSpeed = onTrack ? 7.2 : 2.6;

                // --- SPİN / MUZ / ROKET KAYMA FİZİĞİ ---
                if (car.isSpinning) {
                    car.angle += car.spinAngleSpeed;
                    car.spinAngleSpeed *= 0.94; // Dönüş yavaşça durur

                    // Hızı taş gibi sıfırlamaz, momentumla kızaklar
                    car.speed *= 0.94;
                    car.x += car.vx;
                    car.y += car.vy;
                    car.vx *= 0.94;
                    car.vy *= 0.94;

                    // Dönüş yavaşlayınca kontrol oyuncuya geri geçer
                    if (Math.abs(car.spinAngleSpeed) < 0.03) {
                        car.isSpinning = false;
                        car.spinAngleSpeed = 0;
                    }
                } else {
                    // Normal Sürüş
                    if (car.inputs.up) car.speed += onTrack ? 0.28 : 0.09;
                    if (car.inputs.down) car.speed -= 0.2;

                    car.speed *= onTrack ? 0.96 : 0.88;
                    if (car.speed > maxSpeed) car.speed = maxSpeed;
                    if (car.speed < -2.0) car.speed = -2.0;

                    if (Math.abs(car.speed) > 0.1) {
                        const dir = car.speed > 0 ? 1 : -1;
                        if (car.inputs.left) car.angle -= 0.065 * dir;
                        if (car.inputs.right) car.angle += 0.065 * dir;
                    }

                    car.vx = Math.cos(car.angle) * car.speed;
                    car.vy = Math.sin(car.angle) * car.speed;
                    car.x += car.vx;
                    car.y += car.vy;
                }

                // Ekran Sınırları
                car.x = Math.max(20, Math.min(1180, car.x));
                car.y = Math.max(20, Math.min(730, car.y));

                // Kutu Toplama
                raceState.itemBoxes.forEach(box => {
                    if (box.active && Math.hypot(car.x - box.x, car.y - box.y) < 30) {
                        box.active = false;
                        box.respawnTimer = 150;
                        if (!car.heldItem) {
                            car.heldItem = Math.random() < 0.5 ? 'banana' : 'rocket';
                        }
                    }
                });

                // Muza Çarpma
                for (let i = raceState.items.length - 1; i >= 0; i--) {
                    const item = raceState.items[i];
                    if (item.type === 'banana') {
                        if (Math.hypot(car.x - item.x, car.y - item.y) < 22) {
                            // Muza basınca hızı sıfırlama! Yavaşlayıp dönerek kaysın
                            car.isSpinning = true;
                            car.spinAngleSpeed = 0.38;
                            car.vx = Math.cos(car.angle) * (car.speed * 0.8);
                            car.vy = Math.sin(car.angle) * (car.speed * 0.8);
                            car.speed *= 0.7; // Hafif hız korur
                            raceState.items.splice(i, 1);
                            io.emit('monoGlobalAlert', `🍌 ${car.name} muza bastı ve drift atarak döndü!`);
                            break;
                        }
                    }
                }

                // Checkpointler (1200x750 Pist Noktaları)
                if (car.x > 950 && car.y < 350) car.checkpoints[0] = true;
                if (car.x < 650 && car.x > 500 && car.y < 380) car.checkpoints[1] = true;
                if (car.x < 250 && car.y > 350) car.checkpoints[2] = true;

                // Bitiş Çizgisinden Geçiş (x: 580 civarı, y > 580)
                if (car.checkpoints[0] && car.checkpoints[1] && car.checkpoints[2]) {
                    if (car.x > 570 && car.x < 605 && car.y > 580) {
                        car.checkpoints = [false, false, false];
                        car.lap++;

                        if (car.lap > raceState.totalLaps) {
                            car.finished = true;
                            if (!raceState.winner) {
                                raceState.winner = car.name;
                                raceState.active = false;
                                clearInterval(raceState.loopInterval);
                                io.emit('raceFinished', { winner: car.name });
                                break;
                            }
                        }
                    }
                }
            }

            io.emit('raceUpdate', {
                cars: raceState.cars,
                items: raceState.items,
                boxes: raceState.itemBoxes
            });
        }, 1000 / 30);
    });

    socket.on('raceInput', (inputs) => {
        if (raceState.active && raceState.cars[socket.id]) {
            raceState.cars[socket.id].inputs = inputs;
        }
    });

    socket.on('raceUseItem', () => {
        if (!raceState.active || !raceState.cars[socket.id]) return;
        const car = raceState.cars[socket.id];
        if (!car.heldItem || car.isSpinning) return;

        if (car.heldItem === 'banana') {
            raceState.items.push({
                type: 'banana',
                x: car.x - Math.cos(car.angle) * 26,
                y: car.y - Math.sin(car.angle) * 26
            });
        } else if (car.heldItem === 'rocket') {
            raceState.items.push({
                type: 'rocket',
                ownerId: car.id,
                ownerName: car.name,
                x: car.x + Math.cos(car.angle) * 28,
                y: car.y + Math.sin(car.angle) * 28,
                angle: car.angle,
                life: 100
            });
        }
        car.heldItem = null;
    });

    // ==========================================
    // MONOPOLY MOTORU
    // ==========================================
    socket.on('startMonopolyGame', () => {
        if (players.length < 2) return socket.emit('errorMsg', 'En az 2 oyuncu gerekli!');
        if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmadan oyun başlamaz!');

        monoState = {
            active: true,
            board: JSON.parse(JSON.stringify(initialMonopolyBoard)),
            players: players.map((p, idx) => ({
                id: p.id,
                name: p.name,
                color: playerColors[idx % playerColors.length],
                money: 1500,
                position: 0,
                inJail: false,
                jailTurns: 0,
                jailCardCount: 0,
                bankrupt: false
            })),
            turnIndex: 0,
            dice: [1, 1],
            doubleRollCount: 0,
            waitingForDecision: false,
            waitingForDoblo: false,
            activeTrade: null,
            log: []
        };

        broadcastMonoLog('Oyun başladı! Bol şans.');
        io.emit('monopolyStateUpdated', monoState);
    });

    socket.on('monopolyUseJailCard', () => {
        if (!monoState.active) return;
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id) return socket.emit('errorMsg', 'Sıra sende değil!');
        if (!cp.inJail) return socket.emit('errorMsg', 'Blok derste değilsin!');
        if (cp.jailCardCount <= 0) return socket.emit('errorMsg', 'Konferansa katılma kartın yok!');

        cp.jailCardCount--;
        cp.inJail = false;
        cp.jailTurns = 0;
        broadcastMonoLog(`🎟️ ${cp.name} Konferans Kartını kullandı ve blok dersten kaçtı!`);

        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        monoState.dice = [d1, d2];
        const total = d1 + d2;
        broadcastMonoLog(`🎲 ${cp.name} zar attı: [${d1}-${d2} = ${total}]`);

        advancePlayer(cp, total, false);
    });

    socket.on('monopolyPayJailBail', () => {
        if (!monoState.active) return;
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id) return socket.emit('errorMsg', 'Sıra sende değil!');
        if (!cp.inJail) return socket.emit('errorMsg', 'Blok derste değilsin!');
        if (cp.money < 100) return socket.emit('errorMsg', 'Kefalet için 100₺ paran yok!');

        cp.money -= 100;
        cp.inJail = false;
        cp.jailTurns = 0;
        broadcastMonoLog(`🔓 ${cp.name} 100₺ kefalet ödedi ve blok dersten tüyüp zarlarını attı!`);

        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        monoState.dice = [d1, d2];
        const total = d1 + d2;
        broadcastMonoLog(`🎲 ${cp.name} zar attı: [${d1}-${d2} = ${total}]`);

        advancePlayer(cp, total, false);
    });

    socket.on('monopolyRollDice', () => {
        if (!monoState.active) return;
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id) return socket.emit('errorMsg', 'Sıra sende değil!');
        if (monoState.waitingForDecision || monoState.waitingForDoblo) return socket.emit('errorMsg', 'Önce mevcut kararını tamamla!');

        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const isDouble = d1 === d2;
        const total = d1 + d2;
        monoState.dice = [d1, d2];

        if (cp.inJail) {
            cp.jailTurns++;

            if (cp.jailTurns < 3) {
                broadcastMonoLog(`🚨 ${cp.name} Blok derste çift atmayı denedi [${cp.jailTurns}. Hak]: ${d1}-${d2}`);
                if (isDouble) {
                    cp.inJail = false;
                    cp.jailTurns = 0;
                    broadcastMonoLog(`🎉 ÇİFT ZAR! ${cp.name} Blok dersten bedava çıktı!`);
                    advancePlayer(cp, total, isDouble);
                    return;
                } else {
                    broadcastMonoLog(`🔒 Çift gelmedi! ${cp.name} blok derste kaldı.`);
                    finishTurn();
                    io.emit('monopolyStateUpdated', monoState);
                    return;
                }
            } else {
                cp.inJail = false;
                cp.jailTurns = 0;
                broadcastMonoLog(`⚖️ 3. TUR BİTTİ! ${cp.name} dersten bedava çıktı ve [${total}] ilerliyor.`);
                advancePlayer(cp, total, isDouble);
                return;
            }
        }

        if (isDouble) {
            monoState.doubleRollCount++;
            broadcastMonoLog(`🎲 ${cp.name} ÇİFT ZAR ATTI! (${d1}-${d2}) [${monoState.doubleRollCount}. Çift]`);
            if (monoState.doubleRollCount === 3) {
                cp.position = 10;
                cp.inJail = true;
                cp.jailTurns = 0;
                broadcastMonoLog(`🚨 3 Kez üst üste çift atan ${cp.name} BLOK DERSE GÖNDERİLDİ!`);
                finishTurn();
                io.emit('monopolyStateUpdated', monoState);
                return;
            }
        } else {
            monoState.doubleRollCount = 0;
        }

        advancePlayer(cp, total, isDouble);
    });

    function advancePlayer(cp, total, isDouble) {
        const oldPos = cp.position;
        let newPos = (oldPos + total) % 40;

        if (newPos < oldPos) {
            cp.money += 200;
            broadcastMonoLog(`💵 ${cp.name} Başlangıçtan geçti ve 200₺ aldı.`);
        }

        cp.position = newPos;
        handleTileLanding(cp, newPos, isDouble, total);
    }

    function handleTileLanding(cp, pos, isDouble, diceSum) {
        const tile = monoState.board[pos];

        if (tile.type === 'doblo') {
            broadcastMonoLog(`🚐 ${cp.name} DOBLO ZAMANI DOSTUM karesine bastı! İstediğin yere sür dostum dobloyla evreni dolaşabilirsin!`);
            monoState.waitingForDoblo = true;
            io.to(cp.id).emit('monopolyDobloPrompt', {
                board: monoState.board.map(t => ({ id: t.id, name: t.name }))
            });
            io.emit('monopolyStateUpdated', monoState);
            return;
        } else if (tile.type === 'go_to_jail') {
            cp.position = 10;
            cp.inJail = true;
            cp.jailTurns = 0;
            broadcastMonoLog(`🚨 ${cp.name} BLOK DERSE GİTTİ!`);
            finishTurn();
            io.emit('monopolyStateUpdated', monoState);
            return;
        } else if (tile.type === 'tax') {
            cp.money -= tile.amount;
            broadcastMonoLog(`💸 ${cp.name} vergi ödedi: -${tile.amount}₺`);
            checkBankruptcy(cp);
            postTileAction(isDouble);
            return;
        } else if (tile.type === 'chance') {
            handleChanceCard(cp, isDouble);
            return;
        } else if (tile.type === 'chest') {
            handleChestCard(cp, isDouble);
            return;
        } else if (tile.owner && tile.owner !== cp.id) {
            const owner = monoState.players.find(p => p.id === tile.owner);
            if (owner && !owner.bankrupt) {
                const rentInfo = getRentDetails(tile, diceSum || (monoState.dice[0] + monoState.dice[1]));
                cp.money -= rentInfo.rent;
                owner.money += rentInfo.rent;

                const msg = `⚠️ ${cp.name}, ${owner.name}'in ${tile.name} mülküne bastı! ${rentInfo.note} ➜ Ödenen Kira: ${rentInfo.rent}₺`;
                broadcastMonoLog(msg);

                checkBankruptcy(cp);

                const buyoutPrice = Math.floor(tile.price * 1.5);
                if (cp.money >= buyoutPrice && !cp.bankrupt) {
                    monoState.waitingForDecision = true;
                    io.to(cp.id).emit('monopolyBuyoutPrompt', {
                        tile,
                        buyoutPrice,
                        ownerName: owner.name
                    });
                    io.emit('monopolyStateUpdated', monoState);
                    return;
                }
            }
            postTileAction(isDouble);
            return;
        }

        const canBuy = (tile.type === 'property' || tile.type === 'pitch' || tile.type === 'utility') && !tile.owner;
        if (canBuy && cp.money >= tile.price) {
            monoState.waitingForDecision = true;
            io.to(cp.id).emit('monopolyBuyPrompt', { tile });
        } else {
            postTileAction(isDouble);
        }

        io.emit('monopolyStateUpdated', monoState);
    }

    socket.on('monopolyDobloDrive', (targetTileId) => {
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id || !monoState.waitingForDoblo) return;

        const targetId = parseInt(targetTileId);
        if (isNaN(targetId) || targetId < 0 || targetId >= 40) return;

        monoState.waitingForDoblo = false;
        const targetTile = monoState.board[targetId];

        if (targetId < cp.position) {
            cp.money += 200;
            broadcastMonoLog(`💵 ${cp.name} Doblo'yla Başlangıçtan geçti ve 200₺ yolluk aldı.`);
        }

        cp.position = targetId;
        broadcastMonoLog(`🚐💨 ${cp.name} Doblo'yu gazladı ve doğrudan [${targetTile.name}] karesine yanaştı!`);

        const isDouble = monoState.dice[0] === monoState.dice[1] && monoState.doubleRollCount > 0 && monoState.doubleRollCount < 3;
        handleTileLanding(cp, targetId, isDouble, 7);
    });

    function handleChanceCard(cp, isDouble) {
        const card = sansKartlari[Math.floor(Math.random() * sansKartlari.length)];
        broadcastMonoLog(`🎲 [ŞANS KARTI - ${cp.name}]: "${card.text}"`);
        executeCardAction(cp, card.action, isDouble);
    }

    function handleChestCard(cp, isDouble) {
        const card = kamuFonuKartlari[Math.floor(Math.random() * kamuFonuKartlari.length)];
        broadcastMonoLog(`📦 [KAMU FONU - ${cp.name}]: "${card.text}"`);
        executeCardAction(cp, card.action, isDouble);
    }

    function executeCardAction(cp, action, isDouble) {
        const otherPlayers = monoState.players.filter(p => p.id !== cp.id && !p.bankrupt);

        switch (action) {
            case 'go_to_go':
                cp.position = 0;
                cp.money += 200;
                postTileAction(isDouble);
                break;
            case 'go_to_thanos':
                if (cp.position > 39) cp.money += 200;
                cp.position = 39;
                handleTileLanding(cp, 39, isDouble, 7);
                break;
            case 'nearest_pitch':
                const pitches = [5, 15, 25, 35];
                let nextPitch = pitches.find(p => p > cp.position);
                if (!nextPitch) {
                    nextPitch = 5;
                    cp.money += 200;
                }
                cp.position = nextPitch;
                handleTileLanding(cp, nextPitch, isDouble, 7);
                break;
            case 'forward_3':
                cp.position = (cp.position + 3) % 40;
                handleTileLanding(cp, cp.position, isDouble, 7);
                break;
            case 'go_to_jail':
                cp.position = 10;
                cp.inJail = true;
                cp.jailTurns = 0;
                finishTurn();
                break;
            case 'get_jail_card':
                cp.jailCardCount = (cp.jailCardCount || 0) + 1;
                broadcastMonoLog(`🎟️ ${cp.name} 1 adet "Konferansa Katılma Kartı" kazandı!`);
                postTileAction(isDouble);
                break;
            case 'pay_each_50':
                otherPlayers.forEach(p => {
                    cp.money -= 50;
                    p.money += 50;
                });
                checkBankruptcy(cp);
                postTileAction(isDouble);
                break;
            case 'collect_each_10':
                otherPlayers.forEach(p => {
                    p.money -= 10;
                    cp.money += 10;
                    checkBankruptcy(p);
                });
                postTileAction(isDouble);
                break;
            case 'gain_10': cp.money += 10; postTileAction(isDouble); break;
            case 'gain_50': cp.money += 50; postTileAction(isDouble); break;
            case 'gain_100': cp.money += 100; postTileAction(isDouble); break;
            case 'gain_150': cp.money += 150; postTileAction(isDouble); break;
            case 'gain_200': cp.money += 200; postTileAction(isDouble); break;
            case 'pay_15': cp.money -= 15; checkBankruptcy(cp); postTileAction(isDouble); break;
            case 'pay_20': cp.money -= 20; checkBankruptcy(cp); postTileAction(isDouble); break;
            case 'pay_50': cp.money -= 50; checkBankruptcy(cp); postTileAction(isDouble); break;
            case 'pay_100': cp.money -= 100; checkBankruptcy(cp); postTileAction(isDouble); break;
            case 'pay_150': cp.money -= 150; checkBankruptcy(cp); postTileAction(isDouble); break;
            case 'pay_175': cp.money -= 175; checkBankruptcy(cp); postTileAction(isDouble); break;
            default:
                postTileAction(isDouble);
        }

        io.emit('monopolyStateUpdated', monoState);
    }

    socket.on('monopolyBuyDecision', (buy) => {
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id) return;
        monoState.waitingForDecision = false;

        const tile = monoState.board[cp.position];
        if (buy && tile && !tile.owner && cp.money >= tile.price) {
            cp.money -= tile.price;
            tile.owner = cp.id;
            tile.ownerName = cp.name;
            broadcastMonoLog(`🛒 ${cp.name}, ${tile.name} tapusunu ${tile.price}₺ karşılığında satın aldı!`);
            if (checkHalısahaWin(cp.id, cp.name)) return;
        }

        const isDouble = monoState.dice[0] === monoState.dice[1] && monoState.doubleRollCount > 0 && monoState.doubleRollCount < 3;
        postTileAction(isDouble);
        io.emit('monopolyStateUpdated', monoState);
    });

    socket.on('monopolyBuyoutDecision', (buyout) => {
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id) return;
        monoState.waitingForDecision = false;

        const tile = monoState.board[cp.position];
        const buyoutPrice = Math.floor(tile.price * 1.5);
        const prevOwner = monoState.players.find(p => p.id === tile.owner);

        if (buyout && prevOwner && cp.money >= buyoutPrice) {
            cp.money -= buyoutPrice;
            prevOwner.money += buyoutPrice;
            tile.owner = cp.id;
            tile.ownerName = cp.name;
            broadcastMonoLog(`💥 EL DEĞİŞTİRDİ! ${cp.name}, ${prevOwner.name}'in ${tile.name} mülkünü 1.5 katı bedelle (${buyoutPrice}₺) zorla satın aldı!`);
            if (checkHalısahaWin(cp.id, cp.name)) return;
        }

        const isDouble = monoState.dice[0] === monoState.dice[1] && monoState.doubleRollCount > 0 && monoState.doubleRollCount < 3;
        postTileAction(isDouble);
        io.emit('monopolyStateUpdated', monoState);
    });

    socket.on('initiateTradeOffer', (data) => {
        const buyer = monoState.players.find(p => p.id === socket.id);
        const tile = monoState.board.find(t => t.id === data.tileId);
        if (!buyer || !tile || !tile.owner || tile.owner === socket.id) return;

        const amount = parseInt(data.offerAmount);
        if (isNaN(amount) || amount <= 0 || buyer.money < amount) {
            return socket.emit('errorMsg', 'Geçersiz teklif tutarı veya yetersiz bakiye!');
        }

        const seller = monoState.players.find(p => p.id === tile.owner);
        if (!seller) return;

        monoState.activeTrade = {
            buyerId: buyer.id,
            buyerName: buyer.name,
            sellerId: seller.id,
            tileId: tile.id,
            tileName: tile.name,
            offerAmount: amount
        };

        io.to(seller.id).emit('incomingTradeOffer', monoState.activeTrade);
        socket.emit('tradePendingNotice', `Teklif (${amount}₺) ${seller.name} oyuncusuna iletildi, yanıt bekleniyor...`);
    });

    socket.on('respondTradeOffer', (accepted) => {
        if (!monoState.activeTrade || socket.id !== monoState.activeTrade.sellerId) return;

        const trade = monoState.activeTrade;
        const buyer = monoState.players.find(p => p.id === trade.buyerId);
        const seller = monoState.players.find(p => p.id === trade.sellerId);
        const tile = monoState.board.find(t => t.id === trade.tileId);

        if (accepted) {
            if (buyer.money >= trade.offerAmount && tile.owner === seller.id) {
                buyer.money -= trade.offerAmount;
                seller.money += trade.offerAmount;
                tile.owner = buyer.id;
                tile.ownerName = buyer.name;

                broadcastMonoLog(`🤝 ANLAŞMA SAĞLANDI! ${buyer.name}, ${seller.name}'den ${tile.name} tapusunu ${trade.offerAmount}₺ bedelle pazarlıkla satın aldı!`);
                io.emit('monopolyStateUpdated', monoState);

                checkHalısahaWin(buyer.id, buyer.name);
            } else {
                io.to(buyer.id).emit('errorMsg', 'Teklif anında bakiye yetersiz kaldı!');
            }
        } else {
            broadcastMonoLog(`❌ ${seller.name}, ${buyer.name}'in ${tile.name} için yaptığı ${trade.offerAmount}₺ teklifini reddetti.`);
            io.to(buyer.id).emit('errorMsg', `${seller.name} teklifini kabul etmedi.`);
            io.emit('monopolyStateUpdated', monoState);
        }

        monoState.activeTrade = null;
    });

    function postTileAction(isDouble) {
        if (isDouble && !monoState.players[monoState.turnIndex].bankrupt && !monoState.players[monoState.turnIndex].inJail) {
            broadcastMonoLog(`🎲 Çift attığın için tekrar zar atabilirsin!`);
        } else {
            finishTurn();
        }
        io.emit('monopolyStateUpdated', monoState);
    }

    function finishTurn() {
        monoState.doubleRollCount = 0;
        monoState.waitingForDecision = false;
        monoState.waitingForDoblo = false;
        nextMonopolyTurn();
    }

    function checkBankruptcy(player) {
        if (player.money < 0) {
            player.bankrupt = true;
            broadcastMonoLog(`💀 ${player.name} İFLAS ETTİ ve elendi!`);
            monoState.board.forEach(t => {
                if (t.owner === player.id) {
                    delete t.owner;
                    delete t.ownerName;
                }
            });
        }
    }

    function nextMonopolyTurn() {
        let attempts = 0;
        do {
            monoState.turnIndex = (monoState.turnIndex + 1) % monoState.players.length;
            attempts++;
        } while (monoState.players[monoState.turnIndex].bankrupt && attempts < monoState.players.length);

        const activePlayers = monoState.players.filter(p => !p.bankrupt);
        if (activePlayers.length <= 1) {
            monoState.active = false;
            broadcastMonoLog(`👑 KAZANAN: ${activePlayers[0].name}!`);
        }
    }

    // ==========================================
    // TABU MOTORU
    // ==========================================
    socket.on('switchTabuTeam', (newTeam) => {
        const player = players.find(p => p.id === socket.id);
        if (player && (newTeam === 'red' || newTeam === 'blue')) {
            player.team = newTeam;
            player.ready = false;
            io.emit('updateTabuLobby', { players, tabuState });
        }
    });

    socket.on('startTabuGame', (selectedMaxRounds) => {
        const redTeam = players.filter(p => p.team === 'red');
        const blueTeam = players.filter(p => p.team === 'blue');
        if (redTeam.length === 0 || blueTeam.length === 0) return socket.emit('errorMsg', 'Her takımda en az 1 oyuncu olmalı!');
        if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmadan oyun başlamaz!');

        currentTabuDeck = shuffleArray(rawTabuKartlari);
        let r = parseInt(selectedMaxRounds) || 5;
        tabuState.scores = { red: 0, blue: 0 };
        tabuState.currentTeam = 'red';
        tabuState.maxRounds = r;
        tabuState.currentRound = 1;
        tabuState.teamTurnCount = 0;

        triggerTabuIntermission();
    });

    function triggerTabuIntermission() {
        const teamPlayers = players.filter(p => p.team === tabuState.currentTeam);
        const describer = teamPlayers[Math.floor(Math.random() * teamPlayers.length)];

        tabuState.describerId = describer.id;
        tabuState.roundActive = false;
        tabuState.isIntermission = true;

        let prepTime = 10;
        io.emit('tabuIntermissionStart', {
            team: tabuState.currentTeam,
            describerName: describer.name,
            describerId: describer.id,
            prepTime: prepTime,
            currentRound: tabuState.currentRound,
            maxRounds: tabuState.maxRounds,
            scores: tabuState.scores
        });

        if (tabuState.intermissionTimer) clearInterval(tabuState.intermissionTimer);
        tabuState.intermissionTimer = setInterval(() => {
            prepTime--;
            io.emit('tabuIntermissionTick', prepTime);

            if (prepTime <= 0) {
                clearInterval(tabuState.intermissionTimer);
                tabuState.isIntermission = false;
                startTabuActualRound(describer);
            }
        }, 1000);
    }

    function startTabuActualRound(describer) {
        if (currentTabuDeck.length === 0) currentTabuDeck = shuffleArray(rawTabuKartlari);
        const card = currentTabuDeck.pop();

        tabuState.currentCard = card;
        tabuState.timeLeft = 60;
        tabuState.passCount = 3;
        tabuState.roundActive = true;

        players.forEach(p => {
            const isDescriber = p.id === describer.id;
            const isPlayingTeam = p.team === tabuState.currentTeam;
            io.to(p.id).emit('tabuTurnStarted', {
                describerId: describer.id,
                describerName: describer.name,
                currentTeam: tabuState.currentTeam,
                card: isDescriber ? card : null,
                scores: tabuState.scores,
                passCount: tabuState.passCount,
                currentRound: tabuState.currentRound,
                maxRounds: tabuState.maxRounds,
                role: isDescriber ? 'describer' : (isPlayingTeam ? 'guesser' : 'opponent')
            });
        });

        if (tabuState.timer) clearInterval(tabuState.timer);
        tabuState.timer = setInterval(() => {
            tabuState.timeLeft--;
            io.emit('tabuTimer', tabuState.timeLeft);
            if (tabuState.timeLeft <= 0) {
                clearInterval(tabuState.timer);
                endTabuTurn();
            }
        }, 1000);
    }

    function endTabuTurn() {
        tabuState.roundActive = false;
        tabuState.teamTurnCount++;
        if (tabuState.teamTurnCount % 2 === 0) tabuState.currentRound++;

        if (tabuState.currentRound > tabuState.maxRounds) {
            let winnerTeam = 'BERABERE';
            if (tabuState.scores.red > tabuState.scores.blue) winnerTeam = 'KIRMIZI';
            else if (tabuState.scores.blue > tabuState.scores.red) winnerTeam = 'MAVİ';
            io.emit('tabuMatchOver', { scores: tabuState.scores, winner: winnerTeam, maxRounds: tabuState.maxRounds });
        } else {
            tabuState.currentTeam = tabuState.currentTeam === 'red' ? 'blue' : 'red';
            io.emit('tabuTurnEnded', {
                scores: tabuState.scores,
                nextTeam: tabuState.currentTeam,
                currentRound: tabuState.currentRound,
                maxRounds: tabuState.maxRounds
            });
        }
    }

    socket.on('tabuNextTurn', () => {
        if (!tabuState.roundActive && !tabuState.isIntermission) {
            triggerTabuIntermission();
        }
    });

    socket.on('tabuAction', (action) => {
        if (!tabuState.roundActive || socket.id !== tabuState.describerId) return;
        if (action === 'correct') tabuState.scores[tabuState.currentTeam] += 1;
        else if (action === 'taboo') tabuState.scores[tabuState.currentTeam] -= 1;
        else if (action === 'pass') {
            if (tabuState.passCount <= 0) return socket.emit('errorMsg', 'Pas kalmadı!');
            tabuState.passCount -= 1;
        }

        if (currentTabuDeck.length === 0) currentTabuDeck = shuffleArray(rawTabuKartlari);
        tabuState.currentCard = currentTabuDeck.pop();

        io.emit('tabuScoreUpdated', { scores: tabuState.scores, passCount: tabuState.passCount });
        io.to(tabuState.describerId).emit('tabuNewCardForDescriber', tabuState.currentCard);
    });

    // ==========================================
    // İMPOSTER
    // ==========================================
    socket.on('startImposter', () => {
        if (players.length < 3) return socket.emit('errorMsg', 'En az 3 oyuncu gerekir!');
        if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmadan oyun başlamaz!');
        if (imposterState.timer) clearInterval(imposterState.timer);

        currentImposterDeck = shuffleArray(rawImposterKelimeler);
        const secilen = currentImposterDeck[Math.floor(Math.random() * currentImposterDeck.length)];
        const imposter = players[Math.floor(Math.random() * players.length)];

        imposterState = {
            word: secilen.kelime.trim().toUpperCase('tr-TR'),
            imposterId: imposter.id,
            imposterName: imposter.name,
            votes: {},
            timer: null
        };

        players.forEach(p => {
            if (p.id === imposter.id) {
                io.to(p.id).emit('imposterRole', { isImposter: true, info: `Sen IMPOSTER'sın! İpucun: "${secilen.ipucu}"` });
            } else {
                io.to(p.id).emit('imposterRole', { isImposter: false, info: `Gizli Kelime: "${secilen.kelime}"` });
            }
        });

        let timeLeft = 30;
        io.emit('imposterTimer', timeLeft);
        imposterState.timer = setInterval(() => {
            timeLeft--;
            io.emit('imposterTimer', timeLeft);
            if (timeLeft <= 0) {
                clearInterval(imposterState.timer);
                io.emit('imposterStartVoting', players);
            }
        }, 1000);
    });

    socket.on('imposterVote', (votedId) => {
        imposterState.votes[socket.id] = votedId;
        if (Object.keys(imposterState.votes).length === players.length) {
            const counts = {};
            Object.values(imposterState.votes).forEach(id => counts[id] = (counts[id] || 0) + 1);
            let mostVoted = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
            const votedP = players.find(p => p.id === mostVoted);

            if (mostVoted === imposterState.imposterId) {
                io.to(imposterState.imposterId).emit('imposterLastChance');
                players.forEach(p => {
                    if (p.id !== imposterState.imposterId) io.to(p.id).emit('imposterWaitGuess', votedP ? votedP.name : '');
                });
            } else {
                io.emit('imposterResult', {
                    winner: 'IMPOSTER',
                    msg: `Yanlış kişi (${votedP ? votedP.name : 'Kimse'}) seçildi!`,
                    imposterName: imposterState.imposterName,
                    word: imposterState.word
                });
            }
        }
    });

    socket.on('imposterGuess', (guess) => {
        const correct = guess.trim().toUpperCase('tr-TR') === imposterState.word;
        io.emit('imposterResult', {
            winner: correct ? 'IMPOSTER' : 'CIVILIANS',
            msg: correct ? `İmposter bildi! ("${guess}")` : `İmposter bilemedi! ("${guess}")`,
            imposterName: imposterState.imposterName,
            word: imposterState.word
        });
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        delete raceState.cars[socket.id];
        io.emit('updateLobby', { players, currentGame });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif!`);
});