import { client } from "../../supabase.js";

/* ------------------ POPUP HANDLER ------------------ */
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

/* ------------------ COMMON FUNCTIONS ------------------ */
function areInputsFilled(inputs) {
    const inputsArray = Array.isArray(inputs) ? inputs : Array.from(inputs);
    return inputsArray.every(input => input.value.trim() !== '');
}

function handleButtonState(inputs, button) {
    if (button) button.disabled = !areInputsFilled(inputs);
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
            emailRedirectTo: 'http://chatrsaim.netlify.app/setupProfile.html',
        }
    });

    if (error) return showPopup("Error signing up: " + error.message);

    if (data?.user) {
        const { error: upsertError } = await client
            .from("private_users")
            .upsert([{
                id: data.user.id,
                name: signName,
                email: signEmail
            }], { onConflict: "email" });

        if (upsertError) return showPopup("Error saving user in private_users: " + upsertError.message);
    }

    window.location.href = 'verify.html';
}

const signUpBtn = document.querySelector('.signUpBtn');
const signUpInputs = document.querySelectorAll('#name, #email, #password');
handleButtonState(signUpInputs, signUpBtn);
signUpInputs.forEach(input => input.addEventListener('input', () => handleButtonState(signUpInputs, signUpBtn)));
signUpBtn?.addEventListener('click', async e => {
    e.preventDefault();
    signUpBtn.innerHTML = '<div class="loader"></div>';
    await signUp();
});

/* ------------------ CHECK PROFILE & REDIRECT ------------------ */
async function checkProfileAndRedirect() {
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError || !user) return showPopup("User not logged in.");

    const { data: profile, error: profileError } = await client
        .from("user_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

    if (profileError) return showPopup("Error checking profile: " + profileError.message);

    if (!profile) {
        window.location.href = "setupProfile.html";
    } else {
        window.location.href = "dashboard.html";
    }
}

/* ------------------ LOGIN ------------------ */
async function login() {
    const loginEmail = document.querySelector('#loginEmail').value;
    const loginPassword = document.querySelector('#loginPassword').value;

    const { error } = await client.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
    });

    if (error) {
        showPopup("Login failed: " + error.message);
    } else {
        await checkProfileAndRedirect();
    }
}

const loginBtn = document.querySelector('.signInBtn');
const loginInputs = document.querySelectorAll('#loginEmail, #loginPassword');
handleButtonState(loginInputs, loginBtn);
loginInputs.forEach(input => input.addEventListener('input', () => handleButtonState(loginInputs, loginBtn)));
loginBtn?.addEventListener('click', async e => {
    e.preventDefault();
    loginBtn.innerHTML = '<div class="loader"></div>';
    await login();
});

/* ------------------ GOOGLE AUTH ------------------ */
async function handleGoogleAuth(redirectUrl) {
    await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl }
    });
}

const googleSignUpBtn = document.querySelector('.googleSignUpBtn');
googleSignUpBtn?.addEventListener('click', async e => {
    e.preventDefault();
    googleSignUpBtn.innerHTML = '<div class="loader"></div>';
    await handleGoogleAuth('http://chatrsaim.netlify.app/oauthHandler.html');
});

const googleLoginBtn = document.querySelector('.googleLoginBtn');
googleLoginBtn?.addEventListener('click', async e => {
    e.preventDefault();
    googleLoginBtn.innerHTML = '<div class="loader"></div>';
    await handleGoogleAuth('http://chatrsaim.netlify.app/oauthHandler.html');
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
    if (userError || !user) return showPopup("User not logged in.");

    const { error: upsertPrivateError } = await client
        .from("private_users")
        .upsert([{
            id: user.id,
            name: user.user_metadata?.name || full_name || "",
            email: user.email
        }], { onConflict: "email" });

    if (upsertPrivateError) return showPopup("Error saving user in private_users: " + upsertPrivateError.message);

    let avatar_url = null;
    if (avatarFile) {
        const fileName = `public/${user.id}-${Date.now()}-${avatarFile.name}`;
        const { error: uploadError } = await client.storage
            .from("avatars")
            .upload(fileName, avatarFile, { cacheControl: '3600', upsert: true });

        if (uploadError) return showPopup("Error uploading avatar: " + uploadError.message);

        const { data: urlData } = client.storage.from("avatars").getPublicUrl(fileName);
        avatar_url = urlData.publicUrl;
    }

    const { error: upsertProfileError } = await client
        .from("user_profiles")
        .upsert([{
            user_id: user.id,
            full_name,
            user_name,
            bio,
            profile_image_url: avatar_url
        }], { onConflict: "user_id" });

    if (upsertProfileError) return showPopup("Error saving profile: " + upsertProfileError.message);

    showPopup("Profile saved successfully!", "success");
    window.location.href = "dashboard.html";
}

setUpBtn?.addEventListener("click", async e => {
    e.preventDefault();
    setUpBtn.innerHTML = '<div class="loader"></div>';
    await setupProfile();
});
