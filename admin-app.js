// Configuration
const CONFIG = {
    API_BASE_URL: '/.netlify/functions',
    REFRESH_INTERVAL: 10000, // 10 seconds
};

// State
let sessionToken = null;
let refreshInterval = null;
let pendingAction = null;

// DOM Elements - Login
const loginPage = document.getElementById('login-page');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');

// DOM Elements - Dashboard
const dashboardPage = document.getElementById('dashboard-page');
const roomsContainer = document.getElementById('rooms-container');
const pendingContainer = document.getElementById('pending-container');
const roomCount = document.getElementById('room-count');
const pendingCount = document.getElementById('pending-count');
const refreshDashboard = document.getElementById('refresh-dashboard');
const logoutBtn = document.getElementById('logout-btn');
const adminToast = document.getElementById('admin-toast');

// DOM Elements - Modal
const confirmModal = document.getElementById('confirm-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');

// Initialize
function init() {
    // Check for existing session
    sessionToken = sessionStorage.getItem('admin_token');
    
    if (sessionToken) {
        showDashboard();
    } else {
        showLogin();
    }

    // Event listeners
    loginForm.addEventListener('submit', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    refreshDashboard.addEventListener('click', () => loadDashboardData(true));
    modalCancel.addEventListener('click', closeModal);
    modalConfirm.addEventListener('click', executeAction);
}

// Show login page
function showLogin() {
    loginPage.classList.remove('hidden');
    dashboardPage.classList.add('hidden');
}

// Show dashboard
function showDashboard() {
    loginPage.classList.add('hidden');
    dashboardPage.classList.remove('hidden');
    loadDashboardData();
    startAutoRefresh();
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';
    loginError.classList.add('hidden');

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/adminLogin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();

        if (response.ok) {
            sessionToken = data.token;
            sessionStorage.setItem('admin_token', sessionToken);
            showDashboard();
        } else {
            loginError.textContent = data.message || 'Invalid credentials';
            loginError.classList.remove('hidden');
        }
    } catch (error) {
        console.error('Login error:', error);
        loginError.textContent = 'Unable to connect. Please try again.';
        loginError.classList.remove('hidden');
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
    }
}

// Handle logout
function handleLogout() {
    sessionToken = null;
    sessionStorage.removeItem('admin_token');
    stopAutoRefresh();
    showLogin();
    loginForm.reset();
}

// Load dashboard data
async function loadDashboardData(isManualRefresh = false) {
    if (isManualRefresh) {
        refreshDashboard.style.animation = 'spin 1s linear';
    }

    try {
        await Promise.all([
            loadRoomStatus(),
            loadPendingRequests(),
        ]);

        if (isManualRefresh) {
            showToast('Dashboard updated', 'success');
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        if (error.message === 'Unauthorized') {
            handleLogout();
        }
    } finally {
        if (isManualRefresh) {
            setTimeout(() => {
                refreshDashboard.style.animation = '';
            }, 1000);
        }
    }
}

// Load room status
async function loadRoomStatus() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/adminGetRoomStatus`, {
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
            },
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Unauthorized');
            }
            throw new Error('Failed to load rooms');
        }

        const rooms = await response.json();
        renderRooms(rooms);
    } catch (error) {
        console.error('Error loading rooms:', error);
        roomsContainer.innerHTML = '<div class="empty-state">Failed to load rooms</div>';
        throw error;
    }
}

// Render rooms
function renderRooms(rooms) {
    roomCount.textContent = rooms.length;

    if (rooms.length === 0) {
        roomsContainer.innerHTML = '<div class="empty-state">No rooms available</div>';
        return;
    }

    roomsContainer.innerHTML = rooms.map(room => {
        const isOccupied = room.current_booking !== null;
        
        return `
            <div class="room-card ${isOccupied ? 'occupied' : ''}">
                <div class="room-info">
                    <h3>${escapeHtml(room.name)}</h3>
                    <div class="room-details">
                        ${isOccupied ? `
                            Student: ${escapeHtml(room.current_booking.student_id)}<br>
                            Until: ${formatTime(room.current_booking.end_time)}
                        ` : 'Available'}
                    </div>
                </div>
                <div class="room-status">
                    <span class="status-dot ${isOccupied ? 'occupied' : 'available'}"></span>
                    ${isOccupied ? 'Occupied' : 'Available'}
                </div>
            </div>
        `;
    }).join('');
}

// Load pending requests
async function loadPendingRequests() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/adminGetPendingRequests`, {
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
            },
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Unauthorized');
            }
            throw new Error('Failed to load requests');
        }

        const requests = await response.json();
        renderPendingRequests(requests);
    } catch (error) {
        console.error('Error loading requests:', error);
        pendingContainer.innerHTML = '<div class="empty-state">Failed to load requests</div>';
        throw error;
    }
}

// Render pending requests
function renderPendingRequests(requests) {
    pendingCount.textContent = requests.length;

    if (requests.length === 0) {
        pendingContainer.innerHTML = '<div class="empty-state">No pending requests</div>';
        return;
    }

    pendingContainer.innerHTML = requests.map(request => `
        <div class="request-card" data-request-id="${request.id}">
            <div class="request-header">
                <div class="request-info">
                    <h4>Room ${escapeHtml(request.room_name)}</h4>
                    <div class="request-details">
                        Student ID: ${escapeHtml(request.student_id)}<br>
                        Time: ${formatTime(request.start_time)} - ${formatTime(request.end_time)}<br>
                        Duration: ${request.duration} min
                    </div>
                </div>
                <div class="request-time">
                    ${formatTimeAgo(request.created_at)}
                </div>
            </div>
            <div class="request-actions">
                <button class="btn btn-primary" onclick="approveRequest('${request.id}', '${escapeHtml(request.room_name)}', '${escapeHtml(request.student_id)}')">
                    Approve
                </button>
                <button class="btn btn-danger" onclick="rejectRequest('${request.id}', '${escapeHtml(request.room_name)}', '${escapeHtml(request.student_id)}')">
                    Reject
                </button>
            </div>
        </div>
    `).join('');
}

// Approve request
async function approveRequest(requestId, roomName, studentId) {
    pendingAction = {
        type: 'approve',
        requestId,
    };

    showModal(
        'Approve Request',
        `Approve room ${roomName} for student ${studentId}?`
    );
}

// Reject request
async function rejectRequest(requestId, roomName, studentId) {
    pendingAction = {
        type: 'reject',
        requestId,
    };

    showModal(
        'Reject Request',
        `Reject room ${roomName} request from student ${studentId}?`
    );
}

// Execute action
async function executeAction() {
    if (!pendingAction) return;

    // Store the action details BEFORE closing modal
    const { type, requestId } = pendingAction;
    
    closeModal();

    const endpoint = type === 'approve' ? 'adminApproveBooking' : 'adminRejectBooking';
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ request_id: requestId }),
        });

        const data = await response.json();

        if (response.ok) {
            showToast(`Request ${type}d successfully`, 'success');
            loadDashboardData();
        } else {
            showToast(data.message || `Failed to ${type} request`, 'error');
        }
    } catch (error) {
        console.error(`Error ${type}ing request:`, error);
        showToast(`Unable to ${type} request`, 'error');
    }
}

// Show modal
function showModal(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    confirmModal.classList.remove('hidden');
}

// Close modal
function closeModal() {
    confirmModal.classList.add('hidden');
    pendingAction = null;
}

// Show toast
function showToast(message, type = 'success') {
    adminToast.textContent = message;
    adminToast.className = `toast ${type}`;
    adminToast.classList.remove('hidden');

    setTimeout(() => {
        adminToast.classList.add('hidden');
    }, 4000);
}

// Format time
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

// Format time ago
function formatTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMinutes = Math.floor((now - past) / 60000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes === 1) return '1 min ago';
    if (diffMinutes < 60) return `${diffMinutes} mins ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours === 1) return '1 hour ago';
    return `${diffHours} hours ago`;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Start auto-refresh
function startAutoRefresh() {
    refreshInterval = setInterval(() => {
        loadDashboardData();
    }, CONFIG.REFRESH_INTERVAL);
}

// Stop auto-refresh
function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// Initialize app
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Cleanup
window.addEventListener('beforeunload', stopAutoRefresh);
