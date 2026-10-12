const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// 1. MODÜLER VERİLERİ 'data/' KLASÖRÜNDEN ÇEKİYORUZ
const iskembedenData = require('./data/iskembedenData');
const { monopolyBoard, sansKartlari, kamuFonuKartlari } = require('./data/monopolyData');
const rawTabuKartlari = require('./data/tabuData');
const rawImposterKelimeler = require('./data/imposterData');

// 2. STATİK DOSYALARI (public klasörünü) DIŞARIYA AÇIYORUZ
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Yardımcı fonksiyon: Dizileri rastgele karıştırır
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ==========================================
// GENEL LOBİ VE OYUNCU DURUMU
// ==========================================
let players = [];
let currentGame = null;
const playerColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e84393', '#00cec9', '#fdcb6e'];

// Ortak Bildirim Banner Fonksiyonu
function broadcastMonoLog(msg) {
    monoState.log.unshift(msg);
    io.emit('monoGlobalAlert', msg);
}

// ==========================================
// 1. İŞKEMBEDEN SALLAMA MOTORU & HAFIZASI
// ==========================================
const usedQuestionMemory = {
    celebrity: new Set(),
    market: new Set(),
    car: new Set()
};

let guessState = {
    active: false,
    mode: 'celebrity',
    currentQuestionIndex: 0,
    questions: [],
    timer: null,
    timeLeft: 15,
    guesses: {},
    totalScores: {},
    readyForNextRound: {},
    maxQuestions: 5
};

// ==========================================
// 2. MONOPOLY (KTÜ EDITION) MOTORU
// ==========================================
let monoState = {
    active: false,
    board: JSON.parse(JSON.stringify(monopolyBoard)),
    players: [],
    turnIndex: 0,
    dice: [1, 1],
    doubleRollCount: 0,
    waitingForDecision: false,
    waitingForDoblo: false,
    activeTrade: null,
    log: []
};

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

// ==========================================
// 3. 2D ARABA YARIŞI (1200x750 & DRİFT MOTORU)
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
        { id: 5, x: 580, y: 320, active: true, respawnTimer: 0 }
    ],
    loopInterval: null,
    totalLaps: 3,
    winner: null
};

const trackWaypoints = [
    { x: 550, y: 640 }, { x: 920, y: 640 }, { x: 1080, y: 520 }, { x: 1080, y: 260 },
    { x: 920, y: 140 }, { x: 680, y: 140 }, { x: 580, y: 320 }, { x: 420, y: 320 },
    { x: 320, y: 140 }, { x: 140, y: 240 }, { x: 130, y: 520 }, { x: 320, y: 640 },
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
    return minDist <= 65;
}

// ==========================================
// 4. TABU & İMPOSTER DURUMLARI
// ==========================================
let currentTabuDeck = [];
let tabuState = {
    scores: { red: 0, blue: 0 }, currentCard: null, describerId: null,
    currentTeam: 'red', passCount: 3, timer: null, timeLeft: 60,
    roundActive: false, isIntermission: false, intermissionTimer: null,
    maxRounds: 5, currentRound: 1, teamTurnCount: 0
};

let currentImposterDeck = [];
let imposterState = { word: '', imposterId: '', imposterName: '', votes: {}, timer: null };

// ==========================================
// 5. MERKEZİ SOKET (SOCKET.IO) OLAY DİNLEYİCİLERİ
// ==========================================
io.on('connection', (socket) => {
    // --- LOBİ VE ORTAK HAZIR SİSTEMİ ---
    socket.on('joinLobby', (name) => {
        if (players.length >= 10) return socket.emit('errorMsg', 'Lobi dolu! (Maks 10 kişi)');
        players.push({
            id: socket.id,
            name: name,
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
        if (gameType === 'tabu') io.emit('updateTabuLobby', { players, tabuState });
        if (gameType === 'monopoly') io.emit('updateMonopolyLobby', { players, monoState });
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
        if (guessState.timer) clearInterval(guessState.timer);
        if (tabuState.timer) clearInterval(tabuState.timer);
        if (tabuState.intermissionTimer) clearInterval(tabuState.intermissionTimer);
        if (raceState.loopInterval) clearInterval(raceState.loopInterval);
        if (imposterState.timer) clearInterval(imposterState.timer);

        guessState.active = false;
        raceState.active = false;
        tabuState.roundActive = false;
        tabuState.isIntermission = false;
        players.forEach(p => p.ready = false);

        io.emit('gameSelected', 'lobby');
        io.emit('updateLobby', { players, currentGame });
    });

    // ==========================================
    // İŞKEMBEDEN SALLAMA YÖNETİMİ
    // ==========================================
    socket.on('startGuessGame', (data) => {
        if (players.length < 1) return socket.emit('errorMsg', 'En az 1 oyuncu olmalı!');
        if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmadan oyun başlamaz!');

        let subMode = 'celebrity';
        let requestedRounds = 5;

        if (typeof data === 'object' && data !== null) {
            subMode = data.mode || 'celebrity';
            requestedRounds = parseInt(data.rounds) || 5;
        }

        const fullPool = iskembedenData[subMode] || iskembedenData.celebrity;
        let availablePool = fullPool.filter(q => !usedQuestionMemory[subMode].has(q.title));

        if (availablePool.length < requestedRounds) {
            usedQuestionMemory[subMode].clear();
            availablePool = [...fullPool];
        }

        const chosenQuestions = shuffleArray(availablePool).slice(0, requestedRounds);
        chosenQuestions.forEach(q => usedQuestionMemory[subMode].add(q.title));

        guessState = {
            active: true,
            mode: subMode,
            currentQuestionIndex: 0,
            questions: chosenQuestions,
            timer: null,
            timeLeft: 15,
            guesses: {},
            totalScores: {},
            readyForNextRound: {},
            maxQuestions: requestedRounds
        };

        players.forEach(p => { guessState.totalScores[p.id] = 0; });
        startGuessRound();
    });

    function startGuessRound() {
        guessState.guesses = {};
        guessState.readyForNextRound = {};
        guessState.timeLeft = 15;
        const q = guessState.questions[guessState.currentQuestionIndex];

        io.emit('guessRoundStarted', {
            mode: guessState.mode,
            questionIndex: guessState.currentQuestionIndex + 1,
            maxQuestions: guessState.maxQuestions,
            question: { title: q.title, hint: q.hint, img: q.img },
            timeLeft: guessState.timeLeft
        });

        if (guessState.timer) clearInterval(guessState.timer);
        guessState.timer = setInterval(() => {
            guessState.timeLeft--;
            io.emit('guessTimerTick', guessState.timeLeft);
            if (guessState.timeLeft <= 0) {
                clearInterval(guessState.timer);
                endGuessRound();
            }
        }, 1000);
    }

    socket.on('submitGuess', (val) => {
        if (!guessState.active || guessState.guesses[socket.id]) return;
        const num = parseFloat(val);
        if (isNaN(num)) return;

        guessState.guesses[socket.id] = { value: num, timeLeft: guessState.timeLeft, scoreGained: 0 };
        socket.emit('guessLockedNotice');

        if (Object.keys(guessState.guesses).length === players.length) {
            clearInterval(guessState.timer);
            endGuessRound();
        }
    });

    function endGuessRound() {
        const q = guessState.questions[guessState.currentQuestionIndex];
        const actual = q.actual;
        const roundResults = [];

        players.forEach(p => {
            const userGuess = guessState.guesses[p.id];
            let score = 0;

            if (userGuess) {
                const diff = Math.abs(userGuess.value - actual);
                let accuracyScore = 0;

                if (guessState.mode === 'celebrity') {
                    accuracyScore = Math.max(0, 1000 - (diff * 120));
                } else {
                    const ratio = diff / actual;
                    accuracyScore = ratio > 1 ? 0 : Math.round(1000 * (1 - ratio));
                }

                const speedMult = 0.5 + (0.5 * (userGuess.timeLeft / 15));
                score = Math.round(accuracyScore * speedMult);

                userGuess.scoreGained = score;
                guessState.totalScores[p.id] = (guessState.totalScores[p.id] || 0) + score;
            }

            roundResults.push({
                id: p.id,
                name: p.name,
                guess: userGuess ? userGuess.value : 'Tahmin Yok',
                scoreGained: score,
                totalScore: guessState.totalScores[p.id] || 0
            });
        });

        roundResults.sort((a, b) => b.totalScore - a.totalScore);
        guessState.readyForNextRound = {};

        io.emit('guessRoundEnded', {
            actual: actual,
            unit: guessState.mode === 'celebrity' ? 'Yaş' : 'TL',
            results: roundResults,
            isLastQuestion: (guessState.currentQuestionIndex + 1 >= guessState.maxQuestions),
            readyStatus: players.map(p => ({ id: p.id, name: p.name, ready: false }))
        });
    }

    socket.on('guessNextRoundReadyToggle', () => {
        if (!guessState.active) return;
        guessState.readyForNextRound[socket.id] = true;

        const readyList = players.map(p => ({
            id: p.id,
            name: p.name,
            ready: !!guessState.readyForNextRound[p.id]
        }));

        io.emit('guessNextRoundReadyUpdate', readyList);

        if (players.every(p => guessState.readyForNextRound[p.id])) {
            guessState.currentQuestionIndex++;
            if (guessState.currentQuestionIndex < guessState.maxQuestions) {
                startGuessRound();
            } else {
                guessState.active = false;
                const finalLeaderboard = players.map(p => ({
                    name: p.name, totalScore: guessState.totalScores[p.id] || 0
                })).sort((a, b) => b.totalScore - a.totalScore);

                io.emit('guessGameOver', { finalLeaderboard });
            }
        }
    });

    // ==========================================
    // 2D ARABA YARIŞI YÖNETİMİ
    // ==========================================
    socket.on('startRaceGame', () => {
        if (players.length < 1) return socket.emit('errorMsg', 'En az 1 oyuncu olmalı!');
        if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmadan yarış başlamaz!');
        if (raceState.loopInterval) clearInterval(raceState.loopInterval);

        raceState.active = true;
        raceState.winner = null;
        raceState.cars = {};
        raceState.items = [];

        players.forEach((p, idx) => {
            raceState.cars[p.id] = {
                id: p.id, name: p.name, color: p.color,
                x: 480 - (idx * 35), y: 640, angle: 0,
                speed: 0, vx: 0, vy: 0, lap: 1,
                checkpoints: [false, false, false],
                heldItem: null, isSpinning: false, spinAngleSpeed: 0,
                finished: false,
                inputs: { up: false, down: false, left: false, right: false }
            };
        });

        io.emit('raceStarted', { totalLaps: raceState.totalLaps });

        raceState.loopInterval = setInterval(() => {
            if (!raceState.active) return;

            raceState.itemBoxes.forEach(box => {
                if (!box.active) {
                    box.respawnTimer--;
                    if (box.respawnTimer <= 0) box.active = true;
                }
            });

            // Roket Mermileri
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

            // Arabaların Fizik ve Çarpışma Güncellemesi
            for (let id in raceState.cars) {
                const car = raceState.cars[id];
                if (car.finished) continue;

                const onTrack = isCarOnTrack(car.x, car.y);
                const maxSpeed = onTrack ? 7.2 : 2.6;

                if (car.isSpinning) {
                    car.angle += car.spinAngleSpeed;
                    car.spinAngleSpeed *= 0.94;
                    car.speed *= 0.94;
                    car.x += car.vx;
                    car.y += car.vy;
                    car.vx *= 0.94;
                    car.vy *= 0.94;

                    if (Math.abs(car.spinAngleSpeed) < 0.03) {
                        car.isSpinning = false;
                        car.spinAngleSpeed = 0;
                    }
                } else {
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

                car.x = Math.max(20, Math.min(1180, car.x));
                car.y = Math.max(20, Math.min(730, car.y));

                // Altın Soru İşareti Alma
                raceState.itemBoxes.forEach(box => {
                    if (box.active && Math.hypot(car.x - box.x, car.y - box.y) < 30) {
                        box.active = false;
                        box.respawnTimer = 150;
                        if (!car.heldItem) car.heldItem = Math.random() < 0.5 ? 'banana' : 'rocket';
                    }
                });

                // Muza Basma
                for (let i = raceState.items.length - 1; i >= 0; i--) {
                    const item = raceState.items[i];
                    if (item.type === 'banana') {
                        if (Math.hypot(car.x - item.x, car.y - item.y) < 22) {
                            car.isSpinning = true;
                            car.spinAngleSpeed = 0.38;
                            car.vx = Math.cos(car.angle) * (car.speed * 0.8);
                            car.vy = Math.sin(car.angle) * (car.speed * 0.8);
                            car.speed *= 0.7;
                            raceState.items.splice(i, 1);
                            io.emit('monoGlobalAlert', `🍌 ${car.name} muza bastı ve drift attı!`);
                            break;
                        }
                    }
                }

                // Checkpointler
                if (car.x > 950 && car.y < 350) car.checkpoints[0] = true;
                if (car.x < 650 && car.x > 500 && car.y < 380) car.checkpoints[1] = true;
                if (car.x < 250 && car.y > 350) car.checkpoints[2] = true;

                // Bitiş Çizgisi
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

            io.emit('raceUpdate', { cars: raceState.cars, items: raceState.items, boxes: raceState.itemBoxes });
        }, 1000 / 30);
    });

    socket.on('raceInput', (inputs) => {
        if (raceState.active && raceState.cars[socket.id]) raceState.cars[socket.id].inputs = inputs;
    });

    socket.on('raceUseItem', () => {
        if (!raceState.active || !raceState.cars[socket.id]) return;
        const car = raceState.cars[socket.id];
        if (!car.heldItem || car.isSpinning) return;

        if (car.heldItem === 'banana') {
            raceState.items.push({ type: 'banana', x: car.x - Math.cos(car.angle) * 26, y: car.y - Math.sin(car.angle) * 26 });
        } else if (car.heldItem === 'rocket') {
            raceState.items.push({ type: 'rocket', ownerId: car.id, ownerName: car.name, x: car.x + Math.cos(car.angle) * 28, y: car.y + Math.sin(car.angle) * 28, angle: car.angle, life: 100 });
        }
        car.heldItem = null;
    });

    // ==========================================
    // MONOPOLY YÖNETİMİ
    // ==========================================
    socket.on('startMonopolyGame', () => {
        if (players.length < 2) return socket.emit('errorMsg', 'Monopoly için en az 2 oyuncu olmalı!');
        if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmadan oyun başlamaz!');

        monoState = {
            active: true,
            board: JSON.parse(JSON.stringify(monopolyBoard)),
            players: players.map((p, idx) => ({
                id: p.id, name: p.name, color: playerColors[idx % playerColors.length],
                money: 1500, position: 0, inJail: false, jailTurns: 0, jailCardCount: 0, bankrupt: false
            })),
            turnIndex: 0, dice: [1, 1], doubleRollCount: 0, waitingForDecision: false, waitingForDoblo: false, activeTrade: null, log: []
        };
        broadcastMonoLog('KTÜ Monopoly başladı! İlk oyuncu zar atabilir.');
        io.emit('monopolyStateUpdated', monoState);
    });

    socket.on('monopolyRollDice', () => {
        if (!monoState.active) return;
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id) return socket.emit('errorMsg', 'Sıra sende değil!');
        if (monoState.waitingForDecision || monoState.waitingForDoblo) return;

        const d1 = Math.floor(Math.random() * 6) + 1;
        const d2 = Math.floor(Math.random() * 6) + 1;
        const isDouble = d1 === d2;
        const total = d1 + d2;
        monoState.dice = [d1, d2];

        if (cp.inJail) {
            cp.jailTurns++;
            if (cp.jailTurns < 3) {
                broadcastMonoLog(`🚨 ${cp.name} Blok derste çift atmayı denedi: ${d1}-${d2}`);
                if (isDouble) {
                    cp.inJail = false;
                    cp.jailTurns = 0;
                    broadcastMonoLog(`🎉 ÇİFT ZAR! ${cp.name} dersten serbest kaldı!`);
                    advanceMonoPlayer(cp, total, isDouble);
                    return;
                } else {
                    finishMonoTurn();
                    io.emit('monopolyStateUpdated', monoState);
                    return;
                }
            } else {
                cp.inJail = false;
                cp.jailTurns = 0;
                broadcastMonoLog(`⚖️ 3. Tur bitti, ${cp.name} serbest kalarak [${total}] ilerliyor.`);
                advanceMonoPlayer(cp, total, isDouble);
                return;
            }
        }

        if (isDouble) {
            monoState.doubleRollCount++;
            broadcastMonoLog(`🎲 ${cp.name} ÇİFT ZAR ATTI! (${d1}-${d2})`);
            if (monoState.doubleRollCount === 3) {
                cp.position = 10;
                cp.inJail = true;
                cp.jailTurns = 0;
                broadcastMonoLog(`🚨 3 kez çift atan ${cp.name} BLOK DERSE GÖNDERİLDİ!`);
                finishMonoTurn();
                io.emit('monopolyStateUpdated', monoState);
                return;
            }
        } else {
            monoState.doubleRollCount = 0;
        }

        advanceMonoPlayer(cp, total, isDouble);
    });

    function advanceMonoPlayer(cp, total, isDouble) {
        const oldPos = cp.position;
        let newPos = (oldPos + total) % 40;
        if (newPos < oldPos) {
            cp.money += 200;
            broadcastMonoLog(`💵 ${cp.name} Başlangıçtan geçti ve 200₺ yolluk aldı.`);
        }
        cp.position = newPos;
        handleMonoTile(cp, newPos, isDouble, total);
    }

    function handleMonoTile(cp, pos, isDouble, diceSum) {
        const tile = monoState.board[pos];
        if (tile.type === 'doblo') {
            broadcastMonoLog(`🚐 ${cp.name} DOBLO ZAMANI DOSTUM karesine bastı! İstediğin yere sür!`);
            monoState.waitingForDoblo = true;
            io.to(cp.id).emit('monopolyDobloPrompt', { board: monoState.board.map(t => ({ id: t.id, name: t.name })) });
            io.emit('monopolyStateUpdated', monoState);
            return;
        } else if (tile.type === 'go_to_jail') {
            cp.position = 10;
            cp.inJail = true;
            cp.jailTurns = 0;
            broadcastMonoLog(`🚨 ${cp.name} BLOK DERSE GİTTİ!`);
            finishMonoTurn();
            io.emit('monopolyStateUpdated', monoState);
            return;
        } else if (tile.type === 'tax') {
            cp.money -= tile.amount;
            broadcastMonoLog(`💸 ${cp.name} vergi ödedi: -${tile.amount}₺`);
            if (cp.money < 0) cp.bankrupt = true;
            postMonoAction(isDouble);
            return;
        } else if (tile.owner && tile.owner !== cp.id) {
            const owner = monoState.players.find(p => p.id === tile.owner);
            if (owner && !owner.bankrupt) {
                const rentInfo = getRentDetails(tile, diceSum);
                cp.money -= rentInfo.rent;
                owner.money += rentInfo.rent;
                broadcastMonoLog(`⚠️ ${cp.name}, ${owner.name}'in ${tile.name} mülküne bastı! Kira: ${rentInfo.rent}₺ (${rentInfo.note})`);
                if (cp.money < 0) cp.bankrupt = true;

                const buyoutPrice = Math.floor(tile.price * 1.5);
                if (cp.money >= buyoutPrice && !cp.bankrupt) {
                    monoState.waitingForDecision = true;
                    io.to(cp.id).emit('monopolyBuyoutPrompt', { tile, buyoutPrice, ownerName: owner.name });
                    io.emit('monopolyStateUpdated', monoState);
                    return;
                }
            }
            postMonoAction(isDouble);
            return;
        }

        const canBuy = (tile.type === 'property' || tile.type === 'pitch' || tile.type === 'utility') && !tile.owner;
        if (canBuy && cp.money >= tile.price) {
            monoState.waitingForDecision = true;
            io.to(cp.id).emit('monopolyBuyPrompt', { tile });
        } else {
            postMonoAction(isDouble);
        }
        io.emit('monopolyStateUpdated', monoState);
    }

    socket.on('monopolyDobloDrive', (targetTileId) => {
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id || !monoState.waitingForDoblo) return;
        const targetId = parseInt(targetTileId);
        monoState.waitingForDoblo = false;
        if (targetId < cp.position) {
            cp.money += 200;
            broadcastMonoLog(`💵 ${cp.name} Başlangıçtan geçti (+200₺)`);
        }
        cp.position = targetId;
        broadcastMonoLog(`🚐💨 ${cp.name} Doblo ile [${monoState.board[targetId].name}] karesine yanaştı!`);
        handleMonoTile(cp, targetId, false, 7);
    });

    socket.on('monopolyBuyDecision', (buy) => {
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id) return;
        monoState.waitingForDecision = false;
        const tile = monoState.board[cp.position];
        if (buy && tile && !tile.owner && cp.money >= tile.price) {
            cp.money -= tile.price;
            tile.owner = cp.id;
            tile.ownerName = cp.name;
            broadcastMonoLog(`🛒 ${cp.name}, ${tile.name} tapusunu ${tile.price}₺ bedelle satın aldı!`);
            if (checkHalısahaWin(cp.id, cp.name)) return;
        }
        postMonoAction(false);
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
            broadcastMonoLog(`💥 ${cp.name}, ${prevOwner.name}'in ${tile.name} tapusunu 1.5 katına zorla satın aldı!`);
            if (checkHalısahaWin(cp.id, cp.name)) return;
        }
        postMonoAction(false);
        io.emit('monopolyStateUpdated', monoState);
    });

    socket.on('monopolyPayJailBail', () => {
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id || !cp.inJail || cp.money < 100) return;
        cp.money -= 100;
        cp.inJail = false;
        cp.jailTurns = 0;
        broadcastMonoLog(`🔓 ${cp.name} 100₺ kefalet ödeyerek dersten kaçtı!`);
        advanceMonoPlayer(cp, 4, false);
    });

    socket.on('monopolyUseJailCard', () => {
        const cp = monoState.players[monoState.turnIndex];
        if (socket.id !== cp.id || !cp.inJail || cp.jailCardCount <= 0) return;
        cp.jailCardCount--;
        cp.inJail = false;
        cp.jailTurns = 0;
        broadcastMonoLog(`🎟️ ${cp.name} Konferans Kartını kullanarak blok dersten kaçtı!`);
        advanceMonoPlayer(cp, 5, false);
    });

    function postMonoAction(isDouble) {
        if (isDouble && !monoState.players[monoState.turnIndex].bankrupt) {
            broadcastMonoLog(`🎲 Çift attığın için bir daha zar at!`);
        } else {
            finishMonoTurn();
        }
        io.emit('monopolyStateUpdated', monoState);
    }

    function finishMonoTurn() {
        monoState.doubleRollCount = 0;
        monoState.waitingForDecision = false;
        monoState.waitingForDoblo = false;
        do {
            monoState.turnIndex = (monoState.turnIndex + 1) % monoState.players.length;
        } while (monoState.players[monoState.turnIndex].bankrupt);
    }

    // ==========================================
    // TABU & İMPOSTER YÖNETİMİ
    // ==========================================
    socket.on('startTabuGame', (rounds) => {
        if (players.length < 2) return socket.emit('errorMsg', 'Tabu için en az 2 oyuncu olmalı!');
        currentTabuDeck = shuffleArray(rawTabuKartlari);
        tabuState.scores = { red: 0, blue: 0 };
        tabuState.maxRounds = parseInt(rounds) || 5;
        tabuState.currentRound = 1;
        tabuState.roundActive = true;
        io.emit('tabuTurnStarted', {
            scores: tabuState.scores,
            currentRound: tabuState.currentRound,
            maxRounds: tabuState.maxRounds,
            card: currentTabuDeck[0],
            role: 'describer'
        });
    });

    socket.on('startImposter', () => {
        if (players.length < 3) return socket.emit('errorMsg', 'İmposter için en az 3 kişi gerekli!');
        currentImposterDeck = shuffleArray(rawImposterKelimeler);
        const item = currentImposterDeck[0];
        const imposter = players[Math.floor(Math.random() * players.length)];
        players.forEach(p => {
            io.to(p.id).emit('imposterRole', {
                isImposter: (p.id === imposter.id),
                info: p.id === imposter.id ? `Sen İMPOSTER'sın! İpucun: ${item.ipucu}` : `Gizli Kelime: ${item.kelime}`
            });
        });
    });

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        delete guessState.totalScores[socket.id];
        delete guessState.guesses[socket.id];
        delete raceState.cars[socket.id];
        io.emit('updateLobby', { players, currentGame });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif ve çalışıyor!`);
});