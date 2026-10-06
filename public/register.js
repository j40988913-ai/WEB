// Vector SVG Icons Set
const ICONS = {
    info: `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
    success: `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`,
    error: `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`,
    pending: `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#ffd700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
};

// Decode Google JWT Token
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

// Google Auth Callback
function handleGoogleCallback(response) {
    const userData = parseJwt(response.credential);
    if (userData && userData.email) {
        document.getElementById('fullname').value = userData.name || '';
        document.getElementById('email').value = userData.email || '';
        showStep2(`Welcome ${userData.name}! Paki-kumpleto ang impormasyon sa ibaba.`);
    } else {
        showModal('Error', 'Nagkaroon ng problema sa pag-verify ng Google Account.', 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const manualLink = document.getElementById('manualRegisterLink');
    if (manualLink) {
        manualLink.addEventListener('click', (e) => {
            e.preventDefault();
            showStep2('Paki-kumpleto ang lahat ng impormasyon sa ibaba.');
        });
    }

    const modalCloseBtn = document.getElementById('modalCloseBtn');
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeModal);
    }

    const roleSelect = document.getElementById('role');
    if (roleSelect) {
        roleSelect.addEventListener('change', toggleRoleFields);
    }

    const nonTeachingCheckbox = document.getElementById('nonTeaching');
    if (nonTeachingCheckbox) {
        nonTeachingCheckbox.addEventListener('change', toggleNonTeaching);
    }

    const gradeLevelSelect = document.getElementById('gradeLevel');
    if (gradeLevelSelect) {
        gradeLevelSelect.addEventListener('change', () => {
            loadSectionOptions(gradeLevelSelect.value);
        });
    }

    loadAdviserOptions();

    // Toggle Password Visibility
    const togglePassword = document.getElementById("togglePassword");
    const passwordInput = document.getElementById("password");
    const eyeOpen = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`;
    const eyeClosed = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>`;

    if (togglePassword && passwordInput) {
        togglePassword.addEventListener("click", () => {
            const isPassword = passwordInput.type === "password";
            passwordInput.type = isPassword ? "text" : "password";
            togglePassword.innerHTML = isPassword ? eyeClosed : eyeOpen;
        });
    }

    // Register Form Submit
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const role = document.getElementById('role').value;
            const nonTeaching = role === 'Teacher' && document.getElementById('nonTeaching').checked;

            const payload = {
                fullname: document.getElementById('fullname').value,
                email: document.getElementById('email').value,
                lrn: document.getElementById('lrn').value,
                password: document.getElementById('password').value,
                role: role,
                grade_level: role === 'Student' ? document.getElementById('gradeLevel').value : null,
                section: role === 'Student' ? document.getElementById('section').value : null,
                adviser: role === 'Student' ? document.getElementById('adviser').value : null,
                non_teaching: nonTeaching,
                teacher_grade_level: (role === 'Teacher' && !nonTeaching) ? document.getElementById('teacherGradeLevel').value : null,
                teacher_section: (role === 'Teacher' && !nonTeaching) ? document.getElementById('teacherSection').value : null
            };

            try {
                const response = await fetch('/api/register.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (data.success) {
                    if (role === 'Teacher') {
                        showModal('Registration Submitted', 'Ang iyong account ay kailangan munang ma-approve ng Admin.', 'pending');
                        setTimeout(() => { window.location.href = '/login.html'; }, 3000);
                    } else {
                        showModal('Success!', 'Matagumpay ang iyong registration! Pwede ka nang mag-login.', 'success');
                        setTimeout(() => { window.location.href = '/login.html'; }, 2000);
                    }
                } else {
                    showModal('Registration Failed', data.message || 'Hindi ma-process ang registration.', 'error');
                }
            } catch (err) {
                console.error(err);
                showModal('Server Error', 'Hindi makakonekta sa server.', 'error');
            }
        });
    }
});

// Load Sections
async function loadSectionOptions(gradeLevel) {
    const select = document.getElementById('section');
    if (!select) return;

    select.innerHTML = '';

    if (!gradeLevel) {
        select.innerHTML = '<option value="">-- Piliin muna ang Grade Level --</option>';
        return;
    }

    select.innerHTML = '<option value="">-- Naglo-load... --</option>';

    try {
        const res = await fetch('/api/sections-list.php?grade_level=' + encodeURIComponent(gradeLevel));
        const data = await res.json();
        select.innerHTML = '';

        if (data.success && data.sections.length > 0) {
            select.innerHTML = '<option value="">-- Select Section --</option>';
            data.sections.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            });
        } else {
            select.innerHTML = '<option value="">-- Wala pang available na Section --</option>';
        }
    } catch (e) {
        select.innerHTML = '<option value="">-- Hindi ma-load ang Section --</option>';
    }
}

// Load Advisers
async function loadAdviserOptions() {
    try {
        const res = await fetch('/api/teachers-list.php');
        const data = await res.json();
        const select = document.getElementById('adviser');
        if (!select || !data.success) return;

        data.teachers.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
    } catch (e) {
        // Error handling
    }
}

// Toggle Non-Teaching Fields
function toggleNonTeaching() {
    const nonTeaching = document.getElementById('nonTeaching').checked;
    const advisoryFields = document.getElementById('teacherAdvisoryFields');
    const teacherGradeLevel = document.getElementById('teacherGradeLevel');
    const teacherSection = document.getElementById('teacherSection');

    if (nonTeaching) {
        advisoryFields.style.display = 'none';
        teacherGradeLevel.required = false;
        teacherSection.required = false;
        teacherGradeLevel.value = '';
        teacherSection.value = '';
    } else {
        advisoryFields.style.display = 'flex';
        teacherGradeLevel.required = true;
        teacherSection.required = true;
    }
}

// Toggle Student/Teacher Fields
function toggleRoleFields() {
    const role = document.getElementById('role').value;
    const studentFields = document.getElementById('studentFields');
    const gradeLevel = document.getElementById('gradeLevel');
    const section = document.getElementById('section');
    const adviser = document.getElementById('adviser');

    const teacherFields = document.getElementById('teacherFields');
    const teacherGradeLevel = document.getElementById('teacherGradeLevel');
    const teacherSection = document.getElementById('teacherSection');

    if (role === 'Student') {
        studentFields.style.display = 'flex';
        gradeLevel.required = true;
        section.required = true;
        adviser.required = true;
    } else {
        studentFields.style.display = 'none';
        gradeLevel.required = false;
        section.required = false;
        adviser.required = false;
    }

    if (role === 'Teacher') {
        teacherFields.style.display = 'flex';
        document.getElementById('nonTeaching').checked = false;
        toggleNonTeaching();
    } else {
        teacherFields.style.display = 'none';
        teacherGradeLevel.required = false;
        teacherSection.required = false;
    }
}

// Step 2 Display
function showStep2(message) {
    document.getElementById('googleAuthSection').style.display = 'none';
    document.getElementById('stepSubtitle').textContent = 'Step 2: Complete your School Profile';
    document.getElementById('registerForm').style.display = 'flex';
    document.getElementById('registerForm').style.flexDirection = 'column';
    document.getElementById('registerForm').style.gap = '12px';

    showModal('Registration', message, 'info');
}

// Modal Helpers
function showModal(title, message, iconType = 'info') {
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalIcon = document.getElementById('modalIcon');
    const showModalEl = document.getElementById('showModal');

    if (modalTitle) modalTitle.textContent = title;
    if (modalMessage) modalMessage.textContent = message;
    if (modalIcon) modalIcon.innerHTML = ICONS[iconType] || ICONS.info;
    if (showModalEl) showModalEl.style.display = 'flex';
}

function closeModal() {
    const showModalEl = document.getElementById('showModal');
    if (showModalEl) showModalEl.style.display = 'none';
}