import { client } from "../../supabase.js";

/* ------------------ POPUP ------------------ */
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

/* ------------------ FORM VALIDATION ------------------ */
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
async function checkAuthentication() {
    const { data: { user }, error: userError } = await client.auth.getUser();

    if (userError || !user) {
        if (!window.location.pathname.includes('index.html') &&
            !window.location.pathname.includes('signup.html')) {
            window.location.href = 'index.html';
        }
        return { user: null, profile: null };
    }

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

/* ------------------ CHECK IF USER EXISTS ------------------ */
async function checkUserExists(email) {
    try {
        // Try to sign in with the email to check if user exists
        const { data, error } = await client.auth.signInWithPassword({
            email: email,
            password: 'dummy-password-that-should-fail'
        });

        // If we get an error that says "Invalid login credentials", user doesn't exist
        if (error && error.message === "Invalid login credentials") {
            return false;
        }
        
        // If we get any other error, we can't determine, so assume exists
        if (error) {
            console.error("Error checking user existence:", error);
            return true;
        }
        
        // If we get a user, they exist
        return !!data.user;
    } catch (error) {
        console.error("Error checking user existence:", error);
        return true; // Assume exists to prevent duplicate signups
    }
}

/* ------------------ ENSURE PROFILE EXISTS ------------------ */
async function ensureProfileExists(user) {
    try {
        // Check if profile exists
        const { data: existingProfile, error: checkError } = await client
            .from("user_profiles")
            .select("user_id")
            .eq("user_id", user.id)
            .maybeSingle();

        if (checkError) throw checkError;

        // If profile doesn't exist, create it
        if (!existingProfile) {
            const { error: insertError } = await client
                .from("user_profiles")
                .insert([{
                    user_id: user.id,
                    full_name: user.user_metadata?.name || "",
                    user_name: "",
                    bio: "",
                    profile_image_url: "",
                    is_online: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }]);

            if (insertError) throw insertError;
            
            console.log("Created new profile for user:", user.id);
            return false; // Profile was created
        }
        
        return true; // Profile already existed
    } catch (error) {
        console.error("Error ensuring profile exists:", error);
        return false;
    }
}

/* ------------------ SAVE TO PRIVATE USERS ------------------ */
async function saveToPrivateUsers(userData) {
    try {
        const { error } = await client
            .from("private_users")
            .upsert([userData], { onConflict: "id" });
            
        if (error) {
            // Check if it's a permission error (403)
            if (error.code === '42501') {
                console.warn("Permission denied for private_users table. This is a non-critical error.");
                return { success: false, isPermissionError: true };
            }
            throw error;
        }
        
        return { success: true };
    } catch (error) {
        console.error("Error saving to private_users:", error);
        return { success: false, error: error.message };
    }
}

/* ------------------ SIGN UP ------------------ */
async function signUp() {
    const signName = document.querySelector('#name').value;
    const signEmail = document.querySelector('#email').value;
    const signPassword = document.querySelector('#password').value;

    try {
        // First check if user already exists
        const userExists = await checkUserExists(signEmail);
        if (userExists) {
            showPopup("This email is already registered. Please login instead.", "error");
            return;
        }

        const { data, error } = await client.auth.signUp({
            email: signEmail,
            password: signPassword,
            options: {
                data: { name: signName },
                emailRedirectTo: window.location.origin + '/setupProfile.html',
            }
        });

        if (error) {
            // Handle rate limiting error specifically
            if (error.status === 429 || error.code === 'over_email_send_rate_limit') {
                throw new Error("Too many signup attempts. Please wait a few minutes before trying again.");
            }
            throw error;
        }

        if (data?.user) {
            // Try to save to private_users
            const privateUsersResult = await saveToPrivateUsers({
                id: data.user.id,
                name: signName,
                email: signEmail
            });
            
            if (!privateUsersResult.success && privateUsersResult.isPermissionError) {
                console.warn("Skipping private_users update due to permission error");
            } else if (!privateUsersResult.success) {
                console.warn("Non-critical error saving to private_users:", privateUsersResult.error);
            }

            // Create profile in user_profiles
            const profileCreated = await ensureProfileExists(data.user);
            if (!profileCreated) {
                console.log("Profile created successfully during signup");
            }

            showPopup("Signup successful! Please check your email to verify your account.", "success");
        }
    } catch (error) {
        console.error("Signup error:", error);
        showPopup("Error signing up: " + error.message, "error");
    }
}

const signUpBtn = document.querySelector('.signUpBtn');
const signUpInputs = document.querySelectorAll('#name, #email, #password');
handleButtonState(signUpInputs, signUpBtn);
signUpInputs.forEach(input => input.addEventListener('input', () => handleButtonState(signUpInputs, signUpBtn)));

// Add debounce to prevent rapid successive signup attempts
let signupInProgress = false;
signUpBtn?.addEventListener('click', async e => {
    e.preventDefault();
    
    if (signupInProgress) {
        showPopup("Please wait, signup is in progress.", "info");
        return;
    }
    
    signupInProgress = true;
    signUpBtn.innerHTML = '<div class="loader"></div>';
    signUpBtn.disabled = true;
    
    await signUp();
    
    signUpBtn.innerHTML = "Sign Up";
    signUpBtn.disabled = false;
    signupInProgress = false;
});

/* ------------------ LOGIN ------------------ */
async function login() {
    const loginEmail = document.querySelector('#loginEmail').value;
    const loginPassword = document.querySelector('#loginPassword').value;

    try {
        const { data, error } = await client.auth.signInWithPassword({
            email: loginEmail,
            password: loginPassword,
        });

        if (error) throw error;

        // Ensure profile exists after login
        const profileExists = await ensureProfileExists(data.user);
        
        // Get the updated profile data
        const { data: profile, error: profileError } = await client
            .from("user_profiles")
            .select("*")
            .eq("user_id", data.user.id)
            .maybeSingle();

        if (profileError) throw profileError;

        // Try to save to private_users
        const privateUsersResult = await saveToPrivateUsers({
            id: data.user.id,
            name: data.user.user_metadata?.name || "",
            email: data.user.email
        });
        
        if (!privateUsersResult.success && privateUsersResult.isPermissionError) {
            console.warn("Skipping private_users update due to permission error");
        } else if (!privateUsersResult.success) {
            console.warn("Non-critical error saving to private_users:", privateUsersResult.error);
        }

        if (!profile.user_name || profile.user_name.trim() === "") {
            window.location.href = "setupProfile.html";
            return;
        }

        window.location.href = "dashboard.html";
    } catch (error) {
        console.error("Login error:", error);
        showPopup("Login failed: " + error.message, "error");
    }
}

const loginBtn = document.querySelector('.signInBtn');
const loginInputs = document.querySelectorAll('#loginEmail, #loginPassword');
handleButtonState(loginInputs, loginBtn);
loginInputs.forEach(input => input.addEventListener('input', () => handleButtonState(loginInputs, loginBtn)));

// Add debounce to prevent rapid successive login attempts
let loginInProgress = false;
loginBtn?.addEventListener('click', async e => {
    e.preventDefault();
    
    if (loginInProgress) {
        showPopup("Please wait, login is in progress.", "info");
        return;
    }
    
    loginInProgress = true;
    loginBtn.innerHTML = '<div class="loader"></div>';
    loginBtn.disabled = true;
    
    await login();
    
    loginBtn.innerHTML = "Login";
    loginBtn.disabled = false;
    loginInProgress = false;
});

/* ------------------ GOOGLE AUTH ------------------ */
async function handleGoogleAuth() {
    try {
        const { data, error } = await client.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + '/oauthHandler.html'
            }
        });

        if (error) throw error;
    } catch (error) {
        console.error("Google auth error:", error);
        showPopup("Google authentication failed: " + error.message, "error");
    }
}

document.querySelector('.googleSignUpBtn')?.addEventListener('click', async e => {
    e.preventDefault();
    await handleGoogleAuth();
});

document.querySelector('.googleLoginBtn')?.addEventListener('click', async e => {
    e.preventDefault();
    await handleGoogleAuth();
});

/* ------------------ SETUP PROFILE ------------------ */
const setUpBtn = document.getElementById("setUpBtn");
const avatarInput = document.getElementById("avatar");
const avatarPreview = document.getElementById("avatarPreview");
let avatarFile = null;

const profileSetupInputs = document.querySelectorAll('#name, #username, #bio');
handleButtonState(profileSetupInputs, setUpBtn);
profileSetupInputs.forEach(input => input.addEventListener('input', () => handleButtonState(profileSetupInputs, setUpBtn)));

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

    try {
        const { data: { user }, error: userError } = await client.auth.getUser();
        if (userError || !user) throw new Error("User not logged in.");

        // Check if username is already taken
        const { data: existingUserName, error: userNameError } = await client
            .from("user_profiles")
            .select("user_id")
            .eq("user_name", user_name)
            .neq("user_id", user.id) // Exclude current user
            .maybeSingle();

        if (userNameError) throw userNameError;

        if (existingUserName) {
            throw new Error("Username already taken. Please choose another.");
        }

        // Try to save to private_users
        const privateUsersResult = await saveToPrivateUsers({
            id: user.id,
            name: user.user_metadata?.name || full_name || "",
            email: user.email
        });
        
        if (!privateUsersResult.success && privateUsersResult.isPermissionError) {
            console.warn("Skipping private_users update due to permission error");
        } else if (!privateUsersResult.success) {
            console.warn("Non-critical error saving to private_users:", privateUsersResult.error);
        }

        let avatar_url = "";
        if (avatarFile) {
            const fileName = `public/${user.id}-${Date.now()}-${avatarFile.name}`;
            const { error: uploadError } = await client.storage
                .from("avatars")
                .upload(fileName, avatarFile, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            const { data: urlData } = client.storage.from("avatars").getPublicUrl(fileName);
            avatar_url = urlData.publicUrl;
        }

        // Use upsert to handle both insert and update cases
        const { error: profileError } = await client
            .from("user_profiles")
            .upsert([{
                user_id: user.id,
                full_name,
                user_name,
                bio,
                profile_image_url: avatar_url,
                updated_at: new Date().toISOString()
            }], { onConflict: "user_id" });

        if (profileError) throw profileError;

        showPopup("Profile saved successfully!", "success");
        window.location.href = "dashboard.html";
    } catch (error) {
        console.error("Profile setup error:", error);
        showPopup("Error saving profile: " + error.message, "error");
    }
}

// Add debounce to prevent rapid successive profile setup attempts
let profileSetupInProgress = false;
setUpBtn?.addEventListener("click", async e => {
    e.preventDefault();
    
    if (profileSetupInProgress) {
        showPopup("Please wait, profile setup is in progress.", "info");
        return;
    }
    
    profileSetupInProgress = true;
    setUpBtn.innerHTML = '<div class="loader"></div>';
    setUpBtn.disabled = true;
    
    await setupProfile();
    
    setUpBtn.innerHTML = "Save Profile";
    setUpBtn.disabled = false;
    profileSetupInProgress = false;
});

/* ------------------ PAGE LOAD AUTH CHECK ------------------ */
document.addEventListener('DOMContentLoaded', async () => {
    const isProtectedPage = window.location.pathname.includes('dashboard.html') ||
        window.location.pathname.includes('setupProfile.html');

    if (isProtectedPage) {
        const { user, profile } = await checkAuthentication();
        if (!user) return;

        if (window.location.pathname.includes('dashboard.html') &&
            (!profile || !profile.user_name || profile.user_name.trim() === "")) {
            window.location.href = "setupProfile.html";
        }

        if (window.location.pathname.includes('setupProfile.html') &&
            profile && profile.user_name && profile.user_name.trim() !== "") {
            window.location.href = "dashboard.html";
        }
    }
});