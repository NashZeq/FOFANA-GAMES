const canvas = document.getElementById('raceCanvas');
const ctx = canvas.getContext('2d');
const raceInputs = { up: false, down: false, left: false, right: false };

window.addEventListener('keydown', (e) => {
    let changed = false;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') { raceInputs.up = true; changed = true; }
    if (e.code === 'KeyS' || e.code === 'ArrowDown') { raceInputs.down = true; changed = true; }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') { raceInputs.left = true; changed = true; }
    if (e.code === 'KeyD' || e.code === 'ArrowRight') { raceInputs.right = true; changed = true; }
    if (e.code === 'Space') { socket.emit('raceUseItem'); }
    if (changed) socket.emit('raceInput', raceInputs);
});

window.addEventListener('keyup', (e) => {
    let changed = false;
    if (e.code === 'KeyW' || e.code === 'ArrowUp') { raceInputs.up = false; changed = true; }
    if (e.code === 'KeyS' || e.code === 'ArrowDown') { raceInputs.down = false; changed = true; }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') { raceInputs.left = false; changed = true; }
    if (e.code === 'KeyD' || e.code === 'ArrowRight') { raceInputs.right = false; changed = true; }
    if (changed) socket.emit('raceInput', raceInputs);
});

function bindTouch(btnId, key) {
    const el = document.getElementById(btnId);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); raceInputs[key] = true; socket.emit('raceInput', raceInputs); });
    el.addEventListener('touchend', (e) => { e.preventDefault(); raceInputs[key] = false; socket.emit('raceInput', raceInputs); });
}
bindTouch('btnGas', 'up');
bindTouch('btnBrake', 'down');
bindTouch('btnLeft', 'left');
bindTouch('btnRight', 'right');

socket.on('raceStarted', () => {
    document.getElementById('raceLobbyControls').style.display = 'none';
    document.getElementById('raceGameArea').style.display = 'flex';
    document.getElementById('raceWinnerBox').style.display = 'none';
});

socket.on('raceUpdate', (data) => {
    renderRaceTrack();
    renderItemBoxes(data.boxes);
    renderTrackItems(data.items);

    for (let id in data.cars) {
        const car = data.cars[id];
        renderCar(car);
        if (id === socket.id) {
            document.getElementById('raceHud').innerText = `Tur: ${Math.min(car.lap, 3)} / 3 ${car.finished ? '🏁 BİTTİ' : ''}`;
            const itemSpan = document.querySelector('#raceItemHud span');
            if (car.heldItem === 'banana') itemSpan.innerHTML = '🍌 Muz (Space)';
            else if (car.heldItem === 'rocket') itemSpan.innerHTML = '🚀 Roket (Space)';
            else itemSpan.innerHTML = 'Yok';
        }
    }
});

socket.on('raceFinished', (data) => {
    const box = document.getElementById('raceWinnerBox');
    box.style.display = 'block';
    document.getElementById('raceWinnerTitle').innerHTML = `🏆 ŞAMPİYON: ${data.winner}!`;
});

const trackPoints = [
    { x: 550, y: 640 }, { x: 920, y: 640 }, { x: 1080, y: 520 }, { x: 1080, y: 260 },
    { x: 920, y: 140 }, { x: 680, y: 140 }, { x: 580, y: 320 }, { x: 420, y: 320 },
    { x: 320, y: 140 }, { x: 140, y: 240 }, { x: 130, y: 520 }, { x: 320, y: 640 },
    { x: 550, y: 640 }
];

function renderRaceTrack() {
    ctx.fillStyle = '#1e824c';
    ctx.fillRect(0, 0, 1200, 750);
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 130;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(trackPoints[0].x, trackPoints[0].y);
    for (let i = 1; i < trackPoints.length; i++) ctx.lineTo(trackPoints[i].x, trackPoints[i].y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 4;
    ctx.setLineDash([16, 16]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.fillRect(575, 575, 12, 130);
    ctx.fillStyle = '#000';
    for (let y = 575; y < 705; y += 20) {
        ctx.fillRect(575, y, 6, 10);
        ctx.fillRect(581, y + 10, 6, 10);
    }
    ctx.restore();
}

function renderItemBoxes(boxes) {
    if (!boxes) return;
    boxes.forEach(box => {
        if (!box.active) return;
        ctx.save();
        ctx.translate(box.x, box.y);
        ctx.fillStyle = '#f1c40f';
        ctx.strokeStyle = '#d35400';
        ctx.lineWidth = 3;
        ctx.fillRect(-15, -15, 30, 30);
        ctx.strokeRect(-15, -15, 30, 30);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', 0, 1);
        ctx.restore();
    });
}

function renderTrackItems(items) {
    if (!items) return;
    items.forEach(item => {
        if (item.type === 'banana') {
            ctx.save();
            ctx.font = '24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🍌', item.x, item.y);
            ctx.restore();
        } else if (item.type === 'rocket') {
            ctx.save();
            ctx.translate(item.x, item.y);
            ctx.rotate(item.angle);
            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(-10, -5, 20, 10);
            ctx.fillStyle = '#f39c12';
            ctx.fillRect(-16, -3, 6, 6);
            ctx.restore();
        }
    });
}

function renderCar(car) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = car.color || '#e74c3c';
    ctx.fillRect(-15, -9, 30, 18);
    ctx.fillStyle = '#111';
    ctx.fillRect(0, -7, 8, 14);
    ctx.fillRect(-10, -7, 5, 14);
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(13, -8, 2, 4);
    ctx.fillRect(13, 4, 2, 4);
    ctx.restore();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(car.name, car.x, car.y - 16);
}