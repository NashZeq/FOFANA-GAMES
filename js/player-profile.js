'use strict';
(() => {
  const KEY = 'fofana.playerName';
  const clean = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ').slice(0, 24);
  const read = () => { try { return clean(localStorage.getItem(KEY)); } catch (_) { return ''; } };
  const write = name => { try { localStorage.setItem(KEY, name); return true; } catch (_) { return false; } };
  const sync = name => {
    for (const id of ['sitePlayerName', 'onlinePlayerName', 'cbOnlineName']) {
      const input = document.getElementById(id);
      if (input) { input.value = name; input.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  };
  const gate = () => {
    let overlay = document.getElementById('playerGate');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'playerGate';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'playerGateTitle');
    Object.assign(overlay.style, {
      position:'fixed', inset:'0', zIndex:'99999', display:'flex', alignItems:'center',
      justifyContent:'center', padding:'22px', background:'rgba(5,8,16,.94)',
      backdropFilter:'blur(12px)', visibility:'visible'
    });
    overlay.innerHTML = `<form id="playerGateForm" style="width:min(100%,430px);padding:30px;border:1px solid #ffffff24;border-radius:20px;background:#111827;color:#fff;box-shadow:0 24px 80px #0009;font-family:inherit">
      <p style="margin:0 0 8px;color:#e9c66f;font-size:12px;font-weight:800;letter-spacing:.14em">FOFANA GAMES</p>
      <h2 id="playerGateTitle" style="margin:0 0 10px;font-size:clamp(25px,6vw,34px)">Oyuncu adını belirle</h2>
      <p style="margin:0 0 22px;color:#b8c0d1;line-height:1.5">Oyunlarda görünecek ismini gir. Bir kez kaydedilecek ve sonraki ziyaretlerinde hatırlanacak.</p>
      <label for="playerGateInput" style="display:block;margin-bottom:8px;font-size:14px;font-weight:700">Oyuncu adı</label>
      <input id="playerGateInput" maxlength="24" autocomplete="nickname" required placeholder="Örn. Furkan" style="box-sizing:border-box;width:100%;padding:14px;border:1px solid #ffffff35;border-radius:10px;background:#080d18;color:#fff;font:inherit;font-size:16px">
      <p id="playerGateError" role="alert" style="min-height:18px;margin:8px 0;color:#fca5a5;font-size:13px"></p>
      <button type="submit" style="width:100%;padding:14px;border:0;border-radius:10px;background:#e9c66f;color:#16130b;font:inherit;font-weight:900;cursor:pointer">Devam et</button>
    </form>`;
    document.body.append(overlay);
    overlay.querySelector('input').focus();
    overlay.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      const name = clean(overlay.querySelector('input').value);
      const error = overlay.querySelector('#playerGateError');
      if (!name) { error.textContent = 'Devam etmek için bir isim girmelisin.'; return; }
      if (!write(name)) { error.textContent = 'Tarayıcı kayda izin vermedi. Gizli sekme yerine normal sekme kullan.'; return; }
      sync(name);
      overlay.remove();
      document.body.classList.add('player-ready');
    });
    return overlay;
  };
  const name = read();
  if (name) {
    sync(name);
    document.body.classList.add('player-ready');
  } else {
    document.body.classList.remove('player-ready');
    gate();
  }

  // Ana sayfadaki profil alanı artık kayıtlı ortak oyuncu adını düzenler.
  const profileInput = document.getElementById('sitePlayerName');
  const saveButton = document.getElementById('savePlayerName');
  if (profileInput && saveButton) {
    profileInput.value = name;
    const save = () => {
      const next = clean(profileInput.value);
      if (!next) { profileInput.setCustomValidity('Oyuncu adı boş bırakılamaz.'); profileInput.reportValidity(); return; }
      profileInput.setCustomValidity('');
      if (!write(next)) { saveButton.textContent = 'Kaydedilemedi'; return; }
      sync(next);
      saveButton.textContent = 'Kaydedildi ✓';
      setTimeout(() => { saveButton.textContent = 'Kaydet'; }, 1400);
    };
    saveButton.addEventListener('click', save);
    profileInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); save(); } });
  }

  // Oyunların eski isim alanları aynı kaynağı kullanır; ikinci kez isim istemez.
  for (const id of ['onlinePlayerName', 'cbOnlineName']) {
    const input = document.getElementById(id);
    if (input) {
      input.value = name;
      input.readOnly = true;
      input.setAttribute('aria-label', 'Ana sayfada kaydedilen oyuncu adı');
      const label = input.closest('label');
      if (label) label.hidden = true;
    }
  }
})();
