// Fallback function - kung sakaling hindi na-load ang offline-banner.js
// (missing file, mali ang path, atbp.), hindi dapat masira ang core
// functionality ng page dahil lang dito.
if (typeof isOffline === 'undefined') {
    function isOffline() {
        return typeof navigator !== 'undefined' && 'onLine' in navigator ? !navigator.onLine : false;
    }
}

// ==========================================================
// 0. XSS PROTECTION HELPER
// ==========================================================
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
    // 1. FETCH LOGGED-IN STUDENT PROFILE DATA
    // ==========================================================
    fetch('/api/user-profile.php')
        .then(res => res.json())
        .then(data => {
            if (data.success && data.user) {
                // Set Student Name
                const nameElement = document.getElementById('studentName');
                if (nameElement) {
                    nameElement.textContent = data.user.fullname || 'Student';
                }
                
                // Set Student ID / LRN
                const idElement = document.getElementById('studentIdDisplay');
                if (idElement) {
                    idElement.textContent = data.user.student_id || data.user.lrn || 'N/A';
                }
                
                // Set Profile Picture (kung may custom profile pic o default)
                const imgElement = document.getElementById('studentImg');
                if (imgElement && data.user.profile_pic) {
                    imgElement.src = data.user.profile_pic;
                }
            } else {
                // Kung walang session, i-redirect sa login
                window.location.href = '/login.html';
            }
        })
        .catch(err => {
            console.error('Error loading student profile:', err);
        });
    
    // ==========================================================
    // 2. FETCH STUDENT'S OWN VIOLATION RECORDS
    // ==========================================================
    loadMyViolations();

    // ==========================================================
    // 2b. PROFILE PICTURE UPLOAD
    // ==========================================================
    const changePicBtn = document.getElementById('changePicBtn');
    const profilePicInput = document.getElementById('profilePicInput');
    if (changePicBtn && profilePicInput) {
        changePicBtn.addEventListener('click', () => profilePicInput.click());
        profilePicInput.addEventListener('change', () => uploadProfilePic(profilePicInput, 'studentImg'));
    }

    // ==========================================================
    // 2c. MESSAGE ADMIN
    // ==========================================================
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

    // ==========================================================
    // 3. LOGOUT SYSTEM
    // ==========================================================
    const logoutBtn = document.querySelector('a.log');
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
                .catch(err => {
                    console.error('Error during logout:', err);
                    window.location.href = '/login.html';
                });
        });
    }
});

// ==========================================================
// FUNCTION: LOAD & DISPLAY VIOLATIONS
// ==========================================================
function loadMyViolations() {
    fetch('/api/violations-list.php')
        .then(res => res.json())
        .then(data => {
            const tbody = document.getElementById('studentViolationTableBody');
            const offenseCountElement = document.getElementById('offenseCount');
            
            if (!tbody) return;
            
            // Check kung may violations o wala
            if (!data.success || !data.violations || data.violations.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align: center; color: #28a745; font-weight: 600; padding: 20px;">
                            🎉 Walang nakatalagang violation sa account mo. Malinis ang iyong record!
                        </td>
                    </tr>
                `;
                if (offenseCountElement) offenseCountElement.textContent = '0';
                return;
            }
            
            // Update Total Offenses Count Card
            if (offenseCountElement) {
                offenseCountElement.textContent = data.violations.length;
            }
            
            // Populate Table Rows
            tbody.innerHTML = data.violations.map(v => {
                const dateFormatted = new Date(v.date_reported || v.created_at).toLocaleDateString();
                const category = v.category || 'Minor';
                const status = v.status || 'Pending';
                
                // Category Badge Style
                let categoryColor = '#17a2b8'; // Default blue
                if (category.toLowerCase() === 'major') {
                    categoryColor = '#dc3545'; // Red for Major
                }
                
                // Status Badge Style
                let statusColor = '#ffc107'; // Yellow for Pending
                if (status.toLowerCase() === 'resolved' || status.toLowerCase() === 'cleared') {
                    statusColor = '#28a745'; // Green for Cleared
                }
                
                return `
                    <tr>
                        <td>${escapeHtml(dateFormatted)}</td>
                        <td><strong>${escapeHtml(v.violation_type || v.description)}</strong></td>
                        <td>
                            <span style="background: ${categoryColor}; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">
                                ${escapeHtml(category)}
                            </span>
                        </td>
                        <td>
                            <span style="background: ${statusColor}; color: ${statusColor === '#ffc107' ? '#333' : 'white'}; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: 600;">
                                ${escapeHtml(status)}
                            </span>
                        </td>
                    </tr>
                `;
            }).join('');
        })
        .catch(err => {
            console.error('Error fetching student violations:', err);
            const tbody = document.getElementById('studentViolationTableBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Hindi ma-load ang records. Paki-refresh ang page.</td></tr>';
            }
        });
}