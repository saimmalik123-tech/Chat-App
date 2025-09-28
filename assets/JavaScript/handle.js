import { client } from "../../supabase.js";

const loaderContainer = document.querySelector(".loader-container");
const popupElement = document.getElementById("popup");
const popupMessageElement = document.getElementById("popup-message");
const popupCloseButton = document.querySelector(".popup-close");

function showLoader() {
    loaderContainer && (loaderContainer.style.display = "flex");
}
function hideLoader() {
    loaderContainer && (loaderContainer.style.display = "none");
}
function showPopup(message) {
    if (popupMessageElement && popupElement) {
        popupMessageElement.textContent = message;
        popupElement.classList.remove("hidden");
    }
}
function hidePopup() {
    popupElement && popupElement.classList.add("hidden");
}
popupCloseButton?.addEventListener("click", hidePopup);

async function handleGoogleAuth() {
    showLoader();

    try {
        // 1. Check for active session after OAuth redirect
        const { data: { session }, error: sessionError } = await client.auth.getSession();

        if (sessionError || !session) {
            showPopup("No active session. Redirecting to login...");
            setTimeout(() => (window.location.href = "login.html"), 1500);
            return;
        }

        const user = session.user;

        // 2. Ensure user exists in private_users
        const { data: existingUser, error: userCheckError } = await client
            .from("private_users")
            .select("id")
            .eq("id", user.id)
            .maybeSingle();

        if (userCheckError) {
            showPopup("Error checking user: " + userCheckError.message);
            return;
        }

        if (!existingUser) {
            const { error: insertUserError } = await client
                .from("private_users")
                .insert([{
                    id: user.id,
                    name: user.user_metadata?.full_name || user.user_metadata?.name || "",
                    email: user.email
                }]);

            if (insertUserError) {
                showPopup("Error creating user record: " + insertUserError.message);
                return;
            }
        }

        // 3. Ensure profile exists in user_profiles
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
            const { error: insertProfileError } = await client
                .from("user_profiles")
                .insert([{
                    user_id: user.id,
                    full_name: user.user_metadata?.full_name || user.user_metadata?.name || "",
                    user_name: user.user_metadata?.user_name || "",
                    bio: "",
                    profile_image_url: user.user_metadata?.avatar_url || ""
                }]);

            if (insertProfileError) {
                showPopup("Error creating profile: " + insertProfileError.message);
                return;
            }

            // Send them to setup profile page
            window.location.href = "setupProfile.html";
            return;
        }

        // 4. Redirect based on profile existence
        window.location.href = "dashboard.html";

    } catch (err) {
        showPopup("Unexpected error: " + err.message);
        console.error(err);
    } finally {
        hideLoader();
    }


}
document.addEventListener('DOMContentLoaded', handleGoogleAuth);
