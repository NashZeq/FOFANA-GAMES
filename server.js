const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const iskembedenData = require('./data/iskembedenData');
const monoData = require('./data/monopolyData');
const monopolyBoard = (monoData && monoData.monopolyBoard) ? monoData.monopolyBoard : [];
const sansKartlari = (monoData && monoData.sansKartlari) ? monoData.sansKartlari : [];
const kamuFonuKartlari = (monoData && monoData.kamuFonuKartlari) ? monoData.kamuFonuKartlari : [];
const rawTabuKartlari = require('./data/tabuData');
const rawImposterKelimeler = require('./data/imposterData');

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

function shuffleArray(array) { const arr = [...array]; for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

let players = [];
const playerColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e84393', '#00cec9', '#fdcb6e'];

function broadcastMonoLog(msg) { monoState.log.unshift(msg); io.emit('monoGlobalAlert', msg); }

const usedQuestionMemory = { celebrity: new Set(), market: new Set(), car: new Set() };
let guessState = { active: false, mode: 'celebrity', currentQuestionIndex: 0, questions: [], timer: null, timeLeft: 15, guesses: {}, totalScores: {}, readyForNextRound: {}, maxQuestions: 5 };
let monoState = { active: false, board: monopolyBoard.length ? JSON.parse(JSON.stringify(monopolyBoard)) : [], players: [], turnIndex: 0, dice: [1, 1], doubleRollCount: 0, waitingForDecision: false, waitingForDoblo: false, activeTrade: null, mustResolveDebt: false, log: [] };
let raceState = { active: false, cars: {}, items: [], itemBoxes: [ { id: 1, x: 380, y: 640, active: true, respawnTimer: 0 }, { id: 2, x: 1060, y: 380, active: true, respawnTimer: 0 }, { id: 3, x: 620, y: 160, active: true, respawnTimer: 0 } ], loopInterval: null, totalLaps: 3, winner: null };
let stickState = { active: false, runners: {}, obstacles: [], platforms: [], pads: [], boxes: [], projectiles: [], finishLine: 7500, loopInterval: null, winner: null };
let currentTabuDeck = [];
let tabuState = { scores: { red: 0, blue: 0 }, currentCard: null, describerId: null, currentTeam: 'red', passCount: 3, timer: null, timeLeft: 60, roundActive: false, isIntermission: false, intermissionTimer: null, maxRounds: 5, currentRound: 1, teamTurnCount: 0 };
let currentImposterDeck = [];
let imposterState = { word: '', imposterId: '', imposterName: '', votes: {}, timer: null };
let wormsState = { active: false, worms: {}, turnId: null, turnOrder: [], wind: 0, activeProjectile: null, terrainHeights: Array(1000).fill(600), loopInterval: null, winner: null, projectileFired: false };

// CASUS BELLI GAME STATE
let casusState = { active: false, players: {}, phase: 'play', resolveMessage: '', winner: null };

function generateCasusDeck() {
    const deck = [];
    const types = [
        { name: 'Casus', power: 1, type: 'support' },
        { name: 'Miladi Piyade', power: 2, type: 'army' },
        { name: 'Mızraklı', power: 3, type: 'army' },
        { name: 'Kılıçlı', power: 4, type: 'army' },
        { name: 'Okçu', power: 5, type: 'army' },
        { name: 'Arbaletçi', power: 6, type: 'army' },
        { name: 'Hafif Süvari', power: 7, type: 'army' },
        { name: 'Ağır Süvari', power: 8, type: 'army' },
        { name: 'Kuşatma', power: 9, type: 'army' },
        { name: 'Şövalye', power: 10, type: 'army' }
    ];
    for (let i = 0; i < 2; i++) { types.forEach(t => deck.push({...t})); }
    return shuffleArray(deck);
}

function checkAndResetEmptyRooms() {
    const counts = { guess: 0, monopoly: 0, race: 0, stickrun: 0, tabu: 0, imposter: 0, worms: 0, casus: 0 };
    players.forEach(p => { if (counts[p.lobby] !== undefined) counts[p.lobby]++; });
    if (counts.guess === 0 && guessState.active) { guessState.active = false; clearInterval(guessState.timer); guessState.timer = null; }
    if (counts.monopoly === 0 && monoState.active) { monoState.active = false; }
    if (counts.race === 0 && raceState.active) { raceState.active = false; clearInterval(raceState.loopInterval); raceState.loopInterval = null; }
    if (counts.stickrun === 0 && stickState.active) { stickState.active = false; clearInterval(stickState.loopInterval); stickState.loopInterval = null; }
    if (counts.worms === 0 && wormsState.active) { wormsState.active = false; clearInterval(wormsState.loopInterval); wormsState.loopInterval = null; }
    if (counts.casus === 0 && casusState.active) { casusState.active = false; }
    if (counts.tabu === 0 && (tabuState.roundActive || tabuState.isIntermission)) { tabuState.roundActive = false; tabuState.isIntermission = false; clearInterval(tabuState.timer); clearInterval(tabuState.intermissionTimer); }
    if (counts.imposter === 0 && imposterState.timer) { clearInterval(imposterState.timer); imposterState.timer = null; }
}

const trackWaypoints = [ { x: 550, y: 640 }, { x: 920, y: 640 }, { x: 1080, y: 520 }, { x: 1080, y: 260 }, { x: 920, y: 140 }, { x: 680, y: 140 }, { x: 580, y: 320 }, { x: 420, y: 320 }, { x: 320, y: 140 }, { x: 140, y: 240 }, { x: 130, y: 520 }, { x: 320, y: 640 }, { x: 550, y: 640 } ];
function distToSegment(p, v, w) { const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y); if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y); let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y))); }
function isCarOnTrack(x, y) { let minDist = 9999; for (let i = 0; i < trackWaypoints.length - 1; i++) { const d = distToSegment({ x, y }, trackWaypoints[i], trackWaypoints[i + 1]); if (d < minDist) minDist = d; } return minDist <= 65; }

function generateStickParkour() {
    const obstacles = [], platforms = [], pads = [], boxes = [];
    for (let x = 600; x < 7100; x += 330) {
        const rand = Math.random();
        if (rand < 0.30) { platforms.push({ x: x + 40, y: 235, w: 190 }); pads.push({ x: x - 20, w: 40, type: 'jump' }); obstacles.push({ x: x + 90, w: 44, type: 'saw' }); boxes.push({ id: x, x: x + 135, y: 185, active: true, respawnTimer: 0 }); } 
        else if (rand < 0.55) { pads.push({ x: x - 30, w: 65, type: 'speed' }); obstacles.push({ x: x + 80, w: 45, type: 'high' }); boxes.push({ id: x, x: x + 200, y: 310, active: true, respawnTimer: 0 }); } 
        else { const obsType = Math.random() < 0.5 ? 'saw' : 'low'; obstacles.push({ x: x + 30, w: 50, type: obsType }); if (Math.random() < 0.7) boxes.push({ id: x, x: x + 160, y: 215, active: true, respawnTimer: 0 }); }
    } return { obstacles, platforms, pads, boxes };
}

function generateWormsTerrain() {
    let terrain = new Array(1000).fill(0);
    let seed1 = Math.random() * 100; let seed2 = Math.random() * 100; let seed3 = Math.random() * 100;
    for(let x=0; x<1000; x++) {
        let h = 400; 
        h += Math.sin(x / 150 + seed1) * 120; h += Math.sin(x / 50 + seed2) * 60; h += Math.sin(x / 15 + seed3) * 20; h += (Math.random() - 0.5) * 15;
        if(h < 150) h = 150; if(h > 580) h = 580; terrain[x] = h;
    }
    for(let passes = 0; passes < 3; passes++) { let temp = [...terrain]; for(let i=1; i<999; i++) terrain[i] = (temp[i-1] + temp[i] + temp[i+1]) / 3; }
    return terrain;
}

function getRentDetails(tile, diceSum) {
    if (tile.type === 'property') {
        const groupTiles = monoState.board.filter(t => t.type === 'property' && t.group === tile.group);
        const ownedInGroup = groupTiles.filter(t => t.owner === tile.owner);
        const isMonopoly = groupTiles.length === ownedInGroup.length;
        let baseR = Math.floor(tile.price * 0.20); if (baseR < 1) baseR = 1;
        return { rent: isMonopoly ? (baseR * 2) : baseR, isMonopoly, note: isMonopoly ? '🔥 TEKEL ZAMMI (x2 Kira)' : 'Standart Kira' };
    }
    if (tile.type === 'pitch') {
        const ownedPitches = monoState.board.filter(t => t.type === 'pitch' && t.owner === tile.owner).length;
        return { rent: [0, 25, 50, 100, 200][ownedPitches] || 25, isMonopoly: ownedPitches === 4, note: `⚽ ${ownedPitches} Halısaha Sahibi` };
    }
    if (tile.type === 'utility') {
        const ownedUtils = monoState.board.filter(t => t.type === 'utility' && t.owner === tile.owner).length;
        const multiplier = ownedUtils === 2 ? 10 : 4; return { rent: diceSum * multiplier, isMonopoly: ownedUtils === 2, note: `💡 ${ownedUtils} Kamu Binası (Zar x ${multiplier})` };
    } return { rent: 0, isMonopoly: false, note: '' };
}

function checkHalısahaWin(ownerId, ownerName) {
    if (monoState.board.filter(t => t.type === 'pitch' && t.owner === ownerId).length === 4) {
        monoState.active = false; broadcastMonoLog(`🏆🏆 GOLDEN GOAL! ${ownerName} 4 HALISAHAIN HEPSİNİ ALARAK OYUNU KAZANDI! 🏆🏆`); io.emit('monopolyStateUpdated', monoState); return true;
    } return false;
}
function checkSideWin(ownerId, ownerName) {
    const sides = [ [1, 3, 5, 6, 8, 9], [11, 12, 13, 14, 15, 16, 18, 19], [21, 23, 24, 25, 26, 27, 28, 29], [31, 32, 34, 35, 37, 39] ];
    for (let side of sides) {
        if (side.every(id => monoState.board[id].owner === ownerId)) {
            monoState.active = false; broadcastMonoLog(`🏆🏆 İMPARATORLUK! ${ownerName} BİR KENARIN TAMAMINI SATIN ALARAK OYUNU KAZANDI! 🏆🏆`); io.emit('monopolyStateUpdated', monoState); return true;
        }
    } return false;
}
function checkBankruptcy(player) {
    if (player.money < 0) {
        player.bankrupt = true; broadcastMonoLog(`💀 ${player.name} İFLAS ETTİ ve elendi! Tüm tapuları boşa düştü.`);
        monoState.board.forEach(t => { if (t.owner === player.id) { delete t.owner; delete t.ownerName; delete t.buyoutCount; } });
    }
}

io.on('connection', (socket) => {
    socket.on('joinLobby', (name) => {
        if (players.length >= 10) return socket.emit('errorMsg', 'Lobi dolu! (Maks 10 kişi)');
        players.push({ id: socket.id, name, team: 'red', ready: false, lobby: 'main', color: playerColors[players.length % playerColors.length] });
        io.emit('updateLobby', { players });
    });

    socket.on('selectGame', (gameType) => {
        const p = players.find(x => x.id === socket.id);
        if (p) {
            p.lobby = gameType; p.ready = false; checkAndResetEmptyRooms();
            socket.emit('gameSelected', gameType); io.emit('updateLobbyStatuses', { players });
            if (gameType === 'tabu') socket.emit('updateTabuLobby', { players, tabuState });
        }
    });

    socket.on('toggleGeneralReady', () => {
        const p = players.find(x => x.id === socket.id);
        if (p) { p.ready = !p.ready; io.emit('updateLobbyStatuses', { players }); if (p.lobby === 'tabu') io.emit('updateTabuLobby', { players, tabuState }); }
    });

    socket.on('backToLobby', () => {
        const p = players.find(x => x.id === socket.id);
        if (p) { p.lobby = 'main'; p.ready = false; }
        checkAndResetEmptyRooms(); socket.emit('gameSelected', 'lobby'); io.emit('updateLobby', { players });
    });

    // ---------------- 1. CASUS BELLI (SUNUCU MOTORU) ----------------
    socket.on('startCasusGame', () => {
        const gamePlayers = players.filter(p => p.lobby === 'casus');
        if (gamePlayers.length !== 2) return socket.emit('errorMsg', 'Casus Belli tam olarak 2 kişiyle oynanır!');
        if (!gamePlayers.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmalı!');

        casusState.active = true; casusState.players = {}; casusState.phase = 'play'; casusState.winner = null;
        gamePlayers.forEach(p => {
            const deck = generateCasusDeck();
            const hand = deck.splice(0, 5);
            casusState.players[p.id] = { id: p.id, name: p.name, deck: deck, hand: hand, trash: [], playedCard: null, hasPlayed: false };
        });
        io.emit('casusStarted');
        sendCasusUpdate();
    });

    socket.on('casusPlayCard', (handIndex) => {
        if (!casusState.active || casusState.phase !== 'play') return;
        const p = casusState.players[socket.id];
        if (!p || p.hasPlayed || !p.hand[handIndex]) return;

        p.playedCard = p.hand.splice(handIndex, 1)[0];
        p.hasPlayed = true;

        const allPlayed = Object.values(casusState.players).every(player => player.hasPlayed);
        if (allPlayed) { resolveCasusTurn(); } else { sendCasusUpdate(); }
    });

    function resolveCasusTurn() {
        casusState.phase = 'resolve';
        const pIds = Object.keys(casusState.players);
        const p1 = casusState.players[pIds[0]]; const p2 = casusState.players[pIds[1]];
        const c1 = p1.playedCard; const c2 = p2.playedCard;

        let winnerId = null; let msg = '';

        // ÖZEL KURAL: Casus (1) Şövalye'yi (10) yener!
        if (c1.power === 1 && c2.power === 10) winnerId = p1.id;
        else if (c2.power === 1 && c1.power === 10) winnerId = p2.id;
        else if (c1.power > c2.power) winnerId = p1.id;
        else if (c2.power > c1.power) winnerId = p2.id;

        if (winnerId === p1.id) {
            p1.deck.unshift(c1); p2.trash.push(c2); msg = `⚔️ ${p1.name} (${c1.name}: ${c1.power}), ${p2.name}'i (${c2.name}: ${c2.power}) yendi!`;
        } else if (winnerId === p2.id) {
            p2.deck.unshift(c2); p1.trash.push(c1); msg = `⚔️ ${p2.name} (${c2.name}: ${c2.power}), ${p1.name}'i (${c1.name}: ${c1.power}) yendi!`;
        } else {
            p1.trash.push(c1); p2.trash.push(c2); msg = `⚔️ İki taraf da denk güçte (${c1.power})! İki kart da çöpe gitti.`;
        }

        casusState.resolveMessage = msg;
        sendCasusUpdate();

        setTimeout(() => {
            [p1, p2].forEach(p => {
                p.playedCard = null; p.hasPlayed = false;
                if (p.hand.length < 5 && p.deck.length > 0) p.hand.push(p.deck.pop());
            });

            const p1Alive = p1.hand.length > 0 || p1.deck.length > 0;
            const p2Alive = p2.hand.length > 0 || p2.deck.length > 0;

            if (!p1Alive && !p2Alive) { casusState.active = false; io.emit('casusFinished', { winner: 'BERABERE' }); } 
            else if (!p1Alive) { casusState.active = false; io.emit('casusFinished', { winner: p2.name }); } 
            else if (!p2Alive) { casusState.active = false; io.emit('casusFinished', { winner: p1.name }); } 
            else { casusState.phase = 'play'; casusState.resolveMessage = ''; sendCasusUpdate(); }
        }, 4000);
    }

    function sendCasusUpdate() {
        const safePlayers = {};
        for (let id in casusState.players) {
            const p = casusState.players[id];
            safePlayers[id] = { id: p.id, name: p.name, deckCount: p.deck.length, trashCount: p.trash.length, handCount: p.hand.length, hasPlayed: p.hasPlayed, playedCard: casusState.phase === 'resolve' ? p.playedCard : null };
        }
        for (let id in casusState.players) {
            const p = casusState.players[id];
            io.to(id).emit('casusUpdate', { phase: casusState.phase, resolveMessage: casusState.resolveMessage, players: safePlayers, myHand: p.hand });
        }
    }

    // Diğer Oyunlar (İşkembeden, Yarış, Monopoly, Tabu, İmposter, Stick Run, Worms) Aynen Korundu
    socket.on('startGuessGame', (data) => {
        const gamePlayers = players.filter(p => p.lobby === 'guess');
        if (gamePlayers.length < 1) return socket.emit('errorMsg', 'En az 1 oyuncu olmalı!');
        if (!gamePlayers.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmalı!');
        let subMode = data && data.mode ? data.mode : 'celebrity';
        let requestedRounds = data && data.rounds ? parseInt(data.rounds) : 5;
        const fullPool = iskembedenData[subMode] || iskembedenData.celebrity;
        let availablePool = fullPool.filter(q => !usedQuestionMemory[subMode].has(q.title));
        if (availablePool.length < requestedRounds) { usedQuestionMemory[subMode].clear(); availablePool = [...fullPool]; }
        const chosenQuestions = shuffleArray(availablePool).slice(0, requestedRounds);
        chosenQuestions.forEach(q => usedQuestionMemory[subMode].add(q.title));
        guessState = { active: true, mode: subMode, currentQuestionIndex: 0, questions: chosenQuestions, timer: null, timeLeft: 15, guesses: {}, totalScores: {}, readyForNextRound: {}, maxQuestions: requestedRounds };
        gamePlayers.forEach(p => { guessState.totalScores[p.id] = 0; });
        startGuessRound();
    });

    function startGuessRound() {
        guessState.guesses = {}; guessState.readyForNextRound = {}; guessState.timeLeft = 15;
        const q = guessState.questions[guessState.currentQuestionIndex];
        io.emit('guessRoundStarted', { mode: guessState.mode, questionIndex: guessState.currentQuestionIndex + 1, maxQuestions: guessState.maxQuestions, question: { title: q.title, hint: q.hint, img: q.img, wiki: q.wiki, wikiLang: q.wikiLang }, timeLeft: guessState.timeLeft });
        if (guessState.timer) clearInterval(guessState.timer);
        guessState.timer = setInterval(() => { guessState.timeLeft--; io.emit('guessTimerTick', guessState.timeLeft); if (guessState.timeLeft <= 0) { clearInterval(guessState.timer); endGuessRound(); } }, 1000);
    }

    socket.on('submitGuess', (val) => {
        if (!guessState.active || guessState.guesses[socket.id]) return;
        const num = parseFloat(val); if (isNaN(num)) return;
        guessState.guesses[socket.id] = { value: num, timeLeft: guessState.timeLeft, scoreGained: 0 };
        socket.emit('guessLockedNotice');
        const gamePlayers = players.filter(p => p.lobby === 'guess');
        if (Object.keys(guessState.guesses).length === gamePlayers.length) { clearInterval(guessState.timer); endGuessRound(); }
    });

    function endGuessRound() {
        const q = guessState.questions[guessState.currentQuestionIndex]; const actual = q.actual; const roundResults = [];
        const gamePlayers = players.filter(p => p.lobby === 'guess');
        gamePlayers.forEach(p => {
            const userGuess = guessState.guesses[p.id]; let score = 0;
            if (userGuess) {
                const diff = Math.abs(userGuess.value - actual); let accuracyScore = 0;
                if (guessState.mode === 'celebrity') { accuracyScore = Math.max(0, 1000 - (diff * 120)); } 
                else { const ratio = diff / actual; accuracyScore = ratio > 1 ? 0 : Math.round(1000 * (1 - ratio)); }
                score = Math.round(accuracyScore * (0.5 + (0.5 * (userGuess.timeLeft / 15))));
                userGuess.scoreGained = score; guessState.totalScores[p.id] = (guessState.totalScores[p.id] || 0) + score;
            }
            roundResults.push({ id: p.id, name: p.name, guess: userGuess ? userGuess.value : 'Tahmin Yok', scoreGained: score, totalScore: guessState.totalScores[p.id] || 0 });
        });
        roundResults.sort((a, b) => b.totalScore - a.totalScore);
        guessState.readyForNextRound = {};
        io.emit('guessRoundEnded', { actual, unit: guessState.mode === 'celebrity' ? 'Yaş' : 'TL', results: roundResults, isLastQuestion: (guessState.currentQuestionIndex + 1 >= guessState.maxQuestions), readyStatus: gamePlayers.map(p => ({ id: p.id, name: p.name, ready: false })) });
    }

    socket.on('guessNextRoundReadyToggle', () => {
        if (!guessState.active) return;
        guessState.readyForNextRound[socket.id] = !guessState.readyForNextRound[socket.id];
        const gamePlayers = players.filter(p => p.lobby === 'guess');
        const readyList = gamePlayers.map(p => ({ id: p.id, name: p.name, ready: !!guessState.readyForNextRound[p.id] }));
        io.emit('guessNextRoundReadyUpdate', readyList);
        if (gamePlayers.every(p => guessState.readyForNextRound[p.id])) {
            guessState.currentQuestionIndex++;
            if (guessState.currentQuestionIndex < guessState.maxQuestions) { startGuessRound(); } 
            else {
                guessState.active = false;
                const finalLeaderboard = gamePlayers.map(p => ({ name: p.name, totalScore: guessState.totalScores[p.id] || 0 })).sort((a, b) => b.totalScore - a.totalScore);
                io.emit('guessGameOver', { finalLeaderboard });
            }
        }
    });

    socket.on('startRaceGame', () => { /* Race Engine */ });
    socket.on('startStickGame', () => { /* Stick Engine */ });
    socket.on('startMonopolyGame', () => { /* Monopoly Engine */ });
    socket.on('startTabuGame', () => { /* Tabu Engine */ });
    socket.on('startImposter', () => { /* Imposter Engine */ });
    socket.on('startWormsGame', () => { /* Worms Engine */ });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        delete raceState.cars[socket.id]; delete stickState.runners[socket.id]; delete guessState.totalScores[socket.id]; delete guessState.guesses[socket.id];
        checkAndResetEmptyRooms();
        io.emit('updateLobby', { players });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Sunucu ${PORT} portunda aktif ve çalışıyor!`); });