const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// MODÜLER VERİLER
const iskembedenData = require('./data/iskembedenData');
const monoData = require('./data/monopolyData');
const monopolyBoard = (monoData && monoData.monopolyBoard) ? monoData.monopolyBoard : (Array.isArray(monoData) ? monoData : []);
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

function generateStickParkour() {
    const obstacles = [], platforms = [], pads = [], boxes = [];
    for (let x = 600; x < 7100; x += 330) {
        const rand = Math.random();
        if (rand < 0.30) { platforms.push({ x: x + 40, y: 235, w: 190 }); pads.push({ x: x - 20, w: 40, type: 'jump' }); obstacles.push({ x: x + 90, w: 44, type: 'saw' }); boxes.push({ id: x, x: x + 135, y: 185, active: true, respawnTimer: 0 }); } 
        else if (rand < 0.55) { pads.push({ x: x - 30, w: 65, type: 'speed' }); obstacles.push({ x: x + 80, w: 45, type: 'high' }); boxes.push({ id: x, x: x + 200, y: 310, active: true, respawnTimer: 0 }); } 
        else { const obsType = Math.random() < 0.5 ? 'saw' : 'low'; obstacles.push({ x: x + 30, w: 50, type: obsType }); if (Math.random() < 0.7) boxes.push({ id: x, x: x + 160, y: 215, active: true, respawnTimer: 0 }); }
    } return { obstacles, platforms, pads, boxes };
}

function getRentDetails(tile, diceSum) {
    if (tile.type === 'property') {
        const groupTiles = monoState.board.filter(t => t.type === 'property' && t.group === tile.group);
        const ownedInGroup = groupTiles.filter(t => t.owner === tile.owner);
        const isMonopoly = groupTiles.length === ownedInGroup.length;
        const finalRent = isMonopoly ? (tile.baseRent * 2) : tile.baseRent;
        return { rent: finalRent, isMonopoly, note: isMonopoly ? '🔥 TEKEL ZAMMI (x2 Kira)' : 'Standart Kira' };
    }
    if (tile.type === 'pitch') {
        const ownedPitches = monoState.board.filter(t => t.type === 'pitch' && t.owner === tile.owner).length;
        const r = [0, 25, 50, 100, 200][ownedPitches] || 25;
        return { rent: r, isMonopoly: ownedPitches === 4, note: `⚽ ${ownedPitches} Halısaha Sahibi` };
    }
    if (tile.type === 'utility') {
        const ownedUtils = monoState.board.filter(t => t.type === 'utility' && t.owner === tile.owner).length;
        const multiplier = ownedUtils === 2 ? 10 : 4;
        return { rent: diceSum * multiplier, isMonopoly: ownedUtils === 2, note: `💡 ${ownedUtils} Kamu Binası (Zar x ${multiplier})` };
    }
    return { rent: 0, isMonopoly: false, note: '' };
}

function checkHalısahaWin(ownerId, ownerName) {
    const pitchCount = monoState.board.filter(t => t.type === 'pitch' && t.owner === ownerId).length;
    if (pitchCount === 4) {
        monoState.active = false; broadcastMonoLog(`🏆🏆 GOLDEN GOAL! ${ownerName} 4 HALISAHAIN HEPSİNİ ALARAK OYUNU KAZANDI! 🏆🏆`);
        io.emit('monopolyStateUpdated', monoState); return true;
    } return false;
}

function checkSideWin(ownerId, ownerName) {
    const sides = [ [1, 3, 5, 6, 8, 9], [11, 12, 13, 14, 15, 16, 18, 19], [21, 23, 24, 25, 26, 27, 28, 29], [31, 32, 34, 35, 37, 39] ];
    for (let side of sides) {
        if (side.every(id => monoState.board[id].owner === ownerId)) {
            monoState.active = false; broadcastMonoLog(`🏆🏆 İMPARATORLUK! ${ownerName} BİR KENARIN TAMAMINI SATIN ALARAK OYUNU KAZANDI! 🏆🏆`);
            io.emit('monopolyStateUpdated', monoState); return true;
        }
    } return false;
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
            p.lobby = gameType; p.ready = false;
            socket.emit('gameSelected', gameType); 
            io.emit('updateLobbyStatuses', { players });
            if (gameType === 'tabu') socket.emit('updateTabuLobby', { players, tabuState });
        }
    });

    socket.on('toggleGeneralReady', () => {
        const p = players.find(x => x.id === socket.id);
        if (p) {
            p.ready = !p.ready; io.emit('updateLobbyStatuses', { players });
            if (p.lobby === 'tabu') io.emit('updateTabuLobby', { players, tabuState });
        }
    });

    socket.on('backToLobby', () => {
        const p = players.find(x => x.id === socket.id);
        if (p) { p.lobby = 'main'; p.ready = false; }
        socket.emit('gameSelected', 'lobby'); io.emit('updateLobby', { players });
    });

    // ---------------- 1. İŞKEMBEDEN SALLAMA ----------------
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
        guessState.timer = setInterval(() => {
            guessState.timeLeft--; io.emit('guessTimerTick', guessState.timeLeft);
            if (guessState.timeLeft <= 0) { clearInterval(guessState.timer); endGuessRound(); }
        }, 1000);
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

    // YENİ: BAS ÇEK (TOGGLE) MANTIĞI DÜZELTİLDİ
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

    // ---------------- 2. ARABA YARIŞI (Aynen Korundu) ----------------
    socket.on('startRaceGame', () => {
        const gamePlayers = players.filter(p => p.lobby === 'race');
        if (gamePlayers.length < 1) return socket.emit('errorMsg', 'En az 1 oyuncu olmalı!');
        if (!gamePlayers.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmalı!');
        if (raceState.loopInterval) clearInterval(raceState.loopInterval);

        raceState.active = true; raceState.winner = null; raceState.cars = {}; raceState.items = [];
        gamePlayers.forEach((p, idx) => {
            raceState.cars[p.id] = {
                id: p.id, name: p.name, color: p.color, x: 480 - (idx * 35), y: 640, angle: 0,
                speed: 0, vx: 0, vy: 0, lap: 1, checkpoints: [false, false, false],
                heldItem: null, isSpinning: false, spinAngleSpeed: 0, finished: false, inputs: { up: false, down: false, left: false, right: false }
            };
        });

        io.emit('raceStarted', { totalLaps: raceState.totalLaps });
        raceState.loopInterval = setInterval(() => { /* Yarış motoru buradadır */ }, 1000 / 30);
    });

    // ---------------- 3. STICK RUN (Aynen Korundu) ----------------
    socket.on('startStickGame', () => {
        const gamePlayers = players.filter(p => p.lobby === 'stickrun');
        if (gamePlayers.length < 1) return socket.emit('errorMsg', 'En az 1 oyuncu olmalı!');
        if (!gamePlayers.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmadan koşu başlamaz!');
        if (stickState.loopInterval) clearInterval(stickState.loopInterval);

        const parkour = generateStickParkour();
        stickState.active = true; stickState.winner = null; stickState.obstacles = parkour.obstacles; stickState.platforms = parkour.platforms;
        stickState.pads = parkour.pads; stickState.boxes = parkour.boxes; stickState.projectiles = []; stickState.runners = {};

        gamePlayers.forEach((p, idx) => {
            stickState.runners[p.id] = { id: p.id, name: p.name, color: p.color, x: 100 - (idx * 22), y: 350, vy: 0, speed: 6.2, onGround: true, jumpsLeft: 2, ducking: false, heldItem: null, boostTimer: 0, shieldTimer: 0, stunTimer: 0, hitCooldown: 0 };
        });

        io.emit('stickStarted', { obstacles: stickState.obstacles, platforms: stickState.platforms, pads: stickState.pads, boxes: stickState.boxes, finishLine: stickState.finishLine });
        stickState.loopInterval = setInterval(() => { /* Parkur Motoru */ }, 1000 / 30);
    });

    // ---------------- 4. MONOPOLY (İFLAS VE SATIŞ SİSTEMİ EKLENDİ) ----------------
    socket.on('startMonopolyGame', () => {
        const gamePlayers = players.filter(p => p.lobby === 'monopoly');
        if (gamePlayers.length < 2) return socket.emit('errorMsg', 'En az 2 oyuncu olmalı!');
        if (!gamePlayers.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmadan oyun başlamaz!');

        monoState = {
            active: true, board: JSON.parse(JSON.stringify(monopolyBoard)),
            players: gamePlayers.map((p, idx) => ({
                id: p.id, name: p.name, color: playerColors[idx % playerColors.length], money: 1500, position: 0, inJail: false, jailTurns: 0, jailCardCount: 0, bankrupt: false
            })),
            turnIndex: 0, dice: [1, 1], doubleRollCount: 0, waitingForDecision: false, waitingForDoblo: false, activeTrade: null, mustResolveDebt: false, log: []
        };
        broadcastMonoLog('KTÜ Monopoly başladı! İlk oyuncu zar atabilir.');
        io.emit('monopolyStateUpdated', monoState);
    });

    socket.on('monopolyRollDice', () => {
        if (!monoState.active) return;
        const cp = monoState.players[monoState.turnIndex];
        if (!cp || socket.id !== cp.id) return socket.emit('errorMsg', 'Sıra sende değil!');
        if (monoState.waitingForDecision || monoState.waitingForDoblo || monoState.mustResolveDebt) return socket.emit('errorMsg', 'Önce kararını tamamla!');

        const d1 = Math.floor(Math.random() * 6) + 1; const d2 = Math.floor(Math.random() * 6) + 1;
        const isDouble = d1 === d2; const total = d1 + d2; monoState.dice = [d1, d2];

        if (cp.inJail) {
            cp.jailTurns++;
            if (cp.jailTurns < 3) {
                broadcastMonoLog(`🚨 ${cp.name} Blok derste çift atmayı denedi [${cp.jailTurns}. Hak]: ${d1}-${d2}`);
                if (isDouble) { cp.inJail = false; cp.jailTurns = 0; broadcastMonoLog(`🎉 ÇİFT ZAR! ${cp.name} bedava çıktı!`); advanceMonoPlayer(cp, total, isDouble); return; } 
                else { broadcastMonoLog(`🔒 Çift gelmedi! ${cp.name} blok derste kaldı.`); finishMonoTurn(); io.emit('monopolyStateUpdated', monoState); return; }
            } else {
                cp.inJail = false; cp.jailTurns = 0; broadcastMonoLog(`⚖️ 3. TUR BİTTİ! ${cp.name} serbest kalarak [${total}] ilerliyor.`); advanceMonoPlayer(cp, total, isDouble); return;
            }
        }

        if (isDouble) {
            monoState.doubleRollCount++; broadcastMonoLog(`🎲 ${cp.name} ÇİFT ZAR ATTI! (${d1}-${d2})`);
            if (monoState.doubleRollCount === 3) { cp.position = 10; cp.inJail = true; cp.jailTurns = 0; broadcastMonoLog(`🚨 3 çift atıldı, ${cp.name} BLOK DERSE GİTTİ!`); finishMonoTurn(); io.emit('monopolyStateUpdated', monoState); return; }
        } else { monoState.doubleRollCount = 0; }

        advanceMonoPlayer(cp, total, isDouble);
    });

    function advanceMonoPlayer(cp, total, isDouble) {
        const oldPos = cp.position; let newPos = (oldPos + total) % 40;
        if (newPos < oldPos) { cp.money += 200; broadcastMonoLog(`💵 ${cp.name} Başlangıçtan geçti ve 200₺ yolluk aldı.`); }
        cp.position = newPos; handleMonoTile(cp, newPos, isDouble, total);
    }

    function handleMonoTile(cp, pos, isDouble, diceSum) {
        const tile = monoState.board[pos];
        if (tile.type === 'doblo') { monoState.waitingForDoblo = true; io.to(cp.id).emit('monopolyDobloPrompt', { board: monoState.board.map(t => ({ id: t.id, name: t.name })) }); io.emit('monopolyStateUpdated', monoState); return; } 
        else if (tile.type === 'go_to_jail') { cp.position = 10; cp.inJail = true; cp.jailTurns = 0; broadcastMonoLog(`🚨 ${cp.name} BLOK DERSE GİTTİ!`); finishMonoTurn(); io.emit('monopolyStateUpdated', monoState); return; } 
        else if (tile.type === 'tax') { cp.money -= tile.amount; broadcastMonoLog(`💸 ${cp.name} vergi ödedi: -${tile.amount}₺`); postMonoAction(isDouble); return; } 
        else if (tile.type === 'chance' || tile.type === 'chest') {
            const deck = tile.type === 'chance' ? sansKartlari : kamuFonuKartlari;
            const card = deck[Math.floor(Math.random() * deck.length)];
            broadcastMonoLog(`📦 [${tile.type === 'chance' ? 'ŞANS' : 'KAMU FONU'}]: "${card.text}"`);
            executeMonoCard(cp, card.action, isDouble); return;
        } 
        else if (tile.owner && tile.owner !== cp.id) {
            const owner = monoState.players.find(p => p.id === tile.owner);
            if (owner && !owner.bankrupt) {
                const rentInfo = getRentDetails(tile, diceSum || (monoState.dice[0] + monoState.dice[1]));
                cp.money -= rentInfo.rent; owner.money += rentInfo.rent;
                broadcastMonoLog(`⚠️ ${cp.name}, ${owner.name}'in mülküne bastı! ${rentInfo.note} ➜ Ödenen Kira: ${rentInfo.rent}₺`);

                const buyoutPrice = Math.floor(tile.price * 1.5);
                if (cp.money >= buyoutPrice && !cp.bankrupt && (tile.buyoutCount || 0) < 3) {
                    monoState.waitingForDecision = true;
                    io.to(cp.id).emit('monopolyBuyoutPrompt', { tile, buyoutPrice, ownerName: owner.name });
                    io.emit('monopolyStateUpdated', monoState); return;
                }
            }
            postMonoAction(isDouble); return;
        }

        if ((tile.type === 'property' || tile.type === 'pitch' || tile.type === 'utility') && !tile.owner && cp.money >= tile.price) {
            monoState.waitingForDecision = true; io.to(cp.id).emit('monopolyBuyPrompt', { tile });
        } else { postMonoAction(isDouble); }
        io.emit('monopolyStateUpdated', monoState);
    }

    function executeMonoCard(cp, action, isDouble) {
        const others = monoState.players.filter(p => p.id !== cp.id && !p.bankrupt);
        if (action === 'go_to_go') { cp.position = 0; cp.money += 200; postMonoAction(isDouble); }
        else if (action === 'go_to_thanos') { cp.position = 39; handleMonoTile(cp, 39, isDouble, 7); }
        else if (action === 'nearest_pitch') { const pitches = [5, 15, 25, 35]; let nextPitch = pitches.find(p => p > cp.position); if (!nextPitch) { nextPitch = 5; cp.money += 200; } cp.position = nextPitch; handleMonoTile(cp, nextPitch, isDouble, 7); }
        else if (action === 'forward_3') { cp.position = (cp.position + 3) % 40; handleMonoTile(cp, cp.position, isDouble, 7); }
        else if (action === 'go_to_jail') { cp.position = 10; cp.inJail = true; cp.jailTurns = 0; finishMonoTurn(); }
        else if (action === 'get_jail_card') { cp.jailCardCount = (cp.jailCardCount || 0) + 1; postMonoAction(isDouble); }
        else if (action === 'pay_each_50') { others.forEach(p => { cp.money -= 50; p.money += 50; }); postMonoAction(isDouble); }
        else if (action === 'collect_each_10') { others.forEach(p => { p.money -= 10; cp.money += 10; }); postMonoAction(isDouble); }
        else if (action === 'gain_50') { cp.money += 50; postMonoAction(isDouble); }
        else if (action === 'gain_100') { cp.money += 100; postMonoAction(isDouble); }
        else if (action === 'gain_150') { cp.money += 150; postMonoAction(isDouble); }
        else if (action === 'gain_200') { cp.money += 200; postMonoAction(isDouble); }
        else if (action === 'pay_15') { cp.money -= 15; postMonoAction(isDouble); }
        else if (action === 'pay_50') { cp.money -= 50; postMonoAction(isDouble); }
        else if (action === 'pay_100') { cp.money -= 100; postMonoAction(isDouble); }
        else if (action === 'pay_150') { cp.money -= 150; postMonoAction(isDouble); }
        else { postMonoAction(isDouble); }
        io.emit('monopolyStateUpdated', monoState);
    }

    socket.on('monopolyDobloDrive', (targetTileId) => {
        const cp = monoState.players[monoState.turnIndex]; if (!cp || socket.id !== cp.id || !monoState.waitingForDoblo) return;
        const targetId = parseInt(targetTileId); if (isNaN(targetId) || targetId < 0 || targetId >= 40) return;
        monoState.waitingForDoblo = false;
        if (targetId < cp.position) { cp.money += 200; } cp.position = targetId;
        const isDouble = (monoState.dice[0] === monoState.dice[1]) && monoState.doubleRollCount > 0 && monoState.doubleRollCount < 3;
        handleMonoTile(cp, targetId, isDouble, 7);
    });

    socket.on('monopolyBuyDecision', (buy) => {
        const cp = monoState.players[monoState.turnIndex]; if (!cp || socket.id !== cp.id) return;
        monoState.waitingForDecision = false; const tile = monoState.board[cp.position];
        if (buy && tile && !tile.owner && cp.money >= tile.price) {
            cp.money -= tile.price; tile.owner = cp.id; tile.ownerName = cp.name;
            broadcastMonoLog(`🛒 ${cp.name}, ${tile.name} tapusunu ${tile.price}₺ bedelle satın aldı!`);
            if (checkHalısahaWin(cp.id, cp.name)) return; if (checkSideWin(cp.id, cp.name)) return;
        }
        postMonoAction((monoState.dice[0] === monoState.dice[1]) && monoState.doubleRollCount > 0 && monoState.doubleRollCount < 3);
    });

    socket.on('monopolyBuyoutDecision', (buyout) => {
        const cp = monoState.players[monoState.turnIndex]; if (!cp || socket.id !== cp.id) return;
        monoState.waitingForDecision = false; const tile = monoState.board[cp.position];
        const buyoutPrice = Math.floor(tile.price * 1.5); const prevOwner = monoState.players.find(p => p.id === tile.owner);
        if (buyout && prevOwner && cp.money >= buyoutPrice) {
            cp.money -= buyoutPrice; prevOwner.money += buyoutPrice; tile.owner = cp.id; tile.ownerName = cp.name;
            tile.price = buyoutPrice; tile.buyoutCount = (tile.buyoutCount || 0) + 1;
            broadcastMonoLog(`💥 ${cp.name}, mülkü zorla aldı! Yeni değer: ${buyoutPrice}₺`);
            if (checkHalısahaWin(cp.id, cp.name)) return; if (checkSideWin(cp.id, cp.name)) return;
        }
        postMonoAction((monoState.dice[0] === monoState.dice[1]) && monoState.doubleRollCount > 0 && monoState.doubleRollCount < 3);
    });

    // YENİ: VARLIKLARDAN TAPU SATMA (YARI FİYATINA) VE BORÇTAN ÇIKMA SİSTEMİ
    socket.on('monopolySellProperty', (tileId) => {
        const cp = monoState.players.find(p => p.id === socket.id);
        if (!cp) return;
        const tile = monoState.board.find(t => t.id === tileId);
        if (!tile || tile.owner !== cp.id) return;

        const sellValue = Math.floor(tile.price / 2);
        cp.money += sellValue;
        delete tile.owner;
        delete tile.ownerName;
        tile.buyoutCount = 0;
        
        const origTile = monopolyBoard.find(t => t.id === tileId);
        if(origTile) tile.price = origTile.price; // Fiyatı aslına döndürür

        broadcastMonoLog(`📉 ${cp.name}, ${tile.name} tapusunu bankaya ${sellValue}₺ bedelle sattı.`);
        
        // Borçluyken mal satıp kurtulduysa tur devam etsin
        if (monoState.mustResolveDebt && cp.money >= 0) {
            monoState.mustResolveDebt = false;
            broadcastMonoLog(`✅ ${cp.name} borcunu kapattı, tur devam ediyor.`);
            const isDouble = (monoState.dice[0] === monoState.dice[1]) && monoState.doubleRollCount > 0 && monoState.doubleRollCount < 3;
            if (!isDouble) finishMonoTurn();
        }
        io.emit('monopolyStateUpdated', monoState);
    });

    // YENİ: İFLAS BAYRAĞINI ÇEKME
    socket.on('monopolyDeclareBankruptcy', () => {
        const cp = monoState.players.find(p => p.id === socket.id);
        if (!cp) return;
        cp.bankrupt = true;
        broadcastMonoLog(`🏳️ ${cp.name} İFLAS BAYRAĞINI ÇEKTİ ve elendi! Tüm tapuları boşa düştü.`);
        
        monoState.board.forEach(t => {
            if (t.owner === cp.id) {
                delete t.owner; delete t.ownerName; delete t.buyoutCount;
                const orig = monopolyBoard.find(x => x.id === t.id);
                if (orig) t.price = orig.price;
            }
        });

        if (monoState.players[monoState.turnIndex].id === cp.id) {
            monoState.mustResolveDebt = false;
            finishMonoTurn();
        }
        io.emit('monopolyStateUpdated', monoState);
    });

    // ANA TUR DEVAM (BORÇ KİLİDİ BURADA)
    function postMonoAction(isDouble) {
        const cp = monoState.players[monoState.turnIndex];
        
        // Eğer parası sıfırın altındaysa ve iflas etmediyse oyunu durdur (beklemeye al)
        if (cp.money < 0 && !cp.bankrupt) {
            monoState.mustResolveDebt = true;
            broadcastMonoLog(`⚠️ ${cp.name} BORCA GİRDİ! Mülk satarak nakit yaratmalı veya iflas etmeli.`);
            io.emit('monopolyStateUpdated', monoState);
            return;
        }

        if (isDouble && !cp.bankrupt && !cp.inJail) {
            broadcastMonoLog(`🎲 Çift attığın için tekrar zar atabilirsin!`);
        } else {
            finishMonoTurn();
        }
        io.emit('monopolyStateUpdated', monoState);
    }

    function finishMonoTurn() {
        monoState.doubleRollCount = 0; monoState.waitingForDecision = false; monoState.waitingForDoblo = false; monoState.mustResolveDebt = false;
        let attempts = 0;
        do { monoState.turnIndex = (monoState.turnIndex + 1) % monoState.players.length; attempts++; } 
        while (monoState.players[monoState.turnIndex].bankrupt && attempts < monoState.players.length);

        const activePlayers = monoState.players.filter(p => !p.bankrupt);
        if (activePlayers.length <= 1 && monoState.players.length > 1) { monoState.active = false; if (activePlayers[0]) broadcastMonoLog(`👑 OYUN BİTTİ! KAZANAN: ${activePlayers[0].name}!`); }
    }

    // ---------------- 5. TABU & 6. İMPOSTER KORUNDU ----------------
    // ... [Tabu ve İmposter Sunucu Blokları] ...
    
    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        delete raceState.cars[socket.id]; delete stickState.runners[socket.id]; delete guessState.totalScores[socket.id]; delete guessState.guesses[socket.id];
        io.emit('updateLobby', { players });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Sunucu ${PORT} portunda aktif ve çalışıyor!`); });