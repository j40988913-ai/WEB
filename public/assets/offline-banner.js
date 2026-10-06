// ==========================================================
// OFFLINE DETECTION BANNER
// ==========================================================
// Nilalagyan ng malinaw na babala ang itaas ng page kapag nawalan
// ng internet connection, para hindi maisip ng user na "gumagana"
// pa rin ang Save/Add/Delete kahit hindi na talaga naka-konekta sa
// server (offline lang gumagana ang pag-type/pag-click sa UI, pero
// walang na-se-save sa database).
(function () {
    function createBanner() {
        if (document.getElementById('offlineBanner')) return document.getElementById('offlineBanner');

        const banner = document.createElement('div');
        banner.id = 'offlineBanner';
        banner.textContent = '⚠️ Walang internet connection. Hindi ma-se-save ang anumang pagbabago hangga\'t hindi bumabalik ang koneksyon.';
        banner.style.cssText = [
            'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:99999',
            'background:#dc3545', 'color:#fff', 'text-align:center',
            'padding:10px 16px', 'font-family:sans-serif', 'font-size:14px',
            'font-weight:bold', 'display:none', 'box-shadow:0 2px 8px rgba(0,0,0,0.3)'
        ].join(';');

        document.body.prepend(banner);
        return banner;
    }

    function updateStatus() {
        const banner = createBanner();
        banner.style.display = navigator.onLine ? 'none' : 'block';
    }

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    document.addEventListener('DOMContentLoaded', updateStatus);
})();

// Helper na maaaring gamitin ng ibang script bago mag-fetch, para agad
// mabigyan ng babala ang user sa halip na maghintay na mag-fail ang request.
function isOffline() {
    return !navigator.onLine;
}

// ==========================================================
// SHARED: PROFILE PICTURE UPLOAD
// ==========================================================
// Ginagamit ng student/teacher/admin dashboard. Kinukuha ang napiling
// file mula sa isang <input type="file">, ina-upload sa server, at
// ina-update ang preview image kapag matagumpay.
async function uploadProfilePic(inputEl, imgElId) {
    if (isOffline()) {
        alert('Walang internet connection. Hindi ma-a-upload ang picture.');
        return;
    }

    const file = inputEl.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        alert('Masyadong malaki ang file. Max 2MB lang.');
        return;
    }

    const formData = new FormData();
    formData.append('profile_pic', file);

    try {
        const res = await fetch('/api/upload-profile-pic.php', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.success) {
            const img = document.getElementById(imgElId);
            if (img) img.src = data.profile_pic + '?t=' + Date.now();
        } else {
            alert(data.message || 'Hindi ma-upload ang picture.');
        }
    } catch (e) {
        alert('May problema sa pag-upload. Subukan ulit.');
    }
}

// ==========================================================
// SHARED: MESSAGE ADMIN
// ==========================================================
async function sendMessageToAdmin() {
    if (isOffline()) {
        alert('Walang internet connection. Hindi maipapadala ang mensahe.');
        return;
    }

    const input = document.getElementById('messageInput');
    if (!input || !input.value.trim()) {
        alert('Maglagay muna ng mensahe.');
        return;
    }

    try {
        const res = await fetch('/api/messages-send.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: input.value.trim() })
        });
        const data = await res.json();

        if (data.success) {
            alert('Naipadala ang mensahe sa Admin.');
            input.value = '';
        } else {
            alert(data.message || 'Hindi maipadala ang mensahe.');
        }
    } catch (e) {
        alert('May problema sa pagpapadala. Subukan ulit.');
    }
}
