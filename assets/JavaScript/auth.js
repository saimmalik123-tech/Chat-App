import { client } from "../../supabase.js";

function showPopup(message, type = "info") {
    const popup = document.getElementById("popup");
    const messageEl = document.getElementById("popup-message");
    const closeBtn = document.getElementById("popup-close");

    if (!popup || !messageEl) return;

    messageEl.textContent = message;
    popup.classList.remove("hidden", "error", "success", "info");
    popup.classList.add("show", String(type));

    if (closeBtn) {
        const newClose = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newClose, closeBtn);
        newClose.addEventListener('click', () => {
            popup.classList.add("hidden");
            popup.classList.remove('show');
        });
    }
}

/* ------------------ COMMON FUNCTIONS FOR FORM VALIDATION ------------------ */

function areInputsFilled(inputs) {
    const inputsArray = Array.isArray(inputs) ? inputs : Array.from(inputs);
    return inputsArray.every(input => input.value.trim() !== '');
}

function handleButtonState(inputs, button) {
    if (button) {
        button.disabled = !areInputsFilled(inputs);
    }
}

/* ------------------ AUTHENTICATION CHECK ------------------ */
// This function will be called on page load for protected pages
async function checkAuthentication() {
    const { data: { user }, error: userError } = await client.auth.getUser();
    
    if (userError || !user) {
        // If not authenticated, redirect to login
        if (!window.location.pathname.includes('index.html') && 
            !window.location.pathname.includes('signup.html')) {
            window.location.href = 'index.html';
        }
        return { user: null, profile: null };
    }
    
    // Check if user has a profile
    const { data: profile, error: profileError } = await client
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profileError) {
        console.error("Profile check error:", profileError);
        return { user, profile: null };
    }

    return { user, profile };
}

/* ------------------ SIGN UP ------------------ */
async function signUp() {
    const signName = document.querySelector('#name').value;
    const signEmail = document.querySelector('#email').value;
    const signPassword = document.querySelector('#password').value;

    const { data, error } = await client.auth.signUp({
        email: signEmail,
        password: signPassword,
        options: {
            data: { name: signName },
            emailRedirectTo: window.location.origin + '/setupProfile.html',
        }
    });

    if (error) {
        showPopup("Error signing up: " + error.message);
        return;
    }

    if (data?.user) {
        const { error: upsertError } = await client
            .from("private_users")
            .upsert([{
                id: data.user.id,
                name: signName,
                email: signEmail
            }], { onConflict: "email" });

        if (upsertError) {
            showPopup("Error saving user in private_users: " + upsertError.message);
            return;
        }
    }

    showPopup("Signup successful! Please check your email to verify your account.");
    // Don't redirect immediately - wait for email verification
}

const signUpBtn = document.querySelector('.signUpBtn');
const signUpInputs = document.querySelectorAll('#name, #email, #password');

handleButtonState(signUpInputs, signUpBtn);

signUpInputs.forEach(input => {
    input.addEventListener('input', () => handleButtonState(signUpInputs, signUpBtn));
});

signUpBtn?.addEventListener('click', async e => {
    e.preventDefault();
    signUpBtn.innerHTML = '<div class="loader"></div>';
    await signUp();
});

/* ------------------ LOGIN ------------------ */
async function login() {
    const loginEmail = document.querySelector('#loginEmail').value;
    const loginPassword = document.querySelector('#loginPassword').value;

    const { data, error } = await client.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
    });

    if (error) {
        showPopup("Login failed: " + error.message);
        return;
    }

    // Check if user has a profile
    const { data: profile, error: profileError } = await client
        .from("user_profiles")
        .select("*")
        .eq("user_id", data.user.id)
        .maybeSingle();

    if (profileError) {
        showPopup("Error checking profile: " + profileError.message);
        return;
    }

    // Redirect based on profile existence
    if (profile) {
        window.location.href = "dashboard.html";
    } else {
        window.location.href = "setupProfile.html";
    }
}

const loginBtn = document.querySelector('.signInBtn');
const loginInputs = document.querySelectorAll('#loginEmail, #loginPassword');

handleButtonState(loginInputs, loginBtn);

loginInputs.forEach(input => {
    input.addEventListener('input', () => handleButtonState(loginInputs, loginBtn));
});

loginBtn?.addEventListener('click', async e => {
    e.preventDefault();
    loginBtn.innerHTML = '<div class="loader"></div>';
    await login();
});

/* ------------------ GOOGLE SIGN UP / LOGIN ------------------ */
async function handleGoogleAuth() {
    const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/oauthHandler.html'
        }
    });

    if (error) {
        showPopup("Google authentication failed: " + error.message);
    }
}

const googleSignUpBtn = document.querySelector('.googleSignUpBtn');
googleSignUpBtn?.addEventListener('click', async e => {
    e.preventDefault();
    googleSignUpBtn.innerHTML = '<div class="loader"></div>';
    await handleGoogleAuth();
});

const googleLoginBtn = document.querySelector('.googleLoginBtn');
googleLoginBtn?.addEventListener('click', async e => {
    e.preventDefault();
    googleLoginBtn.innerHTML = '<div class="loader"></div>';
    await handleGoogleAuth();
});

/* ------------------ SETUP PROFILE ------------------ */
const setUpBtn = document.getElementById("setUpBtn");
const avatarInput = document.getElementById("avatar");
const avatarPreview = document.getElementById("avatarPreview");
let avatarFile = null;

const profileSetupInputs = document.querySelectorAll('#name, #username, #bio');

handleButtonState(profileSetupInputs, setUpBtn);

profileSetupInputs.forEach(input => {
    input.addEventListener('input', () => handleButtonState(profileSetupInputs, setUpBtn));
});

avatarInput?.addEventListener("change", e => {
    avatarFile = e.target.files[0];
    if (avatarFile) {
        const reader = new FileReader();
        reader.onload = event => avatarPreview.src = event.target.result;
        reader.readAsDataURL(avatarFile);
    }
    handleButtonState(profileSetupInputs, setUpBtn);
});

async function setupProfile() {
    const full_name = document.getElementById("name").value.trim();
    const user_name = document.getElementById("username").value.trim();
    const bio = document.getElementById("bio").value.trim();

    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) {
        showPopup("User not logged in.");
        return;
    }

    const { error: upsertError } = await client
        .from("private_users")
        .upsert([{
            id: user.id,
            name: user.user_metadata?.name || full_name || "",
            email: user.email
        }], { onConflict: "email" });

    if (upsertError) {
        showPopup("Error saving user in private_users: " + upsertError.message);
        return;
    }

    let avatar_url = null;
    if (avatarFile) {
        const fileName = `public/${user.id}-${Date.now()}-${avatarFile.name}`;
        const { error: uploadError } = await client.storage
            .from("avatars")
            .upload(fileName, avatarFile, { cacheControl: '3600', upsert: true });

        if (uploadError) {
            showPopup("Error uploading avatar: " + uploadError.message);
            return;
        }

        const { data: urlData } = client.storage.from("avatars").getPublicUrl(fileName);
        avatar_url = urlData.publicUrl;
    }

    const { error: insertProfileError } = await client
        .from("user_profiles")
        .insert([{
            user_id: user.id,
            full_name,
            user_name,
            bio,
            profile_image_url: avatar_url
        }]);

    if (insertProfileError) {
        showPopup("Error saving profile: " + insertProfileError.message);
        return;
    }

    showPopup("Profile saved successfully!");
    window.location.href = "dashboard.html";
}

setUpBtn?.addEventListener("click", async e => {
    e.preventDefault();
    setUpBtn.innerHTML = '<div class="loader"></div>';
    await setupProfile();
});

/* ------------------ PAGE LOAD AUTHENTICATION CHECK ------------------ */
document.addEventListener('DOMContentLoaded', async () => {
    // Only run auth check on protected pages
    const isProtectedPage = window.location.pathname.includes('dashboard.html') || 
                          window.location.pathname.includes('setupProfile.html');
    
    if (isProtectedPage) {
        const { user, profile } = await checkAuthentication();
        
        if (!user) return; // Already redirected to login
        
        // If on dashboard but no profile, redirect to setup
        if (window.location.pathname.includes('dashboard.html') && !profile) {
            window.location.href = "setupProfile.html";
        }
        
        // If on setup profile but already has profile, redirect to dashboard
        if (window.location.pathname.includes('setupProfile.html') && profile) {
            window.location.href = "dashboard.html";
        }
    }
});