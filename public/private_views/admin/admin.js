// Fallback function - kung sakaling hindi na-load ang offline-banner.js
// (missing file, mali ang path, atbp.), hindi dapat masira ang core
// functionality ng page dahil lang dito.
if (typeof isOffline === 'undefined') {
    function isOffline() {
        return typeof navigator !== 'undefined' && 'onLine' in navigator ? !navigator.onLine : false;
    }
}

// Dynamic List variable para sa Auto-complete Search Input
let studentsList = [];

// Ang aktwal na napiling estudyante para sa Add Violation form - live
// na-uupdate ito habang nagta-type sa targetStudentInput (server search),
// kaya hindi na umaasa sa pag-parse ng eksaktong laman ng text field.
let selectedViolationStudent = null;
let studentSearchDebounceTimer = null;

// ==========================================================
// 0. XSS PROTECTION HELPER
// ==========================================================
// Kinukumbert ang mga espesyal na HTML character (<, >, &, ", ')
// papuntang "text" version nito bago i-insert sa innerHTML, para hindi
// tumakbo bilang code ang anumang <script> o HTML na nailagay ng user
// (halimbawa: sa fullname, violation description, section, atbp.)
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', () => {

    // ==========================================================
    // 1. MOBILE MENU TOGGLE (BURGER & CLOSE BUTTONS)
    // ==========================================================
    const menuToggle = document.getElementById('menuToggle');
    const closeMenu = document.getElementById('closeMenu');
    const menu = document.getElementById('menu');

    if (menuToggle && menu) {
        menuToggle.addEventListener('click', () => {
            menu.classList.add('open');
        });
    }

    if (closeMenu && menu) {
        closeMenu.addEventListener('click', () => {
            menu.classList.remove('open');
        });
    }

    // ==========================================================
    // 2. NAVIGATION TABS (DASHBOARD / STUDENTS / PENDING TEACHERS / ...)
    // ==========================================================
    const navDashboard = document.getElementById('navDashboard');
    const navStudents = document.getElementById('navStudents');
    const navPending = document.getElementById('navPending');
    const navMessages = document.getElementById('navMessages');
    const navHandbook = document.getElementById('navHandbook');
    const navSettings = document.getElementById('navSettings');
    const navProfile = document.getElementById('navProfile');
    const dashboardSection = document.getElementById('dashboard-section');
    const studentsSection = document.getElementById('students-section');
    const pendingSection = document.getElementById('pending-section');
    const messagesSection = document.getElementById('messages-section');
    const handbookSection = document.getElementById('handbook-section');
    const settingsSection = document.getElementById('settings-section');
    const profileSection = document.getElementById('profile-section');

    // Generalized: lahat ng .page-section / .link ang naka-apektuhan
    // (hindi lang ang orihinal 4), para tama pa rin kahit anong tab
    // ang huling na-activate (kasama na ang Handbook at Settings).
    function showSection(section, navBtn) {
        if (!section || !navBtn) return;
        document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.nav-links .link').forEach(n => n.classList.remove('active'));
        section.classList.add('active');
        navBtn.classList.add('active');
        if (menu) menu.classList.remove('open');
    }

    // FIX: Hinati ang bawat nav button sa sarili nilang independent
    // na `if` block (may sariling null-check). Dati, magkakasama sila
    // sa IISANG `if (navDashboard && navStudents && navPending)` block
    // at ang navMessages.addEventListener ay WALANG sariling null-check
    // sa loob noon - kaya kapag na-null ang kahit isa sa mga elementong
    // ito (halimbawa dahil sa ibang page/partial na walang parehong
    // markup), mag-tha-throw ng TypeError ang buong callback at
    // titigil ang execution - kaya hindi na naka-attach ang listeners
    // ng Handbook, Settings, at Profile na nasa IBABA pa ng code.
    if (navDashboard && dashboardSection) {
        navDashboard.addEventListener('click', (e) => {
            e.preventDefault();
            showSection(dashboardSection, navDashboard);
        });
    }

    if (navStudents && studentsSection) {
        navStudents.addEventListener('click', (e) => {
            e.preventDefault();
            showSection(studentsSection, navStudents);
            loadAllStudentsList();
        });
    }

    if (navPending && pendingSection) {
        navPending.addEventListener('click', (e) => {
            e.preventDefault();
            showSection(pendingSection, navPending);
            loadPendingTeachers();
        });
    }

    if (navMessages && messagesSection) {
        navMessages.addEventListener('click', (e) => {
            e.preventDefault();
            showSection(messagesSection, navMessages);
            loadMessages();
        });
    }

    if (navHandbook && handbookSection) {
        navHandbook.addEventListener('click', (e) => {
            e.preventDefault();
            showSection(handbookSection, navHandbook);
        });
    }

    if (navSettings && settingsSection) {
        navSettings.addEventListener('click', (e) => {
            e.preventDefault();
            showSection(settingsSection, navSettings);
        });
    }

    if (navProfile && profileSection) {
        navProfile.addEventListener('click', (e) => {
            e.preventDefault();
            showSection(profileSection, navProfile);
        });
    }

    // ==========================================================
    // 3. FETCH ADMIN PROFILE DATA
    // ==========================================================
    fetch('/api/user-profile.php')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.user) {
                document.querySelectorAll('.js-admin-name').forEach(el => {
                    el.textContent = data.user.fullname || 'Admin';
                });
                document.querySelectorAll('.js-admin-role').forEach(el => {
                    el.textContent = data.user.role || 'admin';
                });
            }
        })
        .catch(err => console.error('Error fetching admin profile:', err));

    // Initial Loading ng Data pagka-open ng page
    loadViolations();
    loadStudentsSelect();
    loadUserAccounts();
    updatePendingBadge();
    updateMessageBadge();

    // Profile Picture Upload
    const changePicBtn = document.getElementById('changePicBtn');
    const profilePicInput = document.getElementById('profilePicInput');
    if (changePicBtn && profilePicInput) {
        changePicBtn.addEventListener('click', () => profilePicInput.click());
        profilePicInput.addEventListener('change', () => uploadProfilePic(profilePicInput, null));
    }

    // ==========================================================
    // 4. LOGOUT FUNCTIONALITY
    // ==========================================================
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            fetch('/api/logout.php', { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        window.location.href = data.redirect || '/login.html';
                    }
                })
                .catch(err => console.error('Error during logout:', err));
        });
    }

    // ==========================================================
    // 5. LIVE SEARCH FILTER FOR TABLES
    // ==========================================================
    const searchViolationInput = document.getElementById('searchViolationInput');
    if (searchViolationInput) {
        searchViolationInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('#violationTableBody tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(query) ? '' : 'none';
            });
        });
    }

    // ==========================================================
    // 6. "SAVE VIOLATION" BUTTON
    // ==========================================================
    const addViolationBtn = document.getElementById('addViolationBtn');
    if (addViolationBtn) {
        addViolationBtn.addEventListener('click', addViolation);
    }

    // Live student search habang nagta-type sa Add Violation box -
    // debounced (300ms) para hindi sobrang dami ng request sa server
    // sa bawat pindot ng titik.
    const targetStudentInputEl = document.getElementById('targetStudentInput');
    if (targetStudentInputEl) {
        targetStudentInputEl.addEventListener('input', () => {
            clearTimeout(studentSearchDebounceTimer);
            studentSearchDebounceTimer = setTimeout(updateStudentMatch, 300);
        });
    }

    // ==========================================================
    // 7. EVENT DELEGATION PARA SA MGA DYNAMIC NA BUTTON
    // ==========================================================
    // Sa halip na gumamit ng onclick="..." sa loob ng template strings
    // (na hinaharang ng Content-Security-Policy), tinatawag natin ang
    // tamang function gamit ang data-action / data-id attributes.
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.getAttribute('data-action');
        const id = Number(btn.getAttribute('data-id'));

        switch (action) {
            case 'delete-violation':
                deleteViolation(id);
                break;
            case 'approve-teacher':
                approveTeacher(id);
                break;
            case 'reject-teacher':
                rejectTeacher(id);
                break;
            case 'delete-user':
                deleteUserAccount(id);
                break;
        }
    });
});

// ==========================================================
// 6. API & DATA MANAGEMENT FUNCTIONS
// ==========================================================

// A. Load All Violations Log Table
function loadViolations() {
    fetch('/api/violations-list.php')
        .then(res => res.json())
        .then(data => {
            const tbody = document.getElementById('violationTableBody');
            if (!data.success || !data.violations || data.violations.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: #666;">Walang nakatalagang violation logs sa kasalukuyan.</td></tr>';
                return;
            }

            tbody.innerHTML = data.violations.map(v => `
                <tr>
                    <td>${escapeHtml(v.date_reported ? new Date(v.date_reported).toLocaleDateString() : 'N/A')}</td>
                    <td><strong>${escapeHtml(v.lrn)}</strong></td>
                    <td>${escapeHtml(v.student_name || 'N/A')}</td>
                    <td>${escapeHtml(v.adviser || 'N/A')}</td>
                    <td>${escapeHtml(v.violation_type || v.description)}</td>
                    <td><span class="badge-role">${escapeHtml(v.category || 'Minor')}</span></td>
                    <td>
                        <button class="btn-delete" data-action="delete-violation" data-id="${Number(v.id)}">Delete</button>
                    </td>
                </tr>
            `).join('');
        })
        .catch(err => {
            console.error('Error loading violations:', err);
            document.getElementById('violationTableBody').innerHTML = '<tr><td colspan="7" style="text-align:center; color: red;">Failed to load violations.</td></tr>';
        });
}

// B. Load Student Search Suggestions (Datalist)
function loadStudentsSelect() {
    fetch('/api/students-search.php?q=')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.students) {
                studentsList = data.students; // Save globally
                const datalist = document.getElementById('studentOptions');

                // Populate Datalist options
                datalist.innerHTML = data.students.map(s =>
                    `<option value="${escapeHtml(s.fullname)} (${escapeHtml(s.student_id)})">`
                ).join('');
            } else {
                // PANSAMANTALA: para makita kung bakit walang na-load
                // na students list (kung ito ang tunay na dahilan).
                console.error('Hindi na-load ang students list:', data.message, data.debug || '');
            }
        })
        .catch(err => console.error('Error fetching students list:', err));
}

// Hinahanap sa server ang estudyante base sa kasalukuyang laman ng
// targetStudentInput (Name o LRN), habang nagta-type - kaya walang
// pag-parse/pag-hula ng text, ang totoong search endpoint na ang
// direktang nagsasabi kung sino ang tumutugma. Ito rin ang parehong
// paraan na ginagamit (at napatunayang gumagana) sa teacher side.
async function updateStudentMatch() {
    const statusEl = document.getElementById('studentMatchStatus');
    const inputValue = document.getElementById('targetStudentInput').value.trim();

    selectedViolationStudent = null;
    if (!inputValue) {
        if (statusEl) statusEl.textContent = '';
        return;
    }

    try {
        const res = await fetch(`/api/students-search.php?q=${encodeURIComponent(inputValue)}`);
        const data = await res.json();

        if (data.success && data.students && data.students.length > 0) {
            studentsList = data.students;
            selectedViolationStudent = data.students[0];
            if (statusEl) {
                statusEl.style.color = '#1a7a1a';
                statusEl.textContent = `✅ ${data.students[0].fullname} (${data.students[0].student_id})` +
                    (data.students.length > 1 ? ` — +${data.students.length - 1} pang tugma, i-refine ang search` : '');
            }
        } else {
            if (statusEl) {
                statusEl.style.color = '#b00020';
                statusEl.textContent = '❌ Walang tumutugmang estudyante';
            }
        }
    } catch (err) {
        console.error('Student match search error:', err);
        if (statusEl) {
            statusEl.style.color = '#b00020';
            statusEl.textContent = '🚨 Hindi makakonekta sa server para mag-search';
        }
    }
}

// C. Save New Violation
async function addViolation() {
    if (isOffline()) {
        alert('⚠️ Walang internet connection. Hindi ma-se-save ang aksyon na ito hangga\'t hindi bumabalik ang koneksyon.');
        return;
    }

    const studentInputValue = document.getElementById('targetStudentInput').value.trim();
    const violationName = document.getElementById('violationName').value.trim();
    const category = document.getElementById('violationCategory').value;

    // Kung hindi pa na-resolve (hal. mabilis na na-type at na-click agad
    // bago pa matapos ang live search), subukan muna ulit dito bago
    // sabihing "invalid" - para hindi na-race condition ang totoong isyu.
    if (!selectedViolationStudent && studentInputValue) {
        await updateStudentMatch();
    }

    const selectedStudent = selectedViolationStudent;

    if (!selectedStudent) {
        alert('Paki-pili o paki-search ang valid na estudyante mula sa listahan.');
        return;
    }

    if (!violationName) {
        alert('Paki-lagay ang pangalan o detalye ng violation.');
        return;
    }

    fetch('/api/violations-add.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            student_id: selectedStudent.id,
            violation_type: violationName,
            description: violationName,
            category: category
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            alert('Matagumpay na naisaad ang violation!');
            document.getElementById('targetStudentInput').value = '';
            document.getElementById('violationName').value = '';
            const statusEl = document.getElementById('studentMatchStatus');
            if (statusEl) statusEl.textContent = '';
            selectedViolationStudent = null;
            loadViolations(); // Refresh table
        } else {
            // PANSAMANTALA: ipinapakita rin ang debug info para malaman
            // ang totoong dahilan ng error. Aalisin din ito pagkatapos.
            alert('Error: ' + (data.message || 'Hindi maidagdag ang violation.') + (data.debug ? '\n\nDEBUG: ' + data.debug : ''));
        }
    })
    .catch(err => {
        console.error('Error adding violation:', err);
        alert('May nangyaring error sa pag-save.');
    });
}

// D. Delete Violation Record
function deleteViolation(id) {
    if (isOffline()) {
        alert('⚠️ Walang internet connection. Hindi ma-se-save ang aksyon na ito hangga\'t hindi bumabalik ang koneksyon.');
        return;
    }

    if (confirm('Sigurado ka bang gusto mong burahin ang record na ito?')) {
        fetch(`/api/violations-delete.php?id=${id}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    loadViolations(); // Refresh table
                } else {
                    alert('Hindi nabura: ' + data.message);
                }
            })
            .catch(err => console.error('Error deleting violation:', err));
    }
}

// E. Load All Students Directory Table (For Tab 2)
function loadAllStudentsList() {
    fetch('/api/students-search.php?q=')
        .then(res => res.json())
        .then(data => {
            const tbody = document.getElementById('allStudentsTableBody');
            if (!data.success || !data.students || data.students.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Walang rehistradong estudyante.</td></tr>';
                return;
            }

            tbody.innerHTML = data.students.map(s => `
                <tr>
                    <td><strong>${escapeHtml(s.student_id || 'N/A')}</strong></td>
                    <td>${escapeHtml(s.fullname)}</td>
                    <td>${escapeHtml(s.section || 'N/A')}</td>
                    <td>${escapeHtml(s.adviser || 'N/A')}</td>
                    <td>${escapeHtml(s.email || 'N/A')}</td>
                    <td>
                        <button style="padding: 4px 8px; background: #004085; color: white; border: none; border-radius: 4px; cursor: pointer;">View Profile</button>
                    </td>
                </tr>
            `).join('');
        });
}

// F. Load Pending Teacher Applications
function loadPendingTeachers() {
    fetch('/api/admin-pending-teachers.php')
        .then(res => res.json())
        .then(data => {
            const tbody = document.getElementById('pendingTeacherTableBody');
            if (!data.success || !data.teachers || data.teachers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: #666;">Walang naghihintay na Teacher application.</td></tr>';
                return;
            }

            tbody.innerHTML = data.teachers.map(t => `
                <tr>
                    <td>${escapeHtml(t.student_id || 'N/A')}</td>
                    <td><strong>${escapeHtml(t.fullname)}</strong></td>
                    <td>${escapeHtml(t.email)}</td>
                    <td>
                        <button class="btn-approve" style="padding: 6px 12px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 6px;" data-action="approve-teacher" data-id="${Number(t.id)}">✅ Approve</button>
                        <button class="btn-delete" data-action="reject-teacher" data-id="${Number(t.id)}">❌ Reject</button>
                    </td>
                </tr>
            `).join('');
        })
        .catch(err => {
            console.error('Error loading pending teachers:', err);
            document.getElementById('pendingTeacherTableBody').innerHTML = '<tr><td colspan="4" style="text-align:center; color: red;">Failed to load pending teachers.</td></tr>';
        });
}

// G. Approve a Pending Teacher
function approveTeacher(id) {
    if (isOffline()) {
        alert('⚠️ Walang internet connection. Hindi ma-se-save ang aksyon na ito hangga\'t hindi bumabalik ang koneksyon.');
        return;
    }

    fetch(`/api/admin-approve-teacher.php?id=${id}`, { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert('Na-approve na ang Teacher account!');
                loadPendingTeachers();
                loadUserAccounts();
                updatePendingBadge();
            } else {
                alert('Error: ' + (data.message || 'Hindi na-approve ang teacher.'));
            }
        })
        .catch(err => console.error('Error approving teacher:', err));
}

// H. Reject a Pending Teacher
function rejectTeacher(id) {
    if (isOffline()) {
        alert('⚠️ Walang internet connection. Hindi ma-se-save ang aksyon na ito hangga\'t hindi bumabalik ang koneksyon.');
        return;
    }

    if (confirm('Sigurado ka bang gusto mong i-reject ang application na ito?')) {
        fetch(`/api/admin-reject-teacher.php?id=${id}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    loadPendingTeachers();
                    updatePendingBadge();
                } else {
                    alert('Error: ' + (data.message || 'Hindi na-reject ang application.'));
                }
            })
            .catch(err => console.error('Error rejecting teacher:', err));
    }
}

// I. Update the "Pending Teachers" badge count sa nav menu
function updatePendingBadge() {
    fetch('/api/admin-pending-teachers.php')
        .then(res => res.json())
        .then(data => {
            const badge = document.getElementById('pendingBadge');
            if (!badge) return;
            const count = (data.success && data.teachers) ? data.teachers.length : 0;
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        })
        .catch(err => console.error('Error checking pending count:', err));
}

// J. Load All Account Users (Teachers & Admins)
function loadUserAccounts() {
    fetch('/api/admin-users.php')
        .then(res => res.json())
        .then(data => {
            const tbody = document.getElementById('userTableBody');
            if (!data.success || !data.users || data.users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: #666;">Walang ibang rehistradong Teacher/Admin account.</td></tr>';
                return;
            }

            tbody.innerHTML = data.users.map(u => `
                <tr>
                    <td>${escapeHtml(u.student_id || 'N/A')}</td>
                    <td><strong>${escapeHtml(u.fullname)}</strong></td>
                    <td><span class="badge-role">${escapeHtml(u.role)}</span></td>
                    <td>${escapeHtml(u.email || 'N/A')}</td>
                    <td>
                        ${u.role.toLowerCase() === 'admin'
                            ? '<span style="color:#888;">—</span>'
                            : `<button class="btn-delete" data-action="delete-user" data-id="${Number(u.id)}">Delete</button>`}
                    </td>
                </tr>
            `).join('');
        })
        .catch(err => {
            console.error('Error loading user accounts:', err);
            document.getElementById('userTableBody').innerHTML = '<tr><td colspan="5" style="text-align:center; color: red;">Failed to load accounts.</td></tr>';
        });
}

// K. Delete a Teacher/Admin Account
function deleteUserAccount(id) {
    if (isOffline()) {
        alert('⚠️ Walang internet connection. Hindi ma-se-save ang aksyon na ito hangga\'t hindi bumabalik ang koneksyon.');
        return;
    }

    if (confirm('Sigurado ka bang gusto mong burahin ang account na ito?')) {
        fetch(`/api/admin-users-delete.php?id=${id}`, { method: 'DELETE' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    loadUserAccounts();
                } else {
                    alert('Hindi nabura: ' + data.message);
                }
            })
            .catch(err => console.error('Error deleting user:', err));
    }
}

// L. Load Messages mula sa Students/Teachers
function loadMessages() {
    fetch('/api/messages-list.php')
        .then(res => res.json())
        .then(data => {
            const tbody = document.getElementById('messagesTableBody');
            if (!data.success || !data.messages || data.messages.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color: #666;">Walang mensaheng natanggap.</td></tr>';
                return;
            }

            tbody.innerHTML = data.messages.map(m => `
                <tr>
                    <td>${escapeHtml(m.created_at ? new Date(m.created_at).toLocaleString() : 'N/A')}</td>
                    <td><strong>${escapeHtml(m.sender_name)}</strong></td>
                    <td><span class="badge-role">${escapeHtml(m.sender_role)}</span></td>
                    <td>${escapeHtml(m.message)}</td>
                </tr>
            `).join('');

            // I-mark na read lahat pagkatapos ma-view
            data.messages.filter(m => !m.is_read).forEach(m => {
                fetch(`/api/messages-read.php?id=${m.id}`, { method: 'POST' }).catch(() => {});
            });
            setTimeout(updateMessageBadge, 500);
        })
        .catch(err => {
            console.error('Error loading messages:', err);
            document.getElementById('messagesTableBody').innerHTML = '<tr><td colspan="4" style="text-align:center; color: red;">Failed to load messages.</td></tr>';
        });
}

// M. Update ang badge count ng unread messages
function updateMessageBadge() {
    fetch('/api/messages-list.php')
        .then(res => res.json())
        .then(data => {
            const badge = document.getElementById('messageBadge');
            if (!badge) return;
            const count = (data.success && data.messages) ? data.messages.filter(m => !m.is_read).length : 0;
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        })
        .catch(err => console.error('Error checking message count:', err));
}

// N. Upload Profile Picture
// FIX: Ito ang function na tinatawag sa `profilePicInput` change event
// pero WALA sa orihinal na file - kaya nagre-ReferenceError kapag
// pumili ng larawan ang admin. Basic FormData upload flow ito;
// i-adjust ang endpoint pangalan (/api/upload-profile-pic.php) at ang
// response field (data.image_url) kung iba ang tunay na API mo.
function uploadProfilePic(inputEl, extraFormData) {
    if (!inputEl || !inputEl.files || inputEl.files.length === 0) return;

    if (isOffline()) {
        alert('⚠️ Walang internet connection. Hindi ma-a-upload ang larawan hangga\'t hindi bumabalik ang koneksyon.');
        return;
    }

    const file = inputEl.files[0];
    const formData = new FormData();
    formData.append('profile_pic', file);

    if (extraFormData && typeof extraFormData === 'object') {
        Object.keys(extraFormData).forEach(key => formData.append(key, extraFormData[key]));
    }

    fetch('/api/upload-profile-pic.php', {
        method: 'POST',
        body: formData
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const adminImg = document.getElementById('adminImg');
                if (adminImg && data.image_url) {
                    adminImg.src = data.image_url;
                }
                alert('Matagumpay na na-update ang profile picture!');
            } else {
                alert('Error: ' + (data.message || 'Hindi na-upload ang larawan.'));
            }
        })
        .catch(err => {
            console.error('Error uploading profile pic:', err);
            alert('May nangyaring error sa pag-upload ng larawan.');
        })
        .finally(() => {
            inputEl.value = '';
        });
}