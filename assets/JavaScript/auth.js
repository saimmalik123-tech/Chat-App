import { client } from "../../supabase.js";

// Default avatar URL to prevent NULL constraint violations
const DEFAULT_AVATAR_URL = "https://via.placeholder.com/150";

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

// Function to check if all given input fields are filled
function areInputsFilled(inputs) {
    const inputsArray = Array.isArray(inputs) ? inputs : Array.from(inputs);
    return inputsArray.every(input => input.value.trim() !== '');
}

// Function to handle the button's disabled state based on input
function handleButtonState(inputs, button) {
    if (button) {
        button.disabled = !areInputsFilled(inputs);
    }
}

/* ------------------ SIGN UP ------------------ */
async function signUp() {
    const signName = document.querySelector('#name').value;
    const signEmail = document.querySelector('#email').value;
    const signPassword = document.querySelector('#password').value;

    try {
        const { data, error } = await client.auth.signUp({
            email: signEmail,
            password: signPassword,
            options: {
                data: { name: signName },
                emailRedirectTo: 'http://chatrsaim.netlify.app/setupProfile.html',
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

        window.location.href = 'verify';
    } catch (err) {
        showPopup("An unexpected error occurred during sign up: " + err.message);
    }
}

const signUpBtn = document.querySelector('.signUpBtn');
const signUpInputs = document.querySelectorAll('#name, #email, #password');

// Initially disable the button
handleButtonState(signUpInputs, signUpBtn);

// Add event listeners to input fields to check for changes
signUpInputs.forEach(input => {
    input.addEventListener('input', () => handleButtonState(signUpInputs, signUpBtn));
});

signUpBtn?.addEventListener('click', async e => {
    e.preventDefault();
    signUpBtn.innerHTML = '<div class="loader"></div>';
    await signUp();
});

/* ------------------ CHECK PROFILE & REDIRECT ------------------ */
async function checkProfileAndRedirect() {
    try {
        const { data: { user }, error: userError } = await client.auth.getUser();
        if (userError || !user) {
            showPopup("User not logged in.");
            return;
        }

        const { data: profile, error: profileError } = await client
            .from("user_profiles")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

        if (profileError) {
            showPopup("Error checking profile: " + profileError.message);
            return;
        }

        if (!profile) {
            window.location.href = "setupProfile";
        } else {
            window.location.href = "dashboard";
        }
    } catch (err) {
        showPopup("An unexpected error occurred: " + err.message);
    }
}

/* ------------------ LOGIN ------------------ */
async function login() {
    const loginEmail = document.querySelector('#loginEmail').value;
    const loginPassword = document.querySelector('#loginPassword').value;

    try {
        const { error } = await client.auth.signInWithPassword({
            email: loginEmail,
            password: loginPassword,
        });

        if (error) {
            showPopup("Login failed: " + error.message);
        } else {
            await checkProfileAndRedirect();
        }
    } catch (err) {
        showPopup("An unexpected error occurred during login: " + err.message);
    }
}

const loginBtn = document.querySelector('.signInBtn');
const loginInputs = document.querySelectorAll('#loginEmail, #loginPassword');

// Initially disable the button
handleButtonState(loginInputs, loginBtn);

// Add event listeners to input fields to check for changes
loginInputs.forEach(input => {
    input.addEventListener('input', () => handleButtonState(loginInputs, loginBtn));
});

loginBtn?.addEventListener('click', async e => {
    e.preventDefault();
    loginBtn.innerHTML = '<div class="loader"></div>';
    await login();
});

/* ------------------ GOOGLE SIGN UP / LOGIN ------------------ */
async function handleGoogleAuth(redirectUrl) {
    try {
        await client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: redirectUrl }
        });
    } catch (err) {
        showPopup("Google authentication failed: " + err.message);
    }
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

// New elements for profile setup
const profileSetupInputs = document.querySelectorAll('#name, #username, #bio');

// Initially disable the button
handleButtonState(profileSetupInputs, setUpBtn);

// Add event listeners to input fields to check for changes
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
    try {
        const full_name = document.getElementById("name").value.trim();
        const user_name = document.getElementById("username").value.trim();
        const bio = document.getElementById("bio").value.trim();

        // Validate required fields
        if (!full_name) {
            showPopup("Full name is required", "error");
            return;
        }

        if (!user_name) {
            showPopup("Username is required", "error");
            return;
        }

        // get logged in user
        const { data: { user }, error: userError } = await client.auth.getUser();
        if (userError || !user) {
            showPopup("User not logged in.");
            return;
        }

        // upsert into private_users (optional, you had this in your code)
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

        // handle avatar upload
        let avatar_url = DEFAULT_AVATAR_URL; // Use default avatar as fallback

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

        // Prepare profile data
        const profileData = {
            user_id: user.id,
            full_name,
            user_name,
            bio,
            profile_image_url: avatar_url
        };

        console.log("Inserting profile data:", profileData);

        const { error: insertProfileError } = await client
            .from("user_profiles")
            .insert([profileData]);

        if (insertProfileError) {
            showPopup("Error saving profile: " + insertProfileError.message);
            return;
        }

        showPopup("Profile saved successfully!", "success");
        setTimeout(() => {
            window.location.href = "dashboard";
        }, 1500);
    } catch (err) {
        console.log(err.message);
        
        showPopup("An unexpected error occurred: " + err.message);
    } finally {
        if (setUpBtn) {
            setUpBtn.innerHTML = 'Set Up Profile';
        }
    }
}

setUpBtn?.addEventListener("click", async e => {
    e.preventDefault();
    setUpBtn.innerHTML = '<div class="loader"></div>';
    await setupProfile();
});