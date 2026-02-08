// ==================================================================
// BLOOD DONOR FINDER - MAIN LOGIC
// ==================================================================

// --- 1. IMPORT FIREBASE MODULES ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where } from "https://www.gstatic.com/firebasejs/9.6.10/firebase-firestore.js";

// --- 2. CONFIGURATION ---

// ⚠️ SECURITY SETTING:
// Set to 'true' ONLY if you want to force Admin mode for testing without a database.
// Set to 'false' for the real app (so normal users cannot add data).
const MANUAL_ADMIN_OVERRIDE = false; 

// 🔑 PASTE YOUR FIREBASE CONFIG KEYS HERE 👇
const firebaseConfig = {
    apiKey: "AIzaSyAlK1bE2ay4UlOvfNqHTIWnWPKZzwHZrxc",
    authDomain: "blooddonorfinder-db146.firebaseapp.com",
    projectId: "blooddonorfinder-db146",
    storageBucket: "blooddonorfinder-db146.firebasestorage.app",
    messagingSenderId: "560945836174",
    appId: "1:560945836174:web:5dabd309293acc8b3b19df",
    measurementId: "G-0YRY45W7W8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global Variables
let currentUserRole = 'user'; // Default role is 'user' (Guest)
let allDonors = [];           // Stores the list of donors locally for fast searching

// ==================================================================
// 3. AUTHENTICATION LOGIC
// ==================================================================

// Listen for Login/Logout state changes
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User just logged in
        console.log("✅ User Logged In:", user.email);
        
        // Switch screens
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        
        // 1. Determine who this user is (Admin? Super Admin? User?)
        await fetchUserRole(user.email);
        
        // 2. Load the donor list
        loadDonors();
    } else {
        // User just logged out
        console.log("🔒 User Logged Out");
        
        // Switch screens back to Login
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
    }
});

// Handle Login Form Submit
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const pass = document.getElementById('password').value;
    const errorMsg = document.getElementById('login-error');

    errorMsg.innerText = "Logging in...";

    signInWithEmailAndPassword(auth, email, pass)
        .then(() => {
            errorMsg.innerText = ""; // Success
        })
        .catch((error) => {
            errorMsg.innerText = "Error: " + error.message;
        });
});

// Global Logout Function (attached to window so HTML can use it)
window.logout = () => {
    signOut(auth).then(() => window.location.reload());
};

// ==================================================================
// 4. ROLE MANAGEMENT (STRICT SECURITY)
// ==================================================================

async function fetchUserRole(email) {
    // A. Manual Override Check (For Development/Testing only)
    if (MANUAL_ADMIN_OVERRIDE) {
        console.warn("⚠️ SECURITY WARNING: Manual Admin Override is ON");
        currentUserRole = 'super_admin';
        updateUIForRole();
        return;
    }

    // B. Default Security State: Assume they are a normal user
    currentUserRole = 'user'; 

    try {
        // Query the 'users' collection for a document with this email
        const q = query(collection(db, "users"), where("email", "==", email));
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
            // Found the user in the database!
            const userData = querySnapshot.docs[0].data();
            
            // Set role to whatever is in the database ('admin' or 'super_admin')
            currentUserRole = userData.role; 
            console.log("✅ Role synced from Database:", currentUserRole);
        } else {
            // User logged in but is NOT in the 'users' database
            console.log("ℹ️ User not found in Admin DB. Defaulting to standard Guest.");
        }

    } catch (e) {
        console.error("❌ Database Permission Error:", e);
        // If the database fails or blocks the read, we keep them as 'user' for safety.
    }

    // Update the buttons on the screen
    updateUIForRole();
}

function updateUIForRole() {
    const roleBadge = document.getElementById('user-role-display');
    const addNavBtn = document.getElementById('nav-add-btn');

    // 1. Update the Badge Text (Top Right)
    if(roleBadge) {
        roleBadge.innerText = currentUserRole.toUpperCase();
        roleBadge.className = 'role-badge'; // Reset classes
        
        if(currentUserRole === 'super_admin') roleBadge.classList.add('role-super');
        else if(currentUserRole === 'admin') roleBadge.classList.add('role-admin');
        else roleBadge.style.background = '#eee'; // Grey for users
    }

    // 2. Show/Hide the "Add Donor" Tab button
    if (currentUserRole === 'admin' || currentUserRole === 'super_admin') {
        if(addNavBtn) addNavBtn.classList.remove('hidden');
    } else {
        // Normal users cannot see this button
        if(addNavBtn) addNavBtn.classList.add('hidden');
    }
    
    // 3. Refresh the list (to show/hide Delete buttons on the cards)
    if(allDonors.length > 0) renderDonors(allDonors);
}

// ==================================================================
// 5. DATA MANAGEMENT (CRUD)
// ==================================================================

// READ: Fetch all donors from Firestore
async function loadDonors() {
    const listContainer = document.getElementById('donor-list');
    listContainer.innerHTML = '<div style="text-align:center; margin-top:20px;">Loading list...</div>';

    try {
        const querySnapshot = await getDocs(collection(db, "donors"));
        allDonors = [];
        querySnapshot.forEach((doc) => {
            allDonors.push({ id: doc.id, ...doc.data() });
        });
        renderDonors(allDonors);
    } catch (e) {
        console.error(e);
        listContainer.innerHTML = '<div style="text-align:center; padding:20px; color:red;">Error loading data. Check console.</div>';
    }
}

// RENDER: Draw the list on the screen
function renderDonors(donors) {
    const listContainer = document.getElementById('donor-list');
    listContainer.innerHTML = '';
    
    if (donors.length === 0) {
        listContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">No donors found.</div>';
        return;
    }

    donors.forEach(donor => {
        // PERMISSION CHECK: Only Super Admins see the delete button
        const canDelete = (currentUserRole === 'super_admin');
        
        const div = document.createElement('div');
        div.className = 'donor-card';
        div.innerHTML = `
            <div class="donor-header">
                <div class="blood-group">${donor.group}</div>
                <div style="flex:1">
                    <h4>${donor.name}</h4>
                    <div style="font-size:13px; color:#666; margin-top:2px;">
                        <i class="fa-solid fa-location-dot" style="color:var(--primary)"></i> ${donor.city}
                    </div>
                </div>
                ${canDelete ? `<button onclick="window.deleteDonor('${donor.id}')" class="btn-sm btn-danger" style="height:30px; width:30px; padding:0; display:grid; place-items:center;"><i class="fa-solid fa-trash"></i></button>` : ''}
            </div>
            <div class="action-row">
                <a href="tel:${donor.phone}" class="contact-btn call"><i class="fa-solid fa-phone"></i> Call</a>
                <a href="https://wa.me/${donor.phone}" class="contact-btn chat"><i class="fa-brands fa-whatsapp"></i> Chat</a>
            </div>
        `;
        listContainer.appendChild(div);
    });
}

// CREATE: Add a new donor
document.getElementById('add-donor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Security Check
    if(currentUserRole !== 'admin' && currentUserRole !== 'super_admin') {
        alert("Unauthorized! You do not have permission.");
        return;
    }
    
    const newDonor = {
        name: document.getElementById('d-name').value,
        group: document.getElementById('d-group').value,
        city: document.getElementById('d-city').value,
        phone: document.getElementById('d-phone').value,
        lastDonated: document.getElementById('d-last-donated').value || 'N/A',
        createdAt: new Date().toISOString()
    };

    try {
        await addDoc(collection(db, "donors"), newDonor);
        alert("Donor Added Successfully!");
        document.getElementById('add-donor-form').reset();
        window.switchTab('home'); // Go back to list
        loadDonors(); // Refresh list
    } catch (e) {
        alert("Error adding donor: " + e.message);
    }
});

// DELETE: Remove a donor (Global function)
window.deleteDonor = async (id) => {
    // Security Check
    if(currentUserRole !== 'super_admin') {
        alert("Unauthorized! Only Super Admins can delete.");
        return;
    }
    
    if(confirm("Are you sure you want to delete this donor?")) {
        try {
            await deleteDoc(doc(db, "donors", id));
            loadDonors(); // Refresh list
        } catch(e) {
            alert("Delete failed: " + e.message);
        }
    }
};

// ==================================================================
// 6. UI NAVIGATION & FILTERING
// ==================================================================

// Tab Switching (Home <-> Add)
window.switchTab = (tab) => {
    const homeTab = document.getElementById('home-tab');
    const addTab = document.getElementById('add-tab');
    const navItems = document.querySelectorAll('.nav-item');

    // Hide all
    homeTab.classList.add('hidden');
    addTab.classList.add('hidden');
    navItems.forEach(item => item.classList.remove('active'));
    
    // Show selected
    if(tab === 'home') {
        homeTab.classList.remove('hidden');
        navItems[0].classList.add('active');
    }
    if(tab === 'add') {
        addTab.classList.remove('hidden');
        document.getElementById('nav-add-btn').classList.add('active');
    }
}

// Filtering Logic
let currentGroupFilter = 'All';

window.filterDonors = (group) => {
    currentGroupFilter = group;
    
    // Highlight the active chip
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    event.target.classList.add('active'); // event.target is the chip clicked
    
    applyFilters();
};

// Search Bar Listener
document.getElementById('search-input').addEventListener('input', applyFilters);

function applyFilters() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    
    const filteredList = allDonors.filter(donor => {
        // 1. Check Blood Group (Exact match or 'All')
        const matchesGroup = (currentGroupFilter === 'All') || (donor.group === currentGroupFilter);
        
        // 2. Check City or Name (Partial match)
        // We use || '' to prevent crash if a field is missing in database
        const cityMatch = (donor.city || '').toLowerCase().includes(searchTerm);
        const nameMatch = (donor.name || '').toLowerCase().includes(searchTerm);
        
        return matchesGroup && (cityMatch || nameMatch);
    });

    renderDonors(filteredList);
}
