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
        showPopup("Error signing up: " + error.message, "error");
        return;
    }

    if (data?.user) {
        // Save to private_users
        const { error: upsertError } = await client
            .from("private_users")
            .upsert([{
                id: data.user.id,
                name: signName,
                email: signEmail
            }], { onConflict: "id" });

        if (upsertError) {
            console.error("Private_users error:", upsertError);
            showPopup("Error saving user in private_users: " + upsertError.message, "error");
            return;
        }

        // Create a basic profile in user_profiles
        const { error: profileError } = await client
            .from("user_profiles")
            .insert([{
                user_id: data.user.id,
                full_name: signName,
                user_name: "",
                bio: "",
                profile_image_url: "",
                is_online: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }]);

        if (profileError) {
            console.error("User_profiles error:", profileError);
            showPopup("Error creating profile: " + profileError.message, "error");
            return;
        }
    }

    showPopup("Signup successful! Please check your email to verify your account.", "success");
}

const signUpBtn = document.querySelector('.signUpBtn');
const signUpInputs = document.querySelectorAll('#name, #email, #password');
handleButtonState(signUpInputs, signUpBtn);
signUpInputs.forEach(input => input.addEventListener('input', () => handleButtonState(signUpInputs, signUpBtn)));
signUpBtn?.addEventListener('click', async e => {
    e.preventDefault();
    signUpBtn.innerHTML = '<div class="loader"></div>';
    await signUp();
    signUpBtn.innerHTML = "Sign Up";
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
        showPopup("Login failed: " + error.message, "error");
        return;
    }

    // Check if user has a profile
    const { data: profile, error: profileError } = await client
        .from("user_profiles")
        .select("*")
        .eq("user_id", data.user.id)
        .maybeSingle();

    if (profileError) {
        console.error("Profile check error:", profileError);
        showPopup("Error checking profile: " + profileError.message, "error");
        return;
    }

    if (!profile) {
        const { error: insertProfileError } = await client
            .from("user_profiles")
            .insert([{
                user_id: data.user.id,
                full_name: data.user.user_metadata?.name || "",
                user_name: "",
                bio: "",
                profile_image_url: "",
                is_online: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }]);

        if (insertProfileError) {
            console.error("User_profiles insert error:", insertProfileError);
            showPopup("Error creating profile: " + insertProfileError.message, "error");
            return;
        }

        window.location.href = "setupProfile.html";
        return;
    }

    if (!profile.user_name || profile.user_name.trim() === "") {
        window.location.href = "setupProfile.html";
        return;
    }

    window.location.href = "dashboard.html";
}

const loginBtn = document.querySelector('.signInBtn');
const loginInputs = document.querySelectorAll('#loginEmail, #loginPassword');
handleButtonState(loginInputs, loginBtn);
loginInputs.forEach(input => input.addEventListener('input', () => handleButtonState(loginInputs, loginBtn)));
loginBtn?.addEventListener('click', async e => {
    e.preventDefault();
    loginBtn.innerHTML = '<div class="loader"></div>';
    await login();
    loginBtn.innerHTML = "Login";
});

/* ------------------ GOOGLE AUTH ------------------ */
async function handleGoogleAuth() {
    const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/oauthHandler.html'
        }
    });

    if (error) {
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

    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) {
        showPopup("User not logged in.", "error");
        return;
    }

    // Check if username is already taken
    const { data: existingUserName, error: userNameError } = await client
        .from("user_profiles")
        .select("user_id")
        .eq("user_name", user_name)
        .maybeSingle();

    if (userNameError) {
        console.error("Username check error:", userNameError);
        showPopup("Error checking username: " + userNameError.message, "error");
        return;
    }

    if (existingUserName && existingUserName.user_id !== user.id) {
        showPopup("Username already taken. Please choose another.", "error");
        return;
    }

    // Save to private_users
    const { error: upsertError } = await client
        .from("private_users")
        .upsert([{
            id: user.id,
            name: user.user_metadata?.name || full_name || "",
            email: user.email
        }], { onConflict: "id" });

    if (upsertError) {
        console.error("Private_users error:", upsertError);
        showPopup("Error saving user in private_users: " + upsertError.message, "error");
        return;
    }

    let avatar_url = "";
    if (avatarFile) {
        const fileName = `public/${user.id}-${Date.now()}-${avatarFile.name}`;
        const { error: uploadError } = await client.storage
            .from("avatars")
            .upload(fileName, avatarFile, { cacheControl: '3600', upsert: true });

        if (uploadError) {
            console.error("Avatar upload error:", uploadError);
            showPopup("Error uploading avatar: " + uploadError.message, "error");
            return;
        }

        const { data: urlData } = client.storage.from("avatars").getPublicUrl(fileName);
        avatar_url = urlData.publicUrl;
    }

    // Update or insert profile
    const { data: existingProfile, error: profileCheckError } = await client
        .from("user_profiles")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profileCheckError) {
        console.error("Profile check error:", profileCheckError);
        showPopup("Error checking profile: " + profileCheckError.message, "error");
        return;
    }

    if (existingProfile) {
        const { error: updateError } = await client
            .from("user_profiles")
            .update({
                full_name,
                user_name,
                bio,
                profile_image_url: avatar_url,
                updated_at: new Date().toISOString()
            })
            .eq("user_id", user.id);

        if (updateError) {
            console.error("Profile update error:", updateError);
            showPopup("Error updating profile: " + updateError.message, "error");
            return;
        }
    } else {
        const { error: insertError } = await client
            .from("user_profiles")
            .insert([{
                user_id: user.id,
                full_name,
                user_name,
                bio,
                profile_image_url: avatar_url,
                is_online: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }]);

        if (insertError) {
            console.error("Profile insert error:", insertError);
            showPopup("Error saving profile: " + insertError.message, "error");
            return;
        }
    }

    showPopup("Profile saved successfully!", "success");
    window.location.href = "dashboard.html";
}

setUpBtn?.addEventListener("click", async e => {
    e.preventDefault();
    setUpBtn.innerHTML = '<div class="loader"></div>';
    await setupProfile();
    setUpBtn.innerHTML = "Save Profile";
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