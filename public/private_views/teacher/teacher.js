// Fallback function - kung sakaling hindi na-load ang offline-banner.js
// (missing file, mali ang path, atbp.), hindi dapat masira ang core
// functionality ng page dahil lang dito.
if (typeof isOffline === 'undefined') {
    function isOffline() {
        return typeof navigator !== 'undefined' && 'onLine' in navigator ? !navigator.onLine : false;
    }
}

// ==========================================
// 0. XSS PROTECTION HELPER
// ==========================================
// Kinukumbert ang mga espesyal na HTML character bago i-insert sa
// innerHTML, para hindi tumakbo bilang code ang HTML/<script> na
// nailagay sa violation description, student name, atbp.
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Global: hawak ang huling nahanap na student record (id, fullname, atbp.)
let selectedStudent = null;

document.addEventListener("DOMContentLoaded", function() {
    // 1. I-load ang Teacher Profile at Violations kapag binuksan ang page
    loadTeacherProfile();
    fetchViolations();
    fetchMyStudents();

    // 2. Search Student Event
    const searchBtn = document.querySelector(".btn-search");
    if (searchBtn) {
        searchBtn.addEventListener("click", searchStudent);
    }

    // 3. Add Violation Form Submit Event
    const addForm = document.getElementById("addViolationForm");
    if (addForm) {
        addForm.addEventListener("submit", handleAddViolation);
    }

    // 4. Logout Event
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
    }

    // 4b. Profile Picture Upload
    const changePicBtn = document.getElementById('changePicBtn');
    const profilePicInput = document.getElementById('profilePicInput');
    if (changePicBtn && profilePicInput) {
        changePicBtn.addEventListener('click', () => profilePicInput.click());
        profilePicInput.addEventListener('change', () => uploadProfilePic(profilePicInput, 'teacherImg'));
    }

    // 4c. Message Admin
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    if (sendMessageBtn) {
        sendMessageBtn.addEventListener('click', sendMessageToAdmin);
    }

    function sendMessageToAdmin() {
        if (isOffline()) {
            alert('⚠️ Walang internet connection. Hindi ma-se-send ang mensahe hangga\'t hindi bumabalik ang koneksyon.');
            return;
        }

        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();

        if (!message) {
            alert('Paki-lagay muna ang iyong mensahe bago ipadala.');
            return;
        }

        sendMessageBtn.disabled = true;

        fetch('/api/messages-send.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert('✅ ' + (data.message || 'Naipadala ang mensahe.'));
                messageInput.value = '';
            } else {
                alert('❌ ' + (data.message || 'Hindi naipadala ang mensahe.'));
            }
        })
        .catch(err => {
            console.error('Error sending message:', err);
            alert('🚨 May error sa pagpapadala ng mensahe.');
        })
        .finally(() => {
            sendMessageBtn.disabled = false;
        });
    }

    // 5. Event Delegation para sa mga dynamic na Delete button
    // (kapalit ng inline onclick, para gumana ang Content-Security-Policy)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="delete-violation"]');
        if (!btn) return;
        const id = Number(btn.getAttribute('data-id'));
        deleteViolation(id);
    });
});

// ==========================================
// A. FETCH TEACHER PROFILE
// ==========================================
async function loadTeacherProfile() {
    try {
        const response = await fetch('/api/user-profile.php');
        const data = await response.json();

        if (response.ok && data.success && data.user) {
            document.getElementById("teacherName").textContent = data.user.fullname || "Teacher";
            document.getElementById("userRole").textContent = data.user.role || "Faculty";
            const img = document.getElementById('teacherImg');
            if (img && data.user.profile_pic) img.src = data.user.profile_pic;
        } else {
            // Kung walang aktibong session, ibalik sa login screen
            window.location.href = "/login.html";
        }
    } catch (error) {
        console.error("Error loading profile:", error);
    }
}

// ==========================================
// B. SEARCH STUDENT FUNCTION
// ==========================================
async function searchStudent() {
    const studentInput = document.getElementById("student-list");
    const query = studentInput.value.trim();

    if (!query) {
        alert("⚠️ Maglagay ng Pangalan o LRN ng estudyante para mag-search.");
        return;
    }

    try {
        const response = await fetch(`/api/students-search.php?q=${encodeURIComponent(query)}`);
        const result = await response.json();

        if (result.success && result.students && result.students.length > 0) {
            const student = result.students[0];
            selectedStudent = student;
            alert(`✅ Nahanap!\nEstudyante: ${student.fullname}\nLRN: ${student.student_id}`);
            studentInput.value = `${student.fullname} (${student.student_id})`;
        } else {
            alert("❌ Walang estudyanteng tumutugma sa iyong inilagay.");
            selectedStudent = null;
        }
    } catch (error) {
        console.error("Search Error:", error);
        alert("🚨 Hindi makakonekta sa server para mag-search.");
    }
}

// ==========================================
// C. ADD VIOLATION RECORD
// ==========================================
async function handleAddViolation(e) {
    e.preventDefault();
    if (isOffline()) {
        alert('⚠️ Walang internet connection. Hindi ma-se-save ang aksyon na ito hangga\'t hindi bumabalik ang koneksyon.');
        return;
    }


    const offenseDescription = document.getElementById("offenseDescription").value.trim();
    const category = document.getElementById("category").value;

    if (!selectedStudent) {
        alert("⚠️ Paki-search at piliin muna ang estudyante bago mag-submit.");
        return;
    }

    if (!offenseDescription) {
        alert("⚠️ Paki-lagay ang detalye ng violation.");
        return;
    }

    const payload = {
        student_id: selectedStudent.id,
        violation_type: offenseDescription,
        description: offenseDescription,
        category: category
    };

    try {
        const response = await fetch('/api/violations-add.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.success) {
            alert("✅ Naitala nang matagumpay ang violation record!");

            // Clear Form inputs
            document.getElementById("addViolationForm").reset();
            selectedStudent = null;

            // I-refresh ang Table sa kanan
            fetchViolations();
        } else {
            // Ipinapakita rin ang debug info (kung meron) para makita ang
            // TOTOONG dahilan ng pagkabigo - dati nakatago ito kaya hindi
            // alam kung bakit "ayaw mag-record" ang violation.
            alert("❌ " + (result.message || "Bigo sa pag-save ng record.") + (result.debug ? "\n\nDEBUG: " + result.debug : ""));
        }
    } catch (error) {
        console.error("Save Error:", error);
        alert("🚨 Hindi maikonekta sa server.");
    }
}

// ==========================================
// D. FETCH ALL RECORDED VIOLATIONS
// ==========================================
async function fetchViolations() {
    const tableBody = document.getElementById("violationTableBody");

    try {
        const response = await fetch('/api/violations-list.php');
        const result = await response.json();

        if (result.success && result.violations && result.violations.length > 0) {
            tableBody.innerHTML = ""; // Linisin ang "Loading..."

            result.violations.forEach(item => {
                const row = document.createElement("tr");
                const dateFormatted = item.date_reported ? new Date(item.date_reported).toLocaleDateString() : 'N/A';
                const category = item.category || 'Minor';

                row.innerHTML = `
                    <td>${escapeHtml(dateFormatted)}</td>
                    <td><strong>${escapeHtml(item.student_name)}</strong></td>
                    <td>${escapeHtml(item.lrn)}</td>
                    <td>${escapeHtml(item.adviser || 'N/A')}</td>
                    <td>${escapeHtml(item.violation_type || item.description)}</td>
                    <td>
                        <span style="color: ${category === 'Major' ? '#ef4444' : (category === 'Grave' ? '#991b1b' : '#3b82f6')}; font-weight: bold;">
                            ${escapeHtml(category)}
                        </span>
                    </td>
                    <td>
                        <button type="button" data-action="delete-violation" data-id="${Number(item.id)}" style="background:#ef4444; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">
                            Delete
                        </button>
                    </td>
                `;
                tableBody.appendChild(row);
            });
        } else {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px; color:#888;">Walang naitatalang violation sa kasalukuyan.</td></tr>`;
        }
    } catch (error) {
        console.error("Fetch Violations Error:", error);
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red; padding:20px;">Error sa pag-load ng records.</td></tr>`;
    }
}

// ==========================================
// D2. FETCH MY STUDENTS (mga estudyanteng ang adviser ay ako)
// ==========================================
async function fetchMyStudents() {
    const tableBody = document.getElementById("myStudentsTableBody");
    if (!tableBody) return;

    try {
        const response = await fetch('/api/my-students.php');
        const result = await response.json();

        if (result.success && result.students && result.students.length > 0) {
            tableBody.innerHTML = "";

            result.students.forEach(s => {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td>${escapeHtml(s.student_id)}</td>
                    <td><strong>${escapeHtml(s.fullname)}</strong></td>
                    <td>${escapeHtml(s.section || 'N/A')}</td>
                    <td>${escapeHtml(s.email)}</td>
                `;
                tableBody.appendChild(row);
            });
        } else {
            tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#888;">Wala pang estudyanteng naka-rehistro sa iyo bilang adviser.</td></tr>`;
        }
    } catch (error) {
        console.error("Fetch My Students Error:", error);
        tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:red; padding:20px;">Error sa pag-load ng listahan.</td></tr>`;
    }
}

// ==========================================
// E. DELETE VIOLATION RECORD
// ==========================================
async function deleteViolation(id) {
    if (isOffline()) {
        alert('⚠️ Walang internet connection. Hindi ma-se-save ang aksyon na ito hangga\'t hindi bumabalik ang koneksyon.');
        return;
    }

    if (!confirm("Sigurado ka bang gusto mong burahin ang record na ito?")) return;

    try {
        const response = await fetch(`/api/violations-delete.php?id=${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            alert("✅ Natanggal na ang record.");
            fetchViolations(); // Refresh ang table
        } else {
            alert("❌ " + (result.message || "Hindi nabura ang record."));
        }
    } catch (error) {
        console.error("Delete Error:", error);
        alert("🚨 Server error habang nagbubura.");
    }
}

// ==========================================
// F. LOGOUT HANDLER
// ==========================================
async function handleLogout(e) {
    e.preventDefault();
    try {
        await fetch('/api/logout.php', { method: 'POST' });
        window.location.href = "/login.html";
    } catch (error) {
        window.location.href = "/login.html";
    }
}