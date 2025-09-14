import { client } from "../../supabase.js";

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

    window.location.href = 'verify.html';
}

const signUpBtn = document.querySelector('.signUpBtn');
signUpBtn?.addEventListener('click', async e => {
    e.preventDefault();
    signUpBtn.innerHTML = '<div class="loader"></div>';
    await signUp();
});


/* ------------------ CHECK PROFILE & REDIRECT ------------------ */
async function checkProfileAndRedirect() {
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
loginBtn?.addEventListener('click', async e => {
    e.preventDefault();
    loginBtn.innerHTML = '<div class="loader"></div>';
    await login();
});


/* ------------------ GOOGLE SIGN UP / LOGIN ------------------ */
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

avatarInput?.addEventListener("change", e => {
    avatarFile = e.target.files[0];
    if (avatarFile) {
        const reader = new FileReader();
        reader.onload = event => avatarPreview.src = event.target.result;
        reader.readAsDataURL(avatarFile);
    }
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
