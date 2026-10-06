// ==========================================================
// BNHS APP SETTINGS: Dark Mode + Font Size
// Ginagamit sa student/teacher/admin portals.
//
// IMPORTANT: Isang maliit na inline script (see snippet below)
// ang dapat nasa pinaka-simula ng <head> ng bawat page, BAGO pa
// mag-load ang stylesheet, para maiwasan ang "flash" ng maling
// tema/font-size bago ma-apply ang classes:
//
//   <script>
//     (function () {
//       var t = localStorage.getItem('bnhs_theme') || 'dark';
//       var f = localStorage.getItem('bnhs_fontsize') || 'md';
//       if (t === 'light') document.documentElement.classList.add('light-mode');
//       document.documentElement.classList.add('font-' + f);
//     })();
//   </script>
//
// Ang file na ito (/assets/app-settings.js) ang bahala sa
// pag-wire ng mga controls sa loob ng Settings tab.
// ==========================================================

function bnhsApplyStoredSettings() {
    const theme = localStorage.getItem('bnhs_theme') || 'dark';
    const fontSize = localStorage.getItem('bnhs_fontsize') || 'md';

    document.documentElement.classList.toggle('light-mode', theme === 'light');
    document.documentElement.classList.remove('font-sm', 'font-md', 'font-lg');
    document.documentElement.classList.add('font-' + fontSize);
}

function bnhsSetTheme(theme) {
    localStorage.setItem('bnhs_theme', theme);
    bnhsApplyStoredSettings();
}

function bnhsSetFontSize(size) {
    localStorage.setItem('bnhs_fontsize', size);
    bnhsApplyStoredSettings();
}

document.addEventListener('DOMContentLoaded', () => {
    // Make sure classes are in sync (in case the early inline
    // snippet was missing from this particular page)
    bnhsApplyStoredSettings();

    // Dark Mode Toggle Switch
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.checked = (localStorage.getItem('bnhs_theme') || 'dark') === 'dark';
        darkModeToggle.addEventListener('change', () => {
            bnhsSetTheme(darkModeToggle.checked ? 'dark' : 'light');
        });
    }

    // Font Size Buttons (3 buttons: sm / md / lg)
    const fontButtons = document.querySelectorAll('.font-size-btn');
    if (fontButtons.length) {
        const currentSize = localStorage.getItem('bnhs_fontsize') || 'md';
        fontButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.size === currentSize);
            btn.addEventListener('click', () => {
                fontButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                bnhsSetFontSize(btn.dataset.size);
            });
        });
    }
});
