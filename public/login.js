const form = document.getElementById("loginForm");
const password = document.getElementById("password");
const errorEl = document.getElementById("loginError");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password.value }),
    });
    if (res.ok) {
      window.location.href = "/";
    } else {
      const info = await res.json().catch(() => ({}));
      errorEl.textContent = info.error || "Sign in failed.";
      password.value = "";
      password.focus();
    }
  } catch {
    errorEl.textContent = "Could not reach the server.";
  }
});
