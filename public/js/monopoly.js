// Piyon Kare Kare Yürür ve Hedefe Varınca O Kareyi Parlatır
function animateTokenStepByStep(playerId, startPos, targetPos) {
    if (activeAnimations[playerId]) clearInterval(activeAnimations[playerId]);
    let curr = startPos;

    activeAnimations[playerId] = setInterval(() => {
        if (curr === targetPos) {
            clearInterval(activeAnimations[playerId]);
            delete activeAnimations[playerId];
            const targetTileEl = document.getElementById(`tile-node-${targetPos}`);
            if (targetTileEl) {
                targetTileEl.classList.remove('tile-landing-glow');
                void targetTileEl.offsetWidth;
                targetTileEl.classList.add('tile-landing-glow');
            }
            return;
        }

        curr = (curr + 1) % 40;
        localPlayerPositions[playerId] = curr;
        const token = document.getElementById(`token-${playerId}`);
        const holder = document.getElementById(`tokens-tile-${curr}`);
        if (token && holder) {
            holder.appendChild(token);
            token.classList.remove('token-hop');
            void token.offsetWidth;
            token.classList.add('token-hop');
        }
    }, 320); // Zıplama süresi uzatıldı, çok daha yavaş akacak
}